import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { HttpError } from './auth.ts';

export interface CreativeSettings {
  prompt: {
    content: string;
    exists: boolean;
    updatedAt: string | null;
    fileName: '.framechester/system-prompt.personal.md';
  };
  model: string;
  provider: 'ollama' | 'anthropic' | 'openai';
  anthropicModel: string;
  openaiModel: string;
  maxOutputTokens: number;
  maxCostUsd: number;
}
type CreativeConfiguration = Omit<CreativeSettings, 'prompt'>;
export interface CreativeSettingsInput {
  content: unknown;
  model: unknown;
  provider?: unknown;
  anthropicModel?: unknown;
  openaiModel?: unknown;
  maxOutputTokens?: unknown;
  maxCostUsd?: unknown;
}
const configKeys = ['model', 'provider', 'anthropicModel', 'openaiModel', 'maxOutputTokens', 'maxCostUsd'];
const defaults: CreativeConfiguration = {
  model: '',
  provider: 'anthropic',
  anthropicModel: 'claude-sonnet-5-5',
  openaiModel: 'gpt-6.1-sol',
  maxOutputTokens: 4096,
  maxCostUsd: 1,
};
const anthropicModels = ['claude-sonnet-5-5', 'claude-haiku-5-5'];
const promptName = 'system-prompt.personal.md';
const modelName = 'creative.local.json';
const fileName = '.framechester/system-prompt.personal.md' as const;
function privateError(): HttpError {
  return new HttpError(
    503,
    'O armazenamento privado do prompt não está disponível ou contém vínculos inseguros.',
  );
}
export function localModelName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 160 ||
    (value !== '' &&
      (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value) ||
        value.includes('..') ||
        value.includes('://') ||
        /cloud/i.test(value)))
  )
    throw new HttpError(400, 'Escolha um nome de modelo local válido; modelos de nuvem não são aceitos.');
  return value;
}
function configuration(value: Record<string, unknown>, base: CreativeConfiguration): CreativeConfiguration {
  const model = localModelName(value.model);
  const provider = value.provider === undefined ? base.provider : value.provider;
  const anthropicModel = value.anthropicModel === undefined ? base.anthropicModel : value.anthropicModel;
  const openaiModel = value.openaiModel === undefined ? base.openaiModel : value.openaiModel;
  const maxOutputTokens = value.maxOutputTokens === undefined ? base.maxOutputTokens : value.maxOutputTokens;
  const maxCostUsd = value.maxCostUsd === undefined ? base.maxCostUsd : value.maxCostUsd;
  if (provider !== 'ollama' && provider !== 'anthropic' && provider !== 'openai')
    throw new HttpError(400, 'Escolha um provedor de IA disponível.');
  if (typeof anthropicModel !== 'string' || !anthropicModels.includes(anthropicModel))
    throw new HttpError(400, 'Escolha um modelo Claude disponível.');
  if (typeof openaiModel !== 'string' || !['gpt-6.1-sol', 'gpt-6-luna'].includes(openaiModel))
    throw new HttpError(400, 'Escolha um modelo OpenAI disponível.');
  if (
    typeof maxOutputTokens !== 'number' ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 512 ||
    maxOutputTokens > 8192
  )
    throw new HttpError(400, 'O limite de saída deve conter entre 512 e 8.192 tokens inteiros.');
  if (typeof maxCostUsd !== 'number' || !Number.isFinite(maxCostUsd) || maxCostUsd < 0.001 || maxCostUsd > 5)
    throw new HttpError(400, 'O teto de custo por geração deve estar entre US$ 0,001 e US$ 5.');
  return { model, provider, anthropicModel, openaiModel, maxOutputTokens, maxCostUsd };
}

/** Only these two fixed names are reachable. No request supplies a filesystem path. */
export class PrivatePromptStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly repositoryRoot: string) {}
  private async directory(create = false): Promise<string | undefined> {
    const root = await realpath(resolve(this.repositoryRoot));
    const path = join(root, '.framechester');
    try {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw privateError();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw privateError();
      if (!create) return undefined;
      await mkdir(path, { mode: 0o700 });
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw privateError();
    }
    if ((await realpath(path)) !== path) throw privateError();
    return path;
  }
  private async inspect(path: string): Promise<boolean> {
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 80_000)
        throw privateError();
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw privateError();
    }
  }
  private async readFile(
    directory: string,
    name: string,
  ): Promise<{ content: string; updatedAt: string } | undefined> {
    const path = join(directory, name);
    if (!(await this.inspect(path))) return undefined;
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size > 80_000) throw privateError();
      const content = await file.readFile('utf8');
      if (content.includes('\0')) throw privateError();
      return { content, updatedAt: info.mtime.toISOString() };
    } finally {
      await file.close();
    }
  }
  private async readConfiguration(
    directory?: string,
  ): Promise<{ value: CreativeConfiguration; exists: boolean }> {
    const file = directory ? await this.readFile(directory, modelName) : undefined;
    if (!file) return { value: { ...defaults }, exists: false };
    try {
      const parsed: unknown = JSON.parse(file.content);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        Object.keys(parsed).some((key) => !configKeys.includes(key))
      )
        throw privateError();
      // A file written by the original local-only Studio must retain its provider.
      return {
        value: configuration(parsed as Record<string, unknown>, { ...defaults, provider: 'ollama' }),
        exists: true,
      };
    } catch {
      throw privateError();
    }
  }
  async read(): Promise<CreativeSettings> {
    await this.pending;
    const directory = await this.directory();
    const prompt = directory ? await this.readFile(directory, promptName) : undefined;
    if (prompt && prompt.content.length > 20_000) throw privateError();
    const config = await this.readConfiguration(directory);
    return {
      prompt: {
        content: prompt?.content ?? '',
        exists: !!prompt,
        updatedAt: prompt?.updatedAt ?? null,
        fileName,
      },
      ...config.value,
    };
  }
  private async write(directory: string, name: string, content: string): Promise<void> {
    const path = join(directory, name);
    await this.inspect(path);
    const temporary = join(directory, `${name}.${randomBytes(12).toString('hex')}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(content, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await this.directory();
      await this.inspect(path);
      await rename(temporary, path);
      await chmod(path, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async save(value: CreativeSettingsInput): Promise<CreativeSettings> {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => key !== 'content' && !configKeys.includes(key))
    )
      throw new HttpError(
        400,
        'A configuração aceita apenas preferências editoriais e opções de modelo; credenciais pertencem ao cofre.',
      );
    if (typeof value.content !== 'string' || value.content.length > 20_000 || value.content.includes('\0'))
      throw new HttpError(
        400,
        'O prompt pessoal deve conter no máximo 20.000 caracteres, sem caracteres nulos.',
      );
    const content = value.content;
    const model = localModelName(value.model);
    const work = this.pending.then(async () => {
      const existingDirectory = await this.directory();
      const existing = await this.readConfiguration(existingDirectory);
      const base =
        !existing.exists && value.provider === undefined && model
          ? { ...existing.value, provider: 'ollama' as const }
          : existing.value;
      const config = configuration({ ...value, model }, base);
      const directory = await this.directory(true);
      if (!directory) throw privateError();
      // Validate both destinations before mutating either file.
      await this.inspect(join(directory, promptName));
      await this.inspect(join(directory, modelName));
      await this.write(directory, promptName, content);
      await this.write(directory, modelName, JSON.stringify(config, null, 2));
    });
    this.pending = work.catch(() => undefined);
    await work;
    return this.read();
  }
}
