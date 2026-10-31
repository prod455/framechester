import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type {
  NetworkCapability,
  Platform,
  SocialApi,
  SocialConnection,
  SocialSnapshot,
  TokenConnectionInput,
  YoutubeOAuthInput,
  YoutubeThumbnail,
  YoutubeUpload,
} from '../shared/types.ts';
import type { SecretVault } from './vault.ts';

export type SocialFetch = (url: string, init?: RequestInit) => Promise<Response>;
export interface SocialServiceOptions {
  vault: SecretVault;
  fetch?: SocialFetch;
  now?: () => number;
  timeoutMs?: number;
}
export class SocialError extends Error {
  constructor(
    public readonly code: string,
    message: string,
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
const MAX_RESPONSE = 512 * 1024;
const CAPABILITIES: NetworkCapability[] = [
  {
    platform: 'youtube',
    label: 'YouTube',
    connectionMethod: 'oauth',
    metricsAvailable: true,
    revenueAvailable: true,
    publishingAvailable: true,
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
    connectionMethod: 'token',
    metricsAvailable: true,
    revenueAvailable: false,
    publishingAvailable: false,
    requirements: [
      'Aplicativo e token autorizados para a conta.',
      'Display API: user.info.basic e user.info.stats.',
    ],
    revenueNote:
      'A Display API usada aqui fornece perfil e contadores, não comprovantes ou receita do Creator Rewards. Recebimentos exigem importação manual.',
    docsUrl: 'https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info',
  },
  {
    platform: 'instagram',
    label: 'Instagram',
    connectionMethod: 'token',
    metricsAvailable: true,
    revenueAvailable: false,
    publishingAvailable: false,
    requirements: [
      'Conta profissional ligada a uma Página.',
      'Token de usuário do Facebook Login com pages_show_list, pages_read_engagement e instagram_basic, conforme aprovação do aplicativo.',
    ],
    revenueNote:
      'Esta integração lê contadores da conta profissional; não implementa API de recebimentos do Instagram. Importe comprovantes manualmente.',
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/',
  },
  {
    platform: 'facebook',
    label: 'Facebook',
    connectionMethod: 'token',
    metricsAvailable: true,
    revenueAvailable: false,
    publishingAvailable: false,
    requirements: [
      'Token de acesso da Página, não um perfil pessoal.',
      'Permissões de leitura da Página e aprovação exigida pela Meta.',
    ],
    revenueNote:
      'Esta integração lê contadores da Página e não integra receitas ou pagamentos. Importe comprovantes manualmente.',
    docsUrl: 'https://developers.facebook.com/docs/pages-api/',
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
}
interface PendingOAuth {
  channelId: string;
  accountId: string;
  clientId: string;
  redirectUri: string;
  verifier: string;
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
/** YouTube rejects angle brackets in titles and descriptions and limits their size. */
function youtubeText(value: string, maxBytes: number): string {
  let text = String(value).replace(/[<>]/g, '').trim();
  while (Buffer.byteLength(text, 'utf8') > maxBytes) text = text.slice(0, -1);
  return text;
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
  private readonly pending = new Map<string, PendingOAuth>();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(options: SocialServiceOptions) {
    this.vault = options.vault;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.timeoutMs = Math.min(30000, Math.max(1000, options.timeoutMs ?? 15000));
  }

  capabilities(): NetworkCapability[] {
    return structuredClone(CAPABILITIES);
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

  private async request(
    raw: string,
    token?: string,
    form?: URLSearchParams,
  ): Promise<Record<string, unknown>> {
    const url = new URL(raw);
    const allowed =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      ((url.hostname === 'www.googleapis.com' &&
        /^\/youtube\/v3\/(channels|search|videos)$/.test(url.pathname) &&
        !form) ||
        (url.hostname === 'youtubeanalytics.googleapis.com' && url.pathname === '/v2/reports' && !form) ||
        (url.hostname === 'oauth2.googleapis.com' && ['/token', '/tokeninfo'].includes(url.pathname)) ||
        (url.hostname === 'graph.facebook.com' &&
          /^\/v26\.0\/(me(?:\/accounts)?|\d{1,32})$/.test(url.pathname) &&
          !form) ||
        (url.hostname === 'open.tiktokapis.com' && url.pathname === '/v2/user/info/' && !form));
    if (!allowed || url.searchParams.has('access_token'))
      throw new SocialError('blocked_endpoint', 'Endpoint não permitido.');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const method = form || url.pathname === '/tokeninfo' ? 'POST' : 'GET';
    if (method === 'POST') headers['content-type'] = 'application/x-www-form-urlencoded';
    try {
      const response = await this.fetcher(url.toString(), {
        method,
        headers,
        ...(form ? { body: form.toString() } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new SocialError(
          'api_denied',
          `Consulta recusada ou indisponível na API (HTTP ${response.status}).`,
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

  private async youtubeClient(channelId: string): Promise<{ clientId: string; clientSecret: string }> {
    try {
      const config = record(JSON.parse((await this.vault.get(channelId, 'youtube-client')) ?? '{}'));
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
      const fields = stats
        ? 'open_id,display_name,follower_count,likes_count,video_count'
        : 'open_id,display_name';
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
      if (!owned)
        throw new SocialError(
          'account_mismatch',
          'Conta Instagram não encontrada nas Páginas autorizadas para este token.',
        );
      const data = await this.request(
        `${GRAPH}/${accountId}?fields=id,username,followers_count,media_count`,
        token,
      );
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
      await this.vault.set(input.channelId, input.platform, JSON.stringify(credential));
      return this.publicConnection(credential);
    });
  }

  async startYoutubeOAuth(
    input: YoutubeOAuthInput,
  ): Promise<{ authorizationUrl: string; expiresAt: string }> {
    channel(input.channelId);
    identityInput('youtube', input.accountId);
    secret(input.clientId);
    secret(input.clientSecret);
    let redirect: URL;
    try {
      redirect = new URL(input.redirectUri);
    } catch {
      throw new SocialError('invalid_redirect', 'Callback OAuth inválido.');
    }
    if (
      !['http:', 'https:'].includes(redirect.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(redirect.hostname) ||
      redirect.pathname !== '/api/oauth/youtube/callback' ||
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash ||
      redirect.port === '0'
    ) {
      throw new SocialError(
        'invalid_redirect',
        'OAuth exige callback de loopback local registrado exatamente no cliente Google.',
      );
    }
    return this.locked(`${input.channelId}/youtube`, async () => {
      for (const [key, value] of this.pending)
        if (value.expiresAt <= this.now() || value.channelId === input.channelId) this.pending.delete(key);
      if (this.pending.size >= 128)
        throw new SocialError('oauth_busy', 'Há muitas autorizações pendentes. Aguarde a expiração.');
      await this.vault.set(
        input.channelId,
        'youtube-client',
        JSON.stringify({ clientId: input.clientId, clientSecret: input.clientSecret }),
      );
      const state = randomBytes(24).toString('hex');
      const verifier = randomBytes(32).toString('base64url');
      const expiresAt = this.now() + 10 * 60 * 1000;
      this.pending.set(state, {
        channelId: input.channelId,
        accountId: input.accountId,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        verifier,
        expiresAt,
      });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [key, value] of Object.entries({
        client_id: input.clientId,
        redirect_uri: input.redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: YOUTUBE_SCOPES.join(' '),
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }))
        url.searchParams.set(key, value);
      return { authorizationUrl: url.toString(), expiresAt: new Date(expiresAt).toISOString() };
    });
  }

  async callbackYoutubeOAuth(input: { state: string; code: string }): Promise<SocialConnection> {
    const pending = this.pending.get(input.state);
    if (!pending)
      throw new SocialError(
        'invalid_state',
        'Autorização OAuth ausente, expirada ou já utilizada. Inicie novamente.',
      );
    return this.locked(`${pending.channelId}/youtube`, async () => {
      if (this.pending.get(input.state) !== pending || pending.expiresAt <= this.now()) {
        this.pending.delete(input.state);
        throw new SocialError(
          'invalid_state',
          'Autorização OAuth ausente, expirada ou já utilizada. Inicie novamente.',
        );
      }
      this.pending.delete(input.state);
      secret(input.code);
      const config = await this.youtubeClient(pending.channelId);
      if (config.clientId !== pending.clientId)
        throw new SocialError('oauth_changed', 'A configuração OAuth mudou; inicie novamente.');
      const token = await this.request(
        'https://oauth2.googleapis.com/token',
        undefined,
        new URLSearchParams({
          code: input.code,
          client_id: pending.clientId,
          client_secret: config.clientSecret,
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
      const identity = await this.verifyIdentity('youtube', pending.accountId, token.access_token);
      const credential: Credential = {
        version: 1,
        channelId: pending.channelId,
        platform: 'youtube',
        accountId: pending.accountId,
        displayName: identity.displayName,
        accessToken: token.access_token,
        ...(typeof token.refresh_token === 'string' ? { refreshToken: token.refresh_token } : {}),
        expiresAt: metadata.expiresAt,
        scopes: metadata.scopes,
        scopesVerified: metadata.scopesVerified,
        connectedAt: new Date(this.now()).toISOString(),
        clientId: pending.clientId,
      };
      await this.vault.set(pending.channelId, 'youtube', JSON.stringify(credential));
      return this.publicConnection(credential);
    });
  }

  private async ready(
    channelId: string,
    platform: Platform,
  ): Promise<{ credential: Credential; identity: Identity }> {
    let credential = await this.load(channelId, platform);
    if (!credential)
      throw new SocialError('not_connected', 'Conecte a conta desta rede antes de sincronizar.');
    const expiry = credential.expiresAt !== null ? Date.parse(credential.expiresAt) : null;
    if (
      platform === 'youtube' &&
      expiry !== null &&
      expiry <= this.now() + 60000 &&
      credential.refreshToken &&
      credential.clientId
    ) {
      const config = await this.youtubeClient(channelId);
      if (config.clientId !== credential.clientId)
        throw new SocialError('oauth_changed', 'Cliente OAuth indisponível ou alterado; conecte novamente.');
      const refreshed = await this.request(
        'https://oauth2.googleapis.com/token',
        undefined,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: credential.refreshToken,
          client_id: credential.clientId,
          client_secret: config.clientSecret,
        }),
      );
      if (typeof refreshed.access_token !== 'string')
        throw new SocialError('invalid_response', 'Google não retornou token renovado válido.');
      secret(refreshed.access_token);
      const metadata = await this.tokenMetadata(refreshed.access_token);
      if (metadata.clientId && metadata.clientId !== credential.clientId)
        throw new SocialError('account_mismatch', 'Token renovado pertence a outro aplicativo.');
      const identity = await this.verifyIdentity(platform, credential.accountId, refreshed.access_token);
      credential = {
        ...credential,
        accessToken: refreshed.access_token,
        ...(typeof refreshed.refresh_token === 'string' ? { refreshToken: refreshed.refresh_token } : {}),
        scopes: metadata.scopes,
        scopesVerified: metadata.scopesVerified,
        expiresAt: metadata.expiresAt,
      };
      await this.vault.set(channelId, platform, JSON.stringify(credential));
      return { credential, identity };
    }
    if (expiry !== null && expiry <= this.now())
      throw new SocialError('expired', 'Token expirado; conecte novamente esta conta.');
    return {
      credential,
      identity: await this.verifyIdentity(
        platform,
        credential.accountId,
        credential.accessToken,
        platform === 'tiktok',
      ),
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

  /** Resumable upload, always private: the operator reviews and publishes in YouTube Studio. */
  async uploadYoutube(
    channelId: string,
    video: YoutubeUpload,
  ): Promise<{ videoId: string; thumbnail?: YoutubeThumbnail }> {
    channel(channelId);
    const title = youtubeText(video.title, 100);
    const description = youtubeText(video.description, 5000);
    if (!title) throw new SocialError('invalid_video', 'O vídeo precisa de título para ser enviado.');
    const info = await stat(video.path).catch(() => undefined);
    if (!info?.isFile() || info.size === 0)
      throw new SocialError('invalid_video', 'Arquivo de vídeo ausente; gere a versão final novamente.');
    return this.locked(`${channelId}/youtube`, async () => {
      const { credential } = await this.ready(channelId, 'youtube');
      if (!credential.scopes.includes(VIDEO_UPLOAD))
        throw new SocialError(
          'missing_scope',
          'Reconecte o YouTube em Contas conectadas para autorizar o envio de vídeos.',
        );
      const authorization = `Bearer ${credential.accessToken}`;
      try {
        const session = await this.fetcher(`${UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status`, {
          method: 'POST',
          headers: {
            authorization,
            'content-type': 'application/json; charset=UTF-8',
            'x-upload-content-type': 'video/mp4',
            'x-upload-content-length': String(info.size),
          },
          body: JSON.stringify({
            snippet: { title, description, categoryId: '28' },
            status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        await session.body?.cancel();
        if (!session.ok)
          throw new SocialError(
            'api_denied',
            `O YouTube recusou o envio (HTTP ${session.status}); confira a quota e as permissões do projeto.`,
          );
        const location = uploadSession(session.headers.get('location'));
        const sent = await this.fetcher(location, {
          method: 'PUT',
          headers: { authorization, 'content-type': 'video/mp4', 'content-length': String(info.size) },
          body: Readable.toWeb(createReadStream(video.path)) as ReadableStream,
          duplex: 'half',
          redirect: 'error',
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        } as RequestInit);
        if (!sent.ok) {
          await sent.body?.cancel();
          throw new SocialError('api_denied', `O YouTube recusou o arquivo (HTTP ${sent.status}).`);
        }
        const videoId = (await this.readJson(sent)).id;
        if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId))
          throw new SocialError('invalid_response', 'O YouTube não retornou o ID do vídeo enviado.');
        if (!video.thumbnail) return { videoId };
        return { videoId, thumbnail: await this.setThumbnail(videoId, video.thumbnail, authorization) };
      } catch (error) {
        if (error instanceof SocialError) throw error;
        throw new SocialError(
          'api_unavailable',
          'Não foi possível concluir o envio ao YouTube. Nenhum token ou detalhe privado foi registrado.',
        );
      }
    });
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

  async disconnect(channelId: string, platform: Platform): Promise<void> {
    channel(channelId);
    if (!PLATFORMS.includes(platform)) throw new SocialError('invalid_platform', 'Rede inválida.');
    await this.locked(`${channelId}/${platform}`, async () => {
      await this.vault.delete(channelId, platform);
      if (platform === 'youtube') {
        await this.vault.delete(channelId, 'youtube-client');
        for (const [key, value] of this.pending) if (value.channelId === channelId) this.pending.delete(key);
      }
    });
  }
}

export function createSocialService(options: SocialServiceOptions): SocialService {
  return new SocialService(options);
}
