/**
 * Pure helpers behind the tab title: OSC cwd reporting (shell integration)
 * and the title fallback chain.
 *
 * Title priority for a pane: reported cwd last segment → OSC 0/2 title →
 * spawn cwd last segment → "Shell". Once a shell reports its cwd (OSC 7 /
 * OSC 9;9) that value wins over program-set window titles. The home
 * directory renders as "~" when known (set via setHomeDir at startup).
 */

export interface PaneTitleMeta {
  /** cwd the pane was spawned with (global setting), may be null. */
  spawnCwd: string | null;
  /** Last cwd reported by the shell via OSC 7 / OSC 9;9, may be null. */
  cwd: string | null;
  /** Last window title set by a program via OSC 0/2, may be null. */
  oscTitle: string | null;
}

let home: string | null = null;

/** Provide the user's home directory so titles can render it as "~". */
export function setHomeDir(path: string | null): void {
  home = path ? normalizePath(path) : null;
}

/** The registered home directory (null until known). */
export function getHomeDir(): string | null {
  return home;
}

function normalizePath(p: string): string {
  let n = p.trim().replace(/\\/g, "/");
  while (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
  return n;
}

/** Extract the last path segment ("D:\Work\demo" → "demo"); null for roots/empty. */
export function pathLastSegment(path: string | null | undefined): string | null {
  if (!path) return null;
  let p = path.trim();
  if (!p) return null;
  p = p.replace(/[\\/]+$/, "");
  if (!p) return null; // was "/" or empty
  if (/^[A-Za-z]:$/.test(p)) return null; // drive root like "C:"
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  const seg = idx >= 0 ? p.slice(idx + 1) : p;
  return seg || null;
}

/**
 * Title form of a path: the home directory itself renders as "~"; anything
 * else falls back to the last segment.
 */
export function titleFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (home && normalizePath(path) === home) return "~";
  return pathLastSegment(path);
}

/**
 * Parse an OSC 7 payload ("file://host/path" or a plain absolute path) into a
 * filesystem path. Accepts any host: local shells legitimately report their
 * own hostname (bash $HOSTNAME, zsh %m). Returns null for anything that does
 * not look like a path.
 */
export function parseOscCwd(data: string): string | null {
  const raw = data.trim();
  if (!raw) return null;
  if (raw.startsWith("file://")) {
    try {
      const url = new URL(raw);
      let p = decodeURIComponent(url.pathname);
      if (!p) return null;
      // Windows file URLs keep the drive in the path: "/C:/Users" → "C:/Users".
      if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
      return p;
    } catch {
      return null;
    }
  }
  // Plain absolute paths (POSIX or Windows drive form).
  if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) {
    return raw;
  }
  return null;
}

/** Title fallback chain for one pane (see module doc). */
export function computeTabTitle(meta: PaneTitleMeta | undefined): string {
  const cwdSeg = titleFromPath(meta?.cwd ?? null);
  if (cwdSeg) return cwdSeg;
  const osc = meta?.oscTitle?.trim();
  if (osc) return osc;
  const spawnSeg = titleFromPath(meta?.spawnCwd ?? null);
  if (spawnSeg) return spawnSeg;
  return "Shell";
}
