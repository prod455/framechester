import type { Channel, PreparedVisuals, Script, WebAsset, WebConfig, WebJob } from '../shared/types.ts';
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
  onAdaptScript?: (script: Script) => void;
  onPrepared?: (prepared: PreparedVisuals) => void;
  api?: typeof request;
}

/** A saved script is the starting point; uploads are an optional source of visuals. */
export function openProduction(options: ProductionOptions): HTMLDialogElement {
  const { dialog, body } = createDialog(
    'Preparar vídeo',
    `Canal: ${options.channel.name}. Confira as prévias das cenas e o que falta para gerar o vídeo.`,
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
        'Adicione um roteiro primeiro',
        'O motor usa as falas e as cenas do roteiro.',
        'script',
        button(
          'Ir para roteiros',
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
  body.append(field('Roteiro', picker), editor);
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
    replace(editor, el('p', { role: 'status' }, 'Criando e vinculando os visuais deste roteiro…'));
    try {
      const prepared = await api<PreparedVisuals>(path('visuals/prepare'), 'POST', { scriptId });
      if (!relevant(scriptId)) return;
      if (prepared.scriptId !== scriptId || prepared.assets.some((asset) => asset.channelId !== owner))
        throw new Error('A preparação retornou recursos de outro roteiro ou canal.');
      options.onPrepared?.(prepared);
      const script = scripts.find((script) => script.id === scriptId)!;
      const available = prepared.assets.filter((asset) => asset.channelId === owner);
      const usable = available.filter((asset) => !asset.generated?.captureRequired);
      const mapping = el('div', { className: 'production-scenes' });
      const bindings: Array<{ sceneId: number; control: HTMLSelectElement }> = [];
      let updateReady = () => {};
      for (const [index, scene] of script.scenes.entries()) {
        const selected = prepared.bindings[String(scene.id)] ?? '';
        const control = select(
          `asset-${scene.id}`,
          [
            ['', 'Selecione uma gravação ou imagem própria'],
            ...usable.map((asset): [string, string] => [asset.id, asset.name]),
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
                  alt: `Visual de ${scene.heading}`,
                  loading: 'lazy',
                })
              : asset
                ? el('p', { className: 'field-hint' }, `Clipe selecionado: ${asset.name}`)
                : null,
          );
        }
        control.addEventListener('change', () => {
          showPreview();
          updateReady();
        });
        showPreview();
        const pending = prepared.pending.find((item) => item.sceneId === scene.id);
        const row = el(
          'section',
          { className: 'production-scene' },
          el('h3', {}, `Cena ${index + 1} · ${scene.heading}`),
          preview,
        );
        if (pending && !selected) {
          row.append(
            el(
              'p',
              { className: 'field-hint' },
              'Prévia ilustrativa · gravação pendente para a versão final',
            ),
            el(
              'details',
              {},
              el('summary', {}, 'Usar uma gravação real nesta cena'),
              el(
                'div',
                { className: 'production-scene-source' },
                field('Gravação ou captura própria', control),
                button('Adicionar arquivo próprio', () => leaveFor(options.onAddAssets), 'secondary', 'plus'),
              ),
            ),
          );
        } else {
          row.append(
            el('p', { className: 'field-hint' }, 'Visual explicativo criado e associado a esta cena.'),
            el(
              'details',
              {},
              el('summary', {}, 'Usar outro recurso visual'),
              field('Imagem ou clipe do canal', control),
            ),
          );
        }
        mapping.append(row);
      }
      const asr = input('asr', '', 'checkbox');
      asr.checked = options.config.asr.enabled;
      const subtitles = input('burnSubtitles', '', 'checkbox');
      subtitles.checked = true;
      let finalRequested = false;
      const { form, fields, actions } = formWithSave(
        'Gerar prévia do vídeo',
        async () => {
          const previewOnly = !finalRequested;
          if (!relevant(scriptId)) throw new Error('O canal ou roteiro mudou. Abra a preparação novamente.');
          if (!previewOnly && !script.crossChecked)
            throw new Error(
              'Marque “Conferi e cruzei as fontes e as alegações” no roteiro antes da versão final.',
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
        'Iniciando produção…',
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
        ? 'Para a versão final, marque “Conferi e cruzei as fontes e as alegações” no roteiro (aba Fontes e revisão).'
        : 'Para a versão final, corrija no roteiro as alegações marcadas como contradição ou com URL fora das fontes.';
      const previewCount = Object.keys(prepared.previews ?? prepared.bindings).length;
      const summary = el(
        'section',
        { className: 'production-summary' },
        el(
          'h3',
          {},
          previewCount
            ? `${previewCount} prévia${previewCount === 1 ? '' : 's'} criada${previewCount === 1 ? '' : 's'}`
            : 'A preparação precisa de atenção',
        ),
        el(
          'p',
          {},
          prepared.pending.length
            ? 'O roteiro pede gravações reais. As imagens abaixo ajudam a revisar as cenas; para um vídeo só com visuais automáticos, adapte o roteiro para uma explicação.'
            : 'Os visuais explicativos já estão vinculados às cenas. Confira as imagens antes de continuar.',
        ),
      );
      const recovery = el('div', { className: 'production-summary-actions' });
      if (prepared.pending.length && options.onAdaptScript)
        recovery.append(
          button(
            'Adaptar roteiro com IA',
            () => leaveFor(() => options.onAdaptScript!(script)),
            'secondary',
            'spark',
          ),
        );
      if (prepared.pending.length || !editorialReady)
        recovery.append(
          button(
            'Revisar roteiro',
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
        'Gerar versão final',
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
        readiness.textContent = missing
          ? `Falta resolver ${missing} cena${missing === 1 ? '' : 's'} para gerar a versão final. As prévias ilustrativas já estão disponíveis.`
          : !editorialReady
            ? editorialReason
            : 'Cenas prontas para gerar o vídeo neste computador.';
      };
      updateReady();
      fields.append(
        summary,
        mapping,
        el(
          'div',
          { className: 'production-options' },
          el('label', { className: 'checkbox-field' }, subtitles, 'Incluir legendas no vídeo'),
          el('label', { className: 'checkbox-field' }, asr, 'Conferir a fala com ASR local'),
        ),
        readiness,
        el(
          'p',
          { className: 'field-hint' },
          'A prévia de vídeo pode ser gerada antes da revisão editorial e recebe uma marca de revisão. Os visuais e a montagem são locais. A adaptação com IA pede autorização antes de qualquer geração paga.',
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
          error instanceof Error ? error.message : 'Não foi possível preparar os visuais.',
        ),
        button(
          'Tentar novamente',
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
