import {
  commercialVoiceError,
  commercialVoices,
  productionLanguage,
  voiceFor,
  voicesFor,
} from '../../shared/voices.ts';
import { formWithSave, heading, notice, panel } from '../components.ts';
import { creativeSettingsPanel } from '../creative-ui.ts';
import { el, field, input, replace, select } from '../dom.ts';
import { protectEdits } from '../edit-protection.ts';
import { channelPath, currentChannel, effectiveConfig, save, state, studio } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import type { WebConfig } from '../../shared/types.ts';
import { t, translateMessage } from '../../shared/i18n.ts';

export function settingsPage(globalScope = studio.globalConfigScope): HTMLElement {
  const config = globalScope ? state().config : effectiveConfig();
  const scope = select(
    'config-scope',
    [
      [
        'channel',
        currentChannel() ? t('Canal: {name}', { name: currentChannel()!.name }) : t('Selecione um canal'),
      ],
      ['global', t('Padrão desta instalação')],
    ],
    globalScope || !currentChannel() ? 'global' : 'channel',
  );
  if (!currentChannel()) globalScope = true;
  scope.addEventListener('change', () => {
    const selected = scope.value;
    scope.value = globalScope ? 'global' : 'channel';
    protectEdits(() => {
      studio.globalConfigScope = selected === 'global';
      const main = document.querySelector('#main-content');
      if (main) replace(main, settingsPage(studio.globalConfigScope));
    });
  });
  const width = input('width', String(config.render.width), 'number');
  const height = input('height', String(config.render.height), 'number');
  for (const item of [width, height]) {
    item.min = '2';
    item.max = '7680';
    item.step = '2';
    item.required = true;
  }
  const fps = input('fps', String(config.render.fps), 'number');
  fps.min = '1';
  fps.max = '120';
  fps.required = true;
  const crf = input('crf', String(config.render.crf), 'number');
  crf.min = '0';
  crf.max = '51';
  crf.required = true;
  const preset = select(
    'preset',
    ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'].map(
      (entry) => [entry, entry],
    ),
    config.render.preset,
  );
  const python = input('pythonPath', config.tts.pythonPath ?? '');
  python.required = true;
  const voiceStyles = input('voiceStyles', config.tts.voiceStyles ?? '');
  voiceStyles.required = true;
  const voiceModel = input('voiceModel', config.tts.voiceModel);
  voiceModel.required = true;
  // Voices and the speech check follow the channel's language; the engine applies the same rule.
  const language = productionLanguage(currentChannel()?.language ?? 'pt-BR');
  const voices = language ? voicesFor(language) : commercialVoices;
  const voiceName = select(
    'voiceName',
    voices.map(([id, label]) => [id, translateMessage(label)]),
    language ? voiceFor(config.tts.voiceName, language) : config.tts.voiceName,
  );
  voiceName.required = true;
  const asr = input('asr-enabled', '', 'checkbox');
  asr.checked = config.asr.enabled;
  const asrModel = input('asr-model', config.asr.model);
  const asrLanguage = input('asr-language', language?.asr ?? config.asr.language);
  asrLanguage.required = true;
  asrLanguage.readOnly = Boolean(language);
  const coverage = input('minCoverage', String(config.asr.minCoverage), 'number');
  coverage.min = '0';
  coverage.max = '1';
  coverage.step = '0.01';
  coverage.required = true;
  const { form, fields } = formWithSave(
    globalScope ? t('Salvar padrão da instalação') : t('Salvar configuração deste canal'),
    async () => {
      const next: WebConfig = {
        dryRun: true,
        telemetry: false,
        render: {
          width: Number(width.value),
          height: Number(height.value),
          fps: Number(fps.value),
          crf: Number(crf.value),
          preset: preset.value,
          videoCodec: 'libx264',
        },
        tts: {
          engine: 'kokoro',
          pythonPath: python.value.trim(),
          voiceStyles: voiceStyles.value.trim(),
          piperPath: config.tts.piperPath,
          voiceModel: voiceModel.value.trim(),
          voiceName: voiceName.value,
        },
        asr: {
          enabled: asr.checked,
          model: asrModel.value.trim(),
          language: asrLanguage.value.trim(),
          minCoverage: Number(coverage.value),
        },
      };
      await save(globalScope ? '/api/config' : channelPath('/config'), 'PUT', next);
      toast(
        globalScope
          ? t('Padrão da instalação atualizado. Canais com configuração própria conservam seus ajustes.')
          : t('Configuração do canal salva.'),
      );
    },
  );
  fields.append(
    field(
      t('Onde aplicar estes ajustes?'),
      scope,
      t('A configuração do canal prevalece sobre o padrão da instalação.'),
    ),
    el('div', { className: 'divider' }),
    el('h3', {}, t('Renderização')),
    el(
      'div',
      { className: 'form-grid' },
      field(t('Largura em pixels'), width),
      field(t('Altura em pixels'), height),
      field(t('Quadros por segundo'), fps),
      field(
        t('CRF — qualidade de compressão'),
        crf,
        t('Menor valor prioriza qualidade e pode aumentar o arquivo.'),
      ),
      field(t('Preset do encoder'), preset),
      field(t('Codec'), select('videoCodec', [['libx264', 'H.264 · libx264']], 'libx264')),
    ),
    el('div', { className: 'divider' }),
    el('h3', {}, t('Voz & narração local')),
    field(
      t('Voz do narrador'),
      voiceName,
      t('Kokoro-82M v1.0 · Apache 2.0 · permite uso comercial, com as condições da licença.'),
    ),
    field(
      t('Python do narrador'),
      python,
      t('Instalação local: npm run voices:setup. No Docker: /opt/tts/bin/python.'),
    ),
    field(
      t('Modelo Kokoro'),
      voiceModel,
      t('kokoro-v1.0.onnx do catálogo. O motor confere o SHA-256 antes de narrar.'),
    ),
    field(
      t('Arquivo das vozes'),
      voiceStyles,
      t('voices-v1.0.bin do mesmo catálogo. Arquivos alterados ou de outra origem são bloqueados.'),
    ),
    ...(commercialVoiceError(config.tts)
      ? [notice(translateMessage(commercialVoiceError(config.tts)!))]
      : []),
    el('div', { className: 'divider' }),
    el('h3', {}, t('Conferência da fala com ASR')),
    el('label', { className: 'checkbox-field' }, asr, t('Usar o modelo local de transcrição no QA')),
    field(t('Arquivo do modelo ASR'), asrModel),
    el(
      'div',
      { className: 'form-grid' },
      field(
        t('Idioma da transcrição'),
        asrLanguage,
        language ? t('Segue o idioma do canal ({language}).', { language: language.label }) : undefined,
      ),
      field(t('Limiar de cobertura'), coverage, t('De 0 a 1. Cobertura não comprova qualidade editorial.')),
    ),
  );
  const safety = el(
    'div',
    { className: 'panel-body' },
    el(
      'dl',
      { className: 'operation-properties' },
      el('div', {}, el('dt', {}, t('Publicação automática')), el('dd', {}, t('Desativada'))),
      el('div', {}, el('dt', {}, t('Telemetria')), el('dd', {}, t('Desativada'))),
      el(
        'div',
        {},
        el('dt', {}, t('Motor de produção')),
        el('dd', {}, state().engine?.available ? t('Disponível') : t('Não encontrado')),
      ),
    ),
    el(
      'p',
      { className: 'field-hint' },
      translateMessage(state().engine?.message || '') || t('Estado do motor não informado pelo servidor.'),
    ),
  );
  return el(
    'div',
    {},
    heading(t('Configurações'), t('Configure a produção e personalize o assistente de criação.')),
    el(
      'div',
      { className: 'settings-layout' },
      el('section', { className: 'panel editor-body' }, form),
      el(
        'div',
        { className: 'section-stack' },
        creativeSettingsPanel(currentChannel()?.id, currentChannel()?.name),
        panel(t('Operação local'), t('Controles de segurança desta versão.'), safety),
      ),
    ),
  );
}
