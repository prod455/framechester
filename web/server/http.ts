// Request and response helpers with no knowledge of the Studio's routes.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { HttpError } from './auth.ts';
import { object } from './store.ts';

export function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

export function string(value: unknown, name: string, max = 1000, min = 1): string {
  if (typeof value !== 'string' || value.length < min || value.length > max || value.includes('\0'))
    throw new HttpError(400, `Campo inválido: ${name}.`);
  return value;
}

export function allowedKeys(item: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(item).some((key) => !allowed.includes(key)))
    throw new HttpError(400, 'O objeto contém campos não permitidos.');
}

export function ownerBody(item: Record<string, unknown>, owner: string): void {
  if (item.channelId !== undefined && item.channelId !== owner)
    throw new HttpError(409, 'O recurso pertence a outro canal.');
}

export async function readJson(
  request: IncomingMessage,
  limit = 1024 * 1024,
): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new HttpError(415, 'Use Content-Type application/json.');
  const declared = request.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new HttpError(413, 'O corpo da requisição excede o limite permitido.');
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failed = false;
    request.on('data', (chunk: Buffer) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > limit) {
        failed = true;
        chunks.length = 0;
        reject(new HttpError(413, 'O corpo da requisição excede o limite permitido.'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
  try {
    return object(JSON.parse(buffer.toString('utf8')));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'JSON inválido.');
  }
}

export function securityHeaders(response: ServerResponse, dev: boolean): void {
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'${dev ? ' http://127.0.0.1:5173 http://localhost:5173 ws://127.0.0.1:5173 ws://localhost:5173' : ''}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export function checkOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  dev: boolean,
  publicPort?: number,
): void {
  const port = request.socket.localPort ?? 4317;
  const ports = [port, ...(publicPort === undefined ? [] : [publicPort]), ...(dev ? [5173] : [])];
  const hosts = ports.flatMap((value) => [`127.0.0.1:${value}`, `localhost:${value}`]);
  if (!request.headers.host || !hosts.includes(request.headers.host.toLowerCase()))
    throw new HttpError(403, 'Host local não permitido.');
  const origin = request.headers.origin;
  const origins = hosts.map((host) => `http://${host}`);
  if (origin && !origins.includes(origin)) throw new HttpError(403, 'Origem não permitida.');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? 'GET') && !origin)
    throw new HttpError(403, 'Origem local obrigatória nesta operação.');
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
}

export async function sendFile(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  contentType: string,
  attachment?: string,
): Promise<void> {
  const info = await stat(path);
  if (!info.isFile()) throw new HttpError(404, 'Arquivo não encontrado.');
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (!match || (!match[1] && !match[2])) {
      response.setHeader('Content-Range', `bytes */${info.size}`);
      throw new HttpError(416, 'Faixa de bytes inválida.');
    }
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, info.size - suffix);
    } else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= info.size ||
      start < 0
    ) {
      response.setHeader('Content-Range', `bytes */${info.size}`);
      throw new HttpError(416, 'Faixa de bytes inválida.');
    }
    status = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
  }
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', Math.max(0, end - start + 1));
  if (attachment) response.setHeader('Content-Disposition', `attachment; filename="${attachment}"`);
  response.writeHead(status);
  if (request.method === 'HEAD' || info.size === 0) {
    response.end();
    return;
  }
  const stream = createReadStream(path, { start, end });
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

const staticTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export async function staticFile(
  request: IncomingMessage,
  response: ServerResponse,
  directory: string,
  decoded: string,
): Promise<void> {
  let root: string;
  try {
    root = await realpath(directory);
  } catch {
    throw new HttpError(503, 'A interface ainda não foi compilada. Execute o build web local.');
  }
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(root + sep))
    throw new HttpError(403, 'Caminho não permitido.');
  let target = candidate;
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = resolve(target, 'index.html');
  } catch {
    if (extname(decoded)) throw new HttpError(404, 'Arquivo não encontrado.');
    target = resolve(root, 'index.html');
  }
  let canonical: string;
  try {
    canonical = await realpath(target);
  } catch {
    throw new HttpError(404, 'Arquivo não encontrado.');
  }
  if (!canonical.startsWith(root + sep)) throw new HttpError(403, 'Caminho não permitido.');
  if (decoded.startsWith('/assets/'))
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  await sendFile(request, response, canonical, staticTypes[extname(canonical)] ?? 'application/octet-stream');
}
