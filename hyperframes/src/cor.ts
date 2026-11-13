// WCAG 2 contrast for the colours the template puts text in.

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function hex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('');
}

export function luminance(color: string): number {
  const [r, g, b] = rgb(color).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(x: string, y: string): number {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (a + 0.05) / (b + 0.05);
}

/** Lightest panel text sits on; text readable here is readable on the ground too. */
export const PANEL = '#232836';
export const AA = 4.5;

/**
 * The team colour as text on the dark panel: itself when it already reads at AA,
 * otherwise mixed toward white in 5% steps until it does. Fills keep the kit colour.
 */
export function readableOnDark(color: string, background = PANEL): string {
  const base = rgb(color);
  for (let k = 0; k <= 20; k += 1) {
    const t = k / 20;
    const mixed = hex(base.map((v) => v + (255 - v) * t) as [number, number, number]);
    if (contrast(mixed, background) >= AA) return mixed;
  }
  return '#FFFFFF';
}
