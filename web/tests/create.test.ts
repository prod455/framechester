import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { Bootstrap, Script, WebJob } from '../shared/types.ts';
import { defaultConfig } from '../server/store.ts';

const browser = new Window({ url: 'http://127.0.0.1:4318' });
for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent'] as const)
  Object.assign(globalThis, {
    [name]: name === 'window' ? browser : name === 'document' ? browser.document : browser[name],
  });
const { renderCreate, videoProgress } = await import('../src/create.ts');
afterEach(() => document.body.replaceChildren());

const date = '2026-10-31T00:00:00Z';
const script: Script = {
  id: 'script-one',
  channelId: 'tech',
  topicId: 'topic-one',
  title: 'Agente ou skill?',
  series: 'ia',
  format: 'short',
  hook: 'Uma pergunta',
  scenes: [{ id: 0, heading: 'Gancho', narration: 'Fala.', visualBrief: '', durationHintSecs: 5 }],
  sources: [],
  claims: [],
  crossChecked: true,
  status: 'reviewed',
  createdAt: date,
  updatedAt: date,
};
const job = (overrides: Partial<WebJob> = {}): WebJob => ({
  id: 'job-1',
  channelId: 'tech',
  scriptId: 'script-one',
  status: 'completed',
  createdAt: date,
  message: 'Vídeo aprovado.',
  videoAvailable: true,
  ...overrides,
});
const state = (jobs: WebJob[], youtube = false): Bootstrap => ({
  schemaVersion: 1,
  channels: [
    {
      id: 'tech',
      name: 'Tech',
      description: '',
      niche: '',
      audience: '',
      language: 'pt-BR',
      createdAt: date,
      updatedAt: date,
    },
  ],
  config: defaultConfig(),
  channelConfigs: {},
  research: [],
  scripts: [script],
  stories: [],
  monetization: [],
  receipts: [],
  csrfToken: 'csrf',
  connections: youtube
    ? [
        {
          channelId: 'tech',
          platform: 'youtube',
          accountId: `UC${'a'.repeat(22)}`,
          displayName: 'Tech',
          status: 'connected',
          connectedAt: date,
          expiresAt: null,
          scopes: [],
        },
      ]
    : [],
  capabilities: [],
  jobs,
  assets: [],
});
const states = (jobs: WebJob[], youtube = false) =>
  videoProgress(state(jobs, youtube), 'tech').steps.map((step) => step.state);

test('the four steps follow the latest video from topic to YouTube', () => {
  assert.deepEqual(states([]), ['current', 'waiting', 'waiting', 'waiting']);
  assert.deepEqual(states([job({ status: 'running', videoAvailable: false })]), [
    'done',
    'current',
    'waiting',
    'waiting',
  ]);
  assert.deepEqual(states([job({ status: 'failed', videoAvailable: false })]), [
    'done',
    'stopped',
    'waiting',
    'waiting',
  ]);
  assert.deepEqual(states([job({ status: 'needs_review', previewOnly: true })]), [
    'done',
    'done',
    'current',
    'waiting',
  ]);
  assert.deepEqual(states([job()]), ['done', 'done', 'done', 'current']);
  assert.deepEqual(
    states([job({ youtube: { status: 'uploaded', videoId: 'abcdefghijk', uploadedAt: date } })]),
    ['done', 'done', 'done', 'done'],
  );
  assert.deepEqual(states([job({ youtube: { status: 'failed', message: 'Reconecte', failedAt: date } })]), [
    'done',
    'done',
    'done',
    'stopped',
  ]);
  // The newest job wins: a new preview after an uploaded video starts the review again.
  const older = job({
    id: 'old',
    createdAt: '2026-10-30T00:00:00Z',
    youtube: { status: 'uploaded', videoId: 'abcdefghijk', uploadedAt: date },
  });
  assert.deepEqual(states([older, job({ status: 'needs_review', previewOnly: true })]), [
    'done',
    'done',
    'current',
    'waiting',
  ]);
});

test('each step offers only the next action', () => {
  const calls: string[] = [];
  const actions = {
    createChannel: () => calls.push('channel'),
    newVideo: () => calls.push('new'),
    watch: () => calls.push('watch'),
    finalVersion: (record: Script) => calls.push(`final:${record.id}`),
    connectYoutube: () => calls.push('connect'),
    retry: (record: Script) => calls.push(`retry:${record.id}`),
    sendButton: () => browser.document.createElement('button') as unknown as HTMLElement,
    youtubeStatus: () => null,
    allVideos: () => calls.push('videos'),
  };
  const click = (root: HTMLElement, label: string) =>
    [...root.querySelectorAll('button')].find((button) => button.textContent?.includes(label))!.click();

  const preview = renderCreate(state([job({ status: 'needs_review', previewOnly: true })]), 'tech', actions);
  click(preview, 'Gerar versão final');
  click(preview, 'Começar outro vídeo');
  assert.deepEqual(calls, ['final:script-one', 'new']);

  const stopped = renderCreate(state([job({ status: 'failed', videoAvailable: false })]), 'tech', actions);
  click(stopped, 'Tentar de novo');
  assert.equal(calls.at(-1), 'retry:script-one');
  assert.match(stopped.textContent!, /1 de 4 passos/);
  const sent = renderCreate(
    state([job({ youtube: { status: 'uploaded', videoId: 'abcdefghijk', uploadedAt: date } })], true),
    'tech',
    actions,
  );
  assert.match(sent.textContent!, /Falta só publicar no YouTube Studio/);
  const generating = renderCreate(
    state([job({ status: 'running', videoAvailable: false })]),
    'tech',
    actions,
  );
  assert.ok(
    generating.querySelector('[data-testid="step-generate"] [role="progressbar"]'),
    'visible work while generating',
  );

  const unconnected = renderCreate(state([job()]), 'tech', actions);
  click(unconnected, 'Conectar YouTube');
  assert.equal(calls.at(-1), 'connect');

  const empty = renderCreate({ ...state([]), channels: [] }, '', actions);
  assert.match(empty.textContent!, /Crie seu canal/);
  click(empty, 'Criar canal');
  assert.equal(calls.at(-1), 'channel');
});
