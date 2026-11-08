import { LocalStore } from '../server/store.ts';
import test from 'node:test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { AppState, Script } from '../shared/types.ts';
import { postText } from '../shared/publishing.ts';
import { createRunner, localEngineEnvironment } from '../server/runner.ts';
import { formatAffiliateLines, parseAffiliateLines, validAffiliate } from '../shared/affiliates.ts';

const date = '2026-10-27T00:00:00.000Z';
const source = (id: number) => ({
  title: `Fonte ${id}`,
  url: `https://example.com/${id}`,
  publisher: 'Fixture',
  retrievedAt: '2026-10-27',
  license: 'Referencia de teste',
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
      previews = args.includes('--preview-only');
      assert.equal(previews, true);
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
    await assert.rejects(runner.start('tech', { scriptId: 'script-one' }), /fontes/);
    const job = await runner.start('tech', { scriptId: 'script-one', previewOnly: true });
    await runner.idle();
    const saved = (await runner.list('tech')).find((item) => item.id === job.id)!;
    assert.equal(saved.previewOnly, true);
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

test('automatic production continues from a generated script straight to the motion render in the server queue', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-auto-run-'));
  const current = state();
  let generated = false,
    rendered = false;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => current,
    execute: async (args) => {
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
test('a channel job passes authored JSON, and only flags `run` accepts, to the fixed Rust engine', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-runner-'));
  const input = state();
  let called = false;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      called = true;
      // The exact argv: motion only, no scene files, no switch the engine dropped.
      const directory = dirname(args[1]);
      assert.equal(dirname(directory), join(home, 'production', 'jobs', 'tech'));
      assert.deepEqual(args, [
        '--config',
        join(directory, 'config.toml'),
        'run',
        '--channel',
        'tech',
        '--topic',
        join(directory, 'topic.json'),
        '--script',
        join(directory, 'script.json'),
        '--workdir',
        join(directory, 'output'),
        '--format',
        'short',
        '--json',
      ]);
      for (const removed of [
        '--engine',
        '--assets',
        '--max-scenes',
        '--privacy',
        '--burn-subtitles',
        '--asr',
        '--llm',
        '--max-cost-cents',
        '--max-output-tokens',
      ])
        assert.equal(args.includes(removed), false, `${removed} is no longer a flag of run`);
      assert.equal(existsSync(join(directory, 'assets')), false, 'No scene file is copied for the engine');
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
    const job = await runner.start('tech', { scriptId: 'script-one' });
    await runner.idle();
    assert.equal(called, true);
    const done = (await runner.list('tech')).find((item) => item.id === job.id)!;
    assert.equal(done.status, 'needs_review', done.message);
    assert.match(done.message, /ao menos 1 fonte com URL/, 'The message names what is pending');
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

test('a job refuses another channel script and unconfirmed evidence before executing', async () => {
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
    await assert.rejects(runner.start('science', { scriptId: 'script-one' }), /Roteiro/);
    input.scripts[0].crossChecked = false;
    await assert.rejects(runner.start('tech', { scriptId: 'script-one' }), /cruzamento/);
    assert.equal(calls, 0);
    assert.deepEqual(await runner.list('tech'), []);
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
    await assert.rejects(runner.start('tech', { scriptId: 'script-one' }), /Configure.*voz/);
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
      await assert.rejects(runner.start('tech', { scriptId: 'script-one' }), /comercial|Kokoro/);
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
    await runner.start('constructor', { scriptId: 'script-one' });
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
      const job = await runner.start('tech', { scriptId: 'script-one' });
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

test('restart blocks interrupted jobs, preserves completed history and loads records of the still-image engine', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-runner-restart-'));
  const options = { home, repositoryRoot: resolve('..'), readState: async () => state() };
  const first = await createRunner(options);
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
  // A record of the removed still-image engine, with its scene files and switches.
  Object.assign(jobs[2], { engine: 'legacy', assetIds: { 42: 'old-asset' }, asr: true, burnSubtitles: true });
  await writeFile(join(home, 'production', 'jobs.json'), JSON.stringify(jobs));
  await writeFile(join(home, 'production', 'assets.json'), JSON.stringify([{ id: 'old-asset' }]));
  const restarted = await createRunner(options);
  try {
    const results = await restarted.list('tech');
    assert.deepEqual(
      results.map((job) => job.status),
      ['blocked', 'blocked', 'needs_review'],
    );
    assert.match(results[0].message, /interrompida/);
    assert.equal(results[2].videoAvailable, true);
    for (const field of ['engine', 'assetIds', 'asr', 'burnSubtitles'])
      assert.equal(field in results[2], false, `${field} no longer means anything`);
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
    execute: async (args) => {
      calls++;
      assert.equal(args[2], 'run');
      const authored = JSON.parse(await readFile(args[args.indexOf('--script') + 1], 'utf8'));
      assert.equal(authored.script.scenes[0].visual_brief, '#grafico 1, 2, 3');
      return { exitCode: 1, stdout: '', stderr: '' };
    },
  });
  try {
    await runner.start('tech', { scriptId: 'script-one' });
    await runner.idle();
    assert.equal(calls, 1);
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
    const job = await runner.start('tech', { scriptId: 'script-one' });
    await runner.idle();
    const done = (await runner.list('tech')).find((item) => item.id === job.id)!;
    assert.equal(done.status, 'completed', done.message);
    assert.match(done.message, /aprovado/);
    assert.equal(done.publications, undefined, 'Without the channel opt-in nothing leaves the machine');
    input.scripts[0].claims[0].status = 'contradicted';
    await assert.rejects(runner.start('tech', { scriptId: 'script-one' }), /contraditórias/);
    input.scripts[0].claims[0] = {
      text: 'Fora do inventario',
      status: 'cited',
      sourceUrls: ['https://example.com/x'],
    };
    await assert.rejects(runner.start('tech', { scriptId: 'script-one' }), /URLs das fontes/);
    input.scripts[0].sources = [];
    input.scripts[0].claims = [];
    const sourceless = await runner.start('tech', { scriptId: 'script-one' });
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
      const job = await runner.start('tech', { scriptId: 'script-one' });
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
    const preview = await runner.start('tech', {
      scriptId: 'script-one',
      previewOnly: true,
    });
    await runner.idle();
    assert.equal(uploads.length, 0, 'A preview never leaves the machine');
    await assert.rejects(runner.publish('tech', preview.id, 'youtube'), /versão final aprovada/);

    const job = await runner.start('tech', { scriptId: 'script-one' });
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
    const second = await runner.start('tech', { scriptId: 'script-one' });
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

test('a Short is cut from an approved video, inherits its review and goes out tagged #Shorts', async () => {
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
  let listing = false;
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
      if (args.includes('--list'))
        return listing
          ? { exitCode: 0, stdout: JSON.stringify({ parts: [{ part: 1 }, { part: 2 }] }), stderr: '' }
          : { exitCode: 1, stdout: '', stderr: `sem cenas narradas em ${home}` };
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
        description: postText(network, {
          title: video.title,
          body: video.description,
          references: video.references ?? '',
          tag: video.tag,
        }).text,
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
    await assert.rejects(runner.startShorts('tech', 'source-preview'), /versão final aprovada/);
    // A video of the removed still-image engine has no storyboard: the split says so and
    // does not use up its turn.
    await assert.rejects(runner.startShorts('tech', 'source-legacy'), /storyboard deste vídeo/);
    assert.equal(
      (await runner.list('tech')).find((item) => item.id === 'source-legacy')!.shortsAt,
      undefined,
    );
    // A split the engine refused does not use up the video's one turn.
    const refused = await runner.startShorts('tech', 'source-final').catch((error: Error) => error);
    assert.match(String(refused), /dividir o vídeo em Shorts: sem cenas narradas em \[dados locais\]/);
    listing = true;
    const shorts = await runner.startShorts('tech', 'source-final');
    assert.deepEqual(
      shorts.map((item) => [item.kind, item.part, item.parts]),
      [
        ['short', 1, 2],
        ['short', 2, 2],
      ],
    );
    await runner.idle();
    const list = calls[1];
    assert.deepEqual(list.slice(0, 2), ['short', '--from']);
    assert.equal(list[list.indexOf('--from') + 1], join(sourceOutput, 'storyboard.json'));
    const parts = calls.slice(2).map((args) => args[args.indexOf('--part') + 1]);
    assert.deepEqual(parts, ['1', '2'], 'one engine run per part, in order');
    assert.equal(calls[2][calls[2].indexOf('--config') + 2], 'short');
    const jobs = await runner.list('tech');
    const short = jobs.find((item) => item.id === shorts[0].id)!;
    for (const item of shorts) {
      const done = jobs.find((job) => job.id === item.id)!;
      assert.equal(done.status, 'completed', done.message);
      assert.equal(done.qa?.editorial, 'pass', 'the source approval covers the same words');
    }
    assert.ok(jobs.find((item) => item.id === 'source-final')!.shortsAt);
    await assert.rejects(runner.startShorts('tech', short.id), /já é um Short/);
    await assert.rejects(runner.startShorts('tech', 'source-final'), /já foram gerados/);
    await runner.remove('tech', shorts[1].id);
    await assert.rejects(
      runner.startShorts('tech', 'source-final'),
      /já foram gerados/,
      'Once per video, even after its Shorts are deleted',
    );
    input.scripts[0].format = 'short';
    await assert.rejects(runner.startShorts('tech', 'source-final'), /já é vertical/);
    input.scripts[0].format = 'long';
    await runner.publish('tech', short.id, 'youtube');
    await runner.publish('tech', short.id, 'facebook');
    await runner.idle();
    assert.deepEqual(uploads, [
      {
        network: 'youtube',
        title: `${input.scripts[0].title} (1/2) #Shorts`,
        description:
          'Descrição com fontes\n\nAcompanhe também:\nFacebook: https://www.facebook.com/123\n\n#Shorts',
        thumbnail: undefined,
        vertical: true,
      },
      {
        network: 'facebook',
        title: `${input.scripts[0].title} (1/2)`,
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
      if (args.includes('--list'))
        return { exitCode: 0, stdout: JSON.stringify({ parts: [{ part: 1 }], dropped: [] }), stderr: '' };
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
      uploads.push({
        network,
        description: postText(network, {
          title: video.title,
          body: video.description,
          references: video.references ?? '',
        }).text,
        vertical: video.vertical,
      });
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
    const job = await runner.start('tech', { scriptId: 'script-one' });
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
      `${input.scripts[0].title}\n\nDescrição com fontes\n\nAcompanhe também:\nYouTube: https://www.youtube.com/@fixture`,
      'TikTok has one caption, opened by the title',
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('an English channel narrates with an English voice, checks speech in English and tells the engine', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-language-'));
  const input = state();
  input.channels[0].language = 'en-US';
  input.config.tts.voiceName = 'pm_alex';
  let toml = '';
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      toml = await readFile(args[args.indexOf('--config') + 1], 'utf8');
      return { exitCode: 2, stdout: '', stderr: '' };
    },
  });
  try {
    await runner.start('tech', { scriptId: 'script-one' });
    await runner.idle();
    assert.match(toml, /\[\[channels\]\]\nid = "tech"\nlanguage = "en-US"\n/);
    assert.doesNotMatch(toml, /^look = /m, 'no look configured: the engine default applies');
    assert.match(toml, /voice_name = "af_heart"/, 'A Portuguese voice gives way to the first English one');
    assert.match(toml, /\[asr\][^[]*language = "en"/);
    input.channels[0].language = 'de-DE';
    await assert.rejects(
      runner.start('tech', { scriptId: 'script-one' }),
      /de-DE deste canal não tem voz comercial/,
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("the channel's look travels into the engine config of every job", async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-look-'));
  const input = state();
  input.channels[0].look = 'planta';
  let toml = '';
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      toml = await readFile(args[args.indexOf('--config') + 1], 'utf8');
      return { exitCode: 2, stdout: '', stderr: '' };
    },
  });
  try {
    await runner.start('tech', { scriptId: 'script-one' });
    await runner.idle();
    assert.match(toml, /\[\[channels\]\]\nid = "tech"\nlanguage = "[^"]+"\nlook = "planta"\n\[app\]/);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a channel saves a known look and refuses any other', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-look-store-'));
  const store = new LocalStore(home);
  try {
    const saved = await store.saveChannel({ id: 'tech', name: 'Canal sintético', look: 'papel' });
    assert.equal(saved.look, 'papel');
    await assert.rejects(store.saveChannel({ look: 'neon' }, 'tech'), /Visual inválido/);
    const plain = await store.saveChannel({ id: 'science', name: 'Outro canal sintético' });
    assert.equal(plain.look, undefined, 'no look stored means the engine default');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("the channel's mascot and cast travel into the engine config, after its look", async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-identity-'));
  const input = state();
  input.channels[0].look = 'papel';
  input.channels[0].identity = { body: 'purple', shape: 'tall', cast: [{ name: 'Bit', hat: 'glasses' }] };
  let toml = '';
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      toml = await readFile(args[args.indexOf('--config') + 1], 'utf8');
      return { exitCode: 2, stdout: '', stderr: '' };
    },
  });
  try {
    await runner.start('tech', { scriptId: 'script-one' });
    await runner.idle();
    assert.match(
      toml,
      /look = "papel"\n\[channels\.identity\]\nbody = "purple"\nshape = "tall"\n\[\[channels\.identity\.cast\]\]\nname = "Bit"\nhat = "glasses"\n\[app\]/,
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("the channel's affiliate links travel into the engine config before [app]", async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-affiliates-'));
  const input = state();
  input.channels[0].affiliates = [
    {
      label: 'Finance "book"',
      url: 'https://example.com/b?tag=x-20',
      terms: ['compound interest', 'budget'],
    },
  ];
  let toml = '';
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      toml = await readFile(args[args.indexOf('--config') + 1], 'utf8');
      return { exitCode: 2, stdout: '', stderr: '' };
    },
  });
  try {
    await runner.start('tech', { scriptId: 'script-one' });
    await runner.idle();
    assert.match(
      toml,
      /\[\[channels\.affiliates\]\]\nlabel = "Finance \\"book\\""\nurl = "https:\/\/example\.com\/b\?tag=x-20"\nterms = \["compound interest", "budget"\]\n\[app\]/,
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('affiliate links are edited one per line and validated like the engine', async () => {
  const lines = 'Book | https://example.com/b | compound interest, budget\n\nbroken line';
  const parsed = parseAffiliateLines(lines);
  assert.deepEqual(parsed[0], {
    label: 'Book',
    url: 'https://example.com/b',
    terms: ['compound interest', 'budget'],
  });
  assert.equal(validAffiliate(parsed[1]!), false);
  assert.equal(
    formatAffiliateLines([parsed[0]!]),
    'Book | https://example.com/b | compound interest, budget',
  );
  const home = await mkdtemp(join(tmpdir(), 'fc-affiliates-store-'));
  const store = new LocalStore(home);
  try {
    const saved = await store.saveChannel({ id: 'money', name: 'Canal sintético', affiliates: [parsed[0]] });
    assert.deepEqual(saved.affiliates, [parsed[0]]);
    for (const bad of [
      { ...parsed[0], url: 'http://example.com/b' },
      { ...parsed[0], terms: [] },
      { ...parsed[0], terms: ['x'] },
      { ...parsed[0], label: '' },
      { ...parsed[0], extra: true },
    ])
      await assert.rejects(store.saveChannel({ affiliates: [bad] }, 'money'), /afiliado|não permitidos/);
    await assert.rejects(store.saveChannel({ affiliates: Array(11).fill(parsed[0]) }, 'money'), /até 10/);
    const cleared = await store.saveChannel({ affiliates: [] }, 'money');
    assert.equal(cleared.affiliates, undefined);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a channel identity keeps a closed catalog and at most three distinct characters', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-identity-store-'));
  const store = new LocalStore(home);
  try {
    const saved = await store.saveChannel({
      id: 'tech',
      name: 'Canal sintético',
      identity: { body: 'green', shape: 'round', cast: [{ name: 'Bit', hat: 'cap' }] },
    });
    assert.deepEqual(saved.identity, { body: 'green', shape: 'round', cast: [{ name: 'Bit', hat: 'cap' }] });
    await assert.rejects(store.saveChannel({ identity: { body: 'neon' } }, 'tech'), /Cor do mascote/);
    await assert.rejects(store.saveChannel({ identity: { shape: 'star' } }, 'tech'), /Formato do mascote/);
    await assert.rejects(
      store.saveChannel({ identity: { cast: [{ name: 'Bit', hat: 'chapeu' }] } }, 'tech'),
      /Acessório/,
    );
    await assert.rejects(
      store.saveChannel({ identity: { cast: [{ name: 'Bit' }, { name: 'bit' }] } }, 'tech'),
      /mesmo nome/,
    );
    const four = ['A', 'B', 'C', 'D'].map((name) => ({ name }));
    await assert.rejects(store.saveChannel({ identity: { cast: four } }, 'tech'), /até 3/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('only a video that never reached a network is deleted, with its files', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-delete-'));
  const base = { channelId: 'tech', scriptId: 'script-one', createdAt: date, message: 'ok' };
  const failed = { status: 'failed', message: 'recusado', failedAt: date };
  const sent = { status: 'uploaded', postId: 'post', uploadedAt: date };
  await mkdir(join(home, 'production', 'jobs', 'tech', 'draft', 'output'), { recursive: true });
  await writeFile(join(home, 'production', 'jobs', 'tech', 'draft', 'output', 'final.mp4'), 'mp4');
  await writeFile(
    join(home, 'production', 'jobs.json'),
    JSON.stringify([
      { ...base, id: 'draft', status: 'completed', videoAvailable: true, publications: { tiktok: failed } },
      { ...base, id: 'review', status: 'needs_review', videoAvailable: false },
      { ...base, id: 'sent', status: 'completed', videoAvailable: true, publications: { youtube: sent } },
      {
        ...base,
        id: 'sending',
        status: 'completed',
        videoAvailable: true,
        publications: { youtube: { status: 'uploading', startedAt: date } },
      },
      { ...base, id: 'source', status: 'completed', videoAvailable: true },
      { ...base, id: 'cut', status: 'failed', videoAvailable: false, kind: 'short', sourceJobId: 'source' },
    ]),
  );
  let runner = await createRunner({ home, repositoryRoot: resolve('..'), readState: async () => state() });
  try {
    await assert.rejects(runner.remove('tech', 'sent'), /já foi enviado/);
    // A restart turns an interrupted upload into a failure, so it no longer counts as sent.
    await runner.remove('tech', 'sending');
    await assert.rejects(runner.remove('tech', 'source'), /exclua o Short antes/);
    await assert.rejects(runner.remove('science', 'draft'), /não encontrada|Canal/);
    await runner.remove('tech', 'draft');
    await assert.rejects(stat(join(home, 'production', 'jobs', 'tech', 'draft')), /ENOENT/);
    await runner.remove('tech', 'cut');
    await runner.remove('tech', 'source');
    await runner.remove('tech', 'review');
    await assert.rejects(runner.remove('tech', 'draft'), /não encontrada/);
    assert.deepEqual(
      (await runner.list('tech')).map((job) => job.id),
      ['sent'],
    );
    await runner.close();
    runner = await createRunner({ home, repositoryRoot: resolve('..'), readState: async () => state() });
    assert.deepEqual(
      (await runner.list('tech')).map((job) => job.id),
      ['sent'],
    );
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a video still in production keeps itself', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-delete-active-'));
  const runner = await createRunner({ home, repositoryRoot: resolve('..'), readState: async () => state() });
  try {
    const jobs = Reflect.get(runner, 'jobs') as { id: string; channelId: string; status: string }[];
    jobs.push({ id: 'busy', channelId: 'tech', status: 'running' });
    await assert.rejects(runner.remove('tech', 'busy'), /sendo produzido/);
    jobs[0].status = 'queued';
    await assert.rejects(runner.remove('tech', 'busy'), /sendo produzido/);
    jobs.length = 0;
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a Short that stopped runs its own part again, without splitting the video twice', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-retry-short-'));
  const input = state();
  input.scripts[0].format = 'long';
  const sourceOutput = join(home, 'production', 'jobs', 'tech', 'source', 'output', 'channels', 'tech');
  await mkdir(sourceOutput, { recursive: true });
  await writeFile(join(sourceOutput, 'storyboard.json'), '{}');
  const stale = join(home, 'production', 'jobs', 'tech', 'part-4', 'output', 'channels', 'tech');
  await mkdir(stale, { recursive: true });
  await writeFile(join(stale, 'pipeline_report.json'), '{"stage":"editorial_qa"}');
  const base = { channelId: 'tech', scriptId: 'script-one', createdAt: date };
  await writeFile(
    join(home, 'production', 'jobs.json'),
    JSON.stringify([
      {
        ...base,
        id: 'source',
        status: 'completed',
        message: 'ok',
        videoAvailable: true,
        engine: 'motion',
        shortsAt: date,
      },
      {
        ...base,
        id: 'part-4',
        status: 'failed',
        message: 'termo',
        videoAvailable: false,
        kind: 'short',
        sourceJobId: 'source',
        part: 4,
        parts: 5,
      },
    ]),
  );
  const calls: string[][] = [];
  let stalePresent = true;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      calls.push(args);
      const out = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      stalePresent = existsSync(join(out, 'pipeline_report.json'));
      await mkdir(join(out, 'render'), { recursive: true });
      await writeFile(join(out, 'render', 'final.mp4'), 'synthetic short');
      await writeFile(
        join(out, 'pipeline_report.json'),
        JSON.stringify({ stage: 'editorial_qa', technical_qa: { checks: [{ status: 'pass' }] } }),
      );
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
  try {
    await assert.rejects(runner.retryShort('tech', 'source'), /Só um Short que parou/);
    const queued = await runner.retryShort('tech', 'part-4');
    assert.equal(queued.status, 'queued');
    await assert.rejects(runner.retryShort('tech', 'part-4'), /Só um Short que parou/, 'two clicks, one run');
    await runner.idle();
    assert.equal(calls.length, 1, 'no new split: only the part runs');
    assert.equal(calls[0][calls[0].indexOf('--part') + 1], '4');
    assert.equal(stalePresent, false, 'the stopped run left no report behind');
    const done = (await runner.list('tech')).find((item) => item.id === 'part-4')!;
    assert.equal(done.status, 'completed', done.message);
    assert.equal(done.part, 4);
    await assert.rejects(runner.retryShort('tech', 'part-4'), /Só um Short que parou/);
    await assert.rejects(runner.startShorts('tech', 'source'), /já foram gerados/);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('a video that stopped runs again as-is, even when QA blocked a file that exists', async () => {
  const home = await mkdtemp(join(tmpdir(), 'framechester-web-retry-video-'));
  const input = state();
  const stale = join(home, 'production', 'jobs', 'tech', 'video-1', 'output', 'channels', 'tech');
  await mkdir(stale, { recursive: true });
  await writeFile(join(stale, 'pipeline_report.json'), '{"stage":"blocked"}');
  await writeFile(
    join(home, 'production', 'jobs.json'),
    JSON.stringify([
      {
        id: 'video-1',
        channelId: 'tech',
        scriptId: 'script-one',
        status: 'blocked',
        createdAt: date,
        message: 'pico de audio',
        videoAvailable: true,
        // A run of the removed still-image engine, whose scene file is long gone.
        engine: 'legacy',
        assetIds: { 42: 'visual-42' },
        burnSubtitles: true,
      },
    ]),
  );
  const calls: string[][] = [];
  let stalePresent = true;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve('..'),
    readState: async () => structuredClone(input),
    execute: async (args) => {
      calls.push(args);
      const out = join(args[args.indexOf('--workdir') + 1], 'channels', 'tech');
      stalePresent = existsSync(join(out, 'pipeline_report.json'));
      await mkdir(join(out, 'render'), { recursive: true });
      await writeFile(join(out, 'render', 'final.mp4'), 'synthetic video');
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
  });
  try {
    await assert.rejects(runner.retryShort('tech', 'video-1'), /Só um Short que parou/);
    const queued = await runner.retry('tech', 'video-1');
    assert.equal(queued.status, 'queued');
    await assert.rejects(runner.retry('tech', 'video-1'), /Só um vídeo que parou/, 'two clicks, one run');
    await runner.idle();
    assert.equal(calls.length, 1, 'the same job ran once more');
    assert.equal(calls[0][2], 'run');
    assert.equal(calls[0].includes('--preview-only'), false, 'a final version runs again as one');
    assert.equal(calls[0].includes('--burn-subtitles'), false);
    assert.equal(stalePresent, false, 'the blocked run left no report behind');
    const done = (await runner.list('tech')).find((item) => item.id === 'video-1')!;
    assert.equal(done.status, 'completed', done.message);
    assert.equal(done.videoAvailable, true);
    await assert.rejects(runner.retry('tech', 'video-1'), /Só um vídeo que parou/);
  } finally {
    await runner.close();
    await rm(home, { recursive: true, force: true });
  }
});
