/**
 * Single-run Jev credential input. No file or environment persistence.
 *
 * Raw TTY mode is required: keystrokes are not echoed by the terminal.
 * Refuse pipes/non-TTY input so credentials aren't accidentally placed in
 * command history, scripts, job logs or chat transcripts.
 */
const refuse=message=>{throw Error('YA AI secret input: '+message);};

export async function readHiddenSecret({
  input=process.stdin,output=process.stderr,label='Jev API key',maxLength=8192,
}={}){
  if(!input?.isTTY||typeof input.setRawMode!=='function'||
     !output||typeof output.write!=='function') {
    refuse('interactive terminal required. For Harness/VPS use a protected environment variable instead.');
  }
  if(!Number.isSafeInteger(maxLength)||maxLength<1||maxLength>8192)
    refuse('invalid credential length bound');
  output.write(label+' (hidden input, Enter to confirm; Ctrl+C to cancel): ');
  const wasRaw=Boolean(input.isRaw);
  let secret='';
  try {
    input.setRawMode(true);
    input.resume?.();
    const result=await new Promise((resolve,reject)=>{
      const cleanup=()=>{
        input.removeListener('data',onData);
        input.removeListener('end',onEnd);
        input.removeListener('error',onError);
      };
      function onEnd(){cleanup();reject(Error('secret input ended before confirmation'));}
      function onError(){cleanup();reject(Error('terminal secret input failed'));}
      function onData(data){
        const chars=String(data);
        for(const c of chars){
          if(c==='\u0003'||c==='\u0004'){
            cleanup();reject(Error('credential entry canceled'));return;
          }
          if(c==='\r'||c==='\n'){
            cleanup();
            if(!secret.trim())reject(Error('empty credential refused'));
            else resolve(secret.trim());
            return;
          }
          if(c==='\u007f'||c==='\b'){
            secret=secret.slice(0,-1);
            continue;
          }
          if(c==='\u001b'||c==='\u0000')continue;
          if(c<' '||c==='\u2028'||c==='\u2029')continue;
          if(secret.length+c.length>maxLength){
            cleanup();reject(Error('credential is too long'));return;
          }
          secret+=c;
        }
      }
      input.on('data',onData);
      input.on('end',onEnd);
      input.on('error',onError);
    });
    return result;
  }finally{
    // Do not print the value or even its length.
    secret='';
    input.setRawMode(wasRaw);
    input.pause?.();
    output.write('\n');
  }
}
