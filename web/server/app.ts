// HTTP entry point: security headers, origin checks, the public routes (health, auth,
// OAuth return, static files) and the dispatch of authenticated API routes.
import type { RequestListener, IncomingMessage, ServerResponse } from 'node:http';
import type { SocialApi, RunnerApi } from '../shared/types.ts';
import { LocalStore, defaultHome } from './store.ts';
import { LocalAuth, HttpError } from './auth.ts';
import { SocialError } from './social.ts';
import { VaultError } from './vault.ts';
import { RunnerError } from './runner.ts';
import type { CreativeApi } from './creative.ts';
import type { PrivatePromptStore } from './private-prompt.ts';
import { allowedKeys, checkOrigin, json, readJson, securityHeaders, staticFile, string } from './http.ts';
import { compileRoutes, matchRoute } from './routes/router.ts';
import type { AppDependencies, Method } from './routes/router.ts';
import { routes } from './routes/index.ts';
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

function requestPath(request: IncomingMessage): { decoded: string; path: string } {
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
  return { decoded, path: decoded.replace(/\/$/, '') || '/' };
}

function errorStatus(error: unknown): { status: number; message: string } {
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  if (error instanceof VaultError) return { status: 503, message: error.message };
  if (error instanceof RunnerError) return { status: error.status, message: error.message };
  if (error instanceof SocialError)
    return {
      status: ['api_denied', 'api_unavailable', 'invalid_response'].includes(error.code) ? 503 : 400,
      message: error.message,
    };
  return { status: 500, message: 'A operação local não pôde ser concluída.' };
}

export async function createApp(
  options: ServerOptions = {},
): Promise<{ handler: RequestListener; store: LocalStore; auth: LocalAuth }> {
  const store = options.store ?? new LocalStore(options.home ?? defaultHome());
  const auth = new LocalAuth(store.home);
  await Promise.all([store.ready, auth.ready]);
  const required =
    <T>(service: T | undefined, message: string) =>
    (): T => {
      if (!service) throw new HttpError(503, message);
      return service;
    };
  const dependencies: AppDependencies = {
    store,
    auth,
    publicPort: options.publicPort,
    social: required(options.social, 'O serviço social local não está disponível.'),
    runner: required(options.runner, 'O motor local não está disponível.'),
    creative: required(options.creative, 'A IA local ainda não está disponível nesta instância.'),
    privatePrompt: required(
      options.privatePrompt,
      'O prompt pessoal ainda não está disponível nesta instância.',
    ),
    optional: { social: options.social, runner: options.runner, creative: options.creative },
  };
  const table = compileRoutes(routes);
  const distDir = options.distDir ?? fileURLToPath(new URL('../dist', import.meta.url));
  const dev = options.dev === true;

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    securityHeaders(response, dev);
    checkOrigin(request, response, dev, options.publicPort);
    const { decoded, path } = requestPath(request);
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = (request.method ?? 'GET') as Method;
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
    if (request.method === 'OPTIONS') {
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
    if (oauthReturn) {
      await dependencies.social().callbackYoutubeOAuth({
        state: string(url.searchParams.get('state'), 'state', 300),
        code: string(url.searchParams.get('code'), 'code', 5000),
      });
      response.writeHead(303, { Location: '/?oauth=connected' });
      response.end();
      return;
    }
    if (!path.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'Método não permitido.');
      await staticFile(request, response, distDir, decoded);
      return;
    }
    const session = await auth.guard(cookie, csrf, true, !['GET', 'HEAD'].includes(method));
    const matched = matchRoute(table, method, path);
    if (!matched) throw new HttpError(404, 'Rota local não encontrada.');
    await matched.route.handle({
      ...dependencies,
      request,
      response,
      url,
      method,
      params: matched.params,
      session,
      cookie,
      csrf,
    });
  }

  const handler: RequestListener = (request, response) => {
    void handle(request, response).catch((error) => {
      request.resume();
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const { status, message } = errorStatus(error);
      json(response, status, { error: message });
    });
  };
  return { handler, store, auth };
}
