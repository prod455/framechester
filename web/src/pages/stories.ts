import { request } from '../api.ts';
import { editorWorkspace, empty, formWithSave, heading } from '../components.ts';
import { button, el, field, input, select, textarea } from '../dom.ts';
import { protectEdits } from '../edit-protection.ts';
import { creativeEditorButton, documentPicker } from '../editors/common.ts';
import { refresh, render, scoped, state, studio } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import { editorTabs } from '../ui-tabs.ts';
import { deleteRecord, requiredChannel } from './channels.ts';
import { t } from '../../shared/i18n.ts';
import type { StoryCreativeValues } from '../../shared/creative-types.ts';
import type { Story } from '../../shared/types.ts';

export function storiesPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const records = scoped(state().stories);
  if (studio.activeStoryId !== '__new__' && !records.some((entry) => entry.id === studio.activeStoryId))
    studio.activeStoryId = records[0]?.id || '';
  const record = records.find((entry) => entry.id === studio.activeStoryId);
  const newStory = () =>
    protectEdits(() => {
      studio.activeStoryId = '__new__';
      render();
    });
  const list = el(
    'aside',
    { className: 'panel editor-list', 'aria-label': t('Histórias deste canal') },
    ...records.map((entry) => {
      const node = el(
        'button',
        {
          type: 'button',
          className: `editor-list-item ${entry.id === studio.activeStoryId ? 'active' : ''}`,
        },
        el('span', { className: 'editor-list-title', title: entry.title }, entry.title),
        el(
          'span',
          { className: 'editor-list-caption' },
          entry.scriptId ? t('Vinculado a um roteiro') : t('Arco em desenvolvimento'),
        ),
      );
      node.addEventListener('click', () =>
        protectEdits(() => {
          studio.activeStoryId = entry.id;
          render();
        }),
      );
      return node;
    }),
  );
  const editor =
    record || studio.activeStoryId === '__new__'
      ? storyForm(record)
      : el(
          'section',
          { className: 'panel' },
          empty(
            t('Nenhuma narrativa neste canal'),
            t('Desenvolva a progressão da informação antes de preencher o vídeo de cenas.'),
            'story',
            button(t('Desenvolver arco'), newStory, 'primary', 'plus'),
          ),
        );
  return el(
    'div',
    {},
    heading(
      t('Narrativas'),
      t('Dê à história uma pergunta clara e uma resolução que cumpre a promessa.'),
      button(t('Novo arco narrativo'), newStory, 'primary', 'plus'),
    ),
    records.length
      ? documentPicker(t('Narrativa selecionada'), records, studio.activeStoryId, (id) => {
          studio.activeStoryId = id;
          render();
        })
      : null,
    el('div', { className: 'editor-layout' }, list, editor),
  );
}

export function storyForm(record?: Story): HTMLElement {
  const title = input('title', record?.title || '');
  title.required = true;
  const script = select(
    'scriptId',
    [
      ['', t('Sem roteiro vinculado')],
      ...scoped(state().scripts).map((entry): [string, string] => [entry.id, entry.title]),
    ],
    record?.scriptId || '',
  );
  const hook = textarea('hook', record?.hook || '', 3);
  const setup = textarea('setup', record?.setup || '', 3);
  const conflict = textarea('conflict', record?.conflict || '', 3);
  const turningPoint = textarea('turningPoint', record?.turningPoint || '', 3);
  const resolution = textarea('resolution', record?.resolution || '', 3);
  const cta = textarea('cta', record?.cta || '', 2);
  const owner = studio.channelId;
  const readCreative = (): StoryCreativeValues => ({
    title: title.value.trim(),
    scriptId: script.value || undefined,
    hook: hook.value.trim(),
    setup: setup.value.trim(),
    conflict: conflict.value.trim(),
    turningPoint: turningPoint.value.trim(),
    resolution: resolution.value.trim(),
    cta: cta.value.trim(),
  });
  const ai = creativeEditorButton(
    () => ({ task: 'story', values: readCreative() }),
    (result) => {
      if (!form.isConnected || studio.channelId !== owner || !('resolution' in result))
        throw new Error(t('A narrativa mudou. Abra o assistente a partir do editor atual.'));
      title.value = result.title;
      hook.value = result.hook;
      setup.value = result.setup;
      conflict.value = result.conflict;
      turningPoint.value = result.turningPoint;
      resolution.value = result.resolution;
      cta.value = result.cta;
      toast(t('Narrativa nos campos. Revise e salve; as cenas do roteiro não foram alteradas.'));
    },
    () => form,
  );
  const { form, fields, actions } = formWithSave(t('Salvar arco narrativo'), async () => {
    const savingChannelId = studio.channelId;
    const response = await request<Story>(
      record ? `/api/stories/${encodeURIComponent(record.id)}` : '/api/stories',
      record ? 'PUT' : 'POST',
      { channelId: studio.channelId, ...readCreative() },
    );
    if (studio.channelId === savingChannelId) studio.activeStoryId = response.id || record?.id || '';
    await refresh();
    toast(t('Arco narrativo salvo.'));
  });
  const storyTabs = editorTabs(t('Partes da narrativa'), [
    {
      key: 'opening',
      label: t('Abertura'),
      content: el(
        'div',
        { className: 'form-stack' },
        field(t('Nome desta história'), title),
        field(t('Roteiro vinculado'), script),
        field(t('Gancho'), hook),
        field(t('Contexto'), setup),
      ),
    },
    {
      key: 'arc',
      label: t('Desenvolvimento'),
      content: el(
        'div',
        { className: 'form-stack' },
        field(t('Tensão'), conflict),
        field(t('Descoberta'), turningPoint),
      ),
    },
    {
      key: 'ending',
      label: t('Desfecho'),
      content: el(
        'div',
        { className: 'form-stack' },
        field(t('Resolução'), resolution),
        field(t('Próximo passo para o espectador'), cta),
        el(
          'p',
          { className: 'field-hint' },
          t('O arco organiza a história. Para mudar a fala final, edite as cenas do roteiro.'),
        ),
        record
          ? button(
              t('Excluir narrativa'),
              () => deleteRecord('stories', record.id, record.title),
              'danger',
              'trash',
            )
          : null,
      ),
    },
  ]);
  fields.append(storyTabs.node);
  return el(
    'section',
    { className: 'panel editor-body' },
    editorWorkspace(form, actions, ai, t('Editor da narrativa')),
  );
}
