import { button, dialogFrame, el, field, icon, replace, select, setButtonLabel } from './dom.ts';
import { videoStyle, videoStyles } from '../shared/video-styles.ts';
import type { IconName } from './dom.ts';
import type { WebJob } from '../shared/types.ts';
import { protectEdits, watchForm } from './edit-protection.ts';
import { revealControl } from './ui-tabs.ts';

export function mediaThumbnail(job: Pick<WebJob, 'id' | 'channelId' | 'videoAvailable'>): HTMLElement {
  const frame = el('div', { className: 'media-thumbnail', 'aria-hidden': 'true' });
  if (job.videoAvailable) {
    const image = el('img', {
      src: `/api/channels/${encodeURIComponent(job.channelId)}/jobs/${encodeURIComponent(job.id)}/files/thumbnail`,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
      width: 128,
      height: 72,
    });
    image.addEventListener('error', () => replace(frame, icon('film')), { once: true });
    frame.append(image);
  } else frame.append(icon('film'));
  return frame;
}

export const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  reviewed: 'Revisado',
  archived: 'Arquivado',
  connected: 'Conectado',
  disconnected: 'Não conectado',
  expired: 'Conexão expirada',
  error: 'Requer atenção',
  queued: 'Na fila',
  running: 'Em produção',
  needs_review: 'Revisão pendente',
  completed: 'Concluído',
  failed: 'Falhou',
  blocked: 'Bloqueado',
  pass: 'Aprovado',
  fail: 'Reprovado',
  needs_human: 'Revisão humana',
  skipped: 'Não executado',
  cited: 'Fonte citada',
  unverified: 'A conferir',
  contradicted: 'Contradição identificada',
};
export function badge(status: string): HTMLElement {
  const color = ['connected', 'completed', 'pass', 'reviewed'].includes(status)
    ? 'green'
    : ['failed', 'fail', 'error', 'contradicted'].includes(status)
      ? 'red'
      : ['needs_review', 'needs_human', 'blocked', 'expired'].includes(status)
        ? 'amber'
        : status === 'running'
          ? 'violet'
          : '';
  return el(
    'span',
    { className: `badge status ${color ? `badge-${color}` : ''}`, 'data-variant': 'outline' },
    statusLabels[status] || status,
  );
}
export function notice(message: string): HTMLElement {
  return el('div', { className: 'alert notice' }, icon('shield'), el('section', {}, el('p', {}, message)));
}
export function empty(title: string, description: string, name: IconName, action?: HTMLElement): HTMLElement {
  return el(
    'div',
    { className: 'empty-state' },
    el('div', { className: 'empty-state-icon' }, icon(name)),
    el('h3', {}, title),
    el('p', {}, description),
    action,
  );
}
export function panel(
  title: string,
  description?: string,
  body?: HTMLElement,
  action?: HTMLElement,
): HTMLElement {
  return el(
    'section',
    { className: 'panel' },
    el(
      'div',
      { className: 'panel-header' },
      el('div', {}, el('h2', {}, title), description ? el('p', {}, description) : null),
      action,
    ),
    body,
  );
}
export function heading(title: string, description: string, ...actions: HTMLElement[]): HTMLElement {
  return el(
    'div',
    { className: 'page-heading' },
    el('div', {}, el('h1', {}, title), el('p', { title: description }, description)),
    el('div', { className: 'page-actions' }, ...actions),
  );
}
export function editorWorkspace(
  form: HTMLFormElement,
  actions: HTMLElement,
  assistant: HTMLElement,
  label: string,
): HTMLElement {
  form.id ||= `editor-${crypto.randomUUID()}`;
  form.classList.add('editor-form');
  for (const control of actions.querySelectorAll<HTMLButtonElement>('button[type="submit"]'))
    control.setAttribute('form', form.id);
  const toolbar = el(
    'div',
    { className: 'editor-actionbar' },
    assistant,
    el('span', { className: 'spacer' }),
    actions,
  );
  return el('section', { className: 'editor-workspace', 'aria-label': label }, toolbar, form);
}
export function iconButton(label: string, name: IconName, action: () => void): HTMLButtonElement {
  const node = button('', action, 'ghost', name);
  node.classList.add('icon-button');
  node.dataset.size = 'icon';
  node.setAttribute('aria-label', label);
  node.title = label;
  return node;
}
export function createDialog(
  title: string,
  description = '',
): { dialog: HTMLDialogElement; body: HTMLElement } {
  const opener = document.activeElement;
  const { dialog, body } = dialogFrame(title, description, () => protectEdits(() => dialog.close(), dialog));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    protectEdits(() => dialog.close(), dialog);
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body };
}
// A preparatory action may return false to preserve unsaved-change protection.
export function formWithSave(
  label: string | (() => string),
  onSave: () => Promise<void | false>,
  onCancel?: () => void,
  busyLabel: string | (() => string) = 'Salvando…',
): { form: HTMLFormElement; fields: HTMLDivElement; actions: HTMLDivElement } {
  const fields = el('div', { className: 'form-stack' });
  const errorBox = el('div', { className: 'alert form-error', role: 'alert', hidden: true });
  const resolveLabel = (value: string | (() => string)) => (typeof value === 'function' ? value() : value);
  const saveButton = button(resolveLabel(label), () => {}, 'primary', 'check');
  saveButton.type = 'submit';
  saveButton.dataset.testid = 'save-button';
  const actions = el(
    'div',
    { className: 'form-actions' },
    onCancel ? button('Cancelar', () => protectEdits(onCancel, form), 'secondary') : null,
    saveButton,
  );
  const form = el('form', { className: 'form-stack' }, fields, errorBox, actions);
  form.noValidate = true;
  const edit = watchForm(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saveButton.disabled) return;
    const invalid = [...form.elements].find(
      (control) =>
        (control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement) &&
        !control.validity.valid,
    );
    if (invalid instanceof HTMLElement) revealControl(invalid);
    if (!form.reportValidity()) return;
    saveButton.disabled = true;
    setButtonLabel(saveButton, resolveLabel(busyLabel));
    form.setAttribute('aria-busy', 'true');
    fields.inert = true;
    actions.inert = true;
    errorBox.hidden = true;
    edit.saving(true);
    try {
      if ((await onSave()) !== false) edit.saved();
    } catch (error) {
      errorBox.textContent =
        error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';
      errorBox.hidden = false;
      errorBox.scrollIntoView({ block: 'nearest' });
    } finally {
      edit.saving(false);
      fields.inert = false;
      actions.inert = false;
      saveButton.disabled = false;
      setButtonLabel(saveButton, resolveLabel(label), 'check');
      form.removeAttribute('aria-busy');
    }
  });
  return { form, fields, actions };
}

const styleIntro = 'Define estrutura, ritmo e layouts visuais. Sem formato, a IA segue apenas o pedido.';
/** Video style picker with a hint that summarizes the selected style. */
export function videoStyleField(name: string): { control: HTMLSelectElement; node: HTMLDivElement } {
  const control = select(name, [
    ['', 'Sem formato definido'],
    ...videoStyles.map((style): [string, string] => [style.id, style.name]),
  ]);
  const node = field('Formato do vídeo', control, styleIntro);
  const hint = node.querySelector<HTMLElement>('.field-hint')!;
  control.addEventListener('change', () => {
    hint.textContent = videoStyle(control.value)?.summary ?? styleIntro;
  });
  return { control, node };
}
