import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import { join, parse, relative, resolve, sep } from 'node:path';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { HttpError } from './auth.ts';
import type {
  AIUsageProvider,
  AIUsageRecord,
  AIUsageSnapshot,
  AIUsageTotals,
  AIUsageStatus,
} from '../shared/ai-usage-types.ts';

export type { AIUsageRecord, AIUsageSnapshot, AIUsageTotals } from '../shared/ai-usage-types.ts';
export interface AIUsageBegin {
  channelId: string;
  provider: AIUsageProvider;
  key: string;
  task: AIUsageRecord['task'];
  model: string;
  operation: AIUsageRecord['operation'];
  pricingCheckedAt: string;
}
export interface AIUsageFinish {
  status: Exclude<AIUsageStatus, 'pending'>;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
  estimatedCostUsd?: number | null;
}
const maxBytes = 32 * 1024 * 1024;
const maxRecords = 50_000;
const metrics = [
  'inputTokens',
  'outputTokens',
  'cachedInputTokens',
  'reasoningTokens',
  'estimatedCostUsd',
] as const;
const recordKeys = [
  'id',
  'channelId',
  'provider',
  'credentialId',
  'task',
  'model',
  'operation',
  'status',
  'startedAt',
  'finishedAt',
  'latencyMs',
  ...metrics,
  'pricingCheckedAt',
];
const beginKeys = ['channelId', 'provider', 'key', 'task', 'model', 'operation', 'pricingCheckedAt'];
const finishKeys = ['status', ...metrics];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function storageError(): HttpError {
  return new HttpError(
    503,
    'O armazenamento privado de consumo está indisponível ou é inválido. Preserve o histórico e verifique as permissões antes de tentar novamente.',
  );
}
function invalid(): HttpError {
  return new HttpError(
    400,
    'O registro de consumo contém campos, tokens, custo, canal, provedor ou modelo inválidos.',
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[], exact = false): boolean {
  return (
    Object.keys(value).every((key) => allowed.includes(key)) &&
    (!exact || Object.keys(value).length === allowed.length)
  );
}
function owner(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}
function provider(value: unknown): value is AIUsageProvider {
  return value === 'anthropic' || value === 'openai';
}
function task(value: unknown): boolean {
  return value === 'research' || value === 'script' || value === 'story';
}
function model(value: unknown): value is string {
  return typeof value === 'string' && /^(claude-|gpt-)[a-zA-Z0-9._:-]{1,150}$/.test(value);
}
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function instant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function terminal(value: unknown): value is AIUsageFinish['status'] {
  return ['succeeded', 'rejected', 'failed', 'unknown'].includes(String(value));
}
function metric(value: unknown, cost = false): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= (cost ? 1_000_000 : 1_000_000_000) &&
      (cost || Number.isSafeInteger(value)))
  );
}
function validateRecord(value: unknown): value is AIUsageRecord {
  if (
    !object(value) ||
    !keys(value, recordKeys, true) ||
    typeof value.id !== 'string' ||
    !uuid.test(value.id) ||
    !owner(value.channelId) ||
    !provider(value.provider) ||
    typeof value.credentialId !== 'string' ||
    !/^[a-f0-9]{32}$/.test(value.credentialId) ||
    !task(value.task) ||
    !model(value.model) ||
    !['estimate', 'generation'].includes(String(value.operation)) ||
    !(value.status === 'pending' || terminal(value.status)) ||
    !instant(value.startedAt) ||
    !date(value.pricingCheckedAt)
  )
    return false;
  if (!metrics.every((key) => metric(value[key], key === 'estimatedCostUsd'))) return false;
  if (
    value.cachedInputTokens !== null &&
    value.inputTokens !== null &&
    Number(value.cachedInputTokens) > Number(value.inputTokens)
  )
    return false;
  if (
    value.reasoningTokens !== null &&
    value.outputTokens !== null &&
    Number(value.reasoningTokens) > Number(value.outputTokens)
  )
    return false;
  if (value.status === 'pending') return value.finishedAt === null && value.latencyMs === null;
  return (
    instant(value.finishedAt) &&
    typeof value.latencyMs === 'number' &&
    Number.isSafeInteger(value.latencyMs) &&
    value.latencyMs >= 0
  );
}
function totals(records: AIUsageRecord[]): AIUsageTotals {
  const generations = records.filter((record) => record.operation === 'generation');
  const sum = (key: (typeof metrics)[number]) => {
    const values = generations.flatMap((record) => (record[key] === null ? [] : [record[key]!]));
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  return {
    generationRequests: generations.length,
    estimateRequests: records.length - generations.length,
    successfulGenerations: generations.filter((record) => record.status === 'succeeded').length,
    failedGenerations: generations.filter(
      (record) => record.status === 'failed' || record.status === 'rejected',
    ).length,
    unknownGenerations: generations.filter(
      (record) => record.status === 'unknown' || record.status === 'pending',
    ).length,
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    cachedInputTokens: sum('cachedInputTokens'),
    reasoningTokens: sum('reasoningTokens'),
    estimatedCostUsd: sum('estimatedCostUsd'),
    unknownCostRequests: generations.filter((record) => record.estimatedCostUsd === null).length,
    unknownUsageRequests: generations.filter(
      (record) => record.inputTokens === null || record.outputTokens === null,
    ).length,
  };
}

/** Private, local-only accounting. Never stores prompts, responses, keys or upstream errors.
 * One instance owns a profile while its Studio process runs. There is no historical
 * provider backfill: snapshot scope is deliberately limited to this Studio's calls.
 */
export class AIUsageStore {
  private pending: Promise<unknown> = Promise.resolve();
  private initialized = false;
  private salt = '';
  private records: AIUsageRecord[] = [];
  private readonly path: string;
  constructor(
    directory: string,
    private readonly options: { now?: () => Date } = {},
  ) {
    this.path = resolve(directory);
  }
  private now(): Date {
    const value = this.options.now?.() ?? new Date();
    if (!Number.isFinite(value.getTime())) throw invalid();
    return value;
  }
  /** Check each ancestor too: accepting a linked parent would escape the profile. */
  private async directory(): Promise<void> {
    const root = parse(this.path).root;
    let current = root;
    for (const part of relative(root, this.path).split(sep).filter(Boolean)) {
      current = join(current, part);
      try {
        const info = await lstat(current);
        if (!info.isDirectory() || info.isSymbolicLink()) throw storageError();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw storageError();
        await mkdir(current, { mode: 0o700 });
        const info = await lstat(current);
        if (!info.isDirectory() || info.isSymbolicLink()) throw storageError();
      }
    }
    const canonical = resolve(await realpath(this.path));
    if (
      process.platform === 'win32'
        ? canonical.toLowerCase() !== this.path.toLowerCase()
        : canonical !== this.path
    )
      throw storageError();
  }
  private async inspect(name: string): Promise<boolean> {
    try {
      const info = await lstat(join(this.path, name));
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > maxBytes)
        throw storageError();
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw storageError();
    }
  }
  private async read(name: string): Promise<unknown | undefined> {
    if (!(await this.inspect(name))) return undefined;
    const file = await open(join(this.path, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size > maxBytes) throw storageError();
      const chunks: Buffer[] = [];
      let bytes = 0;
      while (true) {
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - bytes + 1));
        const part = await file.read(buffer, 0, buffer.length, null);
        if (!part.bytesRead) break;
        bytes += part.bytesRead;
        if (bytes > maxBytes) throw storageError();
        chunks.push(buffer.subarray(0, part.bytesRead));
      }
      return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
    } finally {
      await file.close();
    }
  }
  private async write(name: string, value: unknown): Promise<void> {
    await this.directory();
    await this.inspect(name);
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > maxBytes) throw storageError();
    const path = join(this.path, name),
      temporary = join(this.path, `${name}.${randomBytes(12).toString('hex')}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(text, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await this.directory();
      await this.inspect(name);
      await rename(temporary, path);
      await chmod(path, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  private async initialize(): Promise<void> {
    await this.directory();
    if (this.initialized) {
      if (!(await this.inspect('salt.json'))) throw storageError();
      const historyExists = await this.inspect('usage.json');
      if (this.records.length && !historyExists) throw storageError();
      return;
    }
    const history = await this.read('usage.json');
    const salt = await this.read('salt.json');
    if (history !== undefined && salt === undefined) throw storageError();
    if (salt !== undefined) {
      if (
        !object(salt) ||
        !keys(salt, ['version', 'salt'], true) ||
        salt.version !== 1 ||
        typeof salt.salt !== 'string' ||
        !/^[a-f0-9]{64}$/.test(salt.salt)
      )
        throw storageError();
      this.salt = salt.salt;
    } else {
      this.salt = randomBytes(32).toString('hex');
      await this.write('salt.json', { version: 1, salt: this.salt });
    }
    if (history !== undefined) {
      if (
        !object(history) ||
        !keys(history, ['version', 'records'], true) ||
        history.version !== 1 ||
        !Array.isArray(history.records) ||
        history.records.length > maxRecords ||
        !history.records.every(validateRecord) ||
        new Set(history.records.map((record) => record.id)).size !== history.records.length
      )
        throw storageError();
      this.records = history.records;
      const recovered = this.records.map((record) =>
        record.status === 'pending'
          ? {
              ...record,
              status: 'unknown' as const,
              finishedAt: this.now().toISOString(),
              latencyMs: Math.max(0, this.now().getTime() - Date.parse(record.startedAt)),
            }
          : record,
      );
      if (this.records.some((record) => record.status === 'pending')) {
        await this.write('usage.json', { version: 1, records: recovered });
        this.records = recovered;
      }
    }
    this.initialized = true;
  }
  private async work<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.pending.then(async () => {
      try {
        await this.initialize();
        return await action();
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw storageError();
      }
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
  async begin(input: AIUsageBegin): Promise<AIUsageRecord> {
    if (
      !object(input) ||
      !keys(input, beginKeys, true) ||
      !owner(input.channelId) ||
      !provider(input.provider) ||
      typeof input.key !== 'string' ||
      !/^[!-~]{10,512}$/.test(input.key) ||
      !task(input.task) ||
      !model(input.model) ||
      !['estimate', 'generation'].includes(input.operation) ||
      !date(input.pricingCheckedAt)
    )
      throw invalid();
    // Capture only the allowed primitives. The raw key never reaches the serialized record.
    const {
      channelId,
      provider: source,
      key,
      task: kind,
      model: selected,
      operation,
      pricingCheckedAt,
    } = input;
    return this.work(async () => {
      if (this.records.length >= maxRecords)
        throw new HttpError(
          503,
          'O histórico de consumo atingiu o limite local. Preserve e arquive os registros antes de iniciar novas chamadas.',
        );
      const credentialId = createHmac('sha256', Buffer.from(this.salt, 'hex'))
        .update(JSON.stringify([channelId, source, key]))
        .digest('hex')
        .slice(0, 32);
      const record: AIUsageRecord = {
        id: randomUUID(),
        channelId,
        provider: source,
        credentialId,
        task: kind,
        model: selected,
        operation,
        pricingCheckedAt,
        status: 'pending',
        startedAt: this.now().toISOString(),
        finishedAt: null,
        latencyMs: null,
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        reasoningTokens: null,
        estimatedCostUsd: null,
      };
      const next = [...this.records, record];
      await this.write('usage.json', { version: 1, records: next });
      this.records = next;
      return structuredClone(record);
    });
  }
  async finish(id: string, result: AIUsageFinish): Promise<void> {
    if (
      typeof id !== 'string' ||
      !uuid.test(id) ||
      !object(result) ||
      !keys(result, finishKeys) ||
      !terminal(result.status) ||
      !metrics.every((key) => result[key] === undefined || metric(result[key], key === 'estimatedCostUsd'))
    )
      throw invalid();
    const patch = structuredClone(result);
    return this.work(async () => {
      const index = this.records.findIndex((record) => record.id === id);
      if (index < 0) throw new HttpError(404, 'Registro de consumo não encontrado.');
      if (this.records[index].status !== 'pending')
        throw new HttpError(409, 'Este registro de consumo já foi concluído.');
      const record = this.records[index],
        finished = this.now();
      const nextRecord: AIUsageRecord = {
        ...record,
        status: patch.status,
        finishedAt: finished.toISOString(),
        latencyMs: Math.max(0, finished.getTime() - Date.parse(record.startedAt)),
      };
      for (const metric of metrics) if (patch[metric] !== undefined) nextRecord[metric] = patch[metric]!;
      if (!validateRecord(nextRecord)) throw invalid();
      const next = [...this.records];
      next[index] = nextRecord;
      await this.write('usage.json', { version: 1, records: next });
      this.records = next;
    });
  }
  async hasHistory(channelId: string): Promise<boolean> {
    if (!owner(channelId)) throw invalid();
    return this.work(async () => this.records.some((record) => record.channelId === channelId));
  }
  async snapshot(
    channelId: string,
    options: { days?: number; provider?: AIUsageProvider } = {},
  ): Promise<AIUsageSnapshot> {
    if (!owner(channelId) || !object(options) || !keys(options, ['days', 'provider'])) throw invalid();
    const days = options.days ?? 30;
    if (!Number.isInteger(days) || days < 1 || days > 90)
      throw new HttpError(400, 'Escolha um período de 1 a 90 dias.');
    if (options.provider !== undefined && !provider(options.provider)) throw invalid();
    const selected = options.provider;
    return this.work(async () => {
      const to = this.now(),
        from = new Date(to.getTime() - days * 86400_000);
      const records = this.records.filter(
        (record) =>
          record.channelId === channelId &&
          (!selected || record.provider === selected) &&
          Date.parse(record.startedAt) >= from.getTime() &&
          Date.parse(record.startedAt) <= to.getTime(),
      );
      const groups = new Map<string, AIUsageRecord[]>();
      for (const record of records) {
        const existing = groups.get(record.credentialId) ?? [];
        existing.push(record);
        groups.set(record.credentialId, existing);
      }
      const byCredential = [...groups.entries()]
        .map(([credentialId, records]) => ({
          credentialId,
          provider: records[0].provider,
          lastUsedAt: records.reduce(
            (last, record) => (last > record.startedAt ? last : record.startedAt),
            records[0].startedAt,
          ),
          ...totals(records),
        }))
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
      return structuredClone({
        scope: 'studio',
        channelId,
        from: from.toISOString(),
        to: to.toISOString(),
        events: [...records].reverse().slice(0, 100),
        totals: totals(records),
        byCredential,
      });
    });
  }
}
