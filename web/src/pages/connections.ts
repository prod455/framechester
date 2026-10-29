import { request } from '../api.ts';
import { badge, createDialog, formWithSave, heading, notice, panel } from '../components.ts';
import { button, el, externalLink, field, icon, input, replace } from '../dom.ts';
import { date } from '../format.ts';
import { platforms } from '../studio/platforms.ts';
import { labels, networkMark } from '../studio/platforms.ts';
import {
  action,
  channelPath,
  currentChannel,
  refresh,
  render,
  scoped,
  state,
  studio,
} from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import { requiredChannel } from './channels.ts';
import type { Platform } from '../../shared/types.ts';

export function platformTabs(): HTMLElement {
  return el(
    'div',
    { className: 'network-tabs', role: 'group', 'aria-label': 'Rede social' },
    ...platforms.map((platform) => {
      const tab = button(labels[platform], () => {}, 'ghost');
      tab.classList.add('network-tab');
      tab.setAttribute('aria-pressed', String(studio.activePlatform === platform));
      tab.dataset.testid = `platform-${platform}`;
      tab.addEventListener('click', () => {
        studio.activePlatform = platform;
        render();
        document.querySelector<HTMLButtonElement>(`[data-testid="platform-${platform}"]`)?.focus();
      });
      return tab;
    }),
  );
}

export function connectionsPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const platform = studio.activePlatform;
  const capability = state().capabilities.find((entry) => entry.platform === platform);
  const connection = scoped(state().connections).find((entry) => entry.platform === platform);
  const connected = connection?.status === 'connected';
  const content = el(
    'div',
    { className: 'panel-body' },
    el(
      'div',
      { className: 'connection-account' },
      networkMark(platform),
      el(
        'div',
        {},
        el(
          'h3',
          { title: connection?.displayName || labels[platform] },
          connection?.displayName || labels[platform],
        ),
        el('p', { className: 'field-hint' }, connection?.accountId || 'Nenhuma conta vinculada neste canal'),
      ),
      el('span', { className: 'spacer' }),
      badge(connection?.status || 'disconnected'),
    ),
  );
  if (connection)
    content.append(
      el(
        'p',
        { className: 'field-hint' },
        `Conexão: ${date(connection.connectedAt)}${connection.expiresAt ? ` · Expiração: ${date(connection.expiresAt)}` : ''}`,
      ),
      el(
        'div',
        { className: 'entity-meta' },
        ...connection.scopes.map((scope) => el('span', { className: 'tag mono' }, scope)),
      ),
    );
  if (connection?.message)
    content.append(el('div', { className: 'notice' }, icon('circle'), connection.message));
  if (connected)
    content.append(
      el(
        'div',
        { className: 'form-actions' },
        button(
          'Consultar métricas',
          () => {
            void action(
              () => request(channelPath(`/connections/${platform}/sync`), 'POST', {}),
              'Consulta concluída. Confira os dados e seus períodos em Análises.',
            );
          },
          'primary',
          'refresh',
        ),
        button('Remover vínculo local', () => disconnectPlatform(platform), 'secondary', 'plug'),
      ),
    );
  else if (capability) {
    const account = input('accountId', connection?.accountId || currentChannel()?.youtubeChannelId || '');
    account.required = true;
    const secret = input(platform === 'youtube' ? 'clientSecret' : 'accessToken', '', 'password');
    secret.required = true;
    secret.autocomplete = 'off';
    const clientId = input('clientId');
    clientId.autocomplete = 'off';
    const expires = input('expiresAt', '', 'datetime-local');
    const scopes = input('scopes', '');
    const result = el('div');
    const { form, fields } = formWithSave(
      platform === 'youtube' ? 'Preparar autorização OAuth' : 'Salvar vínculo no servidor local',
      async () => {
        const secretValue = secret.value;
        secret.value = '';
        const clientValue = clientId.value;
        clientId.value = '';
        try {
          if (platform === 'youtube') {
            const response = await request<{ authorizationUrl: string; expiresAt: string }>(
              channelPath('/connections/youtube/oauth'),
              'POST',
              { accountId: account.value.trim(), clientId: clientValue.trim(), clientSecret: secretValue },
            );
            const url = new URL(response.authorizationUrl);
            if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com')
              throw new Error('Destino de autorização inesperado.');
            replace(
              result,
              notice(
                'Autorize a conta correta no Google. O vínculo só será confirmado após o retorno ao servidor local.',
              ),
              el('p', { className: 'field-hint' }, `Autorização válida até ${date(response.expiresAt)}`),
              externalLink('Continuar no Google', url.href),
            );
            toast('Autorização preparada. Continue pelo link do Google.');
          } else {
            await request(channelPath(`/connections/${platform}/token`), 'POST', {
              accountId: account.value.trim(),
              accessToken: secretValue,
              expiresAt: expires.value ? new Date(expires.value).toISOString() : undefined,
              scopes: scopes.value
                .split(/[,\n]/)
                .map((scope) => scope.trim())
                .filter(Boolean),
            });
            await refresh();
            toast('Vínculo salvo no servidor local. Consulte a rede para verificar seus dados.');
          }
        } catch {
          throw new Error(
            'Não foi possível concluir a conexão. Confira o identificador, a credencial e os requisitos do provedor; o segredo foi removido do formulário.',
          );
        }
      },
    );
    fields.append(
      field(platform === 'youtube' ? 'ID do canal no YouTube' : 'ID da conta no provedor', account),
    );
    if (platform === 'youtube') {
      clientId.required = true;
      fields.append(
        field('OAuth Client ID', clientId),
        field('OAuth Client Secret', secret),
        notice(
          'Use o cliente OAuth configurado para esta instalação. A autorização ocorre no Google; senhas da sua conta não são solicitadas aqui.',
        ),
      );
    } else
      fields.append(
        field(
          'Token de acesso oficial',
          secret,
          'Enviado apenas ao servidor local e removido deste formulário após o envio.',
        ),
        el(
          'div',
          { className: 'form-grid' },
          field('Expiração (se conhecida)', expires),
          field('Escopos concedidos', scopes, 'Separe os escopos por vírgula.'),
        ),
      );
    content.append(el('div', { className: 'divider' }), form, result);
  } else
    content.append(
      notice(
        'A capacidade desta integração não foi informada pelo servidor. Atualize o estúdio antes de configurar uma conexão.',
      ),
    );
  const requirements = el(
    'div',
    { className: 'panel-body' },
    el(
      'div',
      { className: 'capability-row' },
      el(
        'span',
        { className: `badge ${capability?.metricsAvailable ? 'badge-green' : ''}` },
        capability?.metricsAvailable ? 'Métricas disponíveis' : 'Métricas indisponíveis',
      ),
      el(
        'span',
        { className: `badge ${capability?.revenueAvailable ? 'badge-violet' : ''}` },
        capability?.revenueAvailable ? 'Receita sujeita a escopo' : 'Sem receita nesta API',
      ),
      el(
        'span',
        { className: 'badge' },
        capability?.publishingAvailable ? 'Publicação exige autorização' : 'Publicação não implementada',
      ),
    ),
    el('div', { className: 'divider' }),
    el(
      'ul',
      { className: 'requirements' },
      ...(capability?.requirements || []).map((item) => el('li', {}, icon('circle'), item)),
    ),
    el(
      'p',
      { className: 'field-hint' },
      capability?.revenueNote || 'As informações dependem das permissões e funcionalidades do provedor.',
    ),
    capability?.docsUrl
      ? el('div', { className: 'form-actions' }, externalLink('Documentação oficial', capability.docsUrl))
      : null,
  );
  return el(
    'div',
    {},
    heading('Contas conectadas', 'Cada rede, com a conta e as permissões certas.'),
    platformTabs(),
    el(
      'div',
      { className: 'connection-layout' },
      panel(`Conectar ao ${labels[platform]}`, `Vínculo exclusivo de ${currentChannel()!.name}.`, content),
      panel('O que esta integração permite', 'Capacidades informadas pelo servidor.', requirements),
    ),
  );
}

export function disconnectPlatform(platform: Platform): void {
  const { dialog, body } = createDialog(
    'Remover este vínculo local?',
    `${labels[platform]} · ${currentChannel()?.name}`,
  );
  body.append(
    el(
      'p',
      { className: 'muted' },
      'A credencial deste vínculo será removida da instalação. Seus vídeos na plataforma não serão excluídos. Para consultar a rede novamente, será necessário reconectar.',
    ),
  );
  const { form } = formWithSave(
    'Remover vínculo',
    async () => {
      await request(channelPath(`/connections/${platform}`), 'DELETE');
      dialog.close();
      await refresh();
      toast('Vínculo local removido.');
    },
    () => dialog.close(),
  );
  body.append(form);
}
