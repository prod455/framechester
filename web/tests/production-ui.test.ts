import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { Channel, Script, WebAsset, PreparedVisuals, WebJob } from '../shared/types.ts';
import { defaultConfig } from '../server/store.ts';

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
const asset: WebAsset = {
  id: 'asset-auto',
  channelId: 'tech',
  name: 'Visual automático.png',
  kind: 'image',
  bytes: 100,
  checksum: 'synthetic-checksum',
  license: 'Original',
  provenance: 'Gerado localmente',
  restrictions: 'Ilustração',
  createdAt: date,
  generated: { scriptId: 'script-one', sceneId: 42, fingerprint: 'synthetic-fingerprint' },
};
const prepared: PreparedVisuals = {
  scriptId: 'script-one',
  assets: [asset],
  bindings: { 42: 'asset-auto' },
  pending: [],
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

test('an empty library automatically prepares and binds scene visuals without upload or licence forms', async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  let started = false;
  const dialog = openProduction({
    channel,
    scripts: [script],
    assets: [],
    config: defaultConfig(),
    currentChannelId: () => channel.id,
    api: async <T>(path: string, method = 'GET', body?: unknown) => {
      assert.equal(method, 'POST');
      calls.push({ path, body });
      return (path.endsWith('/jobs') ? job : prepared) as T;
    },
    onStarted: async () => {
      started = true;
    },
    onAddAssets: () => assert.fail('Automatic preparation must not require an upload'),
    onEditScript: () => {},
  });
  await tick();
  await tick();
  assert.equal(calls[0].path, '/api/channels/tech/visuals/prepare');
  assert.deepEqual(calls[0].body, { scriptId: 'script-one' });
  assert.equal(dialog.querySelector('input[type=file]'), null);
  assert.equal(dialog.querySelector('input[name=license]'), null);
  assert.equal(dialog.querySelector('select[name="asset-42"]')?.getAttribute('name'), 'asset-42');
  assert.equal((dialog.querySelector('select[name="asset-42"]') as HTMLSelectElement).value, 'asset-auto');
  assert.match(dialog.querySelector('img')!.src, /\/api\/channels\/tech\/assets\/asset-auto\/preview$/);
  assert.equal(
    hasUnsavedEdits(),
    false,
    'Preparing visuals is already persisted and must not create a discard warning',
  );
  dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
  await tick();
  await tick();
  assert.equal(started, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, {
    scriptId: 'script-one',
    assetIds: { 42: 'asset-auto' },
    asr: false,
    burnSubtitles: true,
    previewOnly: true,
  });
});

test('a scene requiring a real recording stays unbound and cannot silently use a fabricated image', async () => {
  let jobs = 0;
  const dialog = openProduction({
    channel,
    scripts: [script],
    assets: [],
    config: defaultConfig(),
    currentChannelId: () => channel.id,
    api: async <T>(path: string) => {
      if (path.endsWith('/jobs')) jobs++;
      return {
        scriptId: 'script-one',
        assets: [],
        bindings: {},
        pending: [{ sceneId: 42, reason: 'Esta cena pede uma gravação real.' }],
      } as T;
    },
    onStarted: async () => {},
    onAddAssets: () => {},
    onEditScript: () => {},
  });
  await tick();
  await tick();
  assert.match(dialog.textContent!, /gravação real/);
  assert.equal(dialog.querySelector('img'), null);
  assert.equal((dialog.querySelector('select[name="asset-42"]') as HTMLSelectElement).value, '');
  dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
  await tick();
  assert.equal(jobs, 0);
});

test('late visual responses cannot fill a closed preparation or another channel', async () => {
  let owner = 'tech';
  let finish: (value: PreparedVisuals) => void = () => {};
  const response = new Promise<PreparedVisuals>((resolve) => {
    finish = resolve;
  });
  const dialog = openProduction({
    channel,
    scripts: [script],
    assets: [],
    config: defaultConfig(),
    currentChannelId: () => owner,
    api: async <T>() => (await response) as T,
    onStarted: async () => {},
    onAddAssets: () => {},
    onEditScript: () => {},
  });
  owner = 'science';
  dialog.close();
  finish(prepared);
  await tick();
  await tick();
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('button[type=submit]'), null);
});

test('pending captures show illustrative previews, one recovery summary and an adaptation action', async () => {
  let adapted = '';
  const dialog = openProduction({
    channel,
    scripts: [script],
    assets: [],
    config: defaultConfig(),
    currentChannelId: () => channel.id,
    api: async <T>() =>
      ({
        scriptId: script.id,
        assets: [{ ...asset, generated: { ...asset.generated!, captureRequired: true } }],
        bindings: {},
        previews: { 42: asset.id },
        pending: [{ sceneId: 42, reason: 'Gravação real pendente.' }],
      }) as T,
    onStarted: async () => {},
    onAddAssets: () => {},
    onEditScript: () => {},
    onAdaptScript: (record) => {
      adapted = record.id;
    },
  });
  await tick();
  await tick();
  assert.equal(
    dialog.querySelectorAll('img').length,
    1,
    'The preview must exist even when a recording is pending',
  );
  assert.match(dialog.textContent!, /Prévia ilustrativa/);
  assert.equal(dialog.querySelector<HTMLButtonElement>('[data-testid="final-video"]')!.disabled, true);
  assert.equal(dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled, false);
  const adapt = [...dialog.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Adaptar roteiro com IA'),
  )!;
  assert.ok(adapt);
  adapt.click();
  await tick();
  assert.equal(adapted, script.id);
});

test('a contradicted claim blocks the final video; a pending claim with one source does not', async () => {
  const pending = openProduction({
    channel,
    scripts: [
      { ...script, sources: [script.sources[0]], claims: [{ ...script.claims[0], status: 'unverified' }] },
    ],
    assets: [],
    config: defaultConfig(),
    currentChannelId: () => channel.id,
    api: async <T>() => prepared as T,
    onStarted: async () => {},
    onAddAssets: () => {},
    onEditScript: () => {},
  });
  await tick();
  await tick();
  assert.equal(pending.querySelector<HTMLButtonElement>('[data-testid="final-video"]')!.disabled, false);
  pending.close();
  const dialog = openProduction({
    channel,
    scripts: [{ ...script, claims: [{ ...script.claims[0], status: 'contradicted' }] }],
    assets: [],
    config: defaultConfig(),
    currentChannelId: () => channel.id,
    api: async <T>() => prepared as T,
    onStarted: async () => {},
    onAddAssets: () => {},
    onEditScript: () => {},
  });
  await tick();
  await tick();
  assert.equal(dialog.querySelector<HTMLButtonElement>('[data-testid="final-video"]')!.disabled, true);
  assert.equal(dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled, false);
  assert.match(dialog.textContent!, /alegações/);
});

test('pending sources and recordings still allow an explicitly marked video preview', async () => {
  let sent: unknown;
  const dialog = openProduction({
    channel,
    scripts: [{ ...script, crossChecked: false, claims: [], sources: [] }],
    assets: [],
    config: defaultConfig(),
    currentChannelId: () => channel.id,
    api: async <T>(path: string, _method = 'GET', body?: unknown) => {
      if (path.endsWith('/jobs')) {
        sent = body;
        return job as T;
      }
      return {
        scriptId: script.id,
        assets: [{ ...asset, generated: { ...asset.generated!, captureRequired: true } }],
        bindings: {},
        previews: { 42: asset.id },
        pending: [{ sceneId: 42, reason: 'Gravação pendente' }],
      } as T;
    },
    onStarted: async () => {},
    onAddAssets: () => {},
    onEditScript: () => {},
  });
  await tick();
  await tick();
  const preview = dialog.querySelector<HTMLButtonElement>('button[type=submit]')!;
  assert.equal(preview.disabled, false);
  assert.match(preview.textContent!, /Gerar prévia do vídeo/);
  preview.click();
  await tick();
  await tick();
  assert.deepEqual(sent, {
    scriptId: script.id,
    assetIds: { 42: asset.id },
    asr: false,
    burnSubtitles: true,
    previewOnly: true,
  });
});
