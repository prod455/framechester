import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfiguration } from '../server/runtime.ts';
import { createApp } from '../server/app.ts';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('native Studio stays on loopback; container binding needs explicit mode and detection', () => {
  assert.equal(runtimeConfiguration({}).host, '127.0.0.1');
  assert.throws(() => runtimeConfiguration({ FRAMECHESTER_CONTAINER: '1' }), /contêiner|container/i);
  assert.throws(() => runtimeConfiguration({ FRAMECHESTER_WEB_PUBLIC_PORT: '4318' }), /contêiner|container/i);
  assert.throws(() => runtimeConfiguration({ FRAMECHESTER_CONTAINER: '1' }, true), /chave|cofre/i);
  const config = runtimeConfiguration(
    {
      FRAMECHESTER_CONTAINER: '1',
      FRAMECHESTER_VAULT_KEY_FILE: '/run/secrets/vault_key',
      FRAMECHESTER_WEB_PUBLIC_PORT: '4318',
    },
    true,
  );
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.publicPort, 4318);
  assert.equal(config.vaultKeyFile, '/run/secrets/vault_key');
  assert.throws(
    () =>
      runtimeConfiguration(
        {
          FRAMECHESTER_CONTAINER: '1',
          FRAMECHESTER_VAULT_KEY_FILE: '/key',
          FRAMECHESTER_WEB_PUBLIC_PORT: 'bad-private-value',
        },
        true,
      ),
    (error) => error instanceof Error && !error.message.includes('bad-private-value'),
  );
});

test('health is minimal and public on allowed hosts; mapped container port preserves auth and Origin checks', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-health-'));
  const app = await createApp({ home, publicPort: 4318 });
  const server = createServer(app.handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  const url = `http://127.0.0.1:${addr.port}`;
  try {
    const rawStatus = (host: string) =>
      new Promise<number>((resolve, reject) => {
        const req = httpRequest(url + '/healthz', { headers: { Host: host } }, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
    const health = await fetch(url + '/healthz');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal(health.headers.get('set-cookie'), null);
    assert.equal(await rawStatus('127.0.0.1:4318'), 200);
    assert.equal(await rawStatus('foreign.example:4318'), 403);
    assert.equal(
      (
        await fetch(url + '/api/bootstrap', {
          headers: { Host: '127.0.0.1:4318', Origin: 'http://127.0.0.1:4318' },
        })
      ).status,
      401,
    );
    assert.equal(
      (await fetch(url + '/healthz', { headers: { Origin: 'https://foreign.example' } })).status,
      403,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test('a Tailscale name lets the phone in through tailscale serve; public names stay refused', async () => {
  assert.equal(runtimeConfiguration({}).tailnetHost, undefined);
  assert.equal(
    runtimeConfiguration({ FRAMECHESTER_TAILNET_HOST: ' Meu-PC.tail1234.ts.net ' }).tailnetHost,
    'meu-pc.tail1234.ts.net',
  );
  assert.equal(
    runtimeConfiguration({ FRAMECHESTER_TAILNET_HOST: 'meu-pc.tail1234.ts.net' }).host,
    '127.0.0.1',
  );
  for (const value of [
    'framechester.com',
    'ts.net',
    'meu-pc.ts.net.evil.com',
    'http://meu-pc.tail1234.ts.net',
  ])
    assert.throws(() => runtimeConfiguration({ FRAMECHESTER_TAILNET_HOST: value }), /\.ts\.net/, value);

  const home = await mkdtemp(join(tmpdir(), 'fc-tailnet-'));
  const app = await createApp({ home, tailnetHost: 'meu-pc.tail1234.ts.net' });
  const server = createServer(app.handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  const status = (host: string, origin?: string, method = 'GET', path = '/healthz') =>
    new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        `http://127.0.0.1:${addr.port}${path}`,
        { method, headers: { Host: host, ...(origin ? { Origin: origin } : {}) } },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
  try {
    assert.equal(await status('meu-pc.tail1234.ts.net'), 200);
    assert.equal(await status('meu-pc.tail1234.ts.net', 'https://meu-pc.tail1234.ts.net'), 200);
    assert.equal(await status('meu-pc.tail1234.ts.net', 'http://meu-pc.tail1234.ts.net'), 403, 'HTTPS only');
    assert.equal(await status('outro-pc.tail1234.ts.net'), 403);
    assert.equal(
      await status('meu-pc.tail1234.ts.net', 'https://meu-pc.tail1234.ts.net', 'GET', '/api/bootstrap'),
      401,
      'the password still applies',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test('TikTok logins return through the public relay unless the operator chooses loopback or their own page', () => {
  assert.equal(runtimeConfiguration({}).tiktokRelay, 'https://prod455.github.io/framechester/oauth/tiktok/');
  assert.equal(runtimeConfiguration({ FRAMECHESTER_TIKTOK_REDIRECT_URI: 'loopback' }).tiktokRelay, undefined);
  assert.equal(
    runtimeConfiguration({ FRAMECHESTER_TIKTOK_REDIRECT_URI: 'https://me.github.io/fc/oauth/tiktok/' })
      .tiktokRelay,
    'https://me.github.io/fc/oauth/tiktok/',
  );
  for (const value of ['http://me.github.io/x/', 'https://me.github.io/x/?a=1', 'not a url'])
    assert.throws(() => runtimeConfiguration({ FRAMECHESTER_TIKTOK_REDIRECT_URI: value }), /HTTPS/, value);
});
