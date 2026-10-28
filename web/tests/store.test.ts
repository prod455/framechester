import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalStore } from '../server/store.ts';

test('a new installation selects only the reviewed Kokoro commercial voice and preserves its settings', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-voice-config-'));
  try {
    const store = new LocalStore(home);
    const initial = await store.read();
    assert.equal(initial.config.tts.engine, 'kokoro');
    assert.match(initial.config.tts.voiceModel, /kokoro-v1.0.onnx$/);
    assert.equal(initial.config.tts.voiceName, 'pf_dora');
    await store.update((state) => {
      state.config.render.width = 720;
    });
    assert.equal((await new LocalStore(home).read()).config.tts.voiceName, 'pf_dora');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('concurrent local updates retain both channels and survive reload', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-store-'));
  try {
    const store = new LocalStore(home);
    const initial = await store.read();
    assert.equal(initial.config.dryRun, true);
    assert.equal(initial.config.telemetry, false);
    const now = new Date().toISOString();
    await Promise.all(
      ['tech', 'science'].map((id) =>
        store.update((state) => {
          state.channels.push({
            id,
            name: id,
            description: '',
            niche: '',
            audience: '',
            language: 'pt-BR',
            createdAt: now,
            updatedAt: now,
          });
        }),
      ),
    );
    const restarted = new LocalStore(home);
    assert.deepEqual((await restarted.read()).channels.map((channel) => channel.id).sort(), [
      'science',
      'tech',
    ]);
    await assert.rejects(
      store.update((state) => {
        state.config.dryRun = false as true;
      }),
    );
    assert.equal((await store.read()).config.dryRun, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('legacy Piper profiles migrate to commercial voices without changing channel or render settings', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-voice-migration-'));
  try {
    const initial = await new LocalStore(home).read();
    initial.config.render.width = 720;
    initial.config.tts = {
      piperPath: 'synthetic-piper',
      voiceModel: 'synthetic-faber.onnx',
      voiceName: 'pt_BR-faber-medium',
    };
    await writeFile(join(home, 'state.json'), JSON.stringify(initial));
    const migrated = await new LocalStore(home).read();
    assert.equal(migrated.config.render.width, 720);
    assert.equal(migrated.config.tts.engine, 'kokoro');
    assert.equal(migrated.config.tts.voiceName, 'pf_dora');
    assert.match(migrated.config.tts.voiceModel, /kokoro-v1.0.onnx$/);
    assert.deepEqual(migrated.channels, initial.channels);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
