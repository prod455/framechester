import type { Bootstrap, Script, WebJob } from '../shared/types.ts';
import { t, translateMessage } from '../shared/i18n.ts';
import { button, el } from './dom.ts';
import { empty, heading } from './components.ts';

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
    title: t('Pauta'),
    state: job ? 'done' : 'current',
    detail: job
      ? script?.title || t('Pauta registrada')
      : t('Diga sobre o que é o vídeo. A IA escreve o roteiro e o motor monta as cenas.'),
  };
  const generate: Step = !job
    ? {
        key: 'generate',
        title: t('Gerar vídeo'),
        state: 'waiting',
        detail: t('Começa quando a pauta for enviada.'),
      }
    : job.status === 'queued' || job.status === 'running'
      ? { key: 'generate', title: t('Gerar vídeo'), state: 'current', detail: translateMessage(job.message) }
      : job.status === 'failed' || (job.status === 'blocked' && !job.videoAvailable)
        ? {
            key: 'generate',
            title: t('Gerar vídeo'),
            state: 'stopped',
            detail: translateMessage(job.message),
          }
        : {
            key: 'generate',
            title: t('Gerar vídeo'),
            state: 'done',
            detail: t('Vídeo montado e conferido pelo QA.'),
          };
  const review: Step =
    !job?.videoAvailable || generate.state !== 'done'
      ? {
          key: 'review',
          title: t('Revisar'),
          state: 'waiting',
          detail: t('Assista quando o vídeo ficar pronto.'),
        }
      : job.previewOnly
        ? {
            key: 'review',
            title: t('Revisar'),
            state: 'current',
            detail: t('Assista à prévia. Se estiver bom, gere a versão final.'),
          }
        : final
          ? { key: 'review', title: t('Revisar'), state: 'done', detail: t('Versão final aprovada no QA.') }
          : { key: 'review', title: t('Revisar'), state: 'current', detail: translateMessage(job.message) };
  const youtube = job?.youtube;
  const publish: Step = !final
    ? {
        key: 'publish',
        title: t('Enviar ao YouTube'),
        state: 'waiting',
        detail: t('Disponível para a versão final aprovada.'),
      }
    : youtube?.status === 'uploaded'
      ? {
          key: 'publish',
          title: t('Enviar ao YouTube'),
          state: 'done',
          detail: t('Enviado como privado. Publique pelo YouTube Studio.'),
        }
      : youtube?.status === 'uploading'
        ? {
            key: 'publish',
            title: t('Enviar ao YouTube'),
            state: 'current',
            detail: t('Enviando como privado…'),
          }
        : youtube?.status === 'failed'
          ? {
              key: 'publish',
              title: t('Enviar ao YouTube'),
              state: 'stopped',
              detail: translateMessage(youtube.message),
            }
          : {
              key: 'publish',
              title: t('Enviar ao YouTube'),
              state: 'current',
              detail: youtubeConnected
                ? t('Envie como vídeo privado e publique quando quiser.')
                : t('Conecte o YouTube deste canal para enviar.'),
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
  shortButton: (job: WebJob) => HTMLElement | null;
  youtubeStatus: (job: WebJob) => HTMLElement | null;
  allVideos: () => void;
}

// Basecoat badge variants; "primary" is the default look.
const stateVariants: Record<StepState, string> = {
  done: 'secondary',
  current: 'primary',
  waiting: 'outline',
  stopped: 'destructive',
};
const stateLabels: Record<StepState, string> = {
  done: t('Feito'),
  current: t('Agora'),
  waiting: t('Depois'),
  stopped: t('Parou'),
};
// Static class names so Tailwind generates them (no inline styles under the CSP).
const meterWidths = ['w-0', 'w-1/4', 'w-1/2', 'w-3/4', 'w-full'];

export function renderCreate(state: Bootstrap, channelId: string, actions: CreateActions): HTMLElement {
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel)
    return empty(
      t('Crie seu canal para começar'),
      t('Um canal guarda o nome, o público e as contas conectadas. Depois disso, é só mandar a pauta.'),
      'channels',
      button(t('Criar canal'), actions.createChannel, 'primary', 'plus'),
    );
  const progress = videoProgress(state, channelId);
  const { job } = progress;
  const done = progress.steps.filter((step) => step.state === 'done').length;
  // How far this video is (goal-gradient): the bar fills as steps finish.
  const meter = el(
    'div',
    { className: 'flex items-center gap-3' },
    el(
      'div',
      {
        className: 'progress max-w-xs flex-1',
        role: 'progressbar',
        'aria-label': t('Passos concluídos'),
        'aria-valuemin': '0',
        'aria-valuemax': '4',
        'aria-valuenow': String(done),
      },
      el('span', { className: meterWidths[done] }),
    ),
    el(
      'span',
      { className: 'shrink-0 text-sm whitespace-nowrap text-muted-foreground', role: 'status' },
      done === 4
        ? t('Vídeo enviado. Falta só publicar no YouTube Studio.')
        : t('{done} de 4 passos', { done }),
    ),
  );
  const list = el('ol', { className: 'item-group' });
  for (const [index, step] of progress.steps.entries()) {
    const action = stepAction(step, progress, actions);
    list.append(
      el(
        'li',
        {
          className: `item${step.state === 'stopped' ? ' border-destructive/60' : ''}`,
          // Waiting steps recede by surface, not opacity, so text keeps AA contrast.
          'data-variant': step.state === 'waiting' ? 'muted' : 'outline',
          'data-state': step.state,
          'data-testid': `step-${step.key}`,
        },
        el(
          'figure',
          { 'aria-hidden': 'true' },
          el(
            'span',
            {
              className: `flex size-8 items-center justify-center rounded-full text-sm font-semibold ${
                step.state === 'done' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground' // i18n-ignore: class names
              }`,
            },
            String(index + 1),
          ),
        ),
        el(
          'section',
          { className: 'min-w-0' },
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
        // On narrow screens the actions take their own row under the text, aligned with it.
        action
          ? el('aside', { className: 'flex-wrap max-sm:basis-full max-sm:ps-[2.875rem]' }, action)
          : null,
      ),
    );
  }
  // The page heading keeps its own bottom margin; the body below has one rhythm (gap-4).
  return el(
    'div',
    { className: 'mx-auto max-w-3xl' },
    heading(
      t('Criar vídeo'),
      t('Canal {channel}: pauta, vídeo, revisão e envio, nesta ordem.', { channel: channel.name }),
      button(t('Ver todos os vídeos'), actions.allVideos, 'secondary', 'film'),
    ),
    el('div', { className: 'grid gap-4' }, meter, list),
  );
}

/** Visible work while the engine runs (Doherty): a pulsing bar and elapsed minutes. */
function working(job: WebJob): HTMLElement {
  const started = Date.parse(job.startedAt ?? job.createdAt);
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  return el(
    'div',
    { className: 'mt-1 flex items-center gap-3 text-sm text-muted-foreground' },
    el(
      'div',
      { className: 'progress w-40', role: 'progressbar', 'aria-label': t('Gerando vídeo') },
      el('span', { className: 'w-1/3 animate-pulse' }),
    ),
    el('span', {}, minutes < 1 ? t('começou agora') : t('há {minutes} min', { minutes })),
  );
}

function stepAction(step: Step, progress: VideoProgress, actions: CreateActions): HTMLElement | null {
  const { job, script } = progress;
  switch (step.key) {
    case 'topic':
      return button(
        step.state === 'done' ? t('Começar outro vídeo') : t('Novo vídeo'),
        actions.newVideo,
        step.state === 'done' ? 'secondary' : 'primary',
        'spark',
      );
    case 'generate':
      // A stop ends with a way forward, not only a log (peak-end rule).
      return step.state === 'stopped'
        ? el(
            'div',
            { className: 'flex flex-wrap gap-2' },
            script ? button(t('Tentar de novo'), () => actions.retry(script), 'primary', 'refresh') : null,
            button(t('Ver diagnóstico'), actions.allVideos, 'secondary'),
          )
        : null;
    case 'review':
      if (step.state === 'waiting' || !job) return null;
      return el(
        'div',
        { className: 'flex flex-wrap gap-2' },
        button(t('Assistir'), () => actions.watch(job), job.previewOnly ? 'secondary' : 'primary', 'film'),
        job.previewOnly && script
          ? button(t('Gerar versão final'), () => actions.finalVersion(script), 'primary', 'check')
          : null,
      );
    case 'publish':
      // Once sent, the next useful thing is a Short of the same video.
      if (step.state === 'done' && job) return actions.shortButton(job);
      if (step.state === 'waiting' || !job) return null;
      if (!progress.youtubeConnected)
        return button(t('Conectar YouTube'), actions.connectYoutube, 'primary', 'plug');
      return actions.sendButton(job);
  }
}
