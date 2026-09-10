import { useEffect, useMemo, useRef, useState } from "react";

import { useAppStore } from "../store/appStore";
import { ptyWrite } from "../terminal/ipc";
import { terminalManager } from "../terminal/manager";
import {
  allCommands,
  formatDuration,
  queryCommands,
  type CommandRecord,
} from "../terminal/commandHistory";

/**
 * Recent Commands palette (⌘;): searchable command history with duration /
 * exit code / cwd, plus semantic search (⌥⌘;) over command output. Enter
 * re-runs the selected command in the active pane.
 */
export function RecentCommands({ semantic }: { semantic: boolean }) {
  const open = useAppStore((s) => s.historyOpen);
  const [filter, setFilter] = useState("");
  const [includeOutput, setIncludeOutput] = useState(semantic);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => queryCommands({ filter, includeOutput }),
    [filter, includeOutput],
  );

  useEffect(() => {
    if (open) {
      setFilter("");
      setIncludeOutput(semantic);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, semantic]);

  useEffect(() => setSelected(0), [filter, includeOutput]);

  if (!open) return null;

  const close = () => useAppStore.setState({ historyOpen: false });

  const run = (rec: CommandRecord) => {
    const s = useAppStore.getState();
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    const entry = tab ? terminalManager.get(tab.activePaneId) : undefined;
    if (entry?.ptyId != null) ptyWrite(entry.ptyId, `${rec.command}\r`);
    close();
  };

  return (
    <div className="dialog-backdrop" onMouseDown={close}>
      <div
        className="dialog history-dialog"
        role="dialog"
        aria-label="Recent commands"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          className="history-input"
          placeholder={includeOutput ? "Search commands and their output…" : "Search commands…"}
          value={filter}
          spellCheck={false}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            else if (e.key === "ArrowDown") {
              setSelected((i) => Math.min(results.length - 1, i + 1));
              e.preventDefault();
            } else if (e.key === "ArrowUp") {
              setSelected((i) => Math.max(0, i - 1));
              e.preventDefault();
            } else if (e.key === "Enter" && results[selected]) {
              run(results[selected]);
            }
          }}
        />
        <label className="history-toggle">
          <input
            type="checkbox"
            checked={includeOutput}
            onChange={(e) => setIncludeOutput(e.target.checked)}
          />
          include command output (semantic search)
        </label>
        <div className="history-list">
          {results.length === 0 && (
            <div className="history-empty">No matching commands yet.</div>
          )}
          {results.slice(0, 100).map((rec, i) => (
            <button
              key={`${rec.at}-${i}`}
              className={`history-item${i === selected ? " selected" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => run(rec)}
            >
              <span className={`history-exit${rec.exitCode ? " fail" : ""}`}>
                {rec.exitCode == null ? "—" : rec.exitCode === 0 ? "✓" : rec.exitCode}
              </span>
              <span className="history-cmd">{rec.command}</span>
              <span className="history-duration">{formatDuration(rec.durationMs)}</span>
              <span className="history-cwd">{rec.cwd ?? ""}</span>
            </button>
          ))}
        </div>
        <div className="history-hint">
          ↑↓ select · Enter run · Esc close · {allCommands().length} recorded
        </div>
      </div>
    </div>
  );
}
