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
import { t, translateMessage } from '../../shared/i18n.ts';

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
        ? t('Várias moedas')
        : recordedMoney(
            kind === 'payment' ? summaries[0].payments : summaries[0].costs,
            summaries[0].currency,
          );
  };
  const platform = studio.activePlatform;
  const sync = button(
    t('Consultar rede'),
    () => {
      void action(
        () => request(channelPath(`/connections/${platform}/sync`), 'POST', {}),
        t('Dados consultados no provedor.'),
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
      t('Visualizações'),
      number(latest?.stats.views),
      latest ? t('Período informado pelo provedor') : t('Aguardando dados da rede'),
      'chart',
    ),
    stat(
      t('Seguidores'),
      number(latest?.stats.followers),
      latest ? t('Contagem na última consulta') : t('Nenhum valor presumido'),
      'channels',
    ),
    stat(
      t('Receita estimada'),
      money(latest?.revenue.estimatedCents, latest?.revenue.currency),
      latest?.revenue.estimatedCents == null
        ? t('Indisponível ou sem permissão')
        : t('Estimativa do provedor, não pagamento'),
      'chart',
    ),
    stat(t('Pagamentos registrados'), totals('payment'), t('Registros manuais do operador'), 'folder'),
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
        ...[t('Consulta'), t('Período'), t('Views'), t('Seguidores'), t('Receita estimada')].map((label) =>
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
          el('td', {}, t('{start} a {end}', { start: entry.periodStart, end: entry.periodEnd })),
          el('td', {}, number(entry.stats.views)),
          el('td', {}, number(entry.stats.followers)),
          el(
            'td',
            { className: 'amount', title: translateMessage(entry.revenue.reason) },
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
        ...[t('Data'), t('Natureza'), t('Valor'), t('Observação'), ''].map((label) =>
          el('th', { scope: 'col' }, label),
        ),
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
                // Payments stand out a little; costs and estimates stay outlined.
                { className: 'badge', 'data-variant': entry.kind === 'payment' ? 'secondary' : 'outline' },
                entry.kind === 'cost'
                  ? t('Custo manual')
                  : entry.kind === 'payment'
                    ? t('Pagamento manual')
                    : t('Estimativa manual'),
              ),
            ),
            el('td', { className: 'amount' }, money(entry.amountCents, entry.currency)),
            el('td', {}, entry.note),
            el(
              'td',
              {},
              iconButton(t('Editar registro financeiro'), 'edit', () => editReceipt(entry)),
              iconButton(t('Excluir registro financeiro'), 'trash', () =>
                deleteRecord('receipts', entry.id, entry.note || t('Registro financeiro')),
              ),
            ),
          ),
        ),
    ),
  );
  const metadata = latest
    ? t('{network} · Coleta: {date} · Conta: {account}', {
        network: labels[platform],
        date: date(latest.fetchedAt),
        account: latest.accountId,
      })
    : t('Dados desconhecidos aparecem como —. Conectar uma conta não comprova monetização.');
  return el(
    'div',
    {},
    heading(
      t('Resultados'),
      t('Dados de audiência e finanças com origem e contexto.'),
      button(t('Registro financeiro'), () => editReceipt(), 'secondary', 'plus'),
      sync,
    ),
    platformTabs(),
    stats,
    notice(
      translateMessage(latest?.revenue.reason || capability?.revenueNote || '') ||
        t('A receita depende do programa, da conta e dos escopos concedidos. Nenhuma receita é presumida.'),
    ),
    el(
      'div',
      { className: 'section-label' },
      el('h2', {}, t('Consultas ao provedor')),
      el(
        'span',
        {},
        latest ? t('Snapshots preservados · Não somar contagens acumuladas') : t('Sem coleta registrada'),
      ),
    ),
    panel(
      t('Histórico de dados'),
      metadata,
      snapshots.length
        ? el('div', { className: 'table-scroll' }, snapshotTable)
        : empty(
            t('Conecte a conta e consulte suas métricas'),
            t('Os dados disponíveis dependem das capacidades e permissões da API oficial de cada rede.'),
            'chart',
            button(t('Configurar conexão'), () => go('connections'), 'primary', 'plug'),
          ),
    ),
    el(
      'div',
      { className: 'section-label' },
      el('h2', {}, t('Seu registro financeiro')),
      el('span', {}, t('Custos registrados: {total}', { total: totals('cost') })),
    ),
    panel(
      t('Histórico financeiro'),
      t('Registros manuais são identificados e não substituem extratos ou confirmação da plataforma.'),
      receipts.length
        ? el('div', { className: 'table-scroll' }, receiptTable)
        : empty(
            t('Nenhum registro financeiro neste canal e rede'),
            t('Registre somente o que você conhece, indicando se é custo, estimativa ou pagamento.'),
            'folder',
            button(t('Adicionar registro'), () => editReceipt(), 'secondary', 'plus'),
          ),
    ),
  );
}

export function editReceipt(record?: RevenueEntry): void {
  const { dialog, body } = createDialog(
    record ? t('Editar registro financeiro') : t('Registrar um movimento'),
    t('Registro manual, associado à rede e ao canal selecionados.'),
  );
  const platform = select(
    'platform',
    platforms.map((entry) => [entry, labels[entry]]),
    record?.platform || studio.activePlatform,
  );
  const kind = select(
    'kind',
    [
      ['cost', t('Custo realizado')],
      ['estimate', t('Estimativa manual')],
      ['payment', t('Pagamento recebido — registro manual')],
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
    t('Salvar registro'),
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
      toast(t('Registro financeiro salvo com origem manual.'));
    },
    () => dialog.close(),
  );
  fields.append(
    el(
      'div',
      { className: 'form-grid' },
      field(t('Rede'), platform),
      field(t('Natureza'), kind),
      field(t('Valor'), amount),
      field(t('Moeda'), currency, t('Código de três letras, como BRL ou USD.')),
      field(t('Data do registro'), when),
      field(t('Início do período (opcional)'), from),
      field(t('Fim do período (opcional)'), to),
    ),
    field(t('Origem, motivo e observações'), note),
    notice(
      t(
        'Estimativa e pagamento são registros diferentes. Não informe uma previsão como dinheiro recebido; use as evidências da sua própria conta.',
      ),
    ),
  );
  body.append(form);
}
