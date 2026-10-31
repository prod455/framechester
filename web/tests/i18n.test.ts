import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
// TypeScript 7 has no JavaScript API; the oxc parser that Vite already ships reads the source.
import { parseSync } from 'rolldown/utils';
import { catalogs } from '../shared/locales/index.ts';
import { detectLocale, locale, setLocale, t, translateMessage } from '../shared/i18n.ts';

const root = join(import.meta.dirname, '..');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.ts') && !path.endsWith('.d.ts') ? [path] : [];
  });
}
/** `${expr}` becomes `{}` and `{name}` becomes `{}`, so a server template matches its catalog key. */
const shape = (text: string) => text.replace(/\$\{[^}]*\}|\{\w+\}/g, '{}');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = { type: string; start: number; [key: string]: any };
function literal(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((quasi: Node) => quasi.value.cooked).join('{}');
  return undefined;
}
interface Found {
  text: string;
  where: string;
}
type Visit = (
  node: Node,
  parent: Node | undefined,
  found: (text: string, node: Node) => void,
  line: (node: Node) => string,
) => void;
function scan(path: string, visit: Visit): Found[] {
  const code = readFileSync(path, 'utf8');
  const program = parseSync(path, code).program as unknown as Node;
  const lines = code.split('\n');
  const lineOf = (node: Node) => code.slice(0, node.start).split('\n').length;
  const out: Found[] = [];
  const found = (text: string, node: Node) =>
    out.push({ text, where: `${relative(root, path)}:${lineOf(node)}` });
  const line = (node: Node) => lines[lineOf(node) - 1] ?? '';
  const walk = (node: Node, parent: Node | undefined) => {
    visit(node, parent, found, line);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') walk(child, node);
      } else if (value && typeof value === 'object' && typeof value.type === 'string') walk(value, node);
    }
  };
  walk(program, undefined);
  return out;
}
const isT = (node: Node | undefined) =>
  node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 't';

/** Every message written at a `t()` call site in the interface. */
function interfaceMessages(): Found[] {
  return files(join(root, 'src')).flatMap((path) =>
    scan(path, (node, _parent, found) => {
      if (!isT(node)) return;
      const first = node.arguments[0] as Node | undefined;
      const text = literal(first);
      assert.ok(
        first && text !== undefined && !(first.type === 'TemplateLiteral' && first.expressions.length),
        `t() takes a literal pt-BR message with {placeholders}, not an expression (${relative(root, path)})`,
      );
      found(text!, first!);
    }),
  );
}
/** Messages the server sends to the interface: HTTP errors and production status lines. */
function serverMessages(): Found[] {
  return files(join(root, 'server')).flatMap((path) =>
    scan(path, (node, _parent, found) => {
      if (
        node.type === 'NewExpression' &&
        node.callee.type === 'Identifier' &&
        ['HttpError', 'ProviderResponseError'].includes(node.callee.name)
      ) {
        for (const arg of node.arguments as Node[]) {
          const text = literal(arg);
          if (text && /\s/.test(text)) found(text, arg);
        }
      }
      if (
        node.type === 'Property' &&
        node.key.type === 'Identifier' &&
        node.key.name === 'message' &&
        literal(node.value)
      ) {
        const text = literal(node.value)!;
        if (/\s/.test(text)) found(text, node.value);
      }
    }),
  );
}
const ignoredMethods = new Set([
  'querySelector',
  'querySelectorAll',
  'closest',
  'matches',
  'setAttribute',
  'getAttribute',
  'toggleAttribute',
  'startsWith',
  'endsWith',
  'includes',
  'replace',
  'split',
  'join',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
]);
const ignoredProperties = new Set([
  'className',
  'class',
  'role',
  'type',
  'name',
  'id',
  'href',
  'autocomplete',
  'inputMode',
  'pattern',
  'accept',
  'rel',
  'target',
]);
/** Sentences in the interface that skip `t()`: text with two words or an accented letter,
 * outside imports, selectors and attribute names. A deliberate literal says `i18n-ignore`. */
function untranslated(): Found[] {
  return files(join(root, 'src')).flatMap((path) =>
    scan(path, (node, parent, found, line) => {
      if (node.type !== 'Literal' && node.type !== 'TemplateLiteral') return;
      const text = literal(node);
      if (text === undefined || !/[A-Za-zÀ-ÿ]{2,}[ ][^\n]*[A-Za-zÀ-ÿ]{2,}|[À-ÿ]/.test(text)) return;
      if (!parent) return;
      if (
        [
          'ImportDeclaration',
          'ExportNamedDeclaration',
          'ExportAllDeclaration',
          'ImportExpression',
          'TSLiteralType',
        ].includes(parent.type)
      )
        return;
      if (isT(parent)) return;
      if (
        parent.type === 'CallExpression' &&
        parent.callee.type === 'MemberExpression' &&
        ignoredMethods.has(parent.callee.property.name)
      )
        return;
      if (
        parent.type === 'Property' &&
        parent.key.type === 'Identifier' &&
        ignoredProperties.has(parent.key.name) &&
        parent.value === node
      )
        return;
      if (line(node).includes('i18n-ignore')) return;
      found(text, node);
    }),
  );
}

for (const target of ['en', 'es'] as const) {
  test(`every interface message has a ${target} translation`, () => {
    const keys = new Set(Object.keys(catalogs[target]));
    const missing = interfaceMessages().filter((item) => !keys.has(item.text));
    assert.deepEqual(
      missing.map((item) => `${item.where}  ${item.text}`),
      [],
    );
  });
  test(`every server message the interface shows has a ${target} translation`, () => {
    const shapes = new Set(Object.keys(catalogs[target]).map(shape));
    const missing = serverMessages().filter((item) => !shapes.has(shape(item.text)));
    assert.deepEqual(
      missing.map((item) => `${item.where}  ${item.text}`),
      [],
    );
  });
  test(`${target} translations keep the placeholders of their source`, () => {
    const broken = Object.entries(catalogs[target]).filter(
      ([source, value]) =>
        JSON.stringify(source.match(/\{\w+\}/g)?.sort() ?? []) !==
          JSON.stringify(value.match(/\{\w+\}/g)?.sort() ?? []) || !value.trim(),
    );
    assert.deepEqual(broken, []);
  });
}
test('no sentence in the interface skips t()', () => {
  assert.deepEqual(
    untranslated().map((item) => `${item.where}  ${item.text}`),
    [],
  );
});
test('t() fills placeholders, and composed server messages translate through the templates', () => {
  const previous = locale();
  try {
    setLocale('pt-BR');
    assert.equal(t('Short na fila: {title}', { title: 'Agentes' }), 'Short na fila: Agentes');
    setLocale('en');
    assert.equal(t('Idioma'), 'Language');
    assert.equal(
      translateMessage('Mensagem que não está no catálogo.'),
      'Mensagem que não está no catálogo.',
    );
    const template = Object.keys(catalogs.en).find((key) => /\{\w+\}/.test(key));
    if (template) {
      const composed = template.replace(/\{\w+\}/g, 'X1');
      assert.equal(translateMessage(composed), catalogs.en[template]!.replace(/\{\w+\}/g, 'X1'));
    }
  } finally {
    setLocale(previous);
  }
  assert.equal(detectLocale(['es-AR', 'en']), previous === 'pt-BR' ? 'es' : previous);
});
