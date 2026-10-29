import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderResponseError } from '../server/ai-provider.ts';
import {
  anthropicModelName,
  anthropicSchema,
  createAnthropicClient,
  DEFAULT_ANTHROPIC_MODEL,
  ANTHROPIC_MODELS,
  type AnthropicRequest,
} from '../server/anthropic.ts';

const key = 'synthetic-anthropic-key-for-tests';
const request: AnthropicRequest = {
  model: 'claude-sonnet-5-5',
  system: 'SYNTHETIC_PRIVATE_PREFERENCE',
  prompt: '{"task":"research"}',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: { title: { type: 'string', minLength: 3, maxLength: 200 } },
  },
  maxTokens: 4096,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const message = () => ({
  type: 'message',
  role: 'assistant',
  model: request.model,
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"title":"Uma hipótese original"}' }],
  usage: { input_tokens: 540, output_tokens: 34 },
});

test('Anthropic preserves validated token usage when a paid response is rejected', async () => {
  const client = createAnthropicClient({
    fetch: async () => json({ ...message(), stop_reason: 'max_tokens' }),
  });
  await assert.rejects(
    client.generate(key, request),
    (error) =>
      error instanceof ProviderResponseError &&
      error.usage?.inputTokens === 540 &&
      error.usage.outputTokens === 34 &&
      !JSON.stringify(error).includes('Uma hipótese'),
  );
});

test('Anthropic normalizes cached input and flags unknown cache-write pricing instead of guessing', async () => {
  const client = createAnthropicClient({
    fetch: async () =>
      json({
        ...message(),
        usage: {
          input_tokens: 540,
          output_tokens: 34,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 50,
        },
      }),
  });
  await assert.rejects(
    client.generate(key, request),
    (error) =>
      error instanceof ProviderResponseError &&
      error.costUnknown &&
      error.usage?.inputTokens === 690 &&
      error.usage.cachedInputTokens === 100,
  );
});

test('Anthropic count and generation use the fixed endpoint, same structured prompt and current headers without retries or tools', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = createAnthropicClient({
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return String(url).endsWith('/count_tokens') ? json({ input_tokens: 540 }) : json(message());
    },
  });
  assert.equal(await client.count(key, request), 540);
  assert.deepEqual(await client.generate(key, request), {
    text: '{"title":"Uma hipótese original"}',
    inputTokens: 540,
    outputTokens: 34,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages/count_tokens');
  assert.equal(calls[1].url, 'https://api.anthropic.com/v1/messages');
  for (const call of calls) {
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.redirect, 'error');
    assert.ok(call.init.signal instanceof AbortSignal);
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get('Authorization'), `Bearer ${key}`);
    assert.equal(headers.get('anthropic-version'), '2026-10-21');
    const body = JSON.parse(String(call.init.body));
    assert.equal(body.model, request.model);
    assert.equal(body.system, request.system);
    assert.deepEqual(body.messages, [{ role: 'user', content: request.prompt }]);
    assert.deepEqual(body.thinking, { type: 'between_tools' });
    assert.equal(body.output_config.effort, 'medium');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.output_config.format.schema.properties.title.maxLength, undefined);
    assert.match(body.output_config.format.schema.properties.title.description, /maxLength/);
    for (const forbidden of [
      'tools',
      'tool_choice',
      'temperature',
      'top_p',
      'top_k',
      'cache_control',
      'metadata',
    ])
      assert.equal(body[forbidden], undefined);
  }
  const counted = JSON.parse(String(calls[0].init.body));
  const generated = JSON.parse(String(calls[1].init.body));
  assert.equal(counted.max_tokens, undefined);
  assert.equal(generated.max_tokens, request.maxTokens);
  assert.equal(generated.stream, false);
  delete generated.max_tokens;
  delete generated.stream;
  assert.deepEqual(generated, counted);
});

test('Anthropic schema adaptation preserves field names, moves unsupported constraints into descriptions and leaves original validation intact', () => {
  const source = {
    type: 'object',
    properties: {
      minimum: { type: 'number', minimum: 1, maximum: 20, description: 'Nota' },
      minLength: { type: 'string', minLength: 3 },
      sources: {
        type: 'array',
        minItems: 2,
        maxItems: 12,
        items: { type: 'object', properties: { url: { type: 'string', format: 'uri' } }, required: ['url'] },
      },
    },
    required: ['minimum', 'minLength', 'sources'],
  };
  const original = structuredClone(source);
  const wire = anthropicSchema(source) as typeof source & { additionalProperties: boolean };
  assert.deepEqual(source, original);
  assert.equal(wire.additionalProperties, false);
  assert.equal(wire.properties.minimum.minimum, undefined);
  assert.match(wire.properties.minimum.description, /Nota.*minimum.*maximum/);
  assert.equal(wire.properties.minLength.type, 'string');
  assert.equal(wire.properties.minLength.minLength, undefined);
  assert.equal(wire.properties.sources.minItems, undefined);
  assert.equal(wire.properties.sources.maxItems, undefined);
  assert.equal(
    (wire.properties.sources.items as { additionalProperties?: boolean }).additionalProperties,
    false,
  );
  assert.equal(wire.properties.sources.items.properties.url.format, 'uri');
});

test('Anthropic supported models have dated known pricing and Haiku disables thinking explicitly', async () => {
  assert.equal(DEFAULT_ANTHROPIC_MODEL, 'claude-sonnet-5-5');
  assert.ok(ANTHROPIC_MODELS.every((model) => model.inputUsdPerMillion > 0 && model.outputUsdPerMillion > 0));
  for (const value of ['', 'claude-unknown', 'https://evil.invalid', 'claude-sonnet-5-5\n', null])
    assert.throws(() => anthropicModelName(value));
  const client = createAnthropicClient({
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.thinking, { type: 'disabled' });
      return json({ input_tokens: 300 });
    },
  });
  assert.equal(await client.count(key, { ...request, model: 'claude-haiku-5-5' }), 300);
});

test('Anthropic rejects unsafe input before any network effect', async () => {
  let calls = 0;
  const client = createAnthropicClient({
    fetch: async () => {
      calls++;
      return json(message());
    },
  });
  for (const change of [
    { model: 'unknown' },
    { maxTokens: 0 },
    { maxTokens: 8193 },
    { maxTokens: 1.5 },
    { prompt: 'x'.repeat(100001) },
  ])
    await assert.rejects(client.generate(key, { ...request, ...change }));
  for (const invalid of ['', 'has\nnewline-secret', 'has space secret'])
    await assert.rejects(client.count(invalid, request));
  assert.equal(calls, 0);
});

test('Anthropic refuses incomplete, tool, non-text, mismatched and invalid-usage results without returning their content', async () => {
  const variants = [
    { ...message(), stop_reason: 'max_tokens' },
    { ...message(), stop_reason: 'refusal' },
    { ...message(), stop_reason: 'tool_use' },
    { ...message(), content: [{ type: 'tool_use', name: 'publish', input: {} }] },
    { ...message(), content: [{ type: 'thinking', thinking: 'private' }] },
    { ...message(), model: 'different-model' },
    { ...message(), usage: { input_tokens: 1, output_tokens: NaN } },
    { ...message(), usage: { input_tokens: -1, output_tokens: 4 } },
    { ...message(), usage: { input_tokens: 1, output_tokens: 4097 } },
    { ...message(), role: 'user' },
    { ...message(), content: [] },
    { ...message(), content: [{ type: 'text', text: '' }] },
  ];
  for (const variant of variants) {
    let calls = 0;
    const client = createAnthropicClient({
      fetch: async () => {
        calls++;
        return json(variant);
      },
    });
    await assert.rejects(
      client.generate(key, request),
      (error) => error instanceof Error && !error.message.includes(key) && !error.message.includes('publish'),
    );
    assert.equal(calls, 1);
  }
});

test('Anthropic transport sanitizes failures and never retries ambiguous paid requests', async () => {
  for (const status of [400, 401, 403, 429, 500, 307]) {
    let calls = 0;
    const client = createAnthropicClient({
      fetch: async () => {
        calls++;
        return json({ error: { message: `${key} ${request.system} upstream-secret` } }, status);
      },
    });
    await assert.rejects(
      client.generate(key, request),
      (error) =>
        error instanceof Error &&
        !error.message.includes(key) &&
        !error.message.includes(request.system) &&
        !error.message.includes('upstream-secret'),
    );
    assert.equal(calls, 1);
  }
  let attempts = 0;
  const client = createAnthropicClient({
    fetch: async () => {
      attempts++;
      throw new Error(`${key} ${request.system}`);
    },
  });
  await assert.rejects(client.generate(key, request), /cobrança|cobrado/);
  assert.equal(attempts, 1);
});

test('Anthropic bounds streamed responses and cancels an oversized body', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(262145));
    },
    cancel() {
      cancelled = true;
    },
  });
  const client = createAnthropicClient({
    fetch: async () => new Response(body, { headers: { 'Content-Type': 'application/json' } }),
  });
  await assert.rejects(client.generate(key, request));
  assert.equal(cancelled, true);
});

test('Anthropic token counting rejects malformed, excessive and fractional input counts', async () => {
  for (const value of [0, -1, 100001, 1.5, '540', null]) {
    const client = createAnthropicClient({ fetch: async () => json({ input_tokens: value }) });
    await assert.rejects(client.count(key, request));
  }
});
