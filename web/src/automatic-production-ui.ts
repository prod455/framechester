import type { Channel, Script, Research, WebJob } from '../shared/types.ts';
import type { CreativeCapabilities, CreativeQuote } from '../shared/creative-types.ts';
import { request } from './api.ts';
import { createDialog, formWithSave, notice, videoStyleField } from './components.ts';
import { protectEdits } from './edit-protection.ts';
import { el, field, textarea, select, button, replace, setButtonLabel } from './dom.ts';
import { languageTag, t, translateMessage } from '../shared/i18n.ts';
import { productionLanguage } from '../shared/voices.ts';
interface AutomaticProductionOptions {
  channel: Channel;
  /** Every channel of the operator; the ones in another language can receive a version. */
  channels?: Channel[];
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
  new Intl.NumberFormat(languageTag(), {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(value);

export function openAutomaticProduction(options: AutomaticProductionOptions): HTMLDialogElement {
  const { dialog, body } = createDialog(
    t('Novo vídeo'),
    t('Canal: {channel}. Você manda a pauta e revisa o vídeo pronto.', { channel: options.channel.name }),
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
  brief.placeholder = t(
    'Ex.: explique como esta skill ajuda a melhorar uma interface, com um exemplo hipotético.',
  );
  const format = select(
    'automatic-format',
    [
      ['short', t('Curto · 65 a 90 segundos')],
      ['long', t('Longo · 7 a 12 minutos')],
    ],
    selected?.format ?? 'short',
  );
  const { control: style, node: styleField } = videoStyleField('automatic-style');
  const reference = select(
    'automatic-reference',
    [
      ['', t('Começar pela orientação acima')],
      ...scripts.map((item): [string, string] => [
        `script:${item.id}`,
        t('Roteiro: {title}', { title: item.title }),
      ]),
      ...research.map((item): [string, string] => [
        `research:${item.id}`,
        t('Pauta: {title}', { title: item.title }),
      ]),
    ],
    selected ? `script:${selected.id}` : '',
  );
  // Language versions: the same video, written natively by the AI in each channel's language.
  const own = productionLanguage(options.channel.language)?.tag;
  const versions = (options.channels ?? [])
    .filter((item) => item.id !== owner)
    .filter((item) => {
      const language = productionLanguage(item.language)?.tag;
      return language !== undefined && language !== own;
    })
    .map((item) => {
      const box = el('input', { type: 'checkbox', name: `version-${item.id}` }) as HTMLInputElement;
      box.dataset.testid = `version-${item.id}`;
      return { channel: item, box };
    });
  const status = el(
      'p',
      { className: 'field-hint', role: 'status' },
      t('Consultando o assistente configurado…'),
    ),
    cost = el('div', { className: 'form-stack', hidden: true });
  const transfer = notice(
    t(
      'Para calcular o custo, suas instruções pessoais, a orientação e as referências serão enviadas ao provedor configurado. A geração paga começa somente após sua autorização.',
    ),
  );
  transfer.hidden = true;
  let provider = 'ollama',
    ready = false,
    // One entry per channel that will produce; a paid assistant's entry carries its quote.
    plan: Array<{ channel: Channel; quote?: CreativeQuote }> | undefined;
  const cloud = () => provider !== 'ollama';
  const targets = () => [
    options.channel,
    ...versions.filter((item) => item.box.checked).map((item) => item.channel),
  ];
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
    plan?.some((item) => item.quote)
      ? t('Autorizar e produzir')
      : cloud()
        ? t('Calcular custo da produção')
        : t('Produzir neste computador');
  const reset = () => {
    plan = undefined;
    cost.hidden = true;
    replace(cost);
  };
  const valid = (result: CreativeQuote, channelId: string) =>
    result.channelId === channelId &&
    Boolean(result.id) &&
    Number.isFinite(result.estimatedMaxCostUsd) &&
    Number.isFinite(result.costLimitUsd) &&
    result.estimatedMaxCostUsd >= 0 &&
    result.estimatedMaxCostUsd <= result.costLimitUsd &&
    Number.isFinite(Date.parse(result.expiresAt)) &&
    Date.parse(result.expiresAt) > Date.now();
  const requestBody = (target: Channel) => ({
    ...payload(),
    ...(target.id === owner ? {} : { originChannelId: owner }),
  });
  /** Each channel's assistant decides: a paid one is quoted, a local one starts as is. */
  const prepare = async () => {
    const prepared: Array<{ channel: Channel; quote?: CreativeQuote }> = [];
    for (const target of targets()) {
      const capabilities =
        target.id === owner
          ? { available: ready, provider, reason: '' }
          : await api<CreativeCapabilities>(
              `/api/creative/capabilities?channel_id=${encodeURIComponent(target.id)}`,
            );
      if (!capabilities.available)
        throw new Error(
          t('O assistente do canal {channel} não está disponível: {reason}', {
            channel: target.name,
            reason: translateMessage(capabilities.reason),
          }),
        );
      if (capabilities.provider === 'ollama') {
        prepared.push({ channel: target });
        continue;
      }
      const result = await api<CreativeQuote>(
        `/api/channels/${encodeURIComponent(target.id)}/automatic/quote`,
        'POST',
        requestBody(target),
      );
      if (!valid(result, target.id))
        throw new Error(t('A estimativa não corresponde a este pedido. Calcule novamente.'));
      prepared.push({ channel: target, quote: result });
    }
    return prepared;
  };
  const { form, fields } = formWithSave(
    label,
    async () => {
      if (!active()) throw new Error(t('O canal mudou. Abra a produção novamente.'));
      if (!ready) throw new Error(t('Configure um assistente disponível antes de produzir.'));
      if (!plan) {
        plan = await prepare();
        if (!active()) return false;
        const paid = plan.filter((item) => item.quote);
        if (paid.length) {
          const total = paid.reduce((sum, item) => sum + item.quote!.estimatedMaxCostUsd, 0);
          replace(
            cost,
            ...paid.map((item) =>
              el(
                'p',
                {},
                t('{channel}: roteiro com {model}, até {cost} ({attempts} gerações no máximo).', {
                  channel: item.channel.name,
                  model: item.quote!.model,
                  cost: usd(item.quote!.estimatedMaxCostUsd),
                  attempts: item.quote!.attempts ?? 1,
                }),
              ),
            ),
            ...(paid.length > 1
              ? [el('p', { className: 'font-medium' }, t('Total: até {cost}.', { cost: usd(total) }))]
              : []),
            el(
              'p',
              { className: 'field-hint' },
              t(
                'Visuais, voz, montagem e QA seguem localmente, sem outras chamadas pagas de IA nesta produção.',
              ),
            ),
          );
          cost.hidden = false;
          status.textContent = t('Confira o custo e autorize a produção completa.');
          return false;
        }
      }
      const authorized = plan;
      if (authorized.some((item) => item.quote && Date.parse(item.quote.expiresAt) <= Date.now())) {
        reset();
        throw new Error(t('A estimativa expirou. Calcule novamente.'));
      }
      reset();
      status.textContent = t('Iniciando a sequência no servidor. Acompanhe as etapas na fila de produção.');
      let first: WebJob | undefined;
      const failed: string[] = [];
      for (const item of authorized) {
        try {
          const job = await api<WebJob>(
            `/api/channels/${encodeURIComponent(item.channel.id)}/automatic/jobs`,
            'POST',
            {
              ...requestBody(item.channel),
              ...(item.quote ? { quoteId: item.quote.id, authorizePaid: true } : {}),
            },
          );
          if (item.channel.id === owner) first = job;
        } catch (error) {
          failed.push(
            `${item.channel.name}: ${error instanceof Error ? translateMessage(error.message) : t('falhou')}`,
          );
        }
      }
      if (failed.length) {
        status.textContent = t(
          'Confira a fila e o consumo antes de repetir. A produção não será reenviada automaticamente.',
        );
        if (!first) throw new Error(failed.join(' · '));
        status.textContent = failed.join(' · ');
      }
      if (active() && first) {
        dialog.close();
        await options.onStarted(first);
      }
    },
    () => dialog.close(),
    t('Preparando produção…'),
  );
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  submit.disabled = true;
  for (const control of [brief, format, style, reference, ...versions.map((item) => item.box)])
    control.addEventListener(control === brief ? 'input' : 'change', () => {
      setButtonLabel(submit, label(), 'check');
      if (plan) {
        reset();
        setButtonLabel(submit, label(), 'check');
        status.textContent = t('Pedido alterado. Calcule novamente antes de autorizar.');
      }
    });
  // Without an assistant key the way out is one click away, not a path to remember (Tesler).
  const setup = button(
    t('Configurar assistente'),
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
    el('summary', { className: 'w-fit cursor-pointer text-sm font-medium' }, t('Mais opções')),
    el(
      'div',
      { className: 'form-stack' },
      field(t('Referência do canal'), reference),
      styleField,
      el(
        'p',
        { className: 'field-hint' },
        t('Roteiro → visuais → narração → montagem com legendas → QA → sua revisão.'),
      ),
      button(
        t('Abrir preparação manual'),
        () =>
          protectEdits(() => {
            dialog.close();
            options.onManual(reference.value.startsWith('script:') ? reference.value.slice(7) : undefined);
          }, form),
        'secondary',
        'settings',
      ),
      button(
        t('Configurar assistente'),
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
      t('Sobre o que é o vídeo?'),
      brief,
      t('Uma ou duas frases. A IA escreve o roteiro; o motor monta cenas, voz e legendas.'),
    ),
    field(t('Duração'), format),
    ...(versions.length
      ? [
          el(
            'fieldset',
            { className: 'grid gap-2' },
            el('legend', { className: 'text-sm font-medium' }, t('Também em outros idiomas')),
            ...versions.map(({ channel, box }) =>
              el(
                'label',
                { className: 'checkbox-field' },
                box,
                `${channel.name} · ${productionLanguage(channel.language)!.label}`,
              ),
            ),
            el(
              'p',
              { className: 'field-hint' },
              t(
                'A IA escreve cada versão direto no idioma do canal, com as mesmas fontes, e cada canal publica pelas próprias contas.',
              ),
            ),
          ),
        ]
      : []),
    more,
    transfer,
    cost,
    status,
    setup,
    el('p', { className: 'field-hint' }, t('Sai como prévia para sua revisão; nada é publicado sem você.')),
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
        ? cloud()
          ? t('Assistente: {model}. Calcule o custo antes de autorizar.', {
              model: capabilities.selectedModel,
            })
          : t('Assistente: {model}. A produção usa o modelo local configurado.', {
              model: capabilities.selectedModel,
            })
        : translateMessage(capabilities.reason);
    })
    .catch((error) => {
      if (active()) {
        status.textContent =
          error instanceof Error
            ? translateMessage(error.message)
            : t('Não foi possível consultar o assistente.');
        submit.disabled = true;
      }
    });
  return dialog;
}
