import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOpenAIClient,
  openaiModelName,
  OPENAI_MODELS,
  OPENAI_PRICING_CHECKED_AT,
  openaiSchema,
} from '../server/openai.ts';
import { ProviderResponseError } from '../server/ai-provider.ts';

const key = 'sk-SYNTHETIC-TEST-ONLY-1234567890';
const request = {
  model: 'gpt-6.1-sol',
  system: 'PREFERENCIA_PRIVADA_SINTETICA: apenas uma tarefa editorial.',
  prompt: JSON.stringify({ channel: { id: 'tech' }, task: 'story', brief: 'Crie uma narrativa sintética.' }),
  schema: {
    type: 'object',
    properties: { title: { type: 'string', minLength: 3 }, body: { type: 'string', maxLength: 2000 } },
    required: ['title', 'body'],
    additionalProperties: false,
  },
  maxTokens: 4096,
};
const valid = () => ({
  id: 'resp_fixture',
  object: 'response',
  model: request.model,
  status: 'completed',
  service_tier: 'default',
  error: null,
  incomplete_details: null,
  output: [
    { type: 'reasoning', summary: [] },
    {
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: JSON.stringify({
            title: 'Uma pergunta original',
            body: 'Uma narrativa inteiramente sintética para revisão humana.',
          }),
          annotations: [],
        },
      ],
    },
  ],
  usage: {
    input_tokens: 1000,
    output_tokens: 200,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 80 },
    total_tokens: 1200,
  },
});
const response = (body: unknown) => Response.json(body);

test('OpenAI counts and generates using equivalent context/schema and explicit privacy, pricing and cache settings', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const client = createOpenAIClient({
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: String(url), body });
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${key}`);
      assert.ok(init?.signal);
      return response(
        String(url).endsWith('/input_tokens')
          ? { object: 'response.input_tokens', input_tokens: 1000 }
          : valid(),
      );
    },
  });
  assert.equal(await client.count(key, request), 1000);
  const result = await client.generate(key, request);
  assert.deepEqual(
    calls.map((call) => call.url),
    ['https://api.openai.com/v1/responses/input_tokens', 'https://api.openai.com/v1/responses'],
  );
  for (const field of ['model', 'instructions', 'input', 'reasoning', 'text', 'truncation'])
    assert.deepEqual(calls[0].body[field], calls[1].body[field]);
  assert.equal(calls[0].body.max_output_tokens, undefined);
  assert.equal(calls[0].body.service_tier, undefined);
  assert.equal(calls[0].body.store, undefined);
  assert.equal(calls[1].body.store, false);
  assert.equal(calls[1].body.service_tier, 'default');
  assert.deepEqual(calls[1].body.prompt_cache_options, { mode: 'explicit' });
  assert.equal(calls[1].body.max_output_tokens, 4096);
  assert.equal(calls[1].body.stream, false);
  assert.equal(calls[1].body.tools, undefined);
  assert.equal(calls[1].body.instructions, request.system);
  assert.equal((calls[1].body.text as any).format.strict, true);
  assert.equal((calls[1].body.text as any).format.type, 'json_schema');
  assert.equal(result.inputTokens, 1000);
  assert.equal(result.outputTokens, 200);
  assert.equal(result.reasoningTokens, 80);
  assert.equal(result.cachedInputTokens, 0);
  assert.match(result.text, /Uma pergunta/);
  assert.equal(result.text.includes('PREFERENCIA_PRIVADA'), false);
});

test('OpenAI schema copy keeps domain constraints and makes every object strict without mutating the original', () => {
  const schema = {
    type: 'object',
    properties: {
      minimum: { type: 'string', minLength: 2 },
      nested: {
        type: 'object',
        properties: { value: { type: 'integer', minimum: 1 } },
        required: ['value'],
        additionalProperties: false,
      },
    },
    required: ['minimum', 'nested'],
    additionalProperties: false,
  };
  const before = structuredClone(schema),
    wire = openaiSchema(schema);
  assert.deepEqual(schema, before);
  assert.equal((wire.properties as any).minimum.minLength, 2);
  assert.equal((wire.properties as any).nested.additionalProperties, false);
  assert.deepEqual((wire.properties as any).nested.required, ['value']);
});

test('OpenAI exposes only verified model IDs and dated rates; Luna uses supported reasoning configuration', async () => {
  assert.equal(openaiModelName('gpt-6.1-sol'), 'gpt-6.1-sol');
  assert.equal(OPENAI_PRICING_CHECKED_AT, '2026-10-28');
  assert.ok(OPENAI_MODELS.find((model) => model.id === 'gpt-6-luna' && model.inputUsdPerMillion === 0.1));
  assert.throws(() => openaiModelName('https://attacker.example/'));
  assert.throws(() => openaiModelName('gpt-unknown'));
  const client = createOpenAIClient({
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.reasoning, { effort: 'none' });
      return response({ object: 'response.input_tokens', input_tokens: 10 });
    },
  });
  await client.count(key, { ...request, model: 'gpt-6-luna' });
});

test('OpenAI rejects unsafe inputs before network effects', async () => {
  let calls = 0;
  const client = createOpenAIClient({
    fetch: async () => {
      calls++;
      return response({});
    },
  });
  for (const input of [
    { ...request, model: 'https://attacker.example/' },
    { ...request, maxTokens: 32_001 },
    { ...request, maxTokens: 1.5 },
    { ...request, system: '' },
    { ...request, prompt: 'x'.repeat(110000) },
  ])
    await assert.rejects(client.generate(key, input), /inválid|limite|modelo/);
  await assert.rejects(client.count('bad\nkey', request), /chave/i);
  assert.equal(calls, 0);
});

test('OpenAI rejects refusal, incomplete, tool and foreign-model responses while preserving valid usage counts', async () => {
  const cases = [
    { ...valid(), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
    {
      ...valid(),
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'refusal', refusal: 'private unwanted text' }],
        },
      ],
    },
    { ...valid(), output: [{ type: 'function_call', name: 'publish', arguments: 'private token' }] },
    { ...valid(), model: 'foreign-model' },
    {
      ...valid(),
      output: [
        {
          type: 'message',
          role: 'user',
          status: 'completed',
          content: [{ type: 'output_text', text: 'secret' }],
        },
      ],
    },
  ];
  for (const item of cases) {
    let calls = 0;
    const client = createOpenAIClient({
      fetch: async () => {
        calls++;
        return response(item);
      },
    });
    await assert.rejects(client.generate(key, request), (error: unknown) => {
      assert.ok(error instanceof ProviderResponseError);
      assert.equal(error.usage?.inputTokens, 1000);
      assert.equal(error.usage?.outputTokens, 200);
      assert.doesNotMatch(error.message, /private|secret|publish/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('OpenAI usage details are validated and cache writes or unexpected service tiers keep cost unknown', async () => {
  const invalid = [
    { ...valid(), usage: { input_tokens: -1, output_tokens: 2 } },
    { ...valid(), usage: { input_tokens: 1000, output_tokens: 4097 } },
    { ...valid(), usage: { ...valid().usage, input_tokens_details: { cached_tokens: 1001 } } },
    { ...valid(), usage: { ...valid().usage, output_tokens_details: { reasoning_tokens: 201 } } },
    { ...valid(), usage: { ...valid().usage, total_tokens: 9999 } },
  ];
  for (const item of invalid) {
    const client = createOpenAIClient({ fetch: async () => response(item) });
    await assert.rejects(client.generate(key, request), (error: unknown) => {
      assert.ok(error instanceof ProviderResponseError);
      assert.equal(error.usage, undefined);
      return true;
    });
  }
  for (const item of [
    {
      ...valid(),
      usage: { ...valid().usage, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 500 } },
    },
    { ...valid(), service_tier: 'priority' },
  ]) {
    const client = createOpenAIClient({ fetch: async () => response(item) });
    await assert.rejects(client.generate(key, request), (error: unknown) => {
      assert.ok(error instanceof ProviderResponseError);
      assert.equal(error.costUnknown, true);
      assert.equal(error.usage?.inputTokens, 1000);
      return true;
    });
  }
});

test('OpenAI sanitizes upstream and transport errors without retrying', async () => {
  for (const fetcher of [
    async () => {
      throw new Error(key + ' private prompt');
    },
    async () => new Response(key + ' private prompt', { status: 401 }),
    async () => new Response(key + ' private prompt', { status: 429 }),
    async () => new Response('not json', { status: 200 }),
  ]) {
    let calls = 0;
    const client = createOpenAIClient({
      fetch: async () => {
        calls++;
        return fetcher();
      },
    });
    await assert.rejects(client.generate(key, request), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /sk-SYNTHETIC|private prompt|not json/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('OpenAI bounds and cancels oversized streams before receiving the complete response', async () => {
  let cancelled = false,
    pulls = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(70000).fill(120));
    },
    cancel() {
      cancelled = true;
    },
  });
  const client = createOpenAIClient({ fetch: async () => new Response(body) });
  await assert.rejects(client.generate(key, request), /resposta|incompleta|compatível/i);
  assert.equal(cancelled, true);
  assert.ok(pulls < 10);
});

test('OpenAI token counting refuses malformed and excessive usage without returning data', async () => {
  for (const value of [0, -1, 1.5, 100001, '1000']) {
    const client = createOpenAIClient({
      fetch: async () => response({ object: 'response.input_tokens', input_tokens: value }),
    });
    await assert.rejects(client.count(key, request), /resposta|compatível|contagem/i);
  }
});
