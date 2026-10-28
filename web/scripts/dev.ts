import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { localPort } from '../shared/local-port.ts';
try { localPort(); }
catch { console.error('Porta inválida: FRAMECHESTER_WEB_PORT deve ser um inteiro entre 1024 e 65535. Corrija a variável antes de iniciar.'); process.exit(1); }
const root = fileURLToPath(new URL('..', import.meta.url));
const jobs = [spawn(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), 'watch', 'server/index.ts'], { cwd: root, env: { ...process.env, FRAMECHESTER_WEB_DEV: '1' }, stdio: 'inherit', windowsHide: true }), spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: root, stdio: 'inherit', windowsHide: true })];
let stopping = false;
const stop = () => { if(stopping) return; stopping = true; for(const job of jobs) job.kill(); };
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, stop);
for(const job of jobs) { job.on('error', (error) => { console.error(error.message); stop(); process.exitCode = 1; }); job.on('exit', (code) => { if(!stopping) { stop(); process.exitCode = code ?? 1; } }); }
