// Session, bootstrap, configuration and channel identity.
import type { Bootstrap, SocialConnection } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { json, readJson } from '../http.ts';
import type { Route } from './router.ts';
import { requireChannel } from './router.ts';

/** Only the public shape of a connection leaves the server. */
export function publicConnection(row: SocialConnection): SocialConnection {
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

export const studioRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/api/auth/logout',
    async handle({ auth, cookie, csrf, response }) {
      const result = await auth.logout(cookie, csrf);
      response.setHeader('Set-Cookie', result.cookie);
      json(response, 200, result.status);
    },
  },
  {
    method: 'GET',
    pattern: '/api/bootstrap',
    async handle({ store, optional, session, response }) {
      const state = await store.read();
      const connections = optional.social
        ? (await Promise.all(state.channels.map((channel) => optional.social!.listConnections(channel.id))))
            .flat()
            .map(publicConnection)
        : [];
      const jobs = optional.runner
        ? (await Promise.all(state.channels.map((channel) => optional.runner!.list(channel.id)))).flat()
        : [];
      const assets = optional.runner
        ? (await Promise.all(state.channels.map((channel) => optional.runner!.assets(channel.id)))).flat()
        : [];
      const data: Bootstrap = {
        ...state,
        csrfToken: session.csrfToken,
        connections,
        capabilities: optional.social?.capabilities() ?? [],
        jobs,
        assets,
        engine: optional.runner?.engineStatus() ?? {
          available: false,
          message: 'Motor local ainda não configurado.',
        },
      };
      json(response, 200, data);
    },
  },
  {
    method: 'GET',
    pattern: '/api/channels',
    async handle({ store, response }) {
      json(response, 200, (await store.read()).channels);
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels',
    async handle({ store, request, response }) {
      json(response, 201, await store.saveChannel(await readJson(request)));
    },
  },
  {
    method: 'PUT',
    pattern: '/api/config',
    async handle({ store, request, response }) {
      json(response, 200, await store.saveConfig(await readJson(request)));
    },
  },
  {
    method: 'GET',
    pattern: '/api/channels/:id',
    async handle(context) {
      const id = await requireChannel(context);
      json(context.response, 200, await context.store.requireChannel(id));
    },
  },
  {
    method: 'PUT',
    pattern: '/api/channels/:id',
    async handle(context) {
      const id = await requireChannel(context);
      json(context.response, 200, await context.store.saveChannel(await readJson(context.request), id));
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/channels/:id',
    async handle(context) {
      const id = await requireChannel(context);
      const { store, optional, social, response } = context;
      const jobs = optional.runner ? await optional.runner.list(id) : [];
      const assets = optional.runner ? await optional.runner.assets(id) : [];
      const connections = optional.social ? await optional.social.listConnections(id) : [];
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
      if (await optional.creative?.hasUsageHistory?.(id))
        throw new HttpError(
          409,
          'O canal possui histórico de consumo de IA. Preserve o canal para manter a atribuição dos custos.',
        );
      for (const network of ['youtube', 'tiktok', 'instagram', 'facebook'] as const)
        await social().disconnect(id, network);
      if (optional.creative?.deleteKey) {
        await optional.creative.deleteKey(id, 'anthropic');
        await optional.creative.deleteKey(id, 'openai');
      }
      await store.deleteChannel(id);
      json(response, 200, { ok: true });
    },
  },
  {
    method: 'PUT',
    pattern: '/api/channels/:id/config',
    async handle(context) {
      const id = await requireChannel(context);
      json(context.response, 200, await context.store.saveConfig(await readJson(context.request), id));
    },
  },
];
