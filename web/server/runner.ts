import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, copyFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import type { AppState, RunnerApi, Script, StartJobInput, UploadAssetInput, WebAsset, WebJob, WebConfig, QaStatus } from '../shared/types.ts';

interface StoredAsset extends WebAsset { diskName: string }
interface EngineResult { exitCode: number; stdout: string; stderr: string }
export class RunnerError extends Error { constructor(message: string, readonly status: 400 | 503 = 400) { super(message); this.name='RunnerError'; } }
export interface RunnerOptions { home: string; repositoryRoot: string; readState: () => Promise<AppState>; binary?: string; timeoutMs?: number; execute?: (args: string[], cwd: string, signal: AbortSignal) => Promise<EngineResult> }
export function localEngineEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([name])=>!/(TOKEN|SECRET|PASSWORD|API_KEY|ANTHROPIC|OPENAI|YOUTUBE|RESTIC|^B2_|^AWS_|^FRAMECHESTER_)/i.test(name)));
}
const FILES: Record<string, [string, string]> = {video:['render/final.mp4','video/mp4'],thumbnail:['render/thumbnail.png','image/png'],report:['report.html','text/html; charset=utf-8'],metadata:['publish/metadata.json','application/json'],sources:['publish/sources.md','text/markdown; charset=utf-8'],description:['publish/description.txt','text/plain; charset=utf-8'],subtitles:['publish/final.srt','text/plain; charset=utf-8']};
const id = (value: string) => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value)) throw new RunnerError('Identificador inválido.');
  return value;
};
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
async function load<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path,'utf8')) as T; }
  catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return fallback; throw new RunnerError('Índice local de produção inválido.'); }
}
function qa(checks: unknown): QaStatus {
  if(!Array.isArray(checks) || !checks.length) return 'skipped';
  const statuses=checks.map(check => check && typeof check==='object' ? (check as {status?:unknown}).status : undefined);
  if(statuses.includes('fail')) return 'fail';
  if(statuses.some(status=>!['pass','fail','needs_human','skipped'].includes(String(status)))) return 'skipped';
  if(statuses.includes('needs_human')) return 'needs_human';
  return statuses.some(value=>value==='pass') ? 'pass' : 'skipped';
}
function source(value: Script['sources'][number]) { return {title:value.title,url:value.url,publisher:value.publisher,retrieved_at:value.retrievedAt,license:value.license}; }
function rustConfig(config: WebConfig, channelId: string): string {
  const q = (value: string) => JSON.stringify(value);
  return `[[channels]]\nid = ${q(channelId)}\n[app]\ndry_run = true\ntelemetry = false\n[render]\nwidth = ${config.render.width}\nheight = ${config.render.height}\nfps = ${config.render.fps}\ncrf = ${config.render.crf}\npreset = ${q(config.render.preset)}\nvideo_codec = "libx264"\n[tts]\npiper_path = ${q(config.tts.piperPath)}\nvoice_model = ${q(config.tts.voiceModel)}\nvoice_name = ${q(config.tts.voiceName)}\n[asr]\nenabled = ${config.asr.enabled}\nmodel = ${q(config.asr.model)}\nlanguage = ${q(config.asr.language)}\nmin_coverage = ${config.asr.minCoverage}\n[publish]\nenabled = false\nprivacy = "private"\n`;
}
function checkScript(script: Script) {
  if(!script.crossChecked) throw new RunnerError('Confirme o cruzamento das fontes no roteiro antes de produzir.');
  const urls=new Set(script.sources.map(item=>item.url));
  if(urls.size<2) throw new RunnerError('O roteiro precisa de duas fontes distintas.');
  if(script.scenes.length<1 || script.scenes.length>32 || script.scenes.reduce((sum,item)=>sum+item.narration.length,0)>50_000) throw new RunnerError('Quantidade ou tamanho das cenas inválido.');
  const sceneIds=new Set<number>();
  for(const scene of script.scenes) {
    if(!Number.isSafeInteger(scene.id) || scene.id<0 || sceneIds.has(scene.id) || !scene.narration.trim() || !scene.heading.trim() || !scene.visualBrief.trim() || !Number.isFinite(scene.durationHintSecs) || scene.durationHintSecs<=0) throw new RunnerError('Cena incompleta ou ID duplicado.');
    sceneIds.add(scene.id);
  }
  for(const item of script.sources) {
    const url=new URL(item.url);
    if(url.protocol!=='https:' || url.username || url.password || !item.title.trim() || !item.publisher.trim() || !item.retrievedAt.trim() || !item.license.trim()) throw new RunnerError('Fonte incompleta ou URL insegura.');
  }
  if(!script.claims.length || script.claims.some(claim=>claim.status!=='cited' || !claim.text.trim() || !claim.sourceUrls.length || claim.sourceUrls.some(url=>!urls.has(url)))) throw new RunnerError('Alegações precisam estar citadas nas fontes do roteiro, sem contradições pendentes.');
}

export class LocalRunner implements RunnerApi {
  private jobs: WebJob[]=[];
  private media: StoredAsset[]=[];
  private queue=Promise.resolve();
  private writes=Promise.resolve();
  private stopped=false;
  private active: AbortController | undefined;
  private readonly root: string;
  private readonly binary: string;
  constructor(private readonly options: RunnerOptions) {
    this.root=resolve(options.home,'production');
    this.binary=options.binary ?? join(resolve(options.repositoryRoot),'target','debug',process.platform==='win32'?'framechester.exe':'framechester');
  }
  async initialize() {
    await mkdir(this.root,{recursive:true,mode:0o700});
    this.jobs=await load(join(this.root,'jobs.json'),[]);
    this.media=await load(join(this.root,'assets.json'),[]);
    for(const job of this.jobs) if(job.status==='running' || job.status==='queued') { job.status='blocked'; job.message='Execução interrompida pelo encerramento do servidor. Crie um novo trabalho para retomar.'; }
    await this.persist();
    return this;
  }
  engineStatus() { const available=Boolean(this.options.execute) || existsSync(this.binary); return {available,message:available?'Motor Rust local disponível.':'Construa o motor com npm run engine:build antes de produzir.'}; }
  private async channel(channelId: string) { id(channelId); const state=await this.options.readState(); if(!state.channels.some(channel=>channel.id===channelId)) throw new RunnerError('Canal não cadastrado.'); return state; }
  private async persist() {
    const task=this.writes.then(async()=>{ for(const [name,value] of [['jobs',this.jobs],['assets',this.media]] as const) { const path=join(this.root,`${name}.json`); const temporary=`${path}.${randomUUID()}.tmp`; await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600}); await rename(temporary,path); } });
    this.writes=task.catch(()=>{}); await task;
  }
  async list(channelId: string) { await this.channel(channelId); return structuredClone(this.jobs.filter(item=>item.channelId===channelId)); }
  async assets(channelId: string) { await this.channel(channelId); return this.media.filter(item=>item.channelId===channelId).map(({diskName:_,...asset})=>structuredClone(asset)); }
  async upload(channelId: string, input: UploadAssetInput): Promise<WebAsset> {
    await this.channel(channelId);
    if(typeof input.filename!=='string' || basename(input.filename)!==input.filename || /[\\/\x00-\x1f]/.test(input.filename)) throw new RunnerError('Nome de arquivo inválido.');
    const extension=extname(input.filename).toLowerCase();
    const valid=input.kind==='image' ? ['.png','.jpg','.jpeg','.webp','.bmp'] : input.kind==='video' ? ['.mp4','.mov','.m4v','.mkv','.webm','.avi'] : [];
    if(!valid.includes(extension) || ![input.license,input.provenance,input.restrictions].every(value=>typeof value==='string' && value.trim() && value.length<=2000)) throw new RunnerError('Declare tipo, licença, origem e restrições da mídia.');
    if(typeof input.contentBase64!=='string' || input.contentBase64.length>28_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)) throw new RunnerError('Arquivo muito grande ou conteúdo inválido. Limite: 20 MB.');
    const bytes=Buffer.from(input.contentBase64,'base64');
    if(bytes.length<12 || bytes.length>20*1024*1024) throw new RunnerError('Tamanho de mídia inválido.');
    const header=bytes.subarray(0,12);
    const png=extension==='.png' && header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg=['.jpg','.jpeg'].includes(extension) && header[0]===255 && header[1]===216;
    const webp=extension==='.webp' && header.subarray(0,4).toString()==='RIFF' && header.subarray(8,12).toString()==='WEBP';
    const bmp=extension==='.bmp' && header.subarray(0,2).toString()==='BM';
    const mp4=['.mp4','.mov','.m4v'].includes(extension) && header.subarray(4,8).toString()==='ftyp';
    const mkv=['.mkv','.webm'].includes(extension) && header.subarray(0,4).equals(Buffer.from([26,69,223,163]));
    const avi=extension==='.avi' && header.subarray(0,4).toString()==='RIFF' && header.subarray(8,12).toString()==='AVI ';
    if(!(png||jpg||webp||bmp||mp4||mkv||avi)) throw new RunnerError('O conteúdo do arquivo não corresponde ao formato declarado.');
    const asset: StoredAsset={id:randomUUID(),channelId,name:input.filename,kind:input.kind,bytes:bytes.length,checksum:hash(bytes),license:input.license.trim(),provenance:input.provenance.trim(),restrictions:input.restrictions.trim(),createdAt:new Date().toISOString(),diskName:''};
    asset.diskName=`${asset.id}${extension}`;
    const directory=join(this.root,'media',channelId); await mkdir(directory,{recursive:true,mode:0o700});
    await writeFile(join(directory,asset.diskName),bytes,{flag:'wx',mode:0o600});
    this.media.push(asset); await this.persist();
    const {diskName:_,...publicAsset}=asset; return structuredClone(publicAsset);
  }
  async start(channelId: string,input: StartJobInput): Promise<WebJob> {
    const state=await this.channel(channelId);
    if(this.stopped) throw new RunnerError('Servidor encerrando.');
    if(!this.engineStatus().available) throw new RunnerError(this.engineStatus().message,503);
    const script=state.scripts.find(item=>item.id===input.scriptId && item.channelId===channelId);
    if(!script || script.status==='archived') throw new RunnerError('Roteiro não encontrado neste canal.');
    checkScript(script);
    if(!input.assetIds || Object.keys(input.assetIds).length!==script.scenes.length) throw new RunnerError('Selecione uma mídia deste canal para cada cena.');
    const assets=script.scenes.map(scene=>this.media.find(asset=>asset.id===input.assetIds[String(scene.id)] && asset.channelId===channelId));
    if(assets.some(asset=>!asset)) throw new RunnerError('Mídia ausente ou pertencente a outro canal.');
    const config=structuredClone(Object.hasOwn(state.channelConfigs,channelId) ? state.channelConfigs[channelId] : state.config);
    if(!config.tts.voiceModel.trim()) throw new RunnerError('Configure um modelo de voz local em Configurações antes de produzir. Escolha uma voz com licença compatível com o uso pretendido, incluindo monetização.');
    const job: WebJob={id:randomUUID(),channelId,scriptId:script.id,status:'queued',createdAt:new Date().toISOString(),message:'Aguardando o motor local.',videoAvailable:false};
    this.jobs.unshift(job); await this.persist();
    const work=()=>this.run(job,structuredClone(script),config,assets as StoredAsset[],input);
    this.queue=this.queue.then(work,work);
    return structuredClone(job);
  }
  private async run(job: WebJob,script: Script,config: WebConfig,assets: StoredAsset[],input: StartJobInput) {
    if(this.stopped) return;
    const directory=join(this.root,'jobs',id(job.channelId),id(job.id));
    this.active=new AbortController();
    const timer=setTimeout(()=>this.active?.abort(),this.options.timeoutMs ?? 30*60*1000);
    try {
      job.status='running'; job.startedAt=new Date().toISOString(); job.message='Produzindo localmente com QA e publicação em simulação.'; await this.persist();
      await mkdir(join(directory,'assets'),{recursive:true,mode:0o700});
      const manifest=[];
      for(let index=0;index<assets.length;index++) {
        const asset=assets[index];
        const original=join(this.root,'media',job.channelId,asset.diskName);
        const contents=await readFile(original); if(hash(contents)!==asset.checksum) throw new RunnerError('A integridade de uma mídia mudou; produção bloqueada.');
        await copyFile(original,join(directory,'assets',asset.diskName));
        manifest.push({scene_id:script.scenes[index].id,kind:asset.kind,path:asset.diskName,license:asset.license,provenance:asset.provenance,checksum:asset.checksum,restrictions:asset.restrictions});
      }
      const claims=script.claims.map(item=>({text:item.text,status:item.status,source_urls:item.sourceUrls}));
      const sources=script.sources.map(source);
      const topic={id:script.topicId,title:script.title,series:script.series,angle:script.hook,sources,claims,metrics:{acceleration:0,demand:0,alignment:0,originality:0,visual_feasibility:0,timing:0,cross_check:script.crossChecked?1:0}};
      const authored={topic_id:script.topicId,script:{title:script.title,hook:script.hook,series:script.series,format:script.format,scenes:script.scenes.map(scene=>({id:scene.id,heading:scene.heading,narration:scene.narration,visual_brief:scene.visualBrief,duration_hint_secs:scene.durationHintSecs})),sources,claims}};
      await Promise.all([writeFile(join(directory,'topic.json'),JSON.stringify(topic),{mode:0o600}),writeFile(join(directory,'script.json'),JSON.stringify(authored),{mode:0o600}),writeFile(join(directory,'assets','manifest.json'),JSON.stringify(manifest),{mode:0o600}),writeFile(join(directory,'config.toml'),rustConfig(config,job.channelId),{mode:0o600})]);
      const args=['--config',join(directory,'config.toml'),'run','--channel',job.channelId,'--topic',join(directory,'topic.json'),'--script',join(directory,'script.json'),'--assets',join(directory,'assets','manifest.json'),'--workdir',join(directory,'output'),'--max-scenes',String(script.scenes.length),'--format',script.format,'--privacy','private','--json'];
      if(input.burnSubtitles!==false) args.push('--burn-subtitles');
      if(input.asr ?? config.asr.enabled) args.push('--asr');
      const result=await (this.options.execute ?? this.execute.bind(this))(args,resolve(this.options.repositoryRoot),this.active.signal);
      const output=join(directory,'output','channels',job.channelId);
      if(!existsSync(join(output,'pipeline_report.json'))) {
        const detail=result.stderr.replaceAll(this.options.home,'[dados locais]').replace(/(token|secret|password|api[_-]?key)\s*[=:]\s*\S+/gi,'$1=[redigido]').trim().slice(0,400);
        throw new RunnerError(`O motor não concluiu a entrada${detail ? ': '+detail : '. Confira o diagnóstico e a configuração local.'}`);
      }
      const report=JSON.parse(await readFile(join(output,'pipeline_report.json'),'utf8'));
      job.qa={technical:qa(report.technical_qa?.checks),editorial:qa(report.editorial_qa?.checks)};
      const video=await stat(join(output,'render','final.mp4')).catch(()=>undefined);
      job.videoAvailable=Boolean(video?.isFile() && video.size>0);
      if(result.exitCode!==0 || report.stage==='blocked' || job.qa.technical==='fail' || job.qa.editorial==='fail') { job.status='blocked'; job.message='O motor bloqueou a entrega. Confira o relatório de QA.'; }
      else if(!job.videoAvailable || job.qa.technical==='skipped' || job.qa.editorial==='skipped') { job.status='blocked'; job.message='Entrega incompleta: confira o arquivo de vídeo e os relatórios de QA antes de criar um novo trabalho.'; }
      else { job.status='needs_review'; job.message='Vídeo produzido. Revisão editorial e autorização de publicação continuam pendentes.'; }
    } catch(error) { job.status='failed'; job.message=error instanceof Error ? error.message.slice(0,600) : 'Falha na produção local.'; }
    finally { clearTimeout(timer); this.active=undefined; job.finishedAt=new Date().toISOString(); await this.persist(); }
  }
  private execute(args: string[],cwd: string,signal: AbortSignal): Promise<EngineResult> {
    return new Promise((accept,reject)=>{
      const child=spawn(this.binary,args,{cwd,env:localEngineEnvironment(process.env),shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='',settled=false;
      const stop=()=>{ if(child.pid && process.platform==='win32') { const kill=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'}); kill.on('error',()=>child.kill()); } else if(child.pid) { try {process.kill(-child.pid,'SIGKILL');} catch{child.kill();} } };
      const abort=()=>{ stop(); if(!settled) {settled=true;reject(new RunnerError('Produção interrompida pelo limite de tempo ou encerramento.'));} };
      signal.addEventListener('abort',abort,{once:true});
      const capture=(kind:'stdout'|'stderr',bytes:Buffer)=>{ if(kind==='stdout') stdout+=bytes.toString(); else stderr+=bytes.toString(); if(stdout.length+stderr.length>8*1024*1024) abort(); };
      child.stdout.on('data',(bytes:Buffer)=>capture('stdout',bytes)); child.stderr.on('data',(bytes:Buffer)=>capture('stderr',bytes));
      child.on('error',()=>{ signal.removeEventListener('abort',abort); if(!settled) { settled=true;reject(new RunnerError('Não foi possível iniciar o motor Rust local.')); } });
      child.on('close',exitCode=>{ signal.removeEventListener('abort',abort); if(!settled) { settled=true;accept({exitCode:exitCode??1,stdout,stderr}); } });
      if(signal.aborted) abort();
    });
  }
  async file(channelId: string,jobId: string,file: string) {
    await this.channel(channelId); id(jobId);
    if(!FILES[file] || !this.jobs.some(job=>job.channelId===channelId && job.id===jobId)) return undefined;
    const root=join(this.root,'jobs',channelId,jobId,'output','channels',channelId);
    try { const path=await realpath(join(root,FILES[file][0])); const base=await realpath(root); const rel=relative(base,path); if(rel.startsWith(`..${sep}`) || rel==='..' || resolve(base,rel)!==path || !(await stat(path)).isFile()) return undefined; return {path,contentType:FILES[file][1]}; }
    catch { return undefined; }
  }
  async idle() { await this.queue; await this.writes; }
  async close() { this.stopped=true; this.active?.abort(); await this.idle(); }
}
export async function createRunner(options: RunnerOptions) { return new LocalRunner(options).initialize(); }
