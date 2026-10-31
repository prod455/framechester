import { openCreativeDraft } from '../creative-ui.ts';
import { button, el, field, select } from '../dom.ts';
import { protectEdits } from '../edit-protection.ts';
import { editChannel } from '../pages/channels.ts';
import { currentChannel } from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import { t } from '../../shared/i18n.ts';
import type { CreativeEditorContext, CreativeFields } from '../../shared/creative-types.ts';

export function creativeEditorButton(
  context: () => CreativeEditorContext,
  apply: (fields: CreativeFields) => void,
  getForm: () => HTMLFormElement,
): HTMLButtonElement {
  const trigger = button(
    t('Desenvolver com IA'),
    () => {
      const channel = currentChannel();
      if (!channel) {
        editChannel();
        return;
      }
      const form = getForm();
      if (form.getAttribute('aria-busy') === 'true') return;
      const workspace = form.closest('.editor-workspace')!;
      const actions = workspace.querySelector<HTMLElement>('.editor-actionbar')!;
      const host = el('section', { className: 'assistant-host' });
      const close = () => {
        host.remove();
        form.hidden = false;
        actions.hidden = false;
        if (trigger.isConnected) trigger.focus();
      };
      try {
        const snapshot = context();
        workspace.append(host);
        form.hidden = true;
        actions.hidden = true;
        openCreativeDraft(snapshot.task, channel.id, channel.name, {
          context: snapshot,
          onApply: apply,
          mount: { host, onClose: close },
        });
      } catch (error) {
        close();
        toast(error instanceof Error ? error.message : t('Não foi possível preparar o briefing.'), true);
      }
    },
    'secondary',
    'spark',
  );
  return trigger;
}

export function documentPicker(
  label: string,
  records: Array<{ id: string; title: string }>,
  selected: string,
  onSelect: (id: string) => void,
): HTMLElement {
  const options: Array<[string, string]> = records.map((record) => [record.id, record.title]);
  if (selected === '__new__') options.unshift(['__new__', t('Novo documento (não salvo)')]);
  const picker = select('editor-document', options, selected);
  picker.setAttribute('aria-label', label);
  picker.addEventListener('change', () => {
    const next = picker.value;
    picker.value = selected;
    protectEdits(() => onSelect(next));
  });
  return el('div', { className: 'editor-picker' }, field(label, picker));
}

export function statusControl(value = 'draft'): HTMLSelectElement {
  return select(
    'status',
    [
      ['draft', t('Rascunho')],
      ['reviewed', t('Revisado pelo operador')],
      ['archived', t('Arquivado')],
    ],
    value,
  );
}
