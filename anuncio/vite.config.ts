import { defineConfig } from 'vite';

// Só local: Studio e renderizador ficam no loopback. appType "mpa" faz arquivo ausente
// responder 404, em vez da página, para a checagem de public/ não se enganar.
export default defineConfig({
  appType: 'mpa',
  publicDir: 'public',
  server: { host: '127.0.0.1', port: 4318, strictPort: false },
  logLevel: 'warn',
});
