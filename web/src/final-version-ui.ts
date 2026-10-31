import type { Channel, PreparedVisuals, Script, WebConfig, WebJob } from '../shared/types.ts';
import { t, translateMessage } from '../shared/i18n.ts';
import { request } from './api.ts';
import { createDialog } from './components.ts';
import { button, el, input } from './dom.ts';

interface FinalVersionOptions {
  channel: Channel;
  script: Script;
  config: WebConfig;
  onStarted: (job: WebJob) => Promise<void>;
  onEditScript: (scriptId: string) => void;
  onManual: (scriptId: string) => void;
  api?: typeof request;
}

/**
 * One step from a reviewed preview to the final video: the operator's declaration, the
 * visuals already prepared for the script, and the job. Only what the engine would refuse
 * (a contradicted claim, a reference outside the sources, a scene that needs a real
 * recording) stops it, and each is named with the way out.
 */
export function openFinalVersion(options: FinalVersionOptions): HTMLDialogElement {
  const { script, channel } = options;
  const api = options.api ?? request;
  const path = (suffix: string) => `/api/channels/${encodeURIComponent(channel.id)}/${suffix}`;
  const { dialog, body } = createDialog(t('Gerar versão final'), `${channel.name} · ${script.title}`);
  const urls = new Set(script.sources.map((source) => source.url));
  const contradicted = script.claims.filter((claim) => claim.status === 'contradicted').length;
  const foreign = script.claims.filter((claim) => claim.sourceUrls.some((url) => !urls.has(url))).length;
  const blocked = contradicted + foreign > 0;

  const checks = el(
    'ul',
    { className: 'final-checks' },
    el(
      'li',
      {},
      urls.size === 1
        ? t('{count} fonte no roteiro.', { count: urls.size })
        : urls.size
          ? t('{count} fontes no roteiro.', { count: urls.size })
          : t('Nenhuma fonte no roteiro. O vídeo é gerado e o relatório de QA pede uma antes de publicar.'),
    ),
    contradicted
      ? el(
          'li',
          { className: 'final-blocker' },
          contradicted === 1
            ? t('{count} alegação marcada como contradição. Corrija ou remova no roteiro.', {
                count: contradicted,
              })
            : t('{count} alegações marcadas como contradição. Corrija ou remova no roteiro.', {
                count: contradicted,
              }),
        )
      : null,
    foreign
      ? el(
          'li',
          { className: 'final-blocker' },
          foreign === 1
            ? t('{count} alegação cita URL fora das fontes do roteiro. Corrija no roteiro.', {
                count: foreign,
              })
            : t('{count} alegações citam URL fora das fontes do roteiro. Corrija no roteiro.', {
                count: foreign,
              }),
        )
      : null,
  );
  const declaration = input('crossChecked', '', 'checkbox');
  declaration.checked = script.crossChecked;
  declaration.dataset.testid = 'final-declaration';
  const status = el('p', { role: 'status', className: 'field-hint' });
  const error = el('div', { role: 'alert', className: 'alert', hidden: true });
  const start = button(t('Gerar versão final'), () => void generate(), 'primary', 'film');
  start.dataset.testid = 'final-start';
  const edit = button(
    t('Abrir roteiro'),
    () => {
      dialog.close();
      options.onEditScript(script.id);
    },
    'secondary',
    'script',
  );
  const update = () => {
    start.disabled = blocked || !declaration.checked;
  };
  declaration.addEventListener('change', update);
  update();

  function fail(message: string, manual = false) {
    error.replaceChildren(el('p', {}, message));
    if (manual)
      error.append(
        button(
          t('Abrir preparação manual'),
          () => {
            dialog.close();
            options.onManual(script.id);
          },
          'secondary',
          'settings',
        ),
      );
    error.hidden = false;
    status.textContent = '';
    update();
  }

  async function generate() {
    start.disabled = true;
    error.hidden = true;
    try {
      if (!script.crossChecked) {
        status.textContent = t('Registrando a revisão no roteiro…');
        await api<Script>(`/api/scripts/${encodeURIComponent(script.id)}`, 'PUT', {
          channelId: channel.id,
          crossChecked: true,
        });
      }
      status.textContent = t('Conferindo os visuais das cenas…');
      const prepared = await api<PreparedVisuals>(path('visuals/prepare'), 'POST', { scriptId: script.id });
      const pending = script.scenes
        .map((scene, index) => ({ scene, index }))
        .filter(({ scene }) => !prepared.bindings[String(scene.id)]);
      if (pending.length)
        return fail(
          t('{scenes} ficou sem visual. Prepare os visuais novamente.', {
            scenes: pending.map(({ index }) => t('Cena {number}', { number: index + 1 })).join(', '),
          }),
          true,
        );
      status.textContent = t('Iniciando a versão final…');
      const job = await api<WebJob>(path('jobs'), 'POST', {
        scriptId: script.id,
        assetIds: Object.fromEntries(
          script.scenes.map((scene) => [String(scene.id), prepared.bindings[String(scene.id)]]),
        ),
        asr: options.config.asr.enabled,
        burnSubtitles: true,
      });
      dialog.close();
      await options.onStarted(job);
    } catch (reason) {
      fail(
        reason instanceof Error
          ? translateMessage(reason.message)
          : t('Não foi possível iniciar a versão final.'),
      );
    }
  }

  body.append(
    el('p', {}, t('Mesmo roteiro e mesmos visuais da prévia, sem a marca de revisão.')),
    checks,
    el(
      'label',
      { className: 'checkbox-field' },
      declaration,
      t('Conferi e cruzei as fontes e as alegações desta pauta'),
    ),
    el(
      'p',
      { className: 'field-hint' },
      t(
        'Esta é a sua aprovação editorial e fica registrada no roteiro e no relatório de QA. Publicar continua manual.',
      ),
    ),
    status,
    error,
    el('div', { className: 'form-actions' }, blocked ? edit : null, start),
  );
  return dialog;
}
