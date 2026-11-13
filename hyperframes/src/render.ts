// Runs the pinned HyperFrames CLI on a project. The technical QA is the engine's
// (`framechester confronto` runs this CLI and then `qa` on the MP4).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
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
 * Environment for HyperFrames: telemetry and update checks off, and every file it keeps
 * (config, install state, cache, downloaded browser) inside the repository's ignored
 * .framechester/hyperframes/ instead of the operator's home: HyperFrames 0.9 writes
 * ~/.hyperframes and ~/.cache/hyperframes from the home directory, so the child process
 * gets its own HOME/USERPROFILE. A browser can be pinned with HYPERFRAMES_BROWSER_PATH;
 * the engine passes its configured ffmpeg in HYPERFRAMES_FFMPEG_PATH/HYPERFRAMES_FFPROBE_PATH.
 */
export function hyperframesEnv(
  base: NodeJS.ProcessEnv = process.env,
  root: string = join(REPO, '.framechester', 'hyperframes'),
): NodeJS.ProcessEnv {
  const home = join(root, 'home');
  const cache = join(root, 'cache');
  mkdirSync(home, { recursive: true });
  mkdirSync(cache, { recursive: true });
  return {
    ...base,
    HOME: home,
    USERPROFILE: home,
    HYPERFRAMES_CONFIG_DIR: root,
    HYPERFRAMES_CACHE_DIR: cache,
    HYPERFRAMES_NO_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_SKIP_SKILLS: '1',
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

/** One hash over the files that decide how a confronto looks and what it says. */
export function templateSha256(): string {
  const hash = createHash('sha256');
  const files = [
    join(HERE, '..', 'templates', 'confronto.css'),
    join(HERE, '..', 'templates', 'confronto.js'),
    ...readdirSync(HERE)
      .filter((f) => f.endsWith('.ts'))
      .sort()
      .map((f) => join(HERE, f)),
  ];
  for (const file of files) hash.update(basename(file)).update(readFileSync(file));
  return hash.digest('hex');
}
