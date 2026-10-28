import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalVault } from '../server/vault.ts';

test(
  'Windows DPAPI stores only ciphertext and recovers a synthetic secret for its channel',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'framechester-vault-system-'));
    const vault = createLocalVault({ directory });
    const fixture = 'synthetic-local-test-not-a-real-platform-token';
    try {
      await vault.set('tech', 'youtube', fixture);
      assert.equal(await vault.get('tech', 'youtube'), fixture);
      assert.equal(await vault.get('science', 'youtube'), null);
      const ciphertext = await readFile(join(directory, 'channels', 'tech', 'youtube.dpapi'), 'utf8');
      assert.equal(ciphertext.includes(fixture), false);
      await vault.delete('tech', 'youtube');
      assert.equal(await vault.get('tech', 'youtube'), null);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
