import { cashSummary, money, recordedMoney } from '../../shared/finance.ts';
import { request } from '../api.ts';
import { createDialog, empty, formWithSave, heading, iconButton, notice, panel } from '../components.ts';
import { button, el, field, icon, input, select, textarea } from '../dom.ts';
import { date, number } from '../format.ts';
import { labels, platforms } from '../studio/platforms.ts';
import { action, channelPath, go, save, scoped, state, studio } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import { deleteRecord, requiredChannel } from './channels.ts';
import { platformTabs } from './connections.ts';
import type { RevenueEntry } from '../../shared/types.ts';
import type { IconName } from '../dom.ts';

export function stat(label: string, value: string, detail: string, name: IconName): HTMLElement {
  return el(
    'div',
    { className: 'stat-card' },
    el('div', { className: 'stat-label' }, icon(name), label),
    el('div', { className: 'stat-value' }, value),
    el('div', { className: 'stat-detail' }, detail),
  );
}

export function analyticsPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const snapshot = state();
  const snapshots = scoped(snapshot.monetization)
    .filter((entry) => entry.platform === studio.activePlatform)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  const latest = snapshots[0];
  const connection = scoped(snapshot.connections).find((entry) => entry.platform === studio.activePlatform);
  const receipts = scoped(snapshot.receipts).filter((entry) => entry.platform === studio.activePlatform);
  const capability = snapshot.capabilities.find((entry) => entry.platform === studio.activePlatform);
  const totals = (kind: 'payment' | 'cost') => {
    const entries = receipts.filter((entry) => entry.kind === kind);
    const summaries = cashSummary(entries, studio.channelId);
    return !summaries.length
      ? '—'
      : summaries.length > 1
        ? 'Várias moedas'
        : recordedMoney(
            kind === 'payment' ? summaries[0].payments : summaries[0].costs,
            summaries[0].currency,
          );
  };
  const platform = studio.activePlatform;
  const sync = button(
    'Consultar rede',
    () => {
      void action(
        () => request(channelPath(`/connections/${platform}/sync`), 'POST', {}),
        'Dados consultados no provedor.',
      );
    },
    'primary',
    'refresh',
  );
  sync.disabled = connection?.status !== 'connected' || !capability?.metricsAvailable;
  const stats = el(
    'div',
    { className: 'stats-grid' },
    stat(
      'Visualizações',
      number(latest?.stats.views),
      latest ? 'Período informado pelo provedor' : 'Aguardando dados da rede',
      'chart',
    ),
    stat(
      'Seguidores',
      number(latest?.stats.followers),
      latest ? 'Contagem na última consulta' : 'Nenhum valor presumido',
      'channels',
    ),
    stat(
      'Receita estimada',
      money(latest?.revenue.estimatedCents, latest?.revenue.currency),
      latest?.revenue.estimatedCents == null
        ? 'Indisponível ou sem permissão'
        : 'Estimativa do provedor, não pagamento',
      'chart',
    ),
    stat('Pagamentos registrados', totals('payment'), 'Registros manuais do operador', 'folder'),
  );
  const snapshotTable = el(
    'table',
    { className: 'table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...['Consulta', 'Período', 'Views', 'Seguidores', 'Receita estimada'].map((label) =>
          el('th', { scope: 'col' }, label),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...snapshots.map((entry) =>
        el(
          'tr',
          {},
          el('td', {}, date(entry.fetchedAt)),
          el('td', {}, `${entry.periodStart} a ${entry.periodEnd}`),
          el('td', {}, number(entry.stats.views)),
          el('td', {}, number(entry.stats.followers)),
          el(
            'td',
            { className: 'amount', title: entry.revenue.reason },
            money(entry.revenue.estimatedCents, entry.revenue.currency),
          ),
        ),
      ),
    ),
  );
  const receiptTable = el(
    'table',
    { className: 'table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...['Data', 'Natureza', 'Valor', 'Observação', ''].map((label) => el('th', { scope: 'col' }, label)),
      ),
    ),
    el(
      'tbody',
      {},
      ...receipts
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((entry) =>
          el(
            'tr',
            {},
            el('td', {}, entry.date),
            el(
              'td',
              {},
              el(
                'span',
                { className: 'badge' },
                entry.kind === 'cost'
                  ? 'Custo manual'
                  : entry.kind === 'payment'
                    ? 'Pagamento manual'
                    : 'Estimativa manual',
              ),
            ),
            el('td', { className: 'amount' }, money(entry.amountCents, entry.currency)),
            el('td', {}, entry.note),
            el(
              'td',
              {},
              iconButton('Editar registro financeiro', 'edit', () => editReceipt(entry)),
              iconButton('Excluir registro financeiro', 'trash', () =>
                deleteRecord('receipts', entry.id, entry.note || 'Registro financeiro'),
              ),
            ),
          ),
        ),
    ),
  );
  const metadata = latest
    ? `${labels[platform]} · Coleta: ${date(latest.fetchedAt)} · Conta: ${latest.accountId}`
    : 'Dados desconhecidos aparecem como —. Conectar uma conta não comprova monetização.';
  return el(
    'div',
    {},
    heading(
      'Resultados',
      'Dados de audiência e finanças com origem e contexto.',
      button('Registro financeiro', () => editReceipt(), 'secondary', 'plus'),
      sync,
    ),
    platformTabs(),
    stats,
    notice(
      latest?.revenue.reason ||
        capability?.revenueNote ||
        'A receita depende do programa, da conta e dos escopos concedidos. Nenhuma receita é presumida.',
    ),
    el(
      'div',
      { className: 'section-label' },
      el('h2', {}, 'Consultas ao provedor'),
      el(
        'span',
        {},
        latest ? 'Snapshots preservados · Não somar contagens acumuladas' : 'Sem coleta registrada',
      ),
    ),
    panel(
      'Histórico de dados',
      metadata,
      snapshots.length
        ? el('div', { className: 'table-scroll' }, snapshotTable)
        : empty(
            'Conecte a conta e consulte suas métricas',
            'Os dados disponíveis dependem das capacidades e permissões da API oficial de cada rede.',
            'chart',
            button('Configurar conexão', () => go('connections'), 'primary', 'plug'),
          ),
    ),
    el(
      'div',
      { className: 'section-label' },
      el('h2', {}, 'Seu registro financeiro'),
      el('span', {}, `Custos registrados: ${totals('cost')}`),
    ),
    panel(
      'Histórico financeiro',
      'Registros manuais são identificados e não substituem extratos ou confirmação da plataforma.',
      receipts.length
        ? el('div', { className: 'table-scroll' }, receiptTable)
        : empty(
            'Nenhum registro financeiro neste canal e rede',
            'Registre somente o que você conhece, indicando se é custo, estimativa ou pagamento.',
            'folder',
            button('Adicionar registro', () => editReceipt(), 'secondary', 'plus'),
          ),
    ),
  );
}

export function editReceipt(record?: RevenueEntry): void {
  const { dialog, body } = createDialog(
    record ? 'Editar registro financeiro' : 'Registrar um movimento',
    'Registro manual, associado à rede e ao canal selecionados.',
  );
  const platform = select(
    'platform',
    platforms.map((entry) => [entry, labels[entry]]),
    record?.platform || studio.activePlatform,
  );
  const kind = select(
    'kind',
    [
      ['cost', 'Custo realizado'],
      ['estimate', 'Estimativa manual'],
      ['payment', 'Pagamento recebido — registro manual'],
    ],
    record?.kind || 'cost',
  );
  const amount = input('amount', record ? String(record.amountCents / 100) : '', 'number');
  amount.min = '0';
  amount.step = '0.01';
  amount.required = true;
  const currency = input('currency', record?.currency || 'BRL');
  currency.required = true;
  currency.maxLength = 3;
  currency.pattern = '[A-Za-z]{3}';
  const when = input('date', record?.date || '', 'date');
  when.required = true;
  const note = textarea('note', record?.note || '', 3);
  note.required = true;
  const from = input('periodStart', record?.periodStart || '', 'date');
  const to = input('periodEnd', record?.periodEnd || '', 'date');
  const { form, fields } = formWithSave(
    'Salvar registro',
    async () => {
      await save(
        record ? `/api/receipts/${encodeURIComponent(record.id)}` : '/api/receipts',
        record ? 'PUT' : 'POST',
        {
          channelId: studio.channelId,
          platform: platform.value,
          kind: kind.value,
          amountCents: Math.round(Number(amount.value) * 100),
          currency: currency.value.toUpperCase(),
          date: when.value,
          note: note.value.trim(),
          source: 'manual',
          periodStart: from.value || undefined,
          periodEnd: to.value || undefined,
        },
      );
      dialog.close();
      toast('Registro financeiro salvo com origem manual.');
    },
    () => dialog.close(),
  );
  fields.append(
    el(
      'div',
      { className: 'form-grid' },
      field('Rede', platform),
      field('Natureza', kind),
      field('Valor', amount),
      field('Moeda', currency, 'Código de três letras, como BRL ou USD.'),
      field('Data do registro', when),
      field('Início do período (opcional)', from),
      field('Fim do período (opcional)', to),
    ),
    field('Origem, motivo e observações', note),
    notice(
      'Estimativa e pagamento são registros diferentes. Não informe uma previsão como dinheiro recebido; use as evidências da sua própria conta.',
    ),
  );
  body.append(form);
}
