import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIUsageStore } from '../server/ai-usage.ts';

const date = new Date('2026-10-28T12:00:00.000Z');
const input = {
  channelId: 'tech',
  provider: 'anthropic' as const,
  key: 'synthetic-secret-only-123456789',
  task: 'script' as const,
  model: 'claude-sonnet-5-5',
  operation: 'generation' as const,
  pricingCheckedAt: '2026-10-28',
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fc-ai-usage-'));
  return { root, directory: join(root, 'usage'), close: () => rm(root, { recursive: true, force: true }) };
}

test('usage records persist metadata only and identify keys without exposing key fragments', async () => {
  const f = await fixture();
  try {
    const store = new AIUsageStore(f.directory, { now: () => date });
    const first = await store.begin(input);
    assert.equal(first.status, 'pending');
    assert.equal(first.inputTokens, null);
    assert.equal(first.estimatedCostUsd, null);
    await store.finish(first.id, {
      status: 'succeeded',
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      estimatedCostUsd: 0.0004,
    });
    const second = await store.begin(input);
    const rotated = await store.begin({ ...input, key: 'synthetic-rotated-secret-987654321' });
    const foreign = await store.begin({ ...input, channelId: 'science' });
    const provider = await store.begin({ ...input, provider: 'openai', model: 'gpt-6.1-sol' });
    assert.equal(second.credentialId, first.credentialId);
    for (const record of [rotated, foreign, provider])
      assert.notEqual(record.credentialId, first.credentialId);
    assert.match(first.credentialId, /^[a-f0-9]{24,64}$/);
    const text = await readFile(join(f.directory, 'usage.json'), 'utf8');
    assert.equal(text.includes(input.key), false);
    assert.equal(text.includes('synthetic-rotated'), false);
    const snapshot = await store.snapshot('tech');
    assert.equal(snapshot.scope, 'studio');
    assert.equal(snapshot.events.length, 4);
    assert.equal(snapshot.totals.generationRequests, 4);
    assert.equal(snapshot.totals.estimatedCostUsd, 0.0004);
    assert.equal(snapshot.totals.unknownCostRequests, 3);
    assert.equal(snapshot.byCredential.length, 3);
  } finally {
    await f.close();
  }
});

test('estimates never double count billable generation tokens, and unavailable values remain unknown', async () => {
  const f = await fixture();
  try {
    const store = new AIUsageStore(f.directory, { now: () => date });
    const estimate = await store.begin({ ...input, operation: 'estimate' });
    await store.finish(estimate.id, { status: 'succeeded', inputTokens: 1000, estimatedCostUsd: 0 });
    let snapshot = await store.snapshot('tech');
    assert.equal(snapshot.totals.estimateRequests, 1);
    assert.equal(snapshot.totals.generationRequests, 0);
    assert.equal(snapshot.totals.inputTokens, null);
    assert.equal(snapshot.totals.estimatedCostUsd, null);
    const generation = await store.begin(input);
    await store.finish(generation.id, { status: 'unknown' });
    snapshot = await store.snapshot('tech');
    assert.equal(snapshot.totals.unknownGenerations, 1);
    assert.equal(snapshot.totals.unknownCostRequests, 1);
    assert.equal(snapshot.totals.inputTokens, null);
    assert.equal(snapshot.totals.estimatedCostUsd, null);
    const zero = await store.begin(input);
    await store.finish(zero.id, {
      status: 'failed',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      estimatedCostUsd: 0,
    });
    snapshot = await store.snapshot('tech');
    assert.equal(snapshot.totals.estimatedCostUsd, 0);
    assert.equal(snapshot.totals.outputTokens, 0);
    assert.equal(snapshot.totals.failedGenerations, 1);
    assert.equal(snapshot.totals.unknownCostRequests, 1);
  } finally {
    await f.close();
  }
});

test('restarting preserves usage and marks unfinished requests unknown rather than free', async () => {
  const f = await fixture();
  try {
    const first = new AIUsageStore(f.directory, { now: () => date });
    const pending = await first.begin(input);
    const known = await first.begin(input);
    await first.finish(known.id, {
      status: 'rejected',
      inputTokens: 300,
      outputTokens: 50,
      estimatedCostUsd: 0.001,
    });
    const reopened = new AIUsageStore(f.directory, { now: () => new Date(date.getTime() + 10000) });
    const snapshot = await reopened.snapshot('tech');
    const recovered = snapshot.events.find((row) => row.id === pending.id)!;
    assert.equal(recovered.status, 'unknown');
    assert.equal(recovered.estimatedCostUsd, null);
    assert.equal(snapshot.events.find((row) => row.id === known.id)!.estimatedCostUsd, 0.001);
    assert.equal(snapshot.totals.failedGenerations, 1);
    assert.equal(snapshot.totals.unknownGenerations, 1);
    const again = await reopened.begin(input);
    assert.equal(again.credentialId, pending.credentialId);
  } finally {
    await f.close();
  }
});

test('rolling window, provider filters and event limits do not truncate totals', async () => {
  const f = await fixture();
  let time = new Date(date.getTime() - 31 * 86400000);
  try {
    const store = new AIUsageStore(f.directory, { now: () => time });
    const old = await store.begin(input);
    await store.finish(old.id, {
      status: 'succeeded',
      inputTokens: 9000,
      outputTokens: 9000,
      estimatedCostUsd: 9,
    });
    time = date;
    for (let i = 0; i < 105; i++) {
      const row = await store.begin({ ...input, provider: i % 2 ? 'openai' : 'anthropic' });
      await store.finish(row.id, {
        status: 'succeeded',
        inputTokens: 10,
        outputTokens: 2,
        estimatedCostUsd: 0.01,
      });
    }
    const current = await store.snapshot('tech');
    assert.equal(current.events.length, 100);
    assert.equal(current.totals.generationRequests, 105);
    assert.equal(current.totals.inputTokens, 1050);
    assert.ok(Math.abs(current.totals.estimatedCostUsd! - 1.05) < 1e-10);
    assert.equal(
      (await store.snapshot('tech', { provider: 'openai', days: 7 })).totals.generationRequests,
      52,
    );
    assert.equal((await store.snapshot('tech', { days: 90 })).totals.generationRequests, 106);
    assert.equal(await store.hasHistory('tech'), true);
    assert.equal(await store.hasHistory('science'), false);
    await assert.rejects(store.snapshot('tech', { days: 0 }), /período|dias/i);
    await assert.rejects(store.snapshot('tech', { days: 91 }), /período|dias/i);
  } finally {
    await f.close();
  }
});

test('invalid metadata and invalid patches cannot persist arbitrary text or lose concurrent updates', async () => {
  const f = await fixture();
  try {
    const store = new AIUsageStore(f.directory, { now: () => date });
    await assert.rejects(store.begin({ ...input, channelId: '../escape' }), /canal|consumo/i);
    await assert.rejects(store.begin({ ...input, model: 'https://private.example/path' }), /modelo|consumo/i);
    await assert.rejects(store.begin({ ...input, provider: 'foreign' } as never), /provedor|consumo/i);
    await assert.rejects(store.begin({ ...input, prompt: 'private payload' } as never), /campo|consumo/i);
    await assert.rejects(store.begin({ ...input, pricingCheckedAt: '2026-99-99' }), /consumo/i);
    const rows = await Promise.all(Array.from({ length: 20 }, () => store.begin(input)));
    await assert.rejects(
      store.finish(rows[0].id, { status: 'succeeded', inputTokens: -1 }),
      /tokens|consumo/i,
    );
    await assert.rejects(
      store.finish(rows[0].id, { status: 'succeeded', estimatedCostUsd: NaN }),
      /custo|consumo/i,
    );
    await assert.rejects(
      store.finish(rows[0].id, { status: 'succeeded', error: 'secret' } as never),
      /campo|consumo/i,
    );
    await Promise.all(
      rows.map((row) =>
        store.finish(row.id, {
          status: 'succeeded',
          inputTokens: 1,
          outputTokens: 2,
          estimatedCostUsd: 0.001,
        }),
      ),
    );
    const snapshot = await store.snapshot('tech');
    assert.equal(snapshot.events.length, 20);
    assert.equal(snapshot.totals.successfulGenerations, 20);
    assert.equal(snapshot.totals.inputTokens, 20);
  } finally {
    await f.close();
  }
});

test('unsafe or malformed storage fails closed without exposing contents', async (t) => {
  const f = await fixture();
  try {
    await mkdir(f.directory);
    const target = join(f.root, 'outside.json');
    await writeFile(target, 'SYNTHETIC-PRIVATE-UPSTREAM-ERROR');
    const path = join(f.directory, 'usage.json');
    await link(target, path);
    await assert.rejects(new AIUsageStore(f.directory).begin(input), /armazenamento|consumo/i);
    assert.equal(await readFile(target, 'utf8'), 'SYNTHETIC-PRIVATE-UPSTREAM-ERROR');
    await rm(path);
    await writeFile(path, 'SYNTHETIC-PRIVATE-UPSTREAM-ERROR');
    await assert.rejects(
      new AIUsageStore(f.directory).snapshot('tech'),
      (error) =>
        error instanceof Error &&
        /armazenamento|consumo/i.test(error.message) &&
        !error.message.includes('SYNTHETIC'),
    );
    await rm(path);
    try {
      await symlink(target, path, 'file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.diagnostic('file symlink unavailable; hardlink and malformed paths verified');
        return;
      }
      throw error;
    }
    await assert.rejects(new AIUsageStore(f.directory).snapshot('tech'), /armazenamento|consumo/i);
  } finally {
    await f.close();
  }
});

test('a linked directory is rejected before writing outside the intended profile', async () => {
  const f = await fixture();
  try {
    const outside = join(f.root, 'outside');
    await mkdir(outside);
    await symlink(outside, f.directory, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(new AIUsageStore(f.directory).begin(input), /armazenamento|consumo/i);
    await assert.rejects(readFile(join(outside, 'usage.json')), { code: 'ENOENT' });
  } finally {
    await f.close();
  }
});

test('write failure or missing salt blocks a new request without adding a record', async () => {
  const f = await fixture();
  try {
    const store = new AIUsageStore(f.directory, { now: () => date });
    const first = await store.begin(input);
    await store.finish(first.id, {
      status: 'succeeded',
      inputTokens: 10,
      outputTokens: 2,
      estimatedCostUsd: 0.001,
    });
    const alias = join(f.root, 'history-link.json');
    await link(join(f.directory, 'usage.json'), alias);
    await assert.rejects(store.begin(input), /armazenamento|consumo/i);
    await rm(alias);
    assert.equal((await store.snapshot('tech')).totals.generationRequests, 1);
    const salt = await readFile(join(f.directory, 'salt.json'), 'utf8');
    await rm(join(f.directory, 'salt.json'));
    await assert.rejects(store.begin(input), /armazenamento|consumo/i);
    await writeFile(join(f.directory, 'salt.json'), salt);
    assert.equal((await store.snapshot('tech')).totals.generationRequests, 1);
    await assert.rejects(store.finish(first.id, { status: 'unknown' }), /concluído/i);
  } finally {
    await f.close();
  }
});
