// Production jobs: every video comes from the motion engine, with no per-scene files.
import type { StartJobInput } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { platform, validId } from '../store.ts';
import { allowedKeys, json, ownerBody, readJson, sendFile } from '../http.ts';
import type { Route } from './router.ts';
import { requireChannel } from './router.ts';

const jobFiles = ['video', 'thumbnail', 'report', 'metadata', 'sources', 'description', 'subtitles'];

export const productionRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/api/channels/:id/jobs',
    async handle(context) {
      const id = await requireChannel(context);
      json(context.response, 200, await context.runner().list(id));
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/jobs',
    async handle(context) {
      const id = await requireChannel(context);
      const { store, runner, request, response } = context;
      const body = await readJson(request);
      ownerBody(body, id);
      allowedKeys(body, ['scriptId', 'channelId', 'previewOnly']);
      const scriptId = validId(body.scriptId);
      const state = await store.read();
      if (!state.scripts.some((script) => script.id === scriptId && script.channelId === id))
        throw new HttpError(400, 'O roteiro não pertence ao canal.');
      if (body.previewOnly !== undefined && typeof body.previewOnly !== 'boolean')
        throw new HttpError(400, 'Opção de job inválida.');
      const input: StartJobInput = {
        scriptId,
        previewOnly: body.previewOnly as boolean | undefined,
      };
      json(response, 202, await runner().start(id, input));
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/channels/:id/jobs/:jobId',
    async handle(context) {
      const id = await requireChannel(context);
      const runner = context.runner();
      if (!runner.remove) throw new HttpError(503, 'A exclusão de vídeos não está disponível.');
      await runner.remove(id, validId(context.params.jobId));
      json(context.response, 200, { ok: true });
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/jobs/:jobId/shorts',
    async handle(context) {
      const id = await requireChannel(context);
      const runner = context.runner();
      if (!runner.startShorts) throw new HttpError(503, 'O corte de Shorts não está disponível.');
      json(context.response, 202, await runner.startShorts(id, validId(context.params.jobId)));
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/jobs/:jobId/retry',
    async handle(context) {
      const id = await requireChannel(context);
      const runner = context.runner();
      if (!runner.retry && !runner.retryShort)
        throw new HttpError(503, 'Tentar de novo não está disponível.');
      const retry = runner.retry ?? runner.retryShort!;
      json(context.response, 202, await retry(id, validId(context.params.jobId)));
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/jobs/:jobId/publish/:platform',
    async handle(context) {
      const id = await requireChannel(context);
      const network = platform(context.params.platform);
      const runner = context.runner();
      if (!runner.publish) throw new HttpError(503, 'O envio às redes não está disponível.');
      json(context.response, 202, await runner.publish(id, validId(context.params.jobId), network));
    },
  },
  {
    method: ['GET', 'HEAD'],
    pattern: '/api/channels/:id/jobs/:jobId/files/:name',
    async handle(context) {
      const id = await requireChannel(context);
      const jobId = validId(context.params.jobId);
      const name = context.params.name;
      if (!jobFiles.includes(name)) throw new HttpError(404, 'Arquivo não disponível.');
      const result = await context.runner().file(id, jobId, name);
      if (!result) throw new HttpError(404, 'Arquivo não disponível neste canal.');
      await sendFile(
        context.request,
        context.response,
        result.path,
        result.contentType,
        name === 'report' ? 'report.html' : undefined,
      );
    },
  },
];
