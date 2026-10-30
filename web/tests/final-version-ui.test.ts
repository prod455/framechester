import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { Channel, PreparedVisuals, Script, WebJob } from '../shared/types.ts';
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
const { openFinalVersion } = await import('../src/final-version-ui.ts');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
afterEach(() => document.body.replaceChildren());
const date = '2026-10-29T00:00:00Z';
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
// What "Produzir com IA" saves when Crossref finds nothing for a Portuguese title.
const script: Script = {
  id: 'script-ai',
  channelId: 'tech',
  topicId: 'topico-ai',
  title: 'Por que a GPU virou o cérebro da IA',
  series: 'Tecnologia',
  format: 'short',
  hook: 'Por que uma placa de vídeo virou o cérebro da IA?',
  scenes: [
    {
      id: 0,
      heading: 'A pergunta',
      narration: 'Por que?',
      visualBrief: '#pergunta Por que?',
      durationHintSecs: 4,
    },
    {
      id: 1,
      heading: 'Em fila',
      narration: 'A CPU resolve em fila.',
      visualBrief: 'Diagrama',
      durationHintSecs: 6,
    },
  ],
  sources: [],
  claims: [],
  crossChecked: false,
  status: 'draft',
  createdAt: date,
  updatedAt: date,
};
const prepared: PreparedVisuals = {
  scriptId: script.id,
  assets: [],
  bindings: { 0: 'visual-0', 1: 'visual-1' },
  previews: { 0: 'visual-0', 1: 'visual-1' },
};
const job: WebJob = {
  id: 'job-final',
  channelId: 'tech',
  scriptId: script.id,
  status: 'queued',
  createdAt: date,
  message: 'Fila',
  videoAvailable: false,
};

function open(value: Script, api: (path: string, method?: string, body?: unknown) => Promise<unknown>) {
  const started: WebJob[] = [];
  const dialog = openFinalVersion({
    channel,
    script: value,
    config: defaultConfig(),
    api: api as never,
    onStarted: async (job) => {
      started.push(job);
    },
    onEditScript: () => {},
    onManual: () => {},
  });
  return { dialog, started };
}

test('an AI script with no source reaches the final video after the declaration, in one dialog', async () => {
  const calls: Array<{ path: string; method?: string; body?: unknown }> = [];
  const { dialog, started } = open(script, async (path, method, body) => {
    calls.push({ path, method, body });
    if (path.endsWith('/visuals/prepare')) return prepared;
    if (path.endsWith('/jobs')) return job;
    return { ...script, crossChecked: true };
  });
  const start = dialog.querySelector<HTMLButtonElement>('[data-testid="final-start"]')!;
  assert.equal(start.disabled, true, 'The declaration is the approval');
  assert.match(dialog.textContent!, /Nenhuma fonte/);
  const declaration = dialog.querySelector<HTMLInputElement>('[data-testid="final-declaration"]')!;
  declaration.checked = true;
  declaration.dispatchEvent(new Event('change'));
  assert.equal(start.disabled, false, 'A missing source does not keep the button disabled');
  start.click();
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    ['PUT /api/scripts/script-ai', 'POST /api/channels/tech/visuals/prepare', 'POST /api/channels/tech/jobs'],
  );
  assert.deepEqual(calls[0].body, { channelId: 'tech', crossChecked: true });
  assert.deepEqual(calls[2].body, {
    scriptId: script.id,
    assetIds: { 0: 'visual-0', 1: 'visual-1' },
    asr: false,
    burnSubtitles: true,
  });
  assert.equal(started.length, 1);
  assert.equal(dialog.open, false);
});

test('an already reviewed script starts without saving it again', async () => {
  const paths: string[] = [];
  const { dialog, started } = open({ ...script, crossChecked: true }, async (path) => {
    paths.push(path);
    return path.endsWith('/jobs') ? job : prepared;
  });
  const start = dialog.querySelector<HTMLButtonElement>('[data-testid="final-start"]')!;
  assert.equal(start.disabled, false);
  start.click();
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(paths, ['/api/channels/tech/visuals/prepare', '/api/channels/tech/jobs']);
  assert.equal(started.length, 1);
});

test('a contradiction or a foreign reference keeps the button disabled and says why', () => {
  for (const claims of [
    [{ text: 'Errado', status: 'contradicted' as const, sourceUrls: [] }],
    [{ text: 'Inventado', status: 'cited' as const, sourceUrls: ['https://example.com/fora'] }],
  ]) {
    const { dialog } = open({ ...script, crossChecked: true, claims }, async () => {
      throw new Error('must not call the API');
    });
    assert.equal(dialog.querySelector<HTMLButtonElement>('[data-testid="final-start"]')!.disabled, true);
    assert.match(dialog.textContent!, /Corrij|Corrija/);
    assert.ok(dialog.querySelector('button')?.textContent);
    dialog.close();
  }
});

test('a scene left without a visual is named instead of failing silently', async () => {
  let jobs = 0;
  const { dialog, started } = open({ ...script, crossChecked: true }, async (path) => {
    if (path.endsWith('/jobs')) jobs++;
    return { ...prepared, bindings: { 0: 'visual-0' } };
  });
  dialog.querySelector<HTMLButtonElement>('[data-testid="final-start"]')!.click();
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(jobs, 0);
  assert.equal(started.length, 0);
  assert.match(dialog.querySelector('[role="alert"]')!.textContent!, /Cena 2 ficou sem visual/);
  assert.match(dialog.textContent!, /Abrir preparação manual/);
  assert.equal(dialog.querySelector<HTMLButtonElement>('[data-testid="final-start"]')!.disabled, false);
});

test('an API error is shown and the button can be used again', async () => {
  const { dialog } = open({ ...script, crossChecked: true }, async () => {
    throw new Error('O motor Rust está desatualizado.');
  });
  const start = dialog.querySelector<HTMLButtonElement>('[data-testid="final-start"]')!;
  start.click();
  for (let i = 0; i < 6; i++) await tick();
  assert.match(dialog.querySelector('[role="alert"]')!.textContent!, /desatualizado/);
  assert.equal(start.disabled, false);
});
