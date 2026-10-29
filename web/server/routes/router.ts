// Authenticated API routes as a table. A pattern is a path whose `:name` segments become
// `params`; `:name(a|b)` only matches the listed values. The first route whose method and
// pattern match wins, and a request that matches nothing is a 404 for the caller to raise.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SocialApi, RunnerApi } from '../../shared/types.ts';
import type { LocalStore } from '../store.ts';
import type { LocalAuth } from '../auth.ts';
import { HttpError } from '../auth.ts';
import { channelId } from '../store.ts';
import type { CreativeApi } from '../creative.ts';
import type { PrivatePromptStore } from '../private-prompt.ts';

export type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';

export interface AppDependencies {
  store: LocalStore;
  auth: LocalAuth;
  publicPort?: number;
  /** Each accessor throws a 503 when the service was not configured for this instance. */
  social: () => SocialApi;
  runner: () => RunnerApi;
  creative: () => CreativeApi;
  privatePrompt: () => PrivatePromptStore;
  /** Optional services, for routes that degrade instead of failing without them. */
  optional: { social?: SocialApi; runner?: RunnerApi; creative?: CreativeApi };
}

export interface RouteContext extends AppDependencies {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  method: Method;
  params: Record<string, string>;
  session: Awaited<ReturnType<LocalAuth['guard']>>;
  cookie?: string;
  csrf?: string;
}

export interface Route {
  method: Method | Method[];
  pattern: string;
  handle: (context: RouteContext) => Promise<void>;
}

interface Compiled {
  route: Route;
  methods: Method[];
  regex: RegExp;
  names: string[];
}

export function compilePattern(pattern: string): { regex: RegExp; names: string[] } {
  const names: string[] = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      const match = /^:(\w+)(?:\(([^)]+)\))?$/.exec(segment);
      if (!match) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(match[1]);
      return match[2] ? `(${match[2]})` : '([^/]+)';
    })
    .join('/');
  return { regex: new RegExp(`^${source}$`), names };
}

export function compileRoutes(routes: Route[]): Compiled[] {
  const seen = new Set<string>();
  return routes.map((route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      const key = `${method} ${route.pattern}`;
      if (seen.has(key)) throw new Error(`Rota duplicada: ${key}`);
      seen.add(key);
    }
    return { route, methods, ...compilePattern(route.pattern) };
  });
}

export function matchRoute(
  compiled: Compiled[],
  method: string,
  path: string,
): { route: Route; params: Record<string, string> } | undefined {
  for (const entry of compiled) {
    if (!entry.methods.includes(method as Method)) continue;
    const match = entry.regex.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    entry.names.forEach((name, index) => {
      params[name] = match[index + 1];
    });
    return { route: entry.route, params };
  }
  return undefined;
}

/** Validates `:id` and confirms the channel exists before any channel route runs. */
export async function requireChannel(context: RouteContext): Promise<string> {
  const id = channelId(context.params.id);
  await context.store.requireChannel(id);
  return id;
}

export function unavailable(message: string): never {
  throw new HttpError(503, message);
}
