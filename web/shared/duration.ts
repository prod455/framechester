import type { ScriptScene } from './types.ts';

/** Video length is a business rule, not a suggestion to the model: a script whose narration
 * cannot fill its format is refused and rewritten, never delivered short.
 *
 * The local narrator (Kokoro, pt-BR, speed 1.0) measured 147 to 160 words per minute across
 * rendered videos, pauses between scenes included. The minimum uses the fastest rate and the
 * maximum the slowest, so a script inside the word range lands inside the time range. */
export const NARRATION_WPM = { fastest: 160, slowest: 147, typical: 155 } as const;

export type ScriptFormat = 'short' | 'long';
export interface DurationRule {
  format: ScriptFormat;
  minSecs: number;
  maxSecs: number;
  minWords: number;
  maxWords: number;
  /** Output tokens one complete script of this format needs, JSON and visual briefs included. */
  outputTokens: number;
}

function rule(format: ScriptFormat, minSecs: number, maxSecs: number, outputTokens: number): DurationRule {
  return {
    format,
    minSecs,
    maxSecs,
    minWords: Math.ceil((minSecs / 60) * NARRATION_WPM.fastest),
    maxWords: Math.floor((maxSecs / 60) * NARRATION_WPM.slowest),
    outputTokens,
  };
}
export const DURATION_RULES: Record<ScriptFormat, DurationRule> = {
  short: rule('short', 65, 90, 4096),
  long: rule('long', 7 * 60, 12 * 60, 16_000),
};
/** First draft plus rewrites. Each rewrite is told exactly how many words are missing. */
export const DURATION_ATTEMPTS = 3;

export function narrationWords(scenes: Pick<ScriptScene, 'narration'>[]): number {
  return scenes.reduce((total, scene) => total + (scene.narration.match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0);
}
export interface DurationCheck {
  ok: boolean;
  words: number;
  estimatedSecs: number;
  rule: DurationRule;
}
export function checkDuration(format: ScriptFormat, scenes: Pick<ScriptScene, 'narration'>[]): DurationCheck {
  const target = DURATION_RULES[format];
  const words = narrationWords(scenes);
  return {
    ok: words >= target.minWords && words <= target.maxWords,
    words,
    estimatedSecs: Math.round((words / NARRATION_WPM.typical) * 60),
    rule: target,
  };
}
export function formatDuration(secs: number): string {
  if (secs < 120) return `${Math.round(secs)} s`;
  const minutes = Math.floor(secs / 60);
  const rest = Math.round(secs % 60);
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}
/** Fits a script that is too long by removing whole middle scenes: the opening (the hook)
 * and the closing scene stay, words are never rewritten. Among the subsets that land inside
 * the range, the one that removes the fewest scenes wins, then the one that keeps the most
 * words. Undefined when no subset fits, so the caller asks for a rewrite instead. */
export function fitByDroppingScenes<Scene extends Pick<ScriptScene, 'id' | 'narration'>>(
  scenes: Scene[],
  rule: DurationRule,
): { scenes: Scene[]; dropped: number[] } | undefined {
  const words = scenes.map((scene) => narrationWords([scene]));
  const total = words.reduce((sum, value) => sum + value, 0);
  if (total <= rule.maxWords) return undefined;
  const middle = scenes.map((_, index) => index).slice(1, -1);
  // 2^16 subsets at most; longer scripts keep only their 16 longest middle scenes as candidates.
  const candidates = [...middle].sort((a, b) => words[b]! - words[a]!).slice(0, 16);
  let best: { mask: number; count: number; kept: number } | undefined;
  for (let mask = 1; mask < 1 << candidates.length; mask++) {
    let removed = 0,
      count = 0;
    for (let bit = 0; bit < candidates.length; bit++)
      if (mask & (1 << bit)) {
        removed += words[candidates[bit]!]!;
        count++;
      }
    const kept = total - removed;
    if (kept < rule.minWords || kept > rule.maxWords) continue;
    if (!best || count < best.count || (count === best.count && kept > best.kept))
      best = { mask, count, kept };
  }
  if (!best) return undefined;
  const drop = new Set(candidates.filter((_, bit) => best.mask & (1 << bit)));
  return {
    scenes: scenes.filter((_, index) => !drop.has(index)),
    dropped: scenes.filter((_, index) => drop.has(index)).map((scene) => scene.id),
  };
}
/** Instruction sent with every script request: concrete word counts the model can plan for. */
export function durationInstruction(format: ScriptFormat): string {
  const target = DURATION_RULES[format];
  const middle = Math.round((target.minWords + target.maxWords) / 2);
  return `Regra de duração (obrigatória, verificada antes de aceitar o roteiro): o vídeo ${format} precisa durar de ${formatDuration(target.minSecs)} a ${formatDuration(target.maxSecs)}. O narrador fala cerca de ${NARRATION_WPM.typical} palavras por minuto, então a soma das narrações de todas as cenas precisa ter de ${target.minWords} a ${target.maxWords} palavras; mire em ${middle}. Conte as palavras ao planejar cada cena e preencha durationHintSecs com as palavras da cena divididas por ${(NARRATION_WPM.typical / 60).toFixed(1).replace('.', ',')}. Um roteiro fora dessa faixa é recusado e reescrito; não resuma para economizar espaço. A duração vale mais do que preservar as cenas de referência: se elas vierem de um vídeo de outro tamanho, condense ou desenvolva o conteúdo até caber na faixa.`;
}
/** Instruction for a rewrite after a draft missed the range. Every scene gets its own word
 * budget, proportional to its current size, so the model has a number per scene instead of a
 * single total it tends to miss. */
export function revisionInstruction(
  check: DurationCheck,
  scenes: Pick<ScriptScene, 'id' | 'narration'>[],
): string {
  const { rule: target, words } = check;
  const short = words < target.minWords;
  const delta = short ? target.minWords - words : words - target.maxWords;
  const goal = Math.round((target.minWords + target.maxWords) / 2);
  const budgets = scenes
    .map((scene) => {
      const current = narrationWords([scene]);
      const budget = Math.max(3, Math.round((current * goal) / Math.max(words, 1)));
      return `cena ${scene.id}: ${current} → ${budget}`;
    })
    .join('; ');
  return `Revisão obrigatória de duração: o rascunho anterior (previousDraft) tem ${words} palavras de narração, cerca de ${formatDuration(check.estimatedSecs)}. ${
    short
      ? `Faltam pelo menos ${delta} palavras. Reescreva o roteiro completo com cerca de ${goal} palavras: aprofunde cada cena com explicação, exemplo hipotético identificado ou analogia, e acrescente cenas se preciso (até 20). Não repita frases nem encha com introduções genéricas.`
      : `Sobram pelo menos ${delta} palavras. Reescreva o roteiro completo com cerca de ${goal} palavras, cortando repetição e detalhes secundários sem perder a progressão; junte ou remova cenas se preciso.`
  } Palavras de narração por cena, atual → alvo: ${budgets}. Conte as palavras de cada cena antes de responder. Mantenha título, assunto, formato, gancho, fontes e claims. Devolva o roteiro inteiro, não só as mudanças.`;
}
