import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { AIUsageSnapshot, AIUsageTotals } from '../shared/ai-usage-types.ts';
const browser = new Window({ url: 'http://localhost:4318' });
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
  'KeyboardEvent',
  'CustomEvent',
  'MutationObserver',
] as const)
  Object.assign(globalThis, {
    [name]: name === 'window' ? browser : name === 'document' ? browser.document : browser[name],
  });
const { createAIUsagePanel } = await import('../src/ai-usage-ui.ts');
const originalFetch = globalThis.fetch;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
afterEach(() => {
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});
const totals: AIUsageTotals = {
  generationRequests: 2,
  estimateRequests: 3,
  successfulGenerations: 1,
  failedGenerations: 0,
  unknownGenerations: 1,
  inputTokens: 1000,
  outputTokens: 200,
  cachedInputTokens: 0,
  reasoningTokens: 0,
  estimatedCostUsd: 0.004,
  unknownCostRequests: 1,
  unknownUsageRequests: 1,
};
const snapshot: AIUsageSnapshot = {
  scope: 'studio',
  channelId: 'tech',
  from: '2026-09-28T12:00:00Z',
  to: '2026-10-28T12:00:00Z',
  totals,
  byCredential: [
    {
      ...totals,
      credentialId: 'opaque-credential-one',
      provider: 'openai',
      lastUsedAt: '2026-10-28T11:00:00Z',
    },
  ],
  events: [
    {
      id: 'event-one',
      channelId: 'tech',
      provider: 'openai',
      credentialId: 'opaque-credential-one',
      task: 'story',
      model: 'gpt-6.1-sol',
      operation: 'generation',
      status: 'unknown',
      startedAt: '2026-10-28T11:00:00Z',
      finishedAt: null,
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      reasoningTokens: null,
      estimatedCostUsd: null,
      pricingCheckedAt: '2026-10-28',
    },
  ],
};

test('usage panel distinguishes calculated Studio usage from official billing and unknown amounts', async () => {
  let url = '';
  globalThis.fetch = async (target) => {
    url = String(target);
    return Response.json(snapshot);
  };
  const panel = createAIUsagePanel('tech', 'Canal de teste');
  document.body.append(panel.node);
  await panel.refresh();
  assert.match(url, /channels\/tech\/creative\/usage\?days=30/);
  assert.match(document.body.textContent!, /Consumo no Studio/);
  assert.match(document.body.textContent!, /1 geração.*sem custo confirmado/);
  assert.match(document.body.textContent!, /Não informado/);
  assert.match(document.body.textContent!, /0[,.]004/);
  assert.match(document.body.textContent!, /somente.*Framechester|feito.*Studio/);
  assert.equal(document.querySelectorAll('a[target="_blank"]').length, 2);
  assert.equal(document.body.textContent!.includes('sk-'), false);
  assert.match(document.body.textContent!, /OpenAI/);
});

test('usage filters fetch only the selected channel and discard stale responses', async () => {
  const resolvers: Array<(value: Response) => void> = [],
    urls: string[] = [];
  globalThis.fetch = async (target) => {
    urls.push(String(target));
    return new Promise<Response>((resolve) => resolvers.push(resolve));
  };
  const panel = createAIUsagePanel('tech', 'Canal de teste');
  document.body.append(panel.node);
  const first = panel.refresh();
  const provider = document.querySelector<HTMLSelectElement>('[name="ai-usage-provider"]')!;
  provider.value = 'openai';
  provider.dispatchEvent(new Event('change'));
  assert.match(urls[1], /provider=openai/);
  resolvers[1](Response.json({ ...snapshot, totals: { ...totals, generationRequests: 7 } }));
  await tick();
  resolvers[0](Response.json({ ...snapshot, channelId: 'science' }));
  await first;
  await tick();
  assert.doesNotMatch(document.body.textContent!, /outro canal|incompatível/);
  assert.equal(document.querySelector<HTMLButtonElement>('[data-usage-refresh]')!.disabled, false);
  const days = document.querySelector<HTMLSelectElement>('[name="ai-usage-days"]')!;
  days.value = '7';
  days.dispatchEvent(new Event('change'));
  assert.match(urls[2], /days=7&provider=openai/);
  resolvers[2](Response.json(snapshot));
  await tick();
});

test('empty and failed usage queries remain explicit and can be refreshed without a provider call', async () => {
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return count === 1
      ? Response.json({ error: 'Registro indisponível.' }, { status: 503 })
      : Response.json({
          ...snapshot,
          events: [],
          byCredential: [],
          totals: {
            ...totals,
            generationRequests: 0,
            estimateRequests: 0,
            inputTokens: null,
            outputTokens: null,
            estimatedCostUsd: null,
            unknownCostRequests: 0,
            unknownUsageRequests: 0,
          },
        });
  };
  const panel = createAIUsagePanel('tech');
  document.body.append(panel.node);
  await panel.refresh();
  assert.match(document.body.textContent!, /Registro indisponível/);
  await panel.refresh();
  assert.match(document.body.textContent!, /Nenhuma chamada registrada/);
  assert.equal(count, 2);
});

test('usage from a different channel is rejected and a closed panel does not receive late results', async () => {
  let resolve: (value: Response) => void = () => {};
  globalThis.fetch = async () =>
    new Promise<Response>((done) => {
      resolve = done;
    });
  const panel = createAIUsagePanel('tech');
  document.body.append(panel.node);
  let loading = panel.refresh();
  resolve(Response.json({ ...snapshot, channelId: 'science' }));
  await loading;
  assert.match(panel.node.textContent!, /não corresponde.*canal/);
  loading = panel.refresh();
  panel.node.remove();
  resolve(Response.json(snapshot));
  await loading;
  assert.equal(panel.node.querySelectorAll('table').length, 0);
});
