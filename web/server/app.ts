import type { RequestListener, IncomingMessage, ServerResponse } from 'node:http';
import type {
  SocialApi,
  RunnerApi,
  Bootstrap,
  StartJobInput,
  UploadAssetInput,
  SocialConnection,
} from '../shared/types.ts';
import { LocalStore, defaultHome, object, validId, channelId, platform } from './store.ts';
import type { Collection } from './store.ts';
import { LocalAuth, HttpError } from './auth.ts';
import { SocialError } from './social.ts';
import { VaultError } from './vault.ts';
import { RunnerError } from './runner.ts';
import { createAutomaticProduction } from './automatic-production.ts';
import type { CreativeApi } from './creative.ts';
import type { PrivatePromptStore } from './private-prompt.ts';
import { resolve, extname, sep } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
export interface ServerOptions {
  home?: string;
  distDir?: string;
  dev?: boolean;
  publicPort?: number;
  store?: LocalStore;
  social?: SocialApi;
  runner?: RunnerApi;
  creative?: CreativeApi;
  privatePrompt?: PrivatePromptStore;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}
function string(value: unknown, name: string, max = 1000, min = 1): string {
  if (typeof value !== 'string' || value.length < min || value.length > max || value.includes('\0'))
    throw new HttpError(400, `Campo inválido: ${name}.`);
  return value;
}
function allowedKeys(item: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(item).some((key) => !allowed.includes(key)))
    throw new HttpError(400, 'O objeto contém campos não permitidos.');
}
function ownerBody(item: Record<string, unknown>, owner: string): void {
  if (item.channelId !== undefined && item.channelId !== owner)
    throw new HttpError(409, 'O recurso pertence a outro canal.');
}
async function readJson(request: IncomingMessage, limit = 1024 * 1024): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new HttpError(415, 'Use Content-Type application/json.');
  const declared = request.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new HttpError(413, 'O corpo da requisição excede o limite permitido.');
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failed = false;
    request.on('data', (chunk: Buffer) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > limit) {
        failed = true;
        chunks.length = 0;
        reject(new HttpError(413, 'O corpo da requisição excede o limite permitido.'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
  try {
    return object(JSON.parse(buffer.toString('utf8')));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'JSON inválido.');
  }
}
function headers(response: ServerResponse, dev: boolean): void {
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'${dev ? ' http://127.0.0.1:5173 http://localhost:5173 ws://127.0.0.1:5173 ws://localhost:5173' : ''}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
function checkOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  dev: boolean,
  publicPort?: number,
): void {
  const port = request.socket.localPort ?? 4317;
  const ports = [port, ...(publicPort === undefined ? [] : [publicPort]), ...(dev ? [5173] : [])];
  const hosts = ports.flatMap((value) => [`127.0.0.1:${value}`, `localhost:${value}`]);
  if (!request.headers.host || !hosts.includes(request.headers.host.toLowerCase()))
    throw new HttpError(403, 'Host local não permitido.');
  const origin = request.headers.origin;
  const origins = hosts.map((host) => `http://${host}`);
  if (origin && !origins.includes(origin)) throw new HttpError(403, 'Origem não permitida.');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? 'GET') && !origin)
    throw new HttpError(403, 'Origem local obrigatória nesta operação.');
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
}
function connection(row: SocialConnection): SocialConnection {
  return {
    channelId: row.channelId,
    platform: row.platform,
    accountId: row.accountId,
    displayName: row.displayName,
    status: row.status,
    connectedAt: row.connectedAt,
    expiresAt: row.expiresAt,
    scopes: [...row.scopes],
    ...(row.message ? { message: row.message } : {}),
  };
}
async function sendFile(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  contentType: string,
  attachment?: string,
): Promise<void> {
  const info = await stat(path);
  if (!info.isFile()) throw new HttpError(404, 'Arquivo não encontrado.');
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (!match || (!match[1] && !match[2])) {
      response.setHeader('Content-Range', `bytes */${info.size}`);
      throw new HttpError(416, 'Faixa de bytes inválida.');
    }
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, info.size - suffix);
    } else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= info.size ||
      start < 0
    ) {
      response.setHeader('Content-Range', `bytes */${info.size}`);
      throw new HttpError(416, 'Faixa de bytes inválida.');
    }
    status = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
  }
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', Math.max(0, end - start + 1));
  if (attachment) response.setHeader('Content-Disposition', `attachment; filename="${attachment}"`);
  response.writeHead(status);
  if (request.method === 'HEAD' || info.size === 0) {
    response.end();
    return;
  }
  const stream = createReadStream(path, { start, end });
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}
async function staticFile(
  request: IncomingMessage,
  response: ServerResponse,
  directory: string,
  decoded: string,
): Promise<void> {
  let root: string;
  try {
    root = await realpath(directory);
  } catch {
    throw new HttpError(503, 'A interface ainda não foi compilada. Execute o build web local.');
  }
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(root + sep))
    throw new HttpError(403, 'Caminho não permitido.');
  let target = candidate;
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = resolve(target, 'index.html');
  } catch {
    if (extname(decoded)) throw new HttpError(404, 'Arquivo não encontrado.');
    target = resolve(root, 'index.html');
  }
  let canonical: string;
  try {
    canonical = await realpath(target);
  } catch {
    throw new HttpError(404, 'Arquivo não encontrado.');
  }
  if (!canonical.startsWith(root + sep)) throw new HttpError(403, 'Caminho não permitido.');
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  };
  if (decoded.startsWith('/assets/'))
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  await sendFile(request, response, canonical, types[extname(canonical)] ?? 'application/octet-stream');
}

export async function createApp(
  options: ServerOptions = {},
): Promise<{ handler: RequestListener; store: LocalStore; auth: LocalAuth }> {
  const store = options.store ?? new LocalStore(options.home ?? defaultHome());
  const auth = new LocalAuth(store.home);
  await Promise.all([store.ready, auth.ready]);
  const social = () => {
    if (!options.social) throw new HttpError(503, 'O serviço social local não está disponível.');
    return options.social;
  };
  const runner = () => {
    if (!options.runner) throw new HttpError(503, 'O motor local não está disponível.');
    return options.runner;
  };
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    headers(response, options.dev === true);
    checkOrigin(request, response, options.dev === true, options.publicPort);
    const raw = request.url?.split('?')[0] ?? '/';
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      throw new HttpError(400, 'Caminho inválido.');
    }
    if (
      decoded.includes('\0') ||
      decoded.includes('\\') ||
      decoded.split('/').some((part) => part === '..' || part === '.')
    )
      throw new HttpError(403, 'Caminho não permitido.');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const path = decoded.replace(/\/$/, '') || '/';
    const method = request.method ?? 'GET';
    const oauthReturn = path === '/api/oauth/youtube/callback' && method === 'GET';
    // Redirects from Google can retain cross-site metadata through the 303.
    // Only the public shell may be loaded as a top-level document; APIs stay guarded.
    const studioEntry =
      path === '/' &&
      method === 'GET' &&
      request.headers['sec-fetch-mode'] === 'navigate' &&
      request.headers['sec-fetch-dest'] === 'document';
    if (request.headers['sec-fetch-site'] === 'cross-site' && !oauthReturn && !studioEntry)
      throw new HttpError(403, 'Requisição entre sites não permitida.');
    if (path === '/healthz' && method === 'GET') {
      json(response, 200, { status: 'ok' });
      return;
    }
    if (method === 'OPTIONS') {
      if (!request.headers.origin) throw new HttpError(403, 'Origem obrigatória.');
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-CSRF-Token',
      });
      response.end();
      return;
    }
    const cookie = request.headers.cookie;
    const csrf =
      typeof request.headers['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : undefined;
    if (path === '/api/auth/status' && method === 'GET') {
      const result = await auth.status(cookie);
      response.setHeader('Set-Cookie', result.cookie);
      json(response, 200, result.status);
      return;
    }
    if (['/api/auth/setup', '/api/auth/login'].includes(path) && method === 'POST') {
      const body = await readJson(request);
      allowedKeys(body, ['password']);
      const result = path.endsWith('/setup')
        ? await auth.setup(body.password, cookie, csrf)
        : await auth.login(body.password, cookie, csrf, request.socket.remoteAddress);
      response.setHeader('Set-Cookie', result.cookie);
      json(response, 200, result.status);
      return;
    }
    if (path === '/api/oauth/youtube/callback' && method === 'GET') {
      await social().callbackYoutubeOAuth({
        state: string(url.searchParams.get('state'), 'state', 300),
        code: string(url.searchParams.get('code'), 'code', 5000),
      });
      response.writeHead(303, { Location: '/?oauth=connected' });
      response.end();
      return;
    }
    if (!path.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'Método não permitido.');
      await staticFile(
        request,
        response,
        options.distDir ?? fileURLToPath(new URL('../dist', import.meta.url)),
        decoded,
      );
      return;
    }
    const session = await auth.guard(cookie, csrf, true, !['GET', 'HEAD'].includes(method));
    if (path === '/api/auth/logout' && method === 'POST') {
      const result = await auth.logout(cookie, csrf);
      response.setHeader('Set-Cookie', result.cookie);
      json(response, 200, result.status);
      return;
    }
    if (path === '/api/creative/settings' && ['GET', 'PUT'].includes(method)) {
      if (!options.privatePrompt)
        throw new HttpError(503, 'O prompt pessoal ainda não está disponível nesta instância.');
      if (method === 'GET') {
        json(response, 200, await options.privatePrompt.read());
        return;
      }
      const body = await readJson(request, 140_000);
      allowedKeys(body, [
        'content',
        'model',
        'provider',
        'anthropicModel',
        'openaiModel',
        'maxOutputTokens',
        'maxCostUsd',
      ]);
      json(
        response,
        200,
        await options.privatePrompt.save({
          content: body.content,
          model: body.model,
          provider: body.provider,
          anthropicModel: body.anthropicModel,
          openaiModel: body.openaiModel,
          maxOutputTokens: body.maxOutputTokens,
          maxCostUsd: body.maxCostUsd,
        }),
      );
      return;
    }
    if (path === '/api/creative/capabilities' && method === 'GET') {
      if (!options.creative)
        throw new HttpError(503, 'A IA local ainda não está disponível nesta instância.');
      const owner = url.searchParams.has('channel_id')
        ? channelId(url.searchParams.get('channel_id'))
        : undefined;
      if (owner) await store.requireChannel(owner);
      json(response, 200, await options.creative.capabilities(owner));
      return;
    }
    if (path === '/api/bootstrap' && method === 'GET') {
      const state = await store.read();
      const connections = options.social
        ? (await Promise.all(state.channels.map((channel) => options.social!.listConnections(channel.id))))
            .flat()
            .map(connection)
        : [];
      const jobs = options.runner
        ? (await Promise.all(state.channels.map((channel) => options.runner!.list(channel.id)))).flat()
        : [];
      const assets = options.runner
        ? (await Promise.all(state.channels.map((channel) => options.runner!.assets(channel.id)))).flat()
        : [];
      const data: Bootstrap = {
        ...state,
        csrfToken: session.csrfToken,
        connections,
        capabilities: options.social?.capabilities() ?? [],
        jobs,
        assets,
        engine: options.runner?.engineStatus() ?? {
          available: false,
          message: 'Motor local ainda não configurado.',
        },
      };
      json(response, 200, data);
      return;
    }
    if (path === '/api/channels' && method === 'GET') {
      json(response, 200, (await store.read()).channels);
      return;
    }
    if (path === '/api/channels' && method === 'POST') {
      json(response, 201, await store.saveChannel(await readJson(request)));
      return;
    }
    if (path === '/api/config' && method === 'PUT') {
      json(response, 200, await store.saveConfig(await readJson(request)));
      return;
    }
    const channelRoute = /^\/api\/channels\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (channelRoute) {
      const id = channelId(channelRoute[1]);
      await store.requireChannel(id);
      const suffix = channelRoute[2] ?? '';
      if (!suffix && method === 'GET') {
        json(response, 200, await store.requireChannel(id));
        return;
      }
      if (!suffix && method === 'PUT') {
        json(response, 200, await store.saveChannel(await readJson(request), id));
        return;
      }
      if (!suffix && method === 'DELETE') {
        const jobs = options.runner ? await options.runner.list(id) : [];
        const assets = options.runner ? await options.runner.assets(id) : [];
        const connections = options.social ? await options.social.listConnections(id) : [];
        if (jobs.length || assets.length || connections.some((row) => row.status !== 'disconnected'))
          throw new HttpError(
            409,
            'O canal possui produção ou conexões; preserve o histórico e desconecte as contas antes de excluir.',
          );
        const state = await store.read();
        if (
          [state.research, state.scripts, state.stories, state.receipts, state.monetization].some((rows) =>
            rows.some((row) => row.channelId === id),
          )
        )
          throw new HttpError(
            409,
            'O canal possui conteúdo ou histórico; remova os vínculos antes de excluir.',
          );
        if (await options.creative?.hasUsageHistory?.(id))
          throw new HttpError(
            409,
            'O canal possui histórico de consumo de IA. Preserve o canal para manter a atribuição dos custos.',
          );
        for (const network of ['youtube', 'tiktok', 'instagram', 'facebook'] as const)
          await social().disconnect(id, network);
        if (options.creative?.deleteKey) {
          await options.creative.deleteKey(id, 'anthropic');
          await options.creative.deleteKey(id, 'openai');
        }
        await store.deleteChannel(id);
        json(response, 200, { ok: true });
        return;
      }
      if (suffix === 'config' && method === 'PUT') {
        json(response, 200, await store.saveConfig(await readJson(request), id));
        return;
      }
      if (['automatic/quote', 'automatic/jobs'].includes(suffix) && method === 'POST') {
        if (!options.creative)
          throw new HttpError(503, 'Configure o assistente de criação antes de produzir com IA.');
        const automation = createAutomaticProduction({ store, runner: runner(), creative: options.creative });
        const body = await readJson(request, 10_000);
        json(
          response,
          suffix === 'automatic/jobs' ? 202 : 200,
          suffix === 'automatic/quote'
            ? await automation.quote(id, body, session.csrfToken)
            : await automation.start(id, body, session.csrfToken),
        );
        return;
      }
      if (suffix === 'creative/usage' && method === 'GET') {
        if (!options.creative?.usageSnapshot)
          throw new HttpError(503, 'O registro de consumo não está disponível nesta instância.');
        const daysText = url.searchParams.get('days') ?? '30',
          provider = url.searchParams.get('provider') ?? undefined;
        if (
          !/^[1-9]\d?$/.test(daysText) ||
          Number(daysText) > 90 ||
          (provider !== undefined && provider !== 'anthropic' && provider !== 'openai')
        )
          throw new HttpError(
            400,
            'Filtro de consumo inválido. Escolha até 90 dias e um provedor disponível.',
          );
        json(response, 200, await options.creative.usageSnapshot(id, { days: Number(daysText), provider }));
        return;
      }
      const creativeKeyRoute = /^creative\/keys\/(anthropic|openai)$/.exec(suffix);
      if ((suffix === 'creative/key' || creativeKeyRoute) && ['GET', 'PUT', 'DELETE'].includes(method)) {
        const provider = creativeKeyRoute?.[1] === 'openai' ? 'openai' : 'anthropic';
        const creative = options.creative;
        if (!creative?.keyStatus || !creative.saveKey || !creative.deleteKey)
          throw new HttpError(503, 'A integração Claude não está disponível nesta instância.');
        if (method === 'GET') {
          json(response, 200, await creative.keyStatus(id, provider));
          return;
        }
        if (method === 'DELETE') {
          json(response, 200, await creative.deleteKey(id, provider));
          return;
        }
        const body = await readJson(request, 2048);
        allowedKeys(body, ['key']);
        json(response, 200, await creative.saveKey(id, body.key, provider));
        return;
      }
      if (suffix === 'creative/quote' && method === 'POST') {
        if (!options.creative?.quote)
          throw new HttpError(503, 'A integração Claude não está disponível nesta instância.');
        const body = await readJson(request, 80_000);
        allowedKeys(body, ['task', 'brief', 'includeReferences', 'editorContext', 'consentToSend']);
        json(
          response,
          200,
          await options.creative.quote(
            id,
            {
              task: body.task,
              brief: body.brief,
              includeReferences: body.includeReferences,
              editorContext: body.editorContext,
              consentToSend: body.consentToSend,
            },
            session.csrfToken,
          ),
        );
        return;
      }
      if (suffix === 'creative/draft' && method === 'POST') {
        if (!options.creative)
          throw new HttpError(503, 'A IA local ainda não está disponível nesta instância.');
        const body = await readJson(request, 80_000);
        allowedKeys(body, [
          'task',
          'brief',
          'includeReferences',
          'editorContext',
          'quoteId',
          'authorizePaid',
        ]);
        json(
          response,
          200,
          await options.creative.draft(
            id,
            {
              task: body.task,
              brief: body.brief,
              includeReferences: body.includeReferences,
              editorContext: body.editorContext,
              quoteId: body.quoteId,
              authorizePaid: body.authorizePaid,
            },
            session.csrfToken,
          ),
        );
        return;
      }
      if (suffix === 'research/discover' && method === 'POST') {
        const body = await readJson(request);
        allowedKeys(body, ['query']);
        const query = string(body.query, 'query', 120, 2).trim();
        if (query.length < 2) throw new HttpError(400, 'A pesquisa precisa de pelo menos dois caracteres.');
        const service = social();
        if (!service.discoverYoutube)
          throw new HttpError(503, 'A descoberta do YouTube não está disponível.');
        json(response, 200, await service.discoverYoutube(id, query));
        return;
      }
      if (suffix === 'jobs' && method === 'GET') {
        json(response, 200, await runner().list(id));
        return;
      }
      if (suffix === 'jobs' && method === 'POST') {
        const body = await readJson(request);
        ownerBody(body, id);
        allowedKeys(body, ['scriptId', 'assetIds', 'asr', 'burnSubtitles', 'channelId', 'previewOnly']);
        const scriptId = validId(body.scriptId);
        const state = await store.read();
        if (!state.scripts.some((script) => script.id === scriptId && script.channelId === id))
          throw new HttpError(400, 'O roteiro não pertence ao canal.');
        const values = object(body.assetIds);
        if (Object.keys(values).length > 100) throw new HttpError(400, 'Muitos assets.');
        const assetIds: Record<string, string> = {};
        for (const [scene, asset] of Object.entries(values)) {
          if (!/^\d+$/.test(scene)) throw new HttpError(400, 'ID de cena inválido.');
          assetIds[scene] = validId(asset);
        }
        for (const flag of ['asr', 'burnSubtitles', 'previewOnly'])
          if (body[flag] !== undefined && typeof body[flag] !== 'boolean')
            throw new HttpError(400, 'Opção de job inválida.');
        const input: StartJobInput = {
          scriptId,
          assetIds,
          asr: body.asr as boolean | undefined,
          burnSubtitles: body.burnSubtitles as boolean | undefined,
          previewOnly: body.previewOnly as boolean | undefined,
        };
        json(response, 202, await runner().start(id, input));
        return;
      }
      if (suffix === 'assets' && method === 'GET') {
        json(response, 200, await runner().assets(id));
        return;
      }
      if (suffix === 'visuals/prepare' && method === 'POST') {
        const body = await readJson(request);
        ownerBody(body, id);
        allowedKeys(body, ['scriptId', 'channelId']);
        const scriptId = validId(body.scriptId),
          state = await store.read();
        if (!state.scripts.some((script) => script.id === scriptId && script.channelId === id))
          throw new HttpError(400, 'O roteiro não pertence ao canal.');
        json(response, 200, await runner().prepareVisuals(id, scriptId));
        return;
      }
      const assetPreview = /^assets\/([^/]+)\/preview$/.exec(suffix);
      if (assetPreview && ['GET', 'HEAD'].includes(method)) {
        const file = await runner().assetFile(id, validId(assetPreview[1]));
        if (!file) throw new HttpError(404, 'Imagem não disponível neste canal.');
        await sendFile(request, response, file.path, file.contentType);
        return;
      }
      if (suffix === 'assets' && method === 'POST') {
        const body = await readJson(request, 32 * 1024 * 1024);
        ownerBody(body, id);
        allowedKeys(body, [
          'filename',
          'kind',
          'contentBase64',
          'license',
          'provenance',
          'restrictions',
          'channelId',
        ]);
        if (!['image', 'video'].includes(String(body.kind)))
          throw new HttpError(400, 'Tipo de asset inválido.');
        const input: UploadAssetInput = {
          filename: string(body.filename, 'filename', 250),
          kind: body.kind as 'image' | 'video',
          contentBase64: string(body.contentBase64, 'contentBase64', 32 * 1024 * 1024),
          license: string(body.license, 'license', 500),
          provenance: string(body.provenance, 'provenance', 3000),
          restrictions: string(body.restrictions, 'restrictions', 3000),
        };
        json(response, 201, await runner().upload(id, input));
        return;
      }
      const file = /^jobs\/([^/]+)\/files\/([^/]+)$/.exec(suffix);
      if (file && ['GET', 'HEAD'].includes(method)) {
        const jobId = validId(file[1]);
        const name = file[2];
        if (
          !['video', 'thumbnail', 'report', 'metadata', 'sources', 'description', 'subtitles'].includes(name)
        )
          throw new HttpError(404, 'Arquivo não disponível.');
        const result = await runner().file(id, jobId, name);
        if (!result) throw new HttpError(404, 'Arquivo não disponível neste canal.');
        await sendFile(
          request,
          response,
          result.path,
          result.contentType,
          name === 'report' ? 'report.html' : undefined,
        );
        return;
      }
      const network = /^connections\/([^/]+)(?:\/(token|oauth|sync))?$/.exec(suffix);
      if (network) {
        const provider = platform(network[1]);
        const action = network[2];
        if (!action && method === 'DELETE') {
          await social().disconnect(id, provider);
          json(response, 200, { ok: true });
          return;
        }
        if (action === 'sync' && method === 'POST') {
          const snapshot = await social().sync(id, provider);
          if (snapshot.channelId !== id || snapshot.platform !== provider)
            throw new HttpError(503, 'O serviço retornou dados de outra conta.');
          await store.saveSnapshot(snapshot);
          json(response, 200, snapshot);
          return;
        }
        if (action === 'token' && method === 'POST') {
          const body = await readJson(request);
          ownerBody(body, id);
          allowedKeys(body, ['channelId', 'platform', 'accountId', 'accessToken', 'expiresAt', 'scopes']);
          if (body.platform !== undefined && body.platform !== provider)
            throw new HttpError(409, 'Rede incompatível.');
          const scopes =
            body.scopes === undefined
              ? undefined
              : Array.isArray(body.scopes) && body.scopes.length <= 100
                ? body.scopes.map((scope) => string(scope, 'scope', 200))
                : (() => {
                    throw new HttpError(400, 'Escopos inválidos.');
                  })();
          const result = await social().connectToken({
            channelId: id,
            platform: provider,
            accountId: string(body.accountId, 'accountId', 300),
            accessToken: string(body.accessToken, 'accessToken', 20000),
            expiresAt: body.expiresAt === undefined ? undefined : string(body.expiresAt, 'expiresAt', 100),
            scopes,
          });
          json(response, 200, connection(result));
          return;
        }
        if (action === 'oauth' && provider === 'youtube' && method === 'POST') {
          const body = await readJson(request);
          ownerBody(body, id);
          allowedKeys(body, ['channelId', 'accountId', 'clientId', 'clientSecret', 'redirectUri']);
          const redirectUri = `http://127.0.0.1:${options.publicPort ?? request.socket.localPort ?? 4317}/api/oauth/youtube/callback`;
          json(
            response,
            200,
            await social().startYoutubeOAuth({
              channelId: id,
              accountId: string(body.accountId, 'accountId', 300),
              clientId: string(body.clientId, 'clientId', 3000),
              clientSecret: string(body.clientSecret, 'clientSecret', 10000),
              redirectUri,
            }),
          );
          return;
        }
      }
    }
    const resource = /^\/api\/(research|scripts|stories|receipts)(?:\/([^/]+))?$/.exec(path);
    if (resource) {
      const kind = resource[1] as Collection;
      const id = resource[2] ? validId(resource[2]) : undefined;
      if (method === 'GET') {
        const owner = channelId(url.searchParams.get('channel_id'));
        await store.requireChannel(owner);
        const rows = (await store.read())[kind].filter(
          (row) => row.channelId === owner && (!id || row.id === id),
        );
        if (id && !rows.length) throw new HttpError(404, 'Recurso não encontrado neste canal.');
        json(response, 200, id ? rows[0] : rows);
        return;
      }
      if ((!id && method === 'POST') || (id && method === 'PUT')) {
        const body = await readJson(request);
        channelId(body.channelId);
        json(response, id ? 200 : 201, await store.saveResource(kind, body, id));
        return;
      }
      if (id && method === 'DELETE') {
        await store.deleteResource(kind, id, channelId(url.searchParams.get('channel_id')));
        json(response, 200, { ok: true });
        return;
      }
    }
    throw new HttpError(404, 'Rota local não encontrada.');
  }
  const handler: RequestListener = (request, response) => {
    void handle(request, response).catch((error) => {
      request.resume();
      if (response.headersSent) {
        response.destroy();
        return;
      }
      let status = 500;
      let message = 'A operação local não pôde ser concluída.';
      if (error instanceof HttpError) {
        status = error.status;
        message = error.message;
      } else if (error instanceof VaultError) {
        status = 503;
        message = error.message;
      } else if (error instanceof RunnerError) {
        status = error.status;
        message = error.message;
      } else if (error instanceof SocialError) {
        status = ['api_denied', 'api_unavailable', 'invalid_response'].includes(error.code) ? 503 : 400;
        message = error.message;
      }
      json(response, status, { error: message });
    });
  };
  return { handler, store, auth };
}
