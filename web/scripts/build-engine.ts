import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const local = join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
const child = spawn(existsSync(local) ? local : 'cargo', ['build', '--workspace'], {
  cwd: fileURLToPath(new URL('../..', import.meta.url)),
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});
child.on('error', () => {
  console.error('Toolchain Rust indisponível.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
