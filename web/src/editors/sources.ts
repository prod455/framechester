import { iconButton } from '../components.ts';
import { button, el, field, icon, input } from '../dom.ts';
import { t } from '../../shared/i18n.ts';
import type { Source } from '../../shared/types.ts';

export function sourceEditor(initial: Source[]): {
  node: HTMLElement;
  read: () => Source[];
  write: (values: Source[]) => void;
} {
  const container = el('div');
  const rows: Array<{ node: HTMLElement; read: () => Source }> = [];
  function add(source?: Source): void {
    const title = input('source-title', source?.title || '');
    title.required = true;
    const url = input('source-url', source?.url || '', 'url');
    url.required = true;
    const publisher = input('source-publisher', source?.publisher || '');
    publisher.required = true;
    const retrievedAt = input('source-retrievedAt', source?.retrievedAt?.slice(0, 10) || '', 'date');
    retrievedAt.required = true;
    const license = input('source-license', source?.license || '');
    license.required = true;
    const node = el(
      'div',
      { className: 'source-card' },
      el(
        'div',
        { className: 'source-card-head' },
        icon('folder'),
        t('Fonte documental'),
        el('span', { className: 'spacer' }),
        iconButton(t('Remover esta fonte'), 'trash', () => node.remove()),
      ),
      el(
        'div',
        { className: 'form-grid' },
        field(t('Título da fonte'), title),
        field('URL', url),
        field(t('Publicador'), publisher),
        field(t('Consultada em'), retrievedAt),
        el(
          'div',
          { className: 'full' },
          field(
            t('Condição de uso / referência'),
            license,
            t('Consultar um documento não autoriza reproduzir sua mídia. Registre a condição real de uso.'),
          ),
        ),
      ),
    );
    rows.push({
      node,
      read: () => ({
        title: title.value.trim(),
        url: url.value.trim(),
        publisher: publisher.value.trim(),
        retrievedAt: retrievedAt.value,
        license: license.value.trim(),
      }),
    });
    container.append(node);
  }
  initial.forEach(add);
  return {
    node: el(
      'div',
      {},
      el(
        'div',
        { className: 'editor-section-heading' },
        el('h3', {}, t('Fontes e referências')),
        button(t('Adicionar fonte'), () => add(), 'ghost', 'plus'),
      ),
      container,
    ),
    read: () => rows.filter((row) => row.node.parentElement === container).map((row) => row.read()),
    write: (values) => {
      container.replaceChildren();
      rows.splice(0);
      values.forEach(add);
    },
  };
}
