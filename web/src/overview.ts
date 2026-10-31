import type { Bootstrap, Research, Script, WebJob } from '../shared/types.ts';
import { summarizeWorkflow } from '../shared/workflow.ts';
import { button, el } from './dom.ts';
import { badge, empty, heading, mediaThumbnail } from './components.ts';
import { languageTag, t, translateMessage } from '../shared/i18n.ts';

type Destination = 'channels' | 'research' | 'scripts' | 'production' | 'connections' | 'analytics';
interface OverviewActions {
  go: (page: Destination) => void;
  createResearch: () => void;
  review: (job: WebJob) => void;
  editResearch: (research: Research) => void;
  editScript: (script: Script) => void;
}

export function renderOverview(
  state: Bootstrap,
  channelId: string,
  actions: OverviewActions,
  cash: HTMLElement,
): HTMLElement {
  const channel = state.channels.find((item) => item.id === channelId);
  const { counts, next } = summarizeWorkflow(state, state.jobs, channelId);
  const jobs = state.jobs
    .filter((item) => item.channelId === channelId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviewed = jobs.find((item) => item.status === 'needs_review' && item.videoAvailable);
  const sectionHeading = (title: string, action?: HTMLElement) =>
    el('div', { className: 'section-heading' }, el('h2', {}, title), action);

  const productions = el('div', { className: 'production-list', role: 'list' });
  for (const job of jobs.slice(0, 5)) {
    const script = state.scripts.find((item) => item.channelId === channelId && item.id === job.scriptId);
    const thumbnail = mediaThumbnail(job);
    const title = button(
      script?.title || t('Vídeo deste canal'),
      () => (job.videoAvailable ? actions.review(job) : actions.go('production')),
      'ghost',
    );
    // The title gives way to the status beside it (buttons do not shrink by default).
    title.classList.add('production-title', 'shrink');
    const meta = el(
      'div',
      { className: 'production-meta' },
      el('span', {}, new Date(job.createdAt).toLocaleDateString(languageTag())),
      script ? el('span', {}, script.format === 'short' ? t('Vídeo curto') : t('Vídeo longo')) : null,
      script ? el('span', {}, t('{count} cenas', { count: script.scenes.length })) : null,
    );
    const action = button(
      job.videoAvailable ? t('Revisar') : t('Ver produção'),
      () => (job.videoAvailable ? actions.review(job) : actions.go('production')),
      'secondary',
    );
    const target = script?.title || t('vídeo');
    action.setAttribute(
      'aria-label',
      job.videoAvailable ? t('Revisar {target}', { target }) : t('Ver produção de {target}', { target }),
    );
    productions.append(
      el(
        'article',
        { className: 'production-row', role: 'listitem' },
        thumbnail,
        // The state sits with the title it describes; a separate column drifted with the
        // width of each row's button.
        el(
          'div',
          { className: 'production-copy' },
          el('div', { className: 'flex min-w-0 items-center gap-3' }, title, badge(job.status)),
          meta,
        ),
        action,
      ),
    );
  }
  if (!jobs.length)
    productions.append(
      empty(
        t('Nenhum vídeo produzido'),
        t('Comece por uma pauta ou continue um roteiro salvo.'),
        'film',
        button(t('Ver roteiros'), () => actions.go('scripts'), 'secondary'),
      ),
    );

  const drafts = el('div', { className: 'draft-list' });
  const scripts = state.scripts
    .filter((item) => item.channelId === channelId && item.status !== 'archived')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const research = state.research
    .filter((item) => item.channelId === channelId && item.status !== 'archived')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const script of scripts.slice(0, 3)) {
    const row = button('', () => actions.editScript(script), 'ghost');
    row.classList.add('draft-row');
    row.append(
      el(
        'span',
        {},
        el('span', { className: 'draft-kind' }, t('Roteiro')),
        el('strong', { title: script.title }, script.title),
      ),
      badge(script.status),
    );
    drafts.append(row);
  }
  for (const item of research.slice(0, 3)) {
    const row = button('', () => actions.editResearch(item), 'ghost');
    row.classList.add('draft-row');
    row.append(
      el(
        'span',
        {},
        el('span', { className: 'draft-kind' }, t('Pesquisa')),
        el('strong', { title: item.title }, item.title),
      ),
      badge(item.status),
    );
    drafts.append(row);
  }
  if (!scripts.length && !research.length)
    drafts.append(
      el('p', { className: 'muted' }, t('Suas pautas e roteiros vão aparecer aqui.')),
      button(t('Criar pauta'), actions.createResearch, 'ghost'),
    );

  const accounts = el('div', { className: 'account-list' });
  for (const [platform, label] of [
    ['youtube', 'YouTube'],
    ['tiktok', 'TikTok'],
    ['instagram', 'Instagram'],
    ['facebook', 'Facebook'],
  ] as const) {
    const connection = state.connections.find(
      (item) => item.channelId === channelId && item.platform === platform,
    );
    accounts.append(
      el(
        'div',
        { className: 'account-row' },
        el('span', {}, label),
        connection ? badge(connection.status) : el('span', { className: 'field-hint' }, t('Não conectado')),
      ),
    );
  }
  const nextAction = reviewed
    ? el(
        'div',
        { className: 'review-line' },
        el(
          'span',
          {},
          counts.review === 1
            ? t('{count} vídeo aguarda sua revisão.', { count: counts.review })
            : t('{count} vídeos aguardam sua revisão.', { count: counts.review }),
        ),
        button(t('Revisar agora'), () => actions.review(reviewed), 'ghost'),
      )
    : !jobs.length
      ? el(
          'div',
          { className: 'review-line' },
          el('span', {}, translateMessage(next.description)),
          button(translateMessage(next.action), () => actions.go(next.page), 'ghost'),
        )
      : null;
  const finance = el(
    'details',
    { className: 'overview-finance' },
    el('summary', {}, t('Recebimentos e custos')),
    cash,
  );
  return el(
    'div',
    { className: 'overview' },
    heading(
      t('Visão geral'),
      channel?.niche || '',
      button(t('Nova pauta'), actions.createResearch, 'primary', 'plus'),
    ),
    nextAction,
    el(
      'section',
      { className: 'content-section' },
      sectionHeading(
        t('Produções'),
        button(t('Ver fila'), () => actions.go('production'), 'ghost'),
      ),
      productions,
    ),
    el(
      'div',
      { className: 'overview-secondary' },
      el('section', {}, sectionHeading(t('Em desenvolvimento')), drafts),
      el(
        'section',
        {},
        sectionHeading(
          t('Contas'),
          button(t('Gerenciar'), () => actions.go('connections'), 'ghost'),
        ),
        accounts,
      ),
    ),
    finance,
  );
}
