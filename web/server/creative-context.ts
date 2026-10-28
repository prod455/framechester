import type { AppState, Claim, Source, ScriptScene } from '../shared/types.ts';
import type { CreativeEditorContext, CreativeFields, CreativeTask, ResearchCreativeValues, ScriptCreativeValues, StoryCreativeValues } from '../shared/creative-types.ts';
import { HttpError } from './auth.ts';
import { parseSceneLayout } from '../shared/scene-layouts.ts';

const researchKeys = ['title','niche','audience','hypothesis','differentiation','keywords','sources','notes'];
const scriptKeys = ['title','researchId','series','format','hook','scenes','sources','claims'];
const storyKeys = ['title','scriptId','hook','setup','conflict','turningPoint','resolution','cta'];
const bad = () => new HttpError(400, 'Campo inválido no contexto editorial. Confira os textos, fontes e opções do editor.');
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad(); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: string[]): void { if (Object.keys(value).some(key => !allowed.includes(key))) throw bad(); }
function text(value: unknown, max = 12_000, required = false): string { if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) throw bad(); return value.trim(); }
function title(value: unknown, output: boolean): string { const result = text(value,500,output); if (output && result.length < 3) throw bad(); return result; }
function list(value: unknown, max = 100): unknown[] { if (!Array.isArray(value) || value.length > max) throw bad(); return value; }
function optionalId(value: unknown): string | undefined { if (value === undefined || value === '') return undefined; const id = text(value,128,true); if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw bad(); return id; }
function url(value: unknown): string {
  const result = text(value, 3000, true); let parsed: URL;
  try { parsed = new URL(result); } catch { throw bad(); }
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local') || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|\[::1\])/.test(parsed.hostname) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(parsed.hostname)) throw bad();
  return result;
}
function sources(value: unknown): Source[] { return list(value).map(value => { const row = record(value); keys(row,['title','url','publisher','retrievedAt','license']); const link = text(row.url,3000); return { title:text(row.title,500),url:link ? url(link) : '',publisher:text(row.publisher,300),retrievedAt:text(row.retrievedAt,80),license:text(row.license,500) }; }); }
function uniqueSources(rows: Source[]): Source[] {
  const known = new Set<string>(); const result: Source[] = [];
  for (const source of rows) { if (source.url && known.has(source.url)) continue; if (source.url) known.add(source.url); result.push(source); }
  return result;
}
function scenes(value: unknown, output = false): ScriptScene[] {
  const seen = new Set<number>(); const rows = list(value, output ? 20 : 100);
  if (output && !rows.length) throw bad();
  return rows.map(value => {
    const row = record(value); keys(row,['id','heading','narration','visualBrief','durationHintSecs']);
    if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id < 0 || row.id > 4294967295 || seen.has(row.id) || typeof row.durationHintSecs !== 'number' || !Number.isFinite(row.durationHintSecs) || row.durationHintSecs < (output ? 0.1 : 0) || row.durationHintSecs > 3600) throw bad();
    seen.add(row.id);
    const scene = { id:row.id,heading:text(row.heading,500,output),narration:text(row.narration,30_000,output),visualBrief:text(row.visualBrief,12_000,output),durationHintSecs:row.durationHintSecs };
    // Generated directives must render; editor input is checked when the script is saved.
    if (output) parseSceneLayout(scene.id + 1,scene.visualBrief,scene.narration);
    return scene;
  });
}
function claims(value: unknown, output = false, allowedUrls?: Set<string>): Claim[] {
  return list(value).map(value => {
    const row = record(value); keys(row,output ? ['text','sourceUrls'] : ['text','status','sourceUrls']);
    const sourceUrls = list(row.sourceUrls).map(url);
    if (allowedUrls && sourceUrls.some(value => !allowedUrls.has(value))) throw bad();
    if (!output && !['cited','unverified','contradicted'].includes(String(row.status))) throw bad();
    return { text:text(row.text,12_000,output),status:output ? 'unverified' : row.status as Claim['status'],sourceUrls };
  });
}
function pick(value: object, names: string[]): Record<string, unknown> { const row = record(value); return Object.fromEntries(names.filter(key => row[key] !== undefined).map(key => [key,row[key]])); }
function researchValues(value: unknown, output = false): ResearchCreativeValues {
  const row = record(value); keys(row, output ? researchKeys.filter(key => key !== 'sources') : researchKeys);
  return { title:title(row.title,output),niche:text(row.niche,3000),audience:text(row.audience,3000),hypothesis:text(row.hypothesis),differentiation:text(row.differentiation),keywords:list(row.keywords).map(word => text(word,120,true)),sources:output ? [] : sources(row.sources),notes:text(row.notes,20_000) };
}
function scriptValues(value: unknown): ScriptCreativeValues {
  const row = record(value); keys(row,scriptKeys); if (!['short','long'].includes(String(row.format))) throw bad();
  const researchId = optionalId(row.researchId);
  return { title:text(row.title,500),...(researchId ? {researchId}:{}),series:text(row.series,300),format:row.format as 'short'|'long',hook:text(row.hook),scenes:scenes(row.scenes),sources:sources(row.sources),claims:claims(row.claims) };
}
function storyValues(value: unknown, output = false): StoryCreativeValues {
  const row = record(value); keys(row,output ? storyKeys.filter(key => key !== 'scriptId') : storyKeys); const scriptId = optionalId(row.scriptId);
  return { title:title(row.title,output),...(scriptId ? {scriptId}:{}),hook:text(row.hook),setup:text(row.setup),conflict:text(row.conflict),turningPoint:text(row.turningPoint),resolution:text(row.resolution),cta:text(row.cta,6000) };
}

export interface PreparedEditorContext {
  context: CreativeEditorContext & { linkedResearch?: ResearchCreativeValues; linkedScript?: ScriptCreativeValues };
  sources: Source[];
}
export function prepareEditorContext(value: unknown, task: CreativeTask, owner: string, state: AppState): PreparedEditorContext | undefined {
  if (value === undefined) return undefined;
  if (Buffer.byteLength(JSON.stringify(value),'utf8') > 32_000) throw new HttpError(400,'O contexto do editor excede o limite de 32 KB. Reduza o texto antes de gerar; nenhum campo foi cortado.');
  const row = record(value); keys(row,['task','values']); if (row.task !== task) throw new HttpError(400,'A tarefa não corresponde ao contexto do editor.');
  let context: PreparedEditorContext['context']; const known: Source[] = [];
  if (task === 'research') {
    const values = researchValues(row.values); known.push(...values.sources); context = {task,values};
  } else if (task === 'script') {
    const values = scriptValues(row.values); known.push(...values.sources); context = {task,values};
    if (values.researchId) {
      const linked = state.research.find(item => item.id === values.researchId && item.channelId === owner);
      if (!linked) throw new HttpError(400,'A pauta vinculada não pertence a este canal.');
      context.linkedResearch = researchValues(pick(linked,researchKeys)); known.push(...context.linkedResearch.sources);
    }
  } else {
    const values = storyValues(row.values); context = {task,values};
    if (values.scriptId) {
      const linked = state.scripts.find(item => item.id === values.scriptId && item.channelId === owner);
      if (!linked) throw new HttpError(400,'O roteiro vinculado não pertence a este canal.');
      context.linkedScript = scriptValues(pick(linked,scriptKeys)); known.push(...context.linkedScript.sources);
    }
  }
  if (Buffer.byteLength(JSON.stringify(context),'utf8') > 32_000) throw new HttpError(400,'O contexto com os vínculos excede o limite de 32 KB. Reduza o texto ou remova um vínculo antes de gerar.');
  return { context, sources:uniqueSources(known) };
}

const stringSchema = (maxLength = 12_000) => ({type:'string',maxLength});
const objectSchema = (properties: Record<string,unknown>) => ({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const strings = {type:'array',maxItems:100,items:stringSchema(3000)};
export function editorFieldsSchema(task: CreativeTask): Record<string,unknown> {
  const title = {type:'string',minLength:3,maxLength:500};
  if (task === 'research') return objectSchema({title,niche:stringSchema(3000),audience:stringSchema(3000),hypothesis:stringSchema(),differentiation:stringSchema(),keywords:{...strings,items:{type:'string',minLength:1,maxLength:120}},notes:stringSchema(20_000)});
  if (task === 'story') return objectSchema({title,hook:stringSchema(),setup:stringSchema(),conflict:stringSchema(),turningPoint:stringSchema(),resolution:stringSchema(),cta:stringSchema(6000)});
  return objectSchema({title,series:{type:'string',minLength:1,maxLength:300},format:{type:'string',enum:['short','long']},hook:{type:'string',minLength:1,maxLength:12_000},scenes:{type:'array',minItems:1,maxItems:20,items:objectSchema({id:{type:'integer',minimum:0,maximum:4294967295},heading:{type:'string',minLength:1,maxLength:500},narration:{type:'string',minLength:1,maxLength:30_000},visualBrief:{type:'string',minLength:1,maxLength:12_000},durationHintSecs:{type:'number',minimum:0.1,maximum:3600}})},claims:{type:'array',maxItems:100,items:objectSchema({text:{type:'string',minLength:1,maxLength:12_000},sourceUrls:strings})}});
}
export function validateEditorFields(value: unknown, prepared: PreparedEditorContext, additionalSources: Source[] = []): CreativeFields {
  if (prepared.context.task === 'research') { const {sources:_,...fields} = researchValues(value,true); return fields; }
  if (prepared.context.task === 'story') { const {scriptId:_,...fields} = storyValues(value,true); return fields; }
  const row = record(value); keys(row,['title','series','format','hook','scenes','claims']);
  if (row.format !== prepared.context.values.format) throw bad();
  const known = uniqueSources([...prepared.sources,...additionalSources]);
  return {title:title(row.title,true),series:text(row.series,300,true),format:row.format as 'short'|'long',hook:text(row.hook,12_000,true),scenes:scenes(row.scenes,true),sources:known,claims:claims(row.claims,true,new Set(known.map(source => source.url).filter(Boolean)))};
}
