// Sound synthesized here, so the video carries no third-party audio:
// a short tuned blip per match (pitch by outcome) and a low hit when the verdict lands.

export const SAMPLE_RATE = 48_000;

export interface Blip {
  at: number;
  hz: number;
  /** Peak amplitude, 0..1. */
  gain: number;
  /** Decay time constant in seconds. */
  decay: number;
}

/** Mono 16-bit PCM WAV of `seconds`, with every blip mixed in and the sum clipped to [-1, 1]. */
export function renderWav(seconds: number, blips: Blip[]): Buffer {
  if (!(seconds > 0)) throw new Error('duração do áudio deve ser positiva');
  const frames = Math.round(seconds * SAMPLE_RATE);
  const mix = new Float32Array(frames);
  for (const blip of blips) {
    if (blip.at < 0 || blip.at >= seconds) throw new Error(`som em ${blip.at}s fora do vídeo (${seconds}s)`);
    const start = Math.round(blip.at * SAMPLE_RATE);
    const length = Math.min(frames - start, Math.round(blip.decay * 7 * SAMPLE_RATE));
    const attack = Math.round(0.003 * SAMPLE_RATE);
    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      const envelope = Math.min(1, i / attack) * Math.exp(-t / blip.decay);
      const tone = Math.sin(2 * Math.PI * blip.hz * t) + 0.25 * Math.sin(4 * Math.PI * blip.hz * t);
      mix[start + i]! += blip.gain * envelope * tone * 0.8;
    }
  }
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const v = Math.max(-1, Math.min(1, mix[i]!));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
