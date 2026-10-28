import type { CreativeTask } from './creative-types.ts';

export type AIUsageProvider = 'anthropic' | 'openai';
export type AIUsageStatus = 'pending' | 'succeeded' | 'rejected' | 'failed' | 'unknown';
export interface AIUsageRecord {
  id: string;
  channelId: string;
  provider: AIUsageProvider;
  /** Opaque identifier bound to this installation, provider and channel. Not a key fragment. */
  credentialId: string;
  task: CreativeTask;
  model: string;
  operation: 'estimate' | 'generation';
  status: AIUsageStatus;
  startedAt: string;
  finishedAt: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  estimatedCostUsd: number | null;
  pricingCheckedAt: string;
}
export interface AIUsageTotals {
  generationRequests: number;
  estimateRequests: number;
  successfulGenerations: number;
  failedGenerations: number;
  unknownGenerations: number;
  /** Sums of reported generation usage only. Null means none was reported. */
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  estimatedCostUsd: number | null;
  unknownCostRequests: number;
  unknownUsageRequests: number;
}
export interface AIUsageCredentialTotals extends AIUsageTotals {
  credentialId: string;
  provider: AIUsageProvider;
  lastUsedAt: string;
}
export interface AIUsageSnapshot {
  scope: 'studio';
  channelId: string;
  from: string;
  to: string;
  events: AIUsageRecord[];
  totals: AIUsageTotals;
  byCredential: AIUsageCredentialTotals[];
}
