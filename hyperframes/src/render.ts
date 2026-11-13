// Runs the pinned HyperFrames CLI on a project. The technical QA is the engine's
// (`framechester confronto` runs this CLI and then `qa` on the MP4).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..');
const require = createRequire(import.meta.url);

export type Quality = 'draft' | 'standard' | 'high';

export function packageVersion(name: string): string {
  const pkg = JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

/**
 * Environment for HyperFrames: telemetry and update checks off, its state kept inside the
 * repository's ignored .framechester/ instead of the home directory. A browser can be pinned
 * with HYPERFRAMES_BROWSER_PATH; otherwise HyperFrames manages its own.
 */
export function hyperframesEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const configDir = join(REPO, '.framechester', 'hyperframes');
  mkdirSync(configDir, { recursive: true });
  return {
    ...base,
    HYPERFRAMES_NO_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_SKIP_SKILLS: '1',
    HYPERFRAMES_CONFIG_DIR: configDir,
  };
}

function hyperframesBin(): string {
  return join(dirname(require.resolve('hyperframes/package.json')), 'bin', 'hyperframes.mjs');
}

function run(args: string[], label: string): void {
  const result = spawnSync(process.execPath, [hyperframesBin(), ...args], {
    env: hyperframesEnv(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`hyperframes ${label} terminou com código ${result.status}`);
}

export function lint(projectDir: string): void {
  run(['lint', projectDir], 'lint');
}

export function render(projectDir: string, output: string, quality: Quality): void {
  mkdirSync(dirname(output), { recursive: true });
  run(['render', projectDir, '-o', output, '-q', quality], 'render');
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
