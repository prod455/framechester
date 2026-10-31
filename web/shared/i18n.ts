/** Interface language. Portuguese is the source: every message is written in pt-BR at its call
 * site and doubles as the key of the English and Spanish catalogs, so the code reads as the
 * interface does. A test fails when a message has no translation (tests/i18n.test.ts).
 *
 * Placeholders use `{name}`: `t('Short na fila: {title}', { title })`. The same templates
 * translate messages that arrive already composed, such as server errors. */
import { catalogs } from './locales/index.ts';

export type Locale = 'pt-BR' | 'en' | 'es';
export const LOCALES: ReadonlyArray<{ id: Locale; label: string }> = [
  { id: 'pt-BR', label: 'Português' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];
const STORAGE_KEY = 'framechester.locale';

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((item) => item.id === value);
}
function stored(): Locale | undefined {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLocale(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
let current: Locale = stored() ?? 'pt-BR';

export function locale(): Locale {
  return current;
}
/** BCP 47 tag for Intl and `<html lang>`. */
export function languageTag(value: Locale = current): string {
  return value === 'en' ? 'en-US' : value === 'es' ? 'es-ES' : 'pt-BR';
}
export function setLocale(value: Locale): void {
  current = value;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    // Private windows may refuse storage; the choice still holds for this page.
  }
}
/** First visit: follow the browser language when it is English or Spanish. */
export function detectLocale(languages: readonly string[]): Locale {
  const saved = stored();
  if (saved) return saved;
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'pt') return 'pt-BR';
    if (base === 'en') return 'en';
    if (base === 'es') return 'es';
  }
  return 'pt-BR';
}

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
/** Translates a pt-BR message written at the call site. */
export function t(source: string, vars?: Record<string, string | number>): string {
  const target = current === 'pt-BR' ? undefined : catalogs[current][source];
  return fill(target ?? source, vars);
}

type Pattern = { regex: RegExp; names: string[]; target: string; literal: number };
const patterns = new Map<Locale, Pattern[]>();
function compiled(value: Exclude<Locale, 'pt-BR'>): Pattern[] {
  let list = patterns.get(value);
  if (!list) {
    list = Object.entries(catalogs[value])
      .filter(([source]) => /\{\w+\}/.test(source))
      .map(([source, target]) => {
        const names: string[] = [];
        const body = source
          .split(/(\{\w+\})/)
          .map((part) => {
            const name = /^\{(\w+)\}$/.exec(part)?.[1];
            if (!name) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            names.push(name);
            return '([\\s\\S]+?)';
          })
          .join('');
        return {
          regex: new RegExp(`^${body}$`),
          names,
          target,
          literal: source.replace(/\{\w+\}/g, '').length,
        };
      })
      // The most specific template wins: "{start} a {end}" also matches longer sentences.
      .sort((left, right) => right.literal - left.literal);
    patterns.set(value, list);
  }
  return list;
}
/** Translates a message composed elsewhere (a server error): exact match first, then the
 * templates. Unknown text, such as the operator's own content, is returned unchanged. */
export function translateMessage(message: string): string {
  if (current === 'pt-BR') return message;
  const exact = catalogs[current][message];
  if (exact) return exact;
  for (const pattern of compiled(current)) {
    const match = pattern.regex.exec(message);
    if (match)
      return fill(
        pattern.target,
        Object.fromEntries(pattern.names.map((name, index) => [name, match[index + 1]!])),
      );
  }
  return message;
}
