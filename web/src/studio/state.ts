import { request, setCsrfToken } from '../api.ts';
import { hasUnsavedEdits, protectEdits } from '../edit-protection.ts';
import { toast } from './toast.ts';
import type { Bootstrap, Channel, Platform, WebConfig, YoutubeDiscovery } from '../../shared/types.ts';
import type { IconName } from '../dom.ts';

export const pages = {
  overview: { title: 'Visão geral', icon: 'grid', group: 'Estúdio' },
  channels: { title: 'Canais', icon: 'channels', group: '' },
  research: { title: 'Pesquisa de nichos', icon: 'search', group: 'Conteúdo' },
  scripts: { title: 'Roteiros', icon: 'script', group: '' },
  stories: { title: 'Narrativas', icon: 'story', group: '' },
  production: { title: 'Produção', icon: 'film', group: '' },
  analytics: { title: 'Resultados', icon: 'chart', group: 'Operação' },
  connections: { title: 'Contas conectadas', icon: 'plug', group: '' },
  settings: { title: 'Configurações', icon: 'settings', group: '' },
} satisfies Record<string, { title: string; icon: IconName; group: string }>;
export type Page = keyof typeof pages;

/**
 * Mutable Studio state. Pages read it live and write through it; `render()` redraws the
 * current page from it. Nothing else holds application state.
 */
export const studio = {
  data: undefined as Bootstrap | undefined,
  channelId: new URLSearchParams(location.search).get('channel') || '',
  activePlatform: 'youtube' as Platform,
  activeScriptId: '',
  activeStoryId: '',
  draftResearchId: '',
  globalConfigScope: false,
  loading: false,
  pollTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  renderedHash: location.hash,
  discoveries: new Map<string, YoutubeDiscovery>(),
};

/** Loaded bootstrap data; pages only render after `refresh()` filled it. */
export function state(): Bootstrap {
  if (!studio.data) throw new Error('O estúdio ainda não carregou os dados.');
  return studio.data;
}

let renderer: () => void = () => {};
/** The shell registers the function that draws the current page. */
export function onRender(fn: () => void): void {
  renderer = fn;
}
export function render(): void {
  renderer();
}

export function currentPage(): Page {
  const hash = location.hash.slice(1).split('?')[0];
  return Object.hasOwn(pages, hash) ? (hash as Page) : 'overview';
}

export function go(page: Page): void {
  protectEdits(() => {
    if (currentPage() === page) render();
    else location.hash = page;
  });
}

export function currentChannel(): Channel | undefined {
  return studio.data?.channels.find((channel) => channel.id === studio.channelId);
}

export function scoped<T extends { channelId: string }>(items: T[]): T[] {
  return items.filter((item) => item.channelId === studio.channelId);
}

export function channelPath(suffix = ''): string {
  return `/api/channels/${encodeURIComponent(studio.channelId)}${suffix}`;
}

export async function refresh(): Promise<void> {
  const incoming = await request<Bootstrap>('/api/bootstrap');
  studio.data = incoming;
  setCsrfToken(incoming.csrfToken);
  if (!incoming.channels.some((channel) => channel.id === studio.channelId))
    studio.channelId = incoming.channels[0]?.id || '';
  render();
  schedulePoll();
}

export async function save(path: string, method: string, body: unknown): Promise<void> {
  await request(path, method, body);
  await refresh();
}

export async function action(operation: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await operation();
    await refresh();
    toast(message);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'A operação falhou.', true);
  }
}

export function schedulePoll(): void {
  if (studio.pollTimer) clearTimeout(studio.pollTimer);
  if (studio.data?.jobs.some((job) => job.status === 'queued' || job.status === 'running')) {
    studio.pollTimer = setTimeout(() => {
      void request<Bootstrap>('/api/bootstrap')
        .then((incoming) => {
          studio.data = incoming;
          setCsrfToken(incoming.csrfToken);
          if (
            ['overview', 'production', 'analytics'].includes(currentPage()) &&
            !document.querySelector('dialog[open]') &&
            !hasUnsavedEdits()
          )
            render();
          schedulePoll();
        })
        .catch(() => undefined);
    }, 4000);
  }
}

export function effectiveConfig(): WebConfig {
  return Object.hasOwn(state().channelConfigs, studio.channelId)
    ? state().channelConfigs[studio.channelId]
    : state().config;
}
