import { request } from '../api.ts';
import { createDialog, empty, formWithSave, heading, iconButton } from '../components.ts';
import { button, el, field, input, textarea } from '../dom.ts';
import { currentChannel, go, refresh, render, save, state, studio } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import type { Channel, Platform } from '../../shared/types.ts';
import { platformLabels, publishingPlatforms } from '../../shared/publishing.ts';
import { t } from '../../shared/i18n.ts';

export function requiredChannel(): HTMLElement | undefined {
  if (currentChannel()) return;
  return el(
    'section',
    { className: 'panel' },
    empty(
      t('Comece pelo seu canal'),
      t('Crie uma identidade local para organizar suas pautas, conteúdos, conexões e resultados.'),
      'channels',
      button(t('Adicionar canal'), () => editChannel(), 'primary', 'plus'),
    ),
  );
}

export function channelsPage(): HTMLElement {
  const channels = state().channels;
  return el(
    'div',
    {},
    heading(
      t('Canais'),
      t('Organize público, proposta editorial e contas de cada canal.'),
      button(t('Adicionar canal'), () => editChannel(), 'primary', 'plus'),
    ),
    channels.length
      ? el(
          'div',
          { className: 'entity-grid' },
          ...channels.map((channel) =>
            el(
              'article',
              { className: 'panel entity-card', 'data-testid': `channel-${channel.id}` },
              // Name and its badges on one line (proximity), same badges on every card.
              el(
                'div',
                { className: 'flex min-w-0 flex-wrap items-center gap-2 [&>h3]:mb-0 [&>h3]:min-w-0' },
                el('h3', { title: channel.name }, channel.name),
                channel.id === studio.channelId
                  ? el('span', { className: 'badge', 'data-variant': 'secondary' }, t('Selecionado'))
                  : null,
                el('span', { className: 'badge', 'data-variant': 'outline' }, channel.language),
              ),
              el('p', {}, channel.description || t('Descrição editorial ainda não definida.')),
              // Labelled facts: read, don't decode (recognition over recall).
              el(
                'dl',
                {
                  className:
                    'mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm [&>dt]:text-muted-foreground [&>dd]:break-words',
                },
                el('dt', {}, t('Nicho')),
                el('dd', {}, channel.niche || t('a definir')),
                el('dt', {}, t('Envio automático')),
                el(
                  'dd',
                  {},
                  channel.autoUpload?.length
                    ? `${channel.autoUpload.map((network) => platformLabels[network]).join(', ')} · ${t('nunca público')}`
                    : t('manual'),
                ),
                el('dt', {}, t('Identificador')),
                el('dd', { className: 'mono' }, channel.id),
              ),
              el(
                'div',
                { className: 'entity-card-bottom' },
                button(
                  t('Abrir canal'),
                  () => {
                    studio.channelId = channel.id;
                    go('create');
                  },
                  // Outlined, so its edge lines up with the text above.
                  'secondary',
                  'arrow',
                ),
                // Space between frequent and destructive actions (Fitts).
                el(
                  'div',
                  { className: 'card-actions gap-4' },
                  iconButton(t('Editar {name}', { name: channel.name }), 'edit', () => editChannel(channel)),
                  iconButton(t('Excluir {name}', { name: channel.name }), 'trash', () =>
                    deleteRecord('channels', channel.id, channel.name),
                  ),
                ),
              ),
            ),
          ),
        )
      : el(
          'div',
          { className: 'panel' },
          empty(
            t('Crie seu primeiro canal'),
            t('Defina nome, público e proposta editorial. O conteúdo e as contas ficam separados por canal.'),
            'channels',
            button(t('Criar canal'), () => editChannel(), 'primary', 'plus'),
          ),
        ),
  );
}

export function editChannel(record?: Channel): void {
  const { dialog, body } = createDialog(
    record ? t('Editar canal') : t('Criar canal'),
    t('A identidade e os arquivos deste canal ficam separados dos demais.'),
  );
  const name = input('name', record?.name || '');
  name.required = true;
  const identifier = input('id', record?.id || '');
  identifier.required = true;
  // The browser compiles pattern with the v flag, where '-' inside a class must be escaped.
  identifier.pattern = '[a-z0-9]([a-z0-9\\-]*[a-z0-9])?';
  identifier.maxLength = 64;
  identifier.disabled = Boolean(record);
  identifier.setAttribute('data-testid', 'channel-id');
  name.setAttribute('data-testid', 'channel-name');
  const description = textarea('description', record?.description || '', 3);
  const niche = input('niche', record?.niche || '');
  const audience = input('audience', record?.audience || '');
  const language = input('language', record?.language || 'pt-BR');
  language.required = true;
  const youtubeChannelId = input('youtubeChannelId', record?.youtubeChannelId || '');
  const autoUpload = publishingPlatforms.map((network) => {
    const box = input(`autoUpload-${network}`, '', 'checkbox');
    box.checked = record?.autoUpload?.includes(network) === true;
    return { network, box };
  });
  const { form, fields } = formWithSave(
    record ? t('Salvar canal') : t('Criar canal'),
    async () => {
      const id = record?.id || identifier.value.trim();
      await save(
        record ? `/api/channels/${encodeURIComponent(id)}` : '/api/channels',
        record ? 'PUT' : 'POST',
        {
          id,
          name: name.value.trim(),
          description: description.value.trim(),
          niche: niche.value.trim(),
          audience: audience.value.trim(),
          language: language.value.trim(),
          youtubeChannelId: youtubeChannelId.value.trim() || undefined,
          autoUpload: autoUpload.filter((item) => item.box.checked).map((item) => item.network),
        },
      );
      studio.channelId = id;
      dialog.close();
      render();
      toast(record ? t('Canal atualizado.') : t('Canal criado. Agora mande a pauta do primeiro vídeo.'));
    },
    () => dialog.close(),
  );
  fields.append(
    el(
      'div',
      { className: 'form-grid' },
      field(t('Nome do canal'), name),
      field(
        t('Identificador local'),
        identifier,
        t('Letras minúsculas, números e hífen no meio. Exemplo: ciencia.'),
      ),
      field(t('Nicho editorial'), niche),
      field(t('Público que você quer alcançar'), audience),
      field(t('Idioma'), language),
      field(t('ID do canal no YouTube (opcional)'), youtubeChannelId),
    ),
  );
  fields.append(field(t('Descrição e proposta editorial'), description));
  const autoUploadLabels: Record<Platform, string> = {
    youtube: t(
      'Enviar cada versão final aprovada ao YouTube como vídeo privado (exige o YouTube conectado com permissão de envio)',
    ),
    tiktok: t(
      'Enviar cada versão final aprovada ao TikTok como "Somente eu" (exige o TikTok conectado com permissão de envio)',
    ),
    facebook: t(
      'Enviar cada vídeo vertical aprovado ao Facebook como rascunho de Reel (exige a Página conectada com permissão de envio)',
    ),
    instagram: '',
  };
  fields.append(
    ...autoUpload.map(({ network, box }) =>
      el('label', { className: 'checkbox-field' }, box, autoUploadLabels[network]),
    ),
  );
  body.append(form);
}

export function deleteRecord(
  kind: 'channels' | 'research' | 'scripts' | 'stories' | 'receipts',
  id: string,
  title: string,
): void {
  const { dialog, body } = createDialog(t('Excluir este registro?'), title);
  body.append(
    el(
      'p',
      { className: 'muted' },
      kind === 'channels'
        ? t(
            'A exclusão pode ser bloqueada se o canal tiver conteúdo ou conexões vinculadas. Confira o registro antes de continuar.',
          )
        : t(
            'Este registro será removido do estado local. Arquivos de produção seguem a política do servidor.',
          ),
    ),
  );
  const { form } = formWithSave(
    t('Excluir registro'),
    async () => {
      await request(
        `/api/${kind}/${encodeURIComponent(id)}${kind === 'channels' ? '' : `?channel_id=${encodeURIComponent(studio.channelId)}`}`,
        'DELETE',
      );
      dialog.close();
      await refresh();
      toast(t('Registro excluído.'));
    },
    () => dialog.close(),
  );
  body.append(form);
}
