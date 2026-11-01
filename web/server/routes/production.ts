// Production jobs, visuals and the channel's media library.
import type { StartJobInput, UploadAssetInput } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { object, platform, validId } from '../store.ts';
import { allowedKeys, json, ownerBody, readJson, sendFile, string } from '../http.ts';
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
    },
  },
  {
    method: 'GET',
    pattern: '/api/channels/:id/assets',
    async handle(context) {
      const id = await requireChannel(context);
      json(context.response, 200, await context.runner().assets(id));
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/assets',
    async handle(context) {
      const id = await requireChannel(context);
      const { runner, request, response } = context;
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
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/visuals/prepare',
    async handle(context) {
      const id = await requireChannel(context);
      const { store, runner, request, response } = context;
      const body = await readJson(request);
      ownerBody(body, id);
      allowedKeys(body, ['scriptId', 'channelId']);
      const scriptId = validId(body.scriptId);
      const state = await store.read();
      if (!state.scripts.some((script) => script.id === scriptId && script.channelId === id))
        throw new HttpError(400, 'O roteiro não pertence ao canal.');
      json(response, 200, await runner().prepareVisuals(id, scriptId));
    },
  },
  {
    method: ['GET', 'HEAD'],
    pattern: '/api/channels/:id/assets/:assetId/preview',
    async handle(context) {
      const id = await requireChannel(context);
      const file = await context.runner().assetFile(id, validId(context.params.assetId));
      if (!file) throw new HttpError(404, 'Imagem não disponível neste canal.');
      await sendFile(context.request, context.response, file.path, file.contentType);
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
    method: 'DELETE',
    pattern: '/api/channels/:id/assets/:assetId',
    async handle(context) {
      const id = await requireChannel(context);
      const runner = context.runner();
      if (!runner.removeAsset) throw new HttpError(503, 'A exclusão de arquivos não está disponível.');
      await runner.removeAsset(id, validId(context.params.assetId));
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
      if (!runner.retryShort) throw new HttpError(503, 'O corte de Shorts não está disponível.');
      json(context.response, 202, await runner.retryShort(id, validId(context.params.jobId)));
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
