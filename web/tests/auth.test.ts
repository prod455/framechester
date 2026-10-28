import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalAuth } from '../server/auth.ts';
import { HttpError } from '../server/auth.ts';

test('password setup persists only a derived secret and sessions stay in memory', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-auth-'));
  try {
    const auth = new LocalAuth(home);
    const initial = await auth.status();
    assert.equal(initial.status.configured, false);
    assert.equal(initial.status.authenticated, false);
    assert.ok(initial.status.csrfToken);
    await assert.rejects(auth.setup('synthetic password long enough', initial.cookie, 'wrong csrf'));
    const established = await auth.setup('synthetic password long enough', initial.cookie, initial.status.csrfToken);
    assert.equal(established.status.authenticated, true);
    assert.match(established.cookie, /HttpOnly/);
    assert.match(established.cookie, /SameSite=Strict/);
    const record = await readFile(join(home, 'auth.json'), 'utf8');
    assert.equal(record.includes('synthetic password long enough'), false);
    assert.ok(JSON.parse(record).hash);
    const restarted = new LocalAuth(home);
    const status = await restarted.status(established.cookie);
    assert.equal(status.status.configured, true);
    assert.equal(status.status.authenticated, false);
    await assert.rejects(restarted.login('wrong password for a local test', status.cookie, status.status.csrfToken));
    const loggedIn = await restarted.login('synthetic password long enough', status.cookie, status.status.csrfToken);
    assert.equal(loggedIn.status.authenticated, true);
    assert.notEqual(loggedIn.status.csrfToken, status.status.csrfToken);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('login rate limit applies before another password derivation', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-auth-rate-'));
  try {
    const auth = new LocalAuth(home); const initial = await auth.status();
    const setup = await auth.setup('synthetic password for throttling',initial.cookie,initial.status.csrfToken);
    const anonymous = await auth.logout(setup.cookie,setup.status.csrfToken);
    for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(auth.login('wrong synthetic password',anonymous.cookie,anonymous.status.csrfToken,'loopback'), error => error instanceof HttpError && error.status === 401);
    await assert.rejects(auth.login('synthetic password for throttling',anonymous.cookie,anonymous.status.csrfToken,'loopback'), error => error instanceof HttpError && error.status === 429);
  } finally { await rm(home,{recursive:true,force:true}); }
});
