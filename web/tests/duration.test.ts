import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATION_RULES, checkDuration, fitByDroppingScenes } from '../shared/duration.ts';

const scene = (id: number, words: number) => ({
  id,
  narration: Array.from({ length: words }, (_, index) => `p${id}x${index}`).join(' '),
});

test('a script too long for a short loses whole middle scenes, keeping the hook and the ending', () => {
  // 300 words, the case reported: hook 40, four middle scenes of 50, ending 60.
  const scenes = [scene(0, 40), scene(1, 50), scene(2, 50), scene(3, 50), scene(4, 50), scene(5, 60)];
  const fitted = fitByDroppingScenes(scenes, DURATION_RULES.short)!;
  assert.deepEqual(
    fitted.dropped,
    [1, 2],
    'two scenes are the fewest that fit; the earliest ones go first on ties',
  );
  assert.deepEqual(
    fitted.scenes.map((item) => item.id),
    [0, 3, 4, 5],
  );
  const check = checkDuration('short', fitted.scenes);
  assert.ok(check.ok, JSON.stringify(check));
  assert.equal(check.words, 200);
});

test('nothing is dropped when the script already fits, is too short, or only hook and ending exist', () => {
  assert.equal(
    fitByDroppingScenes([scene(0, 50), scene(1, 100), scene(2, 50)], DURATION_RULES.short),
    undefined,
  );
  assert.equal(fitByDroppingScenes([scene(0, 150), scene(1, 150)], DURATION_RULES.short), undefined);
  // Hook and ending alone are still too long: only a rewrite helps.
  assert.equal(
    fitByDroppingScenes([scene(0, 150), scene(1, 100), scene(2, 150)], DURATION_RULES.short),
    undefined,
  );
});
