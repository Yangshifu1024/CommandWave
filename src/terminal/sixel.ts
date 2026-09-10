/**
 * Minimal Sixel decoder: DCS q … ST payloads → RGBA bitmap.
 * Pure function; the caller rasterizes to a canvas/image. Supports the
 * common subset: Raster attributes ("…), RGB color definitions
 * (#i;2;r;g;b with 0–100 components), '$' carriage return, '-' new band,
 * '!n' repeat and '?…~' pixel characters (6 vertical pixels each).
 */

export interface SixelImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major */
  rgba: Uint8ClampedArray;
}

export function decodeSixel(data: string): SixelImage | null {
  // rows[y][x] = palette id (undefined = transparent)
  const rows: number[][] = [];
  const palette = new Map<number, [number, number, number]>([
    [0, [255, 255, 255]],
    [1, [0, 0, 0]],
  ]);
  let current = 0;
  let bandBase = 0;
  let col = 0;
  let repeat = 1;
  let i = 0;

  const ensureRow = (y: number) => {
    while (rows.length <= y) rows.push([]);
  };

  while (i < data.length) {
    const ch = data[i];
    if (ch === "#") {
      let j = i + 1;
      let id = 0;
      while (j < data.length && data[j] >= "0" && data[j] <= "9") {
        id = id * 10 + (data.charCodeAt(j) - 48);
        j++;
      }
      current = id;
      if (data[j] === ";") {
        const parts: number[] = [];
        while (data[j] === ";") {
          j++;
          let n = 0;
          let has = false;
          while (j < data.length && data[j] >= "0" && data[j] <= "9") {
            n = n * 10 + (data.charCodeAt(j) - 48);
            j++;
            has = true;
          }
          parts.push(has ? n : 0);
        }
        if (parts[0] === 2 && parts.length >= 4) {
          palette.set(id, [
            Math.round((parts[1] / 100) * 255),
            Math.round((parts[2] / 100) * 255),
            Math.round((parts[3] / 100) * 255),
          ]);
        }
      }
      i = j;
      continue;
    }
    if (ch === "!") {
      let j = i + 1;
      let n = 0;
      while (j < data.length && data[j] >= "0" && data[j] <= "9") {
        n = n * 10 + (data.charCodeAt(j) - 48);
        j++;
      }
      repeat = Math.max(1, n);
      i = j;
      continue;
    }
    if (ch === "$") {
      col = 0;
      i++;
      continue;
    }
    if (ch === "-") {
      // New band: skip to the next 6-row boundary.
      bandBase = Math.ceil(rows.length / 6) * 6;
      col = 0;
      i++;
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < data.length && ";0123456789".includes(data[i])) i++;
      continue;
    }
    const code = data.charCodeAt(i);
    if (code >= 63 && code <= 126) {
      const bits = code - 63;
      for (let b = 0; b < 6; b++) {
        if (bits & (1 << b)) {
          ensureRow(bandBase + b);
          const row = rows[bandBase + b];
          for (let r = 0; r < repeat; r++) row[col + r] = current;
        }
      }
      col += repeat;
      repeat = 1;
      i++;
      continue;
    }
    i++;
  }

  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  if (width === 0 || rows.length === 0) return null;
  const rgba = new Uint8ClampedArray(width * rows.length * 4);
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const id = row[x];
      const o = (y * width + x) * 4;
      if (id === undefined) {
        rgba[o + 3] = 0; // transparent
        continue;
      }
      const [r, g, b] = palette.get(id) ?? [255, 255, 255];
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
  return { width, height: rows.length, rgba };
}
