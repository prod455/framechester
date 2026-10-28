import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,link,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {selectFramechesterProcesses,prepareDockerFiles,composeArguments,findDocker,dockerChildEnvironment,execute} from './infra.mjs';
import {fileURLToPath} from 'node:url';

test('process selection requires an exact workspace application identity and includes descendants',()=>{
 const root='C:\\work\\framechester';
 const inventory=[
  {id:10,parentId:1,name:'node.exe',commandLine:'node C:\\work\\framechester\\web\\node_modules\\tsx\\dist\\cli.mjs server/index.ts'},
  {id:11,parentId:10,name:'node.exe',commandLine:'node --require C:\\work\\framechester\\web\\node_modules\\tsx\\dist\\preflight.cjs server/index.ts'},
  {id:12,parentId:11,name:'ffmpeg.exe',commandLine:'ffmpeg -i private-file'},
  {id:20,parentId:1,name:'node.exe',commandLine:'node C:\\work\\framechester-other\\web\\node_modules\\tsx\\dist\\cli.mjs server/index.ts'},
  {id:21,parentId:1,name:'node.exe',commandLine:'node --eval "C:\\work\\framechester\\web\\node_modules\\tsx\\dist\\cli.mjs server/index.ts"'},
  {id:22,parentId:1,name:'node.exe',commandLine:'node trusted-worker.js C:\\work\\framechester'},
  {id:23,parentId:1,name:'node.exe',commandLine:'node unrelated-server.js --port=4317'},
  {id:24,parentId:1,name:'node.exe',commandLine:'node unrelated-server.js --template C:\\work\\framechester\\web\\server\\index.ts'},
  {id:25,parentId:1,name:'node.exe',commandLine:'node unrelated-server.js --loader C:\\work\\framechester\\web\\node_modules\\tsx\\dist\\cli.mjs server/index.ts'},
 ];
 assert.deepEqual(selectFramechesterProcesses(root,inventory).map(row=>row.id),[12,11,10]);
 assert.deepEqual(selectFramechesterProcesses(root,inventory,11).map(row=>row.id),[10]);
});

test('POSIX relative entrypoints are scoped by their working directory',()=>{
 const rows=[{id:2,parentId:1,name:'node',commandLine:'node server/index.ts',cwd:'/repo/web'},{id:3,parentId:1,name:'node',commandLine:'node server/index.ts',cwd:'/other/web'}];
 assert.deepEqual(selectFramechesterProcesses('/repo',rows).map(row=>row.id),[2]);
 assert.deepEqual(selectFramechesterProcesses('/Repo',rows).map(row=>row.id),[]);
});

test('Rust process ownership follows the exact built executable even without arguments',()=>{
 const rows=[{id:30,parentId:1,name:'framechester.exe',commandLine:'"C:\\work\\framechester\\target\\debug\\framechester.exe"'},{id:31,parentId:1,name:'framechester.exe',commandLine:'C:\\other\\target\\debug\\framechester.exe doctor'}];
 assert.deepEqual(selectFramechesterProcesses('C:\\work\\framechester',rows).map(row=>row.id),[30]);
});

test('Docker Desktop is discovered after installation without a refreshed PATH',()=>{
 const target='C:/Users/test/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
 const found=findDocker({platform:'win32',env:{LOCALAPPDATA:'C:/Users/test/AppData/Local',ProgramFiles:'C:/Program Files'},exists:path=>path.replaceAll('\\','/')===target});
 assert.equal(found.replaceAll('\\','/'),target);
});

test('Docker Desktop credential helpers receive their executable directory in the child PATH',()=>{
 const env=dockerChildEnvironment('C:/Docker/bin/docker.exe',{Path:'C:/Windows',OTHER:'keep'},'win32');
 assert.equal(env.Path.replaceAll('\\','/'),'C:/Docker/bin;C:/Windows');assert.equal(env.OTHER,'keep');assert.equal(env.PATH,undefined);
});

test('Windows PowerShell handles a multi-PID JSON selection without a nested array and never stops test PIDs',{skip:process.platform!=='win32'},async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'fc-infra-ps-'));const root=fileURLToPath(new URL('..',import.meta.url));
 try{
  const file=join(temporary,'inventory.json');await writeFile(file,JSON.stringify([{id:2147483000,parentId:1,name:'node.exe',commandLine:`node "${join(root,'web/node_modules/tsx/dist/cli.mjs')}" server/index.ts`},{id:2147483001,parentId:2147483000,name:'ffmpeg.exe',commandLine:'ffmpeg synthetic'}]));
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name.toLowerCase()!=='psmodulepath'));
  const output=await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'scripts/stop-framechester.ps1'),'-Workspace',root,'-InventoryFile',file],{env,capture:true,timeoutMs:15000});
  assert.deepEqual(JSON.parse(output),[2147483001,2147483000]);
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('prepare creates a private persistent key outside the repo and writes only its path to compose env',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'fc-infra-'));const root=join(temporary,'repo'),home=join(temporary,'home');
 try{
  await mkdir(root);const prepared=await prepareDockerFiles({root,home,platform:'linux'});
  const key=await readFile(prepared.keyFile,'utf8');assert.match(key,/^[a-f0-9]{64}\n$/);assert.equal(prepared.keyFile.startsWith(root),false);
  const env=await readFile(prepared.envFile,'utf8');assert.ok(env.includes('FRAMECHESTER_DOCKER_VAULT_KEY_FILE='));assert.equal(env.includes(key.trim()),false);
  assert.equal(await readFile((await prepareDockerFiles({root,home,platform:'linux'})).keyFile,'utf8'),key);
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('prepare refuses custom missing keys, malformed and hard-linked keys without overwriting',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'fc-infra-invalid-'));const root=join(temporary,'repo'),home=join(temporary,'home'),keyFile=join(temporary,'custom.key');
 try{
  await mkdir(root);
  await assert.rejects(prepareDockerFiles({root,home,keyFile,platform:'linux'}),/chave|key/i);
  await writeFile(keyFile,'invalid');await assert.rejects(prepareDockerFiles({root,home,keyFile,platform:'linux'}),/chave|key/i);assert.equal(await readFile(keyFile,'utf8'),'invalid');
  await writeFile(keyFile,'a'.repeat(64));await link(keyFile,join(temporary,'alias.key'));await assert.rejects(prepareDockerFiles({root,home,keyFile,platform:'linux'}),/chave|key/i);
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('default key protection is retried even when a previous attempt left the key on disk',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'fc-infra-acl-retry-'));const root=join(temporary,'repo'),home=join(temporary,'home');let protections=0;
 try{
  await mkdir(root);
  await assert.rejects(prepareDockerFiles({root,home,platform:'win32',protect:async()=>{throw new Error('Synthetic ACL failure');}}),/ACL/);
  await prepareDockerFiles({root,home,platform:'win32',protect:async()=>{protections++;}});
  assert.equal(protections,2);
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('Windows creates and reprotects a synthetic default key using a real private ACL',{skip:process.platform!=='win32'},async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'fc-infra-windows-acl-'));const root=join(temporary,'repo'),home=join(temporary,'home');
 try{await mkdir(root);await prepareDockerFiles({root,home});await prepareDockerFiles({root,home});}
 finally{await rm(temporary,{recursive:true,force:true});}
});

test('prepare refuses linked workspace private directory',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'fc-infra-links-'));const root=join(temporary,'repo'),home=join(temporary,'home'),outside=join(temporary,'outside');
 try{
  await mkdir(root);await mkdir(outside);await symlink(outside,join(root,'.framechester'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(prepareDockerFiles({root,home,platform:'linux'}),/diretório|vínculo|armazenamento/i);
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('compose commands are project scoped and never remove volumes or prune resources',()=>{
 const args=composeArguments('/repo','down','/repo/.framechester/docker/compose.env');
 assert.deepEqual(args,['compose','--project-name','framechester','--project-directory','/repo','--env-file','/repo/.framechester/docker/compose.env','-f',join('/repo','compose.yaml'),'down']);
 assert.ok(!args.some(value=>['-v','--volumes','prune'].includes(value)));
});
