import type { WebConfig } from './types.ts';

/** Languages a channel can produce in: each has reviewed Kokoro voices (docs/VOZES_COMERCIAIS.md).
 * `asr` is the Whisper code that checks the narration. */
export const productionLanguages = [
  { tag: 'pt-BR', label: 'Português (Brasil)', asr: 'pt' },
  { tag: 'en-US', label: 'English (US)', asr: 'en' },
  { tag: 'es', label: 'Español', asr: 'es' },
] as const;
export type ProductionLanguage = (typeof productionLanguages)[number];

export const commercialVoices = [
  ['pf_dora', 'Dora · feminina · PT-BR', 'pt-BR'],
  ['pm_alex', 'Alex · masculina · PT-BR', 'pt-BR'],
  ['pm_santa', 'Santa · masculina · PT-BR', 'pt-BR'],
  ['af_heart', 'Heart · feminina · EN-US', 'en-US'],
  ['af_bella', 'Bella · feminina · EN-US', 'en-US'],
  ['am_michael', 'Michael · masculina · EN-US', 'en-US'],
  ['ef_dora', 'Dora · feminina · ES', 'es'],
  ['em_alex', 'Alex · masculina · ES', 'es'],
  ['em_santa', 'Santa · masculina · ES', 'es'],
] as const;

/** The production language of a channel tag: pt-* speaks pt-BR, en-* en-US, es-* es; others none. */
export function productionLanguage(tag: string): ProductionLanguage | undefined {
  const base = tag.toLowerCase().split('-')[0];
  return productionLanguages.find((item) => item.tag.toLowerCase().split('-')[0] === base);
}

export function voicesFor(language: ProductionLanguage) {
  return commercialVoices.filter(([, , tag]) => tag === language.tag);
}

/** The configured voice when it speaks the channel's language; a reviewed voice of another
 * language gives way to this language's first voice, so a Portuguese voice never narrates an
 * English script. An unreviewed voice is returned as is, for commercialVoiceError to refuse. */
export function voiceFor(voiceName: string, language: ProductionLanguage): string {
  if (!commercialVoices.some(([id]) => id === voiceName)) return voiceName;
  const voices = voicesFor(language);
  return voices.find(([id]) => id === voiceName)?.[0] ?? voices[0]![0];
}

export function commercialVoiceError(tts: WebConfig['tts']): string | undefined {
  if (tts.engine !== 'kokoro' || !commercialVoices.some(([id]) => id === tts.voiceName))
    return 'Voz sem aprovação comercial nesta instalação. Escolha uma voz Kokoro do catálogo (PT-BR, EN-US ou ES) em Configurações. Vozes Piper legadas estão bloqueadas.';
  if (!tts.voiceModel.trim() || !tts.voiceStyles?.trim() || !tts.pythonPath?.trim())
    return 'Configure os arquivos da voz comercial e o Python do Kokoro. Execute npm run voices:setup antes de produzir.';
  return undefined;
}
