import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const modelsOnly = process.argv.includes('--models-only');
const candidates = process.platform === 'win32'
  ? [['py', '-3.12'], ['py', '-3.13'], ['py', '-3.11'], ['python']]
  : [['python3.12'], ['python3.13'], ['python3.11'], ['python3']];
let candidate;
for (const entry of candidates) {
  const probe = spawnSync(entry[0], [...entry.slice(1), '-c', modelsOnly ? 'import sys;sys.exit(0)' : 'import sys;sys.exit(not ((3,11)<=sys.version_info[:2]<(3,14)))'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
  if (probe.status === 0) { candidate = entry; break; }
}
if (!candidate) {
  console.error('Instale Python 3.11–3.13 para o narrador local. Para Docker: npm run voices:models (qualquer Python 3.11+).');
  process.exitCode = 1;
} else {
  const result = spawnSync(candidate[0], [...candidate.slice(1), join(root, 'scripts/setup_voices.py'), ...(modelsOnly ? ['--models-only'] : [])], { cwd: root, shell: false, windowsHide: true, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
