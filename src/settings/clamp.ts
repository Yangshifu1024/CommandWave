/** Clamp helpers for numeric settings inputs. */
export function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampFloat(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
