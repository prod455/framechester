import type { AuthStatus } from '../shared/types.ts';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, open, rename, chmod, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type AuthView = AuthStatus & { csrfToken: string; needsSetup: boolean };
export interface AuthResult { status: AuthView; cookie: string }
interface PasswordRecord { version: 1; salt: string; hash: string }
interface Session { token: string; csrfToken: string; authenticated: boolean; createdAt: number; lastSeen: number }

export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2)); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally { await rm(temporary, { force: true }); }
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
function passwordText(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) {
    throw new HttpError(400, 'A senha deve ter entre 12 e 256 caracteres.');
  }
  return value;
}
function sameToken(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class LocalAuth {
  readonly ready: Promise<void>;
  private record?: PasswordRecord;
  private sessions = new Map<string, Session>();
  private attempts = new Map<string, number[]>();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly home: string) { this.ready = this.load(); }

  private async load(): Promise<void> {
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    try {
      const record = JSON.parse(await readFile(join(this.home, 'auth.json'), 'utf8')) as PasswordRecord;
      if (record.version !== 1 || !/^[a-f0-9]{64}$/.test(record.salt) || !/^[a-f0-9]{128}$/.test(record.hash)) throw new Error('invalid auth');
      this.record = record;
      await chmod(join(this.home, 'auth.json'), 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new HttpError(503, 'O arquivo de autenticação local está inválido.');
    }
  }
  private session(cookie?: string): Session | undefined {
    const token = cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('fc_session='))?.slice(11);
    const session = token ? this.sessions.get(token) : undefined;
    if (!session) return undefined;
    const now = Date.now();
    if (now - session.createdAt > 8 * 60 * 60_000 || now - session.lastSeen > (session.authenticated ? 30 : 15) * 60_000) {
      this.sessions.delete(session.token); return undefined;
    }
    session.lastSeen = now;
    return session;
  }
  private issue(authenticated: boolean): Session {
    if (this.sessions.size >= 1000) {
      const oldest = [...this.sessions.values()].find(session => !session.authenticated);
      if (oldest) this.sessions.delete(oldest.token);
      else throw new HttpError(429, 'Muitas sessões locais. Tente novamente mais tarde.');
    }
    const session: Session = { token: randomBytes(32).toString('base64url'), csrfToken: randomBytes(32).toString('base64url'), authenticated, createdAt: Date.now(), lastSeen: Date.now() };
    this.sessions.set(session.token, session); return session;
  }
  private result(session: Session): AuthResult {
    return {
      status: { configured: !!this.record, needsSetup: !this.record, authenticated: session.authenticated, csrfToken: session.csrfToken },
      cookie: `fc_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
    };
  }
  async status(cookie?: string): Promise<AuthResult> {
    await this.ready; return this.result(this.session(cookie) ?? this.issue(false));
  }
  async guard(cookie?: string, csrf?: string, requireAuthenticated = true, mutation = false): Promise<Session> {
    await this.ready;
    const session = this.session(cookie);
    if (!session || (requireAuthenticated && !session.authenticated)) throw new HttpError(401, 'Entre na sessão local para continuar.');
    if (mutation && (typeof csrf !== 'string' || !sameToken(csrf, session.csrfToken))) throw new HttpError(403, 'Token CSRF inválido; atualize a sessão.');
    return session;
  }
  async setup(password: unknown, cookie?: string, csrf?: string): Promise<AuthResult> {
    const anonymous = await this.guard(cookie, csrf, false, true);
    const text = passwordText(password);
    const operation = this.pending.then(async () => {
      if (this.record) throw new HttpError(409, 'A senha local já foi configurada.');
      const salt = randomBytes(32).toString('hex');
      const record: PasswordRecord = { version: 1, salt, hash: (await derive(text, salt)).toString('hex') };
      await writePrivateJson(join(this.home, 'auth.json'), record);
      this.record = record; this.sessions.delete(anonymous.token);
      return this.result(this.issue(true));
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
  async login(password: unknown, cookie?: string, csrf?: string, address = 'local'): Promise<AuthResult> {
    const anonymous = await this.guard(cookie, csrf, false, true);
    const now = Date.now();
    const attempts = (this.attempts.get(address) ?? []).filter(at => now - at < 15 * 60_000);
    if (attempts.length >= 5) throw new HttpError(429, 'Muitas tentativas de login; aguarde 15 minutos.');
    attempts.push(now); this.attempts.set(address, attempts);
    if (!this.record) throw new HttpError(409, 'Configure a senha local primeiro.');
    const hash = await derive(passwordText(password), this.record.salt);
    if (!timingSafeEqual(hash, Buffer.from(this.record.hash, 'hex'))) throw new HttpError(401, 'Senha local inválida.');
    this.attempts.delete(address); this.sessions.delete(anonymous.token);
    return this.result(this.issue(true));
  }
  async logout(cookie?: string, csrf?: string): Promise<AuthResult> {
    const session = await this.guard(cookie, csrf, true, true);
    this.sessions.delete(session.token); return this.result(this.issue(false));
  }
}
