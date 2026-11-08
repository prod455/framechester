import type { Channel, Script, WebJob } from '../shared/types.ts';
import { t } from '../shared/i18n.ts';
import { request } from './api.ts';
import { createDialog, empty, formWithSave } from './components.ts';
import { protectEdits } from './edit-protection.ts';
import { button, el, field, replace, select } from './dom.ts';

interface ProductionOptions {
  channel: Channel;
  scripts: Script[];
  selectedScriptId?: string;
  currentChannelId: () => string;
  onStarted: (job: WebJob) => Promise<void>;
  onEditScript: (scriptId: string) => void;
  api?: typeof request;
}

/** A saved script is all the motion engine needs: it draws every scene from the storyboard. */
export function openProduction(options: ProductionOptions): HTMLDialogElement {
  const { dialog, body } = createDialog(
    t('Preparar vídeo'),
    t('Canal: {channel}. Escolha o roteiro e confira o que falta para gerar o vídeo.', {
      channel: options.channel.name,
    }),
  );
  dialog.classList.add('production-dialog');
  const owner = options.channel.id,
    api = options.api ?? request;
  const scripts = options.scripts.filter(
    (script) => script.channelId === owner && script.status !== 'archived',
  );
  if (!scripts.length) {
    body.append(
      empty(
        t('Adicione um roteiro primeiro'),
        t('O motor usa as falas e as cenas do roteiro.'),
        'script',
        button(
          t('Ir para roteiros'),
          () => {
            dialog.close();
            options.onEditScript('');
          },
          'primary',
          'arrow',
        ),
      ),
    );
    return dialog;
  }
  let active = scripts.some((script) => script.id === options.selectedScriptId)
    ? options.selectedScriptId!
    : scripts[0].id;
  const picker = select(
    'scriptId',
    scripts.map((script) => [script.id, script.title]),
    active,
  );
  const editor = el('div', { className: 'form-stack' });
  body.append(field(t('Roteiro'), picker), editor);
  const path = (suffix: string) => `/api/channels/${encodeURIComponent(owner)}/${suffix}`;
  const relevant = (scriptId: string) =>
    dialog.isConnected && options.currentChannelId() === owner && active === scriptId;
  const leaveFor = (action: () => void) =>
    protectEdits(() => {
      dialog.close();
      action();
    }, editor);
  function show() {
    const scriptId = active;
    const script = scripts.find((script) => script.id === scriptId)!;
    let finalRequested = false;
    const { form, fields, actions } = formWithSave(
      t('Gerar prévia do vídeo'),
      async () => {
        const previewOnly = !finalRequested;
        if (!relevant(scriptId)) throw new Error(t('O canal ou roteiro mudou. Abra a preparação novamente.'));
        if (!previewOnly && !script.crossChecked)
          throw new Error(
            t('Marque “Conferi e cruzei as fontes e as alegações” no roteiro antes da versão final.'),
          );
        const job = await api<WebJob>(path('jobs'), 'POST', {
          scriptId,
          ...(previewOnly ? { previewOnly: true } : {}),
        });
        dialog.close();
        await options.onStarted(job);
      },
      () => dialog.close(),
      t('Iniciando produção…'),
    );
    // The final version needs the operator's declaration. A missing source is named by QA in the
    // report; only a contradicted claim or a reference outside the sources blocks it, the same
    // rule the engine applies.
    const sourceUrls = new Set(script.sources.map((source) => source.url));
    const claimsReady = script.claims.every(
      (claim) => claim.status !== 'contradicted' && claim.sourceUrls.every((url) => sourceUrls.has(url)),
    );
    const editorialReady = script.crossChecked && claimsReady;
    const editorialReason = !script.crossChecked
      ? t(
          'Para a versão final, marque “Conferi e cruzei as fontes e as alegações” no roteiro (aba Fontes e revisão).',
        )
      : t(
          'Para a versão final, corrija no roteiro as alegações marcadas como contradição ou com URL fora das fontes.',
        );
    const scenes = script.scenes.length;
    const summary = el(
      'section',
      { className: 'production-summary' },
      el(
        'h3',
        {},
        scenes === 1
          ? t('{count} cena no roteiro', { count: scenes })
          : t('{count} cenas no roteiro', { count: scenes }),
      ),
      el('p', {}, t('O motor motion anima cada cena a partir do roteiro, com a voz e as legendas do canal.')),
    );
    if (!editorialReady)
      summary.append(
        el(
          'div',
          { className: 'production-summary-actions' },
          button(
            t('Revisar roteiro'),
            () => leaveFor(() => options.onEditScript(scriptId)),
            'secondary',
            'script',
          ),
        ),
      );
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    const finalButton = button(
      t('Gerar versão final'),
      () => {
        finalRequested = true;
        form.requestSubmit(submit);
        finalRequested = false;
      },
      'secondary',
      'film',
    );
    finalButton.dataset.testid = 'final-video';
    finalButton.disabled = !editorialReady;
    actions.insertBefore(finalButton, submit);
    fields.append(
      summary,
      el(
        'p',
        { className: 'field-hint', role: 'status' },
        editorialReady ? t('Cenas prontas para gerar o vídeo neste computador.') : editorialReason,
      ),
      el(
        'p',
        { className: 'field-hint' },
        t(
          'A prévia de vídeo pode ser gerada antes da revisão editorial e recebe uma marca de revisão. A animação e a montagem são locais. A adaptação com IA pede autorização antes de qualquer geração paga.',
        ),
      ),
    );
    replace(editor, form);
  }
  picker.addEventListener('change', () => {
    const selected = picker.value;
    picker.value = active;
    protectEdits(() => {
      active = selected;
      picker.value = selected;
      show();
    }, editor);
  });
  show();
  return dialog;
}
