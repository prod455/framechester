import { request } from '../api.ts';
import { editorWorkspace, empty, formWithSave, heading } from '../components.ts';
import { button, el, field, input, select, textarea } from '../dom.ts';
import { protectEdits } from '../edit-protection.ts';
import { claimsEditor } from '../editors/claims.ts';
import { creativeEditorButton, documentPicker, statusControl } from '../editors/common.ts';
import { sceneEditor } from '../editors/scenes.ts';
import { sourceEditor } from '../editors/sources.ts';
import { currentChannel, go, refresh, render, scoped, state, studio } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import { editorTabs } from '../ui-tabs.ts';
import { deleteRecord, requiredChannel } from './channels.ts';
import type { ScriptCreativeValues } from '../../shared/creative-types.ts';
import type { Script } from '../../shared/types.ts';

export function startScript(researchId = ''): void {
  protectEdits(() => {
    studio.draftResearchId = researchId;
    studio.activeScriptId = '__new__';
    go('scripts');
  });
}

export function scriptsPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const records = scoped(state().scripts);
  if (studio.activeScriptId !== '__new__' && !records.some((entry) => entry.id === studio.activeScriptId))
    studio.activeScriptId = records[0]?.id || '';
  const record = records.find((entry) => entry.id === studio.activeScriptId);
  const list = el(
    'aside',
    { className: 'panel editor-list', 'aria-label': 'Roteiros deste canal' },
    ...records.map((entry) => {
      const item = el(
        'button',
        {
          type: 'button',
          className: `editor-list-item ${entry.id === studio.activeScriptId ? 'active' : ''}`,
        },
        el('span', { className: 'editor-list-title', title: entry.title }, entry.title),
        el(
          'span',
          { className: 'editor-list-caption' },
          `${entry.format === 'short' ? 'Curto' : 'Longo'} · ${entry.scenes.length} cena(s)`,
        ),
      );
      item.addEventListener('click', () =>
        protectEdits(() => {
          studio.activeScriptId = entry.id;
          render();
        }),
      );
      return item;
    }),
  );
  const editor =
    record || studio.activeScriptId === '__new__'
      ? scriptForm(record)
      : el(
          'section',
          { className: 'panel' },
          empty(
            'Nenhum roteiro neste canal',
            'Escreva uma narrativa autoral, organize as cenas e conecte cada alegação às suas fontes.',
            'script',
            button('Criar roteiro', () => startScript(), 'primary', 'plus'),
          ),
        );
  return el(
    'div',
    {},
    heading(
      'Roteiros',
      'Transforme a pauta em falas, cenas e fontes que você pode conferir.',
      button('Novo roteiro', () => startScript(), 'primary', 'plus'),
    ),
    records.length
      ? documentPicker('Roteiro selecionado', records, studio.activeScriptId, (id) => {
          studio.activeScriptId = id;
          render();
        })
      : null,
    el('div', { className: 'editor-layout' }, list, editor),
  );
}

export function scriptForm(record?: Script): HTMLElement {
  const research = scoped(state().research);
  const startingResearch = research.find(
    (entry) => entry.id === (record?.researchId || studio.draftResearchId),
  );
  const title = input('title', record?.title || startingResearch?.title || '');
  title.required = true;
  title.setAttribute('data-testid', 'script-title');
  const topicId = input('topicId', record?.topicId || `topico-${crypto.randomUUID()}`);
  topicId.required = true;
  const researchId = select(
    'researchId',
    [['', 'Sem pauta vinculada'], ...research.map((entry): [string, string] => [entry.id, entry.title])],
    record?.researchId || studio.draftResearchId,
  );
  const series = input('series', record?.series || currentChannel()?.niche || 'principal');
  series.required = true;
  const format = select(
    'format',
    [
      ['short', 'Curto · 65 a 90 segundos'],
      ['long', 'Longo · 7 a 12 minutos'],
    ],
    record?.format || 'short',
  );
  const hook = textarea('hook', record?.hook || '', 2);
  hook.required = true;
  const status = statusControl(record?.status);
  const scenes = sceneEditor(
    record?.scenes || [{ id: 0, heading: 'Abertura', narration: '', visualBrief: '', durationHintSecs: 20 }],
  );
  const sources = sourceEditor(record?.sources || startingResearch?.sources || []);
  const claims = claimsEditor(record?.claims || []);
  const crossed = input('crossChecked', '', 'checkbox');
  crossed.checked = record?.crossChecked ?? false;
  crossed.setAttribute('data-testid', 'script-cross-checked');
  const owner = studio.channelId;
  const readCreative = (): ScriptCreativeValues => ({
    title: title.value.trim(),
    researchId: researchId.value || undefined,
    series: series.value.trim(),
    format: format.value === 'long' ? 'long' : 'short',
    hook: hook.value.trim(),
    scenes: scenes.read(),
    sources: sources.read(),
    claims: claims.read(),
  });
  const ai = creativeEditorButton(
    () => ({ task: 'script', values: readCreative() }),
    (result) => {
      if (!form.isConnected || studio.channelId !== owner || !('scenes' in result))
        throw new Error('O roteiro mudou. Abra o assistente a partir do editor atual.');
      title.value = result.title;
      series.value = result.series;
      format.value = result.format;
      hook.value = result.hook;
      scenes.write(result.scenes);
      sources.write(result.sources);
      claims.write(result.claims.map((claim) => ({ ...claim, status: 'unverified' })));
      status.value = 'draft';
      crossed.checked = false;
      toast('Rascunho nos campos. Confira novamente as alegações e as fontes antes de produzir.');
    },
    () => form,
  );
  const { form, fields, actions } = formWithSave('Salvar roteiro', async () => {
    const savingChannelId = studio.channelId;
    const sceneValues = scenes.read();
    if (!sceneValues.length) throw new Error('Adicione pelo menos uma cena ao roteiro.');
    const response = await request<Script>(
      record ? `/api/scripts/${encodeURIComponent(record.id)}` : '/api/scripts',
      record ? 'PUT' : 'POST',
      {
        channelId: studio.channelId,
        ...readCreative(),
        topicId: topicId.value.trim(),
        status: status.value,
        crossChecked: crossed.checked,
      },
    );
    if (studio.channelId === savingChannelId) {
      studio.activeScriptId = response.id || record?.id || '';
      studio.draftResearchId = '';
    }
    await refresh();
    toast('Roteiro salvo. A aprovação editorial continua independente do salvamento.');
  });
  const scriptTabs = editorTabs('Partes do roteiro', [
    {
      key: 'brief',
      label: 'Briefing',
      content: el(
        'div',
        { className: 'form-stack' },
        field('Título do vídeo', title),
        el(
          'div',
          { className: 'form-grid' },
          field('Pauta vinculada', researchId),
          field('Série', series),
          field('Formato', format),
          field('Estado editorial', status),
        ),
        field('Gancho de abertura', hook),
      ),
    },
    { key: 'scenes', label: 'Cenas', content: scenes.node },
    {
      key: 'review',
      label: 'Fontes e revisão',
      content: el(
        'div',
        { className: 'form-stack' },
        sources.node,
        claims.node,
        el('label', { className: 'checkbox-field' }, crossed, 'Conferi e cruzei as fontes desta pauta'),
        el(
          'p',
          { className: 'field-hint' },
          'Esta é uma declaração do operador. Salvar não aprova fatos, direitos ou publicação.',
        ),
        el(
          'div',
          { className: 'accordion' },
          el(
            'details',
            {},
            el('summary', {}, 'Identificação técnica'),
            el('section', {}, field('ID do tópico no motor', topicId)),
          ),
        ),
        record
          ? button(
              'Excluir roteiro',
              () => deleteRecord('scripts', record.id, record.title),
              'danger',
              'trash',
            )
          : null,
      ),
    },
  ]);
  fields.append(scriptTabs.node);
  return el(
    'section',
    { className: 'panel editor-body' },
    editorWorkspace(form, actions, ai, 'Editor do roteiro'),
  );
}
