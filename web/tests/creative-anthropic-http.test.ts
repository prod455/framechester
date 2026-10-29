import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.ts';
import { createCreativeService } from '../server/creative.ts';
import { AIUsageStore } from '../server/ai-usage.ts';
import { PrivatePromptStore } from '../server/private-prompt.ts';
import { LocalStore } from '../server/store.ts';
import type { SecretVault } from '../server/vault.ts';
import type { CreativeQuote } from '../shared/creative-types.ts';

const password = 'synthetic Claude HTTP test password';
const techKey = 'synthetic-anthropic-key-for-tech-only';
const scienceKey = 'synthetic-anthropic-key-for-science-only';
const personal = 'PREFERENCIA_PRIVADA_HTTP_SINTETICA: uma direção editorial apenas para este teste.';
const request = {
  task: 'research',
  brief: 'Investigue um nicho de tecnologia com hipótese e teste editorial.',
  includeReferences: false,
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fc-claude-http-'));
  const home = join(root, 'profile');
  const store = new LocalStore(home);
  await store.ready;
  const settings = new PrivatePromptStore(root);
  await settings.save({
    content: personal,
    model: '',
    provider: 'anthropic',
    anthropicModel: 'claude-sonnet-5-5',
    maxOutputTokens: 4096,
    maxCostUsd: 0.25,
  });
  const secrets = new Map<string, string>();
  const writes: Array<{ owner: string; slot: string }> = [];
  const outbound: Array<{ url: string; key: string | null; body: Record<string, unknown> }> = [];
  const vault: SecretVault = {
    async get(owner, slot) {
      return secrets.get(`${owner}/${slot}`) ?? null;
    },
    async set(owner, slot, value) {
      writes.push({ owner, slot });
      secrets.set(`${owner}/${slot}`, value);
    },
    async delete(owner, slot) {
      secrets.delete(`${owner}/${slot}`);
    },
  };
  const creative = createCreativeService({
    settings,
    vault,
    usage: new AIUsageStore(join(home, 'ai-usage')),
    readState: () => store.read(),
    fetch: async (url, init) => {
      const target = String(url);
      assert.ok(
        target === 'https://api.anthropic.com/v1/messages/count_tokens' ||
          target === 'https://api.anthropic.com/v1/messages',
      );
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const authorization = new Headers(init?.headers).get('Authorization');
      assert.ok(typeof authorization === 'string' && authorization.startsWith('Bearer '));
      outbound.push({ url: target, key: authorization.slice('Bearer '.length), body });
      if (target.endsWith('/count_tokens')) return Response.json({ input_tokens: 1000 });
      return Response.json({
        type: 'message',
        role: 'assistant',
        model: body.model,
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              title: 'Hipótese para investigar',
              body: 'Um rascunho sintético específico para revisão humana e apuração de evidências.',
            }),
          },
        ],
        usage: { input_tokens: 1024, output_tokens: 128 },
      });
    },
  });
  const app = await createApp({ home, store, privatePrompt: settings, creative });
  const server = createServer(app.handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  type Session = { cookie: string; csrf: string };
  async function session(setup: boolean): Promise<Session> {
    const anonymous = await fetch(origin + '/api/auth/status');
    const cookie = anonymous.headers.get('set-cookie')!.split(';')[0];
    const csrf = (await anonymous.json()).csrfToken as string;
    const response = await fetch(origin + (setup ? '/api/auth/setup' : '/api/auth/login'), {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get('set-cookie')!.split(';')[0],
      csrf: (await response.json()).csrfToken as string,
    };
  }
  const primary = await session(true);
  const call = (
    path: string,
    method = 'GET',
    body?: unknown,
    options: { session?: Session | null; csrf?: boolean; origin?: string } = {},
  ) => {
    const selected = options.session === undefined ? primary : options.session;
    return fetch(origin + path, {
      method,
      headers: {
        Origin: options.origin ?? origin,
        ...(selected ? { Cookie: selected.cookie } : {}),
        ...(selected && method !== 'GET' && options.csrf !== false ? { 'X-CSRF-Token': selected.csrf } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
  for (const id of ['tech', 'science'])
    assert.equal((await call('/api/channels', 'POST', { id, name: `Canal sintético ${id}` })).status, 201);
  return {
    root,
    home,
    app,
    call,
    session: () => session(false),
    outbound,
    writes,
    secrets,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('Claude HTTP credentials require session/CSRF and remain absent from settings, state and capabilities', async () => {
  const ctx = await fixture();
  try {
    assert.equal(
      (await ctx.call('/api/channels/tech/creative/key', 'GET', undefined, { session: null })).status,
      401,
    );
    assert.equal(
      (await ctx.call('/api/channels/tech/creative/key', 'PUT', { key: techKey }, { session: null })).status,
      401,
    );
    assert.equal(
      (await ctx.call('/api/channels/tech/creative/key', 'PUT', { key: techKey }, { csrf: false })).status,
      403,
    );
    assert.equal(
      (
        await ctx.call(
          '/api/channels/tech/creative/key',
          'PUT',
          { key: techKey },
          { origin: 'https://foreign.example' },
        )
      ).status,
      403,
    );
    assert.equal(
      (await ctx.call('/api/channels/tech/creative/key', 'PUT', { key: techKey, channelId: 'science' }))
        .status,
      400,
    );
    assert.equal(
      (
        await ctx.call('/api/creative/settings', 'PUT', {
          content: personal,
          model: '',
          provider: 'anthropic',
          key: techKey,
        })
      ).status,
      400,
    );
    assert.equal((await ctx.call('/api/channels/missing/creative/key', 'PUT', { key: techKey })).status, 404);
    assert.deepEqual(ctx.writes, []);
    assert.equal(ctx.outbound.length, 0);
    const saved = await ctx.call('/api/channels/tech/creative/key', 'PUT', { key: techKey });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { configured: true });
    assert.deepEqual(ctx.writes, [{ owner: 'tech', slot: 'anthropic' }]);
    assert.deepEqual(await (await ctx.call('/api/channels/tech/creative/key')).json(), { configured: true });
    assert.deepEqual(await (await ctx.call('/api/channels/science/creative/key')).json(), {
      configured: false,
    });
    for (const path of [
      '/api/bootstrap',
      '/api/creative/settings',
      '/api/creative/capabilities?channel_id=tech',
      '/api/channels/tech/creative/key',
    ]) {
      const response = await ctx.call(path);
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.equal(text.includes(techKey), false);
      assert.equal(text.includes(scienceKey), false);
      if (path !== '/api/creative/settings') assert.equal(text.includes(personal), false);
    }
    const caps = await (await ctx.call('/api/creative/capabilities?channel_id=tech')).json();
    assert.equal(caps.provider, 'anthropic');
    assert.equal(caps.available, true);
    assert.equal(caps.keyConfigured, true);
    const other = await (await ctx.call('/api/creative/capabilities?channel_id=science')).json();
    assert.equal(other.available, false);
    assert.equal((await ctx.call('/api/creative/capabilities?channel_id=missing')).status, 404);
    assert.equal((await readFile(join(ctx.home, 'state.json'), 'utf8')).includes(techKey), false);
    assert.equal(
      (await readFile(join(ctx.root, '.framechester', 'creative.local.json'), 'utf8')).includes(techKey),
      false,
    );
    assert.equal(ctx.outbound.length, 0);
    assert.equal(
      (await ctx.call('/api/channels/tech/creative/key', 'DELETE', undefined, { csrf: false })).status,
      403,
    );
    const removed = await ctx.call('/api/channels/tech/creative/key', 'DELETE');
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { configured: false });
    assert.equal(ctx.secrets.has('tech/anthropic'), false);
  } finally {
    await ctx.close();
  }
});

test('Claude HTTP quote requires explicit sending consent and generation requires fresh paid authorization', async () => {
  const ctx = await fixture();
  try {
    await ctx.call('/api/channels/tech/creative/key', 'PUT', { key: techKey });
    const before = await ctx.app.store.read();
    assert.equal(
      (
        await ctx.call(
          '/api/channels/tech/creative/quote',
          'POST',
          { ...request, consentToSend: true },
          { session: null },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await ctx.call(
          '/api/channels/tech/creative/quote',
          'POST',
          { ...request, consentToSend: true },
          { csrf: false },
        )
      ).status,
      403,
    );
    assert.equal((await ctx.call('/api/channels/tech/creative/quote', 'POST', request)).status, 400);
    assert.equal(
      (
        await ctx.call('/api/channels/tech/creative/quote', 'POST', {
          ...request,
          consentToSend: true,
          endpoint: 'https://foreign.example',
        })
      ).status,
      400,
    );
    assert.equal((await ctx.call('/api/channels/tech/creative/draft', 'POST', request)).status, 409);
    assert.equal(ctx.outbound.length, 0);
    const response = await ctx.call('/api/channels/tech/creative/quote', 'POST', {
      ...request,
      consentToSend: true,
    });
    assert.equal(response.status, 200);
    const quote = (await response.json()) as CreativeQuote;
    assert.equal(quote.channelId, 'tech');
    assert.equal(quote.model, 'claude-sonnet-5-5');
    assert.ok(quote.estimatedMaxCostUsd > 0 && quote.estimatedMaxCostUsd <= quote.costLimitUsd);
    assert.equal(ctx.outbound.length, 1);
    assert.ok(ctx.outbound[0].url.endsWith('/count_tokens'));
    assert.equal(
      (await ctx.call('/api/channels/tech/creative/draft', 'POST', { ...request, quoteId: quote.id })).status,
      409,
    );
    assert.equal(
      (
        await ctx.call(
          '/api/channels/tech/creative/draft',
          'POST',
          { ...request, quoteId: quote.id, authorizePaid: true },
          { csrf: false },
        )
      ).status,
      403,
    );
    assert.equal(ctx.outbound.length, 1);
    const generated = await ctx.call('/api/channels/tech/creative/draft', 'POST', {
      ...request,
      quoteId: quote.id,
      authorizePaid: true,
    });
    assert.equal(generated.status, 200);
    const draft = await generated.json();
    assert.equal(draft.channelId, 'tech');
    assert.equal(draft.task, 'research');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.crossChecked, false);
    assert.equal(draft.reviewRequired, true);
    assert.equal(draft.usage.inputTokens, 1024);
    assert.equal(draft.usage.outputTokens, 128);
    assert.equal(draft.usage.currency, 'USD');
    assert.equal(ctx.outbound.length, 2);
    assert.ok(ctx.outbound[1].url.endsWith('/messages'));
    assert.equal(ctx.outbound[1].key, techKey);
    assert.equal(JSON.stringify(draft).includes(techKey), false);
    assert.equal(JSON.stringify(draft).includes(personal), false);
    assert.deepEqual(await ctx.app.store.read(), before);
    assert.equal(
      (
        await ctx.call('/api/channels/tech/creative/draft', 'POST', {
          ...request,
          quoteId: quote.id,
          authorizePaid: true,
        })
      ).status,
      409,
    );
    assert.equal(ctx.outbound.length, 2);
  } finally {
    await ctx.close();
  }
});

test('Claude HTTP quote authorization is bound to the selected channel and authenticated session', async () => {
  const ctx = await fixture();
  try {
    await ctx.call('/api/channels/tech/creative/key', 'PUT', { key: techKey });
    await ctx.call('/api/channels/science/creative/key', 'PUT', { key: scienceKey });
    const response = await ctx.call('/api/channels/tech/creative/quote', 'POST', {
      ...request,
      consentToSend: true,
    });
    assert.equal(response.status, 200);
    const quote = (await response.json()) as CreativeQuote;
    const paid = { ...request, quoteId: quote.id, authorizePaid: true };
    assert.equal((await ctx.call('/api/channels/science/creative/draft', 'POST', paid)).status, 409);
    const secondSession = await ctx.session();
    assert.equal(
      (await ctx.call('/api/channels/tech/creative/draft', 'POST', paid, { session: secondSession })).status,
      409,
    );
    assert.equal(ctx.outbound.length, 1);
    assert.equal((await ctx.call('/api/channels/tech/creative/draft', 'POST', paid)).status, 200);
    assert.equal(ctx.outbound.length, 2);
    assert.ok(ctx.outbound.every((item) => item.key === techKey));
    const scienceQuoteResponse = await ctx.call('/api/channels/science/creative/quote', 'POST', {
      ...request,
      consentToSend: true,
    });
    assert.equal(scienceQuoteResponse.status, 200);
    const scienceQuote = (await scienceQuoteResponse.json()) as CreativeQuote;
    assert.equal(
      (
        await ctx.call('/api/channels/science/creative/draft', 'POST', {
          ...request,
          quoteId: scienceQuote.id,
          authorizePaid: true,
        })
      ).status,
      200,
    );
    assert.equal(ctx.outbound.length, 4);
    assert.ok(ctx.outbound.slice(2).every((item) => item.key === scienceKey));
    for (const owner of ['tech', 'science']) {
      const calls = ctx.outbound.filter((item) => item.key === (owner === 'tech' ? techKey : scienceKey));
      for (const call of calls) {
        const messages = call.body.messages as Array<{ content: string }>;
        const payload = JSON.parse(messages[0].content) as { channel: { id: string } };
        assert.equal(payload.channel.id, owner);
      }
    }
    const state = await ctx.app.store.read();
    assert.equal(state.research.length, 0);
    assert.equal(state.scripts.length, 0);
    assert.equal(state.stories.length, 0);
  } finally {
    await ctx.close();
  }
});
