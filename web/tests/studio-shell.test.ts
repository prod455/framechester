import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { Bootstrap } from '../shared/types.ts';
import { defaultConfig } from '../server/store.ts';

// Boots the real shell against a stubbed local API and draws every page once. It guards the
// module split: a page that forgets an import or reads state before `refresh()` fails here.
const browser = new Window({ url: 'http://localhost:4318/?channel=tech' });
for (const name of [
  'window',
  'document',
  'location',
  'history',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLFormElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'HTMLDialogElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'CustomEvent',
  'MutationObserver',
] as const) {
  Object.assign(globalThis, {
    [name]: name === 'window' ? browser : name === 'document' ? browser.document : browser[name],
  });
}
browser.document.body.append(browser.document.createElement('div'));
browser.document.body.lastElementChild!.id = 'app';

const now = '2026-10-28T12:00:00.000Z';
const source = {
  title: 'Referência',
  url: 'https://example.com/ref',
  publisher: 'Exemplo',
  retrievedAt: '2026-10-28',
  license: 'Referência documental',
};
function bootstrap(): Bootstrap {
  return {
    schemaVersion: 1,
    csrfToken: 'csrf-test',
    config: defaultConfig(),
    channelConfigs: {},
    channels: [
      {
        id: 'tech',
        name: 'Canal Tech',
        description: 'Explicações de tecnologia',
        niche: 'Tecnologia',
        audience: 'Curiosos',
        language: 'pt-BR',
        createdAt: now,
        updatedAt: now,
      },
    ],
    research: [
      {
        id: 'research-1',
        channelId: 'tech',
        title: 'Por que a GPU venceu?',
        niche: 'Tecnologia',
        audience: 'Curiosos',
        hypothesis: 'Paralelismo',
        differentiation: 'Analogia própria',
        keywords: ['gpu'],
        sources: [source],
        demandScore: 50,
        competitionScore: 40,
        feasibilityScore: 70,
        notes: '',
        status: 'reviewed',
        createdAt: now,
        updatedAt: now,
      },
    ],
    scripts: [
      {
        id: 'script-1',
        channelId: 'tech',
        researchId: 'research-1',
        topicId: 'topico-1',
        title: 'Por que a GPU venceu?',
        series: 'Tecnologia',
        format: 'short',
        hook: 'Gancho',
        scenes: [
          {
            id: 0,
            heading: 'Abertura',
            narration: 'Eram 175 bilhões de parâmetros.',
            visualBrief: '#numero 175 bilhões | parâmetros',
            durationHintSecs: 5,
          },
        ],
        sources: [source],
        claims: [{ text: 'Afirmação', status: 'unverified', sourceUrls: [source.url] }],
        crossChecked: false,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      },
    ],
    stories: [
      {
        id: 'story-1',
        channelId: 'tech',
        scriptId: 'script-1',
        title: 'Arco',
        hook: 'Gancho',
        setup: 'Contexto',
        conflict: 'Tensão',
        turningPoint: 'Virada',
        resolution: 'Resolução',
        cta: 'Próximo passo',
        createdAt: now,
        updatedAt: now,
      },
    ],
    monetization: [],
    receipts: [],
    connections: [],
    capabilities: [
      {
        platform: 'youtube',
        label: 'YouTube',
        connectionMethod: 'oauth',
        metricsAvailable: true,
        revenueAvailable: false,
        publishingAvailable: false,
        accountLabel: 'ID do canal no YouTube',
        accountPattern: '^UC[A-Za-z0-9_-]{22}$',
        requirements: ['Conta autorizada'],
        revenueNote: 'Sem receita nesta API',
        docsUrl: 'https://developers.google.com/youtube',
      },
    ],
    jobs: [
      {
        id: 'job-1',
        channelId: 'tech',
        scriptId: 'script-1',
        status: 'completed',
        createdAt: now,
        startedAt: now,
        finishedAt: now,
        message: 'Concluído',
        qa: { technical: 'pass', editorial: 'needs_human' },
        videoAvailable: true,
      },
    ],
    assets: [],
    engine: { available: true, message: 'Motor disponível' },
  };
}

const calls: string[] = [];
let authenticated = false;
const json = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const path = String(input);
  calls.push(path);
  if (path === '/api/auth/status')
    return json(200, { configured: true, authenticated, csrfToken: 'csrf-test' });
  if (path === '/api/bootstrap') return json(200, bootstrap());
  return json(404, { error: `Sem resposta de teste para ${path}.` });
}) as typeof fetch;

const { start } = await import('../src/studio/shell.ts');
const { pages, render, currentPage, studio } = await import('../src/studio/state.ts');
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const main = () => browser.document.querySelector('#main-content');

test('an unauthenticated visit shows the login form and loads nothing else', async () => {
  await start();
  assert.ok(browser.document.querySelector('[data-testid="auth-password"]'));
  assert.equal(main(), null);
  assert.deepEqual(calls, ['/api/auth/status']);
});

test('after login every page renders from the shared state with its own navigation entry', async () => {
  authenticated = true;
  calls.length = 0;
  await start();
  assert.deepEqual(calls, ['/api/auth/status', '/api/bootstrap']);
  assert.equal(studio.channelId, 'tech');
  for (const page of Object.keys(pages) as Array<keyof typeof pages>) {
    browser.location.hash = page;
    render();
    await settle();
    assert.equal(currentPage(), page);
    const current = browser.document.querySelector('[aria-current="page"]');
    assert.equal(current?.getAttribute('data-testid'), `nav-${page}`, page);
    assert.ok(browser.document.title.startsWith(pages[page].title), page);
    assert.ok((main()?.textContent ?? '').trim().length > 40, `${page} renders content`);
  }
  // Editors mount the stored records, not an empty form.
  browser.location.hash = 'scripts';
  render();
  assert.equal(
    (browser.document.querySelector('[data-testid="script-title"]') as unknown as HTMLInputElement | null)
      ?.value,
    'Por que a GPU venceu?',
  );
  assert.ok(browser.document.querySelector('[data-testid="scene-0-narration"]'));
  browser.location.hash = 'production';
  render();
  assert.ok(browser.document.querySelector('[data-testid="job-job-1"]'));
  // No page issued a request on its own while drawing.
  assert.ok(
    calls.every(
      (path) => path === '/api/auth/status' || path === '/api/bootstrap' || path.startsWith('/api/creative/'),
    ),
    calls.join(', '),
  );
});

test('a finished video shows one card per network with its own state and action', async () => {
  const { jobCard } = await import('../src/pages/production.ts');
  const data = bootstrap();
  data.scripts[0].format = 'long';
  data.connections = [
    {
      channelId: 'tech',
      platform: 'tiktok',
      accountId: 'open-id',
      displayName: 'Fixture',
      status: 'connected',
      connectedAt: now,
      expiresAt: null,
      scopes: ['video.publish'],
    },
  ];
  const job = {
    ...data.jobs[0],
    engine: 'motion' as const,
    publications: {
      youtube: { status: 'uploaded' as const, postId: 'abcdefghijk', uploadedAt: now },
    },
  };
  data.jobs = [job, { ...job, id: 'short-1', kind: 'short', sourceJobId: 'job-1', publications: {} }];
  studio.data = data;
  studio.channelId = 'tech';
  const card = jobCard(job);
  const network = (platform: string) => card.querySelector(`[data-testid="network-${platform}-job-1"]`)!;
  assert.match(network('youtube').textContent!, /Enviado ao YouTube como privado/);
  assert.ok(network('youtube').querySelector('a[href^="https://studio.youtube.com/video/abcdefghijk"]'));
  assert.ok(network('tiktok').querySelector('[data-testid="publish-tiktok-job-1"]'), 'Connected and ready');
  assert.match(network('instagram').textContent!, /vai o Short deste vídeo/);
  assert.equal(network('instagram').querySelector('button'), null);
  assert.match(network('facebook').textContent!, /vai o Short deste vídeo/);
  assert.equal(
    [...card.querySelectorAll('button')].some((item) => item.textContent?.includes('Gerar Short')),
    false,
    'The Short already exists',
  );
  const shortCard = jobCard(data.jobs[1]);
  const instagram = shortCard.querySelector('[data-testid="network-instagram-short-1"]')!;
  assert.match(instagram.textContent!, /Conecte o Instagram/);
  assert.match(instagram.textContent!, /Público/);
});
