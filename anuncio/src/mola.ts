// Mola amortecida usada nas entradas (quique, pop).

/** Mola amortecida integrada em passos fixos: o mesmo quadro dá sempre o mesmo valor. */
export function spring({
  frame,
  fps,
  config,
}: {
  frame: number;
  fps: number;
  config: { damping: number; stiffness: number; mass: number };
}): number {
  if (frame <= 0) return 0;
  const SUBPASSOS = 8;
  const dt = 1 / fps / SUBPASSOS;
  let x = 0,
    v = 0;
  for (let i = 0, n = Math.round(frame * SUBPASSOS); i < n; i++) {
    const a = (-config.stiffness * (x - 1) - config.damping * v) / config.mass;
    v += a * dt;
    x += v * dt;
  }
  return x;
}
