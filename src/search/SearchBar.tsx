import { useEffect, useRef, useState } from "react";
import type { SearchAddon } from "@xterm/addon-search";

import { useAppStore } from "../store/appStore";
import { terminalManager } from "../terminal/manager";

/** Floating find bar for the active pane (Cmd/Ctrl+F). */
export function SearchBar() {
  const searchOpen = useAppStore((s) => s.searchOpen);
  const closeSearch = useAppStore((s) => s.closeSearch);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const paneId = tabs.find((t) => t.id === activeTabId)?.activePaneId;

  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [resultCount, setResultCount] = useState<{ index: number; count: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      paneId && terminalManager.get(paneId)?.search?.clearDecorations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // Keep the global query in sync so ⌘G can repeat the search.
  useEffect(() => {
    useAppStore.getState().setSearchQuery(query);
  }, [query]);

  // Track match counts while typing.
  useEffect(() => {
    const addon = terminalManager.get(paneId ?? "")?.search;
    if (!addon?.onDidChangeResults) return;
    const listener = addon.onDidChangeResults((r) => {
      setResultCount({ index: r.resultIndex, count: r.resultCount });
    });
    return () => listener.dispose();
  }, [paneId]);

  if (!searchOpen || !paneId) return null;

  const getAddon = (): SearchAddon | null =>
    terminalManager.get(paneId)?.search ?? null;

  // The ruler colors are required by ISearchDecorationOptions but the
  // overview ruler itself is disabled in TerminalPane (it renders an opaque
  // white strip); matchColor highlights every occurrence inline.
  const options = () => ({
    caseSensitive,
    regex,
    decorations: {
      matchOverviewRuler: "#4f9cf9",
      matchColor: "rgba(79, 156, 249, 0.35)",
      activeMatchColorOverviewRuler: "#ff5555",
    },
  });

  const find = (direction: "next" | "previous") => {
    const addon = getAddon();
    if (!addon || !query) return;
    const opts = options();
    if (direction === "next") addon.findNext(query, opts);
    else addon.findPrevious(query, opts);
  };

  return (
    <div className="search-bar" role="search" onKeyDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Find"
        value={query}
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            find(e.shiftKey ? "previous" : "next");
            e.preventDefault();
          } else if (e.key === "Escape") {
            closeSearch();
          }
        }}
      />
      <button
        className={`search-toggle${caseSensitive ? " on" : ""}`}
        title="Match case"
        aria-pressed={caseSensitive}
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>
      <button
        className={`search-toggle${regex ? " on" : ""}`}
        title="Regular expression"
        aria-pressed={regex}
        onClick={() => setRegex((v) => !v)}
      >
        .*
      </button>
      {resultCount && resultCount.count > 0 && (
        <span className="search-count">
          {resultCount.index + 1}/{resultCount.count}
        </span>
      )}
      <button title="Previous match (Shift+Enter)" aria-label="Previous match" onClick={() => find("previous")}>
        ↑
      </button>
      <button title="Next match (Enter)" aria-label="Next match" onClick={() => find("next")}>
        ↓
      </button>
      <button title="Close (Esc)" aria-label="Close search" onClick={closeSearch}>
        ×
      </button>
    </div>
  );
}
