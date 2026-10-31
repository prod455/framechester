import { request } from './api.ts';
import { button, el, externalLink, field, replace, select, setButtonLabel } from './dom.ts';
import { languageTag, t, translateMessage } from '../shared/i18n.ts';
import type { AIUsageSnapshot, AIUsageRecord } from '../shared/ai-usage-types.ts';

const providers = { anthropic: 'Anthropic', openai: 'OpenAI' };
const statuses: Record<AIUsageRecord['status'], string> = {
  pending: t('Em andamento'),
  succeeded: t('Concluída'),
  rejected: t('Resposta descartada'),
  failed: t('Falhou'),
  unknown: t('Sem confirmação'),
};
const tasks = { research: t('Pesquisa'), script: t('Roteiro'), story: t('Narrativa') };
const count = (value: number | null) =>
  value === null ? t('Não informado') : value.toLocaleString(languageTag());
const money = (value: number | null) =>
  value === null
    ? t('Não informado')
    : new Intl.NumberFormat(languageTag(), {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 3,
        maximumFractionDigits: 6,
      }).format(value);
function date(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(languageTag(), {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(timestamp)
    : t('Data indisponível');
}
function table(label: string, columns: string[], rows: HTMLElement[][]): HTMLElement {
  return el(
    'div',
    { className: 'table-scroll', role: 'region', 'aria-label': label, tabindex: 0 },
    el(
      'table',
      { className: 'table ai-usage-table', 'aria-label': label },
      el('thead', {}, el('tr', {}, ...columns.map((column) => el('th', { scope: 'col' }, column)))),
      el('tbody', {}, ...rows.map((cells) => el('tr', {}, ...cells))),
    ),
  );
}
function valueCell(value: string, unbroken = false): HTMLTableCellElement {
  return el('td', { className: unbroken ? 'ai-usage-unbroken' : undefined }, value);
}

/** A local ledger view. It never queries an inference provider or contains credentials. */
export function createAIUsagePanel(
  channelId?: string,
  channelName?: string,
): { node: HTMLElement; refresh: () => Promise<void> } {
  const node = el(
    'section',
    { className: 'section-stack', 'aria-label': t('Consumo no Studio') },
    el(
      'div',
      {},
      el('h3', {}, t('Consumo no Studio')),
      el(
        'p',
        { className: 'field-hint' },
        channelId
          ? t('{channel} · chamadas feitas pelo Framechester.', { channel: channelName || channelId })
          : t('Selecione um canal para consultar o consumo.'),
      ),
    ),
  );
  if (!channelId) return { node, refresh: async () => {} };
  const days = select(
    'ai-usage-days',
    [
      ['7', t('Últimos 7 dias')],
      ['30', t('Últimos 30 dias')],
      ['90', t('Últimos 90 dias')],
    ],
    '30',
  );
  const provider = select('ai-usage-provider', [
    ['', t('Todos os provedores')],
    ['anthropic', 'Anthropic'],
    ['openai', 'OpenAI'],
  ]);
  const status = el(
    'p',
    { className: 'field-hint', role: 'status' },
    t('Consulte o registro local deste canal.'),
  );
  const content = el('div', { className: 'section-stack', 'aria-live': 'polite' });
  let revision = 0;
  const refreshButton = button(
    t('Atualizar consumo'),
    () => {
      void refresh();
    },
    'secondary',
    'refresh',
  );
  refreshButton.setAttribute('data-usage-refresh', '');
  async function refresh(): Promise<void> {
    const requestRevision = ++revision;
    if (!node.isConnected) return;
    refreshButton.disabled = true;
    setButtonLabel(refreshButton, t('Consultando…'));
    node.setAttribute('aria-busy', 'true');
    status.textContent = t('Consultando o registro local…');
    replace(content);
    try {
      const snapshot = await request<AIUsageSnapshot>(
        `/api/channels/${encodeURIComponent(channelId!)}/creative/usage?days=${days.value}${provider.value ? `&provider=${provider.value}` : ''}`,
      );
      if (!node.isConnected || requestRevision !== revision) return;
      if (
        snapshot.scope !== 'studio' ||
        snapshot.channelId !== channelId ||
        !Array.isArray(snapshot.events) ||
        !Array.isArray(snapshot.byCredential) ||
        snapshot.events.some((event) => event.channelId !== channelId)
      )
        throw new Error(t('O registro não corresponde a este canal. Atualize o consumo novamente.'));
      render(snapshot);
      status.textContent = t('Período: {from} a {to} (UTC).', {
        from: date(snapshot.from),
        to: date(snapshot.to),
      });
    } catch (error) {
      if (node.isConnected && requestRevision === revision) {
        status.textContent = t('Não foi possível consultar o consumo.');
        replace(
          content,
          el(
            'p',
            { className: 'alert form-error', role: 'alert' },
            error instanceof Error ? translateMessage(error.message) : t('Tente atualizar o registro local.'),
          ),
        );
      }
    } finally {
      if (node.isConnected && requestRevision === revision) {
        refreshButton.disabled = false;
        setButtonLabel(refreshButton, t('Atualizar consumo'), 'refresh');
        node.removeAttribute('aria-busy');
      }
    }
  }
  function render(snapshot: AIUsageSnapshot): void {
    const totals = snapshot.totals;
    if (!totals.generationRequests && !totals.estimateRequests) {
      replace(
        content,
        el(
          'p',
          {},
          t(
            'Nenhuma chamada registrada neste período. O histórico começa com as chamadas feitas pelo Studio após a ativação do monitoramento.',
          ),
        ),
      );
      return;
    }
    const summary = el(
      'dl',
      { className: 'operation-properties' },
      ...[
        [t('Gerações'), count(totals.generationRequests)],
        [t('Tokens de entrada reportados'), count(totals.inputTokens)],
        [t('Tokens de resposta reportados'), count(totals.outputTokens)],
        [t('Custo calculado (USD)'), money(totals.estimatedCostUsd)],
      ].map(([label, value]) => el('div', {}, el('dt', {}, label), el('dd', {}, value))),
    );
    replace(
      content,
      summary,
      el(
        'p',
        { className: 'field-hint' },
        t(
          'Concluídas: {succeeded} · Com falha ou resposta descartada: {failed} · Sem confirmação: {unknown}. Estimativas: {estimates}; os tokens dessas contagens não são somados às gerações.',
          {
            succeeded: count(totals.successfulGenerations),
            failed: count(totals.failedGenerations),
            unknown: count(totals.unknownGenerations),
            estimates: count(totals.estimateRequests),
          },
        ),
      ),
    );
    content.append(
      el(
        'p',
        { className: 'field-hint' },
        t(
          'Cache de entrada informado: {cached} tokens, já incluídos na entrada. Raciocínio informado: {reasoning} tokens, já incluídos na resposta.',
          { cached: count(totals.cachedInputTokens), reasoning: count(totals.reasoningTokens) },
        ),
      ),
    );
    if (totals.unknownCostRequests)
      content.append(
        el(
          'p',
          { className: 'field-hint' },
          totals.unknownCostRequests === 1
            ? t(
                '{count} geração sem custo confirmado. O total considera somente o uso informado; uma falha ou interrupção pode ter cobrança no provedor.',
                { count: count(totals.unknownCostRequests) },
              )
            : t(
                '{count} gerações sem custo confirmado. O total considera somente o uso informado; uma falha ou interrupção pode ter cobrança no provedor.',
                { count: count(totals.unknownCostRequests) },
              ),
        ),
      );
    if (totals.unknownUsageRequests)
      content.append(
        el(
          'p',
          { className: 'field-hint' },
          totals.unknownUsageRequests === 1
            ? t('{count} geração sem contagem de tokens. Campos não informados permanecem desconhecidos.', {
                count: count(totals.unknownUsageRequests),
              })
            : t('{count} gerações sem contagem de tokens. Campos não informados permanecem desconhecidos.', {
                count: count(totals.unknownUsageRequests),
              }),
        ),
      );
    content.append(
      el(
        'section',
        { className: 'section-stack' },
        el('h3', {}, t('Por chave')),
        table(
          t('Consumo por chave'),
          [t('Provedor e identificação local'), t('Gerações'), t('Entrada / resposta'), t('Custo calculado')],
          snapshot.byCredential.map((item) => [
            el(
              'td',
              {},
              el('div', {}, providers[item.provider]),
              el(
                'div',
                { className: 'field-hint', title: item.credentialId },
                t('Chave {id}', { id: item.credentialId.slice(0, 12) }),
              ),
            ),
            valueCell(count(item.generationRequests), true),
            valueCell(`${count(item.inputTokens)} / ${count(item.outputTokens)}`),
            valueCell(money(item.estimatedCostUsd), true),
          ]),
        ),
        el(
          'p',
          { className: 'field-hint' },
          t(
            'A identificação é criada pelo Studio e não é um trecho da chave. A troca ou remoção de uma chave conserva seu histórico.',
          ),
        ),
      ),
    );
    content.append(
      el(
        'section',
        { className: 'section-stack' },
        el('h3', {}, t('Chamadas recentes')),
        table(
          t('Chamadas recentes'),
          [
            t('Início (UTC)'),
            t('Provedor e tarefa'),
            t('Estado'),
            t('Entrada / resposta'),
            t('Custo calculado'),
          ],
          snapshot.events.map((event) => [
            valueCell(date(event.startedAt), true),
            el(
              'td',
              {},
              el(
                'div',
                {},
                `${providers[event.provider]} · ${event.operation === 'estimate' ? t('Estimativa') : tasks[event.task]}`,
              ),
              el('div', { className: 'field-hint' }, event.model),
            ),
            valueCell(statuses[event.status], true),
            valueCell(`${count(event.inputTokens)} / ${count(event.outputTokens)}`),
            valueCell(money(event.estimatedCostUsd), true),
          ]),
        ),
        el(
          'p',
          { className: 'field-hint' },
          t(
            'Até 100 chamadas recentes. Os totais usam todas as chamadas do período e os preços registrados na geração.',
          ),
        ),
      ),
    );
  }
  days.addEventListener('change', () => {
    void refresh();
  });
  provider.addEventListener('change', () => {
    void refresh();
  });
  node.append(
    el(
      'div',
      { className: 'form-grid' },
      field(t('Período do consumo'), days),
      field(t('Provedor do consumo'), provider),
    ),
    el('div', { className: 'form-actions' }, refreshButton),
    status,
    content,
    el(
      'p',
      { className: 'field-hint' },
      t(
        'Este registro cobre somente o uso feito pelo Studio. Ele não representa o saldo da conta, a fatura oficial ou chamadas feitas por outros aplicativos. Assinatura do aplicativo e acesso/consumo da API seguem cobranças próprias. Consulte créditos no provedor.',
      ),
    ),
    el(
      'div',
      { className: 'form-actions' },
      externalLink(t('Consumo oficial OpenAI'), 'https://platform.openai.com/usage'),
      externalLink(t('Consumo oficial Anthropic'), 'https://platform.claude.com/usage'),
    ),
  );
  return { node, refresh };
}
