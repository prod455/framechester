// Confronto: the head-to-head history of two sides, match by match.
// Pure data: validation, the running tally and the facts the outro states.
// Every number on screen comes from here, so every number is derived from the source rows.

export interface Side {
  /** Name as it appears in the source rows (e.g. "Brazil"). */
  id: string;
  /** Name shown on screen (e.g. "Brasil"). */
  name: string;
  /** Three-letter code for chips and the monogram (e.g. "BRA"). */
  short: string;
  /** Fill colour, #RRGGBB. */
  color: string;
  /** Text colour on top of `color`, #RRGGBB. */
  ink: string;
}

export interface Match {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  competition: string;
  city?: string;
  country?: string;
}

export interface Source {
  name: string;
  url: string;
  license: string;
  /** ISO date the rows were read. */
  retrieved: string;
  /** SHA-256 of the file the rows came from. */
  sha256?: string;
  /** What the numbers count and what they leave out, shown in the footer. */
  note: string;
}

export interface Confronto {
  sport: string;
  /** Overrides the derived "A × B" title. */
  title?: string;
  sides: [Side, Side];
  matches: Match[];
  source: Source;
}

export type Outcome = 'a' | 'b' | 'draw';

export interface Tally {
  winsA: number;
  winsB: number;
  draws: number;
  goalsA: number;
  goalsB: number;
}

export interface Step {
  index: number;
  date: string;
  year: number;
  /** Goals of side A in this match. */
  a: number;
  /** Goals of side B in this match. */
  b: number;
  outcome: Outcome;
  competition: string;
  place: string;
  /** Tally after this match. */
  tally: Tally;
}

export interface Streak {
  length: number;
  from: string;
  to: string;
}

export interface Summary {
  matches: number;
  firstYear: number;
  lastYear: number;
  tally: Tally;
  biggestWinA: Step | null;
  biggestWinB: Step | null;
  streakA: Streak | null;
  streakB: Streak | null;
  /** Times the side ahead in wins changed (a tie on the way does not count). */
  leadChanges: number;
}

export class ConfrontoError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;

function fail(message: string): never {
  throw new ConfrontoError(message);
}

function validDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function checkSide(side: Side, label: string): void {
  if (!side.id.trim()) fail(`${label}: id vazio`);
  if (!side.name.trim()) fail(`${label}: nome vazio`);
  if (!/^[A-Z]{2,4}$/.test(side.short))
    fail(`${label}: sigla "${side.short}" deve ter 2 a 4 letras maiúsculas`);
  if (!HEX.test(side.color)) fail(`${label}: cor "${side.color}" deve ser #RRGGBB`);
  if (!HEX.test(side.ink)) fail(`${label}: tinta "${side.ink}" deve ser #RRGGBB`);
}

/** Rejects anything that would put a wrong number on screen. Returns the matches in date order. */
export function validate(data: Confronto): Confronto {
  if (!data.sport.trim()) fail('esporte vazio');
  const [a, b] = data.sides;
  checkSide(a, 'lado A');
  checkSide(b, 'lado B');
  if (a.id === b.id) fail('os dois lados têm o mesmo id');
  if (!data.source.name.trim() || !data.source.url.trim() || !data.source.license.trim()) {
    fail('fonte precisa de nome, url e licença');
  }
  if (!validDate(data.source.retrieved)) fail(`fonte: data de leitura "${data.source.retrieved}" inválida`);
  if (!data.source.note.trim()) fail('fonte: nota sobre o que a contagem inclui é obrigatória');
  if (data.matches.length < 2) fail('um confronto precisa de pelo menos 2 jogos');
  const ids = new Set([a.id, b.id]);
  data.matches.forEach((m, i) => {
    const where = `jogo ${i + 1} (${m.date})`;
    if (!validDate(m.date)) fail(`${where}: data inválida`);
    if (!ids.has(m.home) || !ids.has(m.away) || m.home === m.away) {
      fail(`${where}: ${m.home} × ${m.away} não é ${a.id} × ${b.id}`);
    }
    for (const score of [m.homeScore, m.awayScore]) {
      if (!Number.isInteger(score) || score < 0 || score > 99) fail(`${where}: placar ${score} inválido`);
    }
    if (!m.competition.trim()) fail(`${where}: competição vazia`);
  });
  const matches = [...data.matches].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return { ...data, matches };
}

function place(m: Match): string {
  if (m.city && m.country && m.city !== m.country) return `${m.city}, ${m.country}`;
  return m.city ?? m.country ?? '';
}

/** The running tally, one step per match, from side A's point of view. */
export function steps(data: Confronto): Step[] {
  const sideA = data.sides[0].id;
  const tally: Tally = { winsA: 0, winsB: 0, draws: 0, goalsA: 0, goalsB: 0 };
  return data.matches.map((m, index) => {
    const aHome = m.home === sideA;
    const a = aHome ? m.homeScore : m.awayScore;
    const b = aHome ? m.awayScore : m.homeScore;
    const outcome: Outcome = a > b ? 'a' : b > a ? 'b' : 'draw';
    if (outcome === 'a') tally.winsA += 1;
    else if (outcome === 'b') tally.winsB += 1;
    else tally.draws += 1;
    tally.goalsA += a;
    tally.goalsB += b;
    return {
      index,
      date: m.date,
      year: Number(m.date.slice(0, 4)),
      a,
      b,
      outcome,
      competition: m.competition,
      place: place(m),
      tally: { ...tally },
    };
  });
}

/** Largest margin; ties go to more goals scored, then to the earlier match. */
function biggestWin(all: Step[], side: 'a' | 'b'): Step | null {
  let best: Step | null = null;
  for (const s of all) {
    if (s.outcome !== side) continue;
    const margin = Math.abs(s.a - s.b);
    const scored = side === 'a' ? s.a : s.b;
    if (!best) {
      best = s;
      continue;
    }
    const bestMargin = Math.abs(best.a - best.b);
    const bestScored = side === 'a' ? best.a : best.b;
    if (margin > bestMargin || (margin === bestMargin && scored > bestScored)) best = s;
  }
  return best;
}

/** Longest run of consecutive wins; ties go to the earlier run. */
function longestStreak(all: Step[], side: 'a' | 'b'): Streak | null {
  let best: Streak | null = null;
  let start = -1;
  all.forEach((s, i) => {
    if (s.outcome === side) {
      if (start < 0) start = i;
      const length = i - start + 1;
      if (!best || length > best.length) {
        best = { length, from: all[start]!.date, to: s.date };
      }
    } else {
      start = -1;
    }
  });
  return best;
}

function leadChanges(all: Step[]): number {
  let holder = 0;
  let changes = 0;
  for (const s of all) {
    const diff = Math.sign(s.tally.winsA - s.tally.winsB);
    if (diff === 0) continue;
    if (holder !== 0 && diff !== holder) changes += 1;
    holder = diff;
  }
  return changes;
}

export function summarize(all: Step[]): Summary {
  const first = all[0];
  const last = all[all.length - 1];
  if (!first || !last) fail('sem jogos para resumir');
  return {
    matches: all.length,
    firstYear: first.year,
    lastYear: last.year,
    tally: last.tally,
    biggestWinA: biggestWin(all, 'a'),
    biggestWinB: biggestWin(all, 'b'),
    streakA: longestStreak(all, 'a'),
    streakB: longestStreak(all, 'b'),
    leadChanges: leadChanges(all),
  };
}

export interface Timing {
  intro: number;
  perMatch: number;
  race: number;
  hold: number;
  outro: number;
  total: number;
}

/**
 * Race length scales with the number of matches but stays in a range a viewer can read:
 * no match shorter than 0.22 s, none longer than 1 s. The default lands a 110-match
 * history under 60 s, so it fits a Short.
 */
export function timing(matches: number, raceSeconds = 46): Timing {
  if (matches < 1) fail('sem jogos');
  const perMatch = round(Math.min(1, Math.max(0.22, raceSeconds / matches)));
  const intro = 2.6;
  const race = round(perMatch * matches);
  // The last match's slot plus this pause stays near 1.4 s, so the screen never sits
  // still for 2 s before the verdict (QA freeze), whatever the pace.
  const hold = round(Math.max(0.3, 1.4 - perMatch));
  // Verdict rows land 1.2 s apart; the last one lands under 2 s before the end (QA freeze limit).
  const outro = 6;
  return { intro, perMatch, race, hold, outro, total: round(intro + race + hold + outro) };
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
