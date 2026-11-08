import { spawn } from 'node:child_process';
import { commercialVoiceError, productionLanguage, voiceFor } from '../shared/voices.ts';
import { HttpError } from './auth.ts';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, realpath, rm, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep, delimiter, isAbsolute } from 'node:path';
import type {
  AppState,
  Platform,
  ProfileLink,
  Publication,
  PublishResult,
  VideoUpload,
  RunnerApi,
  Script,
  StartJobInput,
  WebJob,
  WebConfig,
  QaStatus,
  Look,
  AffiliateLink,
  ChannelIdentity,
} from '../shared/types.ts';
import { canPublish, crossReferences, platformLabels, publishingPlatforms } from '../shared/publishing.ts';

interface EngineResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
export class RunnerError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 503 = 400,
  ) {
    super(message);
    this.name = 'RunnerError';
  }
}
export interface RunnerOptions {
  home: string;
  repositoryRoot: string;
  readState: () => Promise<AppState>;
  binary?: string;
  timeoutMs?: number;
  execute?: (args: string[], cwd: string, signal: AbortSignal) => Promise<EngineResult>;
  publish?: (channelId: string, platform: Platform, video: VideoUpload) => Promise<PublishResult>;
  /** Connected profiles, cited in each description as the channel's other networks. */
  profiles?: (channelId: string) => Promise<ProfileLink[]>;
}
export function localEngineEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) =>
        !/(TOKEN|SECRET|PASSWORD|API_KEY|ANTHROPIC|OPENAI|YOUTUBE|RESTIC|^B2_|^AWS_|^FRAMECHESTER_)/i.test(
          name,
        ),
    ),
  );
}
const FILES: Record<string, [string, string]> = {
  video: ['render/final.mp4', 'video/mp4'],
  thumbnail: ['render/thumbnail.png', 'image/png'],
  report: ['report.html', 'text/html; charset=utf-8'],
  metadata: ['publish/metadata.json', 'application/json'],
  sources: ['publish/sources.md', 'text/markdown; charset=utf-8'],
  description: ['publish/description.txt', 'text/plain; charset=utf-8'],
  subtitles: ['publish/final.srt', 'text/plain; charset=utf-8'],
};
const id = (value: string) => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value))
    throw new RunnerError('Identificador inválido.');
  return value;
};
function isFile(path: string | undefined): boolean {
  try {
    return !!path && statSync(path).isFile();
  } catch {
    return false;
  }
}
/** Operator paths are relative to the repository, just like the engine's cwd. */
function productionConfig(config: WebConfig, repositoryRoot: string): WebConfig {
  const snapshot = structuredClone(config),
    tts = snapshot.tts;
  if (tts.voiceModel) tts.voiceModel = resolve(repositoryRoot, tts.voiceModel);
  if (tts.voiceStyles) tts.voiceStyles = resolve(repositoryRoot, tts.voiceStyles);
  if (tts.pythonPath) {
    if (isAbsolute(tts.pythonPath) || /[\\/]/.test(tts.pythonPath))
      tts.pythonPath = resolve(repositoryRoot, tts.pythonPath);
    else {
      const names =
        process.platform === 'win32' && !extname(tts.pythonPath)
          ? [tts.pythonPath, `${tts.pythonPath}.exe`]
          : [tts.pythonPath];
      const locations = [repositoryRoot, ...(process.env.PATH ?? '').split(delimiter).filter(Boolean)];
      const installed = locations
        .flatMap((directory) => names.map((name) => resolve(directory, name)))
        .find(isFile);
      tts.pythonPath = installed ?? resolve(repositoryRoot, tts.pythonPath);
    }
  }
  return snapshot;
}
async function load<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw new RunnerError('Índice local de produção inválido.');
  }
}
function qa(checks: unknown): QaStatus {
  if (!Array.isArray(checks) || !checks.length) return 'skipped';
  const statuses = checks.map((check) =>
    check && typeof check === 'object' ? (check as { status?: unknown }).status : undefined,
  );
  if (statuses.includes('fail')) return 'fail';
  if (statuses.some((status) => !['pass', 'fail', 'needs_human', 'skipped'].includes(String(status))))
    return 'skipped';
  if (statuses.includes('needs_human')) return 'needs_human';
  return statuses.some((value) => value === 'pass') ? 'pass' : 'skipped';
}
function source(value: Script['sources'][number]) {
  return {
    title: value.title,
    url: value.url,
    publisher: value.publisher,
    retrieved_at: value.retrievedAt,
    license: value.license,
  };
}
/** A Short's title carries #Shorts when it fits YouTube's 100 characters. */
/** A video split into several Shorts numbers them, so the same title is told apart. */
function partTitle(title: string, job: WebJob): string {
  return job.parts && job.parts > 1 ? `${title} (${job.part}/${job.parts})` : title;
}
function shortTitle(title: string): string {
  const tagged = `${title} #Shorts`;
  return tagged.length <= 100 ? tagged : title;
}
/**
 * `workdir` is the engine's own scratch area (narration cache). It must be writable: the
 * container runs with a read-only root, so the engine's default (`artifacts/` under its
 * working directory) fails on the first uncached sentence.
 */
/** The channel's production settings, spoken in the channel's language: the voice and the
 * speech check follow it, so an English channel never narrates with a Portuguese voice. */
type JobConfig = WebConfig & {
  language: string;
  look?: Look;
  identity?: ChannelIdentity;
  affiliates?: AffiliateLink[];
};
function jobConfig(state: AppState, channelId: string, repositoryRoot: string): JobConfig {
  const config = productionConfig(
    Object.hasOwn(state.channelConfigs, channelId) ? state.channelConfigs[channelId]! : state.config,
    repositoryRoot,
  );
  const channel = state.channels.find((item) => item.id === channelId);
  const tag = channel?.language ?? 'pt-BR';
  const language = productionLanguage(tag);
  if (!language)
    throw new RunnerError(
      `O idioma ${tag} deste canal não tem voz comercial. Use pt-BR, en-US ou es no cadastro do canal.`,
    );
  config.tts.voiceName = voiceFor(config.tts.voiceName, language);
  config.asr.language = language.asr;
  return {
    ...config,
    language: language.tag,
    ...(channel?.look ? { look: channel.look } : {}),
    ...(channel?.identity ? { identity: channel.identity } : {}),
    ...(channel?.affiliates?.length ? { affiliates: channel.affiliates } : {}),
  };
}
function rustConfig(config: JobConfig, channelId: string, workdir: string): string {
  const q = (value: string) => JSON.stringify(value);
  // The channel's look travels with its identity: every video of the channel shares it.
  const look = config.look ? `look = ${q(config.look)}\n` : '';
  // So do its mascot and recurring cast: TOML subtables of the channel, before [app].
  const identity = config.identity
    ? `[channels.identity]\nbody = ${q(config.identity.body)}\nshape = ${q(config.identity.shape)}\n` +
      config.identity.cast
        .map((member) => `[[channels.identity.cast]]\nname = ${q(member.name)}\nhat = ${q(member.hat)}\n`)
        .join('')
    : '';
  // Affiliate links stay with the channel too; the engine lists those the video talks about.
  const affiliates = (config.affiliates ?? [])
    .map(
      (link) =>
        `[[channels.affiliates]]\nlabel = ${q(link.label)}\nurl = ${q(link.url)}\nterms = [${link.terms.map(q).join(', ')}]\n`,
    )
    .join('');
  return `[[channels]]\nid = ${q(channelId)}\nlanguage = ${q(config.language)}\n${look}${identity}${affiliates}[app]\nworkdir = ${q(workdir)}\ndry_run = true\ntelemetry = false\n[render]\nwidth = ${config.render.width}\nheight = ${config.render.height}\nfps = ${config.render.fps}\ncrf = ${config.render.crf}\npreset = ${q(config.render.preset)}\nvideo_codec = "libx264"\n[tts]\nengine = "kokoro"\npython_path = ${q(config.tts.pythonPath!)}\nvoice_styles = ${q(config.tts.voiceStyles!)}\nvoice_model = ${q(config.tts.voiceModel)}\nvoice_name = ${q(config.tts.voiceName)}\n[asr]\nenabled = ${config.asr.enabled}\nmodel = ${q(config.asr.model)}\nlanguage = ${q(config.asr.language)}\nmin_coverage = ${config.asr.minCoverage}\n[publish]\nenabled = false\nprivacy = "private"\n`;
}
function checkScript(script: Script, previewOnly = false) {
  if (!previewOnly && !script.crossChecked)
    throw new RunnerError('Confirme o cruzamento das fontes no roteiro antes de produzir.');
  // A script without sources still produces its final version: editorial QA names the missing
  // source in the report instead of keeping the operator away from the video.
  const urls = new Set(script.sources.map((item) => item.url));
  if (
    script.scenes.length < 1 ||
    script.scenes.length > 32 ||
    script.scenes.reduce((sum, item) => sum + item.narration.length, 0) > 50_000
  )
    throw new RunnerError('Quantidade ou tamanho das cenas inválido.');
  const sceneIds = new Set<number>();
  for (const scene of script.scenes) {
    if (
      !Number.isSafeInteger(scene.id) ||
      scene.id < 0 ||
      sceneIds.has(scene.id) ||
      !scene.narration.trim() ||
      !scene.heading.trim() ||
      !scene.visualBrief.trim() ||
      !Number.isFinite(scene.durationHintSecs) ||
      scene.durationHintSecs <= 0
    )
      throw new RunnerError('Cena incompleta ou ID duplicado.');
    sceneIds.add(scene.id);
  }
  for (const item of script.sources) {
    const url = new URL(item.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !item.title.trim() ||
      !item.publisher.trim() ||
      !item.retrievedAt.trim() ||
      !item.license.trim()
    )
      throw new RunnerError('Fonte incompleta ou URL insegura.');
  }
  // The operator's declaration covers which claims they checked; the machine only refuses
  // what it can prove: a contradiction the operator flagged or a reference outside the sources.
  if (
    script.claims.some(
      (claim) =>
        claim.status === 'contradicted' ||
        !claim.text.trim() ||
        claim.sourceUrls.some((url) => !urls.has(url)),
    )
  )
    throw new RunnerError(
      'Resolva as alegações marcadas como contraditórias e use só URLs das fontes do roteiro.',
    );
}
/** Why the engine refused, in its own words: the report's failed checks or the topic gate. */
function blockedMessage(report: {
  technical_qa?: unknown;
  editorial_qa?: unknown;
  warnings?: unknown;
}): string {
  const reasons: string[] = [];
  for (const section of [report.technical_qa, report.editorial_qa]) {
    const checks = (section as { checks?: unknown } | undefined)?.checks;
    if (!Array.isArray(checks)) continue;
    for (const check of checks)
      if (check && typeof check === 'object' && (check as { status?: unknown }).status === 'fail') {
        const { name, detail } = check as { name?: unknown; detail?: unknown };
        reasons.push([name, detail].filter((part) => typeof part === 'string' && part).join(': '));
      }
  }
  if (!reasons.length && Array.isArray(report.warnings))
    reasons.push(
      ...report.warnings.filter(
        (warning): warning is string => typeof warning === 'string' && !warning.startsWith('PREVIA'),
      ),
    );
  const named = reasons.filter(Boolean).slice(0, 4).join('; ').slice(0, 500);
  return named
    ? `O motor bloqueou a entrega: ${named}.`
    : 'O motor bloqueou a entrega. Confira o relatório de QA.';
}
/** Names of the checks a human still has to look at, for the job message. */
function pendingChecks(report: { technical_qa?: unknown; editorial_qa?: unknown }): string[] {
  const names: string[] = [];
  for (const section of [report.technical_qa, report.editorial_qa]) {
    const checks = (section as { checks?: unknown } | undefined)?.checks;
    if (!Array.isArray(checks)) continue;
    for (const check of checks) {
      if (check && typeof check === 'object' && (check as { status?: unknown }).status === 'needs_human')
        names.push(
          String((check as { name?: unknown }).name ?? (check as { id?: unknown }).id ?? 'verificação'),
        );
    }
  }
  return names;
}
/**
 * The `framechester run` argv of a video: the motion engine, with only the flags it accepts.
 * The Short path has its own command (`short`).
 */
export function runArgs(
  directory: string,
  job: Pick<WebJob, 'channelId' | 'previewOnly'>,
  format: Script['format'],
) {
  const args = [
    '--config',
    join(directory, 'config.toml'),
    'run',
    '--channel',
    job.channelId,
    '--topic',
    join(directory, 'topic.json'),
    '--script',
    join(directory, 'script.json'),
    '--workdir',
    join(directory, 'output'),
    '--format',
    format,
    '--json',
  ];
  if (job.previewOnly) args.push('--preview-only');
  return args;
}

export class LocalRunner implements RunnerApi {
  private jobs: WebJob[] = [];
  private queue = Promise.resolve();
  private writes = Promise.resolve();
  private uploads = Promise.resolve();
  private controllers = new Set<AbortController>();
  private stopped = false;
  private active: AbortController | undefined;
  private readonly root: string;
  private readonly binary: string;
  constructor(private readonly options: RunnerOptions) {
    this.root = resolve(options.home, 'production');
    this.binary =
      options.binary ??
      join(
        resolve(options.repositoryRoot),
        'target',
        'release',
        process.platform === 'win32' ? 'framechester.exe' : 'framechester',
      );
  }
  async initialize() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    this.jobs = await load(join(this.root, 'jobs.json'), []);
    for (const job of this.jobs)
      if (job.status === 'running' || job.status === 'queued') {
        job.status = 'blocked';
        job.message =
          'Execução interrompida pelo encerramento do servidor. Crie um novo trabalho para retomar.';
      }
    for (const job of this.jobs) {
      // Jobs saved when only YouTube received uploads kept a single `youtube` record.
      const legacy = (job as WebJob & { youtube?: Record<string, unknown> }).youtube;
      if (legacy) {
        delete (job as WebJob & { youtube?: unknown }).youtube;
        const { videoId, ...rest } = legacy;
        job.publications = {
          youtube: (videoId === undefined ? rest : { ...rest, postId: videoId }) as Publication,
          ...job.publications,
        };
      }
      // Every video is made by the motion engine now: the scene files, switches and engine
      // choice that older runs recorded no longer mean anything.
      for (const field of ['assetIds', 'asr', 'burnSubtitles', 'engine'])
        delete (job as WebJob & Record<string, unknown>)[field];
      for (const [network, publication] of Object.entries(job.publications ?? {}))
        if (publication.status === 'uploading')
          job.publications![network as Platform] = {
            status: 'failed',
            message: 'Envio interrompido pelo encerramento do servidor. Envie novamente.',
            failedAt: new Date().toISOString(),
          };
    }
    await this.persist();
    return this;
  }
  engineStatus() {
    const available = Boolean(this.options.execute) || existsSync(this.binary);
    return {
      available,
      message: available
        ? 'Motor Rust local disponível.'
        : 'Construa o motor com npm run engine:build antes de produzir.',
    };
  }
  private async channel(channelId: string) {
    id(channelId);
    const state = await this.options.readState();
    if (!state.channels.some((channel) => channel.id === channelId))
      throw new RunnerError('Canal não cadastrado.');
    return state;
  }
  private async persist() {
    const task = this.writes.then(async () => {
      const path = join(this.root, 'jobs.json');
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(this.jobs, null, 2), { mode: 0o600 });
      await rename(temporary, path);
    });
    this.writes = task.catch(() => {});
    await task;
  }
  async list(channelId: string) {
    await this.channel(channelId);
    return structuredClone(this.jobs.filter((item) => item.channelId === channelId));
  }
  async start(channelId: string, input: StartJobInput): Promise<WebJob> {
    if (input.previewOnly !== undefined && typeof input.previewOnly !== 'boolean')
      throw new RunnerError('Opção de prévia inválida.');
    const state = await this.channel(channelId);
    if (this.stopped) throw new RunnerError('Servidor encerrando.');
    if (!this.engineStatus().available) throw new RunnerError(this.engineStatus().message, 503);
    const script = state.scripts.find((item) => item.id === input.scriptId && item.channelId === channelId);
    if (!script || script.status === 'archived') throw new RunnerError('Roteiro não encontrado neste canal.');
    checkScript(script, input.previewOnly === true);
    const config = jobConfig(state, channelId, this.options.repositoryRoot);
    const voiceError = commercialVoiceError(config.tts);
    if (voiceError) throw new RunnerError(voiceError);
    const job: WebJob = {
      id: randomUUID(),
      channelId,
      scriptId: script.id,
      status: 'queued',
      createdAt: new Date().toISOString(),
      message: 'Aguardando o motor local.',
      videoAvailable: false,
      ...(input.previewOnly ? { previewOnly: true } : {}),
    };
    this.jobs.unshift(job);
    await this.persist();
    const work = () => this.run(job, structuredClone(script), config);
    this.queue = this.queue.then(work, work);
    return structuredClone(job);
  }
  async startAutomated(
    channelId: string,
    seedScriptId: string,
    prepare: () => Promise<string>,
  ): Promise<WebJob> {
    const state = await this.channel(channelId);
    if (this.stopped) throw new RunnerError('Servidor encerrando.');
    if (!this.engineStatus().available) throw new RunnerError(this.engineStatus().message, 503);
    if (
      seedScriptId !== 'automatic' &&
      !state.scripts.some(
        (script) =>
          script.id === seedScriptId && script.channelId === channelId && script.status !== 'archived',
      )
    )
      throw new RunnerError('O roteiro de referência não pertence a este canal.');
    const config = jobConfig(state, channelId, this.options.repositoryRoot);
    const voiceError = commercialVoiceError(config.tts);
    if (voiceError) throw new RunnerError(voiceError);
    if (!this.options.execute) {
      const missing = [
        ['Python do Kokoro (pythonPath)', config.tts.pythonPath],
        ['Modelo da voz (voiceModel)', config.tts.voiceModel],
        ['Estilos das vozes (voiceStyles)', config.tts.voiceStyles],
      ]
        .filter(([, path]) => !isFile(path))
        .map(([label]) => label);
      if (missing.length)
        throw new RunnerError(
          `Arquivos do narrador não encontrados: ${missing.join(', ')}. Confira os caminhos em Configurações; caminhos relativos partem da raiz do projeto.`,
        );
    }
    const job: WebJob = {
      id: randomUUID(),
      channelId,
      scriptId: seedScriptId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      message: 'Produção com IA na fila.',
      videoAvailable: false,
      previewOnly: true,
      automated: true,
    };
    this.jobs.unshift(job);
    await this.persist();
    const work = async () => {
      if (this.stopped) return;
      try {
        job.status = 'running';
        job.startedAt = new Date().toISOString();
        job.message = 'A IA está desenvolvendo o roteiro.';
        await this.persist();
        const generatedId = await prepare();
        if (this.stopped)
          throw new RunnerError(
            'Produção interrompida pelo encerramento do servidor. O roteiro gerado foi preservado.',
          );
        const next = await this.channel(channelId),
          script = next.scripts.find(
            (script) =>
              script.id === generatedId && script.channelId === channelId && script.status !== 'archived',
          );
        if (!script) throw new RunnerError('O roteiro gerado não pertence a este canal.');
        checkScript(script, true);
        job.scriptId = script.id;
        await this.persist();
        await this.run(job, structuredClone(script), config);
      } catch (error) {
        job.status = 'failed';
        job.message =
          error instanceof RunnerError || error instanceof HttpError
            ? error.message
            : 'A produção automática não foi concluída. Confira o roteiro salvo e a configuração do assistente antes de tentar novamente.';
        job.finishedAt = new Date().toISOString();
        await this.persist();
      }
    };
    this.queue = this.queue.then(work, work);
    return structuredClone(job);
  }
  /** Runs a job with the motion engine; a preview or a final version follows `job.previewOnly`. */
  private async run(job: WebJob, script: Script, config: JobConfig) {
    if (this.stopped) return;
    const directory = join(this.root, 'jobs', id(job.channelId), id(job.id));
    this.active = new AbortController();
    const timer = setTimeout(() => this.active?.abort(), this.options.timeoutMs ?? 30 * 60 * 1000);
    try {
      job.status = 'running';
      job.startedAt ??= new Date().toISOString();
      let args: string[];
      if (job.kind === 'short') {
        // A Short re-edits the narrated storyboard of an approved video: same words, cut and
        // reframed vertically. The narration comes back from the engine's cache.
        job.message = 'Cortando o Short: abertura, fechamento e as cenas que mais prendem.';
        await this.persist();
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(
          join(directory, 'config.toml'),
          rustConfig(config, job.channelId, join(this.root, 'engine')),
          { mode: 0o600 },
        );
        args = [
          '--config',
          join(directory, 'config.toml'),
          'short',
          '--from',
          this.storyboardOf(job.channelId, job.sourceJobId!),
          '--part',
          String(job.part ?? 1),
          '--channel',
          job.channelId,
          '--workdir',
          join(directory, 'output'),
          '--json',
        ];
      } else {
        // The motion engine draws every scene from the storyboard: no scene file goes in.
        job.message = 'Motor motion: gerando a voz, animando as cenas e executando o QA local.';
        await this.persist();
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const claims = script.claims.map((item) => ({
          text: item.text,
          status: item.status,
          source_urls: item.sourceUrls,
        }));
        const sources = script.sources.map(source);
        const topic = {
          id: script.topicId,
          title: script.title,
          series: script.series,
          angle: script.hook,
          sources,
          claims,
          metrics: {
            acceleration: 0,
            demand: 0,
            alignment: 0,
            originality: 0,
            visual_feasibility: 0,
            timing: 0,
            cross_check: script.crossChecked ? 1 : 0,
          },
        };
        const authored = {
          topic_id: script.topicId,
          script: {
            title: script.title,
            hook: script.hook,
            series: script.series,
            format: script.format,
            scenes: script.scenes.map((scene) => ({
              id: scene.id,
              heading: scene.heading,
              narration: scene.narration,
              visual_brief: scene.visualBrief,
              duration_hint_secs: scene.durationHintSecs,
            })),
            sources,
            claims,
            cross_checked: script.crossChecked,
          },
        };
        await Promise.all([
          writeFile(join(directory, 'topic.json'), JSON.stringify(topic), { mode: 0o600 }),
          writeFile(join(directory, 'script.json'), JSON.stringify(authored), { mode: 0o600 }),
          writeFile(
            join(directory, 'config.toml'),
            rustConfig(config, job.channelId, join(this.root, 'engine')),
            {
              mode: 0o600,
            },
          ),
        ]);
        args = runArgs(directory, job, script.format);
      }
      const result = await (this.options.execute ?? this.execute.bind(this))(
        args,
        resolve(this.options.repositoryRoot),
        this.active.signal,
      );
      const output = join(directory, 'output', 'channels', job.channelId);
      if (!existsSync(join(output, 'pipeline_report.json'))) {
        const detail = result.stderr
          .replaceAll(this.options.home, '[dados locais]')
          .replace(/(token|secret|password|api[_-]?key)\s*[=:]\s*\S+/gi, '$1=[redigido]')
          .trim()
          .slice(0, 400);
        throw new RunnerError(
          `O motor não concluiu a entrada${detail ? ': ' + detail : '. Confira o diagnóstico e a configuração local.'}`,
        );
      }
      const report = JSON.parse(await readFile(join(output, 'pipeline_report.json'), 'utf8'));
      job.qa = {
        technical: qa(report.technical_qa?.checks),
        // A Short keeps the source's words; its editorial review is the source's approval.
        editorial: job.kind === 'short' ? 'pass' : qa(report.editorial_qa?.checks),
      };
      const video = await stat(join(output, 'render', 'final.mp4')).catch(() => undefined);
      job.videoAvailable = Boolean(video?.isFile() && video.size > 0);
      if (job.previewOnly && job.videoAvailable && ['pass', 'needs_human'].includes(job.qa.technical)) {
        job.status = 'needs_review';
        job.message =
          'Prévia gerada com marca de revisão. Assista e, se estiver bom, use Gerar versão final.';
      } else if (
        result.exitCode !== 0 ||
        report.stage === 'blocked' ||
        job.qa.technical === 'fail' ||
        job.qa.editorial === 'fail'
      ) {
        job.status = 'blocked';
        job.message = blockedMessage(report);
      } else if (!job.videoAvailable || job.qa.technical === 'skipped' || job.qa.editorial === 'skipped') {
        job.status = 'blocked';
        job.message =
          'Entrega incompleta: confira o arquivo de vídeo e os relatórios de QA antes de criar um novo trabalho.';
      } else if (job.qa.technical === 'pass' && job.qa.editorial === 'pass') {
        job.status = 'completed';
        job.message =
          job.kind === 'short'
            ? 'Short pronto: QA técnico aprovado; a revisão editorial vem do vídeo de origem.'
            : 'Vídeo aprovado: QA técnico e editorial sem pendências.';
      } else {
        const pending = pendingChecks(report);
        job.status = 'needs_review';
        job.message = `Vídeo produzido. Confira no relatório: ${pending.join('; ') || 'verificações pendentes'}.`;
      }
    } catch (error) {
      job.status = 'failed';
      job.message = error instanceof Error ? error.message.slice(0, 600) : 'Falha na produção local.';
    } finally {
      clearTimeout(timer);
      this.active = undefined;
      job.finishedAt = new Date().toISOString();
      await this.persist();
    }
    if (job.status === 'completed' && !job.previewOnly) {
      const state = await this.options.readState();
      const channel = state.channels.find((item) => item.id === job.channelId);
      const script = state.scripts.find((item) => item.id === job.scriptId);
      const vertical = job.kind === 'short' || script?.format === 'short';
      // A failed upload is recorded on the job; the operator retries from the card. A horizontal
      // video is not offered to a vertical-only network: its Short goes there instead.
      for (const network of channel?.autoUpload ?? [])
        if (canPublish(network, vertical)) await this.publish(job.channelId, job.id, network).catch(() => {});
      // A horizontal video gets its Shorts at once, so the vertical networks receive them too;
      // each Short publishes itself when it finishes. A refused split leaves the card's button.
      if (!vertical && job.kind !== 'short') await this.startShorts(job.channelId, job.id).catch(() => {});
    }
  }
  /** Narrated storyboard of a finished job, the source a Short is cut from. */
  private storyboardOf(channelId: string, jobId: string): string {
    return join(
      this.root,
      'jobs',
      id(channelId),
      id(jobId),
      'output',
      'channels',
      channelId,
      'storyboard.json',
    );
  }
  /**
   * Splits an approved final version of this channel into consecutive Shorts and queues one
   * job per part. It happens once per video: the split is recorded on the source.
   */
  async startShorts(channelId: string, sourceJobId: string): Promise<WebJob[]> {
    const state = await this.channel(channelId);
    id(sourceJobId);
    if (this.stopped) throw new RunnerError('Servidor encerrando.');
    if (!this.engineStatus().available) throw new RunnerError(this.engineStatus().message, 503);
    const source = this.jobs.find((item) => item.channelId === channelId && item.id === sourceJobId);
    if (!source) throw new RunnerError('Produção não encontrada neste canal.');
    if (source.kind === 'short') throw new RunnerError('Este vídeo já é um Short.');
    // A video from before the motion engine has no storyboard; the split names that.
    if (source.status !== 'completed' || source.previewOnly || !source.videoAvailable)
      throw new RunnerError('O Short sai de uma versão final aprovada.');
    const script = state.scripts.find((item) => item.id === source.scriptId && item.channelId === channelId);
    if (!script) throw new RunnerError('Roteiro do vídeo de origem não encontrado.');
    if (script.format === 'short')
      throw new RunnerError('Este vídeo já é vertical: ele mesmo segue como Short.');
    // Records from before the split was recorded count too: a video that has a Short had its turn.
    if (
      source.shortsAt ||
      this.jobs.some((item) => item.kind === 'short' && item.sourceJobId === sourceJobId)
    )
      throw new RunnerError('Os Shorts deste vídeo já foram gerados.');
    // Claimed before any await, so two clicks cannot split twice; released if the split fails.
    source.shortsAt = new Date().toISOString();
    let count: number;
    try {
      count = await this.countParts(channelId, sourceJobId);
      if (!this.jobs.includes(source)) throw new RunnerError('Produção não encontrada neste canal.');
    } catch (error) {
      delete source.shortsAt;
      throw error;
    }
    const config = jobConfig(state, channelId, this.options.repositoryRoot);
    const createdAt = new Date().toISOString();
    const jobs: WebJob[] = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      channelId,
      scriptId: source.scriptId,
      status: 'queued',
      createdAt,
      message: count > 1 ? `Na fila: corte do Short ${index + 1} de ${count}.` : 'Na fila: corte do Short.',
      videoAvailable: false,
      kind: 'short',
      sourceJobId,
      part: index + 1,
      parts: count,
    }));
    this.jobs.unshift(...jobs);
    await this.persist();
    for (const job of jobs) {
      const work = () => this.run(job, structuredClone(script), config);
      this.queue = this.queue.then(work, work);
    }
    return structuredClone(jobs);
  }
  /**
   * Runs a Short that stopped again, the same part of the same split. It finishes the one
   * split of the video; it never splits again.
   */
  async retryShort(channelId: string, jobId: string): Promise<WebJob> {
    const state = await this.channel(channelId);
    id(jobId);
    if (this.stopped) throw new RunnerError('Servidor encerrando.');
    if (!this.engineStatus().available) throw new RunnerError(this.engineStatus().message, 503);
    const job = this.jobs.find((item) => item.channelId === channelId && item.id === jobId);
    if (!job) throw new RunnerError('Produção não encontrada neste canal.');
    if (job.kind !== 'short') throw new RunnerError('Só um Short que parou pode ser refeito por aqui.');
    if (job.status !== 'failed' && job.status !== 'blocked')
      throw new RunnerError('Só um Short que parou pode ser refeito por aqui.');
    const script = state.scripts.find((item) => item.id === job.scriptId && item.channelId === channelId);
    if (!script) throw new RunnerError('Roteiro do vídeo de origem não encontrado.');
    // Claimed before any await, so two clicks queue it once.
    job.status = 'queued';
    job.message =
      job.parts && job.parts > 1
        ? `Na fila: corte do Short ${job.part} de ${job.parts}.`
        : 'Na fila: corte do Short.';
    job.videoAvailable = false;
    delete job.startedAt;
    delete job.finishedAt;
    delete job.qa;
    const config = jobConfig(state, channelId, this.options.repositoryRoot);
    // A report left by the stopped run must not pass for this one's.
    await rm(join(this.root, 'jobs', channelId, jobId, 'output'), { recursive: true, force: true });
    await this.persist();
    const work = () => this.run(job, structuredClone(script), config);
    this.queue = this.queue.then(work, work);
    return structuredClone(job);
  }
  /** Runs a stopped job again: a Short keeps its own part, a video repeats its run as-is. */
  async retry(channelId: string, jobId: string): Promise<WebJob> {
    await this.channel(channelId);
    id(jobId);
    const job = this.jobs.find((item) => item.channelId === channelId && item.id === jobId);
    if (!job) throw new RunnerError('Produção não encontrada neste canal.');
    return job.kind === 'short' ? this.retryShort(channelId, jobId) : this.retryVideo(channelId, jobId);
  }
  /**
   * Runs a stopped video again from its script, as a preview or a final version like its own
   * run, so the operator does not redo the production form.
   */
  async retryVideo(channelId: string, jobId: string): Promise<WebJob> {
    const state = await this.channel(channelId);
    id(jobId);
    if (this.stopped) throw new RunnerError('Servidor encerrando.');
    if (!this.engineStatus().available) throw new RunnerError(this.engineStatus().message, 503);
    const job = this.jobs.find((item) => item.channelId === channelId && item.id === jobId);
    if (!job) throw new RunnerError('Produção não encontrada neste canal.');
    if (job.kind === 'short') throw new RunnerError('Um Short que parou se refaz pelo próprio corte.');
    if (job.status !== 'failed' && job.status !== 'blocked')
      throw new RunnerError('Só um vídeo que parou pode ser tentado de novo.');
    const script = state.scripts.find((item) => item.id === job.scriptId && item.channelId === channelId);
    if (!script || script.status === 'archived')
      throw new RunnerError('Roteiro deste vídeo não encontrado neste canal.');
    // Claimed before any await, so two clicks queue it once.
    job.status = 'queued';
    job.message = job.previewOnly ? 'Na fila: prévia de novo.' : 'Na fila: versão final de novo.';
    job.videoAvailable = false;
    delete job.startedAt;
    delete job.finishedAt;
    delete job.qa;
    const config = jobConfig(state, channelId, this.options.repositoryRoot);
    // A report left by the stopped run must not pass for this one's.
    await rm(join(this.root, 'jobs', channelId, jobId, 'output'), { recursive: true, force: true });
    await this.persist();
    const work = () => this.run(job, structuredClone(script), config);
    this.queue = this.queue.then(work, work);
    return structuredClone(job);
  }
  /** Asks the engine how many Shorts the narrated storyboard splits into, without rendering. */
  private async countParts(channelId: string, sourceJobId: string): Promise<number> {
    const storyboard = this.storyboardOf(channelId, sourceJobId);
    if (!(await stat(storyboard).catch(() => undefined))?.isFile())
      throw new RunnerError('O storyboard deste vídeo não foi encontrado; gere a versão final novamente.');
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const result = await (this.options.execute ?? this.execute.bind(this))(
        ['short', '--from', storyboard, '--list', '--json'],
        resolve(this.options.repositoryRoot),
        controller.signal,
      );
      let parts: unknown;
      try {
        parts = (JSON.parse(result.stdout) as { parts?: unknown }).parts;
      } catch {
        parts = undefined;
      }
      const detail = result.stderr.replaceAll(this.options.home, '[dados locais]').trim().slice(0, 300);
      if (result.exitCode !== 0 || !Array.isArray(parts) || parts.length < 1 || parts.length > 10)
        throw new RunnerError(`Não foi possível dividir o vídeo em Shorts${detail ? ': ' + detail : '.'}`);
      return parts.length;
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
  }
  /**
   * Deletes a video that never reached a network, with its files. A video that is still being
   * made, that went out (or is going out) to a network, or that a Short was cut from stays.
   */
  async remove(channelId: string, jobId: string): Promise<void> {
    await this.channel(channelId);
    id(jobId);
    // No await between these checks and the removal: a click cannot race a new upload or cut.
    const index = this.jobs.findIndex((item) => item.channelId === channelId && item.id === jobId);
    if (index < 0) throw new RunnerError('Produção não encontrada neste canal.');
    const job = this.jobs[index];
    if (job.status === 'queued' || job.status === 'running')
      throw new RunnerError('Este vídeo ainda está sendo produzido; espere terminar para excluir.');
    if (Object.values(job.publications ?? {}).some((item) => item.status !== 'failed'))
      throw new RunnerError('Este vídeo já foi enviado a uma rede e fica no histórico.');
    if (this.jobs.some((item) => item.kind === 'short' && item.sourceJobId === jobId))
      throw new RunnerError('Este vídeo tem um Short; exclua o Short antes.');
    this.jobs.splice(index, 1);
    await this.persist();
    // The record is gone; leftover files cannot be reached anymore, so a failed cleanup is moot.
    await rm(join(this.root, 'jobs', channelId, jobId), {
      recursive: true,
      force: true,
      maxRetries: 3,
    }).catch(() => {});
  }
  /** Starts a non-public upload of an approved final version; it continues in the background. */
  async publish(channelId: string, jobId: string, platform: Platform): Promise<WebJob> {
    const state = await this.channel(channelId);
    id(jobId);
    const job = this.jobs.find((item) => item.channelId === channelId && item.id === jobId);
    if (!job) throw new RunnerError('Produção não encontrada neste canal.');
    const label = platformLabels[platform];
    if (!this.options.publish) throw new RunnerError('O envio às redes não está disponível.', 503);
    if (!publishingPlatforms.includes(platform))
      throw new RunnerError(`O ${label} não recebe envio pelo Studio.`);
    const channel = state.channels.find((item) => item.id === channelId);
    const script = state.scripts.find((item) => item.id === job.scriptId && item.channelId === channelId);
    const short = job.kind === 'short';
    const vertical = short || script?.format === 'short';
    if (!canPublish(platform, vertical))
      throw new RunnerError(`O ${label} recebe só vídeo vertical, como Reel; envie o Short deste vídeo.`);
    const video = await this.file(channelId, jobId, 'video');
    // A Short reuses the source's description; YouTube picks a Short's frame, not a thumbnail.
    const description = await this.file(channelId, short ? job.sourceJobId! : jobId, 'description');
    const thumbnail =
      platform === 'youtube' && !short ? await this.file(channelId, jobId, 'thumbnail') : undefined;
    // No await between these checks and the state change: two clicks cannot start two uploads.
    if (!this.jobs.includes(job)) throw new RunnerError('Produção não encontrada neste canal.');
    const current = job.publications?.[platform];
    if (job.status !== 'completed' || job.previewOnly || !job.videoAvailable)
      throw new RunnerError(`Só a versão final aprovada no QA pode ser enviada ao ${label}.`);
    if (current?.status === 'uploading') throw new RunnerError('O envio deste vídeo já está em andamento.');
    if (current?.status === 'uploaded') throw new RunnerError(`Este vídeo já foi enviado ao ${label}.`);
    if (!script || !video || !description)
      throw new RunnerError('Roteiro ou pacote de publicação ausente; gere a versão final novamente.');
    job.publications = {
      ...job.publications,
      [platform]: { status: 'uploading', startedAt: new Date().toISOString() },
    };
    await this.persist();
    const upload = this.options.publish;
    const profiles = this.options.profiles;
    const task = (async () => {
      let result: Publication;
      try {
        const text = await readFile(description.path, 'utf8');
        // Links only to the networks connected right now: a disconnected profile is never cited.
        const references = crossReferences(
          platform,
          (await profiles?.(channelId)) ?? [],
          channel?.language ?? 'pt-BR',
        );
        const sent = await upload(channelId, platform, {
          path: video.path,
          title:
            short && platform === 'youtube'
              ? shortTitle(partTitle(script.title, job))
              : partTitle(script.title, job),
          description: text,
          references,
          ...(short && platform === 'youtube' ? { tag: '#Shorts' } : {}),
          vertical,
          ...(thumbnail ? { thumbnail: thumbnail.path } : {}),
        });
        result = {
          status: 'uploaded',
          postId: sent.postId,
          uploadedAt: new Date().toISOString(),
          ...(sent.thumbnail ? { thumbnail: sent.thumbnail } : {}),
          ...(sent.url ? { url: sent.url } : {}),
          ...(sent.draft ? { draft: true } : {}),
        };
      } catch (error) {
        result = {
          status: 'failed',
          message: (error instanceof Error ? error.message : `Falha no envio ao ${label}.`).slice(0, 300),
          failedAt: new Date().toISOString(),
        };
      }
      job.publications = { ...job.publications, [platform]: result };
      await this.persist();
    })();
    this.uploads = this.uploads.then(() => task);
    return structuredClone(job);
  }
  private execute(args: string[], cwd: string, signal: AbortSignal): Promise<EngineResult> {
    return new Promise((accept, reject) => {
      const child = spawn(this.binary, args, {
        cwd,
        env: localEngineEnvironment(process.env),
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '',
        stderr = '',
        settled = false;
      const stop = () => {
        if (child.pid && process.platform === 'win32') {
          const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            shell: false,
            windowsHide: true,
            stdio: 'ignore',
          });
          kill.on('error', () => child.kill());
        } else if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill();
          }
        }
      };
      const abort = () => {
        stop();
        if (!settled) {
          settled = true;
          reject(new RunnerError('Produção interrompida pelo limite de tempo ou encerramento.'));
        }
      };
      signal.addEventListener('abort', abort, { once: true });
      const capture = (kind: 'stdout' | 'stderr', bytes: Buffer) => {
        if (kind === 'stdout') stdout += bytes.toString();
        else stderr += bytes.toString();
        if (stdout.length + stderr.length > 8 * 1024 * 1024) abort();
      };
      child.stdout.on('data', (bytes: Buffer) => capture('stdout', bytes));
      child.stderr.on('data', (bytes: Buffer) => capture('stderr', bytes));
      child.on('error', () => {
        signal.removeEventListener('abort', abort);
        if (!settled) {
          settled = true;
          reject(new RunnerError('Não foi possível iniciar o motor Rust local.'));
        }
      });
      child.on('close', (exitCode) => {
        signal.removeEventListener('abort', abort);
        if (!settled) {
          settled = true;
          accept({ exitCode: exitCode ?? 1, stdout, stderr });
        }
      });
      if (signal.aborted) abort();
    });
  }
  async file(channelId: string, jobId: string, file: string) {
    await this.channel(channelId);
    id(jobId);
    if (!FILES[file] || !this.jobs.some((job) => job.channelId === channelId && job.id === jobId))
      return undefined;
    const root = join(this.root, 'jobs', channelId, jobId, 'output', 'channels', channelId);
    const preview = this.jobs.find((job) => job.channelId === channelId && job.id === jobId)?.previewOnly;
    if (preview && !['video', 'report', 'subtitles'].includes(file)) return undefined;
    try {
      const path = await realpath(
        join(root, preview && file === 'subtitles' ? 'render/captions.srt' : FILES[file][0]),
      );
      const base = await realpath(root);
      const rel = relative(base, path);
      if (
        rel.startsWith(`..${sep}`) ||
        rel === '..' ||
        resolve(base, rel) !== path ||
        !(await stat(path)).isFile()
      )
        return undefined;
      return { path, contentType: FILES[file][1] };
    } catch {
      return undefined;
    }
  }
  async idle() {
    await this.queue;
    await this.uploads;
    await this.writes;
  }
  async close() {
    this.stopped = true;
    this.active?.abort();
    for (const controller of this.controllers) controller.abort();
    await this.idle();
  }
}
export async function createRunner(options: RunnerOptions) {
  return new LocalRunner(options).initialize();
}
