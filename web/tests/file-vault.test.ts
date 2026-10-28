import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createFileVault } from '../server/file-vault.ts';
import { VaultError } from '../server/vault.ts';

const synthetic = 'synthetic-api-key-only-for-container-vault-tests';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fc-file-vault-')),
    directory = join(root, 'vault'),
    keyFile = join(root, 'master.key');
  await writeFile(keyFile, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  return {
    root,
    directory,
    keyFile,
    vault: createFileVault({ directory, keyFile }),
    record: join(directory, 'channels', 'tech', 'openai.aesgcm'),
    close: () => rm(root, { recursive: true, force: true }),
  };
}

test('file vault persists only ciphertext, survives reload, isolates scopes and uses fresh nonces', async () => {
  const f = await fixture();
  try {
    assert.equal(await f.vault.get('tech', 'openai'), null);
    await f.vault.set('tech', 'openai', synthetic);
    const first = await readFile(f.record, 'utf8');
    assert.equal(first.includes(synthetic), false);
    assert.equal(await f.vault.get('tech', 'openai'), synthetic);
    assert.equal(
      await createFileVault({ directory: f.directory, keyFile: f.keyFile }).get('tech', 'openai'),
      synthetic,
    );
    assert.equal(await f.vault.get('science', 'openai'), null);
    assert.equal(await f.vault.get('tech', 'anthropic'), null);
    await f.vault.set('tech', 'openai', synthetic);
    const second = await readFile(f.record, 'utf8');
    assert.notEqual(first, second);
    assert.notEqual(JSON.parse(first).nonce, JSON.parse(second).nonce);
    await f.vault.delete('tech', 'openai');
    assert.equal(await f.vault.get('tech', 'openai'), null);
  } finally {
    await f.close();
  }
});

test('file vault authenticates the key, channel, slot and encrypted envelope before returning a secret', async () => {
  const f = await fixture();
  try {
    await f.vault.set('tech', 'openai', synthetic);
    const original = await readFile(f.record, 'utf8');
    for (const mutation of [
      (value: Record<string, unknown>) => ({ ...value, tag: '0'.repeat(32) }),
      (value: Record<string, unknown>) => ({ ...value, nonce: '0'.repeat(24) }),
      (value: Record<string, unknown>) => ({ ...value, extra: synthetic }),
      (value: Record<string, unknown>) => ({ ...value, version: 2 }),
    ]) {
      await writeFile(f.record, JSON.stringify(mutation(JSON.parse(original))));
      await assert.rejects(
        f.vault.get('tech', 'openai'),
        (error) => error instanceof VaultError && !error.message.includes(synthetic),
      );
    }
    await writeFile(f.record, original);
    await mkdir(join(f.directory, 'channels', 'science'));
    await copyFile(f.record, join(f.directory, 'channels', 'science', 'openai.aesgcm'));
    await copyFile(f.record, join(f.directory, 'channels', 'tech', 'anthropic.aesgcm'));
    await assert.rejects(f.vault.get('science', 'openai'), VaultError);
    await assert.rejects(f.vault.get('tech', 'anthropic'), VaultError);
    await writeFile(f.keyFile, randomBytes(32).toString('hex'));
    await assert.rejects(f.vault.get('tech', 'openai'), VaultError);
    assert.equal(await readFile(f.record, 'utf8'), original);
  } finally {
    await f.close();
  }
});

test('file vault fails closed on missing, malformed or oversized master key without changing stored data', async () => {
  const f = await fixture();
  try {
    await f.vault.set('tech', 'openai', synthetic);
    const original = await readFile(f.record, 'utf8');
    for (const value of [
      '',
      synthetic,
      'f'.repeat(63),
      'f'.repeat(65),
      'a'.repeat(64) + '\0',
      'a'.repeat(129),
    ]) {
      await writeFile(f.keyFile, value);
      await assert.rejects(f.vault.get('tech', 'openai'), VaultError);
      await assert.rejects(f.vault.set('tech', 'openai', 'replacement-synthetic'), VaultError);
      await assert.rejects(f.vault.delete('tech', 'openai'), VaultError);
      assert.equal(await readFile(f.record, 'utf8'), original);
    }
    await rm(f.keyFile);
    await assert.rejects(f.vault.get('tech', 'openai'), VaultError);
    await assert.rejects(f.vault.delete('tech', 'openai'), VaultError);
    assert.equal(await readFile(f.record, 'utf8'), original);
  } finally {
    await f.close();
  }
});

test('file vault rejects unsafe scopes, excessive values and plaintext envelopes without DPAPI migration', async () => {
  const f = await fixture();
  try {
    for (const [owner, slot] of [
      ['../tech', 'openai'],
      ['tech', '../openai'],
      ['con', 'openai'],
      ['tech', 'nul'],
      ['tech', 'openai/key'],
      ['tech', 'openai\0'],
    ])
      await assert.rejects(f.vault.set(owner, slot, synthetic), VaultError);
    for (const value of ['', 'x'.repeat(65537)])
      await assert.rejects(f.vault.set('tech', 'openai', value), VaultError);
    await mkdir(join(f.directory, 'channels', 'tech'), { recursive: true });
    const dpapi = join(f.directory, 'channels', 'tech', 'openai.dpapi');
    await writeFile(dpapi, 'DPAPI-SYNTHETIC-UNCHANGED');
    await writeFile(f.record, JSON.stringify({ key: synthetic }));
    await assert.rejects(f.vault.get('tech', 'openai'), VaultError);
    await writeFile(f.record, 'x'.repeat(131073));
    await assert.rejects(f.vault.get('tech', 'openai'), VaultError);
    await rm(f.record);
    await f.vault.set('tech', 'openai', synthetic);
    assert.equal(await readFile(dpapi, 'utf8'), 'DPAPI-SYNTHETIC-UNCHANGED');
    assert.equal(
      (await readdir(join(f.directory, 'channels', 'tech'))).some((name) => name.endsWith('.tmp')),
      false,
    );
  } finally {
    await f.close();
  }
});

test('file vault refuses hard-linked keys or records and linked storage ancestors', async () => {
  const f = await fixture();
  try {
    await f.vault.set('tech', 'openai', synthetic);
    const original = await readFile(f.record, 'utf8');
    const keyAlias = join(f.root, 'alias.key');
    await link(f.keyFile, keyAlias);
    await assert.rejects(f.vault.get('tech', 'openai'), VaultError);
    await assert.rejects(f.vault.set('tech', 'openai', 'another-synthetic-key'), VaultError);
    await rm(keyAlias);
    const recordAlias = join(f.root, 'alias.aesgcm');
    await link(f.record, recordAlias);
    await assert.rejects(f.vault.get('tech', 'openai'), VaultError);
    await assert.rejects(f.vault.set('tech', 'openai', 'another-synthetic-key'), VaultError);
    await assert.rejects(f.vault.delete('tech', 'openai'), VaultError);
    assert.equal(await readFile(f.record, 'utf8'), original);
    await rm(recordAlias);
    const outside = join(f.root, 'outside');
    await mkdir(outside);
    const linked = join(f.root, 'linked');
    await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
    const other = createFileVault({ directory: join(linked, 'vault'), keyFile: f.keyFile });
    await assert.rejects(other.set('tech', 'openai', synthetic), VaultError);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await f.close();
  }
});

test(
  'file vault rejects writable-by-group master keys on POSIX while readonly Compose keys work',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await fixture();
    try {
      await chmod(f.keyFile, 0o644);
      await f.vault.set('tech', 'openai', synthetic);
      assert.equal(await f.vault.get('tech', 'openai'), synthetic);
      await chmod(f.keyFile, 0o666);
      await assert.rejects(f.vault.get('tech', 'openai'), VaultError);
      await assert.rejects(f.vault.delete('tech', 'openai'), VaultError);
    } finally {
      await f.close();
    }
  },
);

// Opt-in container integration fixture: this exact path must be mounted read-only
// with a synthetic 64-character hex key. It is never the Studio's real secret.
test(
  'file vault accepts a readonly filesystem secret with Windows-mapped writable permission bits',
  { skip: process.platform !== 'linux' || process.env.FRAMECHESTER_READONLY_VAULT_TEST !== '1' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'fc-readonly-vault-'));
    try {
      const keyInfo = await lstat('/run/secrets/file-vault-test.key');
      assert.ok(
        (keyInfo.mode & 0o022) !== 0,
        'The fixture needs writable permission bits to exercise the EROFS exception.',
      );
      await assert.rejects(
        open('/run/secrets/file-vault-test.key', 'r+'),
        (error) => !!error && typeof error === 'object' && 'code' in error && error.code === 'EROFS',
      );
      const vault = createFileVault({
        directory: join(root, 'vault'),
        keyFile: '/run/secrets/file-vault-test.key',
      });
      await vault.set('tech', 'openai', synthetic);
      assert.equal(await vault.get('tech', 'openai'), synthetic);
      await vault.delete('tech', 'openai');
      assert.equal(await vault.get('tech', 'openai'), null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
