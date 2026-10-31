import { t } from '../shared/i18n.ts';

type Child = Node | string | number | null | undefined | false;
type Attributes = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (name === 'className') node.className = String(value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  append(node, ...children);
  return node;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function replace(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, ...children);
}

export function button(
  label: string,
  onClick: () => void,
  variant: ButtonVariant = 'primary',
  iconName?: IconName,
): HTMLButtonElement {
  const node = el('button', {
    type: 'button',
    className: 'btn button',
    'data-variant': buttonVariants[variant],
  });
  setButtonLabel(node, label, iconName);
  node.addEventListener('click', onClick);
  return node;
}

/** Keep the full accessible label in the DOM; only its compact visual span truncates. */
export function setButtonLabel(node: HTMLButtonElement, label: string, iconName?: IconName): void {
  replace(
    node,
    iconName ? icon(iconName) : null,
    label ? el('span', { className: 'button-label', title: label }, label) : null,
  );
}

const buttonVariants = {
  primary: 'primary',
  secondary: 'outline',
  light: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
} as const;
export type ButtonVariant = keyof typeof buttonVariants;

/** Basecoat's native dialog surface; lifecycle and edit protection stay with the caller. */
export function dialogFrame(
  title: string,
  description: string,
  onClose?: () => void,
): { dialog: HTMLDialogElement; body: HTMLElement } {
  const titleId = `dialog-${crypto.randomUUID()}`;
  const descriptionId = `${titleId}-description`;
  const body = el('section', { className: 'dialog-body' });
  const surface = el(
    'div',
    { className: 'dialog-surface' },
    el(
      'header',
      { className: 'dialog-header' },
      el('h2', { id: titleId, title }, title),
      description ? el('p', { id: descriptionId }, description) : null,
    ),
    body,
  );
  const dialog = el(
    'dialog',
    {
      className: 'dialog',
      'aria-labelledby': titleId,
      'aria-describedby': description ? descriptionId : undefined,
    },
    surface,
  );
  if (onClose) {
    const close = button('', onClose, 'ghost', 'close');
    close.classList.add('dialog-close');
    close.dataset.size = 'icon';
    close.setAttribute('aria-label', t('Fechar janela'));
    surface.append(close);
  }
  return { dialog, body };
}

export function externalLink(label: string, destination: string): HTMLElement {
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return el('span', {}, label);
    const rel = 'noopener noreferrer'; // i18n-ignore: link attribute, not text
    return el('a', { href: url.href, target: '_blank', rel }, label, icon('external'));
  } catch {
    return el('span', {}, label);
  }
}

export function field(
  label: string,
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  hint?: string,
): HTMLDivElement {
  const id = control.id || `field-${crypto.randomUUID()}`;
  control.id = id;
  control.setAttribute('aria-labelledby', `${id}-label`);
  if (hint) control.setAttribute('aria-describedby', `${id}-hint`);
  return el(
    'div',
    { className: 'field', role: 'group' },
    el('label', { className: 'label field-label', for: id, id: `${id}-label` }, label),
    control,
    hint ? el('p', { className: 'field-hint', id: `${id}-hint` }, hint) : null,
  );
}

export function input(name: string, value = '', type = 'text'): HTMLInputElement {
  const node = el('input', { name, type, className: 'input' });
  node.value = value;
  return node;
}

export function textarea(name: string, value = '', rows = 4): HTMLTextAreaElement {
  const node = el('textarea', { name, rows, className: 'textarea' });
  node.value = value;
  return node;
}

export function select(name: string, options: Array<[string, string]>, value = ''): HTMLSelectElement {
  const node = el('select', { name, className: 'select' });
  for (const [key, label] of options) node.append(el('option', { value: key }, label));
  node.value = value;
  const describe = () => {
    node.title = node.options[node.selectedIndex]?.textContent || '';
  };
  describe();
  node.addEventListener('change', () => queueMicrotask(describe));
  node.addEventListener('focus', describe);
  node.addEventListener('mouseenter', describe);
  return node;
}

const paths = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  channels:
    'M8 3h12a1 1 0 0 1 1 1v12M4 7h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM8 12l5 3-5 3z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
  script: 'M8 3h9l4 4v14H8zM17 3v5h4M3 7v14h13M11 12h7M11 16h5',
  story: 'M4 5h5v5H4zM15 14h5v5h-5zM9 7h7a3 3 0 0 1 3 3v4M7 10v7a2 2 0 0 0 2 2h6',
  film: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4M10 9l4 3-4 3z',
  plug: 'M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v5',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l4 4L19 6',
  chevron: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  external: 'M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
  logout: 'M9 3H3v18h6M9 12h12M16 7l5 5-5 5',
  refresh: 'M20 7V3l-4 4M4 17v4l4-4M5 8a8 8 0 0 1 14-3M19 16a8 8 0 0 1-14 3',
  close: 'M6 6l12 12M6 18L18 6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  edit: 'M4 16l12-12 4 4L8 20H4zM13 7l4 4',
  chart: 'M4 3v18h17M8 17v-5M13 17V7M18 17v-8',
  clock: 'M12 7v5l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  circle: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM12 8v4M12 16h.01',
  folder: 'M3 6h7l2 3h9v12H3zM3 6V3h7l2 3h7v3',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  menu: 'M4 6h16M4 12h16M4 18h16',
} as const;

export type IconName = keyof typeof paths;

export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.65',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    class: className,
  })) {
    svg.setAttribute(key, value);
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
