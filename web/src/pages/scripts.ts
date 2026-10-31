import { request } from '../api.ts';
import { editorWorkspace, empty, formWithSave, heading } from '../components.ts';
import { button, el, field, input, select, textarea } from '../dom.ts';
import { protectEdits } from '../edit-protection.ts';
import { claimsEditor } from '../editors/claims.ts';
import { creativeEditorButton, documentPicker, statusControl } from '../editors/common.ts';
import { sceneEditor } from '../editors/scenes.ts';
import { sourceEditor } from '../editors/sources.ts';
import { channelPath, currentChannel, go, refresh, render, scoped, state, studio } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import { editorTabs } from '../ui-tabs.ts';
import { deleteRecord, requiredChannel } from './channels.ts';
import { t, translateMessage } from '../../shared/i18n.ts';
import type { ScriptCreativeValues } from '../../shared/creative-types.ts';
import type { Script, Source } from '../../shared/types.ts';

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
    { className: 'panel editor-list', 'aria-label': t('Roteiros deste canal') },
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
          entry.format === 'short'
            ? t('Curto · {count} cena(s)', { count: entry.scenes.length })
            : t('Longo · {count} cena(s)', { count: entry.scenes.length }),
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
            t('Nenhum roteiro neste canal'),
            t('Escreva uma narrativa autoral, organize as cenas e conecte cada alegação às suas fontes.'),
            'script',
            button(t('Criar roteiro'), () => startScript(), 'primary', 'plus'),
          ),
        );
  return el(
    'div',
    {},
    heading(
      t('Roteiros'),
      t('Transforme a pauta em falas, cenas e fontes que você pode conferir.'),
      button(t('Novo roteiro'), () => startScript(), 'primary', 'plus'),
    ),
    records.length
      ? documentPicker(t('Roteiro selecionado'), records, studio.activeScriptId, (id) => {
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
    [['', t('Sem pauta vinculada')], ...research.map((entry): [string, string] => [entry.id, entry.title])],
    record?.researchId || studio.draftResearchId,
  );
  const series = input('series', record?.series || currentChannel()?.niche || 'principal');
  series.required = true;
  const format = select(
    'format',
    [
      ['short', t('Curto · 65 a 90 segundos')],
      ['long', t('Longo · 7 a 12 minutos')],
    ],
    record?.format || 'short',
  );
  const hook = textarea('hook', record?.hook || '', 2);
  hook.required = true;
  const status = statusControl(record?.status);
  const scenes = sceneEditor(
    record?.scenes || [
      { id: 0, heading: t('Abertura'), narration: '', visualBrief: '', durationHintSecs: 20 },
    ],
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
        throw new Error(t('O roteiro mudou. Abra o assistente a partir do editor atual.'));
      title.value = result.title;
      series.value = result.series;
      format.value = result.format;
      hook.value = result.hook;
      scenes.write(result.scenes);
      sources.write(result.sources);
      claims.write(result.claims.map((claim) => ({ ...claim, status: 'unverified' })));
      status.value = 'draft';
      crossed.checked = false;
      toast(t('Rascunho nos campos. Confira novamente as alegações e as fontes antes de produzir.'));
    },
    () => form,
  );
  const searchTerms = input('source-search', record?.title || startingResearch?.title || '');
  searchTerms.placeholder = t('Termos de busca; em inglês encontra mais artigos');
  const findSources = button(
    t('Buscar fontes'),
    async () => {
      if (findSources.disabled) return;
      findSources.disabled = true;
      try {
        const query = [
          searchTerms.value,
          ...claims
            .read()
            .slice(0, 3)
            .map((claim) => claim.text),
        ];
        const found = await request<Source[]>(channelPath('/sources/suggest'), 'POST', { query });
        const known = new Set(sources.read().map((source) => source.url));
        const added = found.filter((source) => !known.has(source.url));
        if (!added.length) {
          toast(
            t(
              'Nenhum artigo novo encontrado para este título e alegações. Refine o título ou registre a fonte.',
            ),
            true,
          );
          return;
        }
        sources.write([...sources.read(), ...added]);
        toast(
          t('{count} fonte(s) sugerida(s). Leia cada artigo antes de publicar.', { count: added.length }),
        );
      } catch (error) {
        toast(
          error instanceof Error ? translateMessage(error.message) : t('A busca de fontes falhou.'),
          true,
        );
      } finally {
        findSources.disabled = false;
      }
    },
    'secondary',
    'search',
  );
  const { form, fields, actions } = formWithSave(t('Salvar roteiro'), async () => {
    const savingChannelId = studio.channelId;
    const sceneValues = scenes.read();
    if (!sceneValues.length) throw new Error(t('Adicione pelo menos uma cena ao roteiro.'));
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
    toast(t('Roteiro salvo. A aprovação editorial continua independente do salvamento.'));
  });
  const scriptTabs = editorTabs(t('Partes do roteiro'), [
    {
      key: 'brief',
      label: t('Briefing'),
      content: el(
        'div',
        { className: 'form-stack' },
        field(t('Título do vídeo'), title),
        el(
          'div',
          { className: 'form-grid' },
          field(t('Pauta vinculada'), researchId),
          field(t('Série'), series),
          field(t('Formato'), format),
          field(t('Estado editorial'), status),
        ),
        field(t('Gancho de abertura'), hook),
      ),
    },
    { key: 'scenes', label: t('Cenas'), content: scenes.node },
    {
      key: 'review',
      label: t('Fontes e revisão'),
      content: el(
        'div',
        { className: 'form-stack' },
        sources.node,
        el(
          'div',
          { className: 'form-grid' },
          field(t('Buscar artigos sobre'), searchTerms),
          el('div', { className: 'field' }, findSources),
        ),
        el(
          'p',
          { className: 'field-hint' },
          t(
            'Procura artigos revisados por pares (DOI) no Crossref pelos termos e pelas alegações. Só entram artigos citados e com o tema no título; leia cada um antes de publicar.',
          ),
        ),
        claims.node,
        el(
          'label',
          { className: 'checkbox-field' },
          crossed,
          t('Conferi e cruzei as fontes e as alegações desta pauta'),
        ),
        el(
          'p',
          { className: 'field-hint' },
          t(
            'Esta é a revisão editorial: o motor registra a declaração no relatório de QA e libera a versão final. Publicar continua manual.',
          ),
        ),
        el(
          'div',
          { className: 'accordion' },
          el(
            'details',
            {},
            el('summary', {}, t('Identificação técnica')),
            el('section', {}, field(t('ID do tópico no motor'), topicId)),
          ),
        ),
        record
          ? button(
              t('Excluir roteiro'),
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
    editorWorkspace(form, actions, ai, t('Editor do roteiro')),
  );
}
