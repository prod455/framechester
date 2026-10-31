import { isAbsolute } from 'node:path';
import { localPort } from '../shared/local-port.ts';

export class InvalidRuntimeConfiguration extends Error {}
function filePath(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!value || value.includes('\0') || !isAbsolute(value))
    throw new InvalidRuntimeConfiguration('Caminhos de infraestrutura devem ser absolutos e válidos.');
  return value;
}
/** A Tailscale MagicDNS name (`meu-pc.tail1234.ts.net`). It only resolves inside the
 * operator's tailnet, so accepting it lets the operator's own phone reach the Studio through
 * `tailscale serve` while the server keeps listening on loopback only. Any other public name
 * is refused: the Studio is never published to the internet. */
function tailnetHost(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  const host = value.trim().toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.ts\.net$/.test(host)
  )
    throw new InvalidRuntimeConfiguration(
      'FRAMECHESTER_TAILNET_HOST aceita só o nome do computador no Tailscale, terminado em .ts.net.',
    );
  return host;
}
/** The project's public relay page for TikTok's redirect (GitHub Pages of this repository). */
export const DEFAULT_TIKTOK_RELAY = 'https://prod455.github.io/framechester/oauth/tiktok/';
/** TikTok's portal refuses loopback redirects, so TikTok logins return through a static HTTPS
 * page that forwards to 127.0.0.1. `loopback` keeps the direct 127.0.0.1 callback instead. */
function tiktokRelay(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return DEFAULT_TIKTOK_RELAY;
  if (value.trim() === 'loopback') return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new InvalidRuntimeConfiguration('FRAMECHESTER_TIKTOK_REDIRECT_URI precisa ser uma URL HTTPS.');
  }
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password)
    throw new InvalidRuntimeConfiguration(
      'FRAMECHESTER_TIKTOK_REDIRECT_URI precisa ser uma URL HTTPS fixa, sem parâmetros.',
    );
  return url.href;
}
/** Native operation remains loopback-only. Container ingress must be published on host loopback. */
export function runtimeConfiguration(environment: NodeJS.ProcessEnv, containerDetected = false) {
  const container = environment.FRAMECHESTER_CONTAINER === '1';
  if (environment.FRAMECHESTER_CONTAINER !== undefined && !container)
    throw new InvalidRuntimeConfiguration('Modo de contêiner inválido.');
  if (container && !containerDetected)
    throw new InvalidRuntimeConfiguration('O modo de contêiner requer uma execução Docker detectada.');
  if (environment.FRAMECHESTER_WEB_PUBLIC_PORT !== undefined && !container)
    throw new InvalidRuntimeConfiguration('Porta publicada é exclusiva da execução em contêiner.');
  const publicPort =
    environment.FRAMECHESTER_WEB_PUBLIC_PORT === undefined
      ? undefined
      : localPort(environment.FRAMECHESTER_WEB_PUBLIC_PORT);
  const vaultKeyFile = filePath(environment.FRAMECHESTER_VAULT_KEY_FILE);
  if (container && !vaultKeyFile)
    throw new InvalidRuntimeConfiguration('O contêiner exige um arquivo externo para a chave do cofre.');
  return {
    host: container ? ('0.0.0.0' as const) : ('127.0.0.1' as const),
    publicPort,
    vaultKeyFile,
    privateRoot: filePath(environment.FRAMECHESTER_PRIVATE_ROOT),
    tailnetHost: tailnetHost(environment.FRAMECHESTER_TAILNET_HOST),
    tiktokRelay: tiktokRelay(environment.FRAMECHESTER_TIKTOK_REDIRECT_URI),
    engineBinary: filePath(environment.FRAMECHESTER_ENGINE_BINARY),
  };
}
