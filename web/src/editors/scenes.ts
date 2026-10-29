import { SceneLayoutError, parseSceneLayout } from '../../shared/scene-layouts.ts';
import { iconButton } from '../components.ts';
import { button, el, field, input, textarea } from '../dom.ts';
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
    // Same check as the server, shown before saving.
    const checkLayout = () => {
      try {
        parseSceneLayout(id + 1, visual.value, narration.value);
        visual.setCustomValidity('');
      } catch (error) {
        visual.setCustomValidity(
          error instanceof SceneLayoutError ? error.message : 'Diretiva visual inválida.',
        );
      }
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
      count.textContent = `${narration.value.trim().split(/\s+/).filter(Boolean).length} palavra(s) · duração final medida na narração`;
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
        el('h3', {}, `Cena ${id + 1}`),
        el('span', { className: 'spacer' }),
        iconButton(`Remover cena ${id + 1}`, 'trash', () => node.remove()),
      ),
      el(
        'div',
        { className: 'form-stack' },
        el(
          'div',
          { className: 'form-grid' },
          field('Título da cena', title),
          field('Duração estimada (segundos)', duration),
        ),
        field('Narração autoral', narration),
        count,
        field(
          'O que aparece na tela?',
          visual,
          'Opcional na 1ª linha: #pergunta, #numero, #lista, #comparacao, #linha-do-tempo ou #citacao (ver docs/GUIA_VISUAL.md). O resto é nota livre.',
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
        el('h3', {}, 'Roteiro cena a cena'),
        button('Adicionar cena', () => add(), 'ghost', 'plus'),
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
