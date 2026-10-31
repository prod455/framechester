import { HttpError } from './auth.ts';
import { ProviderResponseError } from './ai-provider.ts';
import type { ProviderUsage } from './ai-provider.ts';

/** Standard, short-context public rates in USD per million tokens.
 * https://developers.openai.com/api/docs/pricing (2026-10-28).
 * Requests explicitly disable prompt cache writes and select the default tier.
 */
export const OPENAI_PRICING_CHECKED_AT = '2026-10-28';
export const OPENAI_MODELS = [
  {
    id: 'gpt-6.1-sol',
    label: 'GPT-6.1 Sol',
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cachedInputUsdPerMillion: 0.1,
  },
  {
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
    cachedInputUsdPerMillion: 0.01,
  },
] as const;
export const DEFAULT_OPENAI_MODEL = 'gpt-6.1-sol';
const endpoint = 'https://api.openai.com/v1/responses';
const responseLimit = 262_144;
export interface OpenAIRequest {
  model: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}
export interface OpenAIResult extends ProviderUsage {
  text: string;
}
export interface OpenAIClient {
  count(key: string, request: OpenAIRequest): Promise<number>;
  generate(key: string, request: OpenAIRequest): Promise<OpenAIResult>;
}

export function openaiModelName(value: unknown): string {
  if (typeof value !== 'string' || !OPENAI_MODELS.some((model) => model.id === value))
    throw new HttpError(400, 'Escolha um modelo OpenAI com preço conhecido.');
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function count(value: unknown, min = 0, max = 100_000): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function invalid(usage?: ProviderUsage, costUnknown = false): ProviderResponseError {
  return new ProviderResponseError(
    'A OpenAI retornou uma resposta incompleta ou incompatível. O resultado foi descartado; uma nova tentativa exige sua confirmação.',
    usage,
    costUnknown,
  );
}

/** This copy only adds the strict-object contract. Domain constraints stay intact;
 * validation against the original schema remains the editorial service's job.
 * https://developers.openai.com/api/docs/guides/structured-outputs
 */
export function openaiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(schema)) {
    if (['properties', '$defs', 'definitions'].includes(name) && isRecord(value))
      output[name] = Object.fromEntries(
        Object.entries(value).map(([field, child]) => [
          field,
          isRecord(child) ? openaiSchema(child) : structuredClone(child),
        ]),
      );
    else if (name === 'items' && isRecord(value)) output[name] = openaiSchema(value);
    else if (['anyOf', 'allOf', 'oneOf', 'prefixItems'].includes(name) && Array.isArray(value))
      output[name] = value.map((child) => (isRecord(child) ? openaiSchema(child) : structuredClone(child)));
    else output[name] = structuredClone(value);
  }
  if (schema.type === 'object' || isRecord(schema.properties)) {
    output.additionalProperties = false;
    if (isRecord(schema.properties)) output.required = Object.keys(schema.properties);
  }
  return output;
}
function payload(request: OpenAIRequest): Record<string, unknown> {
  const model = openaiModelName(request.model);
  if (
    !Number.isSafeInteger(request.maxTokens) ||
    request.maxTokens < 1 ||
    request.maxTokens > 32_000 ||
    typeof request.system !== 'string' ||
    !request.system ||
    typeof request.prompt !== 'string' ||
    !request.prompt ||
    !isRecord(request.schema) ||
    request.system.includes('\0') ||
    request.prompt.includes('\0')
  )
    throw new HttpError(400, 'O pedido à OpenAI tem parâmetros inválidos.');
  // These are the same context-affecting fields accepted by /responses/input_tokens.
  const body = {
    model,
    instructions: request.system,
    input: [{ role: 'user', content: request.prompt }],
    reasoning: { effort: model === 'gpt-6-luna' ? 'none' : 'low' },
    text: {
      format: {
        type: 'json_schema',
        name: 'framechester_editorial_draft',
        strict: true,
        schema: openaiSchema(request.schema),
      },
    },
    truncation: 'disabled',
  };
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 100_000)
    throw new HttpError(
      400,
      'O pedido à OpenAI excede o limite de contexto do assistente. Reduza o conteúdo antes de tentar novamente.',
    );
  return body;
}
function usageOf(value: unknown, maxTokens: number): ProviderUsage | undefined {
  if (!isRecord(value) || !count(value.input_tokens) || !count(value.output_tokens, 0, maxTokens))
    return undefined;
  if (value.total_tokens !== undefined && value.total_tokens !== value.input_tokens + value.output_tokens)
    return undefined;
  if (value.input_tokens_details !== undefined && !isRecord(value.input_tokens_details)) return undefined;
  if (value.output_tokens_details !== undefined && !isRecord(value.output_tokens_details)) return undefined;
  const input = isRecord(value.input_tokens_details) ? value.input_tokens_details : {};
  const output = isRecord(value.output_tokens_details) ? value.output_tokens_details : {};
  const cached = input.cached_tokens ?? 0,
    reasoning = output.reasoning_tokens ?? 0;
  if (!count(cached, 0, value.input_tokens) || !count(reasoning, 0, value.output_tokens)) return undefined;
  return {
    inputTokens: value.input_tokens,
    outputTokens: value.output_tokens,
    cachedInputTokens: cached,
    reasoningTokens: reasoning,
  };
}
function unexpectedCacheWrites(value: Record<string, unknown>): boolean {
  const input = value.input_tokens_details;
  return isRecord(input) && input.cache_write_tokens !== undefined && input.cache_write_tokens !== 0;
}

export function createOpenAIClient(options: { fetch?: typeof fetch } = {}): OpenAIClient {
  const fetcher = options.fetch ?? fetch;
  async function send(
    key: string,
    request: OpenAIRequest,
    counting: boolean,
  ): Promise<Record<string, unknown>> {
    if (typeof key !== 'string' || !/^[!-~]{10,512}$/.test(key))
      throw new HttpError(
        400,
        'A chave da API OpenAI está ausente ou tem formato inválido. Configure uma chave no cofre deste canal.',
      );
    const body = payload(request);
    if (!counting) {
      body.max_output_tokens = request.maxTokens;
      body.stream = false;
      body.store = false;
      body.service_tier = 'default';
      // Explicit mode without breakpoints performs no cache reads or writes.
      // https://developers.openai.com/api/docs/guides/prompt-caching
      body.prompt_cache_options = { mode: 'explicit' };
    }
    let response: Response;
    try {
      response = await fetcher(counting ? `${endpoint}/input_tokens` : endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(counting ? 30_000 : 600_000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpError(
        503,
        counting
          ? 'Não foi possível contar os tokens com a OpenAI. Nenhuma geração foi solicitada.'
          : 'A OpenAI não confirmou a conclusão. Pode haver cobrança; confira o consumo na plataforma antes de autorizar outra tentativa.',
      );
    }
    if (!response.ok || !response.body) {
      try {
        await response.body?.cancel();
      } catch {
        /* Never surface the remote response body. */
      }
      if ([401, 403].includes(response.status))
        throw new HttpError(
          503,
          'A OpenAI recusou a credencial ou o acesso ao modelo. Revise a chave e as permissões do projeto na plataforma OpenAI.',
        );
      if (response.status === 429)
        throw new HttpError(
          429,
          'A OpenAI atingiu um limite de uso. Confira os limites e créditos da conta antes de tentar novamente.',
        );
      throw new HttpError(
        503,
        counting
          ? 'A contagem de tokens não foi concluída. Nenhuma geração foi solicitada.'
          : 'A OpenAI não concluiu a geração. Confira o consumo na plataforma antes de autorizar outra tentativa.',
      );
    }
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > responseLimit) {
          try {
            await reader.cancel();
          } catch {
            /* Bounded failure. */
          }
          throw invalid();
        }
        chunks.push(part.value);
      }
      const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!isRecord(result)) throw invalid();
      return result;
    } catch {
      throw invalid();
    } finally {
      reader.releaseLock();
    }
  }
  return {
    async count(key, request) {
      const result = await send(key, request, true);
      if (result.object !== 'response.input_tokens' || !count(result.input_tokens, 1)) throw invalid();
      return result.input_tokens;
    },
    async generate(key, request) {
      const result = await send(key, request, false);
      const usage = usageOf(result.usage, request.maxTokens);
      if (!usage) throw invalid();
      if (
        result.model !== request.model ||
        (result.service_tier !== undefined && result.service_tier !== 'default') ||
        unexpectedCacheWrites(result.usage as Record<string, unknown>)
      )
        throw invalid(usage, true);
      if (
        result.object !== 'response' ||
        result.status !== 'completed' ||
        result.error ||
        result.incomplete_details ||
        !Array.isArray(result.output) ||
        !result.output.length
      )
        throw invalid(usage);
      const texts: string[] = [];
      for (const item of result.output) {
        if (!isRecord(item)) throw invalid(usage);
        if (item.type === 'reasoning') continue; // No reasoning or summaries escape the adapter.
        if (
          item.type !== 'message' ||
          item.role !== 'assistant' ||
          item.status !== 'completed' ||
          !Array.isArray(item.content) ||
          !item.content.length
        )
          throw invalid(usage);
        for (const block of item.content) {
          if (
            !isRecord(block) ||
            block.type !== 'output_text' ||
            typeof block.text !== 'string' ||
            !block.text.trim() ||
            block.text.includes('\0')
          )
            throw invalid(usage);
          texts.push(block.text);
        }
      }
      if (!texts.length) throw invalid(usage);
      return { ...usage, text: texts.join('\n') };
    },
  };
}
