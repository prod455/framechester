import type { Bootstrap, Script, WebJob } from '../shared/types.ts';
import { button, el } from './dom.ts';
import { empty } from './components.ts';

export type StepState = 'done' | 'current' | 'waiting' | 'stopped';
export interface Step {
  key: 'topic' | 'generate' | 'review' | 'publish';
  title: string;
  state: StepState;
  detail: string;
}
export interface VideoProgress {
  job?: WebJob;
  script?: Script;
  youtubeConnected: boolean;
  steps: Step[];
}

/**
 * Where the channel's latest video stands in the four steps an operator cares about:
 * topic, generation, review and sending. Everything else in the Studio is optional detail.
 */
export function videoProgress(state: Bootstrap, channelId: string): VideoProgress {
  const job = state.jobs
    .filter((item) => item.channelId === channelId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const script =
    job && state.scripts.find((item) => item.id === job.scriptId && item.channelId === channelId);
  const youtubeConnected = state.connections.some(
    (item) => item.channelId === channelId && item.platform === 'youtube' && item.status === 'connected',
  );
  const final = job && !job.previewOnly && job.status === 'completed' && job.videoAvailable;
  const topic: Step = {
    key: 'topic',
    title: 'Pauta',
    state: job ? 'done' : 'current',
    detail: job
      ? script?.title || 'Pauta registrada'
      : 'Diga sobre o que é o vídeo. A IA escreve o roteiro e o motor monta as cenas.',
  };
  const generate: Step = !job
    ? {
        key: 'generate',
        title: 'Gerar vídeo',
        state: 'waiting',
        detail: 'Começa quando a pauta for enviada.',
      }
    : job.status === 'queued' || job.status === 'running'
      ? { key: 'generate', title: 'Gerar vídeo', state: 'current', detail: job.message }
      : job.status === 'failed' || (job.status === 'blocked' && !job.videoAvailable)
        ? { key: 'generate', title: 'Gerar vídeo', state: 'stopped', detail: job.message }
        : {
            key: 'generate',
            title: 'Gerar vídeo',
            state: 'done',
            detail: 'Vídeo montado e conferido pelo QA.',
          };
  const review: Step =
    !job?.videoAvailable || generate.state !== 'done'
      ? { key: 'review', title: 'Revisar', state: 'waiting', detail: 'Assista quando o vídeo ficar pronto.' }
      : job.previewOnly
        ? {
            key: 'review',
            title: 'Revisar',
            state: 'current',
            detail: 'Assista à prévia. Se estiver bom, gere a versão final.',
          }
        : final
          ? { key: 'review', title: 'Revisar', state: 'done', detail: 'Versão final aprovada no QA.' }
          : { key: 'review', title: 'Revisar', state: 'current', detail: job.message };
  const youtube = job?.youtube;
  const publish: Step = !final
    ? {
        key: 'publish',
        title: 'Enviar ao YouTube',
        state: 'waiting',
        detail: 'Disponível para a versão final aprovada.',
      }
    : youtube?.status === 'uploaded'
      ? {
          key: 'publish',
          title: 'Enviar ao YouTube',
          state: 'done',
          detail: 'Enviado como privado. Publique pelo YouTube Studio.',
        }
      : youtube?.status === 'uploading'
        ? { key: 'publish', title: 'Enviar ao YouTube', state: 'current', detail: 'Enviando como privado…' }
        : youtube?.status === 'failed'
          ? { key: 'publish', title: 'Enviar ao YouTube', state: 'stopped', detail: youtube.message }
          : {
              key: 'publish',
              title: 'Enviar ao YouTube',
              state: 'current',
              detail: youtubeConnected
                ? 'Envie como vídeo privado e publique quando quiser.'
                : 'Conecte o YouTube deste canal para enviar.',
            };
  return { job, script, youtubeConnected, steps: [topic, generate, review, publish] };
}

export interface CreateActions {
  createChannel: () => void;
  newVideo: () => void;
  watch: (job: WebJob) => void;
  finalVersion: (script: Script) => void;
  connectYoutube: () => void;
  retry: (script: Script) => void;
  sendButton: (job: WebJob) => HTMLElement | null;
  youtubeStatus: (job: WebJob) => HTMLElement | null;
  allVideos: () => void;
}

const stateVariants: Record<StepState, string> = {
  done: 'secondary',
  current: 'default',
  waiting: 'outline',
  stopped: 'destructive',
};
const stateLabels: Record<StepState, string> = {
  done: 'Feito',
  current: 'Agora',
  waiting: 'Depois',
  stopped: 'Parou',
};

export function renderCreate(state: Bootstrap, channelId: string, actions: CreateActions): HTMLElement {
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel)
    return el(
      'section',
      { className: 'create-flow' },
      empty(
        'Crie seu canal para começar',
        'Um canal guarda o nome, o público e as contas conectadas. Depois disso, é só mandar a pauta.',
        'channels',
        button('Criar canal', actions.createChannel, 'primary', 'plus'),
      ),
    );
  const progress = videoProgress(state, channelId);
  const { job } = progress;
  const done = progress.steps.filter((step) => step.state === 'done').length;
  // How far this video is (goal-gradient): the bar fills as steps finish.
  const meter = el(
    'div',
    { className: 'create-meter' },
    el('progress', { max: '4', value: String(done), 'aria-label': 'Passos concluídos' }),
    el(
      'span',
      { role: 'status' },
      done === 4 ? 'Vídeo enviado. Falta só publicar no YouTube Studio.' : `${done} de 4 passos`,
    ),
  );
  const list = el('ol', { className: 'create-steps' });
  for (const [index, step] of progress.steps.entries()) {
    const action = stepAction(step, progress, actions);
    list.append(
      el(
        'li',
        { className: 'create-step', 'data-state': step.state, 'data-testid': `step-${step.key}` },
        el('span', { className: 'create-step-number', 'aria-hidden': 'true' }, String(index + 1)),
        el(
          'div',
          { className: 'create-step-copy' },
          el(
            'h3',
            {},
            step.title,
            el(
              'span',
              { className: 'badge', 'data-variant': stateVariants[step.state] },
              stateLabels[step.state],
            ),
          ),
          el('p', {}, step.detail),
          step.key === 'generate' && step.state === 'current' && job ? working(job) : null,
          step.key === 'publish' && job ? actions.youtubeStatus(job) : null,
        ),
        action ? el('div', { className: 'create-step-action' }, action) : null,
      ),
    );
  }
  return el(
    'section',
    { className: 'create-flow' },
    el(
      'header',
      { className: 'create-header' },
      el('h1', {}, 'Criar vídeo'),
      el('p', {}, `Canal ${channel.name}: pauta, vídeo, revisão e envio, nesta ordem.`),
    ),
    meter,
    list,
    el(
      'p',
      { className: 'create-footer' },
      button('Ver todos os vídeos', actions.allVideos, 'ghost', 'film'),
    ),
  );
}

/** Visible work while the engine runs (Doherty): an indeterminate bar and elapsed minutes. */
function working(job: WebJob): HTMLElement {
  const started = Date.parse(job.startedAt ?? job.createdAt);
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  return el(
    'div',
    { className: 'create-working' },
    el('progress', { 'aria-label': 'Gerando vídeo' }),
    el('span', {}, minutes < 1 ? 'começou agora' : `há ${minutes} min`),
  );
}

function stepAction(step: Step, progress: VideoProgress, actions: CreateActions): HTMLElement | null {
  const { job, script } = progress;
  switch (step.key) {
    case 'topic':
      return button(
        step.state === 'done' ? 'Começar outro vídeo' : 'Novo vídeo',
        actions.newVideo,
        step.state === 'done' ? 'secondary' : 'primary',
        'spark',
      );
    case 'generate':
      // A stop ends with a way forward, not only a log (peak-end rule).
      return step.state === 'stopped'
        ? el(
            'div',
            { className: 'create-step-buttons' },
            script ? button('Tentar de novo', () => actions.retry(script), 'primary', 'refresh') : null,
            button('Ver diagnóstico', actions.allVideos, 'secondary'),
          )
        : null;
    case 'review':
      if (step.state === 'waiting' || !job) return null;
      return el(
        'div',
        { className: 'create-step-buttons' },
        button('Assistir', () => actions.watch(job), job.previewOnly ? 'secondary' : 'primary', 'film'),
        job.previewOnly && script
          ? button('Gerar versão final', () => actions.finalVersion(script), 'primary', 'check')
          : null,
      );
    case 'publish':
      if (step.state === 'waiting' || step.state === 'done' || !job) return null;
      if (!progress.youtubeConnected)
        return button('Conectar YouTube', actions.connectYoutube, 'primary', 'plug');
      return actions.sendButton(job);
  }
}
