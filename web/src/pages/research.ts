import { orderResearch } from '../../shared/research-order.ts';
import { request } from '../api.ts';
import {
  badge,
  createDialog,
  editorWorkspace,
  empty,
  formWithSave,
  heading,
  iconButton,
  panel,
} from '../components.ts';
import {
  button,
  el,
  externalLink,
  field,
  icon,
  input,
  replace,
  select,
  setButtonLabel,
  textarea,
} from '../dom.ts';
import { creativeEditorButton, statusControl } from '../editors/common.ts';
import { sourceEditor } from '../editors/sources.ts';
import { date, number } from '../format.ts';
import { networkMark } from '../studio/platforms.ts';
import { currentChannel, go, save, scoped, state, studio } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import { editorTabs } from '../ui-tabs.ts';
import { deleteRecord, editChannel, requiredChannel } from './channels.ts';
import { startScript } from './scripts.ts';
import { languageTag, t, translateMessage } from '../../shared/i18n.ts';
import type { ResearchCreativeValues } from '../../shared/creative-types.ts';
import type { ResearchOrder } from '../../shared/research-order.ts';
import type { Research, YoutubeDiscovery } from '../../shared/types.ts';

export function researchPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const records = scoped(state().research);
  const cards = el('div', { className: 'entity-grid' });
  const query = input('search-research');
  query.placeholder = t('Buscar pauta, nicho ou palavra-chave…');
  query.setAttribute('aria-label', t('Buscar pautas e nichos'));
  const order = select(
    'research-order',
    [
      ['recent', t('Atualização recente')],
      ['feasibility', t('Minha viabilidade: maior primeiro')],
      ['demand', t('Minha demanda: maior primeiro')],
      ['competition', t('Minha competição: menor primeiro')],
    ],
    'recent',
  );
  order.setAttribute('aria-label', t('Ordenar pautas'));
  function show(): void {
    const term = query.value.trim().toLocaleLowerCase(languageTag());
    const filtered = orderResearch(
      records.filter((record) =>
        `${record.title} ${record.niche} ${record.keywords.join(' ')}`
          .toLocaleLowerCase(languageTag())
          .includes(term),
      ),
      order.value as ResearchOrder,
    );
    replace(
      cards,
      ...filtered.map((record) => {
        const actions = el(
          'div',
          { className: 'card-actions' },
          iconButton(t('Editar {title}', { title: record.title }), 'edit', () => editResearch(record)),
          iconButton(t('Excluir {title}', { title: record.title }), 'trash', () =>
            deleteRecord('research', record.id, record.title),
          ),
        );
        return el(
          'article',
          { className: 'panel entity-card' },
          // The state sits with the title it describes (law of proximity).
          el(
            'div',
            { className: 'flex min-w-0 items-center gap-3 [&>h3]:mb-0 [&>h3]:min-w-0' },
            el('h3', { title: record.title }, record.title),
            badge(record.status),
          ),
          el('p', {}, record.hypothesis || t('Hipótese ainda não descrita.')),
          el(
            'div',
            { className: 'entity-meta' },
            el('span', { className: 'tag' }, record.niche || t('Nicho em desenvolvimento')),
            el(
              'span',
              { className: 'tag' },
              record.sources.length === 1
                ? t('{count} fonte', { count: record.sources.length })
                : t('{count} fontes', { count: record.sources.length }),
            ),
            order.value === 'recent'
              ? null
              : el(
                  'span',
                  { className: 'tag' },
                  t('Nota manual: {score}/100', {
                    score:
                      order.value === 'demand'
                        ? record.demandScore
                        : order.value === 'competition'
                          ? record.competitionScore
                          : record.feasibilityScore,
                  }),
                ),
          ),
          el(
            'div',
            { className: 'entity-card-bottom' },
            // Outlined, so its edge lines up with the text above (a ghost button's padding does not).
            button(t('Desenvolver roteiro'), () => startScript(record.id), 'secondary', 'arrow'),
            actions,
          ),
        );
      }),
    );
    if (!filtered.length)
      cards.append(
        el(
          'section',
          { className: 'panel full' },
          empty(
            term ? t('Nenhum resultado nesta busca') : t('Nenhuma pauta neste canal'),
            term
              ? t('Tente outro termo ou limpe a busca.')
              : t('Registre a pergunta do vídeo, o público e as fontes que você pretende conferir.'),
            'search',
            !term ? button(t('Criar primeira pauta'), () => editResearch(), 'primary', 'plus') : undefined,
          ),
        ),
      );
  }
  query.addEventListener('input', show);
  order.addEventListener('change', show);
  show();
  return el(
    'div',
    {},
    heading(
      t('Pesquisa de nichos'),
      t('Investigue o público, registre hipóteses e compare fontes.'),
      button(t('Nova hipótese de nicho'), () => editResearch(undefined, true), 'secondary', 'spark'),
      button(t('Nova pauta'), () => editResearch(), 'primary', 'plus'),
    ),
    discoveryPanel(),
    el(
      'div',
      { className: 'section-label' },
      el('h2', {}, t('Sua pesquisa editorial')),
      el('span', {}, t('Hipóteses, referências e próximos passos')),
    ),
    el(
      'div',
      // Search, order and count share one row; the select keeps its content width.
      { className: 'toolbar justify-start [&>select]:w-auto' },
      query,
      order,
      el(
        'span',
        { className: 'toolbar-caption sm:ms-auto' },
        records.length === 1
          ? t('{count} registro neste canal', { count: records.length })
          : t('{count} registros neste canal', { count: records.length }),
      ),
    ),
    cards,
  );
}

export function editResearch(record?: Research, nicheMode = false, prefill: Partial<Research> = {}): void {
  if (!currentChannel()) {
    editChannel();
    return;
  }
  const { dialog, body } = createDialog(
    record ? t('Desenvolver esta pauta') : nicheMode ? t('Explorar uma hipótese de nicho') : t('Criar pauta'),
    t('Registre o que você observou e o que ainda precisa investigar.'),
  );
  const title = input('title', record?.title || prefill.title || '');
  title.required = true;
  title.setAttribute('data-testid', 'research-title');
  const niche = input('niche', record?.niche || currentChannel()?.niche || '');
  const audience = input('audience', record?.audience || currentChannel()?.audience || '');
  const hypothesis = textarea('hypothesis', record?.hypothesis || '', 3);
  const differentiation = textarea('differentiation', record?.differentiation || '', 3);
  const keywords = input('keywords', record?.keywords.join(', ') || '');
  const notes = textarea('notes', record?.notes || '', 3);
  const status = statusControl(record?.status);
  const demand = input('demandScore', String(record?.demandScore ?? 0), 'number');
  const competition = input('competitionScore', String(record?.competitionScore ?? 0), 'number');
  const feasibility = input('feasibilityScore', String(record?.feasibilityScore ?? 0), 'number');
  for (const control of [demand, competition, feasibility]) {
    control.min = '0';
    control.max = '100';
    control.step = '1';
  }
  const sources = sourceEditor(record?.sources || prefill.sources || []);
  const owner = studio.channelId;
  const readCreative = (): ResearchCreativeValues => ({
    title: title.value.trim(),
    niche: niche.value.trim(),
    audience: audience.value.trim(),
    hypothesis: hypothesis.value.trim(),
    differentiation: differentiation.value.trim(),
    keywords: keywords.value
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean),
    sources: sources.read(),
    notes: notes.value.trim(),
  });
  const ai = creativeEditorButton(
    () => ({ task: 'research', values: readCreative() }),
    (result) => {
      if (!form.isConnected || studio.channelId !== owner || !('hypothesis' in result))
        throw new Error(t('A pauta mudou. Abra o assistente a partir do editor atual.'));
      title.value = result.title;
      niche.value = result.niche;
      audience.value = result.audience;
      hypothesis.value = result.hypothesis;
      differentiation.value = result.differentiation;
      keywords.value = result.keywords.join(', ');
      notes.value = result.notes;
      status.value = 'draft';
      publicSearch.href = `https://www.google.com/search?q=${encodeURIComponent(title.value)}`;
      toast(t('Rascunho nos campos. Revise as fontes e salve a pauta.'));
    },
    () => form,
  );
  const publicSearch = el(
    'a',
    {
      className: 'btn button',
      'data-variant': 'ghost',
      target: '_blank',
      rel: 'noopener noreferrer',
      href: 'https://www.google.com/',
    },
    icon('external'),
    t('Abrir pesquisa pública'),
  );
  title.addEventListener('input', () => {
    publicSearch.href = `https://www.google.com/search?q=${encodeURIComponent(title.value)}`;
  });
  if (title.value) publicSearch.href = `https://www.google.com/search?q=${encodeURIComponent(title.value)}`;
  const { form, fields, actions } = formWithSave(t('Salvar pesquisa'), async () => {
    await save(
      record ? `/api/research/${encodeURIComponent(record.id)}` : '/api/research',
      record ? 'PUT' : 'POST',
      {
        channelId: studio.channelId,
        ...readCreative(),
        demandScore: Number(demand.value),
        competitionScore: Number(competition.value),
        feasibilityScore: Number(feasibility.value),
        status: status.value,
      },
    );
    dialog.close();
    toast(t('Pesquisa salva no canal selecionado.'));
  });
  const researchTabs = editorTabs(t('Partes da pauta'), [
    {
      key: 'brief',
      label: t('Pauta'),
      content: el(
        'div',
        { className: 'form-stack' },
        field(nicheMode ? t('Hipótese de nicho') : t('Pergunta ou título de trabalho'), title),
        el('div', { className: 'form-grid' }, field(t('Nicho'), niche), field(t('Público'), audience)),
        field(t('Hipótese de interesse do público'), hypothesis),
        field(t('Contribuição original'), differentiation),
        field(t('Palavras-chave'), keywords),
        field(t('Notas e próximos passos'), notes),
      ),
    },
    {
      key: 'sources',
      label: t('Fontes'),
      content: el(
        'div',
        { className: 'form-stack' },
        publicSearch,
        sources.node,
        field(t('Estado editorial'), status, t('Aplicar IA devolve a pauta para rascunho.')),
      ),
    },
    {
      key: 'priority',
      label: t('Priorização'),
      content: el(
        'fieldset',
        { className: 'fieldset' },
        el('legend', {}, t('Minha avaliação')),
        el(
          'p',
          { className: 'field-hint' },
          t('Opcional. Notas manuais para ordenar pautas; não representam medição de mercado.'),
        ),
        el(
          'div',
          { className: 'form-grid' },
          field(t('Demanda percebida'), demand),
          field(t('Competição percebida'), competition),
          field(t('Viabilidade de produção'), feasibility),
        ),
      ),
    },
  ]);
  fields.append(researchTabs.node);
  body.append(editorWorkspace(form, actions, ai, t('Editor da pauta')));
}

export function discoveryPanel(): HTMLElement {
  const discoveryChannelId = studio.channelId;
  const saved = studio.discoveries.get(discoveryChannelId);
  const query = input('discovery-query', saved?.query || '');
  query.required = true;
  query.minLength = 2;
  query.maxLength = 120;
  query.placeholder = t('Uma pergunta, um assunto ou um nicho…');
  query.setAttribute('aria-label', t('Tema para pesquisar no YouTube'));
  query.setAttribute('data-testid', 'discovery-query');
  const submit = button(t('Consultar YouTube'), () => {}, 'primary', 'search');
  submit.type = 'submit';
  submit.dataset.testid = 'discovery-submit';
  const error = el('div', { className: 'alert form-error', role: 'alert', hidden: true });
  const results = el('div');
  const queryForm = el('form', { className: 'research-query' }, query, submit);
  const resultBody = el(
    'div',
    { className: 'panel-body' },
    queryForm,
    el(
      'p',
      { className: 'field-hint research-quota' },
      t(
        'Consulta explícita à API oficial. Usa a quota do seu projeto e requer uma conexão autorizada do YouTube.',
      ),
    ),
    error,
    results,
  );
  const drawResults = (response: YoutubeDiscovery): void => {
    const heading = el(
      'div',
      { className: 'discovery-heading' },
      el('span', {}, t('{count} vídeo(s) nesta amostra pública', { count: response.items.length })),
      el(
        'span',
        { className: 'field-hint' },
        t('Fonte: YouTube Data API · {date}', { date: date(response.queriedAt) }),
      ),
    );
    const items = response.items.map((item) =>
      el(
        'article',
        { className: 'discovery-item' },
        el('div', { className: 'discovery-icon' }, networkMark('youtube')),
        el(
          'div',
          { className: 'discovery-copy' },
          externalLink(item.title, item.url),
          el(
            'p',
            { className: 'field-hint' },
            t('{channel} · Publicado em {date}', {
              channel: item.channelTitle,
              date: date(item.publishedAt),
            }),
          ),
          el(
            'div',
            { className: 'entity-meta' },
            el('span', { className: 'tag' }, t('{count} views', { count: number(item.views) })),
            el('span', { className: 'tag' }, t('{count} likes', { count: number(item.likes) })),
            el('span', { className: 'tag' }, t('{count} comentários', { count: number(item.comments) })),
          ),
        ),
        button(
          t('Usar como referência'),
          () =>
            editResearch(undefined, false, {
              title: t('Investigar: {title}', { title: item.title }),
              sources: [
                {
                  title: item.title,
                  url: item.url,
                  publisher: item.channelTitle,
                  retrievedAt: response.queriedAt.slice(0, 10),
                  license: t('Referência ao vídeo; licença de reprodução não verificada'),
                },
              ],
            }),
          'secondary',
          'plus',
        ),
      ),
    );
    replace(
      results,
      heading,
      ...items,
      !items.length
        ? empty(
            t('Nenhum vídeo retornado para esta consulta'),
            t(
              'Tente uma pergunta mais específica. Ausência nesta amostra não demonstra ausência de audiência.',
            ),
            'search',
          )
        : null,
      el('p', { className: 'field-hint discovery-note' }, translateMessage(response.note)),
    );
  };
  if (saved) drawResults(saved);
  queryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!queryForm.reportValidity() || submit.disabled) return;
    submit.disabled = true;
    setButtonLabel(submit, t('Consultando…'));
    error.hidden = true;
    queryForm.setAttribute('aria-busy', 'true');
    try {
      const connection = scoped(state().connections).find((entry) => entry.platform === 'youtube');
      if (connection?.status !== 'connected')
        throw new Error(
          t(
            'Conecte a conta do YouTube deste canal para consultar a API. A pesquisa editorial manual continua disponível abaixo.',
          ),
        );
      const response = await request<YoutubeDiscovery>(
        `/api/channels/${encodeURIComponent(discoveryChannelId)}/research/discover`,
        'POST',
        { query: query.value.trim() },
      );
      studio.discoveries.set(discoveryChannelId, response);
      drawResults(response);
    } catch (failure) {
      replace(
        error,
        failure instanceof Error ? translateMessage(failure.message) : t('A consulta não foi concluída.'),
        el(
          'div',
          {},
          button(
            t('Ir para conexões'),
            () => {
              studio.activePlatform = 'youtube';
              go('connections');
            },
            'ghost',
            'plug',
          ),
        ),
      );
      error.hidden = false;
    } finally {
      submit.disabled = false;
      setButtonLabel(submit, t('Consultar YouTube'), 'search');
      queryForm.removeAttribute('aria-busy');
    }
  });
  return panel(
    t('Explore o que está sendo publicado'),
    t('Uma amostra real para investigar perguntas e desenvolver um ângulo próprio.'),
    resultBody,
  );
}
