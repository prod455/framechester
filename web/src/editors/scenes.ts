import { sceneLayoutOrFallback } from '../../shared/scene-layouts.ts';
import { iconButton } from '../components.ts';
import { button, el, field, input, textarea } from '../dom.ts';
import { t, translateMessage } from '../../shared/i18n.ts';
import type { ScriptScene } from '../../shared/types.ts';

export function sceneEditor(initial: ScriptScene[]): {
  node: HTMLElement;
  read: () => ScriptScene[];
  write: (values: ScriptScene[]) => void;
} {
  const container = el('div');
  const rows: Array<{ node: HTMLElement; id: number; read: () => ScriptScene }> = [];
  function add(scene?: ScriptScene): void {
    const id = scene?.id ?? (rows.length ? Math.max(...rows.map((row) => row.id)) + 1 : 0);
    const title = input('scene-heading', scene?.heading || '');
    title.required = true;
    const narration = textarea('scene-narration', scene?.narration || '', 4);
    narration.required = true;
    narration.setAttribute('data-testid', `scene-${id}-narration`);
    const visual = textarea('scene-visual', scene?.visualBrief || '', 3);
    visual.required = true;
    // Advisory only: the engine renders any brief, a bad directive just means the default layout.
    const layoutHint = el('span', { className: 'field-hint' });
    const checkLayout = () => {
      const { layout, problem } = sceneLayoutOrFallback(id + 1, visual.value, narration.value);
      layoutHint.textContent = problem
        ? t('{problem} A cena usará o visual padrão.', { problem: translateMessage(problem) })
        : layout === 'destaque'
          ? t('Visual padrão: título da cena e trecho da narração.')
          : t('Layout: #{layout}.', { layout });
    };
    visual.addEventListener('input', checkLayout);
    narration.addEventListener('input', checkLayout);
    checkLayout();
    const duration = input('scene-duration', String(scene?.durationHintSecs ?? 20), 'number');
    duration.min = '0.1';
    duration.step = '0.1';
    duration.required = true;
    const count = el('span', { className: 'field-hint' });
    const updateCount = () => {
      count.textContent = t('{count} palavra(s) · duração final medida na narração', {
        count: narration.value.trim().split(/\s+/).filter(Boolean).length,
      });
    };
    narration.addEventListener('input', updateCount);
    updateCount();
    const node = el(
      'section',
      { className: 'scene-card' },
      el(
        'div',
        { className: 'scene-top' },
        el('span', { className: 'scene-number' }, String(id + 1).padStart(2, '0')),
        el('h3', {}, t('Cena {number}', { number: id + 1 })),
        el('span', { className: 'spacer' }),
        iconButton(t('Remover cena {number}', { number: id + 1 }), 'trash', () => node.remove()),
      ),
      el(
        'div',
        { className: 'form-stack' },
        el(
          'div',
          { className: 'form-grid' },
          field(t('Título da cena'), title),
          field(t('Duração estimada (segundos)'), duration),
        ),
        field(t('Narração autoral'), narration),
        count,
        el(
          'div',
          {},
          field(
            t('O que aparece na tela?'),
            visual,
            t(
              'Opcional na 1ª linha: #pergunta, #numero, #lista, #comparacao, #linha-do-tempo ou #citacao (ver docs/GUIA_VISUAL.md). O resto é nota livre.',
            ),
          ),
          layoutHint,
        ),
      ),
    );
    rows.push({
      node,
      id,
      read: () => ({
        id,
        heading: title.value.trim(),
        narration: narration.value.trim(),
        visualBrief: visual.value.trim(),
        durationHintSecs: Number(duration.value),
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
        el('h3', {}, t('Roteiro cena a cena')),
        button(t('Adicionar cena'), () => add(), 'ghost', 'plus'),
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
