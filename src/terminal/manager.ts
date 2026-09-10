import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { IDecoration, IMarker, Terminal } from "@xterm/xterm";

import type { CopyModeState } from "./copyMode";

/** One OSC 133 mark registered in the terminal buffer. */
export interface PaneMark {
  kind: "prompt" | "output";
  marker: IMarker;
}

export interface TerminalEntry {
  paneId: string;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon | null;
  ptyId: number | null;
  /** true while the terminal's element lives in the visible layout */
  attached: boolean;
  /** fit + propagate new size to the PTY */
  doFit: () => void;
  /** OSC 133 marks, oldest first; markers hold buffer lines, so capped. */
  marks: PaneMark[];
  /** the prompt marker of the currently-running command, if any */
  runningPrompt: IMarker | null;
  /** wall-clock ms when the running command started (C mark) */
  runningSince: number | null;
  /** live Copy Mode state, null when the pane is not in Copy Mode */
  copyMode: CopyModeState | null;
  /** highlight decorations for Copy Mode (cursor line / selection) */
  copyModeDecos: { deco: IDecoration; marker: IMarker }[];
}

/** Cap for tracked marks — markers pin trimmed scrollback lines. */
const MAX_MARKS = 1000;

/**
 * Owns every xterm.js instance for the window, keyed by pane id.
 *
 * Terminals are opened into an offscreen "pool" element and re-parented into
 * the visible layout when their pane is shown. Moving the DOM node keeps the
 * buffer, scrollback and rendered canvas alive across tab switches, while the
 * PTY session runs in the backend regardless of visibility.
 */
class TerminalManager {
  private entries = new Map<string, TerminalEntry>();
  private pool: HTMLElement | null = null;

  private ensurePool(): HTMLElement {
    if (!this.pool) {
      const pool = document.createElement("div");
      pool.className = "terminal-pool";
      pool.style.cssText =
        "position:absolute;left:-10000px;top:0;width:2400px;height:1600px;overflow:hidden;opacity:0;pointer-events:none;";
      document.body.appendChild(pool);
      this.pool = pool;
    }
    return this.pool;
  }

  create(paneId: string, term: Terminal, fit: FitAddon): TerminalEntry {
    const existing = this.entries.get(paneId);
    if (existing) return existing;
    term.open(this.ensurePool());
    const entry: TerminalEntry = {
      paneId,
      term,
      fit,
      search: null,
      ptyId: null,
      attached: false,
      doFit: () => {},
      marks: [],
      runningPrompt: null,
      runningSince: null,
      copyMode: null,
      copyModeDecos: [],
    };
    this.entries.set(paneId, entry);
    return entry;
  }

  get(paneId: string): TerminalEntry | undefined {
    return this.entries.get(paneId);
  }

  findByPty(ptyId: number): TerminalEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.ptyId === ptyId) return entry;
    }
    return undefined;
  }

  /** Move the terminal's DOM element into the visible container. */
  attach(paneId: string, container: HTMLElement): void {
    const entry = this.entries.get(paneId);
    if (!entry?.term.element) return;
    container.appendChild(entry.term.element);
    entry.attached = true;
    entry.doFit();
  }

  /** Park the terminal back in the offscreen pool. */
  detach(paneId: string): void {
    const entry = this.entries.get(paneId);
    if (!entry?.term.element) return;
    this.ensurePool().appendChild(entry.term.element);
    entry.attached = false;
  }

  isAttached(paneId: string): boolean {
    return this.entries.get(paneId)?.attached ?? false;
  }

  dispose(paneId: string): void {
    const entry = this.entries.get(paneId);
    if (!entry) return;
    this.entries.delete(paneId);
    for (const mark of entry.marks) {
      try {
        mark.marker.dispose();
      } catch {
        // already disposed
      }
    }
    try {
      entry.term.dispose();
    } catch {
      // already disposed
    }
  }

  /** Track an OSC 133 mark; trims the oldest when over the cap. */
  addMark(paneId: string, kind: PaneMark["kind"], marker: IMarker): void {
    const entry = this.entries.get(paneId);
    if (!entry) return;
    entry.marks.push({ kind, marker });
    if (entry.marks.length > MAX_MARKS) {
      const dropped = entry.marks.splice(0, entry.marks.length - MAX_MARKS);
      for (const mark of dropped) {
        try {
          mark.marker.dispose();
        } catch {
          // already disposed
        }
      }
    }
  }

  promptLines(paneId: string): number[] {
    const entry = this.entries.get(paneId);
    if (!entry) return [];
    return entry.marks.filter((m) => m.kind === "prompt").map((m) => m.marker.line);
  }
}

export const terminalManager = new TerminalManager();

/** PTY output may arrive as a raw ArrayBuffer, typed array or plain string. */
export function normalizeChunk(raw: unknown): Uint8Array | string {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (raw instanceof Uint8Array) return raw;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return new Uint8Array(raw as number[]);
  return new Uint8Array(0);
}
