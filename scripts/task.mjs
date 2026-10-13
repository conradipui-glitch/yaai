import { createTask, TASK_KINDS } from '../lib/task-registry.mjs';
import { readTaskWithArtifact, listTasksWithArtifacts, linkSavedArtifact } from '../lib/task-results.mjs';

const args=process.argv.slice(2);
const action=args[0];
function flag(name) {
  const direct=args.find(x=>x.startsWith(name+'='));
  if(direct)return direct.slice(name.length+1);
  const index=args.indexOf(name);
  return index<0?undefined:args[index+1];
}
const workspaceRoot=flag('--workspace')||process.env.YAAI_WORKSPACE;
if (!workspaceRoot) {
  throw Error('Specify --workspace /path/to/private/project (or YAAI_WORKSPACE). No engine repo default.');
}
let result;
if (action==='create') {
  result=await createTask({
    workspaceRoot,caseId:flag('--case'),kind:flag('--kind')||'research',
    title:flag('--title'),description:flag('--description')||'',
  });
} else if (action==='list') {
  result=await listTasksWithArtifacts({
    workspaceRoot,caseId:flag('--case'),
    limit:flag('--limit')===undefined?30:Number(flag('--limit')),
  });
} else if (action==='show') {
  result=await readTaskWithArtifact({workspaceRoot,id:flag('--id')});
} else if (action==='link') {
  result=await linkSavedArtifact({
    workspaceRoot,id:flag('--id'),relativeJsonPath:flag('--relative-json'),
  });
} else {
  throw Error('Usage: npm run task -- create --workspace DIR --case CASE --kind '+TASK_KINDS.join('|')+
    ' --title "Work description" | list --workspace DIR [--case CASE] | show --workspace DIR --id TASK_ID | link --workspace DIR --id TASK_ID --relative-json results/CASEPREFIX-file.json');
}
console.log(JSON.stringify(result,null,2));
