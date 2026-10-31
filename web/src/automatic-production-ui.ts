import type { Channel, Script, Research, WebJob } from '../shared/types.ts';
import type { CreativeCapabilities, CreativeQuote } from '../shared/creative-types.ts';
import { request } from './api.ts';
import { createDialog, formWithSave, notice, videoStyleField } from './components.ts';
import { protectEdits } from './edit-protection.ts';
import { el, field, textarea, select, button, replace, setButtonLabel } from './dom.ts';
interface AutomaticProductionOptions {
  channel: Channel;
  scripts: Script[];
  research: Research[];
  selectedScriptId?: string;
  currentChannelId: () => string;
  onStarted: (job: WebJob) => Promise<void>;
  onManual: (scriptId?: string) => void;
  onSettings: () => void;
  api?: typeof request;
}
const usd = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(
    value,
  );

export function openAutomaticProduction(options: AutomaticProductionOptions): HTMLDialogElement {
  const { dialog, body } = createDialog(
    'Novo vídeo',
    `Canal: ${options.channel.name}. Você manda a pauta e revisa o vídeo pronto.`,
  );
  const owner = options.channel.id,
    api = options.api ?? request,
    active = () => dialog.isConnected && options.currentChannelId() === owner;
  const scripts = options.scripts.filter((item) => item.channelId === owner && item.status !== 'archived'),
    research = options.research.filter((item) => item.channelId === owner && item.status !== 'archived');
  const selected = scripts.find((item) => item.id === options.selectedScriptId) ?? scripts[0];
  const brief = textarea('automatic-brief', selected?.title ?? '', 3);
  brief.required = true;
  brief.minLength = 3;
  brief.maxLength = 2000;
  brief.placeholder =
    'Ex.: explique como esta skill ajuda a melhorar uma interface, com um exemplo hipotético.';
  const format = select(
    'automatic-format',
    [
      ['short', 'Curto · 65 a 90 segundos'],
      ['long', 'Longo · 7 a 12 minutos'],
    ],
    selected?.format ?? 'short',
  );
  const { control: style, node: styleField } = videoStyleField('automatic-style');
  const reference = select(
    'automatic-reference',
    [
      ['', 'Começar pela orientação acima'],
      ...scripts.map((item): [string, string] => [`script:${item.id}`, `Roteiro: ${item.title}`]),
      ...research.map((item): [string, string] => [`research:${item.id}`, `Pauta: ${item.title}`]),
    ],
    selected ? `script:${selected.id}` : '',
  );
  const status = el(
      'p',
      { className: 'field-hint', role: 'status' },
      'Consultando o assistente configurado…',
    ),
    cost = el('div', { className: 'form-stack', hidden: true });
  const transfer = notice(
    'Para calcular o custo, suas instruções pessoais, a orientação e as referências serão enviadas ao provedor configurado. A geração paga começa somente após sua autorização.',
  );
  transfer.hidden = true;
  let provider = 'ollama',
    ready = false,
    quote: CreativeQuote | undefined;
  const cloud = () => provider !== 'ollama';
  const payload = () => ({
    brief: brief.value.trim(),
    format: format.value,
    ...(style.value ? { style: style.value } : {}),
    ...(reference.value.startsWith('script:')
      ? { scriptId: reference.value.slice(7) }
      : reference.value.startsWith('research:')
        ? { researchId: reference.value.slice(9) }
        : {}),
  });
  const label = () =>
    cloud() ? (quote ? 'Autorizar e produzir' : 'Calcular custo da produção') : 'Produzir neste computador';
  const reset = () => {
    quote = undefined;
    cost.hidden = true;
    replace(cost);
  };
  const { form, fields } = formWithSave(
    label,
    async () => {
      if (!active()) throw new Error('O canal mudou. Abra a produção novamente.');
      if (!ready) throw new Error('Configure um assistente disponível antes de produzir.');
      if (cloud() && !quote) {
        const result = await api<CreativeQuote>(
          `/api/channels/${encodeURIComponent(owner)}/automatic/quote`,
          'POST',
          payload(),
        );
        if (!active()) return false;
        if (
          result.channelId !== owner ||
          !result.id ||
          !Number.isFinite(result.estimatedMaxCostUsd) ||
          !Number.isFinite(result.costLimitUsd) ||
          result.estimatedMaxCostUsd < 0 ||
          result.estimatedMaxCostUsd > result.costLimitUsd ||
          !Number.isFinite(Date.parse(result.expiresAt)) ||
          Date.parse(result.expiresAt) <= Date.now()
        )
          throw new Error('A estimativa não corresponde a este pedido. Calcule novamente.');
        quote = result;
        replace(
          cost,
          el(
            'p',
            {},
            (result.attempts ?? 1) > 1
              ? `Roteiro com ${result.model}: até ${usd(result.estimatedMaxCostUsd)}, cobrindo até ${result.attempts} gerações para cumprir a duração do formato. Limite configurado: ${usd(result.costLimitUsd)}.`
              : `Uma geração de roteiro com ${result.model}: até ${usd(result.estimatedMaxCostUsd)}. Limite configurado: ${usd(result.costLimitUsd)}.`,
          ),
          el(
            'p',
            { className: 'field-hint' },
            'Visuais, voz, montagem e QA seguem localmente, sem outras chamadas pagas de IA nesta produção.',
          ),
        );
        cost.hidden = false;
        status.textContent = 'Confira o custo e autorize a produção completa.';
        return false;
      }
      const authorization = quote;
      if (cloud() && (!authorization || Date.parse(authorization.expiresAt) <= Date.now())) {
        reset();
        throw new Error('A estimativa expirou. Calcule novamente.');
      }
      reset();
      status.textContent = 'Iniciando a sequência no servidor. Acompanhe as etapas na fila de produção.';
      try {
        const job = await api<WebJob>(`/api/channels/${encodeURIComponent(owner)}/automatic/jobs`, 'POST', {
          ...payload(),
          ...(cloud() ? { quoteId: authorization!.id, authorizePaid: true } : {}),
        });
        if (active()) {
          dialog.close();
          await options.onStarted(job);
        }
      } catch (error) {
        status.textContent =
          'Confira a fila e o consumo antes de repetir. A produção não será reenviada automaticamente.';
        throw error;
      }
    },
    () => dialog.close(),
    'Preparando produção…',
  );
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  submit.disabled = true;
  for (const control of [brief, format, style, reference])
    control.addEventListener(control === brief ? 'input' : 'change', () => {
      if (quote) {
        reset();
        setButtonLabel(submit, label(), 'check');
        status.textContent = 'Pedido alterado. Calcule novamente antes de autorizar.';
      }
    });
  // Without an assistant key the way out is one click away, not a path to remember (Tesler).
  const setup = button(
    'Configurar assistente',
    () =>
      protectEdits(() => {
        dialog.close();
        options.onSettings();
      }, form),
    'secondary',
    'settings',
  );
  setup.hidden = true;
  setup.classList.add('w-fit', 'justify-self-start');
  // Only what every video needs stays in view; references, format and manual paths wait in
  // one disclosure (Hick's law, progressive disclosure). Cost and status never hide.
  const more = el(
    'details',
    { className: 'grid gap-3' },
    el('summary', { className: 'w-fit cursor-pointer text-sm font-medium' }, 'Mais opções'),
    el(
      'div',
      { className: 'form-stack' },
      field('Referência do canal', reference),
      styleField,
      el(
        'p',
        { className: 'field-hint' },
        'Roteiro → visuais → narração → montagem com legendas → QA → sua revisão.',
      ),
      button(
        'Abrir preparação manual',
        () =>
          protectEdits(() => {
            dialog.close();
            options.onManual(reference.value.startsWith('script:') ? reference.value.slice(7) : undefined);
          }, form),
        'secondary',
        'settings',
      ),
      button(
        'Configurar assistente',
        () =>
          protectEdits(() => {
            dialog.close();
            options.onSettings();
          }, form),
        'secondary',
        'settings',
      ),
    ),
  );
  fields.append(
    field(
      'Sobre o que é o vídeo?',
      brief,
      'Uma ou duas frases. A IA escreve o roteiro; o motor monta cenas, voz e legendas.',
    ),
    field('Duração', format),
    more,
    transfer,
    cost,
    status,
    setup,
    el('p', { className: 'field-hint' }, 'Sai como prévia para sua revisão; nada é publicado sem você.'),
  );
  body.append(form);
  void api<CreativeCapabilities>(`/api/creative/capabilities?channel_id=${encodeURIComponent(owner)}`)
    .then((capabilities) => {
      if (!active()) return;
      provider = capabilities.provider;
      ready = capabilities.available;
      transfer.hidden = !cloud();
      submit.disabled = !ready;
      setup.hidden = ready;
      setButtonLabel(submit, label(), 'check');
      status.textContent = ready
        ? `Assistente: ${capabilities.selectedModel}. ${cloud() ? 'Calcule o custo antes de autorizar.' : 'A produção usa o modelo local configurado.'}`
        : capabilities.reason;
    })
    .catch((error) => {
      if (active()) {
        status.textContent =
          error instanceof Error ? error.message : 'Não foi possível consultar o assistente.';
        submit.disabled = true;
      }
    });
  return dialog;
}
