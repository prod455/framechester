import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalStore } from '../server/store.ts';
import { createAutomaticProduction } from '../server/automatic-production.ts';
import type { CreativeApi, CreativeInput } from '../server/creative.ts';
import type { RunnerApi, Script } from '../shared/types.ts';

test('one authorized AI call saves a new channel draft and delegates all local production stages', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-automatic-service-'));
  const store = new LocalStore(home);
  await store.ready;
  await store.saveChannel({ id: 'tech', name: 'Teste' });
  await store.saveChannel({ id: 'science', name: 'Outro' });
  const original = (await store.saveResource('scripts', {
    channelId: 'tech',
    title: 'Original',
    series: 'Teste',
    format: 'short',
    hook: 'Pergunta',
    scenes: [
      {
        id: 42,
        heading: 'Cena',
        narration: 'Uma explicação.',
        visualBrief: 'Composição',
        durationHintSecs: 20,
      },
    ],
    sources: [],
    claims: [],
    crossChecked: false,
  })) as Script;
  let calls = 0;
  let quoted: CreativeInput | undefined;
  let preparedId = '';
  const creative: CreativeApi = {
    capabilities: async () => ({
      provider: 'anthropic',
      available: true,
      models: [],
      selectedModel: 'fixture',
      reason: '',
      endpoint: 'fixture',
      supports: ['script'],
    }),
    quote: async (owner, input, scope) => {
      assert.equal(owner, 'tech');
      assert.equal(scope, 'synthetic-session');
      quoted = input;
      return {
        id: 'quote-one',
        channelId: owner,
        model: 'fixture',
        inputTokens: 100,
        maxOutputTokens: 100,
        estimatedMaxCostUsd: 0.01,
        costLimitUsd: 0.1,
        expiresAt: '2099-01-01',
        pricingCheckedAt: '2026-10-28',
      };
    },
    draft: async (owner, input, scope) => {
      calls++;
      assert.equal(scope, 'synthetic-session');
      assert.equal(input.brief, quoted!.brief);
      assert.deepEqual(input.editorContext, quoted!.editorContext);
      assert.equal(input.authorizePaid, true);
      return {
        channelId: owner,
        task: 'script',
        title: 'Proposta',
        body: 'Texto explicativo para revisão humana.',
        model: 'fixture',
        createdAt: '2026-10-28',
        status: 'draft',
        crossChecked: false,
        reviewRequired: true,
        guides: [],
        fields: {
          title: 'Versão explicativa',
          series: 'Teste',
          format: 'short',
          hook: 'Pergunta',
          scenes: original.scenes,
          sources: [],
          claims: [],
        },
      };
    },
  };
  const runner: RunnerApi = {
    list: async () => [],
    assets: async () => [],
    assetFile: async () => undefined,
    file: async () => undefined,
    upload: async () => {
      throw Error('not used');
    },
    start: async () => {
      throw Error('not used');
    },
    prepareVisuals: async () => {
      throw Error('not used');
    },
    engineStatus: () => ({ available: true, message: '' }),
    startAutomated: async (owner, seed, prepare) => {
      assert.equal(owner, 'tech');
      assert.equal(seed, original.id);
      preparedId = await prepare();
      return {
        id: 'auto-job',
        channelId: owner,
        scriptId: preparedId,
        status: 'queued',
        createdAt: '2026-10-28',
        message: 'Fila',
        videoAvailable: false,
        automated: true,
      };
    },
  };
  const service = createAutomaticProduction({ store, creative, runner });
  const input = { brief: 'Explique esta skill de forma prática', format: 'short', scriptId: original.id };
  try {
    await assert.rejects(service.quote('science', input, 'synthetic-session'), /referência/);
    assert.equal(calls, 0);
    await service.quote('tech', input, 'synthetic-session');
    assert.equal(calls, 0);
    await assert.rejects(service.start('tech', input, 'synthetic-session'), /autorize/);
    assert.equal(calls, 0);
    const job = await service.start(
      'tech',
      { ...input, quoteId: 'quote-one', authorizePaid: true },
      'synthetic-session',
    );
    assert.equal(job.automated, true);
    assert.equal(calls, 1);
    const state = await store.read();
    const saved = state.scripts.find((script) => script.id === preparedId)!;
    assert.notEqual(saved.id, original.id);
    assert.equal(saved.channelId, 'tech');
    assert.equal(saved.crossChecked, false);
    assert.equal(saved.status, 'draft');
    assert.equal(state.scripts.find((script) => script.id === original.id)!.title, 'Original');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a generated script without references gets peer-reviewed sources looked up before it is saved', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-automatic-sources-'));
  const store = new LocalStore(home);
  await store.ready;
  await store.saveChannel({ id: 'tech', name: 'Teste' });
  const fields = {
    title: 'Por que a GPU venceu',
    series: 'Tecnologia',
    format: 'short' as const,
    hook: 'Uma pergunta',
    scenes: [{ id: 0, heading: 'Cena', narration: 'Fala.', visualBrief: 'Composição', durationHintSecs: 5 }],
    sources: [],
    claims: [{ text: 'GPUs treinam redes mais rápido.', status: 'unverified' as const, sourceUrls: [] }],
  };
  const creative: CreativeApi = {
    capabilities: async () => ({
      available: true,
      models: ['m'],
      selectedModel: 'm',
      reason: '',
      provider: 'ollama',
      endpoint: '',
      supports: ['script'],
    }),
    draft: async () => ({
      channelId: 'tech',
      task: 'script',
      title: fields.title,
      body: 'Prévia',
      model: 'm',
      createdAt: new Date().toISOString(),
      status: 'draft',
      crossChecked: false,
      reviewRequired: true,
      fields,
      guides: [],
    }),
  };
  let asked: string[] = [];
  const found = {
    title: 'Deep learning',
    url: 'https://doi.org/10.1038/nature14539',
    publisher: 'Nature',
    retrievedAt: '2026-10-29',
    license:
      'Artigo revisado por pares (DOI) · sugerido automaticamente via Crossref; conferir antes de publicar',
  };
  const runner = {
    startAutomated: async (_owner: string, _seed: string, prepare: () => Promise<string>) => {
      const id = await prepare();
      return {
        id,
        channelId: 'tech',
        scriptId: id,
        status: 'queued',
        createdAt: '',
        message: '',
        videoAvailable: false,
      } as const;
    },
  } as unknown as RunnerApi;
  const automation = createAutomaticProduction({
    store,
    runner,
    creative,
    sources: {
      suggest: async (queries) => {
        asked = queries;
        return [found];
      },
    },
  });
  try {
    await automation.start('tech', { brief: 'GPUs e IA', format: 'short' }, 'scope');
    const saved = (await store.read()).scripts[0]!;
    assert.deepEqual(saved.sources, [found]);
    assert.deepEqual(asked, ['GPUs treinam redes mais rápido.', 'Por que a GPU venceu']);
    assert.equal(saved.claims[0]!.status, 'unverified');
    assert.equal(saved.crossChecked, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a language version reads the reference of the source channel and asks for native writing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-automatic-language-'));
  const store = new LocalStore(home);
  await store.ready;
  await store.saveChannel({ id: 'tech', name: 'Tech BR', language: 'pt-BR' });
  await store.saveChannel({ id: 'tech-en', name: 'Tech EN', language: 'en-US', niche: 'Technology' });
  const research = await store.saveResource('research', {
    channelId: 'tech',
    title: 'Por que a GPU venceu',
    niche: 'Tecnologia',
    audience: 'Curiosos',
    hypothesis: 'Paralelismo',
    differentiation: '',
    keywords: [],
    sources: [],
    demandScore: 1,
    competitionScore: 1,
    feasibilityScore: 1,
    notes: '',
  });
  let quoted: CreativeInput | undefined;
  const creative = {
    capabilities: async () => ({
      provider: 'anthropic',
      available: true,
      models: [],
      selectedModel: 'fixture',
      reason: '',
      endpoint: 'fixture',
      supports: ['script'],
    }),
    quote: async (owner: string, input: CreativeInput) => {
      assert.equal(owner, 'tech-en');
      quoted = input;
      return { id: 'quote-en', channelId: owner } as never;
    },
    draft: async () => {
      throw new Error('not used');
    },
  } as unknown as CreativeApi;
  const automation = createAutomaticProduction({ store, runner: {} as RunnerApi, creative });
  try {
    await automation.quote(
      'tech-en',
      { brief: 'GPU', format: 'short', researchId: research.id, originChannelId: 'tech' },
      'scope',
    );
    const values = (quoted!.editorContext as unknown as { values: Record<string, unknown> }).values;
    assert.equal(values.title, 'Por que a GPU venceu');
    assert.equal(values.researchId, undefined, 'A research record stays in its channel');
    assert.equal(values.series, 'Technology');
    assert.match(String(quoted!.brief), /Versão em en-US: escreva de forma nativa/);
    await assert.rejects(
      automation.quote('tech-en', { brief: 'GPU', format: 'short', researchId: research.id }, 'scope'),
      /não pertence a este canal/,
      'Without the origin, the reference must be this channel’s',
    );
    await assert.rejects(
      automation.quote('tech-en', { brief: 'GPU', format: 'short', originChannelId: 'missing' }, 'scope'),
      /origem não encontrado/,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
