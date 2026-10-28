import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startupDiagnostic } from '../server/index.ts';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
function launch(home: string, port: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(webRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'server/index.ts'], { cwd: webRoot, env: { ...process.env, FRAMECHESTER_WEB_HOME: home, FRAMECHESTER_WEB_PORT: port }, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup fixture did not finish.')); }, 10_000);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

test('startup reports an invalid port with its configuration key and allowed range', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-start-invalid-port-'));
  try {
    const result = await launch(home, 'synthetic-private-value');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /FRAMECHESTER_WEB_PORT.*1024.*65535/);
    assert.equal(result.stderr.includes('synthetic-private-value'), false);
    assert.equal(result.stderr.includes(home), false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('an occupied local port reports how to stop the other instance or select another port', async () => {
  const occupied = createServer();
  await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));
  const address = occupied.address(); assert.ok(address && typeof address !== 'string');
  const home = await mkdtemp(join(tmpdir(), 'fc-start-busy-port-'));
  try {
    const result = await launch(home, String(address.port));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /porta.*(?:ocupada|em uso)/i);
    assert.match(result.stderr, /(?:encerre|feche).*FRAMECHESTER_WEB_PORT/i);
    assert.equal(result.stderr.includes(home), false);
    assert.equal(result.stdout.includes('Studio local:'), false);
  } finally { await new Promise<void>(resolve => occupied.close(() => resolve())); await rm(home, { recursive: true, force: true }); }
});

test('corrupt local state produces recovery guidance without echoing paths or file contents', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-start-corrupt-state-'));
  const content = 'synthetic-private-content: invalid JSON';
  await writeFile(join(home, 'state.json'), content);
  try {
    const result = await launch(home, '4319');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /armazenamento.*preserve/i);
    assert.equal(result.stderr.includes(home), false);
    assert.equal(result.stderr.includes(content), false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('permission and unexpected startup failures never expose raw private messages', () => {
  const privateMessage = 'C:/synthetic-private-path token=synthetic-private-token';
  for (const code of ['EACCES', 'EPERM']) {
    const diagnostic = startupDiagnostic(Object.assign(new Error(privateMessage), { code }));
    assert.match(diagnostic, /Permissão negada/);
    assert.match(diagnostic, /FRAMECHESTER_WEB_HOME/);
    assert.equal(diagnostic.includes(privateMessage), false);
  }
  const unexpected = startupDiagnostic(new Error(privateMessage));
  assert.match(unexpected, /npm --prefix web run check/);
  assert.equal(unexpected.includes(privateMessage), false);
});
