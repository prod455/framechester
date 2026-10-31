import { EditSession } from '../shared/edit-session.ts';
import { button, dialogFrame, el } from './dom.ts';
import { t } from '../shared/i18n.ts';

const edits = new EditSession();
let prompt: HTMLDialogElement | undefined;

function formValue(form: HTMLFormElement): string {
  // Memory only. Passwords and file contents are never copied into a draft store.
  return JSON.stringify(
    [...form.elements].flatMap((control) => {
      if (control instanceof HTMLInputElement)
        return ['password', 'file', 'submit', 'button', 'hidden'].includes(control.type)
          ? []
          : [[control.name, control.type, control.value, control.checked]];
      if (control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
        return [[control.name, control.value]];
      return [];
    }),
  );
}

export function watchForm(form: HTMLFormElement): { saved: () => void; saving: (busy: boolean) => void } {
  // Callers append fields synchronously after creating the common form.
  let tracked: ReturnType<EditSession['track']> | undefined;
  queueMicrotask(() => {
    if (form.isConnected)
      tracked = edits.track(
        () => formValue(form),
        () => form.isConnected,
        form,
      );
  });
  return { saved: () => tracked?.saved(), saving: (busy) => tracked?.saving(busy) };
}

export function hasUnsavedEdits(): boolean {
  return edits.dirty;
}

export function protectEdits(action: () => void, container?: Element): void {
  const forms = container ? [...container.querySelectorAll('form')] : undefined;
  if (container instanceof HTMLFormElement) forms?.push(container);
  if (!forms && edits.leave(action)) return;
  const changed = forms ? forms.filter((form) => edits.hasChanges(form)) : undefined;
  if (changed?.length === 0) {
    action();
    return;
  }
  if (prompt?.isConnected) return;
  const busy = changed ? changed.some((form) => edits.isSaving(form)) : edits.isSaving();
  const opener = document.activeElement;
  const resume = () => {
    prompt?.close();
  };
  const actions = el(
    'div',
    { className: 'form-actions' },
    button(t('Continuar editando'), resume, 'secondary'),
  );
  const { dialog, body } = dialogFrame(
    busy ? t('Salvamento em andamento') : t('Há alterações não salvas'),
    '',
  );
  body.append(
    el(
      'p',
      {},
      busy
        ? t('Aguarde o salvamento terminar antes de sair desta tela.')
        : t(
            'Continue editando para salvar seu trabalho. Se descartar, as alterações desta tela serão perdidas.',
          ),
    ),
    actions,
  );
  if (!busy)
    actions.append(
      button(
        t('Descartar e continuar'),
        () => {
          const discarded = changed ? changed.every((form) => edits.discard(form)) : edits.discard();
          if (!discarded) return;
          dialog.close();
          action();
        },
        'primary',
        'arrow',
      ),
    );
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (prompt === dialog) prompt = undefined;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  });
  document.body.append(dialog);
  prompt = dialog;
  dialog.showModal();
}

window.addEventListener('beforeunload', (event) => {
  if (edits.dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
