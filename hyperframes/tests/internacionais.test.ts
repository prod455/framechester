import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv } from '../src/csv.ts';
import { buildConfronto, sidesFor } from '../src/internacionais.ts';

const CSV = `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
1914-09-20,Argentina,Brazil,3,0,Friendly,Buenos Aires,Argentina,FALSE
1950-01-01,United States,China,1,1,Friendly,"Washington, D.C.",United States,FALSE
1951-01-01,Uruguay,Brazil,1,1,Friendly,Montevideo,Uruguay,FALSE
2021-07-10,Brazil,Argentina,0,1,Copa América,Rio de Janeiro,Brazil,FALSE
2026-12-01,Brazil,Argentina,NA,NA,FIFA World Cup qualification,Rio de Janeiro,Brazil,FALSE
`;

test('csv: quoted commas and doubled quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n'), [
    ['a', 'b'],
    ['x, y', 'he said "hi"'],
  ]);
  assert.throws(() => parseCsv('a\n"open'), /aspas/);
});

test('only the pair, only played matches, names and competitions in Portuguese, hash recorded', () => {
  const c = buildConfronto({ csv: CSV, teamA: 'Brazil', teamB: 'Argentina', retrieved: '2026-11-13' });
  assert.equal(c.matches.length, 2);
  const u = buildConfronto({ csv: CSV, teamA: 'Brazil', teamB: 'Uruguay', retrieved: '2026-11-13' });
  assert.deepEqual([u.matches[0]!.city, u.matches[0]!.country], ['Montevidéu', 'Uruguai']);
  assert.deepEqual(
    c.matches.map((m) => [m.competition, m.country]),
    [
      ['Amistoso', 'Argentina'],
      ['Copa América', 'Brasil'],
    ],
  );
  assert.equal(c.sides[0].name, 'Brasil');
  assert.match(c.source.sha256 ?? '', /^[0-9a-f]{64}$/);
  assert.equal(c.source.license, 'CC0 1.0');
});

test('unknown team fails loudly; look-alike colours give side B a fallback', () => {
  assert.throws(
    () => buildConfronto({ csv: CSV, teamA: 'Brazil', teamB: 'Atlantis', retrieved: '2026-11-13' }),
    /Atlantis/,
  );
  const [a, b] = sidesFor('Argentina', 'Uruguay');
  assert.equal(a.color, '#75AADB');
  assert.notEqual(b.color, '#4FA3E0');
});
