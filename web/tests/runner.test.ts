import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AppState, Script } from '../shared/types.ts';
import { createRunner, localEngineEnvironment, RunnerError } from '../server/runner.ts';

const date = '2026-10-27T00:00:00.000Z';
const source = (id: number) => ({
  title: `Fonte ${id}`,
  url: `https://example.com/${id}`,
  publisher: 'Fixture',
  retrievedAt: '2026-10-27',
  license: 'Referencia de teste',
});

test('the local runner prepares script visuals without a manual upload', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-auto-visuals-'));
  const runner = await createRunner({ home, repositoryRoot: resolve('..'), readState: async () => state() });
  try {
    assert.equal(
      typeof Reflect.get(runner, 'prepareVisuals'),
      'function',
      'A production operator needs automatic script visuals',
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

const visualPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMMAAAAAASUVORK5CYII=',
  'base64',
);

test('automatic visuals preserve scene IDs, stay in the channel and survive restart without repeated generation', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-visual-generation-'));
  const current = state();
  let calls = 0;
  const options = {
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(current),
    execute: async (args: string[]) => {
      calls++;
      assert.equal(args[0], 'visuals');
      const plan = JSON.parse(await readFile(args[args.indexOf('--input') + 1], 'utf8'));
      assert.equal(plan.scenes[0].id, 42);
      assert.equal(plan.scenes[0].narration, 'Texto autoral preservado.');
      const output = args[args.indexOf('--output') + 1];
      await mkdir(output, { recursive: true });
      await writeFile(join(output, 'scene-42.png'), visualPng);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          renderer: 'framechester-editorial-v3',
          scenes: [{ scene_id: 42, status: 'generated', file: 'scene-42.png' }],
        }),
        stderr: '',
      };
    },
  };
  let runner = await createRunner(options);
  try {
    const prepared = await runner.prepareVisuals('tech', 'script-one');
    assert.equal(calls, 1);
    assert.equal(prepared.assets.length, 1);
    const asset = prepared.assets[0];
    assert.equal(asset.generated?.sceneId, 42);
    assert.equal(asset.channelId, 'tech');
    assert.equal(prepared.bindings['42'], asset.id);
    assert.equal('diskName' in asset, false);
    assert.deepEqual(await runner.assets('science'), []);
    assert.equal(await runner.assetFile('science', asset.id), undefined);
    assert.ok(await runner.assetFile('tech', asset.id));
    await assert.rejects(runner.prepareVisuals('science', 'script-one'), /neste canal/);
    assert.equal(calls, 1);
    await runner.close();
    runner = await createRunner(options);
    assert.deepEqual((await runner.prepareVisuals('tech', 'script-one')).bindings, prepared.bindings);
    assert.equal(calls, 1);
    current.scripts[0].title = 'Título revisado';
    await assert.rejects(
      runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } }),
      /roteiro mudou/,
    );
    const revised = await runner.prepareVisuals('tech', 'script-one');
    assert.notEqual(revised.bindings['42'], asset.id);
    assert.equal(calls, 2);
    assert.equal(current.scripts[0].crossChecked, true);
    assert.deepEqual(await runner.list('tech'), []);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a brief asking for a recording gets an explanatory composition bound like any other scene', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-capture-brief-'));
  const current = state();
  current.scripts[0].scenes[0].visualBrief = '[CAPTURA PENDENTE] Gravação real.';
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => current,
    execute: async (args) => {
      const output = args[args.indexOf('--output') + 1];
      await mkdir(output, { recursive: true });
      await writeFile(join(output, 'scene-42.png'), visualPng);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          renderer: 'framechester-editorial-v3',
          scenes: [{ scene_id: 42, status: 'generated', file: 'scene-42.png' }],
        }),
        stderr: '',
      };
    },
  });
  try {
    const result = await runner.prepareVisuals('tech', 'script-one');
    assert.equal(result.bindings['42'], result.assets[0].id);
    assert.match(result.assets[0].restrictions, /não representa captura real/);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a stale engine status is rejected instead of importing an unbound preview', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-stale-status-'));
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => state(),
    execute: async (args) => {
      const output = args[args.indexOf('--output') + 1];
      await mkdir(output, { recursive: true });
      await writeFile(join(output, 'scene-42.png'), visualPng);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          renderer: 'framechester-editorial-v3',
          scenes: [{ scene_id: 42, status: 'requires_capture', file: 'scene-42.png' }],
        }),
        stderr: '',
      };
    },
  });
  try {
    await assert.rejects(runner.prepareVisuals('tech', 'script-one'), /arquivo visual inválido/);
    assert.deepEqual(await runner.assets('tech'), []);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('invalid renderer paths are rejected before importing any generated file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-visual-path-'));
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => state(),
    execute: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        renderer: 'framechester-editorial-v3',
        scenes: [{ scene_id: 42, status: 'generated', file: '../private.png' }],
      }),
      stderr: '',
    }),
  });
  try {
    await assert.rejects(runner.prepareVisuals('tech', 'script-one'), /arquivo visual inválido/);
    assert.deepEqual(await runner.assets('tech'), []);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});
function state(): AppState {
  const script: Script = {
    id: 'script-one',
    channelId: 'tech',
    topicId: 'topic-one',
    title: 'Roteiro original',
    series: 'tecnologia',
    format: 'short',
    hook: 'Uma pergunta',
    crossChecked: true,
    status: 'reviewed',
    createdAt: date,
    updatedAt: date,
    sources: [source(1), source(2)],
    claims: [{ text: 'Alegacao citada', status: 'cited', sourceUrls: [source(1).url] }],
    scenes: [
      {
        id: 42,
        heading: 'Cena',
        narration: 'Texto autoral preservado.',
        visualBrief: 'Diagrama original',
        durationHintSecs: 20,
      },
    ],
  };
  return {
    schemaVersion: 1,
    channels: ['tech', 'science'].map((id) => ({
      id,
      name: id,
      description: '',
      niche: '',
      audience: '',
      language: 'pt-BR',
      createdAt: date,
      updatedAt: date,
    })),
    config: {
      dryRun: true,
      telemetry: false,
      render: { width: 640, height: 360, fps: 30, crf: 20, preset: 'veryfast', videoCodec: 'libx264' },
      tts: {
        engine: 'kokoro',
        pythonPath: 'synthetic-python',
        voiceStyles: 'C:/synthetic/voices.bin',
        piperPath: 'piper',
        voiceModel: 'C:/synthetic/licensed-voice.onnx',
        voiceName: 'pf_dora',
      },
      asr: { enabled: false, model: '', language: 'pt', minCoverage: 0.45 },
    },
    channelConfigs: {},
    research: [],
    scripts: [script],
    stories: [],
    monetization: [],
    receipts: [],
  };
}

test('a local draft preview renders unreviewed material without approving it or accepting it as a final video', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-draft-video-'));
  const current = state();
  current.scripts[0].crossChecked = false;
  current.scripts[0].sources = [];
  current.scripts[0].claims = [];
  let previews = false;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => current,
    execute: async (args) => {
      if (args[0] === 'visuals') {
        const output = args[args.indexOf('--output') + 1];
        await mkdir(output, { recursive: true });
        await writeFile(join(output, 'scene-42.png'), visualPng);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            renderer: 'framechester-editorial-v3',
            scenes: [{ scene_id: 42, status: 'generated', file: 'scene-42.png' }],
          }),
          stderr: '',
        };
      }
      previews = args.includes('--preview-only');
      assert.equal(previews, true);
      assert.equal(args.includes('--assets'), false, 'Motion does not read scene files');
      assert.equal(args[args.indexOf('--engine') + 1], 'motion', 'Generated visuals render with motion');
      const topic = JSON.parse(await readFile(args[args.indexOf('--topic') + 1], 'utf8'));
      assert.equal(topic.metrics.cross_check, 0);
      assert.deepEqual(topic.sources, []);
      const output = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      await mkdir(join(output, 'render'), { recursive: true });
      await writeFile(join(output, 'render/final.mp4'), 'synthetic preview fixture');
      await writeFile(
        join(output, 'pipeline_report.json'),
        JSON.stringify({
          stage: 'blocked',
          technical_qa: { checks: [{ status: 'pass' }] },
          editorial_qa: { checks: [{ status: 'fail' }] },
        }),
      );
      return { exitCode: 1, stdout: '', stderr: '' };
    },
  });
  try {
    const prepared = await runner.prepareVisuals('tech', 'script-one');
    const assetIds = prepared.previews!;
    await assert.rejects(runner.start('tech', { scriptId: 'script-one', assetIds }), /fontes/);
    const job = await runner.start('tech', { scriptId: 'script-one', assetIds, previewOnly: true });
    await runner.idle();
    const saved = (await runner.list('tech')).find((item) => item.id === job.id)!;
    assert.equal(saved.previewOnly, true);
    assert.equal(saved.engine, 'motion');
    assert.equal(saved.videoAvailable, true);
    assert.equal(saved.qa?.editorial, 'fail');
    assert.match(saved.message, /Prévia/);
    assert.equal(previews, true);
    assert.equal(current.scripts[0].crossChecked, false);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('automatic production continues from a generated script through visuals and render in the server queue', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-auto-run-'));
  const current = state();
  let generated = false,
    rendered = false;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => current,
    execute: async (args) => {
      if (args[0] === 'visuals') {
        const output = args[args.indexOf('--output') + 1];
        await mkdir(output, { recursive: true });
        await writeFile(join(output, 'scene-42.png'), visualPng);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            renderer: 'framechester-editorial-v3',
            scenes: [{ scene_id: 42, status: 'generated', file: 'scene-42.png' }],
          }),
          stderr: '',
        };
      }
      rendered = true;
      assert.ok(args.includes('--preview-only'));
      const output = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      await mkdir(join(output, 'render'), { recursive: true });
      await writeFile(join(output, 'render/final.mp4'), 'synthetic automated preview');
      await writeFile(
        join(output, 'pipeline_report.json'),
        JSON.stringify({
          stage: 'blocked',
          technical_qa: { checks: [{ status: 'pass' }] },
          editorial_qa: { checks: [{ status: 'needs_human' }] },
        }),
      );
      return { exitCode: 1, stdout: '', stderr: '' };
    },
  });
  try {
    const method = Reflect.get(runner, 'startAutomated');
    assert.equal(typeof method, 'function');
    const job = await runner.startAutomated('tech', 'script-one', async () => {
      generated = true;
      const draft = {
        ...current.scripts[0],
        id: 'script-generated',
        crossChecked: false,
        status: 'draft' as const,
      };
      current.scripts.push(draft);
      return draft.id;
    });
    assert.equal(job.automated, true);
    await runner.idle();
    const saved = (await runner.list('tech')).find((item) => item.id === job.id)!;
    assert.equal(generated, true);
    assert.equal(rendered, true);
    assert.equal(saved.scriptId, 'script-generated');
    assert.equal(saved.videoAvailable, true);
    assert.equal(saved.previewOnly, true);
    assert.equal(current.scripts[0].crossChecked, true);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('automatic narration preflight resolves installed files from the repository rather than the server working directory', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-narrator-root-'));
  const root = join(home, 'repository');
  const current = state();
  current.config.tts = {
    ...current.config.tts,
    pythonPath: '.framechester/tts-venv/Scripts/python.exe',
    voiceModel: 'models/kokoro/kokoro-v1.0.onnx',
    voiceStyles: 'models/kokoro/voices-v1.0.bin',
  };
  for (const relative of [
    current.config.tts.pythonPath!,
    current.config.tts.voiceModel,
    current.config.tts.voiceStyles!,
    'engine.exe',
  ]) {
    const path = join(root, relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, 'synthetic path fixture');
  }
  let prepared = false;
  const runner = await createRunner({
    home: join(home, 'profile'),
    repositoryRoot: root,
    binary: join(root, 'engine.exe'),
    readState: async () => current,
  });
  try {
    const job = await runner.startAutomated('tech', 'script-one', async () => {
      prepared = true;
      throw new Error('Synthetic stop before any engine or model call');
    });
    await runner.idle();
    assert.equal(
      prepared,
      true,
      'The installed narrator must be accepted even when the Node working directory is elsewhere',
    );
    assert.equal((await runner.list('tech')).find((item) => item.id === job.id)!.status, 'failed');
    assert.equal(
      current.config.tts.pythonPath,
      '.framechester/tts-venv/Scripts/python.exe',
      'Runtime resolution must preserve saved operator paths',
    );
    await rm(join(root, current.config.tts.voiceStyles!));
    prepared = false;
    await assert.rejects(
      runner.startAutomated('tech', 'script-one', async () => {
        prepared = true;
        return 'script-one';
      }),
      (error) =>
        error instanceof Error &&
        error.message.includes('voiceStyles') &&
        !error.message.includes('voices:setup'),
    );
    assert.equal(prepared, false, 'A genuinely missing file must be reported before the AI call');
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});
test('a channel job passes authored JSON and licensed media to the fixed Rust engine', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-runner-'));
  const input = state();
  let called = false;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      called = true;
      assert.equal(args.includes('--script'), true);
      assert.equal(args.includes('--assets'), true);
      assert.equal(args.includes('anthropic'), false);
      const topic = JSON.parse(await readFile(args[args.indexOf('--topic') + 1], 'utf8'));
      assert.deepEqual(topic.metrics, {
        acceleration: 0,
        demand: 0,
        alignment: 0,
        originality: 0,
        visual_feasibility: 0,
        timing: 0,
        cross_check: 1,
      });
      // The engine scratch area lives in the Studio data, never in the read-only app folder.
      const engineConfig = await readFile(args[args.indexOf('--config') + 1], 'utf8');
      assert.match(engineConfig, /\nworkdir = ".*production[\\/]+engine"\n/);
      const authored = JSON.parse(await readFile(args[args.indexOf('--script') + 1], 'utf8'));
      assert.equal(authored.script.scenes[0].id, 42);
      assert.equal(authored.script.scenes[0].narration, 'Texto autoral preservado.');
      assert.equal(authored.script.cross_checked, true, 'The operator declaration reaches the engine');
      assert.equal(args[args.indexOf('--engine') + 1], 'legacy', 'An own file needs the still-image path');
      const out = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      await mkdir(join(out, 'render'), { recursive: true });
      await writeFile(join(out, 'render', 'final.mp4'), 'synthetic fixture');
      await writeFile(
        join(out, 'pipeline_report.json'),
        JSON.stringify({
          stage: 'editorial_qa',
          render: { path: join(out, 'render', 'final.mp4') },
          technical_qa: { checks: [{ status: 'pass' }, { status: 'skipped' }] },
          editorial_qa: {
            checks: [{ id: 'sources', name: 'ao menos 1 fonte com URL', status: 'needs_human' }],
          },
          publish: { status: 'dry_run' },
        }),
      );
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
  try {
    const asset = await runner.upload('tech', {
      filename: 'diagram.png',
      kind: 'image',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      license: 'Original de teste',
      provenance: 'Fixture local',
      restrictions: 'Teste',
    });
    const job = await runner.start('tech', {
      scriptId: 'script-one',
      assetIds: { 42: asset.id },
      burnSubtitles: true,
    });
    await runner.idle();
    assert.equal(called, true);
    const done = (await runner.list('tech')).find((item) => item.id === job.id)!;
    assert.equal(done.status, 'needs_review', done.message);
    assert.match(done.message, /ao menos 1 fonte com URL/, 'The message names what is pending');
    assert.equal(done.engine, 'legacy');
    assert.equal(done.videoAvailable, true);
    assert.equal(done.qa?.technical, 'pass');
    assert.ok(await runner.file('tech', job.id, 'video'));
    assert.equal(await runner.file('science', job.id, 'video'), undefined);
    assert.deepEqual(await runner.list('science'), []);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a job refuses another channel script, foreign media and unconfirmed evidence before executing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-isolation-'));
  const input = state();
  let calls = 0;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async () => {
      calls++;
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
  try {
    const asset = await runner.upload('science', {
      filename: 'fixture.png',
      kind: 'image',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      license: 'Original',
      provenance: 'Fixture',
      restrictions: 'Teste',
    });
    await assert.rejects(
      runner.start('science', { scriptId: 'script-one', assetIds: { 42: asset.id } }),
      /Roteiro/,
    );
    await assert.rejects(
      runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } }),
      /outro canal/,
    );
    input.scripts[0].crossChecked = false;
    await assert.rejects(
      runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } }),
      /cruzamento/,
    );
    assert.equal(calls, 0);
    assert.deepEqual(await runner.list('tech'), []);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('uploads reject traversal, fake signatures and absent rights metadata', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-upload-'));
  const runner = await createRunner({ home, repositoryRoot: resolve('..'), readState: async () => state() });
  const normal = {
    filename: 'fixture.png',
    kind: 'image' as const,
    contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    license: 'Original',
    provenance: 'Fixture',
    restrictions: 'Teste',
  };
  try {
    await assert.rejects(runner.upload('tech', { ...normal, filename: '../escape.png' }), /Nome/);
    await assert.rejects(
      runner.upload('tech', {
        ...normal,
        contentBase64: Buffer.from('this is not a PNG image').toString('base64'),
      }),
      /corresponde/,
    );
    await assert.rejects(runner.upload('tech', { ...normal, license: '' }), /licença/);
    assert.deepEqual(await runner.assets('tech'), []);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('offline engine processes receive tool paths without platform or API credentials', () => {
  const original = {
    Path: 'C:/tools',
    SystemRoot: 'C:/Windows',
    ANTHROPIC_API_KEY: 'synthetic-secret',
    YOUTUBE_TOKEN_FILE: 'private-token-path',
    RESTIC_PASSWORD: 'synthetic-password',
    AWS_ACCESS_KEY_ID: 'synthetic-id',
    FRAMECHESTER_WEB_HOME: 'private-web-home',
  };
  assert.deepEqual(localEngineEnvironment(original), { Path: 'C:/tools', SystemRoot: 'C:/Windows' });
  assert.equal(original.ANTHROPIC_API_KEY, 'synthetic-secret');
});

test('production requires an explicit local voice before creating a job or invoking the engine', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-unconfigured-voice-'));
  const input = state();
  input.config.tts.voiceModel = '';
  let calls = 0;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async () => {
      calls++;
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
  try {
    const asset = await runner.upload('tech', {
      filename: 'fixture.png',
      kind: 'image',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      license: 'Original',
      provenance: 'Fixture',
      restrictions: 'Teste',
    });
    await assert.rejects(
      runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } }),
      /Configure.*voz/,
    );
    assert.equal(calls, 0);
    assert.deepEqual(await runner.list('tech'), []);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('commercial-only production rejects legacy and unreviewed voices before creating a job', async () => {
  for (const voiceName of [
    'pt_BR-faber-medium',
    'pt_BR-cadu-medium',
    'pt_BR-edresson-low',
    'unreviewed-voice',
  ]) {
    const home = await mkdtemp(join(tmpdir(), 'fc-commercial-voice-'));
    const input = state();
    input.config.tts.voiceName = voiceName;
    let calls = 0;
    const runner = await createRunner({
      home,
      repositoryRoot: resolve('..'),
      readState: async () => input,
      execute: async () => {
        calls++;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    try {
      const asset = await runner.upload('tech', {
        filename: 'fixture.png',
        kind: 'image',
        contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        license: 'Original',
        provenance: 'Fixture',
        restrictions: 'Teste',
      });
      await assert.rejects(
        runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } }),
        /comercial|Kokoro/,
      );
      assert.equal(calls, 0);
      assert.deepEqual(await runner.list('tech'), []);
    } finally {
      await runner.close();
      await rm(home, { recursive: true, force: true });
    }
  }
});

test('a channel named constructor uses its actual configuration rather than the object prototype', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-prototype-'));
  const input = state();
  input.channels[0].id = 'constructor';
  input.scripts[0].channelId = 'constructor';
  let calls = 0;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      calls++;
      const config = await readFile(args[args.indexOf('--config') + 1], 'utf8');
      assert.match(config, /width = 640/);
      return { exitCode: 1, stdout: '', stderr: 'fixture' };
    },
  });
  try {
    const asset = await runner.upload('constructor', {
      filename: 'fixture.png',
      kind: 'image',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      license: 'Original',
      provenance: 'Fixture',
      restrictions: 'Teste',
    });
    await runner.start('constructor', { scriptId: 'script-one', assetIds: { 42: asset.id } });
    await runner.idle();
    assert.equal(calls, 1);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('an incomplete engine delivery is blocked rather than presented as a produced video', async () => {
  const cases = [
    {
      name: 'missing technical QA',
      technical: undefined,
      editorial: [{ status: 'needs_human' }],
      video: 'fixture',
    },
    { name: 'missing editorial QA', technical: [{ status: 'pass' }], editorial: undefined, video: 'fixture' },
    {
      name: 'unknown check status',
      technical: [{ status: 'unexpected' }],
      editorial: [{ status: 'needs_human' }],
      video: 'fixture',
    },
    {
      name: 'no video',
      technical: [{ status: 'pass' }],
      editorial: [{ status: 'needs_human' }],
      video: undefined,
    },
    {
      name: 'empty video',
      technical: [{ status: 'pass' }],
      editorial: [{ status: 'needs_human' }],
      video: '',
    },
  ];
  for (const entry of cases) {
    const home = await mkdtemp(join(tmpdir(), 'fc-incomplete-delivery-'));
    const runner = await createRunner({
      home,
      repositoryRoot: resolve('..'),
      readState: async () => state(),
      execute: async (args) => {
        const output = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
        await mkdir(join(output, 'render'), { recursive: true });
        if (entry.video !== undefined) await writeFile(join(output, 'render', 'final.mp4'), entry.video);
        await writeFile(
          join(output, 'pipeline_report.json'),
          JSON.stringify({
            stage: 'editorial_qa',
            technical_qa: entry.technical ? { checks: entry.technical } : undefined,
            editorial_qa: entry.editorial ? { checks: entry.editorial } : undefined,
          }),
        );
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    try {
      const asset = await runner.upload('tech', {
        filename: 'fixture.png',
        kind: 'image',
        contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        license: 'Original',
        provenance: 'Fixture',
        restrictions: 'Teste',
      });
      const job = await runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } });
      await runner.idle();
      const result = (await runner.list('tech')).find((item) => item.id === job.id)!;
      assert.equal(result.status, 'blocked', entry.name);
      assert.match(result.message, /incompleta|bloqueou/, entry.name);
      assert.equal(result.videoAvailable, Boolean(entry.video), entry.name);
    } finally {
      await runner.close();
      await rm(home, { recursive: true, force: true });
    }
  }
});

test('restart blocks interrupted jobs while preserving completed history and imported media', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-runner-restart-'));
  const options = { home, repositoryRoot: resolve('..'), readState: async () => state() };
  const first = await createRunner(options);
  const asset = await first.upload('tech', {
    filename: 'fixture.png',
    kind: 'image',
    contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    license: 'Original',
    provenance: 'Fixture',
    restrictions: 'Teste',
  });
  await first.close();
  const jobs = ['queued', 'running', 'needs_review'].map((status, index) => ({
    id: `job-${index}`,
    channelId: 'tech',
    scriptId: 'script-one',
    status,
    createdAt: date,
    message: 'Synthetic fixture',
    videoAvailable: index === 2,
  }));
  await writeFile(join(home, 'production', 'jobs.json'), JSON.stringify(jobs));
  const restarted = await createRunner(options);
  try {
    const results = await restarted.list('tech');
    assert.deepEqual(
      results.map((job) => job.status),
      ['blocked', 'blocked', 'needs_review'],
    );
    assert.match(results[0].message, /interrompida/);
    assert.equal(results[2].videoAvailable, true);
    assert.deepEqual(
      (await restarted.assets('tech')).map((item) => item.id),
      [asset.id],
    );
    assert.deepEqual(await restarted.list('science'), []);
    assert.deepEqual(
      JSON.parse(await readFile(join(home, 'production', 'jobs.json'), 'utf8')).map(
        (job: { status: string }) => job.status,
      ),
      ['blocked', 'blocked', 'needs_review'],
    );
  } finally {
    await restarted.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a stored script with an invalid directive still goes to the engine, which renders the default layout', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-visual-legacy-'));
  const current = state();
  let calls = 0;
  current.scripts[0].scenes[0].visualBrief = '#grafico 1, 2, 3';
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(current),
    execute: async () => {
      calls++;
      return { exitCode: 1, stdout: '', stderr: '' };
    },
  });
  try {
    await assert.rejects(runner.prepareVisuals('tech', 'script-one'), /visuais locais/);
    assert.equal(calls, 1);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a stale engine is reported as stale with the command that fixes it, not as an invalid plan', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-visual-stale-'));
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => state(),
    execute: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        renderer: 'framechester-editorial-v1',
        scenes: [{ scene_id: 42, status: 'generated', file: 'scene-42.png' }],
      }),
      stderr: '',
    }),
  });
  try {
    await assert.rejects(
      runner.prepareVisuals('tech', 'script-one'),
      (error: unknown) =>
        error instanceof RunnerError &&
        error.status === 503 &&
        /desatualizado.*editorial-v1.*npm --prefix web start/.test(error.message),
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a job with no QA pending is completed, and the operator declaration covers cited or unsourced claims', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-approved-'));
  const input = state();
  input.scripts[0].claims = [
    { text: 'Alegacao sem URL', status: 'cited', sourceUrls: [] },
    { text: 'Alegacao a conferir', status: 'unverified', sourceUrls: [source(2).url] },
  ];
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      const out = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      await mkdir(join(out, 'render'), { recursive: true });
      await writeFile(join(out, 'render', 'final.mp4'), 'synthetic fixture');
      await writeFile(
        join(out, 'pipeline_report.json'),
        JSON.stringify({
          stage: 'editorial_qa',
          technical_qa: { checks: [{ status: 'pass' }] },
          editorial_qa: { checks: [{ status: 'pass' }, { status: 'pass' }] },
          publish: { status: 'dry_run' },
        }),
      );
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
  try {
    const asset = await runner.upload('tech', {
      filename: 'diagram.png',
      kind: 'image',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      license: 'Original de teste',
      provenance: 'Fixture local',
      restrictions: 'Teste',
    });
    const job = await runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } });
    await runner.idle();
    const done = (await runner.list('tech')).find((item) => item.id === job.id)!;
    assert.equal(done.status, 'completed', done.message);
    assert.match(done.message, /aprovado/);
    assert.equal(done.publications, undefined, 'Without the channel opt-in nothing leaves the machine');
    input.scripts[0].claims[0].status = 'contradicted';
    await assert.rejects(
      runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } }),
      /contraditórias/,
    );
    input.scripts[0].claims[0] = {
      text: 'Fora do inventario',
      status: 'cited',
      sourceUrls: ['https://example.com/x'],
    };
    await assert.rejects(
      runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } }),
      /URLs das fontes/,
    );
    input.scripts[0].sources = [];
    input.scripts[0].claims = [];
    const sourceless = await runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } });
    await runner.idle();
    assert.equal(
      (await runner.list('tech')).find((item) => item.id === sourceless.id)!.videoAvailable,
      true,
      'A reviewed script without sources still gets its final version; QA names the missing source',
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a blocked job names what the engine refused instead of a generic message', async () => {
  for (const [report, expected] of [
    [
      { stage: 'blocked', warnings: ['claim contraditorio: A Terra é plana'] },
      /bloqueou a entrega: claim contraditorio: A Terra é plana/,
    ],
    [
      {
        stage: 'editorial_qa',
        technical_qa: { checks: [{ status: 'pass' }] },
        editorial_qa: {
          checks: [{ name: 'sem narracao duplicada', status: 'fail', detail: 'duas cenas iguais' }],
        },
      },
      /sem narracao duplicada: duas cenas iguais/,
    ],
  ] as const) {
    const home = await mkdtemp(join(tmpdir(), 'framechester-web-blocked-reason-'));
    const runner = await createRunner({
      home,
      repositoryRoot: resolve('..'),
      readState: async () => state(),
      execute: async (args) => {
        const out = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
        await mkdir(join(out, 'render'), { recursive: true });
        await writeFile(join(out, 'pipeline_report.json'), JSON.stringify(report));
        return { exitCode: 1, stdout: '', stderr: '' };
      },
    });
    try {
      const asset = await runner.upload('tech', {
        filename: 'fixture.png',
        kind: 'image',
        contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        license: 'Original',
        provenance: 'Fixture',
        restrictions: 'Teste',
      });
      const job = await runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } });
      await runner.idle();
      const result = (await runner.list('tech')).find((item) => item.id === job.id)!;
      assert.equal(result.status, 'blocked');
      assert.match(result.message, expected);
    } finally {
      await runner.close();
      await rm(home, { recursive: true, force: true });
    }
  }
});

test('an opted-in channel sends each approved final version once, privately, and never a preview', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-youtube-'));
  const input = state();
  input.channels[0].autoUpload = ['youtube'];
  const uploads: Array<{
    channelId: string;
    title: string;
    description: string;
    video: string;
    thumbnail: string;
  }> = [];
  let fail = false;
  let gate: Promise<void> | undefined;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      const out = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      await mkdir(join(out, 'render'), { recursive: true });
      await mkdir(join(out, 'publish'), { recursive: true });
      await writeFile(join(out, 'render', 'final.mp4'), 'synthetic fixture');
      await writeFile(join(out, 'publish', 'description.txt'), 'Descrição com fontes');
      await writeFile(join(out, 'render', 'thumbnail.png'), 'synthetic thumbnail');
      const preview = args.includes('--preview-only');
      await writeFile(
        join(out, 'pipeline_report.json'),
        JSON.stringify({
          stage: preview ? 'blocked' : 'editorial_qa',
          technical_qa: { checks: [{ status: 'pass' }] },
          editorial_qa: { checks: [{ status: 'pass' }] },
        }),
      );
      return { exitCode: preview ? 2 : 0, stdout: '', stderr: '' };
    },
    publish: async (channelId, _network, video) => {
      if (fail) throw new Error('Reconecte o YouTube em Contas conectadas para autorizar o envio de vídeos.');
      await gate;
      uploads.push({
        channelId,
        title: video.title,
        description: video.description,
        video: await readFile(video.path, 'utf8'),
        thumbnail: await readFile(video.thumbnail!, 'utf8'),
      });
      return { postId: 'abcdefghijk', thumbnail: 'set' };
    },
  });
  try {
    const asset = await runner.upload('tech', {
      filename: 'diagram.png',
      kind: 'image',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      license: 'Original de teste',
      provenance: 'Fixture local',
      restrictions: 'Teste',
    });
    const preview = await runner.start('tech', {
      scriptId: 'script-one',
      assetIds: { 42: asset.id },
      previewOnly: true,
    });
    await runner.idle();
    assert.equal(uploads.length, 0, 'A preview never leaves the machine');
    await assert.rejects(runner.publish('tech', preview.id, 'youtube'), /versão final aprovada/);

    const job = await runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } });
    await runner.idle();
    const done = (await runner.list('tech')).find((item) => item.id === job.id)!;
    assert.equal(done.status, 'completed', done.message);
    assert.equal(done.publications?.youtube?.status, 'uploaded');
    assert.deepEqual(uploads, [
      {
        channelId: 'tech',
        title: input.scripts[0].title,
        description: 'Descrição com fontes',
        video: 'synthetic fixture',
        thumbnail: 'synthetic thumbnail',
      },
    ]);
    const sent = done.publications?.youtube;
    assert.equal(sent?.status === 'uploaded' && sent.thumbnail, 'set');
    await assert.rejects(runner.publish('tech', job.id, 'youtube'), /já foi enviado/);

    fail = true;
    const second = await runner.start('tech', { scriptId: 'script-one', assetIds: { 42: asset.id } });
    await runner.idle();
    const failed = (await runner.list('tech')).find((item) => item.id === second.id)!;
    assert.equal(failed.status, 'completed', 'A failed upload does not undo an approved video');
    const refused = failed.publications?.youtube;
    assert.equal(refused?.status, 'failed');
    assert.match(refused?.status === 'failed' ? refused.message : '', /Reconecte/);
    fail = false;
    let release = () => {};
    gate = new Promise((resolve) => (release = resolve));
    const retry = await runner.publish('tech', second.id, 'youtube');
    assert.equal(retry.publications?.youtube?.status, 'uploading');
    await assert.rejects(runner.publish('tech', second.id, 'youtube'), /em andamento/);
    release();
    await runner.idle();
    assert.equal(
      (await runner.list('tech')).find((item) => item.id === second.id)!.publications?.youtube?.status,
      'uploaded',
    );
    assert.equal(uploads.length, 2);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a Short is cut from an approved motion video, inherits its review and goes out tagged #Shorts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-short-'));
  const input = state();
  input.scripts[0].format = 'long';
  const sourceOutput = join(home, 'production', 'jobs', 'tech', 'source-final', 'output', 'channels', 'tech');
  await mkdir(join(sourceOutput, 'publish'), { recursive: true });
  await writeFile(join(sourceOutput, 'storyboard.json'), '{}');
  await writeFile(join(sourceOutput, 'publish', 'description.txt'), 'Descrição com fontes');
  const base = {
    channelId: 'tech',
    scriptId: 'script-one',
    createdAt: '2026-10-31T10:00:00Z',
    videoAvailable: true,
  };
  await writeFile(
    join(home, 'production', 'jobs.json'),
    JSON.stringify([
      { ...base, id: 'source-final', status: 'completed', message: 'ok', engine: 'motion' },
      {
        ...base,
        id: 'source-preview',
        status: 'needs_review',
        message: 'ok',
        engine: 'motion',
        previewOnly: true,
      },
      { ...base, id: 'source-legacy', status: 'completed', message: 'ok', engine: 'legacy' },
    ]),
  );
  await writeFile(join(home, 'production', 'assets.json'), '[]');
  const calls: string[][] = [];
  const uploads: Array<{
    network: string;
    title: string;
    description: string;
    thumbnail?: string;
    vertical: boolean;
  }> = [];
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      calls.push(args);
      const out = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      await mkdir(join(out, 'render'), { recursive: true });
      await writeFile(join(out, 'render', 'final.mp4'), 'synthetic short');
      await writeFile(
        join(out, 'pipeline_report.json'),
        JSON.stringify({ stage: 'editorial_qa', technical_qa: { checks: [{ status: 'pass' }] } }),
      );
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    publish: async (_channel, network, video) => {
      uploads.push({
        network,
        title: video.title,
        description: video.description,
        thumbnail: video.thumbnail,
        vertical: video.vertical,
      });
      return { postId: network === 'youtube' ? 'abcdefghijk' : '987654321' };
    },
    profiles: async () => [
      { platform: 'youtube', url: 'https://www.youtube.com/@fixture' },
      { platform: 'facebook', url: 'https://www.facebook.com/123' },
    ],
  });
  try {
    await assert.rejects(runner.startShort('tech', 'source-preview'), /versão final aprovada/);
    await assert.rejects(runner.startShort('tech', 'source-legacy'), /motor motion/);
    const short = await runner.startShort('tech', 'source-final');
    assert.equal(short.kind, 'short');
    await runner.idle();
    const args = calls[0];
    assert.equal(args[args.indexOf('--config') + 2], 'short');
    assert.equal(args[args.indexOf('--from') + 1], join(sourceOutput, 'storyboard.json'));
    const done = (await runner.list('tech')).find((item) => item.id === short.id)!;
    assert.equal(done.status, 'completed', done.message);
    assert.equal(done.qa?.editorial, 'pass', 'the source approval covers the same words');
    await assert.rejects(runner.startShort('tech', short.id), /já é um Short/);
    await assert.rejects(runner.startShort('tech', 'source-final'), /já tem um Short/);
    input.scripts[0].format = 'short';
    await assert.rejects(runner.startShort('tech', 'source-final'), /já é vertical/);
    input.scripts[0].format = 'long';
    await runner.publish('tech', short.id, 'youtube');
    await runner.publish('tech', short.id, 'facebook');
    await runner.idle();
    assert.deepEqual(uploads, [
      {
        network: 'youtube',
        title: `${input.scripts[0].title} #Shorts`,
        description:
          'Descrição com fontes\n\nAcompanhe também:\nFacebook: https://www.facebook.com/123\n\n#Shorts',
        thumbnail: undefined,
        vertical: true,
      },
      {
        network: 'facebook',
        title: input.scripts[0].title,
        description: 'Descrição com fontes\n\nAcompanhe também:\nYouTube: https://www.youtube.com/@fixture',
        thumbnail: undefined,
        vertical: true,
      },
    ]);
    input.scripts[0].format = 'long';
    await assert.rejects(
      runner.publish('tech', 'source-final', 'facebook'),
      /só vídeo vertical/,
      'A horizontal video does not go to a Reels-only network',
    );
    await assert.rejects(
      runner.publish('tech', 'source-final', 'instagram'),
      /Instagram recebe só vídeo vertical/,
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('each opted-in network gets the approved video once, its Short follows by itself, and old records migrate', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-networks-'));
  const input = state();
  input.scripts[0].format = 'long';
  input.channels[0].autoUpload = ['youtube', 'tiktok', 'instagram', 'facebook'];
  await mkdir(join(home, 'production'), { recursive: true });
  await writeFile(
    join(home, 'production', 'jobs.json'),
    JSON.stringify([
      {
        id: 'legacy-upload',
        channelId: 'tech',
        scriptId: 'script-one',
        status: 'completed',
        createdAt: '2026-10-30T10:00:00Z',
        message: 'ok',
        videoAvailable: true,
        youtube: { status: 'uploaded', videoId: 'abcdefghijk', uploadedAt: '2026-10-30T11:00:00Z' },
      },
    ]),
  );
  await writeFile(join(home, 'production', 'assets.json'), '[]');
  const uploads: Array<{ network: string; description: string; vertical: boolean }> = [];
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      if (args[0] === 'visuals') {
        const output = args[args.indexOf('--output') + 1];
        await mkdir(output, { recursive: true });
        await writeFile(join(output, 'scene-42.png'), visualPng);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            renderer: 'framechester-editorial-v3',
            scenes: [{ scene_id: 42, status: 'generated', file: 'scene-42.png' }],
          }),
          stderr: '',
        };
      }
      const out = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      await mkdir(join(out, 'render'), { recursive: true });
      await mkdir(join(out, 'publish'), { recursive: true });
      await writeFile(join(out, 'render', 'final.mp4'), 'synthetic fixture');
      await writeFile(join(out, 'storyboard.json'), '{}');
      await writeFile(join(out, 'publish', 'description.txt'), 'Descrição com fontes');
      await writeFile(
        join(out, 'pipeline_report.json'),
        JSON.stringify({
          stage: 'editorial_qa',
          technical_qa: { checks: [{ status: 'pass' }] },
          editorial_qa: { checks: [{ status: 'pass' }] },
        }),
      );
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    publish: async (_channel, network, video) => {
      uploads.push({ network, description: video.description, vertical: video.vertical });
      return { postId: `${network}-post` };
    },
    profiles: async () => [
      { platform: 'youtube', url: 'https://www.youtube.com/@fixture' },
      { platform: 'tiktok', url: 'https://www.tiktok.com/@fixture' },
    ],
  });
  try {
    const legacy = (await runner.list('tech')).find((item) => item.id === 'legacy-upload')!;
    assert.deepEqual(legacy.publications, {
      youtube: { status: 'uploaded', postId: 'abcdefghijk', uploadedAt: '2026-10-30T11:00:00Z' },
    });
    assert.equal('youtube' in legacy, false);
    // No file of the operator's own: the motion engine, which a Short is cut from.
    const prepared = await runner.prepareVisuals('tech', 'script-one');
    const job = await runner.start('tech', { scriptId: 'script-one', assetIds: prepared.previews! });
    // The long video's run queues its Short; wait for both.
    await runner.idle();
    await runner.idle();
    const jobs = await runner.list('tech');
    const done = jobs.find((item) => item.id === job.id)!;
    assert.deepEqual(Object.keys(done.publications ?? {}).sort(), ['tiktok', 'youtube']);
    const short = jobs.find((item) => item.kind === 'short' && item.sourceJobId === job.id)!;
    assert.equal(short.status, 'completed', short.message);
    assert.equal(
      jobs.filter((item) => item.kind === 'short').length,
      1,
      'The Short is not cut from the legacy job nor twice',
    );
    assert.deepEqual(
      uploads.map((item) => [item.network, item.vertical]),
      [
        ['youtube', false],
        ['tiktok', false],
        ['youtube', true],
        ['tiktok', true],
        ['instagram', true],
        ['facebook', true],
      ],
      'The horizontal video skips the Reels networks; its Short reaches all four',
    );
    assert.equal(
      uploads[0].description,
      'Descrição com fontes\n\nAcompanhe também:\nTikTok: https://www.tiktok.com/@fixture',
    );
    assert.equal(
      uploads[1].description,
      'Descrição com fontes\n\nAcompanhe também:\nYouTube: https://www.youtube.com/@fixture',
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});
