import { el, icon } from '../dom.ts';

const toasts = el('div', { className: 'studio-toast-region', role: 'status', 'aria-live': 'polite' });
document.body.append(toasts);

export function toast(message: string, error = false): void {
  const item = el(
    'div',
    { className: `studio-toast ${error ? 'studio-toast-error' : ''}`, role: error ? 'alert' : 'status' },
    icon(error ? 'circle' : 'check'),
    message,
  );
  toasts.append(item);
  setTimeout(() => item.remove(), 6500);
}
