import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrivatePromptStore } from '../server/private-prompt.ts';
import { createCreativeService } from '../server/creative.ts';
import { AIUsageStore } from '../server/ai-usage.ts';
import { defaultConfig } from '../server/store.ts';
import type { AppState } from '../shared/types.ts';
import type { SecretVault } from '../server/vault.ts';

const input = { task: 'story', brief: 'Desenvolva uma narrativa original sobre uma descoberta científica.' };
const key = 'sk-ant-SYNTHETIC-TEST-ONLY-1234567890';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fc-claude-'));
  const settings = new PrivatePromptStore(root);
  await settings.save({
    content: 'PREFERENCIA_SINTETICA_PRIVADA com criatividade e clareza.',
    model: '',
    provider: 'anthropic',
    anthropicModel: 'claude-sonnet-5-5',
    maxOutputTokens: 4096,
    maxCostUsd: 0.25,
  });
  const state: AppState = {
    schemaVersion: 1,
    config: defaultConfig(),
    channelConfigs: {},
    channels: ['tech', 'science'].map((id) => ({
      id,
      name: id,
      description: '',
      niche: 'Ciência',
      audience: 'Curiosos',
      language: 'pt-BR',
      createdAt: '',
      updatedAt: '',
    })),
    research: [],
    scripts: [],
    stories: [],
    monetization: [],
    receipts: [],
  };
  const keys = new Map<string, string>();
  const vault: SecretVault = {
    get: async (id, slot) => keys.get(`${id}/${slot}`) ?? null,
    set: async (id, slot, value) => {
      keys.set(`${id}/${slot}`, value);
    },
    delete: async (id, slot) => {
      keys.delete(`${id}/${slot}`);
    },
  };
  let calls = 0,
    paid = 0;
  let time = new Date('2026-10-28T12:00:00Z');
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.ok(String(url).startsWith('https://api.anthropic.com/v1/messages'));
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.ok(body.system.includes('Preferências pessoais subordinadas'));
    assert.equal(JSON.parse(body.messages[0].content).channel.id, 'tech');
    if (String(url).endsWith('/count_tokens')) return Response.json({ input_tokens: 1600 });
    paid++;
    return Response.json({
      id: 'msg_fixture',
      type: 'message',
      role: 'assistant',
      model: body.model,
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            title: 'Descoberta com contexto',
            body: 'Uma narrativa original e sintética, ainda dependente de revisão editorial.',
          }),
        },
      ],
      usage: { input_tokens: 1600, output_tokens: 200 },
    });
  };
  const service = createCreativeService({
    settings,
    readState: async () => structuredClone(state),
    vault,
    usage: new AIUsageStore(join(root, 'usage'), { now: () => time }),
    fetch: fetcher,
    now: () => time,
  });
  return {
    root,
    settings,
    state,
    keys,
    service,
    calls: () => calls,
    paid: () => paid,
    advance: () => {
      time = new Date(time.getTime() + 600_001);
    },
    close: () => rm(root, { recursive: true, force: true }),
  };
}

test('Claude capabilities and key storage are channel scoped and never contact Anthropic', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.service.capabilities('tech')).available, false);
    await f.service.saveKey!('tech', key);
    assert.deepEqual(await f.service.keyStatus!('tech'), { configured: true });
    assert.deepEqual(await f.service.keyStatus!('science'), { configured: false });
    const caps = await f.service.capabilities('tech');
    assert.equal(caps.available, true);
    assert.equal(caps.provider, 'anthropic');
    assert.equal(JSON.stringify(caps).includes(key), false);
    assert.equal(JSON.stringify(await f.settings.read()).includes(key), false);
    assert.equal(f.calls(), 0);
    await assert.rejects(f.service.saveKey!('missing', key), /canal/i);
    await assert.rejects(f.service.saveKey!('tech', 'bad\nkey'), /chave/i);
    await f.service.deleteKey!('tech');
    assert.equal((await f.service.capabilities('tech')).available, false);
  } finally {
    await f.close();
  }
});

test('Claude requires explicit transfer consent then a one-use cost authorization; drafts stay unsaved', async () => {
  const f = await fixture();
  try {
    await f.service.saveKey!('tech', key);
    await assert.rejects(f.service.draft('tech', input), /autoriz|estimativa/i);
    assert.equal(f.calls(), 0);
    await assert.rejects(f.service.quote!('tech', input), /consent|envi|autoriza/i);
    assert.equal(f.calls(), 0);
    const quote = await f.service.quote!('tech', { ...input, consentToSend: true }, 'session-a');
    assert.equal(f.paid(), 0);
    assert.equal(f.calls(), 1);
    assert.ok(quote.estimatedMaxCostUsd > 0);
    assert.equal(quote.channelId, 'tech');
    const draft = await f.service.draft(
      'tech',
      { ...input, quoteId: quote.id, authorizePaid: true },
      'session-a',
    );
    assert.equal(f.paid(), 1);
    assert.equal(draft.model, 'claude-sonnet-5-5');
    assert.equal(draft.reviewRequired, true);
    assert.equal(draft.status, 'draft');
    assert.equal(draft.usage?.inputTokens, 1600);
    assert.equal(f.state.stories.length, 0);
    assert.equal(JSON.stringify(draft).includes(key), false);
    await assert.rejects(
      f.service.draft('tech', { ...input, quoteId: quote.id, authorizePaid: true }, 'session-a'),
      /estimativa|expir|autoriz/i,
    );
    assert.equal(f.paid(), 1);
  } finally {
    await f.close();
  }
});

test('changed input, session, channel, settings, key or expired quote cannot cause a paid call', async () => {
  const f = await fixture();
  try {
    await f.service.saveKey!('tech', key);
    await f.service.saveKey!('science', key);
    for (const variation of ['brief', 'session', 'channel', 'settings', 'key', 'expired']) {
      const quote = await f.service.quote!('tech', { ...input, consentToSend: true }, 'a');
      if (variation === 'settings')
        await f.settings.save({
          content: 'Preferência sintética alterada para invalidar a estimativa anterior.',
          model: '',
        });
      if (variation === 'key') await f.service.saveKey!('tech', key + 'x');
      if (variation === 'expired') f.advance();
      await assert.rejects(
        f.service.draft(
          variation === 'channel' ? 'science' : 'tech',
          {
            ...input,
            ...(variation === 'brief' ? { brief: input.brief + ' Mude o final.' } : {}),
            quoteId: quote.id,
            authorizePaid: true,
          },
          variation === 'session' ? 'b' : 'a',
        ),
        /estimativa|expir|autoriz|mudou/i,
      );
    }
    assert.equal(f.paid(), 0);
  } finally {
    await f.close();
  }
});

test('configured cost ceiling blocks generation before a Messages request', async () => {
  const f = await fixture();
  try {
    await f.service.saveKey!('tech', key);
    await f.settings.save({
      content: 'Preferência sintética para teste de orçamento.',
      model: '',
      maxCostUsd: 0.001,
    });
    await assert.rejects(
      f.service.quote!('tech', { ...input, consentToSend: true }),
      /limite|custo|orçamento/i,
    );
    assert.equal(f.paid(), 0);
  } finally {
    await f.close();
  }
});
