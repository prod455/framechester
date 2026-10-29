import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceFinder, onTopic, queryTerms } from '../server/sources.ts';

const work = (doi: string, title: string, citations: number, venue = 'Nature', year = 2017) => ({
  DOI: doi,
  title: [title],
  'container-title': [venue],
  publisher: 'Springer Nature',
  issued: { 'date-parts': [[year, 6]] },
  'is-referenced-by-count': citations,
});
const reply = (items: unknown[]) =>
  new Response(JSON.stringify({ status: 'ok', message: { items } }), {
    headers: { 'Content-Type': 'application/json' },
  });

test('suggestions are peer-reviewed DOIs, most cited first, distinct across queries', async () => {
  const requests: Array<{ url: URL; headers: Record<string, string> }> = [];
  const finder = createSourceFinder({
    now: () => new Date('2026-10-29T12:00:00Z'),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      if (url.searchParams.get('query.bibliographic') === 'GPU deep learning')
        return reply([
          work('10.1109/cvpr.2016.90', 'Deep Residual Learning', 179035),
          work('10.5555/weak', 'Obscure workshop note', 2),
          work('10.1038/nature14539', 'Deep learning', 90000, 'Nature', 2015),
        ]);
      return reply([
        work('10.1038/nature14539', 'Deep learning', 90000),
        work(
          '10.1000/second',
          'Neural networks for pattern recognition',
          50,
          'GIScience &amp; Remote Sensing',
        ),
        work('10.1000/off', 'Soil moisture in Brazil', 900),
      ]);
    }) as typeof fetch,
  });
  const sources = await finder.suggest(['GPU deep learning', '  GPU deep learning ', 'neural networks'], 3);
  assert.deepEqual(
    sources.map((source) => source.url),
    [
      'https://doi.org/10.1109/cvpr.2016.90',
      'https://doi.org/10.1038/nature14539',
      'https://doi.org/10.1000/second',
    ],
  );
  assert.equal(sources[0]!.publisher, 'Nature · Springer Nature');
  assert.equal(sources[2]!.publisher, 'GIScience & Remote Sensing · Springer Nature');
  assert.equal(sources[0]!.retrievedAt, '2026-10-29');
  assert.match(sources[0]!.license, /revisado por pares.*2017.*conferir/);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.url.origin, 'https://api.crossref.org');
  assert.match(requests[0]!.url.searchParams.get('filter') ?? '', /journal-article/);
  assert.match(requests[0]!.headers['User-Agent'] ?? '', /^Framechester/);
});

test('weakly cited or off-topic work is never suggested, even when nothing else matched', async () => {
  const finder = createSourceFinder({
    fetch: (async () =>
      reply([
        work('10.1000/a', 'Tema raro em estudo', 3),
        work('10.1000/b', 'Climate of the Andes', 5000),
        work('10.1000/c', 'Um tema raro e seus efeitos', 40),
      ])) as typeof fetch,
  });
  assert.deepEqual(
    (await finder.suggest(['tema raro'], 3)).map((source) => source.url),
    ['https://doi.org/10.1000/c'],
  );
});

test('topic matching ignores accents, case and stop words', () => {
  assert.deepEqual(queryTerms('Por que a GPU virou o cérebro da IA?'), ['virou', 'cerebro']);
  assert.equal(
    onTopic('placas de vídeo e redes neurais', { title: 'Redes Neurais em Placas Gráficas', venue: '' }),
    true,
  );
  assert.equal(
    onTopic('placas de vídeo e redes neurais', { title: 'Drogas e o cérebro', venue: 'Nanocell News' }),
    false,
  );
  assert.equal(onTopic('GPU deep learning', { title: 'Deep Residual Learning', venue: 'CVPR' }), true);
  assert.equal(
    onTopic('O GPT-3 tinha 175 bilhões de parâmetros', {
      title: 'Não tinha trabalho, mas tinha reciclagem',
      venue: 'Temas em Psicologia',
    }),
    false,
  );
});

test('network failures, errors, bad payloads and oversized responses yield no sources instead of throwing', async () => {
  const cases: Array<() => Promise<Response>> = [
    async () => {
      throw new Error('offline');
    },
    async () => new Response('rate limited', { status: 429 }),
    async () => new Response('{"message":{"items":[{"DOI":"not a doi","title":["x"]}]}}'),
    async () => new Response('{"message":{"items":[{"DOI":"10.1000/x","title":[""]}]}}'),
    async () => new Response('x'.repeat(1_048_577)),
  ];
  for (const fetch of cases) {
    const finder = createSourceFinder({ fetch: fetch as typeof fetch });
    assert.deepEqual(await finder.suggest(['anything'], 3), []);
  }
  const finder = createSourceFinder({
    fetch: (async () => reply([work('10.1000/a', 'A', 20)])) as typeof fetch,
  });
  assert.deepEqual(await finder.suggest(['ab', '   '], 3), []);
});
