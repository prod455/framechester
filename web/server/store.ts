import type { AppState, Channel, WebConfig, Research, Script, Story, RevenueEntry, Source, SocialSnapshot, Platform } from '../shared/types.ts';
import { SceneLayoutError, parseSceneLayout } from '../shared/scene-layouts.ts';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError, writePrivateJson } from './auth.ts';

export type Collection = 'research' | 'scripts' | 'stories' | 'receipts';
type Resource = Research | Script | Story | RevenueEntry;
const collections: Collection[] = ['research', 'scripts', 'stories', 'receipts'];
const platforms: Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook'];
export function defaultHome(): string { return resolve(process.env.FRAMECHESTER_WEB_HOME || join(homedir(), '.framechester', 'web')); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Um objeto JSON é obrigatório.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new HttpError(400, 'O objeto contém campos não permitidos.');
}
function text(value: unknown, name: string, max = 6000, required = false): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) throw new HttpError(400, `Campo inválido: ${name}.`);
  return value.trim();
}
function number(value: unknown, name: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new HttpError(400, `Número inválido: ${name}.`);
  return value;
}
function list(value: unknown, name: string, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new HttpError(400, `Lista inválida: ${name}.`);
  return value;
}
export function validId(value: unknown): string {
  const id = text(value, 'id', 128, true);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new HttpError(400, 'Identificador inválido.');
  return id;
}
export function channelId(value: unknown): string {
  const id = text(value, 'channelId', 64, true);
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id)) throw new HttpError(400, 'O canal deve usar um identificador seguro com letras minúsculas, números e hífen.');
  return id;
}
export function platform(value: unknown): Platform {
  if (!platforms.includes(value as Platform)) throw new HttpError(400, 'Rede inválida.');
  return value as Platform;
}
function date(value: unknown, name: string): string {
  const result = text(value, name, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new HttpError(400, `Data inválida: ${name}.`);
  return result;
}
function optionalId(value: unknown): string | undefined { return value === undefined || value === '' ? undefined : validId(value); }
function status(value: unknown): 'draft' | 'reviewed' | 'archived' {
  if (!['draft', 'reviewed', 'archived'].includes(String(value))) throw new HttpError(400, 'Status editorial inválido.');
  return value as 'draft' | 'reviewed' | 'archived';
}
function source(value: unknown): Source {
  const item = object(value); keys(item, ['title', 'url', 'publisher', 'retrievedAt', 'license']);
  const url = text(item.url, 'source.url', 3000, true);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new HttpError(400, 'URL de fonte inválida.'); }
  const host = parsed.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || host === '[::1]') throw new HttpError(400, 'A fonte deve usar uma URL pública HTTP(S), sem credenciais.');
  return { title: text(item.title, 'source.title', 500, true), url, publisher: text(item.publisher, 'source.publisher', 300, true), retrievedAt: text(item.retrievedAt, 'source.retrievedAt', 80, true), license: text(item.license, 'source.license', 500, true) };
}
export function defaultConfig(): WebConfig {
  const container=process.env.FRAMECHESTER_CONTAINER==='1';
  return { dryRun: true, telemetry: false, render: { width: 1080, height: 1920, fps: 30, crf: 20, preset: 'veryfast', videoCodec: 'libx264' }, tts: { engine:'kokoro', pythonPath:container?'/opt/tts/bin/python':process.platform==='win32'?'.framechester/tts-venv/Scripts/python.exe':'.framechester/tts-venv/bin/python', voiceStyles:container?'/models/kokoro/voices-v1.0.bin':'models/kokoro/voices-v1.0.bin', piperPath:'piper', voiceModel:container?'/models/kokoro/kokoro-v1.0.onnx':'models/kokoro/kokoro-v1.0.onnx', voiceName:'pf_dora' }, asr: { enabled: false, model: process.platform === 'win32' ? 'C:/whisper/models/ggml-base.bin' : '', language: 'pt', minCoverage: 0.45 } };
}
export function normalizeConfig(value: unknown, previous = defaultConfig()): WebConfig {
  const item = object(value); keys(item, ['dryRun', 'telemetry', 'render', 'tts', 'asr']);
  if ((item.dryRun !== undefined && item.dryRun !== true) || (item.telemetry !== undefined && item.telemetry !== false)) throw new HttpError(400, 'dryRun deve permanecer true e telemetry false.');
  const render = { ...previous.render, ...object(item.render ?? {}) };
  const tts = { ...previous.tts, ...object(item.tts ?? {}) };
  const asr = { ...previous.asr, ...object(item.asr ?? {}) };
  keys(render, ['width', 'height', 'fps', 'crf', 'preset', 'videoCodec']); keys(tts, ['piperPath', 'voiceModel', 'voiceName', 'engine', 'pythonPath', 'voiceStyles']); keys(asr, ['enabled', 'model', 'language', 'minCoverage']);
  if(!['kokoro','piper'].includes(String(tts.engine))) throw new HttpError(400,'Motor de voz inválido.');
  const width = number(render.width, 'width', 2, 7680, true); const height = number(render.height, 'height', 2, 7680, true);
  if (width % 2 || height % 2 || render.videoCodec !== 'libx264' || !['ultrafast','superfast','veryfast','faster','fast','medium','slow','slower','veryslow'].includes(String(render.preset))) throw new HttpError(400, 'Perfil de renderização inválido.');
  if (typeof asr.enabled !== 'boolean') throw new HttpError(400, 'asr.enabled deve ser booleano.');
  const localPath = (path: unknown, name: string) => { const result = text(path, name, 1200); if (/[\r\n]/.test(result) || /^(?:https?|ftp|s3):/i.test(result)) throw new HttpError(400, 'Use um caminho local.'); return result; };
  return { dryRun: true, telemetry: false, render: { width, height, fps: number(render.fps, 'fps', 1, 120, true), crf: number(render.crf, 'crf', 0, 51, true), preset: String(render.preset), videoCodec: 'libx264' }, tts: { engine:tts.engine as 'kokoro'|'piper',pythonPath:localPath(tts.pythonPath,'pythonPath'),voiceStyles:localPath(tts.voiceStyles,'voiceStyles'),piperPath: localPath(tts.piperPath, 'piperPath'), voiceModel: localPath(tts.voiceModel, 'voiceModel'), voiceName: text(tts.voiceName, 'voiceName', 150, true) }, asr: { enabled: asr.enabled, model: localPath(asr.model, 'asr.model'), language: text(asr.language, 'asr.language', 20, true), minCoverage: number(asr.minCoverage, 'minCoverage', 0, 1) } };
}
function normalizeChannel(value: unknown, previous?: Channel): Channel {
  const item = object(value); keys(item, ['id','name','description','niche','audience','language','youtubeChannelId','createdAt','updatedAt']);
  const id = channelId(previous?.id ?? item.id ?? `channel-${randomUUID().slice(0, 8)}`);
  if (item.id !== undefined && item.id !== id) throw new HttpError(400, 'O identificador do canal não pode mudar.');
  const language = text(item.language ?? 'pt-BR', 'language', 40, true);
  if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language)) throw new HttpError(400, 'Idioma inválido.');
  const youtubeChannelId = item.youtubeChannelId === undefined || item.youtubeChannelId === '' ? undefined : validId(item.youtubeChannelId);
  const now = new Date().toISOString();
  return { id, name: text(item.name, 'name', 200, true), description: text(item.description, 'description'), niche: text(item.niche, 'niche', 3000), audience: text(item.audience, 'audience', 3000), language, ...(youtubeChannelId ? { youtubeChannelId } : {}), createdAt: previous?.createdAt ?? now, updatedAt: now };
}
function normalizeResource(kind: Collection, value: unknown, state: AppState, previous?: Resource): Resource {
  const item = object(value); const meta = ['id','createdAt','updatedAt','channelId'];
  const id = validId(previous?.id ?? item.id ?? randomUUID()); const owner = channelId(item.channelId);
  if (!state.channels.some(channel => channel.id === owner)) throw new HttpError(404, 'Canal não cadastrado.');
  if (previous && (previous.channelId !== owner || (item.id !== undefined && item.id !== previous.id))) throw new HttpError(409, 'O recurso pertence a outro canal ou identificador.');
  const now = new Date().toISOString(); const base = { id, channelId: owner, createdAt: previous?.createdAt ?? now, updatedAt: now };
  if (kind === 'research') {
    keys(item, [...meta,'title','niche','audience','hypothesis','differentiation','keywords','sources','demandScore','competitionScore','feasibilityScore','notes','status']);
    return { ...base, title: text(item.title, 'title', 500, true), niche: text(item.niche, 'niche', 3000), audience: text(item.audience, 'audience', 3000), hypothesis: text(item.hypothesis, 'hypothesis', 12000), differentiation: text(item.differentiation, 'differentiation', 12000), keywords: list(item.keywords ?? [], 'keywords').map(word => text(word, 'keyword', 120, true)), sources: list(item.sources ?? [], 'sources').map(source), demandScore: number(item.demandScore ?? 0, 'demandScore', 0, 100), competitionScore: number(item.competitionScore ?? 0, 'competitionScore', 0, 100), feasibilityScore: number(item.feasibilityScore ?? 0, 'feasibilityScore', 0, 100), notes: text(item.notes, 'notes', 20000), status: status(item.status ?? 'draft') };
  }
  if (kind === 'scripts') {
    keys(item, [...meta,'researchId','topicId','title','series','format','hook','scenes','sources','claims','status','crossChecked']);
    const researchId = optionalId(item.researchId);
    if (researchId && !state.research.some(row => row.id === researchId && row.channelId === owner)) throw new HttpError(400, 'A pesquisa vinculada não pertence ao canal.');
    const sources = list(item.sources ?? [], 'sources').map(source); const seen = new Set<number>();
    const scenes = list(item.scenes ?? [], 'scenes', 100).map(value => { const scene = object(value); keys(scene, ['id','heading','narration','visualBrief','durationHintSecs']); const sceneId = number(scene.id, 'scene.id', 0, 4294967295, true); if (seen.has(sceneId)) throw new HttpError(400, 'ID de cena duplicado.'); seen.add(sceneId); const normalized = { id: sceneId, heading: text(scene.heading, 'heading', 500), narration: text(scene.narration, 'narration', 30000), visualBrief: text(scene.visualBrief, 'visualBrief', 12000), durationHintSecs: number(scene.durationHintSecs ?? 20, 'durationHintSecs', 0.1, 3600) }; return normalized; });
    const claims = list(item.claims ?? [], 'claims', 300).map(value => { const claim = object(value); keys(claim, ['text','status','sourceUrls']); if (!['cited','unverified','contradicted'].includes(String(claim.status))) throw new HttpError(400, 'Status de alegação inválido.'); const sourceUrls = list(claim.sourceUrls ?? [], 'sourceUrls').map(url => text(url, 'sourceUrl', 3000, true)); if (sourceUrls.some(url => !sources.some(source => source.url === url))) throw new HttpError(400, 'A alegação usa fonte não documentada.'); return { text: text(claim.text, 'claim.text', 6000, true), status: claim.status as 'cited' | 'unverified' | 'contradicted', sourceUrls }; });
    if (!['short','long'].includes(String(item.format ?? 'short')) || (item.crossChecked !== undefined && typeof item.crossChecked !== 'boolean')) throw new HttpError(400, 'Formato ou declaração de checagem inválidos.');
    return { ...base, ...(researchId ? { researchId } : {}), topicId: validId(item.topicId ?? `topic-${id}`), title: text(item.title, 'title', 500, true), series: text(item.series ?? 'tecnologia', 'series', 150, true), format: (item.format ?? 'short') as 'short' | 'long', hook: text(item.hook, 'hook', 6000), scenes, sources, claims, crossChecked: item.crossChecked === true, status: status(item.status ?? 'draft') };
  }
  if (kind === 'stories') {
    keys(item, [...meta,'scriptId','title','hook','setup','conflict','turningPoint','resolution','cta']); const scriptId = optionalId(item.scriptId);
    if (scriptId && !state.scripts.some(script => script.id === scriptId && script.channelId === owner)) throw new HttpError(400, 'O roteiro vinculado não pertence ao canal.');
    return { ...base, ...(scriptId ? { scriptId } : {}), title: text(item.title, 'title', 500, true), hook: text(item.hook, 'hook', 12000), setup: text(item.setup, 'setup', 12000), conflict: text(item.conflict, 'conflict', 12000), turningPoint: text(item.turningPoint, 'turningPoint', 12000), resolution: text(item.resolution, 'resolution', 12000), cta: text(item.cta, 'cta', 6000) };
  }
  keys(item, [...meta,'platform','kind','amountCents','currency','date','periodStart','periodEnd','note','source']);
  if (!['payment','estimate','cost'].includes(String(item.kind)) || (item.source !== undefined && item.source !== 'manual')) throw new HttpError(400, 'Tipo ou origem do registro financeiro inválidos.');
  const currency = text(item.currency ?? 'BRL', 'currency', 3, true); if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Moeda inválida.');
  const periodStart = item.periodStart ? date(item.periodStart, 'periodStart') : undefined; const periodEnd = item.periodEnd ? date(item.periodEnd, 'periodEnd') : undefined;
  if ((periodStart && !periodEnd) || (!periodStart && periodEnd) || (periodStart && periodEnd && periodEnd < periodStart)) throw new HttpError(400, 'Período financeiro inválido.');
  return { ...base, platform: platform(item.platform), kind: item.kind as RevenueEntry['kind'], amountCents: number(item.amountCents, 'amountCents', 0, Number.MAX_SAFE_INTEGER, true), currency, date: date(item.date, 'date'), ...(periodStart ? { periodStart, periodEnd } : {}), note: text(item.note, 'note', 6000), source: 'manual' };
}
function normalizeSnapshot(value: unknown, state: AppState): SocialSnapshot {
  const item = object(value); keys(item, ['id','channelId','platform','accountId','fetchedAt','periodStart','periodEnd','stats','revenue']);
  const owner = channelId(item.channelId); if (!state.channels.some(channel => channel.id === owner)) throw new HttpError(400, 'Snapshot sem canal cadastrado.');
  const stats = object(item.stats); keys(stats, ['views','followers','watchMinutes','likes']);
  const revenue = object(item.revenue); keys(revenue, ['estimatedCents','paidCents','currency','availability','reason']);
  const currency = text(revenue.currency, 'currency', 3, true); const availability = revenue.availability;
  if (!/^[A-Z]{3}$/.test(currency) || !['available','unavailable','missing_scope'].includes(String(availability)) || revenue.paidCents != null) throw new HttpError(400, 'Receita da plataforma inválida; pagamentos são importados separadamente.');
  const nullable = (value: unknown, name: string, integer = false) => value == null ? null : number(value, name, 0, Number.MAX_SAFE_INTEGER, integer);
  const estimatedCents = revenue.estimatedCents == null ? null : number(revenue.estimatedCents, 'estimatedCents', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true);
  if (availability !== 'available' && estimatedCents !== null) throw new HttpError(400, 'Receita indisponível deve permanecer desconhecida.');
  const fetchedAt = text(item.fetchedAt, 'fetchedAt', 80, true); if (!Number.isFinite(Date.parse(fetchedAt))) throw new HttpError(400, 'Data do snapshot inválida.');
  const periodStart = date(item.periodStart, 'periodStart'); const periodEnd = date(item.periodEnd, 'periodEnd'); if (periodEnd < periodStart) throw new HttpError(400, 'Período do snapshot inválido.');
  return { id: validId(item.id), channelId: owner, platform: platform(item.platform), accountId: text(item.accountId,'accountId',300,true), fetchedAt, periodStart, periodEnd, stats: { views: nullable(stats.views,'views',true), followers: nullable(stats.followers,'followers',true), watchMinutes: nullable(stats.watchMinutes,'watchMinutes'), ...(stats.likes !== undefined ? { likes:nullable(stats.likes,'likes',true) } : {}) }, revenue: { estimatedCents, paidCents:null, currency, availability:availability as SocialSnapshot['revenue']['availability'], reason:text(revenue.reason,'reason',3000,true) } };
}
// Checked on save only: a stored brief must never prevent the whole state from loading.
function renderableScenes(script: Script): void {
  try { for (const scene of script.scenes) parseSceneLayout(scene.id + 1, scene.visualBrief, scene.narration); }
  catch (error) { if (error instanceof SceneLayoutError) throw new HttpError(400, error.message); throw error; }
}
function validateState(state: AppState): void {
  const root = object(state); keys(root, ['schemaVersion','channels','config','channelConfigs','research','scripts','stories','monetization','receipts']);
  if (state.schemaVersion !== 1) throw new HttpError(400, 'Versão de armazenamento inválida.');
  state.config = normalizeConfig(state.config);
  const ids = new Set<string>(); const youtube = new Set<string>();
  state.channels = list(state.channels, 'channels', 500).map(value => { const original = object(value); const channel = normalizeChannel(value, value as Channel); for (const field of ['createdAt','updatedAt'] as const) { const timestamp = text(original[field],field,80,true); if (!Number.isFinite(Date.parse(timestamp))) throw new HttpError(400,'Timestamp inválido.'); channel[field] = timestamp; } if (ids.has(channel.id) || (channel.youtubeChannelId && youtube.has(channel.youtubeChannelId))) throw new HttpError(409, 'Canal duplicado.'); ids.add(channel.id); if (channel.youtubeChannelId) youtube.add(channel.youtubeChannelId); return channel; });
  for (const [id, config] of Object.entries(object(state.channelConfigs))) { if (!ids.has(id)) throw new HttpError(400, 'Configuração sem canal.'); state.channelConfigs[id] = normalizeConfig(config); }
  for (const kind of collections) { const values = list(state[kind], kind, 10000); const seen = new Set<string>(); for (const value of values) { const entity = normalizeResource(kind, value, state, value as Resource); if (seen.has(entity.id)) throw new HttpError(409, 'Recurso duplicado.'); seen.add(entity.id); } }
  state.monetization = list(state.monetization, 'monetization', 10000).map(snapshot => normalizeSnapshot(snapshot, state));
}
function initialState(): AppState { return { schemaVersion: 1, channels: [], config: defaultConfig(), channelConfigs: {}, research: [], scripts: [], stories: [], monetization: [], receipts: [] }; }

export class LocalStore {
  readonly ready: Promise<void>;
  private state = initialState();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly home: string) { this.ready = this.load(); }
  private async load(): Promise<void> {
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(await readFile(join(this.home, 'state.json'), 'utf8')) as AppState;
      // Old Piper settings are replaced as a unit; render settings and channel
      // identity stay intact. Persistence uses the existing atomic update path.
      for (const config of [this.state.config, ...Object.values(this.state.channelConfigs ?? {})]) {
        if (config?.tts && (config.tts.engine === undefined || config.tts.engine === 'piper'))
          config.tts = defaultConfig().tts;
      }
      validateState(this.state);
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new HttpError(503, 'O armazenamento local está inválido; preserve o arquivo para recuperação.'); }
  }
  async read(): Promise<AppState> { await this.ready; return structuredClone(this.state); }
  async update(mutator: (state: AppState) => void | Promise<void>): Promise<AppState> {
    await this.ready;
    const operation = this.pending.then(async () => { const next = structuredClone(this.state); await mutator(next); validateState(next); await writePrivateJson(join(this.home, 'state.json'), next); this.state = next; return structuredClone(next); });
    this.pending = operation.catch(() => undefined); return operation;
  }
  async requireChannel(id: string): Promise<Channel> { channelId(id); const channel = (await this.read()).channels.find(channel => channel.id === id); if (!channel) throw new HttpError(404, 'Canal não cadastrado.'); return channel; }
  async configFor(id: string): Promise<WebConfig> { await this.requireChannel(id); const state = await this.read(); return structuredClone(Object.hasOwn(state.channelConfigs, id) ? state.channelConfigs[id] : state.config); }
  async saveChannel(value: unknown, id?: string): Promise<Channel> {
    let saved!: Channel;
    await this.update(state => { const previous = id ? state.channels.find(channel => channel.id === channelId(id)) : undefined; if (id && !previous) throw new HttpError(404, 'Canal não cadastrado.'); saved = normalizeChannel({ ...previous, ...object(value) }, previous); if (!previous && state.channels.some(channel => channel.id === saved.id)) throw new HttpError(409, 'Canal duplicado.'); if (previous) state.channels[state.channels.indexOf(previous)] = saved; else state.channels.push(saved); });
    return saved;
  }
  async deleteChannel(id: string): Promise<void> {
    await this.update(state => { const index = state.channels.findIndex(channel => channel.id === channelId(id)); if (index < 0) throw new HttpError(404, 'Canal não cadastrado.'); if (collections.some(kind => state[kind].some(row => row.channelId === id)) || state.monetization.some(row => row.channelId === id)) throw new HttpError(409, 'O canal possui conteúdo ou histórico; remova os vínculos antes de excluir.'); state.channels.splice(index, 1); delete state.channelConfigs[id]; });
  }
  async saveConfig(value: unknown, id?: string): Promise<WebConfig> {
    let saved!: WebConfig;
    await this.update(state => { if (id && !state.channels.some(channel => channel.id === channelId(id))) throw new HttpError(404, 'Canal não cadastrado.'); saved = normalizeConfig(value, id && Object.hasOwn(state.channelConfigs, id) ? state.channelConfigs[id] : state.config); if (id) state.channelConfigs[id] = saved; else state.config = saved; }); return saved;
  }
  async saveResource(kind: Collection, value: unknown, id?: string): Promise<Resource> {
    let saved!: Resource;
    await this.update(state => { const rows: Resource[] = state[kind]; const previous = id ? rows.find(row => row.id === validId(id)) : undefined; if (id && !previous) throw new HttpError(404, 'Recurso não encontrado.'); saved = normalizeResource(kind, { ...previous, ...object(value) }, state, previous); if (kind === 'scripts') renderableScenes(saved as Script); if (!previous && rows.some(row => row.id === saved.id)) throw new HttpError(409, 'Recurso duplicado.'); if (previous) rows[rows.indexOf(previous)] = saved; else rows.push(saved); }); return saved;
  }
  async deleteResource(kind: Collection, id: string, owner: string): Promise<void> {
    await this.update(state => { const rows: Resource[] = state[kind]; const index = rows.findIndex(row => row.id === validId(id) && row.channelId === channelId(owner)); if (index < 0) throw new HttpError(404, 'Recurso não encontrado neste canal.'); if ((kind === 'research' && state.scripts.some(row => row.researchId === id)) || (kind === 'scripts' && state.stories.some(row => row.scriptId === id))) throw new HttpError(409, 'O recurso possui vínculos editoriais.'); rows.splice(index, 1); });
  }
  async saveSnapshot(snapshot: SocialSnapshot): Promise<void> { await this.update(state => { if (!state.channels.some(channel => channel.id === snapshot.channelId)) throw new HttpError(404, 'Canal não cadastrado.'); state.monetization = state.monetization.filter(row => !(row.channelId === snapshot.channelId && row.platform === snapshot.platform)); state.monetization.push(structuredClone(snapshot)); }); }
}
