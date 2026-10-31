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
import type { ResearchCreativeValues } from '../../shared/creative-types.ts';
import type { ResearchOrder } from '../../shared/research-order.ts';
import type { Research, YoutubeDiscovery } from '../../shared/types.ts';

export function researchPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const records = scoped(state().research);
  const cards = el('div', { className: 'entity-grid' });
  const query = input('search-research');
  query.placeholder = 'Buscar pauta, nicho ou palavra-chave…';
  query.setAttribute('aria-label', 'Buscar pautas e nichos');
  const order = select(
    'research-order',
    [
      ['recent', 'Atualização recente'],
      ['feasibility', 'Minha viabilidade: maior primeiro'],
      ['demand', 'Minha demanda: maior primeiro'],
      ['competition', 'Minha competição: menor primeiro'],
    ],
    'recent',
  );
  order.setAttribute('aria-label', 'Ordenar pautas');
  function show(): void {
    const term = query.value.trim().toLocaleLowerCase('pt-BR');
    const filtered = orderResearch(
      records.filter((record) =>
        `${record.title} ${record.niche} ${record.keywords.join(' ')}`
          .toLocaleLowerCase('pt-BR')
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
          iconButton(`Editar ${record.title}`, 'edit', () => editResearch(record)),
          iconButton(`Excluir ${record.title}`, 'trash', () =>
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
          el('p', {}, record.hypothesis || 'Hipótese ainda não descrita.'),
          el(
            'div',
            { className: 'entity-meta' },
            el('span', { className: 'tag' }, record.niche || 'Nicho em desenvolvimento'),
            el(
              'span',
              { className: 'tag' },
              `${record.sources.length} ${record.sources.length === 1 ? 'fonte' : 'fontes'}`,
            ),
            order.value === 'recent'
              ? null
              : el(
                  'span',
                  { className: 'tag' },
                  `Nota manual: ${order.value === 'demand' ? record.demandScore : order.value === 'competition' ? record.competitionScore : record.feasibilityScore}/100`,
                ),
          ),
          el(
            'div',
            { className: 'entity-card-bottom' },
            // Outlined, so its edge lines up with the text above (a ghost button's padding does not).
            button('Desenvolver roteiro', () => startScript(record.id), 'secondary', 'arrow'),
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
            term ? 'Nenhum resultado nesta busca' : 'Nenhuma pauta neste canal',
            term
              ? 'Tente outro termo ou limpe a busca.'
              : 'Registre a pergunta do vídeo, o público e as fontes que você pretende conferir.',
            'search',
            !term ? button('Criar primeira pauta', () => editResearch(), 'primary', 'plus') : undefined,
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
      'Pesquisa de nichos',
      'Investigue o público, registre hipóteses e compare fontes.',
      button('Nova hipótese de nicho', () => editResearch(undefined, true), 'secondary', 'spark'),
      button('Nova pauta', () => editResearch(), 'primary', 'plus'),
    ),
    discoveryPanel(),
    el(
      'div',
      { className: 'section-label' },
      el('h2', {}, 'Sua pesquisa editorial'),
      el('span', {}, 'Hipóteses, referências e próximos passos'),
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
        `${records.length} ${records.length === 1 ? 'registro' : 'registros'} neste canal`,
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
    record ? 'Desenvolver esta pauta' : nicheMode ? 'Explorar uma hipótese de nicho' : 'Criar pauta',
    'Registre o que você observou e o que ainda precisa investigar.',
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
        throw new Error('A pauta mudou. Abra o assistente a partir do editor atual.');
      title.value = result.title;
      niche.value = result.niche;
      audience.value = result.audience;
      hypothesis.value = result.hypothesis;
      differentiation.value = result.differentiation;
      keywords.value = result.keywords.join(', ');
      notes.value = result.notes;
      status.value = 'draft';
      publicSearch.href = `https://www.google.com/search?q=${encodeURIComponent(title.value)}`;
      toast('Rascunho nos campos. Revise as fontes e salve a pauta.');
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
    'Abrir pesquisa pública',
  );
  title.addEventListener('input', () => {
    publicSearch.href = `https://www.google.com/search?q=${encodeURIComponent(title.value)}`;
  });
  if (title.value) publicSearch.href = `https://www.google.com/search?q=${encodeURIComponent(title.value)}`;
  const { form, fields, actions } = formWithSave('Salvar pesquisa', async () => {
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
    toast('Pesquisa salva no canal selecionado.');
  });
  const researchTabs = editorTabs('Partes da pauta', [
    {
      key: 'brief',
      label: 'Pauta',
      content: el(
        'div',
        { className: 'form-stack' },
        field(nicheMode ? 'Hipótese de nicho' : 'Pergunta ou título de trabalho', title),
        el('div', { className: 'form-grid' }, field('Nicho', niche), field('Público', audience)),
        field('Hipótese de interesse do público', hypothesis),
        field('Contribuição original', differentiation),
        field('Palavras-chave', keywords),
        field('Notas e próximos passos', notes),
      ),
    },
    {
      key: 'sources',
      label: 'Fontes',
      content: el(
        'div',
        { className: 'form-stack' },
        publicSearch,
        sources.node,
        field('Estado editorial', status, 'Aplicar IA devolve a pauta para rascunho.'),
      ),
    },
    {
      key: 'priority',
      label: 'Priorização',
      content: el(
        'fieldset',
        { className: 'fieldset' },
        el('legend', {}, 'Minha avaliação'),
        el(
          'p',
          { className: 'field-hint' },
          'Opcional. Notas manuais para ordenar pautas; não representam medição de mercado.',
        ),
        el(
          'div',
          { className: 'form-grid' },
          field('Demanda percebida', demand),
          field('Competição percebida', competition),
          field('Viabilidade de produção', feasibility),
        ),
      ),
    },
  ]);
  fields.append(researchTabs.node);
  body.append(editorWorkspace(form, actions, ai, 'Editor da pauta'));
}

export function discoveryPanel(): HTMLElement {
  const discoveryChannelId = studio.channelId;
  const saved = studio.discoveries.get(discoveryChannelId);
  const query = input('discovery-query', saved?.query || '');
  query.required = true;
  query.minLength = 2;
  query.maxLength = 120;
  query.placeholder = 'Uma pergunta, um assunto ou um nicho…';
  query.setAttribute('aria-label', 'Tema para pesquisar no YouTube');
  query.setAttribute('data-testid', 'discovery-query');
  const submit = button('Consultar YouTube', () => {}, 'primary', 'search');
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
      'Consulta explícita à API oficial. Usa a quota do seu projeto e requer uma conexão autorizada do YouTube.',
    ),
    error,
    results,
  );
  const drawResults = (response: YoutubeDiscovery): void => {
    const heading = el(
      'div',
      { className: 'discovery-heading' },
      el('span', {}, `${response.items.length} vídeo(s) nesta amostra pública`),
      el('span', { className: 'field-hint' }, `Fonte: YouTube Data API · ${date(response.queriedAt)}`),
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
            `${item.channelTitle} · Publicado em ${date(item.publishedAt)}`,
          ),
          el(
            'div',
            { className: 'entity-meta' },
            el('span', { className: 'tag' }, `${number(item.views)} views`),
            el('span', { className: 'tag' }, `${number(item.likes)} likes`),
            el('span', { className: 'tag' }, `${number(item.comments)} comentários`),
          ),
        ),
        button(
          'Usar como referência',
          () =>
            editResearch(undefined, false, {
              title: `Investigar: ${item.title}`,
              sources: [
                {
                  title: item.title,
                  url: item.url,
                  publisher: item.channelTitle,
                  retrievedAt: response.queriedAt.slice(0, 10),
                  license: 'Referência ao vídeo; licença de reprodução não verificada',
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
            'Nenhum vídeo retornado para esta consulta',
            'Tente uma pergunta mais específica. Ausência nesta amostra não demonstra ausência de audiência.',
            'search',
          )
        : null,
      el('p', { className: 'field-hint discovery-note' }, response.note),
    );
  };
  if (saved) drawResults(saved);
  queryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!queryForm.reportValidity() || submit.disabled) return;
    submit.disabled = true;
    setButtonLabel(submit, 'Consultando…');
    error.hidden = true;
    queryForm.setAttribute('aria-busy', 'true');
    try {
      const connection = scoped(state().connections).find((entry) => entry.platform === 'youtube');
      if (connection?.status !== 'connected')
        throw new Error(
          'Conecte a conta do YouTube deste canal para consultar a API. A pesquisa editorial manual continua disponível abaixo.',
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
        failure instanceof Error ? failure.message : 'A consulta não foi concluída.',
        el(
          'div',
          {},
          button(
            'Ir para conexões',
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
      setButtonLabel(submit, 'Consultar YouTube', 'search');
      queryForm.removeAttribute('aria-busy');
    }
  });
  return panel(
    'Explore o que está sendo publicado',
    'Uma amostra real para investigar perguntas e desenvolver um ângulo próprio.',
    resultBody,
  );
}
