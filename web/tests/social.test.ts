import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSocialService } from '../server/social.ts';
import type { SocialFetch } from '../server/social.ts';
import type { SecretVault } from '../server/vault.ts';
import { mp4Fixture } from './mp4-fixture.ts';

const MP4 = mp4Fixture();
const MP4_TEXT = new TextDecoder().decode(MP4);

const ACCOUNT = `UC${'a'.repeat(22)}`;
const OTHER = `UC${'b'.repeat(22)}`;
const READ = 'https://www.googleapis.com/auth/youtube.readonly';
const MONEY = 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly';
const ANALYTICS = 'https://www.googleapis.com/auth/yt-analytics.readonly';
const NOW = Date.parse('2026-10-27T12:00:00Z');

class MemoryVault implements SecretVault {
  values = new Map<string, string>();
  async get(channel: string, slot: string) {
    return this.values.get(`${channel}/${slot}`) ?? null;
  }
  async set(channel: string, slot: string, value: string) {
    this.values.set(`${channel}/${slot}`, value);
  }
  async delete(channel: string, slot: string) {
    this.values.delete(`${channel}/${slot}`);
  }
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function youtubeFetch(
  options: { moneyScope?: boolean; account?: string; monetaryError?: number; refreshAccount?: string } = {},
): SocialFetch {
  return async (raw, init) => {
    const url = new URL(raw);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.searchParams.has('access_token'), false);
    assert.equal(init?.redirect, 'error');
    if (url.pathname === '/tokeninfo')
      return json({
        scope: [READ, ANALYTICS, ...(options.moneyScope === false ? [] : [MONEY])].join(' '),
        expires_in: 3600,
        aud: 'fixture.apps.googleusercontent.com',
      });
    if (url.pathname === '/token')
      return json({ access_token: 'fixture-refreshed', refresh_token: 'fixture-refresh', expires_in: 3600 });
    if (url.pathname === '/youtube/v3/channels')
      return json({
        items: [
          {
            id: options.account ?? ACCOUNT,
            snippet: { title: 'Fixture channel' },
            statistics: { subscriberCount: '123' },
          },
        ],
      });
    if (url.pathname === '/v2/reports') {
      assert.equal(url.searchParams.get('ids'), `channel==${ACCOUNT}`);
      assert.equal(url.searchParams.get('startDate'), '2026-09-29');
      assert.equal(url.searchParams.get('endDate'), '2026-10-26');
      if (url.searchParams.get('metrics') === 'estimatedRevenue') {
        assert.equal(url.searchParams.get('currency'), 'BRL');
        if (options.monetaryError)
          return json({ error: { message: 'fixture-access-token' } }, options.monetaryError);
        return json({ columnHeaders: [{ name: 'estimatedRevenue' }], rows: [[12.345]] });
      }
      return json({
        columnHeaders: [{ name: 'estimatedMinutesWatched' }, { name: 'views' }, { name: 'likes' }],
        rows: [[60, 1000, 25]],
      });
    }
    throw Error('Unexpected API endpoint');
  };
}

test('capabilities cover four networks honestly and every one of them receives the approved video', () => {
  const service = createSocialService({ vault: new MemoryVault(), fetch: youtubeFetch(), now: () => NOW });
  const capabilities = service.capabilities();
  assert.equal(capabilities.length, 4);
  assert.deepEqual(
    capabilities.filter((item) => item.publishingAvailable).map((item) => item.platform),
    ['youtube', 'tiktok', 'instagram', 'facebook'],
  );
  assert.ok(capabilities.every((item) => item.connectionMethod === 'oauth'));
  assert.deepEqual(
    capabilities.filter((item) => item.revenueAvailable).map((item) => item.platform),
    ['youtube'],
  );
});

test('token binding rejects a different YouTube account before saving any credential', async () => {
  const vault = new MemoryVault();
  const service = createSocialService({ vault, fetch: youtubeFetch({ account: OTHER }), now: () => NOW });
  await assert.rejects(
    service.connectToken({
      channelId: 'tech',
      platform: 'youtube',
      accountId: ACCOUNT,
      accessToken: 'fixture-access-token',
    }),
  );
  assert.equal(vault.values.size, 0);
});

test('YouTube sync obtains real report estimates, separate from payments, for a closed window', async () => {
  const service = createSocialService({ vault: new MemoryVault(), fetch: youtubeFetch(), now: () => NOW });
  const connection = await service.connectToken({
    channelId: 'tech',
    platform: 'youtube',
    accountId: ACCOUNT,
    accessToken: 'fixture-access-token',
    scopes: ['invented-scope'],
  });
  assert.ok(connection.scopes.includes(MONEY));
  assert.ok(!JSON.stringify(connection).includes('fixture-access-token'));
  const snapshot = await service.sync('tech', 'youtube');
  assert.equal(snapshot.stats.views, 1000);
  assert.equal(snapshot.stats.watchMinutes, 60);
  assert.equal(snapshot.stats.followers, 123);
  assert.equal(snapshot.revenue.estimatedCents, 1235);
  assert.equal(snapshot.revenue.paidCents, null);
  assert.equal(snapshot.revenue.currency, 'BRL');
  assert.equal(snapshot.revenue.availability, 'available');
  const other = await service.listConnections('science');
  assert.ok(other.every((item) => item.status === 'disconnected'));
});

test('missing monetary scope is explicit and never becomes fabricated zero revenue', async () => {
  const service = createSocialService({
    vault: new MemoryVault(),
    fetch: youtubeFetch({ moneyScope: false }),
    now: () => NOW,
  });
  await service.connectToken({
    channelId: 'tech',
    platform: 'youtube',
    accountId: ACCOUNT,
    accessToken: 'fixture-access-token',
  });
  const snapshot = await service.sync('tech', 'youtube');
  assert.equal(snapshot.revenue.availability, 'missing_scope');
  assert.equal(snapshot.revenue.estimatedCents, null);
  assert.equal(snapshot.revenue.paidCents, null);
});

test('provider errors do not disclose token material or assert unavailable income is zero', async () => {
  const service = createSocialService({
    vault: new MemoryVault(),
    fetch: youtubeFetch({ monetaryError: 403 }),
    now: () => NOW,
  });
  await service.connectToken({
    channelId: 'tech',
    platform: 'youtube',
    accountId: ACCOUNT,
    accessToken: 'fixture-access-token',
  });
  const snapshot = await service.sync('tech', 'youtube');
  assert.equal(snapshot.revenue.estimatedCents, null);
  assert.equal(snapshot.revenue.availability, 'unavailable');
  assert.ok(!JSON.stringify(snapshot).includes('fixture-access-token'));
});

test('OAuth uses PKCE, binds account and channel, and consumes state only once', async () => {
  const vault = new MemoryVault();
  let verifier = '';
  const upstream = youtubeFetch();
  const service = createSocialService({
    vault,
    now: () => NOW,
    fetch: async (url, init) => {
      if (new URL(url).pathname === '/token')
        verifier = new URLSearchParams(String(init?.body)).get('code_verifier') ?? '';
      return upstream(url, init);
    },
  });
  const result = await service.startOAuth({
    platform: 'youtube',
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  const url = new URL(result.authorizationUrl);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('scope')?.includes(MONEY));
  assert.ok(!result.authorizationUrl.includes('fixture-client-secret'));
  const state = url.searchParams.get('state')!;
  const connection = await service.callbackOAuth('youtube', { state, code: 'fixture-code' });
  assert.equal(connection.channelId, 'tech');
  assert.equal(connection.accountId, ACCOUNT);
  assert.equal(
    createHash('sha256').update(verifier).digest('base64url'),
    url.searchParams.get('code_challenge'),
  );
  await assert.rejects(service.callbackOAuth('youtube', { state, code: 'fixture-code' }));
  assert.ok(!JSON.stringify(connection).includes('fixture-client-secret'));
  await service.disconnect('tech', 'youtube');
  assert.equal(vault.values.size, 0);
});

test('OAuth rejects unsafe callback destinations before saving credentials or fetching', async () => {
  const vault = new MemoryVault();
  const service = createSocialService({
    vault,
    fetch: async () => {
      throw Error('network must not run');
    },
  });
  for (const redirectUri of [
    'https://example.com/api/oauth/youtube/callback',
    'http://127.0.0.1:4317/other',
    'http://localhost.evil.test:4317/api/oauth/youtube/callback',
  ]) {
    await assert.rejects(
      service.startOAuth({
        platform: 'youtube',
        channelId: 'tech',
        accountId: ACCOUNT,
        clientId: 'fixture-client',
        clientSecret: 'fixture-client-secret',
        redirectUri,
      }),
    );
  }
  assert.equal(vault.values.size, 0);
});

test('TikTok, Instagram and Facebook read authorized account counters with no invented revenue', async () => {
  const fetcher: SocialFetch = async (raw, init) => {
    assert.equal(new URL(raw).searchParams.has('access_token'), false);
    assert.equal(init?.method ?? 'GET', 'GET');
    const url = new URL(raw);
    if (url.hostname === 'open.tiktokapis.com')
      return json({
        data: {
          user: {
            open_id: 'fixture-tiktok',
            display_name: 'Fixture TikTok',
            follower_count: 45,
            likes_count: 80,
          },
        },
        error: { code: 'ok' },
      });
    if (url.pathname.endsWith('/me/accounts'))
      return json({ data: [{ id: '123', instagram_business_account: { id: '456' } }] });
    if (url.pathname.endsWith('/456'))
      return json({ id: '456', username: 'fixture-instagram', followers_count: 70, media_count: 4 });
    if (url.pathname.endsWith('/me'))
      return json({ id: '123', name: 'Fixture Page', followers_count: 90, fan_count: 84 });
    throw Error('Unexpected endpoint');
  };
  const service = createSocialService({ vault: new MemoryVault(), fetch: fetcher, now: () => NOW });
  for (const [platform, accountId, followers] of [
    ['tiktok', 'fixture-tiktok', 45],
    ['instagram', '456', 70],
    ['facebook', '123', 90],
  ] as const) {
    await service.connectToken({ channelId: 'tech', platform, accountId, accessToken: 'fixture-token' });
    const snapshot = await service.sync('tech', platform);
    assert.equal(snapshot.stats.followers, followers);
    assert.equal(snapshot.stats.views, null);
    assert.equal(snapshot.revenue.estimatedCents, null);
    assert.equal(snapshot.revenue.paidCents, null);
    assert.equal(snapshot.revenue.availability, 'unavailable');
  }
});

test('expired OAuth state is rejected without contacting the token endpoint', async () => {
  let now = NOW;
  let requests = 0;
  const service = createSocialService({
    vault: new MemoryVault(),
    now: () => now,
    fetch: async () => {
      requests++;
      throw Error('No network expected');
    },
  });
  const result = await service.startOAuth({
    platform: 'youtube',
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  now += 11 * 60 * 1000;
  await assert.rejects(
    service.callbackOAuth('youtube', {
      state: new URL(result.authorizationUrl).searchParams.get('state')!,
      code: 'fixture-code',
    }),
  );
  assert.equal(requests, 0);
});

test('OAuth callback account mismatch and cross-channel credential copies fail closed', async () => {
  const vault = new MemoryVault();
  const service = createSocialService({ vault, fetch: youtubeFetch({ account: OTHER }), now: () => NOW });
  const result = await service.startOAuth({
    platform: 'youtube',
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  await assert.rejects(
    service.callbackOAuth('youtube', {
      state: new URL(result.authorizationUrl).searchParams.get('state')!,
      code: 'fixture-code',
    }),
  );
  assert.equal(await vault.get('tech', 'youtube'), null);
  const valid = createSocialService({ vault, fetch: youtubeFetch(), now: () => NOW });
  await valid.connectToken({
    channelId: 'tech',
    platform: 'youtube',
    accountId: ACCOUNT,
    accessToken: 'fixture-access-token',
  });
  await vault.set('science', 'youtube', (await vault.get('tech', 'youtube'))!);
  await assert.rejects(valid.sync('science', 'youtube'));
});

test('failed identity verification after refresh preserves the previous protected token', async () => {
  let now = NOW;
  let account = ACCOUNT;
  const vault = new MemoryVault();
  const service = createSocialService({
    vault,
    now: () => now,
    fetch: (url, init) => youtubeFetch({ account })(url, init),
  });
  const result = await service.startOAuth({
    platform: 'youtube',
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  await service.callbackOAuth('youtube', {
    state: new URL(result.authorizationUrl).searchParams.get('state')!,
    code: 'fixture-code',
  });
  const original = await vault.get('tech', 'youtube');
  now += 3601 * 1000;
  account = OTHER;
  await assert.rejects(service.sync('tech', 'youtube'));
  assert.equal(await vault.get('tech', 'youtube'), original);
});

test('niche discovery performs bounded official search only when explicitly invoked', async () => {
  let searches = 0;
  let videoQueries = 0;
  const fallback = youtubeFetch();
  const service = createSocialService({
    vault: new MemoryVault(),
    now: () => NOW,
    fetch: async (raw, init) => {
      const url = new URL(raw);
      if (url.pathname === '/youtube/v3/search') {
        searches++;
        assert.equal(url.searchParams.get('q'), 'ciência aplicada');
        assert.equal(url.searchParams.get('maxResults'), '8');
        assert.equal(url.searchParams.get('type'), 'video');
        return json({
          items: [
            {
              id: { videoId: 'abcDEFgh_12' },
              snippet: {
                title: 'Fixture discovery',
                channelTitle: 'Fixture publisher',
                publishedAt: '2026-10-01T12:00:00Z',
              },
            },
          ],
        });
      }
      if (url.pathname === '/youtube/v3/videos') {
        videoQueries++;
        assert.equal(url.searchParams.get('part'), 'statistics,contentDetails');
        return json({ items: [{ id: 'abcDEFgh_12', statistics: { viewCount: '100', commentCount: '0' } }] });
      }
      return fallback(raw, init);
    },
  });
  await service.connectToken({
    channelId: 'tech',
    platform: 'youtube',
    accountId: ACCOUNT,
    accessToken: 'fixture-access-token',
  });
  assert.equal(searches, 0);
  const result = await service.discoverYoutube('tech', '  ciência aplicada  ');
  assert.equal(searches, 1);
  assert.equal(videoQueries, 1);
  assert.equal(result.source, 'youtube_data_api');
  assert.equal(result.items[0].views, 100);
  assert.equal(result.items[0].likes, null);
  assert.equal(result.items[0].comments, 0);
  assert.equal(result.items[0].url, 'https://www.youtube.com/watch?v=abcDEFgh_12');
  await assert.rejects(service.discoverYoutube('tech', 'x'));
  assert.equal(searches, 1);
});

test('oversized upstream response and malformed protected client config expose no private error text', async () => {
  const bounded = createSocialService({
    vault: new MemoryVault(),
    fetch: async () =>
      new Response('{"secret":"fixture-token"}', { headers: { 'content-length': '999999' } }),
  });
  await assert.rejects(
    bounded.connectToken({
      channelId: 'tech',
      platform: 'youtube',
      accountId: ACCOUNT,
      accessToken: 'fixture-token',
    }),
    (error: Error) => !error.message.includes('fixture-token'),
  );
  const vault = new MemoryVault();
  const service = createSocialService({ vault, fetch: youtubeFetch(), now: () => NOW });
  const result = await service.startOAuth({
    platform: 'youtube',
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  await vault.set('tech', 'youtube-client', 'fixture-client-secret');
  await assert.rejects(
    service.callbackOAuth('youtube', {
      state: new URL(result.authorizationUrl).searchParams.get('state')!,
      code: 'fixture-code',
    }),
    (error: Error) => error.name === 'SocialError' && !error.message.includes('fixture-cl'),
  );
});

test('refresh does not invent scopes or expiration when the provider omits them', async () => {
  let now = NOW;
  let metadataKnown = true;
  const vault = new MemoryVault();
  const fallback = youtubeFetch();
  const service = createSocialService({
    vault,
    now: () => now,
    fetch: (raw, init) => {
      if (new URL(raw).pathname === '/tokeninfo' && !metadataKnown)
        return Promise.resolve(json({ aud: 'fixture.apps.googleusercontent.com' }));
      return fallback(raw, init);
    },
  });
  const result = await service.startOAuth({
    platform: 'youtube',
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  await service.callbackOAuth('youtube', {
    state: new URL(result.authorizationUrl).searchParams.get('state')!,
    code: 'fixture-code',
  });
  now += 3601 * 1000;
  metadataKnown = false;
  await service.sync('tech', 'youtube');
  const saved = JSON.parse((await vault.get('tech', 'youtube'))!);
  assert.deepEqual(saved.scopes, []);
  assert.equal(saved.scopesVerified, false);
  assert.equal(saved.expiresAt, null);
  assert.equal(
    (await service.listConnections('tech')).find((item) => item.platform === 'youtube')!.expiresAt,
    null,
  );
});

test('Instagram pagination rebuilds fixed API calls and never follows a provider-supplied URL', async () => {
  const hosts: string[] = [];
  const service = createSocialService({
    vault: new MemoryVault(),
    now: () => NOW,
    fetch: async (raw) => {
      const url = new URL(raw);
      hosts.push(url.hostname);
      if (url.pathname.endsWith('/me/accounts')) {
        if (!url.searchParams.has('after'))
          return json({
            data: [],
            paging: { next: 'http://127.0.0.1:1/private', cursors: { after: 'fixture-cursor' } },
          });
        assert.equal(url.searchParams.get('after'), 'fixture-cursor');
        return json({ data: [{ instagram_business_account: { id: '456' } }] });
      }
      return json({ id: '456', username: 'fixture', followers_count: 1 });
    },
  });
  await service.connectToken({
    channelId: 'tech',
    platform: 'instagram',
    accountId: '456',
    accessToken: 'fixture-token',
  });
  assert.deepEqual(hosts, ['graph.facebook.com', 'graph.facebook.com', 'graph.facebook.com']);
});

const UPLOAD = 'https://www.googleapis.com/auth/youtube.upload';
const SESSION =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=fixture-session';

async function uploadFixture(
  options: { scopes?: string[]; location?: string; thumbnailStatus?: number } = {},
): Promise<{
  service: ReturnType<typeof createSocialService>;
  calls: Array<{ url: string; init?: RequestInit; body?: string }>;
  video: string;
  cleanup: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'fc-youtube-upload-'));
  const video = join(directory, 'final.mp4');
  await writeFile(video, MP4);
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const service = createSocialService({
    vault: new MemoryVault(),
    now: () => NOW,
    fetch: async (raw, init) => {
      const url = new URL(raw);
      assert.equal(init?.redirect, 'error');
      if (url.pathname === '/tokeninfo')
        return json({
          scope: (options.scopes ?? [READ, ANALYTICS, MONEY, UPLOAD]).join(' '),
          expires_in: 3600,
        });
      if (url.pathname === '/youtube/v3/channels')
        return json({ items: [{ id: ACCOUNT, snippet: { title: 'Fixture' } }] });
      if (url.pathname === '/upload/youtube/v3/videos' && init?.method === 'POST') {
        calls.push({ url: raw, init, body: String(init.body) });
        return new Response(null, { status: 200, headers: { location: options.location ?? SESSION } });
      }
      if (url.pathname === '/upload/youtube/v3/thumbnails/set') {
        calls.push({ url: raw, init, body: Buffer.from(init!.body as Uint8Array).toString() });
        return json({ items: [] }, options.thumbnailStatus ?? 200);
      }
      if (raw === SESSION && init?.method === 'PUT') {
        const body = await new Response(init.body as ReadableStream).text();
        calls.push({ url: raw, init, body });
        return json({ id: 'abcdefghijk', status: { privacyStatus: 'private' } });
      }
      throw Error(`Unexpected API endpoint ${raw}`);
    },
  });
  await service.connectToken({
    channelId: 'tech',
    platform: 'youtube',
    accountId: ACCOUNT,
    accessToken: 'fixture-access-token',
  });
  return { service, calls, video, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('YouTube upload is resumable, private, streams the file and returns the video id', async () => {
  const { service, calls, video, cleanup } = await uploadFixture();
  try {
    const result = await service.publish('tech', 'youtube', {
      vertical: false,
      path: video,
      title: `Skills <vs> agentes ${'x'.repeat(200)}`,
      description: 'Fontes revisadas <script>',
    });
    assert.deepEqual(result, { postId: 'abcdefghijk' });
    assert.equal(calls.length, 2);
    const start = new URL(calls[0].url);
    assert.equal(start.searchParams.get('uploadType'), 'resumable');
    const metadata = JSON.parse(calls[0].body!);
    assert.equal(metadata.status.privacyStatus, 'private');
    assert.equal(metadata.status.selfDeclaredMadeForKids, false);
    assert.equal(metadata.snippet.title.length, 100);
    assert.doesNotMatch(metadata.snippet.title + metadata.snippet.description, /[<>]/);
    assert.equal(calls[1].body, MP4_TEXT);
    assert.equal(new Headers(calls[1].init!.headers).get('content-length'), String(MP4.length));
  } finally {
    await cleanup();
  }
});

test('an old connection without the upload scope asks to reconnect and sends nothing', async () => {
  const { service, calls, video, cleanup } = await uploadFixture({ scopes: [READ, ANALYTICS, MONEY] });
  try {
    await assert.rejects(
      service.publish('tech', 'youtube', {
        vertical: false,
        path: video,
        title: 'Vídeo',
        description: '',
      }),
      (error: Error & { code?: string }) =>
        error.code === 'missing_scope' && /Reconecte o YouTube/.test(error.message),
    );
    assert.equal(calls.length, 0);
  } finally {
    await cleanup();
  }
});

test('a session URI outside the YouTube upload endpoint never receives the video or the token', async () => {
  for (const location of [
    'https://evil.example/upload/youtube/v3/videos?uploadType=resumable&upload_id=x',
    'https://www.googleapis.com:8443/upload/youtube/v3/videos?uploadType=resumable&upload_id=x',
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&upload_id=x',
    '',
  ]) {
    const { service, calls, video, cleanup } = await uploadFixture({ location });
    try {
      await assert.rejects(
        service.publish('tech', 'youtube', {
          vertical: false,
          path: video,
          title: 'Vídeo',
          description: '',
        }),
      );
      assert.equal(calls.length, 1, location);
    } finally {
      await cleanup();
    }
  }
});

test('a missing video file fails before any network call', async () => {
  const { service, calls, cleanup } = await uploadFixture();
  try {
    await assert.rejects(
      service.publish('tech', 'youtube', {
        vertical: false,
        path: join(tmpdir(), 'absent-final.mp4'),
        title: 'Vídeo',
        description: '',
      }),
      /Arquivo de vídeo ausente/,
    );
    assert.equal(calls.length, 0);
  } finally {
    await cleanup();
  }
});

test('the engine thumbnail is set after the upload and a refusal keeps the video uploaded', async () => {
  for (const [status, expected] of [
    [200, 'set'],
    [403, /verifique o canal por telefone/],
  ] as const) {
    const { service, calls, video, cleanup } = await uploadFixture({ thumbnailStatus: status });
    try {
      const thumbnail = video.replace('final.mp4', 'thumbnail.png');
      await writeFile(thumbnail, 'synthetic png');
      const result = await service.publish('tech', 'youtube', {
        vertical: false,
        path: video,
        title: 'Vídeo',
        description: '',
        thumbnail,
      });
      assert.equal(result.postId, 'abcdefghijk');
      const set = calls[2];
      assert.equal(new URL(set.url).searchParams.get('videoId'), 'abcdefghijk');
      assert.equal(new Headers(set.init!.headers).get('content-type'), 'image/png');
      assert.equal(set.body, 'synthetic png');
      if (expected === 'set') assert.equal(result.thumbnail, 'set');
      else assert.match((result.thumbnail as { error: string }).error, expected);
    } finally {
      await cleanup();
    }
  }
});

test('without a thumbnail file only the video is sent', async () => {
  const { service, calls, video, cleanup } = await uploadFixture();
  try {
    const result = await service.publish('tech', 'youtube', {
      vertical: false,
      path: video,
      title: 'Vídeo',
      description: '',
    });
    assert.deepEqual(result, { postId: 'abcdefghijk' });
    assert.equal(calls.length, 2);
  } finally {
    await cleanup();
  }
});

const TIKTOK_OPEN_ID = 'fixture-open-id';
const PAGE = '1234567890';
const IG = '17841400000000000';

function tiktokFetch(
  calls: Array<{ url: string; init?: RequestInit; body?: string }>,
  options: {
    username?: string;
    privacy?: readonly string[];
    uploadUrl?: string;
    maxSeconds?: number;
    /** An unaudited app posting to a public account: Direct Post refused with 403. */
    unaudited?: boolean;
    /** Scopes granted at login. */
    scope?: string;
  } = {},
): SocialFetch {
  return async (raw, init) => {
    const url = new URL(raw);
    assert.equal(init?.redirect, 'error');
    if (url.pathname === '/v2/oauth/token/') {
      calls.push({ url: raw, init, body: String(init!.body) });
      return json({
        open_id: TIKTOK_OPEN_ID,
        access_token: 'fixture-tiktok-token',
        refresh_token: 'fixture-tiktok-refresh',
        expires_in: 86400,
        scope:
          options.scope ?? 'user.info.basic,user.info.profile,user.info.stats,video.publish,video.upload',
      });
    }
    if (url.pathname === '/v2/user/info/')
      return json({
        data: {
          user: {
            open_id: TIKTOK_OPEN_ID,
            display_name: 'Fixture',
            username: options.username ?? 'fixture.channel',
            follower_count: 10,
          },
        },
        error: { code: 'ok' },
      });
    if (url.pathname === '/v2/post/publish/creator_info/query/') {
      calls.push({ url: raw, init });
      return json({
        data: {
          privacy_level_options: options.privacy ?? ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
          max_video_post_duration_sec: options.maxSeconds ?? 600,
        },
        error: { code: 'ok' },
      });
    }
    if (url.pathname === '/v2/post/publish/video/init/' && options.unaudited) {
      calls.push({ url: raw, init, body: String(init!.body) });
      return new Response(
        JSON.stringify({
          error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'private detail' },
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname === '/v2/post/publish/inbox/video/init/') {
      calls.push({ url: raw, init, body: String(init!.body) });
      return json({
        data: {
          publish_id: 'v_inbox_file~v2.456',
          upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=2',
        },
        error: { code: 'ok' },
      });
    }
    if (url.pathname === '/v2/post/publish/video/init/') {
      calls.push({ url: raw, init, body: String(init!.body) });
      return json({
        data: {
          publish_id: 'v_pub_file~v2.123',
          upload_url:
            options.uploadUrl ?? 'https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x',
        },
        error: { code: 'ok' },
      });
    }
    if (url.hostname === 'open-upload.tiktokapis.com' && init?.method === 'PUT') {
      calls.push({ url: raw, init, body: await new Response(init.body as ReadableStream).text() });
      return new Response(null, { status: 201 });
    }
    throw Error(`Unexpected API endpoint ${raw}`);
  };
}

async function connectTiktok(service: ReturnType<typeof createSocialService>, username = '@Fixture.Channel') {
  const started = await service.startOAuth({
    platform: 'tiktok',
    channelId: 'tech',
    accountId: username,
    clientId: 'fixture-client-key',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/tiktok/callback',
  });
  return { started, state: new URL(started.authorizationUrl).searchParams.get('state')! };
}

test('TikTok OAuth uses the hex PKCE digest, binds the expected username and saves the open_id', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const vault = new MemoryVault();
  const service = createSocialService({ vault, fetch: tiktokFetch(calls), now: () => NOW });
  const { started, state } = await connectTiktok(service);
  const authorize = new URL(started.authorizationUrl);
  assert.equal(authorize.origin + authorize.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.equal(authorize.searchParams.get('client_key'), 'fixture-client-key');
  assert.equal(
    authorize.searchParams.get('scope'),
    'user.info.basic,user.info.profile,user.info.stats,video.publish,video.upload',
  );
  assert.match(authorize.searchParams.get('code_challenge')!, /^[0-9a-f]{64}$/);
  await assert.rejects(service.callbackOAuth('youtube', { state, code: 'fixture-code' }), /OAuth ausente/);
  const connection = await service.callbackOAuth('tiktok', { state, code: 'fixture-code' });
  assert.equal(connection.accountId, TIKTOK_OPEN_ID);
  assert.equal(connection.profileUrl, 'https://www.tiktok.com/@fixture.channel');
  const exchange = new URLSearchParams(calls[0].body);
  assert.equal(exchange.get('grant_type'), 'authorization_code');
  assert.equal(
    createHash('sha256').update(exchange.get('code_verifier')!).digest('hex'),
    authorize.searchParams.get('code_challenge'),
  );
  assert.doesNotMatch(JSON.stringify(connection), /fixture-tiktok-token|fixture-client-secret/);
  assert.deepEqual(await service.profiles('tech'), [
    { platform: 'tiktok', url: 'https://www.tiktok.com/@fixture.channel' },
  ]);
  await service.disconnect('tech', 'tiktok');
  assert.equal(vault.values.size, 0);
});

test('through the HTTPS relay, TikTok returns via the public page with the port in the state and no PKCE', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const relay = 'https://prod455.github.io/framechester/oauth/tiktok/';
  const service = createSocialService({
    vault: new MemoryVault(),
    fetch: tiktokFetch(calls),
    now: () => NOW,
    relays: { tiktok: relay },
  });
  const { started, state } = await connectTiktok(service);
  const authorize = new URL(started.authorizationUrl);
  assert.equal(authorize.searchParams.get('redirect_uri'), relay);
  const capability = service.capabilities().find((item) => item.platform === 'tiktok')!;
  assert.equal(capability.redirectUri, relay, 'the Studio shows the address to register');
  assert.match(capability.requirements[0]!, /plataforma Web/);
  assert.match(state, /^4317\.[0-9a-f]{48}$/, 'the relay page reads the Studio port from the state');
  assert.equal(authorize.searchParams.get('code_challenge'), null, 'Login Kit for Web has no PKCE');
  const connection = await service.callbackOAuth('tiktok', { state, code: 'fixture-code' });
  assert.equal(connection.accountId, TIKTOK_OPEN_ID);
  const exchange = new URLSearchParams(calls[0].body);
  assert.equal(exchange.get('redirect_uri'), relay, 'the token exchange repeats the registered URI');
  assert.equal(exchange.get('code_verifier'), null);
  // Other networks keep their loopback callback.
  const youtube = await service.startOAuth({
    platform: 'youtube',
    channelId: 'tech',
    accountId: `UC${'a'.repeat(22)}`,
    clientId: 'fixture-client.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  assert.equal(
    new URL(youtube.authorizationUrl).searchParams.get('redirect_uri'),
    'http://127.0.0.1:4317/api/oauth/youtube/callback',
  );
});

test('a TikTok authorization from another account is refused and saves nothing', async () => {
  const vault = new MemoryVault();
  const service = createSocialService({
    vault,
    fetch: tiktokFetch([], { username: 'someone.else' }),
    now: () => NOW,
  });
  const { state } = await connectTiktok(service);
  await assert.rejects(
    service.callbackOAuth('tiktok', { state, code: 'fixture-code' }),
    /conta TikTok esperada/,
  );
  assert.equal(await vault.get('tech', 'tiktok'), null);
});

test('TikTok upload is a SELF_ONLY Direct Post with the caption, sent in ranged chunks', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const directory = await mkdtemp(join(tmpdir(), 'fc-tiktok-upload-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, MP4);
    const service = createSocialService({
      vault: new MemoryVault(),
      fetch: tiktokFetch(calls),
      now: () => NOW,
    });
    const { state } = await connectTiktok(service);
    await service.callbackOAuth('tiktok', { state, code: 'fixture-code' });
    calls.length = 0;
    const result = await service.publish('tech', 'tiktok', {
      path: video,
      title: 'Skills vs agentes',
      description: 'Fontes revisadas\n\nAcompanhe também:\nYouTube: https://www.youtube.com/@fixture',
      vertical: true,
    });
    assert.deepEqual(result, { postId: 'v_pub_file~v2.123' });
    const init = JSON.parse(calls[1].body!);
    assert.equal(init.post_info.privacy_level, 'SELF_ONLY');
    assert.equal(init.post_info.is_aigc, true);
    assert.match(
      init.post_info.title,
      /^Skills vs agentes\n\nFontes revisadas[\s\S]*youtube\.com\/@fixture$/,
    );
    const size = MP4.length;
    assert.deepEqual(init.source_info, {
      source: 'FILE_UPLOAD',
      video_size: size,
      chunk_size: size,
      total_chunk_count: 1,
    });
    const put = new Headers(calls[2].init!.headers);
    assert.equal(put.get('content-range'), `bytes 0-${size - 1}/${size}`);
    assert.equal(put.get('authorization'), null, 'The upload URL is signed; the token never goes there');
    assert.equal(calls[2].body, MP4_TEXT);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an unaudited app on a public TikTok account sends the video to the inbox as a draft', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fc-tiktok-draft-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, MP4);
    const send = async (scope?: string) => {
      const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
      const service = createSocialService({
        vault: new MemoryVault(),
        fetch: tiktokFetch(calls, { unaudited: true, ...(scope ? { scope } : {}) }),
        now: () => NOW,
      });
      const { state } = await connectTiktok(service);
      await service.callbackOAuth('tiktok', { state, code: 'fixture-code' });
      calls.length = 0;
      const result = await service.publish('tech', 'tiktok', {
        path: video,
        title: 'Skills vs agentes',
        description: 'Fontes revisadas',
        vertical: true,
      });
      return { result, calls };
    };
    const { result, calls } = await send();
    assert.deepEqual(result, { postId: 'v_inbox_file~v2.456', draft: true });
    const inbox = calls.find((call) => call.url.includes('/inbox/video/init/'))!;
    assert.deepEqual(Object.keys(JSON.parse(inbox.body!)), ['source_info'], 'a draft has no post_info');
    assert.ok(calls.some((call) => call.url.startsWith('https://open-upload.tiktokapis.com/')));
    await assert.rejects(
      send('user.info.basic,user.info.profile,user.info.stats,video.publish'),
      /conta privada\. Reconecte o TikTok/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('TikTok sends nothing when SELF_ONLY is not offered or the upload URL leaves its host', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fc-tiktok-refuse-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, MP4);
    for (const [options, pattern] of [
      [{ privacy: ['PUBLIC_TO_EVERYONE'] }, /Somente eu/],
      [{ uploadUrl: 'https://evil.example/video/?upload_id=1' }, /fora do endpoint/],
    ] as const) {
      const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
      const service = createSocialService({
        vault: new MemoryVault(),
        fetch: tiktokFetch(calls, options),
        now: () => NOW,
      });
      const { state } = await connectTiktok(service);
      await service.callbackOAuth('tiktok', { state, code: 'fixture-code' });
      await assert.rejects(
        service.publish('tech', 'tiktok', { path: video, title: 'Vídeo', description: '', vertical: true }),
        pattern,
      );
      assert.equal(
        calls.some((call) => call.init?.method === 'PUT'),
        false,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function metaFetch(
  calls: Array<{ url: string; init?: RequestInit; body?: string }>,
  options: {
    permissions?: string[];
    pages?: Array<{ id: string; access_token: string }>;
    /** Pages without a linked Instagram professional account. */
    unlinked?: boolean;
    /** Meta granted no Page at all. */
    noPages?: boolean;
    /** A system-user token: the long-lived exchange is refused with Meta's error body. */
    systemUser?: boolean;
    /** GET /{page}?fields=id,name,access_token answers with the Page token. */
    pageDirect?: boolean;
    /** Granular scopes recorded in the token (debug_token). */
    granted?: Array<{ scope: string; target_ids?: string[] }>;
  } = {},
): SocialFetch {
  return async (raw, init) => {
    const url = new URL(raw);
    assert.equal(init?.redirect, 'error');
    assert.equal(url.searchParams.has('client_secret'), false, 'The app secret travels in the body only');
    const auth = new Headers(init?.headers).get('authorization');
    if (url.pathname === '/v26.0/oauth/access_token') {
      const body = new URLSearchParams(String(init!.body));
      calls.push({ url: raw, init, body: String(init!.body) });
      if (options.systemUser && body.has('redirect_uri'))
        return new Response(JSON.stringify({ error: { code: 1 } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      if (options.systemUser && body.get('grant_type') === 'fb_exchange_token')
        return new Response(
          JSON.stringify({
            error: { message: 'private detail', type: 'OAuthException', code: 190, error_subcode: 460 },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      return json({
        access_token:
          body.get('grant_type') === 'fb_exchange_token' || options.systemUser
            ? 'fixture-long-user'
            : 'fixture-short-user',
        ...(options.systemUser ? {} : { expires_in: 5183944 }),
      });
    }
    if (url.pathname === '/v26.0/me/permissions')
      return json({
        data: (
          options.permissions ?? [
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_posts',
            'instagram_basic',
          ]
        ).map((permission) => ({ permission, status: 'granted' })),
      });
    if (url.pathname === '/v26.0/me/accounts') {
      assert.equal(auth, 'Bearer fixture-long-user');
      if (url.searchParams.get('fields') === 'id,name,access_token')
        return json({ data: options.pages ?? [{ id: PAGE, access_token: 'fixture-page-token' }] });
      return json({
        data: options.noPages
          ? []
          : options.unlinked
            ? [{ id: PAGE, name: 'Skills na Prática' }]
            : [{ id: PAGE, instagram_business_account: { id: IG, username: 'Fixture.IG' } }],
      });
    }
    if (url.pathname === '/v26.0/debug_token') {
      assert.equal(url.searchParams.get('input_token'), 'fixture-long-user');
      // A system-user token cannot inspect itself (Meta answers code 100).
      if (options.systemUser && auth !== 'Bearer 1122334455|fixture-app-secret')
        return new Response(JSON.stringify({ error: { code: 100 } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      return json({ data: { granular_scopes: options.granted ?? [] } });
    }
    if (url.pathname === `/v26.0/${PAGE}` && url.searchParams.get('fields') === 'id,name,access_token') {
      if (!options.pageDirect) return new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 });
      return json({ id: PAGE, name: 'Skills na Prática', access_token: 'fixture-page-token' });
    }
    if (url.pathname === `/v26.0/${PAGE}` && url.searchParams.get('fields')?.startsWith('name,'))
      return json({ id: PAGE, name: 'Skills na Prática', instagram_business_account: { id: IG } });
    if (url.pathname === '/v26.0/me') {
      assert.equal(auth, 'Bearer fixture-page-token');
      return json({ id: PAGE, name: 'Fixture Page', followers_count: 5 });
    }
    if (url.pathname === `/v26.0/${IG}`) return json({ id: IG, username: 'fixture.ig' });
    if (url.pathname === `/v26.0/${PAGE}/video_reels`) {
      assert.equal(auth, 'Bearer fixture-page-token');
      const body = new URLSearchParams(String(init!.body));
      calls.push({ url: raw, init, body: String(init!.body) });
      if (body.get('upload_phase') === 'start')
        return json({ video_id: '555', upload_url: 'https://rupload.facebook.com/video-upload/v26.0/555' });
      return json({ success: true });
    }
    if (raw === 'https://rupload.facebook.com/video-upload/v26.0/555') {
      calls.push({ url: raw, init, body: await new Response(init!.body as ReadableStream).text() });
      return json({ success: true });
    }
    throw Error(`Unexpected API endpoint ${raw}`);
  };
}

async function connectMeta(
  service: ReturnType<typeof createSocialService>,
  platform: 'facebook' | 'instagram',
) {
  const started = await service.startOAuth({
    platform,
    channelId: 'tech',
    accountId: platform === 'facebook' ? PAGE : IG,
    clientId: '1122334455',
    clientSecret: 'fixture-app-secret',
    redirectUri: `http://127.0.0.1:4317/api/oauth/${platform}/callback`,
  });
  const authorize = new URL(started.authorizationUrl);
  assert.equal(authorize.origin + authorize.pathname, 'https://www.facebook.com/v26.0/dialog/oauth');
  return service.callbackOAuth(platform, {
    state: authorize.searchParams.get('state')!,
    code: 'fixture-code',
  });
}

test('Facebook OAuth keeps the Page token of the expected Page with the permissions Meta granted', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const vault = new MemoryVault();
  const service = createSocialService({ vault, fetch: metaFetch(calls), now: () => NOW });
  const connection = await connectMeta(service, 'facebook');
  assert.equal(connection.accountId, PAGE);
  assert.equal(connection.expiresAt, null);
  assert.ok(connection.scopes.includes('pages_manage_posts'));
  assert.equal(JSON.parse((await vault.get('tech', 'facebook'))!).accessToken, 'fixture-page-token');
  assert.equal(new URLSearchParams(calls[1].body).get('fb_exchange_token'), 'fixture-short-user');
  const refused = createSocialService({
    vault: new MemoryVault(),
    fetch: metaFetch([], { pages: [{ id: '999', access_token: 'other-page' }] }),
    now: () => NOW,
  });
  await assert.rejects(
    connectMeta(refused, 'facebook'),
    /A Página 1234567890 não está entre as Páginas liberadas: Página \(999\)\. Use o ID de uma delas/,
  );
  // An empty /me/accounts asks for the expected Page directly, with the user token.
  const direct = createSocialService({
    vault: new MemoryVault(),
    fetch: metaFetch([], { pages: [], pageDirect: true }),
    now: () => NOW,
  });
  assert.equal((await connectMeta(direct, 'facebook')).accountId, PAGE);
  const none = createSocialService({
    vault: new MemoryVault(),
    fetch: metaFetch([], { pages: [] }),
    now: () => NOW,
  });
  await assert.rejects(
    connectMeta(none, 'facebook'),
    /A Meta não liberou nenhuma Página para o Studio \(concedidas: /,
  );
});

test('a Facebook Reel goes up as a DRAFT through rupload; horizontal video sends nothing', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const directory = await mkdtemp(join(tmpdir(), 'fc-reel-upload-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, MP4);
    const service = createSocialService({
      vault: new MemoryVault(),
      fetch: metaFetch(calls),
      now: () => NOW,
    });
    await connectMeta(service, 'facebook');
    await connectMeta(service, 'instagram');
    calls.length = 0;
    await assert.rejects(
      service.publish('tech', 'facebook', { path: video, title: 'Vídeo', description: '', vertical: false }),
      /só vídeo vertical/,
    );
    await assert.rejects(
      service.publish('tech', 'instagram', { path: video, title: 'Vídeo', description: '', vertical: false }),
      /Instagram recebe só vídeo vertical/,
    );
    assert.equal(calls.length, 0);
    const result = await service.publish('tech', 'facebook', {
      path: video,
      title: 'Skills vs agentes',
      description: 'Fontes\n\nAcompanhe também:\nInstagram: https://www.instagram.com/fixture.ig/',
      vertical: true,
    });
    assert.deepEqual(result, { postId: '555' });
    const upload = new Headers(calls[1].init!.headers);
    assert.equal(upload.get('authorization'), 'OAuth fixture-page-token');
    assert.equal(upload.get('offset'), '0');
    assert.equal(upload.get('file_size'), String(MP4.length));
    assert.equal(calls[1].body, MP4_TEXT);
    const finish = new URLSearchParams(calls[2].body);
    assert.equal(finish.get('upload_phase'), 'finish');
    assert.equal(finish.get('video_state'), 'DRAFT');
    assert.match(finish.get('description')!, /instagram\.com\/fixture\.ig/);
    assert.deepEqual(
      (await service.profiles('tech')).map((item) => item.url),
      ['https://www.instagram.com/fixture.ig/', 'https://www.facebook.com/1234567890'],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a Page connected without pages_manage_posts asks to reconnect before sending', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fc-reel-scope-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, MP4);
    const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
    const service = createSocialService({
      vault: new MemoryVault(),
      fetch: metaFetch(calls, { permissions: ['pages_show_list', 'pages_read_engagement'] }),
      now: () => NOW,
    });
    await connectMeta(service, 'facebook');
    calls.length = 0;
    await assert.rejects(
      service.publish('tech', 'facebook', { path: video, title: 'Vídeo', description: '', vertical: true }),
      /Reconecte o Facebook/,
    );
    assert.equal(calls.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a TikTok file above 5 MB goes in 10 MiB chunks and the last one absorbs the remainder', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const directory = await mkdtemp(join(tmpdir(), 'fc-tiktok-chunks-'));
  try {
    const video = join(directory, 'final.mp4');
    const file = mp4Fixture({ payload: 25 * 1024 * 1024 });
    const size = file.length;
    await writeFile(video, file);
    const service = createSocialService({
      vault: new MemoryVault(),
      fetch: tiktokFetch(calls),
      now: () => NOW,
    });
    const { state } = await connectTiktok(service);
    await service.callbackOAuth('tiktok', { state, code: 'fixture-code' });
    calls.length = 0;
    await service.publish('tech', 'tiktok', {
      path: video,
      title: 'Vídeo',
      description: '',
      vertical: false,
    });
    const chunk = 10 * 1024 * 1024;
    assert.deepEqual(JSON.parse(calls[1].body!).source_info, {
      source: 'FILE_UPLOAD',
      video_size: size,
      chunk_size: chunk,
      total_chunk_count: 2,
    });
    const puts = calls.filter((call) => call.init?.method === 'PUT');
    assert.deepEqual(
      puts.map((call) => new Headers(call.init!.headers).get('content-range')),
      [`bytes 0-${chunk - 1}/${size}`, `bytes ${chunk}-${size - 1}/${size}`],
    );
    assert.deepEqual(
      puts.map((call) => new Headers(call.init!.headers).get('content-length')),
      [String(chunk), String(size - chunk)],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function instagramFetch(
  calls: Array<{ url: string; init?: RequestInit; body?: string }>,
  statuses: string[],
): SocialFetch {
  const meta = metaFetch(calls, {
    permissions: ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'],
  });
  return async (raw, init) => {
    const url = new URL(raw);
    const auth = new Headers(init?.headers).get('authorization');
    if (url.pathname === `/v26.0/${IG}/media`) {
      assert.equal(auth, 'Bearer fixture-long-user');
      calls.push({ url: raw, init, body: String(init!.body) });
      return json({ id: '777', uri: 'https://rupload.facebook.com/ig-api-upload/v26.0/777' });
    }
    if (raw === 'https://rupload.facebook.com/ig-api-upload/v26.0/777') {
      calls.push({ url: raw, init, body: await new Response(init!.body as ReadableStream).text() });
      return json({ success: true, message: 'Upload successful.' });
    }
    if (url.pathname === '/v26.0/777') {
      calls.push({ url: raw, init });
      return json({ status_code: statuses.shift() ?? 'IN_PROGRESS', id: '777' });
    }
    if (url.pathname === `/v26.0/${IG}/media_publish`) {
      calls.push({ url: raw, init, body: String(init!.body) });
      return json({ id: '888' });
    }
    if (url.pathname === '/v26.0/888') return json({ permalink: 'https://www.instagram.com/reel/AbC_12-x/' });
    return meta(raw, init);
  };
}

test('Instagram OAuth can use a Facebook Login for Business configuration instead of scopes', async () => {
  const service = createSocialService({ vault: new MemoryVault(), fetch: metaFetch([]), now: () => NOW });
  const input = {
    platform: 'instagram' as const,
    channelId: 'tech',
    accountId: IG,
    clientId: '1122334455',
    clientSecret: 'fixture-app-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/instagram/callback',
  };
  const url = new URL((await service.startOAuth({ ...input, configId: '998877' })).authorizationUrl);
  assert.equal(url.searchParams.get('config_id'), '998877');
  assert.equal(url.searchParams.has('scope'), false);
  await assert.rejects(service.startOAuth({ ...input, configId: 'abc' }), /configuração/);
  await assert.rejects(service.startOAuth({ ...input, platform: 'youtube', configId: '1' } as never));
});

test('Instagram can be connected by its @: the ID is found among the authorized Pages', async () => {
  const connect = async (
    accountId: string,
    unlinked = false,
    noPages = false,
    permissions?: string[],
    granted?: Array<{ scope: string; target_ids?: string[] }>,
  ) => {
    const service = createSocialService({
      vault: new MemoryVault(),
      fetch: metaFetch([], {
        unlinked,
        noPages,
        ...(permissions ? { permissions } : {}),
        ...(granted ? { granted } : {}),
      }),
      now: () => NOW,
    });
    const started = await service.startOAuth({
      platform: 'instagram',
      channelId: 'tech',
      accountId,
      clientId: '1122334455',
      clientSecret: 'fixture-app-secret',
      redirectUri: 'http://127.0.0.1:4317/api/oauth/instagram/callback',
    });
    return service.callbackOAuth('instagram', {
      state: new URL(started.authorizationUrl).searchParams.get('state')!,
      code: 'fixture-code',
    });
  };
  const connection = await connect('@fixture.ig');
  assert.equal(connection.accountId, IG, 'the numeric ID is what the Studio keeps');
  assert.equal((await connect(' Fixture.IG ')).accountId, IG, 'without @ and in any case');
  assert.equal((await connect(IG)).accountId, IG, 'the numeric ID still works');
  await assert.rejects(
    connect('@outra.conta'),
    /@outra\.conta não está ligado.*Contas encontradas: @Fixture\.IG/,
  );
  await assert.rejects(
    connect('@fixture.ig', true),
    /liberou a Página Skills na Prática, mas ela não tem uma conta profissional do Instagram ligada/,
  );
  await assert.rejects(
    connect('@fixture.ig', false, true),
    /não liberou nenhuma Página para o Studio e não concedeu business_management/,
  );
  await assert.rejects(
    connect('@fixture.ig', false, true, [
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
      'instagram_basic',
    ]),
    /não liberou nenhuma Página para o Studio, embora tenha concedido pages_show_list, pages_read_engagement, business_management, instagram_basic\. .*Editar acesso/,
  );
  await assert.rejects(
    connect('@fixture.ig', false, true, ['instagram_basic']),
    /não concedeu pages_show_list.*\(concedidas: instagram_basic\)/,
  );
  // An empty /me/accounts falls back to what the person picked at login (granular scopes).
  assert.equal(
    (await connect('@fixture.ig', false, true, undefined, [{ scope: 'instagram_basic', target_ids: [IG] }]))
      .accountId,
    IG,
    'the Instagram account picked at login',
  );
  assert.equal(
    (await connect('@fixture.ig', false, true, undefined, [{ scope: 'pages_show_list', target_ids: [PAGE] }]))
      .accountId,
    IG,
    'the Instagram account linked to the Page picked at login',
  );
  await assert.rejects(connect('@nome inválido'), /Identidade da conta/);
});

test('Instagram returns through the HTTPS relay page, since Meta refuses an http callback', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const relay = 'https://prod455.github.io/framechester/oauth/instagram/';
  const service = createSocialService({
    vault: new MemoryVault(),
    fetch: metaFetch(calls),
    now: () => NOW,
    relays: { instagram: relay },
  });
  const started = await service.startOAuth({
    platform: 'instagram',
    channelId: 'tech',
    accountId: '@fixture.ig',
    clientId: '1122334455',
    clientSecret: 'fixture-app-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/instagram/callback',
  });
  const authorize = new URL(started.authorizationUrl);
  assert.equal(authorize.searchParams.get('redirect_uri'), relay);
  const state = authorize.searchParams.get('state')!;
  assert.match(state, /^4317\.[0-9a-f]{48}$/);
  const capability = service.capabilities().find((item) => item.platform === 'instagram')!;
  assert.equal(capability.redirectUri, relay);
  assert.match(capability.requirements.join(' '), /endereço de retorno abaixo/);
  const connection = await service.callbackOAuth('instagram', { state, code: 'fixture-code' });
  assert.equal(connection.accountId, IG);
  assert.equal(
    new URLSearchParams(calls[0]!.body).get('redirect_uri'),
    relay,
    'the code exchange repeats the registered URI',
  );
});

test('a system-user token keeps working when Meta refuses the long-lived exchange', async () => {
  const service = createSocialService({
    vault: new MemoryVault(),
    fetch: metaFetch([], { systemUser: true }),
    now: () => NOW,
  });
  const connection = await connectMeta(service, 'instagram');
  assert.equal(connection.accountId, IG);
  assert.equal(connection.expiresAt, null, 'a system-user token does not expire');
});

test('a Unified login system-user token finds the Instagram account through the app token', async () => {
  const service = createSocialService({
    vault: new MemoryVault(),
    fetch: metaFetch([], {
      systemUser: true,
      noPages: true,
      granted: [{ scope: 'instagram_basic', target_ids: [IG] }],
    }),
    now: () => NOW,
  });
  const started = await service.startOAuth({
    platform: 'instagram',
    channelId: 'tech',
    accountId: '@fixture.ig',
    clientId: '1122334455',
    clientSecret: 'fixture-app-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/instagram/callback',
  });
  const connection = await service.callbackOAuth('instagram', {
    state: new URL(started.authorizationUrl).searchParams.get('state')!,
    code: 'fixture-code',
  });
  assert.equal(connection.accountId, IG, 'no Page lists it; the token reads the account itself');
  assert.equal(connection.expiresAt, null);
});

test('a refused API call names the endpoint and Meta error code, never the provider message', async () => {
  const service = createSocialService({
    vault: new MemoryVault(),
    fetch: async () =>
      new Response(
        JSON.stringify({ error: { message: 'secret token detail', code: 100, error_subcode: 33 } }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    now: () => NOW,
  });
  await assert.rejects(
    connectMeta(service, 'instagram'),
    (error: Error) =>
      error.message ===
        'Consulta recusada ou indisponível na API (HTTP 400 em graph.facebook.com/v26.0/oauth/access_token, código 100/33).' &&
      !error.message.includes('secret'),
  );
});

test('an Instagram Reel is published only after processing finishes, with caption and permalink', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
  const waits: number[] = [];
  const directory = await mkdtemp(join(tmpdir(), 'fc-instagram-publish-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, MP4);
    const service = createSocialService({
      vault: new MemoryVault(),
      fetch: instagramFetch(calls, ['IN_PROGRESS', 'FINISHED']),
      now: () => NOW,
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    await connectMeta(service, 'instagram');
    calls.length = 0;
    const result = await service.publish('tech', 'instagram', {
      path: video,
      title: 'Skills vs agentes',
      description: 'Fontes\n\nAcompanhe também:\nYouTube: https://www.youtube.com/@fixture',
      vertical: true,
    });
    assert.deepEqual(result, { postId: '888', url: 'https://www.instagram.com/reel/AbC_12-x/' });
    const container = new URLSearchParams(calls[0].body);
    assert.equal(container.get('media_type'), 'REELS');
    assert.equal(container.get('upload_type'), 'resumable');
    assert.match(container.get('caption')!, /^Skills vs agentes\n\nFontes[\s\S]*youtube\.com\/@fixture$/);
    const upload = new Headers(calls[1].init!.headers);
    assert.equal(upload.get('authorization'), 'OAuth fixture-long-user');
    assert.equal(upload.get('file_size'), String(MP4.length));
    assert.equal(calls[1].body, MP4_TEXT);
    assert.deepEqual(waits, [30_000, 30_000], 'Two checks at the documented pace');
    assert.equal(new URLSearchParams(calls.at(-1)!.body).get('creation_id'), '777');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a container that fails or never finishes processing is never published', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fc-instagram-refuse-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, MP4);
    for (const [statuses, pattern] of [
      [['IN_PROGRESS', 'ERROR'], /nada foi publicado/],
      [[], /5 minutos/],
    ] as const) {
      const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
      const service = createSocialService({
        vault: new MemoryVault(),
        fetch: instagramFetch(calls, [...statuses]),
        now: () => NOW,
        wait: async () => {},
      });
      await connectMeta(service, 'instagram');
      await assert.rejects(
        service.publish('tech', 'instagram', {
          path: video,
          title: 'Vídeo',
          description: '',
          vertical: true,
        }),
        pattern,
      );
      assert.equal(
        calls.some((call) => call.url.endsWith('/media_publish')),
        false,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an Instagram connection without instagram_content_publish asks to reconnect and sends nothing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fc-instagram-scope-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, MP4);
    const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
    const service = createSocialService({
      vault: new MemoryVault(),
      fetch: metaFetch(calls),
      now: () => NOW,
    });
    await connectMeta(service, 'instagram');
    calls.length = 0;
    await assert.rejects(
      service.publish('tech', 'instagram', { path: video, title: 'Vídeo', description: '', vertical: true }),
      /Reconecte o Instagram/,
    );
    assert.equal(calls.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a video outside the network limits is refused before the upload starts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fc-limits-'));
  try {
    const video = join(directory, 'final.mp4');
    await writeFile(video, mp4Fixture({ seconds: 95 }));
    const calls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
    const meta = createSocialService({ vault: new MemoryVault(), fetch: metaFetch(calls), now: () => NOW });
    await connectMeta(meta, 'facebook');
    calls.length = 0;
    await assert.rejects(
      meta.publish('tech', 'facebook', { path: video, title: 'Vídeo', description: '', vertical: true }),
      /de 3 a 90 s; este vídeo tem 95 s/,
    );
    assert.equal(calls.length, 0, 'Not even the token is checked: the file decides first');
    const tiktokCalls: Array<{ url: string; init?: RequestInit; body?: string }> = [];
    const tiktok = createSocialService({
      vault: new MemoryVault(),
      fetch: tiktokFetch(tiktokCalls, { maxSeconds: 60 }),
      now: () => NOW,
    });
    const { state } = await connectTiktok(tiktok);
    await tiktok.callbackOAuth('tiktok', { state, code: 'fixture-code' });
    await assert.rejects(
      tiktok.publish('tech', 'tiktok', { path: video, title: 'Vídeo', description: '', vertical: true }),
      /Esta conta do TikTok aceita até 60 s; este vídeo tem 95 s/,
    );
    assert.equal(
      tiktokCalls.some((call) => call.url.includes('/video/init/')),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
