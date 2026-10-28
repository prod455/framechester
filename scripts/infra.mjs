import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {chmod,lstat,mkdir,open,readFile,readdir,readlink,realpath,rename,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname,isAbsolute,join,parse,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const normalize=value=>value.replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
const fail=message=>new Error(message);
function windowsShellEnvironment(){return Object.fromEntries(Object.entries(process.env).filter(([name])=>name.toLowerCase()!=='psmodulepath'));}
function words(command){return [...command.matchAll(/"([^"\r\n]*)"|([^\s"]+)/g)].map(match=>match[1]??match[2]);}
function nodeMain(tokens){
 for(let index=1;index<tokens.length;index++){
  const token=tokens[index];
  if(['--eval','-e','--print','-p'].includes(token))return undefined;
  if(['--require','-r','--import','--loader','--conditions','-c'].includes(token)){index++;continue;}
  if(token==='--')return {entry:tokens[index+1],args:tokens.slice(index+2)};
  if(token.startsWith('-'))continue;
  return {entry:token,args:tokens.slice(index+1)};
 }
}

/** Only positive workspace application identities, never a matching port or generic node. */
export function selectFramechesterProcesses(root,inventory,ownPid=process.pid){
 const caseInsensitive=/^[a-z]:[\\/]|^\\\\/i.test(root);
 const scoped=value=>{const normalized=value.replaceAll('\\','/').replace(/\/$/,'');return caseInsensitive?normalized.toLowerCase():normalized;};
 const workspace=scoped(root),seeds=new Set();
 const rows=inventory.filter(row=>Number.isInteger(row.id)&&row.id>1&&row.id!==ownPid);
 for(const row of rows){
  const command=scoped(row.commandLine??''),name=(row.name??'').toLowerCase();
  if(!/^(node(?:\.exe)?|framechester(?:\.exe)?|python(?:3)?(?:\.exe)?)$/.test(name)||/(?:^|\s)(?:--eval|-e)(?:\s|$)/.test(command))continue;
  const tokens=words(command);
  const engine=new RegExp('^'+escape(`${workspace}/target/`)+`(?:debug|release)/framechester(?:\\.exe)?$`).test(tokens[0]);
  if(engine){seeds.add(row.id);continue;}
  const main=nodeMain(tokens);if(!main?.entry)continue;
  const loader=tokens.some(token=>token.startsWith(`${workspace}/web/node_modules/tsx/`)||token.startsWith(`file:///${workspace}/web/node_modules/tsx/`));
  const isTsxCLI=main.entry===`${workspace}/web/node_modules/tsx/dist/cli.mjs`;
  const appEntry=isTsxCLI?(main.args[0]==='watch'?main.args[1]:main.args[0]):main.entry;
  const script=['server/index.ts','scripts/dev.ts'].includes(appEntry);
  const vite=main.entry===`${workspace}/web/node_modules/vite/bin/vite.js`;
  const cwd=scoped(row.cwd??'');
  const relative=script&&(cwd===workspace+'/web'||cwd===workspace);
  const absoluteEntry=[`${workspace}/web/server/index.ts`,`${workspace}/web/scripts/dev.ts`].includes(appEntry);
  const qa=loader&&typeof appEntry==='string'&&new RegExp('^'+escape(`${workspace}/artifacts/`)+`[^\\s"']+/serve\\.mts$`).test(appEntry);
  if((loader&&script)||vite||relative||absoluteEntry||qa)seeds.add(row.id);
 }
 const selected=new Set(seeds),depth=new Map([...seeds].map(id=>[id,0]));
 for(let changed=true;changed;){changed=false;for(const row of rows)if(!selected.has(row.id)&&selected.has(row.parentId)){selected.add(row.id);depth.set(row.id,(depth.get(row.parentId)??0)+1);changed=true;}}
 return rows.filter(row=>selected.has(row.id)).sort((a,b)=>(depth.get(b.id)??0)-(depth.get(a.id)??0)||b.id-a.id);
}
function escape(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

export function findDocker({platform=process.platform,env=process.env,exists=existsSync}={}){
 if(env.FRAMECHESTER_DOCKER_EXECUTABLE){const selected=resolve(env.FRAMECHESTER_DOCKER_EXECUTABLE);if(!exists(selected))throw fail('O executável Docker configurado não existe.');return selected;}
 if(platform==='win32'){
  const candidates=[env.LOCALAPPDATA&&join(env.LOCALAPPDATA,'Programs','DockerDesktop','resources','bin','docker.exe'),env.ProgramFiles&&join(env.ProgramFiles,'Docker','Docker','resources','bin','docker.exe')];
  for(const candidate of candidates)if(candidate&&exists(candidate))return candidate;
 }
 return 'docker';
}
export function dockerChildEnvironment(docker,env=process.env,platform=process.platform){
 const next={...env};
 if(platform==='win32'&&(/^[a-z]:[\\/]|^\\\\/i.test(docker)||isAbsolute(docker))){const pathName=Object.keys(next).find(name=>name.toLowerCase()==='path')??'PATH';next[pathName]=dirname(docker.replaceAll('\\','/'))+';'+(next[pathName]??'');}
 return next;
}
export function execute(command,args,{cwd=repositoryRoot,env=process.env,capture=false,timeoutMs}={}){
 return new Promise((resolvePromise,reject)=>{
  const child=spawn(command,args,{cwd,env,stdio:capture?['ignore','pipe','pipe']:'inherit',shell:false,windowsHide:true});
  const timer=timeoutMs?setTimeout(()=>{child.kill();reject(fail('A ferramenta não respondeu no prazo esperado. Confira se o Docker Desktop/Engine está pronto.'));},timeoutMs):undefined;
  let output='';if(capture){for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{if(output.length<16384)output+=chunk.toString().slice(0,16384-output.length);});}
  child.on('error',()=>{clearTimeout(timer);reject(fail('Não foi possível executar a ferramenta solicitada. Confira a instalação e o PATH.'));});
  child.on('exit',(code,signal)=>{clearTimeout(timer);code===0?resolvePromise(output.trim()):reject(fail(`A ferramenta terminou sem sucesso (${signal??code??'desconhecido'}).`));});
 });
}

async function privateDirectory(path){
 const absolute=resolve(path),ancestors=[];for(let current=absolute;;current=dirname(current)){ancestors.unshift(current);if(current===parse(current).root)break;}
 for(const directory of ancestors){try{const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw fail('O diretório privado contém vínculo inseguro.');}catch(error){if(error.code!=='ENOENT')throw error;await mkdir(directory,{mode:0o700});}}
 if(normalize(await realpath(absolute))!==normalize(absolute))throw fail('O diretório privado contém vínculo inseguro.');
 return absolute;
}
async function safeFile(path,maxBytes){
 const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>maxBytes)throw fail('Arquivo de chave ou armazenamento privado inválido.');
 return info;
}
async function protectWindows(path,directory){
 // Only a path is passed as a structured argument. PowerShell never receives
 // the key contents, dynamically built commands or an evaluated user string.
 const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(repositoryRoot,'scripts','stop-framechester.ps1'),'-ProtectPath',path,...(directory?['-Directory']:[])];
 try{await execute('powershell.exe',args,{capture:true,timeoutMs:15000,env:windowsShellEnvironment()});}catch{throw fail('Não foi possível proteger a chave no Windows.');}
}
export async function prepareDockerFiles({root=repositoryRoot,home=homedir(),keyFile,platform=process.platform,protect=protectWindows}={}){
 const defaultKey=join(home,'.framechester','docker-secrets','framechester.key'),selected=resolve(keyFile??defaultKey);
 if(normalize(selected).startsWith(normalize(root)+'/'))throw fail('Mantenha o arquivo da chave mestre fora do repositório.');
 if(keyFile&&!existsSync(selected))throw fail('O arquivo de chave configurado não existe; ele não foi criado nem substituído.');
 const directory=await privateDirectory(dirname(selected));
 let created=false;
 try{await safeFile(selected,128);}catch(error){if(error.code!=='ENOENT')throw error;const file=await open(selected,'wx',0o600);try{await file.writeFile(randomBytes(32).toString('hex')+'\n');await file.sync();created=true;}finally{await file.close();}}
 if(!/^[a-f0-9]{64}\n?$/.test(await readFile(selected,'utf8')))throw fail('O arquivo de chave deve conter exatamente 32 bytes em hexadecimal.');
 // A previous interrupted preparation may already have created the key. Reapply
 // protection to our default key on every run before allowing Compose to use it.
 if(!keyFile||created){if(platform==='win32'){await protect(directory,true);await protect(selected,false);}else{await chmod(directory,0o700);await chmod(selected,0o600);}}
 const configDirectory=await privateDirectory(join(root,'.framechester','docker'));await privateDirectory(join(root,'models'));
 const envFile=join(configDirectory,'compose.env');
 try{await safeFile(envFile,8192);}catch(error){if(error.code!=='ENOENT')throw error;}
 const text=`# Generated paths only; no API key or master-key contents.\nFRAMECHESTER_DOCKER_VAULT_KEY_FILE='${selected.replaceAll('\\','/').replaceAll("'","\\'")}'\n`;
 if(/[\r\n\0]/.test(selected))throw fail('Caminho de chave inválido.');
 const temporary=envFile+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{const file=await open(temporary,'wx',0o600);try{await file.writeFile(text);await file.sync();}finally{await file.close();}await rename(temporary,envFile);}finally{await rm(temporary,{force:true});}
 return {keyFile:selected,envFile};
}

export function composeArguments(root,action,envFile){
 const prefix=['compose','--project-name','framechester','--project-directory',root,...(envFile?['--env-file',envFile]:[]),'-f',join(root,'compose.yaml')];
 const actions={up:['up','--build','-d','--wait'],down:['down'],logs:['logs','--tail','100','-f'],status:['ps'],config:['config','--quiet']};
 if(!Object.hasOwn(actions,action))throw fail('Comando Docker inválido.');return [...prefix,...actions[action]];
}
async function dockerAction(action){
 const docker=findDocker(),env=dockerChildEnvironment(docker);
 try{await execute(docker,['--version'],{env,capture:true,timeoutMs:10000});await execute(docker,['compose','version'],{env,capture:true,timeoutMs:10000});}catch{throw fail('Docker com Compose não foi encontrado. Instale/inicie o Docker Desktop (Windows) ou Docker Engine + Compose (Linux).');}
 if(action==='doctor'){try{const version=await execute(docker,['info','--format','{{.ServerVersion}}'],{env,capture:true,timeoutMs:15000});console.log(`Docker e Compose disponíveis. Engine: ${/^\d[\w.+-]{0,60}$/.test(version)?version:'acessível'}.`);}catch{throw fail('Docker/Compose instalados, mas o Engine não respondeu. Inicie o Docker Desktop ou o serviço Docker.');}return;}
 let envFile=join(repositoryRoot,'.framechester','docker','compose.env');
 if(action==='up'||action==='prepare'){
  if(action==='up'){try{await execute(docker,['info','--format','{{.ServerVersion}}'],{env,capture:true,timeoutMs:15000});}catch{throw fail('Inicie o Docker Desktop/Engine antes de subir o Framechester.');}}
  ({envFile}=await prepareDockerFiles({keyFile:process.env.FRAMECHESTER_DOCKER_VAULT_KEY_FILE}));
  if(action==='prepare'){console.log('Configuração privada preparada. Suba com npm run docker:up.');return;}
 }else if(!existsSync(envFile)){
  if(!process.env.FRAMECHESTER_DOCKER_VAULT_KEY_FILE){if(action==='down'){console.log('Nenhuma configuração Docker local foi preparada; nada foi removido.');return;}throw fail('Execute npm run docker:prepare antes deste comando.');}
  envFile=undefined;
 }
 await execute(docker,composeArguments(repositoryRoot,action,envFile),{env});
 if(action==='up')console.log(`Framechester: http://127.0.0.1:${process.env.FRAMECHESTER_HTTP_PORT??4317}. Para parar: npm run docker:down.`);
}

async function posixStop(){
 const rows=[];
 for(const entry of await readdir('/proc'))if(/^\d+$/.test(entry)){
  try{const dir='/proc/'+entry,stat=await readFile(join(dir,'stat'),'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');rows.push({id:Number(entry),parentId:Number(fields[1]),name:await readFile(join(dir,'comm'),'utf8').then(value=>value.trim()),commandLine:(await readFile(join(dir,'cmdline'),'utf8')).replaceAll('\0',' '),cwd:await readlink(join(dir,'cwd')),startTime:fields[19]});}catch{/* Exited or inaccessible process. */}
 }
 const selected=selectFramechesterProcesses(repositoryRoot,rows);
 for(const row of selected){try{const stat=await readFile(`/proc/${row.id}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');if(fields[19]!==row.startTime)continue;process.kill(row.id,'SIGTERM');}catch{/* Already stopped or no permission. */}}
 console.log(`${selected.length} processo(s) do Framechester sinalizado(s).`);
}
async function npm(args){const cli=process.env.npm_execpath??join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');if(!existsSync(cli))throw fail('Execute este comando por npm, com Node.js 22.12 ou superior instalado.');await execute(process.execPath,[cli,'--prefix','web',...args]);}
export async function main(action=process.argv[2]){
 if(action==='--select-processes'){let source='';for await(const chunk of process.stdin){source+=chunk;if(source.length>8_000_000)throw fail('Inventário de processos excessivo.');}const input=JSON.parse(source);const processes=Array.isArray(input.processes)?input.processes:input.processes?.value;if(typeof input.root!=='string'||!Array.isArray(processes))throw fail('Inventário de processos inválido.');console.log(JSON.stringify(selectFramechesterProcesses(input.root,processes,input.ownPid).map(row=>row.id)));return;}
 if(action?.startsWith('docker:'))return dockerAction(action.slice(7));
 if(action==='setup'){await npm(['ci']);await npm(['run','engine:build']);await npm(['run','build']);return;}
 if(action==='start')return npm(['start']);if(action==='dev')return npm(['run','dev']);
 if(action==='stop'){
  if(process.platform==='win32')await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(repositoryRoot,'scripts','stop-framechester.ps1'),'-Workspace',repositoryRoot],{env:windowsShellEnvironment()});else await posixStop();
  if(existsSync(join(repositoryRoot,'.framechester','docker','compose.env')))await dockerAction('down');
  return;
 }
 throw fail('Use npm run setup, npm start, npm run dev, npm stop ou npm run docker:up/down/status/logs/doctor.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error instanceof Error?error.message:'Não foi possível concluir.');process.exitCode=1;});
