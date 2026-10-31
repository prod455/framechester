import { cashSummary, recordedMoney } from '../../shared/finance.ts';
import { panel } from '../components.ts';
import { button, el } from '../dom.ts';
import { renderOverview } from '../overview.ts';
import { currentChannel, go, state, studio } from '../studio/state.ts';
import { editChannel } from './channels.ts';
import { viewJob } from './production.ts';
import { editResearch } from './research.ts';
import { t, translateMessage } from '../../shared/i18n.ts';

export function dataTile(label: string, value: string, detail: string): HTMLElement {
  return el(
    'div',
    { className: 'data-tile' },
    el('div', { className: 'data-tile-label' }, label),
    el('div', { className: 'data-tile-value' }, translateMessage(value)),
    el('div', { className: 'data-tile-detail' }, detail),
  );
}

export function recordedCashPanel(): HTMLElement {
  const summaries = cashSummary(state().receipts, studio.channelId);
  const body = el('div', { className: 'panel-body cash-panel', 'data-testid': 'recorded-cash' });
  if (!summaries.length) {
    body.append(
      el(
        'div',
        { className: 'cash-grid' },
        dataTile(t('Recebimentos'), '—', t('Nenhum pagamento registrado')),
        dataTile(t('Custos'), '—', t('Nenhum custo registrado')),
        dataTile(t('Saldo entre registros'), '—', t('Requer recebimentos e custos na mesma moeda')),
      ),
    );
  }
  for (const { currency, payments, costs, balance } of summaries) {
    body.append(
      el(
        'div',
        { className: 'cash-currency' },
        el('span', { className: 'badge', 'data-variant': 'secondary' }, currency),
        el(
          'div',
          { className: 'cash-grid' },
          dataTile(
            t('Recebimentos'),
            recordedMoney(payments, currency),
            t('Pagamentos registrados pelo operador'),
          ),
          dataTile(t('Custos'), recordedMoney(costs, currency), t('Custos registrados pelo operador')),
          dataTile(
            t('Saldo entre registros'),
            recordedMoney(balance, currency),
            t('Recebimentos menos custos registrados'),
          ),
        ),
      ),
    );
  }
  body.append(
    el(
      'p',
      { className: 'field-hint cash-note' },
      t(
        'Estimativas não entram neste resumo. O saldo considera os registros existentes; não representa lucro econômico nem conciliação automática da plataforma.',
      ),
    ),
  );
  return panel(
    t('Recebimentos e custos'),
    t('Todas as redes. Valores registrados por você, separados por moeda.'),
    body,
    button(t('Ver registros'), () => go('analytics'), 'ghost', 'arrow'),
  );
}

export function overviewPage(): HTMLElement {
  return renderOverview(
    state(),
    studio.channelId,
    {
      go,
      createResearch: () => (currentChannel() ? editResearch() : editChannel()),
      review: viewJob,
      editResearch,
      editScript: (script) => {
        studio.activeScriptId = script.id;
        go('scripts');
      },
    },
    recordedCashPanel(),
  );
}
