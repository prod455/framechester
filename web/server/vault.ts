export interface SecretVault {
  get(channelId: string, slot: string): Promise<string | null>;
  set(channelId: string, slot: string, value: string): Promise<void>;
  delete(channelId: string, slot: string): Promise<void>;
}

export type VaultCommandRunner = (mode: 'protect' | 'unprotect', input: string) => Promise<string>;
export interface LocalVaultOptions {
  directory: string;
  platform?: NodeJS.Platform;
  run?: VaultCommandRunner;
}

export class VaultError extends Error {
  constructor(message = 'Cofre do sistema indisponível; nenhum segredo foi salvo em texto puro.') {
    super(message);
    this.name = 'VaultError';
  }
}

const LIMIT = 128 * 1024;

const PS_PREFIX = `$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.Security;`;
const PS_SCRIPTS = {
  protect: `${PS_PREFIX}$value=[Console]::In.ReadToEnd();$bytes=[Text.Encoding]::UTF8.GetBytes($value);$sealed=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Convert]::ToBase64String($sealed));`,
  unprotect: `${PS_PREFIX}$value=[Console]::In.ReadToEnd();$bytes=[Convert]::FromBase64String($value);$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Text.Encoding]::UTF8.GetString($plain));`,
};

/** Commands contain only static code; credential material travels through stdin. */
const runDpapi: VaultCommandRunner = (mode, input) =>
  new Promise((resolve, reject) => {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(
      executable,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PS_SCRIPTS[mode]],
      {
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const fail = () => {
      if (!settled) {
        settled = true;
        reject(new VaultError());
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      fail();
    }, 10000);
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > LIMIT) {
        child.kill();
        fail();
      } else {
        chunks.push(chunk);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      if (code !== 0) {
        fail();
        return;
      }
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.end(input, 'utf8');
  });

class LocalVault implements SecretVault {
  private readonly directory: string;
  private readonly platform: NodeJS.Platform;
  private readonly run: VaultCommandRunner;

  constructor(options: LocalVaultOptions) {
    this.directory = path.resolve(options.directory);
    this.platform = options.platform ?? process.platform;
    this.run = options.run ?? runDpapi;
  }

  private scope(channelId: string, slot: string): string {
    const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
    if (
      !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(channelId) ||
      reserved.test(channelId) ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(slot) ||
      reserved.test(slot)
    ) {
      throw new VaultError('Identidade de canal ou rede inválida para o cofre.');
    }
    return `${channelId}/${slot}`;
  }

  private supported(): void {
    if (this.platform !== 'win32')
      throw new VaultError(
        'Cofre indisponível neste sistema. Configure um gerenciador de segredos suportado; não há fallback em texto puro.',
      );
  }

  private async filename(channelId: string, slot: string, create: boolean): Promise<string | null> {
    this.scope(channelId, slot);
    const parents = [
      this.directory,
      path.join(this.directory, 'channels'),
      path.join(this.directory, 'channels', channelId),
    ];
    for (const directory of parents) {
      if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
      try {
        const info = await lstat(directory);
        if (info.isSymbolicLink() || !info.isDirectory()) throw new VaultError();
      } catch (error) {
        if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new VaultError();
      }
    }
    const filename = path.join(parents[2], `${slot}.dpapi`);
    try {
      const info = await lstat(filename);
      if (info.isSymbolicLink() || !info.isFile() || info.nlink > 1 || info.size > LIMIT)
        throw new VaultError();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new VaultError();
    }
    return filename;
  }

  async get(channelId: string, slot: string): Promise<string | null> {
    const filename = await this.filename(channelId, slot, false);
    if (!filename) return null;
    let ciphertext: string;
    try {
      ciphertext = await readFile(filename, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new VaultError();
    }
    this.supported();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext) || ciphertext.length > LIMIT) throw new VaultError();
    try {
      const envelope: unknown = JSON.parse(await this.run('unprotect', ciphertext));
      if (
        !envelope ||
        typeof envelope !== 'object' ||
        !('scope' in envelope) ||
        !('value' in envelope) ||
        envelope.scope !== this.scope(channelId, slot) ||
        typeof envelope.value !== 'string'
      )
        throw new VaultError();
      return envelope.value;
    } catch {
      throw new VaultError();
    }
  }

  async set(channelId: string, slot: string, value: string): Promise<void> {
    const scope = this.scope(channelId, slot);
    this.supported();
    if (typeof value !== 'string' || !value || Buffer.byteLength(value) > LIMIT / 2) throw new VaultError();
    let ciphertext: string;
    try {
      ciphertext = await this.run('protect', JSON.stringify({ scope, value }));
    } catch {
      throw new VaultError();
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext) || ciphertext.length > LIMIT) throw new VaultError();
    const filename = await this.filename(channelId, slot, true);
    if (!filename) throw new VaultError();
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, ciphertext, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temporary, filename);
    } catch {
      throw new VaultError();
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async delete(channelId: string, slot: string): Promise<void> {
    const filename = await this.filename(channelId, slot, false);
    if (filename) {
      try {
        await unlink(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new VaultError();
      }
    }
  }
}

export function createLocalVault(options: LocalVaultOptions): SecretVault {
  return new LocalVault(options);
}
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
