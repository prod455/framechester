import { HttpError } from './auth.ts';

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}
/** Carries validated counters only, never the provider response or private input. */
export class ProviderResponseError extends HttpError {
  constructor(
    message: string,
    readonly usage?: ProviderUsage,
    readonly costUnknown = false,
  ) {
    super(503, message);
  }
}
