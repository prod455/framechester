import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { localPort } from './shared/local-port.ts';
export default defineConfig(() => ({
  plugins: [tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, allowedHosts: ['127.0.0.1', 'localhost'], proxy: { '/api': { target: `http://127.0.0.1:${localPort()}` } } },
  build: { target: 'es2022', sourcemap: false },
}));
