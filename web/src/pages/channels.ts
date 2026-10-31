import { request } from '../api.ts';
import { createDialog, empty, formWithSave, heading, iconButton } from '../components.ts';
import { button, el, field, input, textarea } from '../dom.ts';
import { currentChannel, go, refresh, render, save, state, studio } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import type { Channel } from '../../shared/types.ts';

export function requiredChannel(): HTMLElement | undefined {
  if (currentChannel()) return;
  return el(
    'section',
    { className: 'panel' },
    empty(
      'Comece pelo seu canal',
      'Crie uma identidade local para organizar suas pautas, conteúdos, conexões e resultados.',
      'channels',
      button('Adicionar canal', () => editChannel(), 'primary', 'plus'),
    ),
  );
}

export function channelsPage(): HTMLElement {
  const channels = state().channels;
  return el(
    'div',
    {},
    heading(
      'Canais',
      'Organize público, proposta editorial e contas de cada canal.',
      button('Adicionar canal', () => editChannel(), 'primary', 'plus'),
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
                  ? el('span', { className: 'badge', 'data-variant': 'secondary' }, 'Selecionado')
                  : null,
                el('span', { className: 'badge', 'data-variant': 'outline' }, channel.language),
              ),
              el('p', {}, channel.description || 'Descrição editorial ainda não definida.'),
              // Labelled facts: read, don't decode (recognition over recall).
              el(
                'dl',
                {
                  className:
                    'mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm [&>dt]:text-muted-foreground [&>dd]:break-words',
                },
                el('dt', {}, 'Nicho'),
                el('dd', {}, channel.niche || 'a definir'),
                el('dt', {}, 'Envio ao YouTube'),
                el('dd', {}, channel.youtubeAutoUpload ? 'automático, como privado' : 'manual'),
                el('dt', {}, 'Identificador'),
                el('dd', { className: 'mono' }, channel.id),
              ),
              el(
                'div',
                { className: 'entity-card-bottom' },
                button(
                  'Abrir canal',
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
                  iconButton(`Editar ${channel.name}`, 'edit', () => editChannel(channel)),
                  iconButton(`Excluir ${channel.name}`, 'trash', () =>
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
            'Crie seu primeiro canal',
            'Defina nome, público e proposta editorial. O conteúdo e as contas ficam separados por canal.',
            'channels',
            button('Criar canal', () => editChannel(), 'primary', 'plus'),
          ),
        ),
  );
}

export function editChannel(record?: Channel): void {
  const { dialog, body } = createDialog(
    record ? 'Editar canal' : 'Criar canal',
    'A identidade e os arquivos deste canal ficam separados dos demais.',
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
  const youtubeAutoUpload = input('youtubeAutoUpload', '', 'checkbox');
  youtubeAutoUpload.checked = record?.youtubeAutoUpload === true;
  const { form, fields } = formWithSave(
    record ? 'Salvar canal' : 'Criar canal',
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
          youtubeAutoUpload: youtubeAutoUpload.checked,
        },
      );
      studio.channelId = id;
      dialog.close();
      render();
      toast(record ? 'Canal atualizado.' : 'Canal criado. Agora mande a pauta do primeiro vídeo.');
    },
    () => dialog.close(),
  );
  fields.append(
    el(
      'div',
      { className: 'form-grid' },
      field('Nome do canal', name),
      field(
        'Identificador local',
        identifier,
        'Letras minúsculas, números e hífen no meio. Exemplo: ciencia.',
      ),
      field('Nicho editorial', niche),
      field('Público que você quer alcançar', audience),
      field('Idioma', language),
      field('ID do canal no YouTube (opcional)', youtubeChannelId),
    ),
  );
  fields.append(field('Descrição e proposta editorial', description));
  fields.append(
    el(
      'label',
      { className: 'checkbox-field' },
      youtubeAutoUpload,
      'Enviar cada versão final aprovada ao YouTube como vídeo privado (exige o YouTube conectado com permissão de envio)',
    ),
  );
  body.append(form);
}

export function deleteRecord(
  kind: 'channels' | 'research' | 'scripts' | 'stories' | 'receipts',
  id: string,
  title: string,
): void {
  const { dialog, body } = createDialog('Excluir este registro?', title);
  body.append(
    el(
      'p',
      { className: 'muted' },
      kind === 'channels'
        ? 'A exclusão pode ser bloqueada se o canal tiver conteúdo ou conexões vinculadas. Confira o registro antes de continuar.'
        : 'Este registro será removido do estado local. Arquivos de produção seguem a política do servidor.',
    ),
  );
  const { form } = formWithSave(
    'Excluir registro',
    async () => {
      await request(
        `/api/${kind}/${encodeURIComponent(id)}${kind === 'channels' ? '' : `?channel_id=${encodeURIComponent(studio.channelId)}`}`,
        'DELETE',
      );
      dialog.close();
      await refresh();
      toast('Registro excluído.');
    },
    () => dialog.close(),
  );
  body.append(form);
}
