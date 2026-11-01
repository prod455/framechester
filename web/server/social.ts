import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type {
  NetworkCapability,
  OAuthInput,
  Platform,
  ProfileLink,
  PublishResult,
  SocialApi,
  SocialConnection,
  SocialSnapshot,
  TokenConnectionInput,
  VideoUpload,
  YoutubeThumbnail,
} from '../shared/types.ts';
import { canPublish, mediaProblem, platformLabels, postText } from '../shared/publishing.ts';
import { probeMp4, type VideoProbe } from './mp4.ts';
import type { SecretVault } from './vault.ts';

export type SocialFetch = (url: string, init?: RequestInit) => Promise<Response>;
export interface SocialServiceOptions {
  vault: SecretVault;
  fetch?: SocialFetch;
  now?: () => number;
  timeoutMs?: number;
  /** Pause between Instagram processing checks; tests skip the wait. */
  wait?: (ms: number) => Promise<void>;
  /** Public HTTPS pages registered as redirect URIs where the provider refuses a loopback one:
   * TikTok's portal rejects loopback, and Meta enforces HTTPS. Each page only forwards `code`
   * and `state` back to this Studio on 127.0.0.1. See docs/oauth/<network>/index.html. */
  relays?: Partial<Record<Platform, string>>;
}
export class SocialError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    /** The provider's own error code, when it gave one (Meta numbers, TikTok words). */
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'SocialError';
  }
}

const CHANNEL_READ = 'https://www.googleapis.com/auth/youtube.readonly';
const ANALYTICS_READ = 'https://www.googleapis.com/auth/yt-analytics.readonly';
const MONETARY_READ = 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly';
const VIDEO_UPLOAD = 'https://www.googleapis.com/auth/youtube.upload';
const YOUTUBE_SCOPES = [CHANNEL_READ, ANALYTICS_READ, MONETARY_READ, VIDEO_UPLOAD];
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/videos';
const THUMBNAIL_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';
// YouTube Studio limit for custom thumbnails; the API accepts more, the page does not.
const MAX_THUMBNAIL = 2 * 1024 * 1024;
// A long video on a home connection; the session itself stays valid for a week.
const UPLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const PLATFORMS: Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook'];
const GRAPH = 'https://graph.facebook.com/v26.0';
const TIKTOK = 'https://open.tiktokapis.com/v2';
const TIKTOK_PUBLISH = 'video.publish';
/** Inbox draft: the fallback when an unaudited app cannot Direct Post to a public account. */
const TIKTOK_DRAFT = 'video.upload';
const TIKTOK_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  TIKTOK_PUBLISH,
  TIKTOK_DRAFT,
];
const PAGE_PUBLISH = 'pages_manage_posts';
/** Pages owned by a business portfolio only reach /me/accounts with business_management. */
const BUSINESS = 'business_management';
const FACEBOOK_SCOPES = ['pages_show_list', 'pages_read_engagement', BUSINESS, PAGE_PUBLISH];
const INSTAGRAM_PUBLISH = 'instagram_content_publish';
const INSTAGRAM_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  BUSINESS,
  'instagram_basic',
  INSTAGRAM_PUBLISH,
];
const INSTAGRAM_UPLOAD = 'https://rupload.facebook.com/ig-api-upload/v26.0';
// Content Publishing: Reels up to 300 MB; query the container once per minute for at most
// 5 minutes is the documented pace, and an unpublished container expires in 24 h.
const INSTAGRAM_POLL_MS = 30_000;
const INSTAGRAM_POLLS = 10;
/** Scope that lets the stored token send videos; without it the operator reconnects. */
const PUBLISH_SCOPE: Partial<Record<Platform, string>> = {
  youtube: VIDEO_UPLOAD,
  tiktok: TIKTOK_PUBLISH,
  facebook: PAGE_PUBLISH,
  instagram: INSTAGRAM_PUBLISH,
};
const REELS_UPLOAD = 'https://rupload.facebook.com/video-upload/v26.0';
// TikTok Media Transfer Guide: chunks of 5-64 MB, the last one absorbs the remainder (up to 128 MB),
// count = floor(size / chunk), at most 1000; a file under 5 MB goes in a single chunk.
const TIKTOK_MIN_CHUNK = 5 * 1024 * 1024;
const TIKTOK_UPLOAD_HOST = /^open-upload(?:-[a-z0-9]{1,16}){0,3}\.tiktokapis\.com$/;
const TIKTOK_CHUNK = 10 * 1024 * 1024;
const MAX_RESPONSE = 512 * 1024;
interface OAuthProvider {
  authorize: string;
  scopes: string[];
  separator: string;
  clientParam: 'client_id' | 'client_key';
  /** Google uses RFC 7636 base64url; TikTok's desktop flow requires the hex digest. */
  pkce: 'base64url' | 'hex' | null;
  extra: Record<string, string>;
}
const META_DIALOG = 'https://www.facebook.com/v26.0/dialog/oauth';
const OAUTH: Record<Platform, OAuthProvider> = {
  youtube: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: YOUTUBE_SCOPES,
    separator: ' ',
    clientParam: 'client_id',
    pkce: 'base64url',
    extra: { access_type: 'offline', prompt: 'consent' },
  },
  tiktok: {
    authorize: 'https://www.tiktok.com/v2/auth/authorize/',
    scopes: TIKTOK_SCOPES,
    separator: ',',
    clientParam: 'client_key',
    pkce: 'hex',
    extra: {},
  },
  facebook: {
    authorize: META_DIALOG,
    scopes: FACEBOOK_SCOPES,
    separator: ',',
    clientParam: 'client_id',
    pkce: null,
    extra: {},
  },
  instagram: {
    authorize: META_DIALOG,
    scopes: INSTAGRAM_SCOPES,
    separator: ',',
    clientParam: 'client_id',
    pkce: null,
    extra: {},
  },
};
const ENDPOINTS: Array<{ host: string; path: RegExp; body: Array<'none' | 'form' | 'json'> }> = [
  { host: 'www.googleapis.com', path: /^\/youtube\/v3\/(channels|search|videos)$/, body: ['none'] },
  { host: 'youtubeanalytics.googleapis.com', path: /^\/v2\/reports$/, body: ['none'] },
  { host: 'oauth2.googleapis.com', path: /^\/(token|tokeninfo)$/, body: ['none', 'form'] },
  {
    host: 'graph.facebook.com',
    path: /^\/v26\.0\/(me(?:\/accounts|\/permissions)?|debug_token|\d{1,32})$/,
    body: ['none'],
  },
  {
    host: 'graph.facebook.com',
    path: /^\/v26\.0\/(oauth\/access_token|\d{1,32}\/(video_reels|media|media_publish))$/,
    body: ['form'],
  },
  { host: 'open.tiktokapis.com', path: /^\/v2\/user\/info\/$/, body: ['none'] },
  { host: 'open.tiktokapis.com', path: /^\/v2\/oauth\/token\/$/, body: ['form'] },
  {
    host: 'open.tiktokapis.com',
    path: /^\/v2\/post\/publish\/(creator_info\/query|video\/init|inbox\/video\/init)\/$/,
    body: ['json'],
  },
];
type RequestBody = URLSearchParams | { json: unknown };
const CAPABILITIES: NetworkCapability[] = [
  {
    platform: 'youtube',
    label: 'YouTube',
    connectionMethod: 'oauth',
    metricsAvailable: true,
    revenueAvailable: true,
    publishingAvailable: true,
    accountLabel: 'ID do canal no YouTube',
    // HTML pattern attributes compile with the v flag: a bare hyphen in a class is invalid there.
    accountPattern: '^UC[\\w\\-]{22}$',
    requirements: [
      'Cliente OAuth Web próprio e callback local registrado exatamente.',
      'YouTube Data API e Analytics API habilitadas.',
      'youtube.readonly, yt-analytics.readonly, yt-analytics-monetary.readonly e youtube.upload.',
      'Envio sempre como privado; a publicação é decisão do operador no YouTube Studio.',
    ],
    revenueNote:
      'Receita estimada pela YouTube Analytics API; não é pagamento recebido e pode sofrer ajustes.',
    docsUrl: 'https://developers.google.com/youtube/analytics/reference/reports/query',
  },
  {
    platform: 'tiktok',
    label: 'TikTok',
    connectionMethod: 'oauth',
    metricsAvailable: true,
    revenueAvailable: false,
    publishingAvailable: true,
    accountLabel: 'Nome de usuário no TikTok',
    accountPattern: '^@?[A-Za-z0-9._]{2,24}$',
    requirements: [
      'Aplicativo próprio no TikTok for Developers, plataforma Desktop, com o callback local registrado exatamente.',
      'Login Kit e Content Posting API (Direct Post): user.info.basic, user.info.profile, user.info.stats, video.publish e video.upload.',
      'Envio sempre como "Somente eu" (SELF_ONLY); a publicação é decisão do operador no app do TikTok.',
    ],
    revenueNote:
      'A Display API usada aqui fornece perfil e contadores, não comprovantes ou receita do Creator Rewards. Recebimentos exigem importação manual.',
    docsUrl: 'https://developers.tiktok.com/doc/content-posting-api-reference-direct-post',
  },
  {
    platform: 'instagram',
    label: 'Instagram',
    connectionMethod: 'oauth',
    metricsAvailable: true,
    revenueAvailable: false,
    publishingAvailable: true,
    accountLabel: '@ do Instagram (ou ID da conta profissional)',
    accountPattern: '^(@?[A-Za-z0-9._]{1,30}|\\d{1,32})$',
    requirements: [
      'Conta profissional ligada a uma Página.',
      'Aplicativo Meta próprio com Facebook Login for Business e o callback local registrado; a configuração pede pages_show_list, pages_read_engagement, business_management, instagram_basic e instagram_content_publish.',
      'Publicação pública direta como Reel (vídeo vertical): a API do Instagram não tem rascunho nem modo privado. Só sai a versão final aprovada no QA, por clique confirmado ou com o opt-in do canal.',
    ],
    revenueNote:
      'Esta integração lê contadores da conta profissional; não implementa API de recebimentos do Instagram. Importe comprovantes manualmente.',
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
  },
  {
    platform: 'facebook',
    label: 'Facebook',
    connectionMethod: 'oauth',
    metricsAvailable: true,
    revenueAvailable: false,
    publishingAvailable: true,
    accountLabel: 'ID da Página do Facebook',
    accountPattern: '^\\d{1,32}$',
    requirements: [
      'Aplicativo Meta próprio com Facebook Login e o callback local registrado; o token salvo é o da Página, não de um perfil pessoal.',
      'pages_show_list, pages_read_engagement, business_management e pages_manage_posts, com a aprovação exigida pela Meta.',
      'Envio sempre como rascunho de Reel (vídeo vertical); a publicação é decisão do operador no Meta Business Suite.',
    ],
    revenueNote:
      'Esta integração lê contadores da Página e não integra receitas ou pagamentos. Importe comprovantes manualmente.',
    docsUrl: 'https://developers.facebook.com/docs/video-api/guides/reels-publishing',
  },
];

interface Credential {
  version: 1;
  channelId: string;
  platform: Platform;
  accountId: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string | null;
  scopes: string[];
  scopesVerified: boolean;
  connectedAt: string;
  clientId?: string;
  profileUrl?: string;
}
interface PendingOAuth {
  channelId: string;
  platform: Platform;
  /** YouTube channel ID, TikTok username, Facebook Page ID or Instagram account ID. */
  expected: string;
  clientId: string;
  redirectUri: string;
  verifier: string;
  /** TikTok's Login Kit for Web, used through the relay, has no PKCE. */
  pkce: boolean;
  expiresAt: number;
}
interface Identity {
  displayName: string;
  data: Record<string, unknown>;
}
export interface YoutubeDiscovery {
  query: string;
  queriedAt: string;
  source: 'youtube_data_api';
  items: {
    videoId: string;
    title: string;
    channelTitle: string;
    publishedAt: string;
    url: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
  }[];
  note: string;
}

/**
 * The provider's error identifiers from a refused response, never its message or body:
 * Graph and TikTok `error.code`/`error_subcode`, Google's `error.errors[].reason`
 * (uploadLimitExceeded, ...) and the rupload `debug_info.type` (ProcessingFailedError, ...).
 * A code that only repeats the HTTP status is left out. Anything that is not a plain number
 * or identifier is dropped, so nothing private reaches the screen.
 */
async function failureCode(response: Response): Promise<string> {
  try {
    const parsed = record(JSON.parse((await response.text()).slice(0, 4096)));
    const failure = record(parsed.error);
    const reasons = array(failure.errors).map((item) => record(item).reason);
    return [
      failure.code === response.status ? undefined : failure.code,
      failure.error_subcode,
      ...reasons,
      record(parsed.debug_info).type,
    ]
      .filter(
        (part) =>
          (typeof part === 'number' && Number.isSafeInteger(part)) ||
          (typeof part === 'string' && part !== 'ok' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(part)),
      )
      .join('/');
  } catch {
    return '';
  }
}

/**
 * A refused videos.insert, said by its reason: the channel's upload limit (HTTP 400), the
 * project's daily quota (HTTP 403), or the metadata; anything else names the identifiers.
 */
async function youtubeRefused(response: Response): Promise<SocialError> {
  const code = await failureCode(response);
  const reasons = code.split('/');
  const message = reasons.includes('uploadLimitExceeded')
    ? 'O canal atingiu o limite de envios do YouTube por enquanto; nada foi enviado. Tente de novo em 24 horas. Um canal verificado em youtube.com/verify tem limite maior.'
    : reasons.includes('quotaExceeded') || reasons.includes('dailyLimitExceeded')
      ? 'A quota diária da YouTube Data API do projeto acabou; nada foi enviado. Ela renova à meia-noite do horário do Pacífico, ou peça mais quota no Google Cloud.'
      : reasons.some((reason) => /^invalid(Title|Description|Tags|CategoryId)$/.test(reason))
        ? `O YouTube recusou o título ou a descrição (HTTP ${response.status}, código ${code}).`
        : code
          ? `O YouTube recusou o envio (HTTP ${response.status}, código ${code}).`
          : `O YouTube recusou o envio (HTTP ${response.status}).`;
  return new SocialError('api_denied', message, code || undefined);
}

/** A refused upload, named with the provider's error identifiers when it sent any. */
async function uploadRefused(network: string, response: Response): Promise<SocialError> {
  const code = await failureCode(response);
  return new SocialError(
    'api_denied',
    code
      ? `O ${network} recusou o arquivo (HTTP ${response.status}, código ${code}).`
      : `O ${network} recusou o arquivo (HTTP ${response.status}).`,
    code || undefined,
  );
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const label = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f]/g, '').slice(0, 180) : fallback;
function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)))
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function count(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function channel(channelId: string): void {
  if (
    typeof channelId !== 'string' ||
    !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(channelId) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(channelId)
  ) {
    throw new SocialError('invalid_channel', 'Identificador de canal inválido.');
  }
}
function identityInput(platform: Platform, accountId: string): void {
  if (
    !PLATFORMS.includes(platform) ||
    typeof accountId !== 'string' ||
    !(platform === 'youtube'
      ? /^UC[A-Za-z0-9_-]{22}$/.test(accountId)
      : platform === 'tiktok'
        ? /^[A-Za-z0-9_-]{1,128}$/.test(accountId)
        : /^\d{1,32}$/.test(accountId))
  ) {
    throw new SocialError('invalid_account', 'Identidade da conta ou plataforma inválida.');
  }
}
/** The Instagram account: its numeric ID, or `@username`, resolved after authorizing among the
 * professional accounts linked to the authorized Pages. Few operators can find the ID. */
function instagramAccount(value: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (/^\d{1,32}$/.test(raw)) return raw;
  const name = raw.replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name))
    throw new SocialError('invalid_account', 'Identidade da conta ou plataforma inválida.');
  return `@${name.toLowerCase()}`;
}
/** TikTok's open_id is per app and unknown before authorizing: the operator names the username. */
function tiktokUsername(value: string): string {
  const name = typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
  if (!/^[A-Za-z0-9._]{2,24}$/.test(name))
    throw new SocialError('invalid_account', 'Identidade da conta ou plataforma inválida.');
  return name;
}
/** Public profile built only from validated identifiers, never from a provider-supplied URL. */
function profileUrl(
  platform: Platform,
  accountId: string,
  data: Record<string, unknown>,
): string | undefined {
  if (platform === 'youtube') {
    const custom = record(data.snippet).customUrl;
    const handle = typeof custom === 'string' ? custom.replace(/^@/, '') : '';
    return /^[A-Za-z0-9._-]{3,30}$/.test(handle)
      ? `https://www.youtube.com/@${handle}`
      : `https://www.youtube.com/channel/${accountId}`;
  }
  if (platform === 'facebook') return `https://www.facebook.com/${accountId}`;
  const username = data.username;
  if (typeof username !== 'string') return undefined;
  if (platform === 'tiktok')
    return /^[A-Za-z0-9._]{2,24}$/.test(username) ? `https://www.tiktok.com/@${username}` : undefined;
  return /^[A-Za-z0-9._]{1,30}$/.test(username) ? `https://www.instagram.com/${username}/` : undefined;
}
/** Connections saved before profiles existed: the ID alone is enough on YouTube and Facebook. */
function storedProfile(credential: Credential): string | undefined {
  return (
    credential.profileUrl ??
    (credential.platform === 'youtube' || credential.platform === 'facebook'
      ? profileUrl(credential.platform, credential.accountId, {})
      : undefined)
  );
}
/** Upload URLs come from the provider: HTTPS on the expected host, no credentials or port. */
function providerUrl(raw: unknown, host: string | RegExp, path: (pathname: string) => boolean): string {
  let url: URL;
  try {
    url = new URL(typeof raw === 'string' ? raw : '');
  } catch {
    throw new SocialError('invalid_response', 'A plataforma não abriu a sessão de envio.');
  }
  if (
    url.protocol !== 'https:' ||
    !(typeof host === 'string' ? url.hostname === host : host.test(url.hostname)) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !path(url.pathname)
  )
    throw new SocialError(
      'blocked_endpoint',
      `Sessão de envio fora do endpoint da plataforma (${url.hostname.slice(0, 80)}).`,
    );
  return url.toString();
}
/** The session URI comes from the provider: it must point back at the same upload endpoint. */
function uploadSession(raw: string | null): string {
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    throw new SocialError('invalid_response', 'O YouTube não abriu a sessão de envio.');
  }
  if (
    `${url.origin}${url.pathname}` !== UPLOAD_ENDPOINT ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.get('uploadType') !== 'resumable' ||
    !url.searchParams.get('upload_id')
  )
    throw new SocialError('blocked_endpoint', 'Sessão de envio fora do endpoint do YouTube.');
  return url.toString();
}
function secret(value: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 16384 || /[\r\n\u0000]/.test(value)) {
    throw new SocialError('invalid_secret', 'Credencial ausente ou com formato inválido.');
  }
}
function reportMetric(data: Record<string, unknown>, name: string): number | null {
  const index = array(data.columnHeaders).findIndex((header) => record(header).name === name);
  const rows = array(data.rows);
  if (index < 0 || rows.length === 0) return null;
  let total = 0;
  for (const row of rows) {
    const value = numeric(array(row)[index]);
    if (value === null) throw new SocialError('invalid_response', 'A API retornou métrica inválida.');
    total += value;
  }
  if (!Number.isFinite(total) || Math.abs(total) > Number.MAX_SAFE_INTEGER)
    throw new SocialError('invalid_response', 'Métrica fora do limite numérico seguro.');
  return total;
}

export class SocialService implements SocialApi {
  private readonly vault: SecretVault;
  private readonly fetcher: SocialFetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly relays: Partial<Record<Platform, string>>;
  private readonly pending = new Map<string, PendingOAuth>();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(options: SocialServiceOptions) {
    this.vault = options.vault;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.timeoutMs = Math.min(30000, Math.max(1000, options.timeoutMs ?? 15000));
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.relays = { ...options.relays };
  }

  capabilities(): NetworkCapability[] {
    return structuredClone(CAPABILITIES).map((capability) => {
      const relay = this.relays[capability.platform];
      if (!relay) return capability;
      return {
        ...capability,
        redirectUri: relay,
        requirements: capability.requirements.map((item) =>
          item.startsWith('Aplicativo próprio no TikTok')
            ? 'Aplicativo próprio no TikTok for Developers, plataforma Web, com o endereço de retorno abaixo registrado exatamente.'
            : item.replace('e o callback local registrado', 'e o endereço de retorno abaixo registrado'),
        ),
      };
    });
  }

  private async locked<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const result = previous.then(action);
    const completion = result.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(key, completion);
    void completion.then(() => {
      if (this.locks.get(key) === completion) this.locks.delete(key);
    });
    return result;
  }

  private async request(raw: string, token?: string, body?: RequestBody): Promise<Record<string, unknown>> {
    const url = new URL(raw);
    const kind = !body ? 'none' : body instanceof URLSearchParams ? 'form' : 'json';
    const allowed =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      ENDPOINTS.some(
        (rule) => rule.host === url.hostname && rule.path.test(url.pathname) && rule.body.includes(kind),
      );
    if (!allowed || url.searchParams.has('access_token') || url.searchParams.has('client_secret'))
      throw new SocialError('blocked_endpoint', 'Endpoint não permitido.');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const method = body || url.pathname === '/tokeninfo' ? 'POST' : 'GET';
    if (kind === 'json') headers['content-type'] = 'application/json; charset=UTF-8';
    else if (method === 'POST') headers['content-type'] = 'application/x-www-form-urlencoded';
    try {
      const response = await this.fetcher(url.toString(), {
        method,
        headers,
        ...(body
          ? { body: body instanceof URLSearchParams ? body.toString() : JSON.stringify(body.json) }
          : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        // Name the call and the provider's numeric error code, never its message or body: the
        // operator can tell which step failed without anything private reaching the screen.
        const endpoint = `${url.hostname}${url.pathname.replace(/\d{3,}/g, '{id}')}`;
        const code = await failureCode(response);
        throw new SocialError(
          'api_denied',
          code
            ? `Consulta recusada ou indisponível na API (HTTP ${response.status} em ${endpoint}, código ${code}).`
            : `Consulta recusada ou indisponível na API (HTTP ${response.status} em ${endpoint}).`,
          code || undefined,
        );
      }
      if (Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE) {
        await response.body?.cancel();
        throw new SocialError('invalid_response', 'Resposta da API excedeu o limite.');
      }
      return await this.readJson(response);
    } catch (error) {
      if (error instanceof SocialError) throw error;
      throw new SocialError(
        'api_unavailable',
        'Não foi possível consultar a API com segurança. Nenhum token ou detalhe privado foi registrado.',
      );
    }
  }

  private async readJson(response: Response): Promise<Record<string, unknown>> {
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_RESPONSE) {
          await reader.cancel();
          throw new SocialError('invalid_response', 'Resposta da API excedeu o limite.');
        }
        chunks.push(chunk.value);
      }
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new SocialError('invalid_response', 'Resposta inválida da API.');
    const data = record(result);
    const apiError = record(data.error);
    if (data.error && !(apiError.code === 'ok' || apiError.code === 0))
      throw new SocialError(
        'api_denied',
        'A plataforma recusou a consulta; confira token, escopos e permissões.',
      );
    return data;
  }

  private async tokenMetadata(
    accessToken: string,
  ): Promise<{ scopes: string[]; scopesVerified: boolean; expiresAt: string | null; clientId?: string }> {
    const info = await this.request('https://oauth2.googleapis.com/tokeninfo', accessToken);
    const expires = numeric(info.expires_in);
    const scopes = typeof info.scope === 'string' ? info.scope.split(/\s+/).filter(Boolean) : [];
    if (expires !== null && expires <= 0)
      throw new SocialError('expired', 'Token expirado. Conecte novamente.');
    return {
      scopes,
      scopesVerified: typeof info.scope === 'string',
      expiresAt: expires !== null ? new Date(this.now() + expires * 1000).toISOString() : null,
      ...(typeof info.aud === 'string' ? { clientId: info.aud } : {}),
    };
  }

  private async oauthClient(
    channelId: string,
    platform: Platform,
  ): Promise<{ clientId: string; clientSecret: string }> {
    try {
      const config = record(JSON.parse((await this.vault.get(channelId, `${platform}-client`)) ?? '{}'));
      if (typeof config.clientId !== 'string' || typeof config.clientSecret !== 'string') throw Error();
      secret(config.clientId);
      secret(config.clientSecret);
      return { clientId: config.clientId, clientSecret: config.clientSecret };
    } catch {
      throw new SocialError(
        'invalid_client',
        'Cliente OAuth protegido indisponível ou inválido. Configure novamente; nenhum segredo foi exposto.',
      );
    }
  }

  private async verifyIdentity(
    platform: Platform,
    accountId: string,
    token: string,
    stats = false,
    profile = false,
  ): Promise<Identity> {
    if (platform === 'youtube') {
      const data = await this.request(
        'https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true',
        token,
      );
      const items = array(data.items);
      if (items.length !== 1 || record(items[0]).id !== accountId)
        throw new SocialError('account_mismatch', 'O token não corresponde ao canal YouTube esperado.');
      const item = record(items[0]);
      return { displayName: label(record(item.snippet).title, 'YouTube'), data: item };
    }
    if (platform === 'tiktok') {
      // username needs user.info.profile; tokens saved without it would be refused outright.
      const fields = [
        'open_id,display_name',
        ...(profile ? ['username'] : []),
        ...(stats ? ['follower_count,likes_count,video_count'] : []),
      ].join(',');
      const payload = await this.request(`https://open.tiktokapis.com/v2/user/info/?fields=${fields}`, token);
      const user = record(record(payload.data).user);
      if (user.open_id !== accountId)
        throw new SocialError('account_mismatch', 'O token não corresponde à conta TikTok esperada.');
      return { displayName: label(user.display_name, 'TikTok'), data: user };
    }
    if (platform === 'instagram') {
      let cursor: string | undefined;
      let owned = false;
      for (let page = 0; page < 10 && !owned; page++) {
        const url = new URL(`${GRAPH}/me/accounts`);
        url.searchParams.set('fields', 'id,instagram_business_account');
        url.searchParams.set('limit', '100');
        if (cursor) url.searchParams.set('after', cursor);
        const pages = await this.request(url.toString(), token);
        owned = array(pages.data).some(
          (item) => record(record(item).instagram_business_account).id === accountId,
        );
        const after = record(record(pages.paging).cursors).after;
        if (!record(pages.paging).next || typeof after !== 'string' || after.length > 2048) break;
        cursor = after;
      }
      // Some profiles get an empty /me/accounts although the person picked the Page and the
      // Instagram account at login; the token still records what was picked.
      // Without a Page listing the account (system-user tokens from a Unified login
      // configuration, profiles whose /me/accounts comes back empty), reading the account itself
      // is the proof: Meta only answers it for a token granted that Instagram account.
      const data = await this.request(
        `${GRAPH}/${accountId}?fields=id,username,followers_count,media_count`,
        token,
      ).catch((error: unknown) => {
        if (!owned && error instanceof SocialError && error.code === 'api_denied')
          throw new SocialError(
            'account_mismatch',
            'Conta Instagram não encontrada nas Páginas autorizadas para este token.',
          );
        throw error;
      });
      if (data.id !== accountId)
        throw new SocialError('account_mismatch', 'A resposta não corresponde à conta Instagram esperada.');
      return { displayName: label(data.username, 'Instagram'), data };
    }
    const data = await this.request(`${GRAPH}/me?fields=id,name,followers_count,fan_count`, token);
    if (data.id !== accountId)
      throw new SocialError(
        'account_mismatch',
        'Use um token da Página Facebook esperada, não de outro perfil ou Página.',
      );
    return { displayName: label(data.name, 'Facebook'), data };
  }

  /** Page and Instagram account IDs the person picked at login, as recorded in the token's
   * granular scopes. Read with the token itself (the operator develops the app) or, for a
   * system-user token that cannot inspect itself, with the app token. */
  private async grantedTargets(
    token: string,
    inspector = token,
  ): Promise<{ pages: string[]; instagram: string[] }> {
    const url = new URL(`${GRAPH}/debug_token`);
    url.searchParams.set('input_token', token);
    const debug = record((await this.request(url.toString(), inspector)).data);
    const ids = (scopes: string[]) =>
      [
        ...new Set(
          array(debug.granular_scopes)
            .map(record)
            .filter((item) => typeof item.scope === 'string' && scopes.includes(item.scope))
            .flatMap((item) => array(item.target_ids))
            .filter((id): id is string => typeof id === 'string' && /^\d{1,32}$/.test(id)),
        ),
      ].slice(0, 20);
    return {
      pages: ids(['pages_show_list', 'pages_read_engagement']),
      instagram: ids(['instagram_basic', 'instagram_content_publish']),
    };
  }

  /** Finds the professional account named `username` among those linked to the Pages this token
   * authorizes. The error names what was found, so the operator knows which link is missing. */
  /** `appToken` (app ID|secret) reads debug_token for system-user tokens, which cannot inspect
   * themselves. */
  private async instagramId(
    username: string,
    token: string,
    granted: string[],
    appToken?: string,
  ): Promise<string> {
    const found: string[] = [];
    // Page names say which Pages Meta authorized, so the error tells a Page that was never
    // granted apart from a Page without Instagram.
    const pageNames: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const url = new URL(`${GRAPH}/me/accounts`);
      url.searchParams.set('fields', 'id,name,instagram_business_account{id,username}');
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('after', cursor);
      const pages = await this.request(url.toString(), token);
      for (const item of array(pages.data)) {
        const pageName = record(item).name;
        if (pageNames.length < 5)
          pageNames.push(
            typeof pageName === 'string' && pageName.trim()
              ? pageName
                  .trim()
                  .replace(/[\u0000-\u001f]/g, '')
                  .slice(0, 60)
              : String(record(item).id ?? '?').slice(0, 32),
          );
        const account = record(record(item).instagram_business_account);
        if (typeof account.id !== 'string' || !/^\d{1,32}$/.test(account.id)) continue;
        const name = typeof account.username === 'string' ? account.username : '';
        if (name.toLowerCase() === username) return account.id;
        if (/^[A-Za-z0-9._]{1,30}$/.test(name) && found.length < 10) found.push(`@${name}`);
      }
      const after = record(record(pages.paging).cursors).after;
      if (!record(pages.paging).next || typeof after !== 'string' || after.length > 2048) break;
      cursor = after;
    }
    if (!pageNames.length) {
      // /me/accounts came back empty: look at the Pages and Instagram accounts picked at login.
      const granted = await this.grantedTargets(token, appToken);
      const candidates = new Set(granted.instagram);
      for (const pageId of granted.pages) {
        const page = await this.request(
          `${GRAPH}/${pageId}?fields=name,instagram_business_account{id}`,
          token,
        );
        const id = record(page.instagram_business_account).id;
        if (typeof id === 'string' && /^\d{1,32}$/.test(id)) candidates.add(id);
        const name = typeof page.name === 'string' ? page.name.trim().slice(0, 60) : pageId;
        if (pageNames.length < 5) pageNames.push(name.replace(/[\u0000-\u001f]/g, ''));
      }
      for (const id of [...candidates].slice(0, 10)) {
        const account = await this.request(`${GRAPH}/${id}?fields=id,username`, token);
        const name = typeof account.username === 'string' ? account.username : '';
        if (account.id === id && name.toLowerCase() === username) return id;
        if (/^[A-Za-z0-9._]{1,30}$/.test(name) && found.length < 10) found.push(`@${name}`);
      }
    }
    throw new SocialError(
      'account_mismatch',
      found.length
        ? `O Instagram @${username} não está ligado a nenhuma Página autorizada. Contas encontradas: ${found.join(', ')}.`
        : pageNames.length
          ? `A Meta liberou a Página ${pageNames.join(', ')}, mas ela não tem uma conta profissional do Instagram ligada. Ligue o Instagram a essa Página (perfil da Página → Configurações → Contas vinculadas → Instagram) e conecte de novo.`
          : granted.includes('pages_show_list') && !granted.includes(BUSINESS)
            ? `A Meta não liberou nenhuma Página para o Studio e não concedeu business_management, sem a qual Páginas de um portfólio de empresa não aparecem (concedidas: ${granted.join(', ')}). Conecte de novo aceitando todas as permissões; se usar o ID da configuração, inclua business_management nela.`
            : granted.includes('pages_show_list')
              ? `A Meta não liberou nenhuma Página para o Studio, embora tenha concedido ${granted.join(', ')}. Este perfil do Facebook não marcou nenhuma Página no login ou não administra uma. Remova o app em facebook.com/settings/?tab=business_tools, conecte de novo e, na tela da Meta, use Editar acesso para marcar a Página.`
              : `A Meta não concedeu pages_show_list, sem a qual o Studio não vê nenhuma Página (concedidas: ${granted.join(', ') || 'nenhuma'}). Inclua pages_show_list, pages_read_engagement, business_management, instagram_basic e instagram_content_publish na configuração do Facebook Login for Business e conecte de novo sem desmarcar nenhuma.`,
    );
  }

  private publicConnection(credential: Credential): SocialConnection {
    return {
      channelId: credential.channelId,
      platform: credential.platform,
      accountId: credential.accountId,
      displayName: credential.displayName,
      status:
        credential.expiresAt !== null && Date.parse(credential.expiresAt) <= this.now()
          ? 'expired'
          : 'connected',
      connectedAt: credential.connectedAt,
      expiresAt: credential.expiresAt,
      scopes: [...credential.scopes],
      ...(storedProfile(credential) ? { profileUrl: storedProfile(credential) } : {}),
      message: credential.scopesVerified
        ? 'Identidade e escopos verificados pela API; isso não confirma monetização.'
        : 'Identidade verificada; escopos não retornados por esta integração. Validade pode ter sido informada pelo operador.',
    };
  }

  private async load(channelId: string, platform: Platform): Promise<Credential | null> {
    const raw = await this.vault.get(channelId, platform);
    if (raw === null) return null;
    try {
      const value = record(JSON.parse(raw));
      if (
        value.version !== 1 ||
        value.channelId !== channelId ||
        value.platform !== platform ||
        typeof value.accountId !== 'string' ||
        typeof value.accessToken !== 'string' ||
        typeof value.displayName !== 'string' ||
        typeof value.connectedAt !== 'string' ||
        !Array.isArray(value.scopes) ||
        !value.scopes.every((item) => typeof item === 'string') ||
        (value.expiresAt !== null &&
          (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))))
      )
        throw Error();
      identityInput(platform, value.accountId);
      secret(value.accessToken);
      return value as unknown as Credential;
    } catch {
      throw new SocialError(
        'invalid_binding',
        'Credencial protegida inválida ou vinculada a outro canal/rede. Conecte novamente.',
      );
    }
  }

  async listConnections(channelId: string): Promise<SocialConnection[]> {
    channel(channelId);
    return Promise.all(
      PLATFORMS.map(async (platform) => {
        const empty: SocialConnection = {
          channelId,
          platform,
          accountId: '',
          displayName: CAPABILITIES.find((item) => item.platform === platform)!.label,
          status: 'disconnected',
          connectedAt: null,
          expiresAt: null,
          scopes: [],
        };
        try {
          const credential = await this.load(channelId, platform);
          return credential ? this.publicConnection(credential) : empty;
        } catch {
          return {
            ...empty,
            status: 'error',
            message: 'Não foi possível abrir a conexão no cofre do sistema. Nenhum segredo foi exposto.',
          };
        }
      }),
    );
  }

  async connectToken(input: TokenConnectionInput): Promise<SocialConnection> {
    channel(input.channelId);
    identityInput(input.platform, input.accountId);
    secret(input.accessToken);
    if (
      input.expiresAt &&
      (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= this.now())
    )
      throw new SocialError('expired', 'Validade do token ausente, inválida ou expirada.');
    return this.locked(`${input.channelId}/${input.platform}`, async () => {
      const identity = await this.verifyIdentity(input.platform, input.accountId, input.accessToken);
      const metadata =
        input.platform === 'youtube'
          ? await this.tokenMetadata(input.accessToken)
          : { scopes: [], scopesVerified: false, expiresAt: input.expiresAt ?? null };
      const credential: Credential = {
        version: 1,
        channelId: input.channelId,
        platform: input.platform,
        accountId: input.accountId,
        displayName: identity.displayName,
        accessToken: input.accessToken,
        scopes: metadata.scopes,
        scopesVerified: metadata.scopesVerified,
        expiresAt: metadata.expiresAt,
        connectedAt: new Date(this.now()).toISOString(),
      };
      const profile = profileUrl(input.platform, input.accountId, identity.data);
      if (profile) credential.profileUrl = profile;
      await this.vault.set(input.channelId, input.platform, JSON.stringify(credential));
      return this.publicConnection(credential);
    });
  }

  async startOAuth(input: OAuthInput): Promise<{ authorizationUrl: string; expiresAt: string }> {
    channel(input.channelId);
    if (!PLATFORMS.includes(input.platform)) throw new SocialError('invalid_platform', 'Rede inválida.');
    const expected =
      input.platform === 'tiktok'
        ? tiktokUsername(input.accountId)
        : input.platform === 'instagram'
          ? instagramAccount(input.accountId)
          : (identityInput(input.platform, input.accountId), input.accountId);
    secret(input.clientId);
    secret(input.clientSecret);
    // Facebook Login for Business names its permissions in a configuration, not in `scope`.
    if (
      input.configId !== undefined &&
      (!['facebook', 'instagram'].includes(input.platform) || !/^\d{1,32}$/.test(input.configId))
    )
      throw new SocialError('invalid_config', 'ID de configuração do Facebook Login for Business inválido.');
    let redirect: URL;
    try {
      redirect = new URL(input.redirectUri);
    } catch {
      throw new SocialError('invalid_redirect', 'Callback OAuth inválido.');
    }
    if (
      !['http:', 'https:'].includes(redirect.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(redirect.hostname) ||
      redirect.pathname !== `/api/oauth/${input.platform}/callback` ||
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash ||
      redirect.port === '0'
    ) {
      throw new SocialError(
        'invalid_redirect',
        'OAuth exige callback de loopback local registrado exatamente no aplicativo do provedor.',
      );
    }
    const provider = OAUTH[input.platform];
    // The relay forwards to the port carried in front of the state, so a Studio on another
    // port still gets its callback.
    const relay = this.relays[input.platform];
    const redirectUri = relay ?? input.redirectUri;
    const pkce = Boolean(provider.pkce) && !relay;
    return this.locked(`${input.channelId}/${input.platform}`, async () => {
      for (const [key, value] of this.pending)
        if (
          value.expiresAt <= this.now() ||
          (value.channelId === input.channelId && value.platform === input.platform)
        )
          this.pending.delete(key);
      if (this.pending.size >= 128)
        throw new SocialError('oauth_busy', 'Há muitas autorizações pendentes. Aguarde a expiração.');
      await this.vault.set(
        input.channelId,
        `${input.platform}-client`,
        JSON.stringify({ clientId: input.clientId, clientSecret: input.clientSecret }),
      );
      const state = `${relay ? `${redirect.port || (redirect.protocol === 'https:' ? '443' : '80')}.` : ''}${randomBytes(24).toString('hex')}`;
      const verifier = randomBytes(32).toString('base64url');
      const expiresAt = this.now() + 10 * 60 * 1000;
      this.pending.set(state, {
        channelId: input.channelId,
        platform: input.platform,
        expected,
        clientId: input.clientId,
        redirectUri,
        verifier,
        pkce,
        expiresAt,
      });
      const url = new URL(provider.authorize);
      for (const [key, value] of Object.entries({
        [provider.clientParam]: input.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        ...provider.extra,
        ...(input.configId
          ? { config_id: input.configId, override_default_response_type: 'true' }
          : { scope: provider.scopes.join(provider.separator) }),
        state,
        ...(provider.pkce && pkce
          ? {
              code_challenge: createHash('sha256')
                .update(verifier)
                .digest(provider.pkce === 'hex' ? 'hex' : 'base64url'),
              code_challenge_method: 'S256',
            }
          : {}),
      }))
        url.searchParams.set(key, value);
      return { authorizationUrl: url.toString(), expiresAt: new Date(expiresAt).toISOString() };
    });
  }

  async callbackOAuth(platform: Platform, input: { state: string; code: string }): Promise<SocialConnection> {
    const pending = this.pending.get(input.state);
    const invalid = () =>
      new SocialError(
        'invalid_state',
        'Autorização OAuth ausente, expirada ou já utilizada. Inicie novamente.',
      );
    // A state is bound to one network: the callback of another network cannot redeem it.
    if (!pending || pending.platform !== platform) throw invalid();
    return this.locked(`${pending.channelId}/${platform}`, async () => {
      if (this.pending.get(input.state) !== pending || pending.expiresAt <= this.now()) {
        this.pending.delete(input.state);
        throw invalid();
      }
      this.pending.delete(input.state);
      secret(input.code);
      const config = await this.oauthClient(pending.channelId, platform);
      if (config.clientId !== pending.clientId)
        throw new SocialError('oauth_changed', 'A configuração OAuth mudou; inicie novamente.');
      const credential =
        platform === 'youtube'
          ? await this.youtubeCallback(pending, config.clientSecret, input.code)
          : platform === 'tiktok'
            ? await this.tiktokCallback(pending, config.clientSecret, input.code)
            : await this.metaCallback(pending, config.clientSecret, input.code);
      await this.vault.set(pending.channelId, platform, JSON.stringify(credential));
      return this.publicConnection(credential);
    });
  }

  private credential(
    pending: PendingOAuth,
    accountId: string,
    identity: Identity,
    token: { accessToken: string; refreshToken?: string; expiresAt: string | null },
    scopes: { scopes: string[]; scopesVerified: boolean },
  ): Credential {
    const profile = profileUrl(pending.platform, accountId, identity.data);
    return {
      version: 1,
      channelId: pending.channelId,
      platform: pending.platform,
      accountId,
      displayName: identity.displayName,
      accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
      expiresAt: token.expiresAt,
      scopes: scopes.scopes,
      scopesVerified: scopes.scopesVerified,
      connectedAt: new Date(this.now()).toISOString(),
      clientId: pending.clientId,
      ...(profile ? { profileUrl: profile } : {}),
    };
  }

  private async youtubeCallback(
    pending: PendingOAuth,
    clientSecret: string,
    code: string,
  ): Promise<Credential> {
    const token = await this.request(
      'https://oauth2.googleapis.com/token',
      undefined,
      new URLSearchParams({
        code,
        client_id: pending.clientId,
        client_secret: clientSecret,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.verifier,
        grant_type: 'authorization_code',
      }),
    );
    if (typeof token.access_token !== 'string')
      throw new SocialError('invalid_response', 'Google não retornou um token válido.');
    secret(token.access_token);
    const metadata = await this.tokenMetadata(token.access_token);
    if (metadata.clientId && metadata.clientId !== pending.clientId)
      throw new SocialError('account_mismatch', 'Token emitido para outro aplicativo OAuth.');
    const identity = await this.verifyIdentity('youtube', pending.expected, token.access_token);
    return this.credential(
      pending,
      pending.expected,
      identity,
      {
        accessToken: token.access_token,
        ...(typeof token.refresh_token === 'string' ? { refreshToken: token.refresh_token } : {}),
        expiresAt: metadata.expiresAt,
      },
      metadata,
    );
  }

  /** TikTok token responses carry open_id, scope and both lifetimes at the top level. */
  private tiktokToken(token: Record<string, unknown>): {
    openId: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: string | null;
    scopes: string[];
  } {
    if (typeof token.access_token !== 'string' || typeof token.open_id !== 'string')
      throw new SocialError('invalid_response', 'O TikTok não retornou um token válido.');
    secret(token.access_token);
    identityInput('tiktok', token.open_id);
    const expires = numeric(token.expires_in);
    return {
      openId: token.open_id,
      accessToken: token.access_token,
      ...(typeof token.refresh_token === 'string' ? { refreshToken: token.refresh_token } : {}),
      expiresAt: expires !== null && expires > 0 ? new Date(this.now() + expires * 1000).toISOString() : null,
      scopes:
        typeof token.scope === 'string'
          ? token.scope
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
    };
  }

  private async tiktokCallback(
    pending: PendingOAuth,
    clientSecret: string,
    code: string,
  ): Promise<Credential> {
    const token = this.tiktokToken(
      await this.request(
        `${TIKTOK}/oauth/token/`,
        undefined,
        new URLSearchParams({
          client_key: pending.clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: pending.redirectUri,
          ...(pending.pkce ? { code_verifier: pending.verifier } : {}),
        }),
      ),
    );
    const identity = await this.verifyIdentity('tiktok', token.openId, token.accessToken, false, true);
    if (
      typeof identity.data.username !== 'string' ||
      identity.data.username.toLowerCase() !== pending.expected.toLowerCase()
    )
      throw new SocialError('account_mismatch', 'O token não corresponde à conta TikTok esperada.');
    return this.credential(pending, token.openId, identity, token, {
      scopes: token.scopes,
      scopesVerified: true,
    });
  }

  /** Facebook Login: code → user token → long-lived user token; a Page keeps its own Page token. */
  private async metaCallback(pending: PendingOAuth, clientSecret: string, code: string): Promise<Credential> {
    const exchange = async (params: Record<string, string>) => {
      const token = await this.request(
        `${GRAPH}/oauth/access_token`,
        undefined,
        new URLSearchParams({ client_id: pending.clientId, client_secret: clientSecret, ...params }),
      );
      if (typeof token.access_token !== 'string')
        throw new SocialError('invalid_response', 'A Meta não retornou um token válido.');
      secret(token.access_token);
      return token;
    };
    // A Facebook Login for Business configuration that issues a system-user token exchanges the
    // code without redirect_uri (Meta answers code 1 when it is present); user tokens need it.
    const short = await exchange({ code, redirect_uri: pending.redirectUri }).catch((error: unknown) => {
      if (error instanceof SocialError && error.code === 'api_denied') return exchange({ code });
      throw error;
    });
    // A system-user token (Unified login configurations) never expires and refuses the
    // long-lived exchange; keep it as it came.
    const long = await exchange({
      grant_type: 'fb_exchange_token',
      fb_exchange_token: short.access_token as string,
    }).catch((error: unknown) => {
      if (error instanceof SocialError && error.code === 'api_denied') return short;
      throw error;
    });
    const userToken = long.access_token as string;
    const permissions = await this.request(`${GRAPH}/me/permissions`, userToken);
    const scopes = array(permissions.data)
      .map(record)
      .filter((item) => item.status === 'granted' && typeof item.permission === 'string')
      .map((item) => item.permission as string);
    if (pending.platform === 'instagram') {
      const accountId = pending.expected.startsWith('@')
        ? await this.instagramId(
            pending.expected.slice(1),
            userToken,
            scopes,
            `${pending.clientId}|${clientSecret}`,
          )
        : pending.expected;
      const identity = await this.verifyIdentity('instagram', accountId, userToken);
      const expires = numeric(long.expires_in);
      return this.credential(
        pending,
        accountId,
        identity,
        {
          accessToken: userToken,
          expiresAt:
            expires !== null && expires > 0 ? new Date(this.now() + expires * 1000).toISOString() : null,
        },
        { scopes, scopesVerified: Array.isArray(permissions.data) },
      );
    }
    let pageToken: string | undefined;
    let cursor: string | undefined;
    // "Name (ID)" of each Page Meta granted, so a wrong ID can be corrected from the error.
    const seen: string[] = [];
    const describe = (item: Record<string, unknown>) =>
      `${
        typeof item.name === 'string'
          ? item.name
              .trim()
              .replace(/[\u0000-\u001f]/g, '')
              .slice(0, 60)
          : 'Página'
      } (${String(item.id).slice(0, 32)})`;
    for (let page = 0; page < 10 && !pageToken; page++) {
      const url = new URL(`${GRAPH}/me/accounts`);
      url.searchParams.set('fields', 'id,name,access_token');
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('after', cursor);
      const pages = await this.request(url.toString(), userToken);
      for (const item of array(pages.data).map(record))
        if (typeof item.id === 'string' && /^\d{1,32}$/.test(item.id) && seen.length < 5)
          seen.push(describe(item));
      const match = array(pages.data)
        .map(record)
        .find((item) => item.id === pending.expected);
      if (typeof match?.access_token === 'string') pageToken = match.access_token;
      const after = record(record(pages.paging).cursors).after;
      if (!record(pages.paging).next || typeof after !== 'string' || after.length > 2048) break;
      cursor = after;
    }
    if (!pageToken && !seen.length) {
      // /me/accounts came back empty: ask for the Page picked at login directly.
      const granted = await this.grantedTargets(userToken, `${pending.clientId}|${clientSecret}`).catch(
        () => ({ pages: [] as string[], instagram: [] as string[] }),
      );
      for (const pageId of [...new Set([pending.expected, ...granted.pages])].slice(0, 10)) {
        const item = await this.request(`${GRAPH}/${pageId}?fields=id,name,access_token`, userToken).catch(
          () => undefined,
        );
        if (!item || typeof item.id !== 'string') continue;
        if (item.id === pending.expected && typeof item.access_token === 'string') {
          pageToken = item.access_token;
          break;
        }
        if (seen.length < 5) seen.push(describe(item));
      }
    }
    if (!pageToken)
      throw new SocialError(
        'account_mismatch',
        seen.length
          ? `A Página ${pending.expected} não está entre as Páginas liberadas: ${seen.join(', ')}. Use o ID de uma delas e conecte de novo.`
          : `A Meta não liberou nenhuma Página para o Studio (concedidas: ${scopes.join(', ') || 'nenhuma'}). Conecte de novo aceitando todas as permissões e marque a Página na tela da Meta.`,
      );
    secret(pageToken);
    const identity = await this.verifyIdentity('facebook', pending.expected, pageToken);
    // A Page token derived from a long-lived user token carries no expiry of its own.
    return this.credential(
      pending,
      pending.expected,
      identity,
      { accessToken: pageToken, expiresAt: null },
      { scopes, scopesVerified: Array.isArray(permissions.data) },
    );
  }

  private async ready(
    channelId: string,
    platform: Platform,
  ): Promise<{ credential: Credential; identity: Identity }> {
    let credential = await this.load(channelId, platform);
    if (!credential)
      throw new SocialError('not_connected', 'Conecte a conta desta rede antes de sincronizar.');
    const expiry = credential.expiresAt !== null ? Date.parse(credential.expiresAt) : null;
    const before = JSON.stringify(credential);
    if (
      (platform === 'youtube' || platform === 'tiktok') &&
      expiry !== null &&
      expiry <= this.now() + 60000 &&
      credential.refreshToken &&
      credential.clientId
    ) {
      const config = await this.oauthClient(channelId, platform);
      if (config.clientId !== credential.clientId)
        throw new SocialError('oauth_changed', 'Cliente OAuth indisponível ou alterado; conecte novamente.');
      credential =
        platform === 'youtube'
          ? await this.refreshYoutube(credential, config.clientSecret)
          : await this.refreshTiktok(credential, config.clientSecret);
    } else if (expiry !== null && expiry <= this.now())
      throw new SocialError('expired', 'Token expirado; conecte novamente esta conta.');
    const identity = await this.verifyIdentity(
      platform,
      credential.accountId,
      credential.accessToken,
      // Counters need user.info.stats; a token saved by hand has no verified scopes and keeps asking.
      platform === 'tiktok' && (!credential.scopesVerified || credential.scopes.includes('user.info.stats')),
      platform === 'tiktok' && credential.scopes.includes('user.info.profile'),
    );
    const profile = profileUrl(platform, credential.accountId, identity.data);
    if (profile) credential = { ...credential, profileUrl: profile };
    if (JSON.stringify(credential) !== before)
      await this.vault.set(channelId, platform, JSON.stringify(credential));
    return { credential, identity };
  }

  private async refreshYoutube(credential: Credential, clientSecret: string): Promise<Credential> {
    const refreshed = await this.request(
      'https://oauth2.googleapis.com/token',
      undefined,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credential.refreshToken!,
        client_id: credential.clientId!,
        client_secret: clientSecret,
      }),
    );
    if (typeof refreshed.access_token !== 'string')
      throw new SocialError('invalid_response', 'Google não retornou token renovado válido.');
    secret(refreshed.access_token);
    const metadata = await this.tokenMetadata(refreshed.access_token);
    if (metadata.clientId && metadata.clientId !== credential.clientId)
      throw new SocialError('account_mismatch', 'Token renovado pertence a outro aplicativo.');
    return {
      ...credential,
      accessToken: refreshed.access_token,
      ...(typeof refreshed.refresh_token === 'string' ? { refreshToken: refreshed.refresh_token } : {}),
      scopes: metadata.scopes,
      scopesVerified: metadata.scopesVerified,
      expiresAt: metadata.expiresAt,
    };
  }

  private async refreshTiktok(credential: Credential, clientSecret: string): Promise<Credential> {
    const token = this.tiktokToken(
      await this.request(
        `${TIKTOK}/oauth/token/`,
        undefined,
        new URLSearchParams({
          client_key: credential.clientId!,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: credential.refreshToken!,
        }),
      ),
    );
    if (token.openId !== credential.accountId)
      throw new SocialError('account_mismatch', 'O token não corresponde à conta TikTok esperada.');
    return {
      ...credential,
      accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
      scopes: token.scopes,
      scopesVerified: true,
      expiresAt: token.expiresAt,
    };
  }

  private closedWindow(): { periodStart: string; periodEnd: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(this.now()));
    const get = (name: string) => Number(parts.find((part) => part.type === name)!.value);
    const end = Date.UTC(get('year'), get('month') - 1, get('day')) - 86400000;
    return {
      periodStart: new Date(end - 27 * 86400000).toISOString().slice(0, 10),
      periodEnd: new Date(end).toISOString().slice(0, 10),
    };
  }

  async sync(channelId: string, platform: Platform): Promise<SocialSnapshot> {
    channel(channelId);
    if (!PLATFORMS.includes(platform)) throw new SocialError('invalid_platform', 'Rede inválida.');
    return this.locked(`${channelId}/${platform}`, async () => {
      const { credential, identity } = await this.ready(channelId, platform);
      const fetchedAt = new Date(this.now()).toISOString();
      const snapshot: SocialSnapshot = {
        id: randomUUID(),
        channelId,
        platform,
        accountId: credential.accountId,
        fetchedAt,
        periodStart: fetchedAt.slice(0, 10),
        periodEnd: fetchedAt.slice(0, 10),
        stats: { views: null, followers: null, watchMinutes: null, likes: null },
        revenue: {
          estimatedCents: null,
          paidCents: null,
          currency: 'BRL',
          availability: 'unavailable',
          reason: CAPABILITIES.find((item) => item.platform === platform)!.revenueNote,
        },
      };
      if (platform !== 'youtube') {
        snapshot.stats.followers = count(
          platform === 'tiktok' ? identity.data.follower_count : identity.data.followers_count,
        );
        snapshot.stats.likes = count(
          platform === 'tiktok'
            ? identity.data.likes_count
            : platform === 'facebook'
              ? identity.data.fan_count
              : undefined,
        );
        snapshot.revenue.reason +=
          ' Contadores de perfil/Página são instantâneos e não uma série de desempenho de 28 dias.';
        return snapshot;
      }
      Object.assign(snapshot, this.closedWindow());
      const report = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
      for (const [key, value] of Object.entries({
        ids: `channel==${credential.accountId}`,
        startDate: snapshot.periodStart,
        endDate: snapshot.periodEnd,
        metrics: 'views,estimatedMinutesWatched,likes',
      }))
        report.searchParams.set(key, value);
      const activity = await this.request(report.toString(), credential.accessToken);
      snapshot.stats.views = reportMetric(activity, 'views');
      snapshot.stats.watchMinutes = reportMetric(activity, 'estimatedMinutesWatched');
      snapshot.stats.likes = reportMetric(activity, 'likes');
      snapshot.stats.followers = count(record(identity.data.statistics).subscriberCount);
      if (credential.scopesVerified && !credential.scopes.includes(MONETARY_READ)) {
        snapshot.revenue.availability = 'missing_scope';
        snapshot.revenue.reason =
          'Falta autorização yt-analytics-monetary.readonly confirmada pela API. Receita permanece desconhecida.';
        return snapshot;
      }
      report.searchParams.set('metrics', 'estimatedRevenue');
      report.searchParams.set('currency', 'BRL');
      try {
        const monetary = await this.request(report.toString(), credential.accessToken);
        const revenue = reportMetric(monetary, 'estimatedRevenue');
        if (revenue !== null) {
          const cents = Math.round((revenue + Number.EPSILON) * 100);
          if (!Number.isSafeInteger(cents))
            throw new SocialError('invalid_response', 'Receita fora do limite seguro.');
          snapshot.revenue.estimatedCents = cents;
          snapshot.revenue.availability = 'available';
          snapshot.revenue.reason =
            'Fonte: YouTube Analytics API estimatedRevenue, em BRL. Estimativa sujeita a atraso e ajustes; não comprova pagamento ou aprovação atual no YPP.';
        } else
          snapshot.revenue.reason =
            'A YouTube Analytics API não retornou receita na janela; ausência não equivale a zero ou confirmação de monetização.';
      } catch {
        snapshot.revenue.reason =
          'Relatório monetário indisponível na YouTube Analytics API; confira escopos, habilitação e permissões. Valor permanece desconhecido.';
      }
      return snapshot;
    });
  }

  async discoverYoutube(channelId: string, query: string): Promise<YoutubeDiscovery> {
    channel(channelId);
    if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 120)
      throw new SocialError('invalid_query', 'Pesquise entre 2 e 120 caracteres.');
    query = query.trim();
    return this.locked(`${channelId}/youtube`, async () => {
      const { credential } = await this.ready(channelId, 'youtube');
      const search = new URL('https://www.googleapis.com/youtube/v3/search');
      for (const [key, value] of Object.entries({
        part: 'snippet',
        type: 'video',
        maxResults: '8',
        q: query,
      }))
        search.searchParams.set(key, value);
      const response = await this.request(search.toString(), credential.accessToken);
      const items = array(response.items)
        .slice(0, 8)
        .map((value) => {
          const item = record(value);
          const snippet = record(item.snippet);
          const videoId = record(item.id).videoId;
          if (
            typeof videoId !== 'string' ||
            !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
            typeof snippet.publishedAt !== 'string' ||
            !Number.isFinite(Date.parse(snippet.publishedAt))
          )
            return null;
          return {
            videoId,
            title: label(snippet.title, 'Vídeo'),
            channelTitle: label(snippet.channelTitle, 'Canal'),
            publishedAt: snippet.publishedAt,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            views: null as number | null,
            likes: null as number | null,
            comments: null as number | null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      if (items.length) {
        const videos = new URL('https://www.googleapis.com/youtube/v3/videos');
        videos.searchParams.set('part', 'statistics,contentDetails');
        videos.searchParams.set('id', items.map((item) => item.videoId).join(','));
        const details = await this.request(videos.toString(), credential.accessToken);
        for (const item of items) {
          const match = array(details.items)
            .map(record)
            .find((value) => value.id === item.videoId);
          const stats = record(match?.statistics);
          item.views = count(stats.viewCount);
          item.likes = count(stats.likeCount);
          item.comments = count(stats.commentCount);
        }
      }
      return {
        query,
        queriedAt: new Date(this.now()).toISOString(),
        source: 'youtube_data_api',
        items,
        note: 'Amostra pública da YouTube Data API, limitada a 8 resultados. Não prova receita, demanda de mercado ou causalidade. A pesquisa consome quota da API e só é executada sob solicitação.',
      };
    });
  }

  /** Sends an approved video: non-public on YouTube, TikTok and Facebook; public on Instagram,
   * whose API has no draft or private mode. */
  async publish(channelId: string, platform: Platform, video: VideoUpload): Promise<PublishResult> {
    channel(channelId);
    if (!PLATFORMS.includes(platform)) throw new SocialError('invalid_platform', 'Rede inválida.');
    if (!canPublish(platform, video.vertical))
      throw new SocialError(
        'invalid_video',
        `O ${platformLabels[platform]} recebe só vídeo vertical, como Reel; envie o Short deste vídeo.`,
      );
    // Every limit is checked here, before any network call: the same file and text always get
    // the same answer.
    const post = postText(platform, {
      title: video.title,
      body: video.description,
      references: video.references ?? '',
      tag: video.tag,
    });
    if (!post.title) throw new SocialError('invalid_video', 'O vídeo precisa de título para ser enviado.');
    const info = await stat(video.path).catch(() => undefined);
    if (!info?.isFile() || info.size === 0)
      throw new SocialError('invalid_video', 'Arquivo de vídeo ausente; gere a versão final novamente.');
    let probe: VideoProbe;
    try {
      probe = await probeMp4(video.path);
    } catch (error) {
      throw new SocialError('invalid_video', (error as Error).message);
    }
    const problem = mediaProblem(platform, probe);
    if (problem) throw new SocialError('invalid_video', problem);
    const fitted = { ...video, title: post.title, description: post.text };
    return this.locked(`${channelId}/${platform}`, async () => {
      const { credential } = await this.ready(channelId, platform);
      if (!credential.scopes.includes(PUBLISH_SCOPE[platform]!))
        throw new SocialError(
          'missing_scope',
          `Reconecte o ${platformLabels[platform]} em Contas conectadas para autorizar o envio de vídeos.`,
        );
      try {
        if (platform === 'youtube') return await this.uploadYoutube(credential, fitted, info.size);
        if (platform === 'tiktok') return await this.uploadTiktok(credential, fitted, probe);
        if (platform === 'instagram') return await this.publishInstagram(credential, fitted, info.size);
        return await this.uploadReel(credential, fitted, info.size);
      } catch (error) {
        if (error instanceof SocialError) throw error;
        throw new SocialError(
          'api_unavailable',
          `Não foi possível concluir o envio ao ${platformLabels[platform]}. Nenhum token ou detalhe privado foi registrado.`,
        );
      }
    });
  }

  /** Resumable upload, always private: the operator reviews and publishes in YouTube Studio. */
  private async uploadYoutube(
    credential: Credential,
    video: VideoUpload,
    size: number,
  ): Promise<PublishResult> {
    const description = video.description;
    const authorization = `Bearer ${credential.accessToken}`;
    const session = await this.fetcher(`${UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': 'video/mp4',
        'x-upload-content-length': String(size),
      },
      body: JSON.stringify({
        snippet: { title: video.title, description, categoryId: '28' },
        status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!session.ok) throw await youtubeRefused(session);
    await session.body?.cancel();
    const location = uploadSession(session.headers.get('location'));
    const sent = await this.fetcher(location, {
      method: 'PUT',
      headers: { authorization, 'content-type': 'video/mp4', 'content-length': String(size) },
      body: Readable.toWeb(createReadStream(video.path)) as ReadableStream,
      duplex: 'half',
      redirect: 'error',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    } as RequestInit);
    if (!sent.ok) throw await uploadRefused('YouTube', sent);
    const videoId = (await this.readJson(sent)).id;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId))
      throw new SocialError('invalid_response', 'O YouTube não retornou o ID do vídeo enviado.');
    if (!video.thumbnail) return { postId: videoId };
    return { postId: videoId, thumbnail: await this.setThumbnail(videoId, video.thumbnail, authorization) };
  }

  /** Direct Post as SELF_ONLY ("Somente eu"): the operator changes the visibility in the TikTok app. */
  private async uploadTiktok(
    credential: Credential,
    video: VideoUpload,
    probe: VideoProbe,
  ): Promise<PublishResult> {
    const creator = record(
      (await this.request(`${TIKTOK}/post/publish/creator_info/query/`, credential.accessToken, { json: {} }))
        .data,
    );
    if (!array(creator.privacy_level_options).includes('SELF_ONLY'))
      throw new SocialError(
        'api_denied',
        'O TikTok não oferece "Somente eu" para esta conta; nada foi enviado.',
      );
    // The account's own ceiling can be shorter than the endpoint's 10 minutes.
    const ceiling = numeric(creator.max_video_post_duration_sec);
    if (ceiling !== null && ceiling > 0 && probe.seconds > ceiling)
      throw new SocialError(
        'invalid_video',
        `Esta conta do TikTok aceita até ${ceiling} s; este vídeo tem ${Math.round(probe.seconds)} s.`,
      );
    const size = probe.bytes;
    const chunk = size < TIKTOK_MIN_CHUNK ? size : Math.min(TIKTOK_CHUNK, size);
    const chunks = Math.floor(size / chunk);
    if (chunks > 1000) throw new SocialError('invalid_video', 'Vídeo grande demais para o TikTok.');
    const source = {
      source: 'FILE_UPLOAD',
      video_size: size,
      chunk_size: chunk,
      total_chunk_count: chunks,
    };
    let draft = false;
    const direct = this.request(`${TIKTOK}/post/publish/video/init/`, credential.accessToken, {
      json: {
        post_info: {
          title: video.description,
          privacy_level: 'SELF_ONLY',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          // Synthetic narration and generated visuals: TikTok asks for the AI-generated label.
          is_aigc: true,
        },
        source_info: source,
      },
    }).catch(async (error: unknown) => {
      // An unaudited app can Direct Post only to a private account. The inbox upload has no such
      // rule: the video waits in the creator's TikTok inbox, to be edited and posted in the app.
      if (
        !(error instanceof SocialError) ||
        error.providerCode !== 'unaudited_client_can_only_post_to_private_accounts'
      )
        throw error;
      if (!credential.scopes.includes(TIKTOK_DRAFT))
        throw new SocialError(
          'reconnect_required',
          'O TikTok só aceita post direto de app não auditado em conta privada. Reconecte o TikTok (o Studio passa a pedir video.upload) para enviar como rascunho, ou deixe a conta privada.',
        );
      draft = true;
      return this.request(`${TIKTOK}/post/publish/inbox/video/init/`, credential.accessToken, {
        json: { source_info: source },
      });
    });
    const init = record((await direct).data);
    const publishId = init.publish_id;
    if (typeof publishId !== 'string' || !/^[A-Za-z0-9._~-]{1,64}$/.test(publishId))
      throw new SocialError('invalid_response', 'O TikTok não retornou o ID do envio.');
    // The upload host varies by region and by endpoint (open-upload, open-upload-i18n,
    // open-upload-va...); it is always a TikTok open-upload host.
    const target = providerUrl(init.upload_url, TIKTOK_UPLOAD_HOST, () => true);
    for (let index = 0; index < chunks; index++) {
      const start = index * chunk;
      const end = index === chunks - 1 ? size - 1 : start + chunk - 1;
      const sent = await this.fetcher(target, {
        method: 'PUT',
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(end - start + 1),
          'content-range': `bytes ${start}-${end}/${size}`,
        },
        body: Readable.toWeb(createReadStream(video.path, { start, end })) as ReadableStream,
        duplex: 'half',
        redirect: 'error',
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      } as RequestInit);
      if (!sent.ok) throw await uploadRefused('TikTok', sent);
      await sent.body?.cancel();
    }
    return { postId: publishId, ...(draft ? { draft: true } : {}) };
  }

  /** Instagram Reel, published publicly: container, rupload, processing check, media_publish. */
  private async publishInstagram(
    credential: Credential,
    video: VideoUpload,
    size: number,
  ): Promise<PublishResult> {
    const account = credential.accountId;
    const container = await this.request(
      `${GRAPH}/${account}/media`,
      credential.accessToken,
      new URLSearchParams({
        media_type: 'REELS',
        upload_type: 'resumable',
        caption: video.description,
        share_to_feed: 'true',
      }),
    );
    const containerId = container.id;
    if (typeof containerId !== 'string' || !/^\d{1,32}$/.test(containerId))
      throw new SocialError('invalid_response', 'O Instagram não retornou o contêiner do Reel.');
    const target = providerUrl(
      container.uri ?? `${INSTAGRAM_UPLOAD}/${containerId}`,
      'rupload.facebook.com',
      (pathname) => pathname === `/ig-api-upload/v26.0/${containerId}`,
    );
    const sent = await this.fetcher(target, {
      method: 'POST',
      headers: {
        authorization: `OAuth ${credential.accessToken}`,
        offset: '0',
        file_size: String(size),
        'content-type': 'application/octet-stream',
        'content-length': String(size),
      },
      body: Readable.toWeb(createReadStream(video.path)) as ReadableStream,
      duplex: 'half',
      redirect: 'error',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    } as RequestInit);
    if (!sent.ok) throw await uploadRefused('Instagram', sent);
    if ((await this.readJson(sent)).success !== true)
      throw new SocialError('invalid_response', 'O Instagram não confirmou o recebimento do arquivo.');
    // Publishing an unfinished container fails; nothing goes public until processing finished.
    let status: unknown;
    for (let poll = 0; poll < INSTAGRAM_POLLS && status !== 'FINISHED'; poll++) {
      await this.wait(INSTAGRAM_POLL_MS);
      status = (await this.request(`${GRAPH}/${containerId}?fields=status_code`, credential.accessToken))
        .status_code;
      if (status === 'ERROR' || status === 'EXPIRED')
        throw new SocialError('api_denied', 'O Instagram recusou o vídeo ao processar; nada foi publicado.');
    }
    if (status !== 'FINISHED')
      throw new SocialError(
        'api_unavailable',
        'O Instagram não terminou de processar o vídeo em 5 minutos; nada foi publicado. Tente de novo.',
      );
    const media = (
      await this.request(
        `${GRAPH}/${account}/media_publish`,
        credential.accessToken,
        new URLSearchParams({ creation_id: containerId }),
      )
    ).id;
    if (typeof media !== 'string' || !/^\d{1,32}$/.test(media))
      throw new SocialError('invalid_response', 'O Instagram não retornou o ID da publicação.');
    // The post is public already: a missing permalink is reported as absent, never as a failure.
    try {
      const link = (await this.request(`${GRAPH}/${media}?fields=permalink`, credential.accessToken))
        .permalink;
      const url = providerUrl(link, 'www.instagram.com', (pathname) =>
        /^\/(reel|p)\/[A-Za-z0-9_-]{1,64}\/?$/.test(pathname),
      );
      return { postId: media, url };
    } catch {
      return { postId: media };
    }
  }

  /** Facebook Reel saved as DRAFT: the operator publishes it in Meta Business Suite. */
  private async uploadReel(credential: Credential, video: VideoUpload, size: number): Promise<PublishResult> {
    const reels = `${GRAPH}/${credential.accountId}/video_reels`;
    const start = await this.request(
      reels,
      credential.accessToken,
      new URLSearchParams({ upload_phase: 'start' }),
    );
    const videoId = start.video_id;
    if (typeof videoId !== 'string' || !/^\d{1,32}$/.test(videoId))
      throw new SocialError('invalid_response', 'O Facebook não retornou o ID do vídeo.');
    const target = providerUrl(
      start.upload_url ?? `${REELS_UPLOAD}/${videoId}`,
      'rupload.facebook.com',
      (pathname) => pathname === `/video-upload/v26.0/${videoId}`,
    );
    const sent = await this.fetcher(target, {
      method: 'POST',
      headers: {
        authorization: `OAuth ${credential.accessToken}`,
        offset: '0',
        file_size: String(size),
        'content-type': 'application/octet-stream',
        'content-length': String(size),
      },
      body: Readable.toWeb(createReadStream(video.path)) as ReadableStream,
      duplex: 'half',
      redirect: 'error',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    } as RequestInit);
    if (!sent.ok) throw await uploadRefused('Facebook', sent);
    if ((await this.readJson(sent)).success !== true)
      throw new SocialError('invalid_response', 'O Facebook não confirmou o recebimento do arquivo.');
    const finish = await this.request(
      reels,
      credential.accessToken,
      new URLSearchParams({
        upload_phase: 'finish',
        video_id: videoId,
        video_state: 'DRAFT',
        title: video.title,
        description: video.description,
      }),
    );
    if (finish.success !== true)
      throw new SocialError('invalid_response', 'O Facebook não confirmou o rascunho do Reel.');
    return { postId: videoId };
  }

  /** The video is already uploaded: a refused thumbnail is reported, never thrown. */
  private async setThumbnail(
    videoId: string,
    path: string,
    authorization: string,
  ): Promise<YoutubeThumbnail> {
    try {
      const image = await readFile(path);
      if (image.length === 0 || image.length > MAX_THUMBNAIL)
        return { error: 'Thumbnail vazia ou acima de 2 MB; defina no YouTube Studio.' };
      const response = await this.fetcher(
        `${THUMBNAIL_ENDPOINT}?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
        {
          method: 'POST',
          headers: { authorization, 'content-type': 'image/png', 'content-length': String(image.length) },
          body: image,
          redirect: 'error',
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      await response.body?.cancel();
      if (response.ok) return 'set';
      return {
        error:
          response.status === 403
            ? 'O YouTube não permitiu thumbnail personalizada nesta conta (verifique o canal por telefone); defina no YouTube Studio.'
            : `O YouTube recusou a thumbnail (HTTP ${response.status}); defina no YouTube Studio.`,
      };
    } catch {
      return { error: 'Não foi possível enviar a thumbnail; defina no YouTube Studio.' };
    }
  }

  /** Connected profiles, cited in the descriptions sent to the other networks. */
  async profiles(channelId: string): Promise<ProfileLink[]> {
    return (await this.listConnections(channelId))
      .filter((connection) => connection.status === 'connected' && connection.profileUrl)
      .map((connection) => ({ platform: connection.platform, url: connection.profileUrl! }));
  }

  async disconnect(channelId: string, platform: Platform): Promise<void> {
    channel(channelId);
    if (!PLATFORMS.includes(platform)) throw new SocialError('invalid_platform', 'Rede inválida.');
    await this.locked(`${channelId}/${platform}`, async () => {
      await this.vault.delete(channelId, platform);
      await this.vault.delete(channelId, `${platform}-client`);
      for (const [key, value] of this.pending)
        if (value.channelId === channelId && value.platform === platform) this.pending.delete(key);
    });
  }
}

export function createSocialService(options: SocialServiceOptions): SocialService {
  return new SocialService(options);
}
