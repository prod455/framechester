export class InvalidLocalPort extends Error {
  constructor() { super('FRAMECHESTER_WEB_PORT deve ser uma porta inteira entre 1024 e 65535.'); }
}

/** Shared by the backend and Vite so development never selects another instance. */
export function localPort(value = process.env.FRAMECHESTER_WEB_PORT): number {
  if (value !== undefined && !/^\d+$/.test(value)) throw new InvalidLocalPort();
  const port = value === undefined ? 4317 : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new InvalidLocalPort();
  return port;
}
