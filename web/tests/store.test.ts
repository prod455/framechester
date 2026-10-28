import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalStore } from '../server/store.ts';

test('a new installation leaves voice selection to the operator rather than assuming commercial rights', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-voice-config-'));
  try {
    const store = new LocalStore(home);
    const initial = await store.read();
    assert.equal(initial.config.tts.voiceModel, '');
    assert.equal(initial.config.tts.voiceName, 'voz-local');
    await store.update(state => { state.config.render.width = 720; });
    assert.equal((await new LocalStore(home).read()).config.tts.voiceModel, '');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('concurrent local updates retain both channels and survive reload', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-store-'));
  try {
    const store = new LocalStore(home);
    const initial = await store.read();
    assert.equal(initial.config.dryRun, true);
    assert.equal(initial.config.telemetry, false);
    const now = new Date().toISOString();
    await Promise.all(['tech', 'science'].map(id => store.update(state => {
      state.channels.push({ id, name: id, description: '', niche: '', audience: '', language: 'pt-BR', createdAt: now, updatedAt: now });
    })));
    const restarted = new LocalStore(home);
    assert.deepEqual((await restarted.read()).channels.map(channel => channel.id).sort(), ['science', 'tech']);
    await assert.rejects(store.update(state => { state.config.dryRun = false as true; }));
    assert.equal((await store.read()).config.dryRun, true);
  } finally { await rm(home, { recursive: true, force: true }); }
});
