import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { Channel, Script, WebJob } from '../shared/types.ts';

const browser = new Window({ url: 'http://127.0.0.1:4318' });
for (const name of [
  'window',
  'document',
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
  'MutationObserver',
] as const)
  Object.assign(globalThis, {
    [name]: name === 'window' ? browser : name === 'document' ? browser.document : browser[name],
  });
const { openProduction } = await import('../src/production-ui.ts');
const { hasUnsavedEdits } = await import('../src/edit-protection.ts');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
afterEach(() => document.body.replaceChildren());
const date = '2026-10-28T00:00:00Z';
const channel: Channel = {
  id: 'tech',
  name: 'Canal de teste',
  niche: '',
  audience: '',
  language: 'pt-BR',
  description: '',
  createdAt: date,
  updatedAt: date,
};
const script: Script = {
  id: 'script-one',
  channelId: 'tech',
  topicId: 'topic-one',
  title: 'Roteiro demonstrativo',
  series: 'tecnologia',
  format: 'long',
  hook: 'Uma pergunta',
  scenes: [
    {
      id: 42,
      heading: 'Uma explicação',
      narration: 'Fala do roteiro.',
      visualBrief: 'Diagrama',
      durationHintSecs: 20,
    },
  ],
  sources: [1, 2].map((id) => ({
    title: `Fonte ${id}`,
    url: `https://example.com/${id}`,
    publisher: 'Fixture',
    retrievedAt: date,
    license: 'Referência',
  })),
  claims: [{ text: 'Alegação de teste', status: 'cited', sourceUrls: ['https://example.com/1'] }],
  crossChecked: true,
  status: 'reviewed',
  createdAt: date,
  updatedAt: date,
};
const job: WebJob = {
  id: 'job-one',
  channelId: 'tech',
  scriptId: 'script-one',
  status: 'queued',
  createdAt: date,
  message: 'Fila',
  videoAvailable: false,
};

function open(value: Script[], api: (path: string, method?: string, body?: unknown) => Promise<unknown>) {
  let started = false;
  const dialog = openProduction({
    channel,
    scripts: value,
    currentChannelId: () => channel.id,
    api: api as never,
    onStarted: async () => {
      started = true;
    },
    onEditScript: () => {},
  });
  return { dialog, started: () => started };
}

test('a saved script starts a motion preview with no scene files, uploads or licence forms', async () => {
  const calls: Array<{ path: string; method?: string; body: unknown }> = [];
  const { dialog, started } = open([script], async (path, method, body) => {
    calls.push({ path, method, body });
    return job;
  });
  assert.deepEqual(calls, [], 'Nothing is prepared before the operator asks for a video');
  assert.equal(dialog.querySelector('input[type=file]'), null);
  assert.equal(dialog.querySelector('input[name=license]'), null);
  assert.equal(dialog.querySelector('select[name^="asset-"]'), null);
  assert.equal(dialog.querySelector('img'), null);
  assert.equal(dialog.querySelector('input[name=asr]'), null);
  assert.equal(dialog.querySelector('input[name=burnSubtitles]'), null);
  assert.equal(hasUnsavedEdits(), false, 'Opening the preparation must not create a discard warning');
  assert.match(dialog.textContent!, /1 cena no roteiro/);
  dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
  await tick();
  await tick();
  assert.equal(started(), true);
  assert.deepEqual(calls, [
    { path: '/api/channels/tech/jobs', method: 'POST', body: { scriptId: 'script-one', previewOnly: true } },
  ]);
});

test('the final version sends only the script', async () => {
  const bodies: unknown[] = [];
  const { dialog } = open([script], async (_path, _method, body) => {
    bodies.push(body);
    return job;
  });
  dialog.querySelector<HTMLButtonElement>('[data-testid="final-video"]')!.click();
  await tick();
  await tick();
  assert.deepEqual(bodies, [{ scriptId: 'script-one' }]);
});

test('a preparation for a channel the operator left starts nothing', async () => {
  let owner = 'tech';
  let jobs = 0;
  const dialog = openProduction({
    channel,
    scripts: [script],
    currentChannelId: () => owner,
    api: (async () => {
      jobs++;
      return job;
    }) as never,
    onStarted: async () => {},
    onEditScript: () => {},
  });
  owner = 'science';
  dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
  await tick();
  await tick();
  assert.equal(jobs, 0);
  assert.match(dialog.querySelector('[role="alert"]')?.textContent ?? '', /canal ou roteiro mudou/);
});

test('a contradicted claim blocks the final video; a pending claim or no source at all does not', () => {
  const sourceless = open([{ ...script, sources: [], claims: [] }], async () => job).dialog;
  assert.equal(
    sourceless.querySelector<HTMLButtonElement>('[data-testid="final-video"]')!.disabled,
    false,
    'QA names a missing source in the report; it no longer disables the final video',
  );
  sourceless.close();
  const pending = open(
    [{ ...script, sources: [script.sources[0]], claims: [{ ...script.claims[0], status: 'unverified' }] }],
    async () => job,
  ).dialog;
  assert.equal(pending.querySelector<HTMLButtonElement>('[data-testid="final-video"]')!.disabled, false);
  pending.close();
  const { dialog } = open(
    [{ ...script, claims: [{ ...script.claims[0], status: 'contradicted' }] }],
    async () => job,
  );
  assert.equal(dialog.querySelector<HTMLButtonElement>('[data-testid="final-video"]')!.disabled, true);
  assert.equal(dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled, false);
  assert.match(dialog.textContent!, /alegações/);
});

test('pending sources still allow an explicitly marked video preview', async () => {
  let sent: unknown;
  const { dialog } = open(
    [{ ...script, crossChecked: false, claims: [], sources: [] }],
    async (_path, _m, body) => {
      sent = body;
      return job;
    },
  );
  const preview = dialog.querySelector<HTMLButtonElement>('button[type=submit]')!;
  assert.equal(preview.disabled, false);
  assert.match(preview.textContent!, /Gerar prévia do vídeo/);
  assert.equal(dialog.querySelector<HTMLButtonElement>('[data-testid="final-video"]')!.disabled, true);
  preview.click();
  await tick();
  await tick();
  assert.deepEqual(sent, { scriptId: script.id, previewOnly: true });
});
