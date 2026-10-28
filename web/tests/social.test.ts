import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSocialService } from '../server/social.ts';
import type { SocialFetch } from '../server/social.ts';
import type { SecretVault } from '../server/vault.ts';

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

test('capabilities cover four networks honestly and never enable publishing', () => {
  const service = createSocialService({ vault: new MemoryVault(), fetch: youtubeFetch(), now: () => NOW });
  const capabilities = service.capabilities();
  assert.equal(capabilities.length, 4);
  assert.ok(capabilities.every((item) => !item.publishingAvailable));
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
  const result = await service.startYoutubeOAuth({
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
  const connection = await service.callbackYoutubeOAuth({ state, code: 'fixture-code' });
  assert.equal(connection.channelId, 'tech');
  assert.equal(connection.accountId, ACCOUNT);
  assert.equal(
    createHash('sha256').update(verifier).digest('base64url'),
    url.searchParams.get('code_challenge'),
  );
  await assert.rejects(service.callbackYoutubeOAuth({ state, code: 'fixture-code' }));
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
      service.startYoutubeOAuth({
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
  const result = await service.startYoutubeOAuth({
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  now += 11 * 60 * 1000;
  await assert.rejects(
    service.callbackYoutubeOAuth({
      state: new URL(result.authorizationUrl).searchParams.get('state')!,
      code: 'fixture-code',
    }),
  );
  assert.equal(requests, 0);
});

test('OAuth callback account mismatch and cross-channel credential copies fail closed', async () => {
  const vault = new MemoryVault();
  const service = createSocialService({ vault, fetch: youtubeFetch({ account: OTHER }), now: () => NOW });
  const result = await service.startYoutubeOAuth({
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  await assert.rejects(
    service.callbackYoutubeOAuth({
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
  const result = await service.startYoutubeOAuth({
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  await service.callbackYoutubeOAuth({
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
  const result = await service.startYoutubeOAuth({
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  await vault.set('tech', 'youtube-client', 'fixture-client-secret');
  await assert.rejects(
    service.callbackYoutubeOAuth({
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
  const result = await service.startYoutubeOAuth({
    channelId: 'tech',
    accountId: ACCOUNT,
    clientId: 'fixture.apps.googleusercontent.com',
    clientSecret: 'fixture-client-secret',
    redirectUri: 'http://127.0.0.1:4317/api/oauth/youtube/callback',
  });
  await service.callbackYoutubeOAuth({
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
