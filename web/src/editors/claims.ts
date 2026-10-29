import { iconButton } from '../components.ts';
import { button, el, field, select, textarea } from '../dom.ts';
import type { Claim } from '../../shared/types.ts';

export function claimsEditor(initial: Claim[]): {
  node: HTMLElement;
  read: () => Claim[];
  write: (values: Claim[]) => void;
} {
  const container = el('div');
  const rows: Array<{ node: HTMLElement; read: () => Claim }> = [];
  function add(claim?: Claim): void {
    const text = textarea('claim-text', claim?.text || '', 2);
    text.required = true;
    const status = select(
      'claim-status',
      [
        ['unverified', 'A conferir'],
        ['cited', 'Fonte citada'],
        ['contradicted', 'Contradição identificada — bloqueia a versão final'],
      ],
      claim?.status || 'unverified',
    );
    const urls = textarea('claim-sourceUrls', claim?.sourceUrls.join('\n') || '', 2);
    const node = el(
      'div',
      { className: 'claim-card' },
      el(
        'div',
        { className: 'source-card-head' },
        'Alegação verificável',
        el('span', { className: 'spacer' }),
        iconButton('Remover esta alegação', 'trash', () => node.remove()),
      ),
      el(
        'div',
        { className: 'form-stack' },
        field('O que está sendo afirmado?', text),
        el(
          'div',
          { className: 'form-grid' },
          field('Estado da evidência', status),
          field(
            'URLs que sustentam a alegação',
            urls,
            'Uma por linha. Use URLs presentes nas fontes do roteiro.',
          ),
        ),
      ),
    );
    rows.push({
      node,
      read: () => ({
        text: text.value.trim(),
        status: status.value as Claim['status'],
        sourceUrls: urls.value
          .split('\n')
          .map((url) => url.trim())
          .filter(Boolean),
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
        el('h3', {}, 'Alegações & evidências'),
        button('Adicionar alegação', () => add(), 'ghost', 'plus'),
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
