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
import { t, translateMessage } from '../../shared/i18n.ts';

export function platformTabs(): HTMLElement {
  return el(
    'div',
    { className: 'network-tabs', role: 'group', 'aria-label': t('Rede social') },
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
        el(
          'p',
          { className: 'field-hint' },
          connection?.accountId || t('Nenhuma conta vinculada neste canal'),
        ),
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
        connection.expiresAt
          ? t('Conexão: {connected} · Expiração: {expires}', {
              connected: date(connection.connectedAt),
              expires: date(connection.expiresAt),
            })
          : t('Conexão: {connected}', { connected: date(connection.connectedAt) }),
      ),
      el(
        'div',
        { className: 'entity-meta' },
        ...connection.scopes.map((scope) => el('span', { className: 'tag mono' }, scope)),
      ),
    );
  if (connection?.message)
    content.append(el('div', { className: 'notice' }, icon('circle'), translateMessage(connection.message)));
  if (connected)
    content.append(
      el(
        'div',
        { className: 'form-actions' },
        button(
          t('Consultar métricas'),
          () => {
            void action(
              () => request(channelPath(`/connections/${platform}/sync`), 'POST', {}),
              t('Consulta concluída. Confira os dados e seus períodos em Análises.'),
            );
          },
          'primary',
          'refresh',
        ),
        button(t('Remover vínculo local'), () => disconnectPlatform(platform), 'secondary', 'plug'),
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
      platform === 'youtube' ? t('Preparar autorização OAuth') : t('Salvar vínculo no servidor local'),
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
              throw new Error(t('Destino de autorização inesperado.'));
            replace(
              result,
              notice(
                t(
                  'Autorize a conta correta no Google. O vínculo só será confirmado após o retorno ao servidor local.',
                ),
              ),
              el(
                'p',
                { className: 'field-hint' },
                t('Autorização válida até {date}', { date: date(response.expiresAt) }),
              ),
              externalLink(t('Continuar no Google'), url.href),
            );
            toast(t('Autorização preparada. Continue pelo link do Google.'));
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
            toast(t('Vínculo salvo no servidor local. Consulte a rede para verificar seus dados.'));
          }
        } catch {
          throw new Error(
            t(
              'Não foi possível concluir a conexão. Confira o identificador, a credencial e os requisitos do provedor; o segredo foi removido do formulário.',
            ),
          );
        }
      },
    );
    fields.append(
      field(platform === 'youtube' ? t('ID do canal no YouTube') : t('ID da conta no provedor'), account),
    );
    if (platform === 'youtube') {
      clientId.required = true;
      fields.append(
        field('OAuth Client ID', clientId), // i18n-ignore: Google Cloud field name
        field('OAuth Client Secret', secret), // i18n-ignore: Google Cloud field name
        notice(
          t(
            'Use o cliente OAuth configurado para esta instalação. A autorização ocorre no Google; senhas da sua conta não são solicitadas aqui.',
          ),
        ),
      );
    } else
      fields.append(
        field(
          t('Token de acesso oficial'),
          secret,
          t('Enviado apenas ao servidor local e removido deste formulário após o envio.'),
        ),
        el(
          'div',
          { className: 'form-grid' },
          field(t('Expiração (se conhecida)'), expires),
          field(t('Escopos concedidos'), scopes, t('Separe os escopos por vírgula.')),
        ),
      );
    content.append(el('div', { className: 'divider' }), form, result);
  } else
    content.append(
      notice(
        t(
          'A capacidade desta integração não foi informada pelo servidor. Atualize o estúdio antes de configurar uma conexão.',
        ),
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
        { className: 'badge', 'data-variant': capability?.metricsAvailable ? 'secondary' : 'outline' },
        capability?.metricsAvailable ? t('Métricas disponíveis') : t('Métricas indisponíveis'),
      ),
      el(
        'span',
        { className: 'badge', 'data-variant': capability?.revenueAvailable ? 'secondary' : 'outline' },
        capability?.revenueAvailable ? t('Receita sujeita a escopo') : t('Sem receita nesta API'),
      ),
      el(
        'span',
        { className: 'badge', 'data-variant': capability?.publishingAvailable ? 'secondary' : 'outline' },
        capability?.publishingAvailable ? t('Envio privado disponível') : t('Sem envio nesta API'),
      ),
    ),
    el('div', { className: 'divider' }),
    el(
      'ul',
      { className: 'requirements' },
      ...(capability?.requirements || []).map((item) => el('li', {}, icon('circle'), translateMessage(item))),
    ),
    el(
      'p',
      { className: 'field-hint' },
      (capability?.revenueNote && translateMessage(capability.revenueNote)) ||
        t('As informações dependem das permissões e funcionalidades do provedor.'),
    ),
    capability?.docsUrl
      ? el('div', { className: 'form-actions' }, externalLink(t('Documentação oficial'), capability.docsUrl))
      : null,
  );
  return el(
    'div',
    {},
    heading(t('Contas conectadas'), t('Cada rede, com a conta e as permissões certas.')),
    platformTabs(),
    el(
      'div',
      { className: 'connection-layout' },
      panel(
        t('Conectar ao {network}', { network: labels[platform] }),
        t('Vínculo exclusivo de {channel}.', { channel: currentChannel()!.name }),
        content,
      ),
      panel(t('O que esta integração permite'), t('Capacidades informadas pelo servidor.'), requirements),
    ),
  );
}

export function disconnectPlatform(platform: Platform): void {
  const { dialog, body } = createDialog(
    t('Remover este vínculo local?'),
    `${labels[platform]} · ${currentChannel()?.name}`,
  );
  body.append(
    el(
      'p',
      { className: 'muted' },
      t(
        'A credencial deste vínculo será removida da instalação. Seus vídeos na plataforma não serão excluídos. Para consultar a rede novamente, será necessário reconectar.',
      ),
    ),
  );
  const { form } = formWithSave(
    t('Remover vínculo'),
    async () => {
      await request(channelPath(`/connections/${platform}`), 'DELETE');
      dialog.close();
      await refresh();
      toast(t('Vínculo local removido.'));
    },
    () => dialog.close(),
  );
  body.append(form);
}
