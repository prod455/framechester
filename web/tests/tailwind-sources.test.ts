import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..', 'src');
const files = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });

// Tailwind finds classes by reading the source as text. `max-sm:flex-col${x}` reads as one
// unknown token, so the class is never generated: the video card stopped stacking on phones
// that way. Every class in a className template is a whole word, a space before each `${`.
test('no class in a className template is glued to an expression', () => {
  const glued: string[] = [];
  for (const path of files(root)) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/className:\s*`([^`]*)`/g))
      if (/[^\s`]\$\{/.test(match[1]))
        glued.push(`${relative(root, path)}:${source.slice(0, match.index).split('\n').length}  ${match[1]}`);
  }
  assert.deepEqual(glued, []);
});
