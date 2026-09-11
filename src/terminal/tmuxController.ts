/**
 * tmux control-mode controller: owns a `tmux -CC` control PTY, maps tmux
 * windows/panes onto CommandWave tabs/panes, forwards pane output to the
 * mapped xterm instances and routes input/resizes back as tmux commands.
 */

import { useAppStore } from "../store/appStore";
import { onPtyExit, ptyClose, ptyWrite, spawnPty } from "./ipc";
import { terminalManager } from "./manager";
import {
  buildSendKeysCmd,
  parseNotification,
  parseTmuxLayout,
  type TmuxCell,
} from "./tmuxProtocol";
import { paneLeaf, type PaneNode } from "../layout/paneTree";

/** CommandWave pane id for a tmux pane id ("%3" → "tmux-3"). */
export function cwPaneId(tmuxPaneId: string): string {
  return `tmux-${tmuxPaneId.replace(/^%/, "")}`;
}

function cellToNode(cell: TmuxCell): PaneNode {
  if (!cell.children || cell.children.length === 0) {
    return paneLeaf(cwPaneId(cell.paneId ?? "0"));
  }
  // Full-width children stack vertically; otherwise side by side.
  const dir = cell.children.every((c) => c.x === cell.x) ? "v" : "h";
  const sizes = cell.children.map((c) => (dir === "v" ? c.h : c.w));
  return {
    type: "split",
    dir,
    children: cell.children.map(cellToNode),
    sizes,
  };
}

class TmuxController {
  private controlPtyId: number | null = null;
  private buf = "";
  private windows = new Map<string, { tabId: string }>();

  get attached(): boolean {
    return this.controlPtyId !== null;
  }

  attach(): void {
    if (this.controlPtyId !== null) return;
    spawnPty(
      {
        rows: 24,
        cols: 80,
        cwd: null,
        shell: "tmux",
        args: ["-CC", "new", "-A", "-s", "commandwave"],
        env: null,
      },
      (data) => this.onControlOutput(data),
    )
      .then((h) => {
        this.controlPtyId = h.ptyId;
        // Ask for the current window list; layouts arrive as
        // %layout-change notifications.
        this.sendCommand("list-windows");
        onPtyExit((ptyId) => {
          if (ptyId === this.controlPtyId) this.teardown();
        }).then(() => {});
      })
      .catch((err) => {
        console.error("tmux attach failed", err);
      });
  }

  detach(): void {
    if (this.controlPtyId !== null) {
      this.sendCommand("detach-client");
      ptyClose(this.controlPtyId);
    }
    this.teardown();
  }

  private teardown(): void {
    this.controlPtyId = null;
    this.buf = "";
    this.windows.clear();
    useAppStore.getState().removeTmuxTabs();
  }

  private sendCommand(cmd: string): void {
    if (this.controlPtyId !== null) ptyWrite(this.controlPtyId, `${cmd}\n`);
  }

  /** Keyboard input from a mapped pane → send-keys. */
  handleInput(tmuxPaneId: string, data: string): void {
    for (const cmd of buildSendKeysCmd(tmuxPaneId, data)) this.sendCommand(cmd);
  }

  /** Pane resize from a mapped terminal → resize-pane. */
  resizePane(tmuxPaneId: string, cols: number, rows: number): void {
    this.sendCommand(`resize-pane -t ${tmuxPaneId} -x ${cols} -y ${rows}`);
  }

  killWindow(windowId: string): void {
    this.sendCommand(`kill-window -t ${windowId}`);
  }

  private onControlOutput(data: Uint8Array | string): void {
    this.buf += typeof data === "string" ? data : new TextDecoder().decode(data);
    const lines = this.buf.split(/\r?\n/);
    this.buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) this.dispatch(line);
    }
  }

  private dispatch(line: string): void {
    const n = parseNotification(line);
    switch (n.kind) {
      case "layout-change": {
        const { root } = parseTmuxLayout(n.layout);
        if (!root.children && !root.paneId) return;
        useAppStore.getState().upsertTmuxWindow(n.windowId, cellToNode(root));
        break;
      }
      case "output": {
        terminalManager.get(cwPaneId(n.paneId))?.term.write(n.data);
        break;
      }
      case "window-close": {
        const win = this.windows.get(n.windowId);
        if (win) {
          this.windows.delete(n.windowId);
          useAppStore.getState().closeTmuxWindow(win.tabId);
        }
        break;
      }
      case "window-renamed": {
        const win = this.windows.get(n.windowId);
        if (win) useAppStore.getState().renameTab(win.tabId, n.name);
        break;
      }
      case "exit":
        this.teardown();
        break;
      default:
        break;
    }
  }

  /** Called by appStore when a tmux tab is created (window bookkeeping). */
  registerWindow(windowId: string, tabId: string): void {
    this.windows.set(windowId, { tabId });
  }

  windowForTab(tabId: string): string | null {
    for (const [winId, w] of this.windows) {
      if (w.tabId === tabId) return winId;
    }
    return null;
  }
}

export const tmuxController = new TmuxController();
