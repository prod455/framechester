import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Confronto, ConfrontoError, steps, summarize, timing, validate } from '../src/confronto.ts';

function data(matches: [string, number, number][]): Confronto {
  return {
    sport: 'futebol',
    sides: [
      { id: 'A', name: 'Alfa', short: 'ALF', color: '#F7D117', ink: '#10151C' },
      { id: 'B', name: 'Beta', short: 'BET', color: '#75AADB', ink: '#0B1622' },
    ],
    // [date, goals A at home, goals B away]; odd rows swap home and away to cover both views.
    matches: matches.map(([date, a, b], i) =>
      i % 2 === 0
        ? { date, home: 'A', away: 'B', homeScore: a, awayScore: b, competition: 'Amistoso' }
        : { date, home: 'B', away: 'A', homeScore: b, awayScore: a, competition: 'Amistoso' },
    ),
    source: {
      name: 'teste',
      url: 'https://example.com',
      license: 'CC0 1.0',
      retrieved: '2026-11-13',
      note: 'nota',
    },
  };
}

test('tally counts wins, draws and goals from side A whether A plays home or away', () => {
  const all = steps(
    validate(
      data([
        ['1950-01-01', 2, 0],
        ['1951-01-01', 1, 3],
        ['1952-01-01', 1, 1],
      ]),
    ),
  );
  assert.deepEqual(
    all.map((s) => [s.a, s.b, s.outcome]),
    [
      [2, 0, 'a'],
      [1, 3, 'b'],
      [1, 1, 'draw'],
    ],
  );
  assert.deepEqual(all[2]!.tally, { winsA: 1, winsB: 1, draws: 1, goalsA: 4, goalsB: 4 });
});

test('validate sorts by date and refuses anything that would put a wrong number on screen', () => {
  const sorted = validate(
    data([
      ['1960-01-01', 1, 0],
      ['1950-01-01', 0, 1],
    ]),
  );
  assert.deepEqual(
    sorted.matches.map((m) => m.date),
    ['1950-01-01', '1960-01-01'],
  );
  const bad = data([
    ['1950-01-01', 1, 0],
    ['1951-02-30', 0, 1],
  ]);
  assert.throws(() => validate(bad), ConfrontoError);
  const stranger = data([
    ['1950-01-01', 1, 0],
    ['1951-01-01', 0, 1],
  ]);
  stranger.matches[1]!.home = 'C';
  assert.throws(() => validate(stranger), /não é A × B/);
  const negative = data([
    ['1950-01-01', 1, 0],
    ['1951-01-01', -1, 1],
  ]);
  assert.throws(() => validate(negative), /placar/);
  const noNote = data([
    ['1950-01-01', 1, 0],
    ['1951-01-01', 0, 1],
  ]);
  noNote.source.note = ' ';
  assert.throws(() => validate(noNote), /nota/);
});

test('summary: biggest win by margin then goals, longest streak, lead changes ignore ties', () => {
  const all = steps(
    validate(
      data([
        ['1950-01-01', 3, 0], // A leads
        ['1951-01-01', 4, 1], // same margin, more goals: biggest win of A
        ['1952-01-01', 0, 1],
        ['1953-01-01', 0, 1],
        ['1954-01-01', 0, 1], // tie, then B leads: one change
        ['1955-01-01', 2, 2],
        ['1956-01-01', 1, 0], // tie again: no change
        ['1957-01-01', 1, 0], // A leads again: second change
      ]),
    ),
  );
  const s = summarize(all);
  assert.equal(s.biggestWinA?.date, '1951-01-01');
  assert.equal(s.biggestWinB?.date, '1952-01-01');
  assert.deepEqual(s.streakB, { length: 3, from: '1952-01-01', to: '1954-01-01' });
  assert.deepEqual(s.streakA, { length: 2, from: '1950-01-01', to: '1951-01-01' });
  assert.equal(s.leadChanges, 2);
  assert.equal(s.firstYear, 1950);
  assert.equal(s.lastYear, 1957);
});

test('timing keeps every match readable and a 110-match history inside a Short', () => {
  const t = timing(110);
  assert.ok(t.total <= 60, `total ${t.total}`);
  assert.ok(t.perMatch >= 0.22 && t.perMatch <= 1);
  assert.equal(t.race, Math.round(t.perMatch * 110 * 1000) / 1000);
  assert.equal(timing(3).perMatch, 1);
  assert.equal(timing(1000).perMatch, 0.22);
});
