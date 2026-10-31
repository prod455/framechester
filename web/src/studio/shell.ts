import { request, setCsrfToken } from '../api.ts';
import { empty, formWithSave, iconButton } from '../components.ts';
import { clearCreativeDrafts } from '../creative-ui.ts';
import { button, el, field, icon, input, replace, select } from '../dom.ts';
import { hasUnsavedEdits, protectEdits } from '../edit-protection.ts';
import { renderers } from '../pages/index.ts';
import { action, currentPage, go, onRender, pages, refresh, studio } from './state.ts';
import { toast } from './toast.ts';
import type { AuthStatus } from '../../shared/types.ts';
import type { Page } from './state.ts';

const root = document.querySelector<HTMLDivElement>('#app')!;

export async function start(): Promise<void> {
  studio.loading = true;
  try {
    const status = await request<AuthStatus>('/api/auth/status');
    setCsrfToken(status.csrfToken || '');
    if (status.authenticated) await refresh();
    else renderAuth(status.configured);
  } catch (error) {
    replace(
      root,
      el(
        'main',
        { className: 'initial-loading' },
        empty(
          'O estúdio ainda não respondeu',
          error instanceof Error ? error.message : 'Verifique o servidor local.',
          'plug',
          button(
            'Tentar novamente',
            () => {
              void start();
            },
            'primary',
            'refresh',
          ),
        ),
      ),
    );
  } finally {
    studio.loading = false;
  }
}

export function renderAuth(configured: boolean): void {
  studio.data = undefined;
  clearCreativeDrafts();
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((dialog) => dialog.close());
  if (studio.pollTimer) clearTimeout(studio.pollTimer);
  const password = input('password', '', 'password');
  password.required = true;
  password.minLength = configured ? 1 : 12;
  password.autocomplete = configured ? 'current-password' : 'new-password';
  password.setAttribute('data-testid', 'auth-password');
  const confirmation = input('confirmation', '', 'password');
  confirmation.autocomplete = 'new-password';
  confirmation.required = !configured;
  const { form, fields } = formWithSave(configured ? 'Entrar no estúdio' : 'Criar acesso local', async () => {
    if (!configured && password.value !== confirmation.value)
      throw new Error('As senhas precisam ser iguais.');
    const secret = password.value;
    password.value = '';
    confirmation.value = '';
    const status = await request<AuthStatus>(`/api/auth/${configured ? 'login' : 'setup'}`, 'POST', {
      password: secret,
    });
    setCsrfToken(status.csrfToken || '');
    await refresh();
  });
  fields.append(field('Sua senha local', password, configured ? undefined : 'Use pelo menos 12 caracteres.'));
  if (!configured) fields.append(field('Confirme a senha', confirmation));
  const authBox = el(
    'section',
    { className: 'auth-box' },
    el('h1', {}, configured ? 'Entrar no Framechester' : 'Configurar acesso local'),
    el(
      'p',
      {},
      configured
        ? 'Use a senha desta instalação.'
        : 'Defina uma senha para proteger seus canais neste computador.',
    ),
    form,
    el('p', { className: 'auth-privacy' }, 'As credenciais das redes sociais ficam no cofre local.'),
  );
  replace(
    root,
    el(
      'main',
      { className: 'auth-layout' },
      el('header', { className: 'auth-brand' }, brand()),
      el('div', { className: 'auth-main' }, authBox),
      el('footer', { className: 'auth-footer' }, 'Somente neste computador'),
    ),
  );
  document.title = 'Acesso local · Framechester';
}

export function brand(): HTMLElement {
  return el(
    'div',
    { className: 'brand' },
    icon('film'),
    el('span', { className: 'brand-name' }, 'Framechester'),
  );
}

function render(): void {
  if (!studio.data) return;
  const page = currentPage();
  document.title = `${pages[page].title} · Framechester`;
  const nav = el('nav', { className: 'nav', 'aria-label': 'Navegação principal' });
  // Everything beyond making a video is one click away, collapsed unless you are there.
  const advanced = el(
    'details',
    { className: 'group' },
    el(
      'summary',
      {
        className:
          'nav-group-label flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden',
      },
      icon('chevron'),
      'Avançado',
    ),
  );
  advanced.open = pages[page].advanced;
  for (const [key, item] of Object.entries(pages)) {
    const link = el(
      'a',
      {
        href: `#${key}`,
        className: 'nav-item',
        'data-testid': `nav-${key}`,
        'aria-current': key === page ? 'page' : undefined,
      },
      icon(item.icon),
      item.title,
    );
    link.addEventListener('click', (event) => {
      event.preventDefault();
      go(key as Page);
      sidebar.classList.remove('open');
      mobile.setAttribute('aria-expanded', 'false');
    });
    (item.advanced ? advanced : nav).append(link);
  }
  nav.append(advanced);
  const sidebar = el(
    'aside',
    { className: 'studio-sidebar' },
    brand(),
    nav,
    el(
      'div',
      { className: 'studio-sidebar-bottom' },
      el('span', { className: 'field-hint' }, 'Execução local'),
      button(
        'Sair',
        () => {
          protectEdits(() => {
            void request('/api/auth/logout', 'POST', {})
              .then(async () => {
                setCsrfToken('');
                await start();
                toast('Sessão encerrada.');
              })
              .catch(() => toast('Não foi possível encerrar a sessão.', true));
          });
        },
        'ghost',
        'logout',
      ),
    ),
  );
  const picker = select(
    'channel',
    studio.data.channels.length
      ? studio.data.channels.map((channel) => [channel.id, channel.name])
      : [['', 'Nenhum canal criado']],
    studio.channelId,
  );
  picker.setAttribute('aria-label', 'Canal selecionado');
  picker.setAttribute('data-testid', 'channel-select');
  picker.addEventListener('change', () => {
    const selected = picker.value;
    picker.value = studio.channelId;
    protectEdits(() => {
      studio.channelId = selected;
      studio.activeScriptId = '';
      studio.activeStoryId = '';
      const url = new URL(location.href);
      url.searchParams.set('channel', studio.channelId);
      history.replaceState(null, '', url);
      render();
    });
  });
  const mobile = iconButton('Abrir menu', 'menu', () => {
    const opened = sidebar.classList.toggle('open');
    mobile.setAttribute('aria-expanded', String(opened));
    if (opened) sidebar.querySelector<HTMLAnchorElement>('a[aria-current="page"]')?.focus();
  });
  mobile.classList.add('mobile-menu');
  sidebar.id = 'primary-navigation';
  mobile.setAttribute('aria-controls', sidebar.id);
  mobile.setAttribute('aria-expanded', 'false');
  const engine = studio.data.engine;
  const topbar = el(
    'header',
    { className: 'topbar' },
    mobile,
    el('label', { className: 'channel-picker' }, el('span', {}, 'Canal'), picker),
    el('div', { className: 'spacer' }),
    engine?.available === false ? el('span', { className: 'field-hint' }, 'Produção indisponível') : null,
    iconButton('Atualizar dados do estúdio', 'refresh', () =>
      protectEdits(() => {
        void action(async () => undefined, 'Dados atualizados.');
      }),
    ),
  );
  const content = el('main', { className: 'content', id: 'main-content', tabindex: '-1' });
  content.append(renderers[page]());
  const skip = el('a', { href: '#main-content', className: 'skip-link' }, 'Ir para o conteúdo');
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    content.focus();
  });
  const shell = el(
    'div',
    { className: 'shell' },
    sidebar,
    el('div', { className: 'workspace' }, topbar, content),
  );
  shell.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      mobile.setAttribute('aria-expanded', 'false');
      mobile.focus();
    }
  });
  replace(root, skip, shell);
  studio.renderedHash = location.hash;
}

window.addEventListener('hashchange', () => {
  if (!studio.data || location.hash === '#main-content') return;
  const target = location.hash;
  if (hasUnsavedEdits()) {
    const url = new URL(location.href);
    url.hash = studio.renderedHash;
    history.replaceState(null, '', url);
    protectEdits(() => {
      url.hash = target;
      history.replaceState(null, '', url);
      render();
      window.scrollTo(0, 0);
      document.getElementById('main-content')?.focus({ preventScroll: true });
    });
    return;
  }
  render();
  window.scrollTo(0, 0);
  document.getElementById('main-content')?.focus({ preventScroll: true });
});

window.addEventListener('session-expired', () => {
  if (!studio.loading) {
    toast('Sua sessão terminou. Entre novamente para continuar.', true);
    void start();
  }
});

onRender(render);
