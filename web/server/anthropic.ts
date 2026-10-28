import { HttpError } from './auth.ts';
import {ProviderResponseError} from './ai-provider.ts';
import type {ProviderUsage} from './ai-provider.ts';

/** Public list prices in USD, checked against Anthropic pricing on this date.
 * Haiku's rate applies only up to 100k input tokens; both calls enforce that range.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 */
export const PRICING_CHECKED_AT = '2026-10-28';
export const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', inputUsdPerMillion: 2, outputUsdPerMillion: 10, cachedInputUsdPerMillion:0.1 },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5, cachedInputUsdPerMillion:0.01 },
] as const;
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
const endpoint = 'https://api.anthropic.com/v1/messages';
const responseLimit = 262_144;

export interface AnthropicRequest { model: string; system: string; prompt: string; schema: Record<string, unknown>; maxTokens: number }
export interface AnthropicResult extends ProviderUsage { text: string }
export interface AnthropicClient {
  count(key: string, request: AnthropicRequest): Promise<number>;
  generate(key: string, request: AnthropicRequest): Promise<AnthropicResult>;
}

export function anthropicModelName(value: unknown): string {
  if (typeof value !== 'string' || !ANTHROPIC_MODELS.some(model => model.id === value)) throw new HttpError(400, 'Escolha um modelo Claude da lista de modelos com preço conhecido.');
  return value;
}

const movedConstraints = new Set(['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','maxItems','uniqueItems','minProperties','maxProperties']);
const supportedFormats = new Set(['date-time','time','date','duration','email','hostname','uri','ipv4','ipv6','uuid']);

/** Only the wire schema is simplified. The caller must validate the output against
 * its original domain constraints. Field names are not schema keywords.
 * https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */
export function anthropicSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const constraints: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(schema)) {
    if (movedConstraints.has(name) || (name === 'minItems' && value !== 0 && value !== 1) || (name === 'format' && !supportedFormats.has(String(value)))) { constraints[name] = value; continue; }
    if (['properties','$defs','definitions'].includes(name) && value && typeof value === 'object' && !Array.isArray(value)) {
      result[name] = Object.fromEntries(Object.entries(value).map(([field, child]) => [field, isRecord(child) ? anthropicSchema(child) : child]));
    } else if (['items','additionalItems'].includes(name) && isRecord(value)) result[name] = anthropicSchema(value);
    else if (['anyOf','allOf','oneOf','prefixItems'].includes(name) && Array.isArray(value)) result[name] = value.map(child => isRecord(child) ? anthropicSchema(child) : child);
    else result[name] = structuredClone(value);
  }
  if (schema.type === 'object' || schema.properties) result.additionalProperties = false;
  if (Object.keys(constraints).length) result.description = `${typeof schema.description === 'string' ? `${schema.description} ` : ''}Respeite estas restrições: ${JSON.stringify(constraints)}.`;
  return result;
}

function invalidResponse(): HttpError { return new HttpError(503, 'O Claude retornou uma resposta incompleta ou incompatível. O resultado foi descartado; uma nova tentativa exige sua confirmação.'); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function tokenCount(value: unknown, minimum = 0, maximum = 100_000): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum; }

function payload(request: AnthropicRequest): Record<string, unknown> {
  const model = anthropicModelName(request.model);
  if (!Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > 8192 || typeof request.system !== 'string' || typeof request.prompt !== 'string' || !request.system || !request.prompt || !isRecord(request.schema)) throw new HttpError(400, 'O pedido ao Claude tem parâmetros inválidos.');
  // Sonnet 5.5 rejects disabled; between_tools without tools produces text only.
  // https://platform.claude.com/docs/en/build-with-claude/thinking
  const body = { model, system: request.system, messages: [{role:'user',content:request.prompt}], thinking: {type:model === 'claude-sonnet-5-5' ? 'between_tools' : 'disabled'}, output_config: {effort:'medium',format:{type:'json_schema',schema:anthropicSchema(request.schema)}} };
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 100_000) throw new HttpError(400, 'O pedido ao Claude excede o limite de contexto do assistente. Reduza o conteúdo antes de tentar novamente.');
  return body;
}

export function createAnthropicClient(options: {fetch?: typeof fetch} = {}): AnthropicClient {
  const fetcher = options.fetch ?? fetch;
  async function send(key: string, input: AnthropicRequest, counting: boolean): Promise<Record<string, unknown>> {
    if (typeof key !== 'string' || !/^[!-~]{10,512}$/.test(key)) throw new HttpError(400, 'A chave da API Claude está ausente ou tem formato inválido. Configure uma chave no cofre deste canal.');
    const body = payload(input);
    if (!counting) { body.max_tokens = input.maxTokens; body.stream = false; }
    let response: Response;
    try {
      response = await fetcher(counting ? `${endpoint}/count_tokens` : endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(counting ? 30_000 : 120_000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'anthropic-version': '2026-10-21' },
        body: JSON.stringify(body),
      });
    } catch { throw new HttpError(503, counting ? 'Não foi possível contar os tokens com o Claude. Nenhuma geração foi solicitada.' : 'O Claude não confirmou a conclusão. Pode haver cobrança; confira o consumo na Anthropic antes de autorizar outra tentativa.'); }
    if (!response.ok || !response.body) {
      try { await response.body?.cancel(); } catch { /* Never expose upstream failure details. */ }
      if ([401,403].includes(response.status)) throw new HttpError(503, 'A Anthropic recusou a credencial ou o acesso ao modelo. Revise a chave e as permissões do canal no Console Claude.');
      if (response.status === 429) throw new HttpError(429, 'A Anthropic atingiu um limite de uso. Confira os limites da conta e tente novamente quando estiverem disponíveis.');
      throw new HttpError(503, counting ? 'A contagem de tokens não foi concluída. Nenhuma geração foi solicitada.' : 'A Anthropic não concluiu a geração. Confira o consumo no Console Claude antes de autorizar outra tentativa.');
    }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > responseLimit) { try { await reader.cancel(); } catch { /* Bounded failure. */ } throw invalidResponse(); }
        chunks.push(part.value);
      }
      const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!isRecord(result)) throw invalidResponse();
      return result;
    } catch { throw invalidResponse(); }
    finally { reader.releaseLock(); }
  }
  return {
    async count(key, request) {
      const result = await send(key, request, true);
      if (!tokenCount(result.input_tokens, 1)) throw invalidResponse();
      return result.input_tokens;
    },
    async generate(key, request) {
      const result = await send(key, request, false);
      let usage:ProviderUsage|undefined,cacheWrite=0;
      if(isRecord(result.usage)){
        const raw=result.usage,cacheRead=raw.cache_read_input_tokens??0;cacheWrite=typeof raw.cache_creation_input_tokens==='number'?raw.cache_creation_input_tokens:0;
        if(tokenCount(raw.input_tokens)&&tokenCount(raw.output_tokens,0,request.maxTokens)&&tokenCount(cacheRead)&&tokenCount(raw.cache_creation_input_tokens??0)&&raw.input_tokens+cacheRead+cacheWrite<=100_000)usage={inputTokens:raw.input_tokens+cacheRead+cacheWrite,outputTokens:raw.output_tokens,...(cacheRead?{cachedInputTokens:cacheRead}:{})};
      }
      const rejected=()=>new ProviderResponseError(invalidResponse().message,usage,result.model!==request.model||cacheWrite>0);
      if(!usage||cacheWrite>0||result.type!=='message'||result.role!=='assistant'||result.model!==request.model||result.stop_reason!=='end_turn'||!Array.isArray(result.content)||!result.content.length)throw rejected();
      const texts: string[] = [];
      for (const block of result.content) {
        if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string' || !block.text.trim() || block.text.includes('\0')) throw rejected();
        texts.push(block.text);
      }
      return {text:texts.join('\n'),...usage};
    },
  };
}
