import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, link, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrivatePromptStore } from '../server/private-prompt.ts';

test('OpenAI configuration preserves Claude and Ollama choices without storing credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fc-openai-settings-'));
  try {
    const store = new PrivatePromptStore(root);
    const settings = await store.save({
      content: 'Preferências inteiramente sintéticas.',
      model: 'local:latest',
      provider: 'openai',
      openaiModel: 'gpt-6-luna',
      anthropicModel: 'claude-haiku-5-5',
    });
    assert.equal(settings.openaiModel, 'gpt-6-luna');
    assert.equal(settings.provider, 'openai');
    const next = await store.save({
      content: settings.prompt.content,
      model: settings.model,
      provider: 'anthropic',
    });
    assert.equal(next.openaiModel, 'gpt-6-luna');
    assert.equal(next.anthropicModel, 'claude-haiku-5-5');
    assert.equal(next.model, 'local:latest');
    await assert.rejects(
      store.save({ content: 'Não salvar', model: '', openaiModel: 'foreign-model' }),
      /modelo/i,
    );
    assert.equal((await store.read()).openaiModel, 'gpt-6-luna');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('new installations prefer Claude and legacy model files remain on Ollama', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fc-creative-provider-defaults-'));
  try {
    const initial = await new PrivatePromptStore(root).read();
    assert.equal(initial.provider, 'anthropic');
    assert.equal(initial.anthropicModel, 'claude-sonnet-5-5');
    assert.equal(initial.maxOutputTokens, 4096);
    assert.equal(initial.maxCostUsd, 1);
    await mkdir(join(root, '.framechester'));
    await writeFile(
      join(root, '.framechester', 'creative.local.json'),
      JSON.stringify({ model: 'old-editor:latest' }),
    );
    const legacy = await new PrivatePromptStore(root).read();
    assert.equal(legacy.provider, 'ollama');
    assert.equal(legacy.model, 'old-editor:latest');
    assert.equal(legacy.anthropicModel, 'claude-sonnet-5-5');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Claude preferences survive legacy saves and never accept credentials in private configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fc-creative-provider-save-'));
  try {
    const store = new PrivatePromptStore(root);
    const settings = await store.save({
      content: 'Preferência sintética.',
      model: 'local-editor:latest',
      provider: 'anthropic',
      anthropicModel: 'claude-haiku-5-5',
      maxOutputTokens: 2048,
      maxCostUsd: 0.1,
    });
    assert.equal(settings.provider, 'anthropic');
    assert.equal(settings.anthropicModel, 'claude-haiku-5-5');
    const next = await store.save({
      content: 'Preferência sintética revisada.',
      model: 'local-editor:latest',
    });
    assert.equal(next.provider, 'anthropic');
    assert.equal(next.anthropicModel, 'claude-haiku-5-5');
    assert.equal(next.maxOutputTokens, 2048);
    assert.equal(next.maxCostUsd, 0.1);
    const configPath = join(root, '.framechester', 'creative.local.json');
    const before = await readFile(configPath, 'utf8');
    await assert.rejects(
      store.save({ content: 'Não persistir', model: '', apiKey: 'synthetic-secret' } as Parameters<
        PrivatePromptStore['save']
      >[0]),
      /configura|campo|credenc/i,
    );
    assert.equal(await readFile(configPath, 'utf8'), before);
    assert.equal((await store.read()).prompt.content, 'Preferência sintética revisada.');
    await writeFile(
      configPath,
      JSON.stringify({ model: '', provider: 'anthropic', apiKey: 'synthetic-secret' }),
    );
    await assert.rejects(store.read(), /privado/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid Claude provider, model, token or cost settings fail before changing either file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fc-creative-provider-limits-'));
  try {
    const store = new PrivatePromptStore(root);
    await store.save({ content: 'Preferência sintética a preservar.', model: '', provider: 'anthropic' });
    const configPath = join(root, '.framechester', 'creative.local.json');
    const before = await readFile(configPath, 'utf8');
    const invalid = [
      { provider: 'foreign' },
      { anthropicModel: 'https://foreign.example/model' },
      { anthropicModel: 'claude-unknown' },
      { anthropicModel: 'claude-opus-5-5' },
      { maxOutputTokens: 511 },
      { maxOutputTokens: 8193 },
      { maxOutputTokens: 1024.5 },
      { maxCostUsd: 0 },
      { maxCostUsd: 5.01 },
      { maxCostUsd: NaN },
      { maxCostUsd: Infinity },
      { maxCostUsd: '1' },
    ];
    for (const options of invalid) {
      await assert.rejects(
        store.save({ content: 'Não persistir', model: '', ...options }),
        /provedor|modelo|tokens|custo/i,
      );
      assert.equal(await readFile(configPath, 'utf8'), before);
      assert.equal((await store.read()).prompt.content, 'Preferência sintética a preservar.');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('personal editorial settings stay in fixed private files and reload instead of entering app state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fc-personal-prompt-'));
  try {
    const store = new PrivatePromptStore(root);
    assert.equal((await store.read()).prompt.exists, false);
    const saved = await store.save({
      content: 'Preferência sintética de criatividade para um teste local.',
      model: 'local-editor:latest',
    });
    assert.equal(saved.prompt.exists, true);
    assert.equal(saved.prompt.fileName, '.framechester/system-prompt.personal.md');
    assert.equal(saved.model, 'local-editor:latest');
    assert.equal(saved.provider, 'ollama');
    assert.equal(
      await readFile(join(root, '.framechester', 'system-prompt.personal.md'), 'utf8'),
      saved.prompt.content,
    );
    await writeFile(
      join(root, '.framechester', 'system-prompt.personal.md'),
      'Uma preferência sintética alterada fora do aplicativo.',
    );
    assert.match((await store.read()).prompt.content, /alterada fora/);
    assert.equal((await new PrivatePromptStore(root).read()).model, 'local-editor:latest');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('private prompt rejects oversized content and untrusted model destinations without writing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fc-personal-limits-'));
  try {
    const store = new PrivatePromptStore(root);
    await assert.rejects(store.save({ content: 'x'.repeat(20_001), model: '' }), /20.000/);
    for (const model of [
      'https://foreign.example/model',
      '../escape',
      'model:cloud',
      'model-cloud',
      'name\nnext',
    ]) {
      await assert.rejects(store.save({ content: 'Sintético', model }), /modelo/i);
    }
    assert.equal((await store.read()).prompt.exists, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('private prompt refuses hard-linked files and symbolic private directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fc-personal-links-'));
  const external = await mkdtemp(join(tmpdir(), 'fc-personal-external-'));
  try {
    await mkdir(join(root, '.framechester'));
    const outside = join(external, 'outside.md');
    await writeFile(outside, 'Sintético fora da raiz');
    await link(outside, join(root, '.framechester', 'system-prompt.personal.md'));
    await assert.rejects(new PrivatePromptStore(root).read(), /privado/);
    await assert.rejects(
      new PrivatePromptStore(root).save({ content: 'Não gravar fora', model: '' }),
      /privado/,
    );
    assert.equal(await readFile(outside, 'utf8'), 'Sintético fora da raiz');
    await rm(join(root, '.framechester'), { recursive: true });
    await symlink(external, join(root, '.framechester'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(new PrivatePromptStore(root).read(), /privado/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});
