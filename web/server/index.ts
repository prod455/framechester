import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { LocalStore, defaultHome } from './store.ts';
import { createRunner, RunnerError } from './runner.ts';
import { HttpError } from './auth.ts';
import { createSocialService } from './social.ts';
import { createLocalVault } from './vault.ts';
import { PrivatePromptStore } from './private-prompt.ts';
import { createCreativeService } from './creative.ts';
import { createSourceFinder } from './sources.ts';
import { AIUsageStore } from './ai-usage.ts';
import { createFileVault } from './file-vault.ts';
import { existsSync } from 'node:fs';
import { InvalidRuntimeConfiguration, runtimeConfiguration } from './runtime.ts';
import { InvalidLocalPort, localPort } from '../shared/local-port.ts';
export { localPort } from '../shared/local-port.ts';
/** Startup errors may contain private paths or upstream content: only emit controlled guidance. */
export function startupDiagnostic(error: unknown): string {
  if (error instanceof InvalidRuntimeConfiguration) return error.message;
  if (error instanceof InvalidLocalPort)
    return 'Porta inválida: FRAMECHESTER_WEB_PORT deve ser um inteiro entre 1024 e 65535. Corrija a variável antes de iniciar.';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'EADDRINUSE')
    return 'A porta local já está em uso. Encerre a outra instância ou defina FRAMECHESTER_WEB_PORT com uma porta livre entre 1024 e 65535; use um perfil separado para outra instância.';
  if (code === 'EACCES' || code === 'EPERM')
    return 'Permissão negada ao iniciar. Confira o acesso ao diretório de dados definido por FRAMECHESTER_WEB_HOME e à porta local; preserve os dados existentes e não inicie como administrador para contornar o problema.';
  if (error instanceof HttpError || error instanceof RunnerError)
    return 'O armazenamento local não pôde ser carregado. Preserve o perfil definido por FRAMECHESTER_WEB_HOME e confira os arquivos de estado, autenticação e índices antes de tentar novamente; não apague o perfil para recuperar o acesso.';
  return 'Não foi possível iniciar o Framechester Studio local. Confira a porta e as permissões do armazenamento privado, preserve o perfil e execute npm --prefix web run check para verificar a instalação.';
}
export async function startLocalServer() {
  const port = localPort();
  const home = defaultHome();
  const webRoot = fileURLToPath(new URL('..', import.meta.url));
  const runtime = runtimeConfiguration(process.env, existsSync('/.dockerenv'));
  const store = new LocalStore(home);
  await store.ready;
  const runner = await createRunner({
    home,
    repositoryRoot: resolve(webRoot, '..'),
    binary: runtime.engineBinary,
    readState: () => store.read(),
  });
  const vault = runtime.vaultKeyFile
    ? createFileVault({ directory: join(home, 'vault'), keyFile: runtime.vaultKeyFile })
    : createLocalVault({ directory: join(home, 'vault') });
  const social = createSocialService({ vault });
  const privatePrompt = new PrivatePromptStore(runtime.privateRoot ?? resolve(webRoot, '..'));
  const usage = new AIUsageStore(join(home, 'ai-usage'));
  const creative = createCreativeService({
    settings: privatePrompt,
    readState: () => store.read(),
    vault,
    usage,
  });
  const app = await createApp({
    home,
    store,
    runner,
    social,
    privatePrompt,
    creative,
    sources: createSourceFinder(),
    publicPort: runtime.publicPort,
    distDir: join(webRoot, 'dist'),
    dev: process.env.FRAMECHESTER_WEB_DEV === '1',
  });
  const server = createServer(app.handler);
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, runtime.host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await runner.close();
    throw error;
  }
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      await runner.close();
      server.closeAllConnections();
      await stopped;
    })());
  return { server, app, runner, close, url: `http://127.0.0.1:${runtime.publicPort ?? port}` };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startLocalServer()
    .then((instance) => {
      console.log(`Framechester Studio local: ${instance.url}`);
      for (const signal of ['SIGINT', 'SIGTERM'] as const)
        process.once(signal, () => {
          void instance.close().then(() => {
            process.exitCode = 0;
          });
        });
    })
    .catch((error) => {
      console.error(startupDiagnostic(error));
      process.exitCode = 1;
    });
}
