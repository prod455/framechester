// Research, scripts, stories and receipts: the same CRUD, scoped to one channel.
import { HttpError } from '../auth.ts';
import type { Collection } from '../store.ts';
import { channelId, validId } from '../store.ts';
import { json, readJson } from '../http.ts';
import type { Route, RouteContext } from './router.ts';

const kinds = 'research|scripts|stories|receipts';

function kindOf(context: RouteContext): Collection {
  return context.params.kind as Collection;
}

export const resourceRoutes: Route[] = [
  {
    method: 'GET',
    pattern: `/api/:kind(${kinds})`,
    async handle(context) {
      const owner = channelId(context.url.searchParams.get('channel_id'));
      await context.store.requireChannel(owner);
      const rows = (await context.store.read())[kindOf(context)].filter((row) => row.channelId === owner);
      json(context.response, 200, rows);
    },
  },
  {
    method: 'GET',
    pattern: `/api/:kind(${kinds})/:resourceId`,
    async handle(context) {
      const owner = channelId(context.url.searchParams.get('channel_id'));
      await context.store.requireChannel(owner);
      const id = validId(context.params.resourceId);
      const row = (await context.store.read())[kindOf(context)].find(
        (row) => row.channelId === owner && row.id === id,
      );
      if (!row) throw new HttpError(404, 'Recurso não encontrado neste canal.');
      json(context.response, 200, row);
    },
  },
  {
    method: 'POST',
    pattern: `/api/:kind(${kinds})`,
    async handle(context) {
      const body = await readJson(context.request);
      channelId(body.channelId);
      json(context.response, 201, await context.store.saveResource(kindOf(context), body));
    },
  },
  {
    method: 'PUT',
    pattern: `/api/:kind(${kinds})/:resourceId`,
    async handle(context) {
      const id = validId(context.params.resourceId);
      const body = await readJson(context.request);
      channelId(body.channelId);
      json(context.response, 200, await context.store.saveResource(kindOf(context), body, id));
    },
  },
  {
    method: 'DELETE',
    pattern: `/api/:kind(${kinds})/:resourceId`,
    async handle(context) {
      const id = validId(context.params.resourceId);
      await context.store.deleteResource(
        kindOf(context),
        id,
        channelId(context.url.searchParams.get('channel_id')),
      );
      json(context.response, 200, { ok: true });
    },
  },
];
