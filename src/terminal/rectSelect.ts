/**
 * Rectangle (column) selection: ⌥/Alt-drag selects a column block instead of
 * the normal line-wrapped flow. The DOM wiring lives in TerminalPane; these
 * helpers own the coordinate math and text extraction so they stay testable.
 */

export interface RectBuffer {
  getLine(
    line: number,
  ): { translateToString(trimRight?: boolean, startColumn?: number, endColumnBefore?: number): string }
    | undefined;
}

export interface Rect {
  /** buffer line indexes, inclusive */
  y1: number;
  y2: number;
  /** cell columns, inclusive */
  x1: number;
  x2: number;
}

/** Normalize drag corners so x1<=x2 and y1<=y2. */
export function normalizeRect(a: Rect): Rect {
  return {
    x1: Math.min(a.x1, a.x2),
    x2: Math.max(a.x1, a.x2),
    y1: Math.min(a.y1, a.y2),
    y2: Math.max(a.y1, a.y2),
  };
}

/**
 * Extract the text inside a rectangle. Wide characters (CJK, emoji) occupy
 * two cells; when a rect boundary lands mid-character the cell is included
 * (xterm's translateToString keeps whole characters, which is what we want).
 */
export function rectText(buffer: RectBuffer, rect: Rect): string {
  const r = normalizeRect(rect);
  const parts: string[] = [];
  for (let y = r.y1; y <= r.y2; y++) {
    const line = buffer.getLine(y);
    parts.push(line ? line.translateToString(true, r.x1, r.x2 + 1) : "");
  }
  return parts.join("\n").replace(/\n+$/, "");
}

/**
 * Convert a pixel position inside the terminal element to a cell
 * (col, absolute buffer line). Clamps to the grid so drags past the edge
 * stay usable.
 */
export function pixelToCell(
  offsetX: number,
  offsetY: number,
  metrics: { cellWidth: number; cellHeight: number; cols: number; rows: number; baseY: number },
): { x: number; y: number } {
  const { cellWidth, cellHeight, cols, rows, baseY } = metrics;
  const x = clamp(Math.floor(offsetX / Math.max(cellWidth, 1)), 0, cols - 1);
  const row = clamp(Math.floor(offsetY / Math.max(cellHeight, 1)), 0, rows - 1);
  return { x, y: baseY + row };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
