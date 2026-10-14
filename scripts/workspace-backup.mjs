import {createEncryptedBackup,restoreEncryptedBackup} from '../lib/workspace-backup.mjs';
const args=process.argv.slice(2),action=args[0];
function flag(name) {
 const pos=args.indexOf(name);
 if(pos<0||!args[pos+1]||args[pos+1].startsWith('--'))return null;
 return args[pos+1];
}
const keyFile=flag('--key-file')||
 (process.env.CREDENTIALS_DIRECTORY?process.env.CREDENTIALS_DIRECTORY+'/backup_key':null)||
 process.env.YAAI_BACKUP_KEY_FILE;
if(!keyFile)throw Error('Backup key file required (via OS credential file, not the key value in argv).');
let result;
if(action==='backup'){
 result=await createEncryptedBackup({
  workspaceRoot:flag('--workspace'),outputFile:flag('--out'),keyFile,
 });
}else if(action==='restore'||action==='verify'){
 result=await restoreEncryptedBackup({
  inputFile:flag('--in'),destinationRoot:flag('--destination'),keyFile,
  verifyOnly:action==='verify',
 });
}else{
 throw Error('Usage: npm run vps:backup -- backup --workspace PRIVATE_DIR --out /safe/backup.yaai --key-file KEY_PATH | verify/restore --in FILE --destination NEW_DIR --key-file KEY_PATH');
}
console.log(JSON.stringify(result,null,2));
