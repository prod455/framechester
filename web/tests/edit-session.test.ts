import test from 'node:test';
import assert from 'node:assert/strict';
import { EditSession } from '../shared/edit-session.ts';

test('leaving an edited form is blocked until the operator saves or explicitly discards', () => {
  const session = new EditSession();
  let title = 'Original';
  let destination = 'scripts';
  const form = session.track(() => title, () => true);
  title = 'Alterado sem salvar';
  assert.equal(session.leave(() => { destination = 'overview'; }), false);
  assert.equal(destination, 'scripts');
  form.saved();
  assert.equal(session.leave(() => { destination = 'overview'; }), true);
  assert.equal(destination, 'overview');
  title = 'Outro rascunho';
  assert.equal(session.discard(), true);
  assert.equal(session.leave(() => { destination = 'channels'; }), true);
  assert.equal(destination, 'channels');
});

test('returning to the original values is clean and detached forms do not block another channel', () => {
  const session = new EditSession();
  let text = 'Cena original'; let active = true;
  session.track(() => text, () => active);
  text = 'Nova cena'; assert.equal(session.dirty, true);
  text = 'Cena original'; assert.equal(session.dirty, false);
  text = 'Rascunho'; active = false;
  assert.equal(session.leave(() => {}), true);
});

test('closing one form does not discard changes from another and saving cannot be discarded', () => {
  const session = new EditSession();
  const first = {}; const second = {};
  let title = 'Título'; let research = 'Pesquisa';
  session.track(() => title, () => true, first);
  const other = session.track(() => research, () => true, second);
  title = 'Novo título'; research = 'Nova pesquisa';
  assert.equal(session.discard(second), true);
  assert.equal(session.hasChanges(second), false);
  assert.equal(session.hasChanges(first), true);
  other.saving(true);
  assert.equal(session.discard(), false);
  assert.equal(session.leave(() => assert.fail('navigation during save')), false);
  other.saving(false);
  assert.equal(session.discard(), true);
});
