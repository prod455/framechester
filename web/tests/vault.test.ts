import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLocalVault, VaultError } from '../server/vault.ts';

test('vault persists only protector output and isolates channel/network records', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fc-vault-'));
  try {
    const values = new Map<string, string>();
    const vault = createLocalVault({
      directory,
      platform: 'win32',
      run: async (mode, value) => {
        if (mode === 'protect') {
          const ciphertext = Buffer.from(`cipher-${values.size}`).toString('base64');
          values.set(ciphertext, value);
          return ciphertext;
        }
        assert.ok(values.has(value));
        return values.get(value)!;
      },
    });
    assert.equal(await vault.get('tech', 'youtube'), null);
    await vault.set('tech', 'youtube', 'fixture-access-token');
    assert.equal(await vault.get('tech', 'youtube'), 'fixture-access-token');
    assert.equal(await vault.get('science', 'youtube'), null);
    assert.equal(await vault.get('tech', 'instagram'), null);
    const stored = await readFile(path.join(directory, 'channels', 'tech', 'youtube.dpapi'), 'utf8');
    assert.ok(!stored.includes('fixture-access-token'));
    await vault.delete('tech', 'youtube');
    assert.equal(await vault.get('tech', 'youtube'), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unsupported operating system has no plaintext fallback', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fc-vault-unavailable-'));
  try {
    const vault = createLocalVault({ directory, platform: 'linux' });
    await assert.rejects(vault.set('tech', 'youtube', 'fixture-secret'), VaultError);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed protection and unsafe scope never create credential files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fc-vault-invalid-'));
  try {
    const vault = createLocalVault({
      directory,
      platform: 'win32',
      run: async () => {
        throw Error('fixture-secret');
      },
    });
    await assert.rejects(vault.set('../other', 'youtube', 'fixture-secret'), VaultError);
    await assert.rejects(vault.set('tech', '../youtube', 'fixture-secret'), VaultError);
    await assert.rejects(
      vault.set('tech', 'youtube', 'fixture-secret'),
      (error: Error) => !error.message.includes('fixture-secret'),
    );
    const files = await readdir(directory, { recursive: true });
    assert.ok(!files.some((file) => String(file).endsWith('.dpapi')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing plaintext is never accepted as a protected secret', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fc-vault-plaintext-'));
  try {
    const parent = path.join(directory, 'channels', 'tech');
    await mkdir(parent, { recursive: true });
    await writeFile(path.join(parent, 'youtube.dpapi'), '{"accessToken":"fixture-secret"}');
    const vault = createLocalVault({
      directory,
      platform: 'win32',
      run: async () => {
        throw Error('invalid ciphertext');
      },
    });
    await assert.rejects(vault.get('tech', 'youtube'), VaultError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('moving a protected envelope to another channel does not change its binding', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fc-vault-binding-'));
  try {
    let envelope = '';
    const vault = createLocalVault({
      directory,
      platform: 'win32',
      run: async (mode, value) => {
        if (mode === 'protect') {
          envelope = value;
          return 'Y2lwaGVy';
        }
        return envelope;
      },
    });
    await vault.set('tech', 'youtube', 'fixture-token');
    await mkdir(path.join(directory, 'channels', 'science'), { recursive: true });
    await copyFile(
      path.join(directory, 'channels', 'tech', 'youtube.dpapi'),
      path.join(directory, 'channels', 'science', 'youtube.dpapi'),
    );
    await assert.rejects(vault.get('science', 'youtube'), VaultError);
    assert.equal(await vault.get('tech', 'youtube'), 'fixture-token');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
