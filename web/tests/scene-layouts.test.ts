import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseSceneLayout,
  sceneLayoutOrFallback,
  sceneLayouts,
  SceneLayoutError,
} from '../shared/scene-layouts.ts';
import { videoStyles, videoStyleGuide } from '../shared/video-styles.ts';
import { LocalStore } from '../server/store.ts';

test('the Studio validator accepts exactly what the Rust renderer accepts', async () => {
  const cases: { brief: string; narration: string; layout: string | null }[] = JSON.parse(
    await readFile(new URL('../../tests/fixtures/scene-layouts.json', import.meta.url), 'utf8'),
  );
  assert.ok(cases.length >= 10);
  for (const item of cases) {
    if (item.layout) assert.equal(parseSceneLayout(7, item.brief, item.narration), item.layout, item.brief);
    else assert.throws(() => parseSceneLayout(7, item.brief, item.narration), SceneLayoutError, item.brief);
  }
});

test('every style guide only recommends layouts from the closed catalog and keeps format rules', () => {
  for (const style of videoStyles) {
    const guide = videoStyleGuide(style, 'short');
    for (const layout of style.layouts) assert.ok(sceneLayouts.includes(layout));
    assert.match(guide, /primeira cena dura até 3 segundos/);
    assert.doesNotMatch(videoStyleGuide(style), /Short de 65/);
  }
});

test('a script with an invalid directive saves and loads; the directive is advisory', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-layout-store-'));
  try {
    const store = new LocalStore(home);
    const now = new Date().toISOString();
    await store.update((state) => {
      state.channels.push({
        id: 'tech',
        name: 'tech',
        description: '',
        niche: '',
        audience: '',
        language: 'pt-BR',
        createdAt: now,
        updatedAt: now,
      });
    });
    const script = (visualBrief: string) => ({
      channelId: 'tech',
      title: 'Roteiro',
      format: 'short',
      hook: 'Gancho',
      scenes: [{ id: 1, heading: 'Cena', narration: 'Sem número falado.', visualBrief, durationHintSecs: 5 }],
      sources: [],
      claims: [],
    });
    await store.saveResource('scripts', script('#numero 90% | dos casos'));
    assert.equal(
      sceneLayoutOrFallback(1, '#numero 90% | dos casos', 'Sem número falado.').layout,
      'destaque',
    );
    assert.match(sceneLayoutOrFallback(1, '#destaque sobra', '').problem ?? '', /não recebe campos/);
    assert.equal(sceneLayoutOrFallback(1, '#lista A; B', '').problem, undefined);
    const saved = await store.saveResource('scripts', script('#lista Coletar; Treinar'));
    // A brief that predates the catalog must not brick the state on load.
    await store.update((state) => {
      state.scripts[0]!.scenes[0]!.visualBrief = '#legado nota antiga';
    });
    assert.ok((await new LocalStore(home).read()).scripts.some((row) => row.id === saved.id));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
