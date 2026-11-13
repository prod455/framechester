// Men's full internationals since 1872, from the CC0 dataset by Mart Jürisoo.
// The CSV is downloaded by the operator; this module only reads it and records its hash.
import { createHash } from 'node:crypto';
import type { Confronto, Match, Side } from './confronto.ts';
import { csvRecords } from './csv.ts';

export const SOURCE_URL = 'https://github.com/martj42/international_results';
export const CSV_URL = 'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';

/** Teams by their name in the dataset. Colours are the kit's main colour; ink keeps WCAG AA on it. */
export const TEAMS: Record<string, Omit<Side, 'id'>> = {
  Brazil: { name: 'Brasil', short: 'BRA', color: '#F7D117', ink: '#10151C' },
  Argentina: { name: 'Argentina', short: 'ARG', color: '#75AADB', ink: '#0B1622' },
  Uruguay: { name: 'Uruguai', short: 'URU', color: '#4FA3E0', ink: '#0B1622' },
  Chile: { name: 'Chile', short: 'CHI', color: '#D52B1E', ink: '#FFFFFF' },
  Paraguay: { name: 'Paraguai', short: 'PAR', color: '#E03A3E', ink: '#FFFFFF' },
  Colombia: { name: 'Colômbia', short: 'COL', color: '#FCD116', ink: '#10151C' },
  Peru: { name: 'Peru', short: 'PER', color: '#E8E8E8', ink: '#10151C' },
  Ecuador: { name: 'Equador', short: 'EQU', color: '#FFD100', ink: '#10151C' },
  Mexico: { name: 'México', short: 'MEX', color: '#1F8A4C', ink: '#FFFFFF' },
  'United States': { name: 'Estados Unidos', short: 'EUA', color: '#E8E8E8', ink: '#10151C' },
  Germany: { name: 'Alemanha', short: 'ALE', color: '#E8E8E8', ink: '#10151C' },
  France: { name: 'França', short: 'FRA', color: '#3B5BDB', ink: '#FFFFFF' },
  Italy: { name: 'Itália', short: 'ITA', color: '#2F6FD6', ink: '#FFFFFF' },
  England: { name: 'Inglaterra', short: 'ING', color: '#E8E8E8', ink: '#10151C' },
  Spain: { name: 'Espanha', short: 'ESP', color: '#D0312D', ink: '#FFFFFF' },
  Netherlands: { name: 'Holanda', short: 'HOL', color: '#F36C21', ink: '#10151C' },
  Portugal: { name: 'Portugal', short: 'POR', color: '#C8102E', ink: '#FFFFFF' },
};

/** Two sides that would read as one colour get side B drawn in a neutral light tone. */
const FALLBACK_B = { color: '#E8E8E8', ink: '#10151C' };
const DARK_FALLBACK_B = { color: '#3A4150', ink: '#FFFFFF' };

const COMPETITIONS: Record<string, string> = {
  Friendly: 'Amistoso',
  'FIFA World Cup': 'Copa do Mundo',
  'FIFA World Cup qualification': 'Eliminatórias da Copa',
  'Confederations Cup': 'Copa das Confederações',
  'Pan American Championship': 'Campeonato Pan-Americano',
  'Atlantic Cup': 'Taça do Atlântico',
  'Superclásico de las Américas': 'Superclássico das Américas',
  'Australia Bicentenary Gold Cup': 'Copa do Bicentenário da Austrália',
  'UEFA Euro': 'Eurocopa',
  'UEFA Euro qualification': 'Eliminatórias da Eurocopa',
  'UEFA Nations League': 'Liga das Nações',
  'Gold Cup': 'Copa Ouro',
};

const COUNTRIES: Record<string, string> = {
  Brazil: 'Brasil',
  Argentina: 'Argentina',
  Uruguay: 'Uruguai',
  Chile: 'Chile',
  Paraguay: 'Paraguai',
  Peru: 'Peru',
  Ecuador: 'Equador',
  Colombia: 'Colômbia',
  Bolivia: 'Bolívia',
  Venezuela: 'Venezuela',
  Mexico: 'México',
  'United States': 'Estados Unidos',
  Germany: 'Alemanha',
  France: 'França',
  Italy: 'Itália',
  England: 'Inglaterra',
  Spain: 'Espanha',
  Netherlands: 'Holanda',
  Portugal: 'Portugal',
  'Saudi Arabia': 'Arábia Saudita',
  Australia: 'Austrália',
  Qatar: 'Catar',
  'South Korea': 'Coreia do Sul',
  Japan: 'Japão',
  Sweden: 'Suécia',
  Switzerland: 'Suíça',
};

function distance(x: string, y: string): number {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [rgb(x), rgb(y)];
  return Math.hypot(...a.map((v, i) => v - b[i]!));
}

export function side(team: string): Side {
  const known = TEAMS[team];
  if (!known) {
    throw new Error(`time "${team}" sem nome, sigla e cor em TEAMS (hyperframes/src/internacionais.ts)`);
  }
  return { id: team, ...known };
}

export function sidesFor(teamA: string, teamB: string): [Side, Side] {
  const a = side(teamA);
  const b = side(teamB);
  if (distance(a.color, b.color) >= 90) return [a, b];
  const fallback = distance(a.color, FALLBACK_B.color) >= 90 ? FALLBACK_B : DARK_FALLBACK_B;
  return [a, { ...b, ...fallback }];
}

export interface BuildOptions {
  csv: string;
  teamA: string;
  teamB: string;
  /** ISO date the CSV was downloaded. */
  retrieved: string;
  sport?: string;
}

export function buildConfronto(options: BuildOptions): Confronto {
  const rows = csvRecords(options.csv);
  const pair = new Set([options.teamA, options.teamB]);
  const matches: Match[] = [];
  for (const r of rows) {
    if (!pair.has(r.home_team!) || !pair.has(r.away_team!) || r.home_team === r.away_team) continue;
    // Matches not played yet (fixtures) carry NA scores.
    if (r.home_score === 'NA' || r.away_score === 'NA') continue;
    matches.push({
      date: r.date!,
      home: r.home_team!,
      away: r.away_team!,
      homeScore: Number(r.home_score),
      awayScore: Number(r.away_score),
      competition: COMPETITIONS[r.tournament!] ?? r.tournament!,
      city: r.city || undefined,
      country: r.country ? (COUNTRIES[r.country] ?? r.country) : undefined,
    });
  }
  if (matches.length === 0) throw new Error(`nenhum jogo ${options.teamA} × ${options.teamB} no CSV`);
  return {
    sport: options.sport ?? 'futebol',
    sides: sidesFor(options.teamA, options.teamB),
    matches,
    source: {
      name: 'international_results (Mart Jürisoo)',
      url: SOURCE_URL,
      license: 'CC0 1.0',
      retrieved: options.retrieved,
      sha256: createHash('sha256').update(options.csv).digest('hex'),
      note: 'Seleções principais masculinas · placar com prorrogação, sem pênaltis',
    },
  };
}
