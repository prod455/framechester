// Social accounts: YouTube discovery and per-network connections.
import { HttpError } from '../auth.ts';
import { platform } from '../store.ts';
import { allowedKeys, json, ownerBody, readJson, string } from '../http.ts';
import { publicConnection } from './studio.ts';
import type { Route } from './router.ts';
import { requireChannel, unavailable } from './router.ts';

export const socialRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/api/channels/:id/sources/suggest',
    async handle(context) {
      await requireChannel(context);
      if (!context.optional.sources) unavailable('A busca de fontes não está disponível nesta instância.');
      const body = await readJson(context.request, 10_000);
      allowedKeys(body, ['query']);
      const raw = Array.isArray(body.query) ? body.query : [body.query];
      if (raw.length > 6) throw new HttpError(400, 'Informe até seis termos de busca.');
      const queries = raw.map((value) => string(value, 'query', 200, 0));
      json(context.response, 200, await context.optional.sources.suggest(queries, 5));
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/research/discover',
    async handle(context) {
      const id = await requireChannel(context);
      const body = await readJson(context.request);
      allowedKeys(body, ['query']);
      const query = string(body.query, 'query', 120, 2).trim();
      if (query.length < 2) throw new HttpError(400, 'A pesquisa precisa de pelo menos dois caracteres.');
      const service = context.social();
      if (!service.discoverYoutube) unavailable('A descoberta do YouTube não está disponível.');
      json(context.response, 200, await service.discoverYoutube(id, query));
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/channels/:id/connections/:platform',
    async handle(context) {
      const id = await requireChannel(context);
      await context.social().disconnect(id, platform(context.params.platform));
      json(context.response, 200, { ok: true });
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/connections/:platform/sync',
    async handle(context) {
      const id = await requireChannel(context);
      const provider = platform(context.params.platform);
      const snapshot = await context.social().sync(id, provider);
      if (snapshot.channelId !== id || snapshot.platform !== provider)
        throw new HttpError(503, 'O serviço retornou dados de outra conta.');
      await context.store.saveSnapshot(snapshot);
      json(context.response, 200, snapshot);
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/connections/:platform/token',
    async handle(context) {
      const id = await requireChannel(context);
      const provider = platform(context.params.platform);
      const body = await readJson(context.request);
      ownerBody(body, id);
      allowedKeys(body, ['channelId', 'platform', 'accountId', 'accessToken', 'expiresAt', 'scopes']);
      if (body.platform !== undefined && body.platform !== provider)
        throw new HttpError(409, 'Rede incompatível.');
      let scopes: string[] | undefined;
      if (body.scopes !== undefined) {
        if (!Array.isArray(body.scopes) || body.scopes.length > 100)
          throw new HttpError(400, 'Escopos inválidos.');
        scopes = body.scopes.map((scope) => string(scope, 'scope', 200));
      }
      const result = await context.social().connectToken({
        channelId: id,
        platform: provider,
        accountId: string(body.accountId, 'accountId', 300),
        accessToken: string(body.accessToken, 'accessToken', 20000),
        expiresAt: body.expiresAt === undefined ? undefined : string(body.expiresAt, 'expiresAt', 100),
        scopes,
      });
      json(context.response, 200, publicConnection(result));
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/connections/:platform/oauth',
    async handle(context) {
      const id = await requireChannel(context);
      const provider = platform(context.params.platform);
      const { request, response, publicPort } = context;
      const body = await readJson(request);
      ownerBody(body, id);
      allowedKeys(body, ['channelId', 'accountId', 'clientId', 'clientSecret', 'redirectUri']);
      const redirectUri = `http://127.0.0.1:${publicPort ?? request.socket.localPort ?? 4317}/api/oauth/${provider}/callback`;
      json(
        response,
        200,
        await context.social().startOAuth({
          channelId: id,
          platform: provider,
          accountId: string(body.accountId, 'accountId', 300),
          clientId: string(body.clientId, 'clientId', 3000),
          clientSecret: string(body.clientSecret, 'clientSecret', 10000),
          redirectUri,
        }),
      );
    },
  },
];
