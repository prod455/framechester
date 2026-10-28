import { spawn } from 'node:child_process';
import { commercialVoiceError } from '../shared/voices.ts';
import {HttpError} from './auth.ts';
import {SceneLayoutError,parseSceneLayout} from '../shared/scene-layouts.ts';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync,statSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, copyFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep,delimiter,isAbsolute } from 'node:path';
import type { AppState, RunnerApi, Script, StartJobInput, UploadAssetInput, WebAsset, WebJob, WebConfig, QaStatus, PreparedVisuals } from '../shared/types.ts';

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
function isFile(path:string|undefined):boolean {try{return !!path&&statSync(path).isFile();}catch{return false;}}
/** Operator paths are relative to the repository, just like the engine's cwd. */
function productionConfig(config:WebConfig,repositoryRoot:string):WebConfig {
  const snapshot=structuredClone(config),tts=snapshot.tts;
  if(tts.voiceModel)tts.voiceModel=resolve(repositoryRoot,tts.voiceModel);
  if(tts.voiceStyles)tts.voiceStyles=resolve(repositoryRoot,tts.voiceStyles);
  if(tts.pythonPath){
    if(isAbsolute(tts.pythonPath)||/[\\/]/.test(tts.pythonPath))tts.pythonPath=resolve(repositoryRoot,tts.pythonPath);
    else {
      const names=process.platform==='win32'&&!extname(tts.pythonPath)?[tts.pythonPath,`${tts.pythonPath}.exe`]:[tts.pythonPath];
      const locations=[repositoryRoot,...(process.env.PATH??'').split(delimiter).filter(Boolean)];
      const installed=locations.flatMap(directory=>names.map(name=>resolve(directory,name))).find(isFile);
      tts.pythonPath=installed??resolve(repositoryRoot,tts.pythonPath);
    }
  }
  return snapshot;
}
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
function visualFingerprint(state:AppState,channelId:string,script:Script):string {
  return hash(Buffer.from(JSON.stringify({renderer:'framechester-editorial-v2',previewRevision:2,channelId,channel:state.channels.find(channel=>channel.id===channelId)?.name,script:{id:script.id,title:script.title,format:script.format,scenes:script.scenes,sources:script.sources}})));
}
function rustConfig(config: WebConfig, channelId: string): string {
  const q = (value: string) => JSON.stringify(value);
  return `[[channels]]\nid = ${q(channelId)}\n[app]\ndry_run = true\ntelemetry = false\n[render]\nwidth = ${config.render.width}\nheight = ${config.render.height}\nfps = ${config.render.fps}\ncrf = ${config.render.crf}\npreset = ${q(config.render.preset)}\nvideo_codec = "libx264"\n[tts]\nengine = "kokoro"\npython_path = ${q(config.tts.pythonPath!)}\nvoice_styles = ${q(config.tts.voiceStyles!)}\nvoice_model = ${q(config.tts.voiceModel)}\nvoice_name = ${q(config.tts.voiceName)}\n[asr]\nenabled = ${config.asr.enabled}\nmodel = ${q(config.asr.model)}\nlanguage = ${q(config.asr.language)}\nmin_coverage = ${config.asr.minCoverage}\n[publish]\nenabled = false\nprivacy = "private"\n`;
}
/** Same check as the engine, with the scene numbered as the production view shows it. */
function renderableScenes(script:Script):void {
  try{script.scenes.forEach((scene,index)=>parseSceneLayout(index+1,scene.visualBrief,scene.narration));}
  catch(error){if(error instanceof SceneLayoutError)throw new RunnerError(`${error.message} Revise o roteiro antes de preparar os visuais.`);throw error;}
}
function checkScript(script: Script,previewOnly=false) {
  if(!previewOnly&&!script.crossChecked) throw new RunnerError('Confirme o cruzamento das fontes no roteiro antes de produzir.');
  const urls=new Set(script.sources.map(item=>item.url));
  if(!previewOnly&&urls.size<2) throw new RunnerError('O roteiro precisa de duas fontes distintas.');
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
  if((!previewOnly&&!script.claims.length) || script.claims.some(claim=>(!previewOnly&&(claim.status!=='cited'||!claim.sourceUrls.length))||claim.status==='contradicted'||!claim.text.trim()||claim.sourceUrls.some(url=>!urls.has(url)))) throw new RunnerError('Alegações precisam estar citadas nas fontes do roteiro, sem contradições pendentes.');
}

export class LocalRunner implements RunnerApi {
  private jobs: WebJob[]=[];
  private media: StoredAsset[]=[];
  private queue=Promise.resolve();
  private writes=Promise.resolve();
  private preparations=Promise.resolve();
  private visualControllers=new Set<AbortController>();
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
  prepareVisuals(channelId:string,scriptId:string):Promise<PreparedVisuals> {
    const task=this.preparations.then(()=>this.prepareScriptVisuals(channelId,scriptId));
    this.preparations=task.then(()=>{},()=>{});
    return task;
  }
  private async prepareScriptVisuals(channelId:string,scriptId:string):Promise<PreparedVisuals> {
    const state=await this.channel(channelId); id(scriptId);
    if(this.stopped) throw new RunnerError('Servidor encerrando.');
    if(!this.engineStatus().available) throw new RunnerError(this.engineStatus().message,503);
    const script=state.scripts.find(item=>item.id===scriptId&&item.channelId===channelId&&item.status!=='archived');
    if(!script) throw new RunnerError('Roteiro não encontrado neste canal.');
    if(!script.scenes.length||script.scenes.length>32||script.scenes.some(scene=>!scene.heading.trim()||!scene.narration.trim()||!Number.isSafeInteger(scene.id)||scene.id<0)||new Set(script.scenes.map(scene=>scene.id)).size!==script.scenes.length)
      throw new RunnerError('Complete os títulos e as falas das cenas no roteiro antes de preparar os visuais.');
    renderableScenes(script);
    const fingerprint=visualFingerprint(state,channelId,script);
    const bindings:Record<string,string>={};
    const previews:Record<string,string>={};
    const pending:PreparedVisuals['pending']=[];
    const captureReason='Prévia ilustrativa criada. A gravação real desta cena continua pendente para a versão final.';
    for(const asset of this.media.filter(asset=>asset.channelId===channelId&&asset.generated?.scriptId===scriptId&&asset.generated.fingerprint===fingerprint)) {
      if(await this.assetFile(channelId,asset.id)) {
        const sceneId=asset.generated!.sceneId;previews[String(sceneId)]=asset.id;
        if(asset.generated!.captureRequired)pending.push({sceneId,reason:captureReason});
        else bindings[String(sceneId)]=asset.id;
      }
    }
    if(Object.keys(previews).length===script.scenes.length) return {scriptId,assets:await this.assets(channelId),bindings,previews,pending};
    const directory=join(this.root,'visuals',channelId,randomUUID());
    await mkdir(directory,{recursive:true,mode:0o700});
    const input=join(directory,'plan.json'),output=join(directory,'images');
    const plan={channel:state.channels.find(channel=>channel.id===channelId)!.name,title:script.title,format:script.format,scenes:script.scenes.map(scene=>({id:scene.id,heading:scene.heading,narration:scene.narration,visual_brief:scene.visualBrief,duration_hint_secs:scene.durationHintSecs}))};
    if(Buffer.byteLength(JSON.stringify(plan))>1_048_576) throw new RunnerError('O plano visual excede 1 MB. Reduza o texto das cenas.');
    await writeFile(input,JSON.stringify(plan),{mode:0o600});
    const controller=new AbortController();this.visualControllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),120_000);
    try {
      const result=await (this.options.execute??this.execute.bind(this))(['visuals','--input',input,'--output',output],resolve(this.options.repositoryRoot),controller.signal);
      if(result.exitCode!==0) throw new RunnerError('Não foi possível criar os visuais locais. Confira os títulos e as falas das cenas e reconstrua o motor com npm run engine:build se necessário.');
      let report:unknown;
      try {report=JSON.parse(result.stdout);} catch {throw new RunnerError('O motor retornou um plano visual inválido.');}
      if(!report||typeof report!=='object'||!('renderer'in report)||report.renderer!=='framechester-editorial-v2'||!('scenes'in report)||!Array.isArray(report.scenes)||report.scenes.length!==script.scenes.length) throw new RunnerError('O motor retornou um plano visual inválido.');
      const seen=new Set<number>(),imports:Array<{sceneId:number;bytes:Buffer;captureRequired:boolean}>=[];
      for(const item of report.scenes) {
        if(!item||typeof item!=='object'||!Number.isSafeInteger(item.scene_id)||seen.has(item.scene_id)||!script.scenes.some(scene=>scene.id===item.scene_id)) throw new RunnerError('O motor retornou cenas visuais incompatíveis.');
        seen.add(item.scene_id);
        const captureRequired=item.status==='requires_capture';
        if(captureRequired&&!pending.some(scene=>scene.sceneId===item.scene_id))pending.push({sceneId:item.scene_id,reason:captureReason});
        if(!['generated','requires_capture'].includes(item.status)||item.file!==`scene-${item.scene_id}.png`) throw new RunnerError('O motor retornou um arquivo visual inválido. Reconstrua o motor local se necessário.');
        if(previews[String(item.scene_id)]) continue;
        const actual=await realpath(join(output,item.file)),base=await realpath(output),rel=relative(base,actual);
        const info=await stat(actual);
        if(rel.startsWith(`..${sep}`)||rel==='..'||resolve(base,rel)!==actual||!info.isFile()||info.nlink!==1||info.size<24||info.size>20*1024*1024) throw new RunnerError('O arquivo visual saiu da área permitida ou tem tamanho inválido.');
        const bytes=await readFile(actual);
        if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.subarray(12,16).toString()!=='IHDR'||!bytes.readUInt32BE(16)||!bytes.readUInt32BE(20)||bytes.readUInt32BE(16)>7680||bytes.readUInt32BE(20)>7680) throw new RunnerError('O motor não produziu uma imagem PNG válida.');
        imports.push({sceneId:item.scene_id,bytes,captureRequired});
      }
      // All output is validated before any new asset enters the channel library.
      const mediaDirectory=join(this.root,'media',channelId);await mkdir(mediaDirectory,{recursive:true,mode:0o700});
      const created:StoredAsset[]=[];
      for(const {sceneId,bytes,captureRequired} of imports) {
        const scene=script.scenes.find(scene=>scene.id===sceneId)!;
        const asset:StoredAsset={id:randomUUID(),channelId,name:`${scene.heading.slice(0,100)}.png`,kind:'image',bytes:bytes.length,checksum:hash(bytes),license:'Original — visual explicativo gerado localmente pelo Framechester',provenance:'Composição própria com título e trecho do roteiro; sem busca de imagens, API paga ou mídia de terceiros.',restrictions:captureRequired?'Prévia ilustrativa; gravação real pendente. Não usar como demonstração ou evidência de teste.':'Ilustração editorial para revisão; não representa captura real, experimento ou comprovação das alegações.',createdAt:new Date().toISOString(),generated:{scriptId,sceneId,fingerprint,...(captureRequired?{captureRequired:true}:{})},diskName:''};
        asset.diskName=`${asset.id}.png`;
        await writeFile(join(mediaDirectory,asset.diskName),bytes,{flag:'wx',mode:0o600});
        created.push(asset);previews[String(sceneId)]=asset.id;
        if(!captureRequired)bindings[String(sceneId)]=asset.id;
      }
      this.media.push(...created);
      await this.persist();
      return {scriptId,assets:await this.assets(channelId),bindings,previews,pending};
    } finally {clearTimeout(timer);this.visualControllers.delete(controller);}
  }
  async assetFile(channelId:string,assetId:string) {
    await this.channel(channelId);id(assetId);
    const asset=this.media.find(item=>item.id===assetId&&item.channelId===channelId&&item.kind==='image');
    if(!asset) return undefined;
    try {
      const directory=await realpath(join(this.root,'media',channelId)),path=await realpath(join(directory,asset.diskName)),rel=relative(directory,path),info=await stat(path);
      if(rel.startsWith(`..${sep}`)||rel==='..'||resolve(directory,rel)!==path||!info.isFile()||info.nlink!==1||info.size>20*1024*1024||hash(await readFile(path))!==asset.checksum) return undefined;
      const contentType:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp'};
      return contentType[extname(asset.diskName)]?{path,contentType:contentType[extname(asset.diskName)]}:undefined;
    } catch {return undefined;}
  }
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
    if(input.previewOnly!==undefined&&typeof input.previewOnly!=='boolean')throw new RunnerError('Opção de prévia inválida.');
    const state=await this.channel(channelId);
    if(this.stopped) throw new RunnerError('Servidor encerrando.');
    if(!this.engineStatus().available) throw new RunnerError(this.engineStatus().message,503);
    const script=state.scripts.find(item=>item.id===input.scriptId && item.channelId===channelId);
    if(!script || script.status==='archived') throw new RunnerError('Roteiro não encontrado neste canal.');
    checkScript(script,input.previewOnly===true);
    if(!input.assetIds || Object.keys(input.assetIds).length!==script.scenes.length) throw new RunnerError('Selecione uma mídia deste canal para cada cena.');
    const assets=script.scenes.map(scene=>this.media.find(asset=>asset.id===input.assetIds[String(scene.id)] && asset.channelId===channelId));
    if(assets.some(asset=>!asset)) throw new RunnerError('Mídia ausente ou pertencente a outro canal.');
    if(!input.previewOnly&&assets.some(asset=>asset?.generated?.captureRequired))throw new RunnerError('Esta imagem é uma prévia ilustrativa. Adicione a gravação real ou adapte o roteiro antes de gerar a versão final.');
    if(assets.some((asset,index)=>asset?.generated&&(asset.generated.scriptId!==script.id||asset.generated.sceneId!==script.scenes[index].id||asset.generated.fingerprint!==visualFingerprint(state,channelId,script))))
      throw new RunnerError('O roteiro mudou ou este visual foi preparado para outra cena. Prepare os visuais novamente antes de gerar o vídeo.');
    const config=productionConfig(Object.hasOwn(state.channelConfigs,channelId) ? state.channelConfigs[channelId] : state.config,this.options.repositoryRoot);
    const voiceError=commercialVoiceError(config.tts);
    if(voiceError) throw new RunnerError(voiceError);
    const job: WebJob={id:randomUUID(),channelId,scriptId:script.id,status:'queued',createdAt:new Date().toISOString(),message:'Aguardando o motor local.',videoAvailable:false,...(input.previewOnly?{previewOnly:true}:{})};
    this.jobs.unshift(job); await this.persist();
    const work=()=>this.run(job,structuredClone(script),config,assets as StoredAsset[],input);
    this.queue=this.queue.then(work,work);
    return structuredClone(job);
  }
  async startAutomated(channelId:string,seedScriptId:string,prepare:()=>Promise<string>):Promise<WebJob> {
    const state=await this.channel(channelId);
    if(this.stopped)throw new RunnerError('Servidor encerrando.');
    if(!this.engineStatus().available)throw new RunnerError(this.engineStatus().message,503);
    if(seedScriptId!=='automatic'&&!state.scripts.some(script=>script.id===seedScriptId&&script.channelId===channelId&&script.status!=='archived'))throw new RunnerError('O roteiro de referência não pertence a este canal.');
    const config=productionConfig(Object.hasOwn(state.channelConfigs,channelId)?state.channelConfigs[channelId]:state.config,this.options.repositoryRoot);
    const voiceError=commercialVoiceError(config.tts);if(voiceError)throw new RunnerError(voiceError);
    if(!this.options.execute){
      const missing=[['Python do Kokoro (pythonPath)',config.tts.pythonPath],['Modelo da voz (voiceModel)',config.tts.voiceModel],['Estilos das vozes (voiceStyles)',config.tts.voiceStyles]].filter(([,path])=>!isFile(path)).map(([label])=>label);
      if(missing.length)throw new RunnerError(`Arquivos do narrador não encontrados: ${missing.join(', ')}. Confira os caminhos em Configurações; caminhos relativos partem da raiz do projeto.`);
    }
    const job:WebJob={id:randomUUID(),channelId,scriptId:seedScriptId,status:'queued',createdAt:new Date().toISOString(),message:'Produção com IA na fila.',videoAvailable:false,previewOnly:true,automated:true};
    this.jobs.unshift(job);await this.persist();
    const work=async()=>{
      if(this.stopped)return;
      try{
        job.status='running';job.startedAt=new Date().toISOString();job.message='A IA está desenvolvendo o roteiro.';await this.persist();
        const generatedId=await prepare();if(this.stopped)throw new RunnerError('Produção interrompida pelo encerramento do servidor. O roteiro gerado foi preservado.');
        const next=await this.channel(channelId),script=next.scripts.find(script=>script.id===generatedId&&script.channelId===channelId&&script.status!=='archived');
        if(!script)throw new RunnerError('O roteiro gerado não pertence a este canal.');
        checkScript(script,true);job.scriptId=script.id;job.message='Roteiro salvo. Preparando os visuais de todas as cenas.';await this.persist();
        const prepared=await this.prepareVisuals(channelId,script.id),assetIds=prepared.previews??prepared.bindings;
        const assets=script.scenes.map(scene=>this.media.find(asset=>asset.id===assetIds[String(scene.id)]&&asset.channelId===channelId));
        if(assets.some(asset=>!asset))throw new RunnerError('A preparação automática não entregou um visual para cada cena.');
        await this.run(job,structuredClone(script),config,assets as StoredAsset[],{scriptId:script.id,assetIds,burnSubtitles:true,asr:config.asr.enabled,previewOnly:true});
      }catch(error){job.status='failed';job.message=error instanceof RunnerError||error instanceof HttpError?error.message:'A produção automática não foi concluída. Confira o roteiro salvo e a configuração do assistente antes de tentar novamente.';job.finishedAt=new Date().toISOString();await this.persist();}
    };
    this.queue=this.queue.then(work,work);return structuredClone(job);
  }
  private async run(job: WebJob,script: Script,config: WebConfig,assets: StoredAsset[],input: StartJobInput) {
    if(this.stopped) return;
    const directory=join(this.root,'jobs',id(job.channelId),id(job.id));
    this.active=new AbortController();
    const timer=setTimeout(()=>this.active?.abort(),this.options.timeoutMs ?? 30*60*1000);
    try {
      job.status='running'; job.startedAt??=new Date().toISOString(); job.message='Gerando a voz, montando as cenas e executando o QA local.'; await this.persist();
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
      if(input.previewOnly)args.push('--preview-only');
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
      if(input.previewOnly&&job.videoAvailable&&['pass','needs_human'].includes(job.qa.technical)) {job.status='needs_review';job.message='Prévia do vídeo gerada com marca de revisão. Confira o resultado e as pendências de QA; nenhuma publicação foi autorizada.';}
      else if(result.exitCode!==0 || report.stage==='blocked' || job.qa.technical==='fail' || job.qa.editorial==='fail') { job.status='blocked'; job.message='O motor bloqueou a entrega. Confira o relatório de QA.'; }
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
    const preview=this.jobs.find(job=>job.channelId===channelId&&job.id===jobId)?.previewOnly;
    if(preview&&!['video','report','subtitles'].includes(file))return undefined;
    try { const path=await realpath(join(root,preview&&file==='subtitles'?'render/captions.srt':FILES[file][0])); const base=await realpath(root); const rel=relative(base,path); if(rel.startsWith(`..${sep}`) || rel==='..' || resolve(base,rel)!==path || !(await stat(path)).isFile()) return undefined; return {path,contentType:FILES[file][1]}; }
    catch { return undefined; }
  }
  async idle() { await this.preparations; await this.queue; await this.writes; }
  async close() { this.stopped=true; this.active?.abort(); for(const controller of this.visualControllers)controller.abort(); await this.idle(); }
}
export async function createRunner(options: RunnerOptions) { return new LocalRunner(options).initialize(); }
