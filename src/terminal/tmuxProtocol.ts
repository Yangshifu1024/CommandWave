/**
 * tmux control-mode protocol (pure layer): parses %notifications and
 * %begin/%end blocks from a `tmux -CC` stream, decodes the layout format,
 * and maps keyboard input to `send-keys` arguments. The controller
 * (tmuxController.ts) owns the session; everything here is unit-testable.
 */

export type TmuxNotification =
  | { kind: "output"; paneId: string; data: string }
  | { kind: "layout-change"; windowId: string; layout: string; activePaneId: string }
  | { kind: "window-add"; windowId: string }
  | { kind: "window-close"; windowId: string }
  | { kind: "window-renamed"; windowId: string; name: string }
  | { kind: "session-changed"; sessionId: string; name: string }
  | { kind: "pane-mode-changed"; paneId: string }
  | { kind: "exit"; reason: string | null }
  | { kind: "unknown"; line: string };

/** Parse one framed line of the control stream. */
export function parseNotification(line: string): TmuxNotification {
  if (!line.startsWith("%")) return { kind: "unknown", line };
  // Notifications may contain spaces in the payload; split off the keyword.
  const space = line.indexOf(" ");
  const head = space === -1 ? line : line.slice(0, space);
  const rest = space === -1 ? "" : line.slice(space + 1);
  switch (head) {
    case "%output": {
      // "%output %12 some text"
      const m = /^(%\d+)\s?(.*)$/.exec(rest);
      if (!m) return { kind: "unknown", line };
      return { kind: "output", paneId: m[1], data: m[2] };
    }
    case "%layout-change": {
      // "%layout-change @3 4f7d,80x24,0,0{...},1 [80,24] @3"
      const parts = rest.split(/\s+/);
      if (parts.length < 2) return { kind: "unknown", line };
      const layout = parts[1];
      const active = layoutActivePane(layout);
      return {
        kind: "layout-change",
        windowId: parts[0],
        layout,
        activePaneId: active,
      };
    }
    case "%window-add":
      return { kind: "window-add", windowId: rest.trim() };
    case "%window-close":
      return { kind: "window-close", windowId: rest.trim() };
    case "%window-renamed": {
      const parts = rest.split(/\s+/);
      return { kind: "window-renamed", windowId: parts[0] ?? "", name: parts.slice(1).join(" ") };
    }
    case "%session-changed": {
      const parts = rest.split(/\s+/);
      return { kind: "session-changed", sessionId: parts[0] ?? "", name: parts.slice(1).join(" ") };
    }
    case "%pane-mode-changed":
      return { kind: "pane-mode-changed", paneId: rest.trim() };
    case "%exit":
      return { kind: "exit", reason: rest.trim() || null };
    default:
      return { kind: "unknown", line };
  }
}

// ---------- layout parsing ----------

export interface TmuxCell {
  w: number;
  h: number;
  x: number;
  y: number;
  /** leaf panes only */
  paneId?: string;
  children?: TmuxCell[];
}

/**
 * Parse a tmux layout string like
 * `4f7d,100x30,0,0{100x15,0,0,0,100x14,0,16,1}`
 * (checksum, then a cell tree; the trailing id after a `}` group is the
 * active pane id, not a cell). Returns the tree plus the active pane.
 */
export function parseTmuxLayout(layout: string): { root: TmuxCell; activePaneId: string | null } {
  // Strip the checksum segment before the first comma.
  const firstComma = layout.indexOf(",");
  const body = firstComma === -1 ? layout : layout.slice(firstComma + 1);
  let pos = 0;

  const parseCell = (): TmuxCell | null => {
    const m = /^(\d+)x(\d+),(\d+),(\d+)/.exec(body.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    const cell: TmuxCell = {
      w: Number(m[1]),
      h: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
    };
    if (body[pos] === "{") {
      pos++; // consume {
      cell.children = [];
      for (;;) {
        const child = parseCell();
        if (!child) return null;
        cell.children.push(child);
        if (body[pos] === ",") {
          pos++;
          continue;
        }
        break;
      }
      if (body[pos] !== "}") return null;
      pos++; // consume }
    } else if (body[pos] === ",") {
      // leaf: ",<paneId>"
      pos++;
      const id = /^%\d+|\d+/.exec(body.slice(pos));
      if (!id) return null;
      pos += id[0].length;
      cell.paneId = id[0].startsWith("%") ? id[0] : `%${id[0]}`;
    }
    return cell;
  };

  const root = parseCell();
  if (!root) return { root: { w: 0, h: 0, x: 0, y: 0 }, activePaneId: null };
  // Trailing ",<activePaneId>" after the root cell (present with groups).
  const tail = /^,(%\d+|\d+)/.exec(body.slice(pos));
  const activePaneId = tail ? (tail[1].startsWith("%") ? tail[1] : `%${tail[1]}`) : root.paneId ?? null;
  return { root, activePaneId };
}

/** Active pane id encoded at the end of a layout string (helper). */
export function layoutActivePane(layout: string): string {
  return parseTmuxLayout(layout).activePaneId ?? "";
}

// ---------- input mapping ----------

/** Escape sequences → tmux key names for `send-keys`. */
const SPECIAL_KEYS: [RegExp, string][] = [
  [/\x1b\[A/, "Up"],
  [/\x1b\[B/, "Down"],
  [/\x1b\[C/, "Right"],
  [/\x1b\[D/, "Left"],
  [/\x1bOA/, "Up"],
  [/\x1bOB/, "Down"],
  [/\x1bOC/, "Right"],
  [/\x1bOD/, "Left"],
  [/\x1b\[H/, "Home"],
  [/\x1b\[F/, "End"],
  [/\x1b\[1~/, "Home"],
  [/\x1b\[4~/, "End"],
  [/\x1b\[5~/, "PageUp"],
  [/\x1b\[6~/, "PageDown"],
  [/\x1b\[3~/, "Delete"],
];

const CONTROL_KEYS: [string, string][] = [
  ["\r", "Enter"],
  ["\n", "Enter"],
  ["\x7f", "BSpace"],
  ["\x08", "BSpace"],
  ["\t", "Tab"],
  ["\x1b", "Escape"],
];

/**
 * Split terminal input into literal chunks and named tmux keys, ready for
 * `send-keys -t <pane> [-l chunk | name…]`.
 */
export function mapInputToKeys(data: string): { literal: string; keys: string[] }[] {
  const out: { literal: string; keys: string[] }[] = [];
  let literal = "";
  let i = 0;
  const flush = () => {
    if (literal) {
      out.push({ literal, keys: [] });
      literal = "";
    }
  };
  outer: while (i < data.length) {
    for (const [re, name] of SPECIAL_KEYS) {
      const m = re.exec(data.slice(i));
      if (m && m.index === 0) {
        flush();
        out.push({ literal: "", keys: [name] });
        i += m[0].length;
        continue outer;
      }
    }
    for (const [ch, name] of CONTROL_KEYS) {
      if (data.startsWith(ch, i)) {
        flush();
        out.push({ literal: "", keys: [name] });
        i += ch.length;
        continue outer;
      }
    }
    literal += data[i];
    i++;
  }
  flush();
  return out;
}

/** Build send-keys command(s) for one input chunk batch. */
export function buildSendKeysCmd(paneId: string, data: string): string[] {
  const cmds: string[] = [];
  for (const part of mapInputToKeys(data)) {
    if (part.literal) {
      // Single-quote escaping: ' → '\''
      const safe = part.literal.replaceAll("'", `'\\''`);
      cmds.push(`send-keys -t ${paneId} -l '${safe}'`);
    }
    for (const key of part.keys) {
      cmds.push(`send-keys -t ${paneId} ${key}`);
    }
  }
  return cmds.length > 0 ? cmds : [`send-keys -t ${paneId} -l ''`];
}
