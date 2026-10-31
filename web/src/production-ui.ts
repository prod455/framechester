import type { Channel, PreparedVisuals, Script, WebAsset, WebConfig, WebJob } from '../shared/types.ts';
import { t, translateMessage } from '../shared/i18n.ts';
import { request } from './api.ts';
import { createDialog, empty, formWithSave } from './components.ts';
import { protectEdits } from './edit-protection.ts';
import { button, el, field, input, replace, select } from './dom.ts';

interface ProductionOptions {
  channel: Channel;
  scripts: Script[];
  assets: WebAsset[];
  config: WebConfig;
  selectedScriptId?: string;
  currentChannelId: () => string;
  onStarted: (job: WebJob) => Promise<void>;
  onAddAssets: () => void;
  onEditScript: (scriptId: string) => void;
  onPrepared?: (prepared: PreparedVisuals) => void;
  api?: typeof request;
}

/** A saved script is the starting point; uploads are an optional source of visuals. */
export function openProduction(options: ProductionOptions): HTMLDialogElement {
  const { dialog, body } = createDialog(
    t('Preparar vídeo'),
    t('Canal: {channel}. Confira as prévias das cenas e o que falta para gerar o vídeo.', {
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
  async function prepare() {
    const scriptId = active;
    replace(editor, el('p', { role: 'status' }, t('Criando e vinculando os visuais deste roteiro…')));
    try {
      const prepared = await api<PreparedVisuals>(path('visuals/prepare'), 'POST', { scriptId });
      if (!relevant(scriptId)) return;
      if (prepared.scriptId !== scriptId || prepared.assets.some((asset) => asset.channelId !== owner))
        throw new Error(t('A preparação retornou recursos de outro roteiro ou canal.'));
      options.onPrepared?.(prepared);
      const script = scripts.find((script) => script.id === scriptId)!;
      const available = prepared.assets.filter((asset) => asset.channelId === owner);
      const mapping = el('div', { className: 'production-scenes' });
      const bindings: Array<{ sceneId: number; control: HTMLSelectElement }> = [];
      let updateReady = () => {};
      for (const [index, scene] of script.scenes.entries()) {
        const selected = prepared.bindings[String(scene.id)] ?? '';
        const control = select(
          `asset-${scene.id}`,
          [
            ['', t('Selecione uma imagem ou clipe do canal')],
            ...available.map((asset): [string, string] => [asset.id, asset.name]),
          ],
          selected,
        );
        bindings.push({ sceneId: scene.id, control });
        const preview = el('div', { className: 'production-scene-preview' });
        function showPreview() {
          const asset = available.find(
            (asset) => asset.id === (control.value || prepared.previews?.[String(scene.id)]),
          );
          preview.hidden = !asset;
          replace(
            preview,
            asset?.kind === 'image'
              ? el('img', {
                  src: path(`assets/${encodeURIComponent(asset.id)}/preview`),
                  alt: t('Visual de {heading}', { heading: scene.heading }),
                  loading: 'lazy',
                })
              : asset
                ? el('p', { className: 'field-hint' }, t('Clipe selecionado: {name}', { name: asset.name }))
                : null,
          );
        }
        control.addEventListener('change', () => {
          showPreview();
          updateReady();
        });
        showPreview();
        const row = el(
          'section',
          { className: 'production-scene' },
          el('h3', {}, t('Cena {number} · {heading}', { number: index + 1, heading: scene.heading })),
          preview,
        );
        row.append(
          el('p', { className: 'field-hint' }, t('Visual explicativo criado e associado a esta cena.')),
          el(
            'details',
            {},
            el('summary', {}, t('Usar outro recurso visual')),
            el(
              'div',
              { className: 'production-scene-source' },
              field(t('Imagem ou clipe do canal'), control),
              button(
                t('Adicionar arquivo próprio'),
                () => leaveFor(options.onAddAssets),
                'secondary',
                'plus',
              ),
            ),
          ),
        );
        mapping.append(row);
      }
      const asr = input('asr', '', 'checkbox');
      asr.checked = options.config.asr.enabled;
      const subtitles = input('burnSubtitles', '', 'checkbox');
      subtitles.checked = true;
      let finalRequested = false;
      const { form, fields, actions } = formWithSave(
        t('Gerar prévia do vídeo'),
        async () => {
          const previewOnly = !finalRequested;
          if (!relevant(scriptId))
            throw new Error(t('O canal ou roteiro mudou. Abra a preparação novamente.'));
          if (!previewOnly && !script.crossChecked)
            throw new Error(
              t('Marque “Conferi e cruzei as fontes e as alegações” no roteiro antes da versão final.'),
            );
          const job = await api<WebJob>(path('jobs'), 'POST', {
            scriptId,
            assetIds: Object.fromEntries(
              bindings.map((binding) => [
                String(binding.sceneId),
                binding.control.value ||
                  (previewOnly ? (prepared.previews?.[String(binding.sceneId)] ?? '') : ''),
              ]),
            ),
            asr: asr.checked,
            burnSubtitles: subtitles.checked,
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
      const previewCount = Object.keys(prepared.previews ?? prepared.bindings).length;
      const summary = el(
        'section',
        { className: 'production-summary' },
        el(
          'h3',
          {},
          previewCount === 1
            ? t('{count} prévia criada', { count: previewCount })
            : previewCount
              ? t('{count} prévias criadas', { count: previewCount })
              : t('A preparação precisa de atenção'),
        ),
        el(
          'p',
          {},
          t('Os visuais explicativos já estão vinculados às cenas. Confira as imagens antes de continuar.'),
        ),
      );
      const recovery = el('div', { className: 'production-summary-actions' });
      if (!editorialReady)
        recovery.append(
          button(
            t('Revisar roteiro'),
            () => leaveFor(() => options.onEditScript(scriptId)),
            'secondary',
            'script',
          ),
        );
      if (recovery.childElementCount) summary.append(recovery);
      if (!editorialReady) summary.append(el('p', { className: 'field-hint' }, editorialReason));
      const readiness = el('p', { className: 'field-hint', role: 'status' });
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
      actions.insertBefore(finalButton, submit);
      updateReady = () => {
        const missing = bindings.filter((binding) => !binding.control.value).length;
        finalButton.disabled = !editorialReady || missing > 0;
        submit.disabled = bindings.some(
          (binding) => !binding.control.value && !prepared.previews?.[String(binding.sceneId)],
        );
        readiness.textContent =
          missing === 1
            ? t(
                'Falta resolver {count} cena para gerar a versão final. As prévias ilustrativas já estão disponíveis.',
                { count: missing },
              )
            : missing
              ? t(
                  'Falta resolver {count} cenas para gerar a versão final. As prévias ilustrativas já estão disponíveis.',
                  { count: missing },
                )
              : !editorialReady
                ? editorialReason
                : t('Cenas prontas para gerar o vídeo neste computador.');
      };
      updateReady();
      fields.append(
        summary,
        mapping,
        el(
          'div',
          { className: 'production-options' },
          el('label', { className: 'checkbox-field' }, subtitles, t('Incluir legendas no vídeo')),
          el('label', { className: 'checkbox-field' }, asr, t('Conferir a fala com ASR local')),
        ),
        readiness,
        el(
          'p',
          { className: 'field-hint' },
          t(
            'A prévia de vídeo pode ser gerada antes da revisão editorial e recebe uma marca de revisão. Os visuais e a montagem são locais. A adaptação com IA pede autorização antes de qualquer geração paga.',
          ),
        ),
      );
      replace(editor, form);
    } catch (error) {
      if (!relevant(scriptId)) return;
      replace(
        editor,
        el(
          'div',
          { role: 'alert', className: 'alert' },
          error instanceof Error
            ? translateMessage(error.message)
            : t('Não foi possível preparar os visuais.'),
        ),
        button(
          t('Tentar de novo'),
          () => {
            void prepare();
          },
          'secondary',
          'refresh',
        ),
      );
    }
  }
  picker.addEventListener('change', () => {
    const selected = picker.value;
    picker.value = active;
    protectEdits(() => {
      active = selected;
      picker.value = selected;
      void prepare();
    }, editor);
  });
  void prepare();
  return dialog;
}
