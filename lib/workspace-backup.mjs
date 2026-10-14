import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

const MAX_TOTAL=24*1024*1024,MAX_FILE=8*1024*1024;
const ALLOWED=Object.freeze(['cases','presets','planners','results','snapshots','inputs','tasks']);
const LABEL='YA AI encrypted workspace backup v1';
const fail=msg=>{throw Error('YA AI backup: '+msg);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=async p=>{try{return await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const inside=(dir,p)=>p===dir||p.startsWith(dir+path.sep);
async function safeDir(file){
 const dir=path.resolve(file),root=path.parse(dir).root;
 let curr=root;
 for(const part of dir.slice(root.length).split(path.sep).filter(Boolean)){
   curr=path.join(curr,part);
   const stat=await fs.lstat(curr);
   if(stat.isSymbolicLink()||!stat.isDirectory())fail('unsafe or symlinked directory');
 }
 return dir;
}
export async function readBackupKey(filename){
 if(typeof filename!=='string'||!filename.trim())fail('explicit backup key file required');
 const p=path.resolve(filename);
 const stat=await fs.lstat(p);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128)fail('unsafe key file');
 if(process.platform!=='win32'&&(stat.mode&0o077)!==0)fail('backup key file must be owner-only');
 const value=(await fs.readFile(p,'utf8')).trim();
 if(!/^[a-f0-9]{64}$/i.test(value))fail('backup key must contain 64 hex chars (32 random bytes)');
 return Buffer.from(value,'hex');
}
function checkRelative(name){
 if(typeof name!=='string'||name.length>400||name.includes('\\')||name.includes('\0')||
    name.startsWith('/')||name.includes('//'))fail('unsafe backup file path');
 const parts=name.split('/');
 if(parts.length<2||!ALLOWED.includes(parts[0])||parts.some(x=>x===''||x==='.'||x==='..'||x.startsWith('.'))){
   fail('backup file outside permitted workspace subdirectories');
 }
 return parts;
}
async function gather(root){
 const records=[];let total=0;
 async function walk(rel){
   const absolute=path.join(root,...rel.split('/'));
   const stat=await fs.lstat(absolute);
   if(stat.isSymbolicLink())fail('symbolic links cannot be backed up');
   if(stat.isDirectory()){
     for(const name of (await fs.readdir(absolute)).sort()){
       if(name==='.'||name==='..'||name.startsWith('.'))fail('hidden/temp workspace content requires manual cleanup');
       await walk(rel+'/'+name);
     }
     return;
   }
   if(!stat.isFile()||stat.nlink!==1||stat.size>MAX_FILE)fail('unsafe, hardlinked or oversized backup file');
   const bytes=await fs.readFile(absolute);
   total+=bytes.length;
   if(total>MAX_TOTAL)fail('workspace exceeds first-stage backup limit (24 MiB)');
   const normalized=checkRelative(rel).join('/');
   records.push({path:normalized,sha256:sha(bytes),bytes:bytes.toString('base64')});
 }
 for(const folder of ALLOWED){
   const full=path.join(root,folder),st=await exists(full);
   if(st)await walk(folder);
 }
 if(!records.length)fail('no allowed workspace files to archive');
 return records;
}
function verifyManifest(document){
 if(document?.format!==LABEL||!Array.isArray(document.files)||
    !document.files.length||document.files.length>2000)fail('invalid backup manifest');
 const paths=new Set();let size=0;
 return document.files.map(f=>{
   const rel=checkRelative(f?.path).join('/');
   if(paths.has(rel)||typeof f.bytes!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256))fail('invalid duplicate backup entry');
   paths.add(rel);
   const raw=Buffer.from(f.bytes,'base64');
   if(raw.length>MAX_FILE||sha(raw)!==f.sha256||raw.toString('base64')!==f.bytes)
     fail('backup entry integrity failed');
   size+=raw.length;
   if(size>MAX_TOTAL)fail('backup exceeds 24 MiB limit');
   return {path:rel,raw};
 });
}
function encrypt(data,key){
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(LABEL));
 const encrypted=Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(data)))),cipher.final()]);
 return {format:LABEL,algorithm:'aes-256-gcm+gzip',
   iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
   ciphertext:encrypted.toString('base64')};
}
function decrypt(envelope,key){
 if(envelope?.format!==LABEL||envelope?.algorithm!=='aes-256-gcm+gzip')
   fail('unknown encrypted backup format');
 const iv=Buffer.from(envelope.iv||'','base64'),tag=Buffer.from(envelope.tag||'','base64');
 if(iv.length!==12||tag.length!==16)fail('invalid backup encryption envelope');
 let plain;
 try {
   const dec=createDecipheriv('aes-256-gcm',key,iv);
   dec.setAAD(Buffer.from(LABEL));dec.setAuthTag(tag);
   plain=Buffer.concat([dec.update(Buffer.from(envelope.ciphertext||'','base64')),dec.final()]);
 }catch{fail('backup authentication failed (wrong key or corrupted file)');}
 // Gzip decompression on untrusted envelopes could expand dramatically.
 // AES-GCM verifies authenticity against a separately held 256-bit key;
 // only a trusted holder can produce valid oversized payloads.
 try {return JSON.parse(gunzipSync(plain,{maxOutputLength:MAX_TOTAL*2}).toString('utf8'));}
 catch {fail('invalid decrypted manifest');}
}
export async function createEncryptedBackup({workspaceRoot,outputFile,keyFile}={}){
 if(!workspaceRoot||!outputFile)fail('workspace and output file are mandatory');
 const root=await safeDir(workspaceRoot);
 const output=path.resolve(outputFile);
 if(inside(root,output))fail('store encrypted backups outside the live workspace');
 await safeDir(path.dirname(output));
 if(await exists(output))fail('backup destination already exists; no overwrite');
 const key=await readBackupKey(keyFile);
 const records=await gather(root);
 const envelope=encrypt({format:LABEL,createdAt:new Date().toISOString(),files:records},key);
 await fs.writeFile(output,JSON.stringify(envelope)+'\n',{flag:'wx',mode:0o600});
 return {saved:output,fileCount:records.length,encrypted:true,
   originalBytes:records.reduce((n,r)=>n+Buffer.from(r.bytes,'base64').length,0),
   note:'All file contents encrypted; keep this backup and its separate key safe.'};
}
export async function restoreEncryptedBackup({inputFile,destinationRoot,keyFile,verifyOnly=false}={}){
 if(!inputFile||!destinationRoot)fail('backup input and private restore destination required');
 const source=path.resolve(inputFile),destination=path.resolve(destinationRoot);
 if(destination===path.parse(destination).root)fail('filesystem root cannot be a restore target');
 await safeDir(path.dirname(source));
 const sourceStat=await fs.lstat(source);
 if(!sourceStat.isFile()||sourceStat.isSymbolicLink()||sourceStat.size>MAX_TOTAL*2)
   fail('unsafe or oversized encrypted backup file');
 const key=await readBackupKey(keyFile);
 const envelope=JSON.parse(await fs.readFile(source,'utf8'));
 const entries=verifyManifest(decrypt(envelope,key));
 const parent=await safeDir(path.dirname(destination));
 if(await exists(destination))fail('restore target must be new and absent; never overwrite live data');
 if(verifyOnly)return {verified:true,encrypted:true,fileCount:entries.length,filesWritten:0};
 const temp=path.join(parent,'.yaai-restore-'+randomBytes(10).toString('hex'));
 await fs.mkdir(temp,{mode:0o700});
 try {
   for(const entry of entries){
     const target=path.join(temp,...entry.path.split('/'));
     await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
     await fs.writeFile(target,entry.raw,{flag:'wx',mode:0o600});
   }
   if(await exists(destination))fail('restore destination appeared during copy');
   await fs.rename(temp,destination);
 }catch(e){await fs.rm(temp,{recursive:true,force:true});throw e;}
 return {restored:destination,encrypted:true,fileCount:entries.length,filesWritten:entries.length,
   note:'Restore completed to a NEW directory; reconnect integrations and check tasks before use.'};
}
