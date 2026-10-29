import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost:4318' });
for (const name of [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLFormElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'HTMLDialogElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'CustomEvent',
  'MutationObserver',
] as const) {
  Object.assign(globalThis, {
    [name]: name === 'window' ? browser : name === 'document' ? browser.document : browser[name],
  });
}
const { button, field, input, select } = await import('../src/dom.ts');
const { createDialog, formWithSave, mediaThumbnail } = await import('../src/components.ts');
const { protectEdits } = await import('../src/edit-protection.ts');
const { editorTabs } = await import('../src/ui-tabs.ts');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

afterEach(() => {
  browser.document.body.replaceChildren();
});

test('fields keep native label association and separate help from the accessible name', () => {
  const control = input('title');
  control.required = true;
  const group = field('Título do vídeo', control, 'Descreva a promessa com precisão.');
  document.body.append(group);
  assert.equal(group.tagName, 'DIV');
  assert.equal(group.getAttribute('role'), 'group');
  const label = group.querySelector('label')!;
  assert.ok(label);
  assert.equal(label.htmlFor, control.id);
  assert.equal(control.labels?.[0], label);
  assert.equal(label.textContent, 'Título do vídeo');
  assert.equal(
    document.getElementById(control.getAttribute('aria-describedby')!)?.textContent,
    'Descreva a promessa com precisão.',
  );
  assert.equal(control.checkValidity(), false);
  control.value = 'Uma explicação original';
  assert.equal(control.checkValidity(), true);
});

test('button variants expose the Basecoat contract while keeping native button behavior', () => {
  let clicks = 0;
  const action = button(
    'Cancelar',
    () => {
      clicks++;
    },
    'secondary',
  );
  assert.equal(action.type, 'button');
  assert.equal(action.getAttribute('data-variant'), 'outline');
  assert.equal(button('Salvar', () => {}, 'primary').getAttribute('data-variant'), 'primary');
  action.click();
  assert.equal(clicks, 1);
  action.disabled = true;
  action.click();
  assert.equal(clicks, 1);
});

test('compact button labels retain their entire accessible text and expose the uncut label', () => {
  const label = 'TítuloSemEspaços'.repeat(30);
  const action = button(label, () => {}, 'secondary', 'edit');
  assert.equal(action.textContent, label);
  assert.equal(action.querySelector<HTMLElement>('.button-label')?.title, label);
  assert.equal(action.querySelector<HTMLElement>('.button-label')?.textContent, label);
  assert.equal(button('', () => {}, 'ghost', 'close').querySelector('.button-label'), null);
});

test('a compact select exposes its full selected label after selection and focus', async () => {
  const first = 'Primeiro canal muito longo '.repeat(15),
    second = 'SegundoCanalSemEspaços'.repeat(15);
  const picker = select(
    'channel',
    [
      ['one', first],
      ['two', second],
    ],
    'one',
  );
  document.body.append(picker);
  assert.equal(picker.title, first);
  picker.value = 'two';
  picker.dispatchEvent(new Event('change'));
  await tick();
  assert.equal(picker.title, second);
  picker.value = 'one';
  picker.dispatchEvent(new Event('focus'));
  assert.equal(picker.title, first);
});

test('native selects and checkboxes retain form values without a component runtime', () => {
  const form = document.createElement('form');
  const channel = select(
    'channel',
    [
      ['first', 'Primeiro'],
      ['second', 'Segundo'],
    ],
    'second',
  );
  const check = input('crossChecked', '', 'checkbox');
  check.checked = true;
  form.append(field('Canal selecionado', channel), field('Conferência de fontes', check));
  document.body.append(form);
  assert.equal(form.elements.namedItem('channel'), channel);
  assert.equal(channel.value, 'second');
  assert.equal(form.elements.namedItem('crossChecked'), check);
  assert.equal(check.checked, true);
});

test('dialog has one Basecoat surface with a named header, described context and body', () => {
  const { dialog, body } = createDialog('Criar pauta', 'Canal de teste.');
  assert.equal(dialog.children.length, 1);
  const surface = dialog.firstElementChild!;
  assert.equal(surface.querySelector('section'), body);
  assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent, 'Criar pauta');
  assert.equal(
    document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent,
    'Canal de teste.',
  );
  assert.equal(dialog.open, true);
  dialog.close();
});

test('closing a migrated dialog protects edited values; cancelling the warning keeps work', async () => {
  const { dialog, body } = createDialog('Editar roteiro', 'Canal de teste.');
  const title = input('title', 'Original');
  const { form, fields } = formWithSave('Salvar roteiro', async () => {});
  fields.append(field('Título', title));
  body.append(form);
  await tick();
  title.value = 'Alterado';
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  const warning = [...document.querySelectorAll('dialog')].find((item) => item !== dialog)!;
  assert.ok(warning?.open);
  assert.equal(dialog.open, true);
  const resume = [...warning.querySelectorAll('button')].find(
    (item) => item.textContent === 'Continuar editando',
  )!;
  resume.click();
  assert.equal(title.value, 'Alterado');
  assert.equal(dialog.open, true);
  let navigated = false;
  protectEdits(() => {
    navigated = true;
  });
  assert.equal(navigated, false);
});

test('saving a migrated form prevents a duplicate submit and releases edit protection', async () => {
  let finish: (() => void) | undefined;
  let saves = 0;
  const { form, fields } = formWithSave('Salvar roteiro', async () => {
    saves++;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const title = input('title', 'Original');
  fields.append(field('Título', title));
  document.body.append(form);
  await tick();
  title.value = 'Alterado';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(saves, 1);
  assert.equal(form.getAttribute('aria-busy'), 'true');
  assert.equal(fields.inert, true);
  assert.equal(form.querySelector<HTMLElement>('.button-label')?.title, 'Salvando…');
  finish!();
  await tick();
  assert.equal(form.hasAttribute('aria-busy'), false);
  assert.equal(form.querySelector<HTMLElement>('.button-label')?.title, 'Salvar roteiro');
  let navigated = false;
  protectEdits(() => {
    navigated = true;
  });
  assert.equal(navigated, true);
});

test('saving reveals the first invalid tab and progresses through required fields in order', async () => {
  let saves = 0;
  const { form, fields } = formWithSave('Salvar', async () => {
    saves++;
  });
  const first = input('first'),
    second = input('second');
  first.required = true;
  second.required = true;
  const tabs = editorTabs('Documento', [
    { key: 'brief', label: 'Briefing', content: document.createElement('p') },
    { key: 'scenes', label: 'Cenas', content: field('Primeiro campo', first) },
    { key: 'review', label: 'Revisão', content: field('Segundo campo', second) },
  ]);
  fields.append(tabs.node);
  document.body.append(form);
  await tick();
  const submit = () => form.dispatchEvent(new Event('submit', { cancelable: true }));
  submit();
  assert.equal(saves, 0);
  assert.equal(tabs.node.querySelector('[aria-selected="true"]')?.textContent, 'Cenas');
  first.value = 'Preenchido';
  submit();
  assert.equal(saves, 0);
  assert.equal(tabs.node.querySelector('[aria-selected="true"]')?.textContent, 'Revisão');
  second.value = 'Preenchido';
  submit();
  await tick();
  assert.equal(saves, 1);
});

test('previews show a frame of their own video because they have no thumbnail file', () => {
  const preview = mediaThumbnail({ id: 'job-1', channelId: 'tech', videoAvailable: true, previewOnly: true });
  assert.equal(preview.querySelector('img'), null);
  assert.equal(
    preview.querySelector('video')?.getAttribute('src'),
    '/api/channels/tech/jobs/job-1/files/video#t=1',
  );
  const packaged = mediaThumbnail({ id: 'job-2', channelId: 'tech', videoAvailable: true });
  assert.equal(
    packaged.querySelector('img')?.getAttribute('src'),
    '/api/channels/tech/jobs/job-2/files/thumbnail',
  );
  assert.equal(
    mediaThumbnail({ id: 'job-3', channelId: 'tech', videoAvailable: false }).querySelector('img, video'),
    null,
  );
});
