import type { WebConfig } from './types.ts';

export const commercialVoices = [
  ['pf_dora', 'Dora · feminina · PT-BR'],
  ['pm_alex', 'Alex · masculina · PT-BR'],
  ['pm_santa', 'Santa · masculina · PT-BR'],
] as const;

export function commercialVoiceError(tts: WebConfig['tts']): string | undefined {
  if (tts.engine !== 'kokoro' || !commercialVoices.some(([id]) => id === tts.voiceName))
    return 'Voz sem aprovação comercial nesta instalação. Escolha Dora, Alex ou Santa (Kokoro) em Configurações. Vozes Piper legadas estão bloqueadas.';
  if (!tts.voiceModel.trim() || !tts.voiceStyles?.trim() || !tts.pythonPath?.trim())
    return 'Configure os arquivos da voz comercial e o Python do Kokoro. Execute npm run voices:setup antes de produzir.';
  return undefined;
}
