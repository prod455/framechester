// Creative assistant: personal prompt, provider capabilities, keys, quotes, drafts and usage.
import { HttpError } from '../auth.ts';
import { channelId } from '../store.ts';
import { createAutomaticProduction } from '../automatic-production.ts';
import { allowedKeys, json, readJson } from '../http.ts';
import type { Route } from './router.ts';
import { requireChannel, unavailable } from './router.ts';

const noPaidProvider = 'A integração Claude não está disponível nesta instância.';

export const creativeRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/api/creative/settings',
    async handle({ privatePrompt, response }) {
      json(response, 200, await privatePrompt().read());
    },
  },
  {
    method: 'PUT',
    pattern: '/api/creative/settings',
    async handle({ privatePrompt, request, response }) {
      const settings = privatePrompt();
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
        await settings.save({
          content: body.content,
          model: body.model,
          provider: body.provider,
          anthropicModel: body.anthropicModel,
          openaiModel: body.openaiModel,
          maxOutputTokens: body.maxOutputTokens,
          maxCostUsd: body.maxCostUsd,
        }),
      );
    },
  },
  {
    method: 'GET',
    pattern: '/api/creative/capabilities',
    async handle({ creative, store, url, response }) {
      const service = creative();
      const owner = url.searchParams.has('channel_id')
        ? channelId(url.searchParams.get('channel_id'))
        : undefined;
      if (owner) await store.requireChannel(owner);
      json(response, 200, await service.capabilities(owner));
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/automatic/:step(quote|jobs)',
    async handle(context) {
      const id = await requireChannel(context);
      const { optional, store, runner, request, response, session, params } = context;
      if (!optional.creative) unavailable('Configure o assistente de criação antes de produzir com IA.');
      const automation = createAutomaticProduction({
        store,
        runner: runner(),
        creative: optional.creative,
        sources: optional.sources,
      });
      const body = await readJson(request, 10_000);
      if (params.step === 'quote') json(response, 200, await automation.quote(id, body, session.csrfToken));
      else json(response, 202, await automation.start(id, body, session.csrfToken));
    },
  },
  {
    method: 'GET',
    pattern: '/api/channels/:id/creative/usage',
    async handle(context) {
      const id = await requireChannel(context);
      const { optional, url, response } = context;
      if (!optional.creative?.usageSnapshot)
        unavailable('O registro de consumo não está disponível nesta instância.');
      const daysText = url.searchParams.get('days') ?? '30';
      const provider = url.searchParams.get('provider') ?? undefined;
      if (
        !/^[1-9]\d?$/.test(daysText) ||
        Number(daysText) > 90 ||
        (provider !== undefined && provider !== 'anthropic' && provider !== 'openai')
      )
        throw new HttpError(400, 'Filtro de consumo inválido. Escolha até 90 dias e um provedor disponível.');
      json(response, 200, await optional.creative.usageSnapshot(id, { days: Number(daysText), provider }));
    },
  },
  ...(
    ['/api/channels/:id/creative/key', '/api/channels/:id/creative/keys/:provider(anthropic|openai)'] as const
  ).map((pattern): Route => ({
    method: ['GET', 'PUT', 'DELETE'],
    pattern,
    async handle(context) {
      const id = await requireChannel(context);
      const { optional, method, request, response, params } = context;
      const provider = params.provider === 'openai' ? 'openai' : 'anthropic';
      const creative = optional.creative;
      if (!creative?.keyStatus || !creative.saveKey || !creative.deleteKey) unavailable(noPaidProvider);
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
    },
  })),
  {
    method: 'POST',
    pattern: '/api/channels/:id/creative/quote',
    async handle(context) {
      const id = await requireChannel(context);
      const { optional, request, response, session } = context;
      if (!optional.creative?.quote) unavailable(noPaidProvider);
      const body = await readJson(request, 80_000);
      allowedKeys(body, ['task', 'brief', 'style', 'includeReferences', 'editorContext', 'consentToSend']);
      json(
        response,
        200,
        await optional.creative.quote(
          id,
          {
            task: body.task,
            brief: body.brief,
            style: body.style,
            includeReferences: body.includeReferences,
            editorContext: body.editorContext,
            consentToSend: body.consentToSend,
          },
          session.csrfToken,
        ),
      );
    },
  },
  {
    method: 'POST',
    pattern: '/api/channels/:id/creative/draft',
    async handle(context) {
      const id = await requireChannel(context);
      const { creative, request, response, session } = context;
      const service = creative();
      const body = await readJson(request, 80_000);
      allowedKeys(body, [
        'task',
        'brief',
        'style',
        'includeReferences',
        'editorContext',
        'quoteId',
        'authorizePaid',
      ]);
      json(
        response,
        200,
        await service.draft(
          id,
          {
            task: body.task,
            brief: body.brief,
            style: body.style,
            includeReferences: body.includeReferences,
            editorContext: body.editorContext,
            quoteId: body.quoteId,
            authorizePaid: body.authorizePaid,
          },
          session.csrfToken,
        ),
      );
    },
  },
];
