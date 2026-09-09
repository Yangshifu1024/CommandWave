import { useLayoutEffect, useRef } from "react";

import { useAppStore, type Tab } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { TerminalPane } from "../terminal/TerminalPane";
import { terminalManager } from "../terminal/manager";
import type { PaneNode, SplitDir } from "./paneTree";

interface SplitTreeProps {
  tab: Tab;
  active: boolean;
}

export function SplitTree({ tab, active }: SplitTreeProps) {
  return <NodeView node={tab.root} tab={tab} active={active} path={[]} />;
}

function NodeView({
  node,
  tab,
  active,
  path,
}: {
  node: PaneNode;
  tab: Tab;
  active: boolean;
  path: number[];
}) {
  const splitRef = useRef<HTMLDivElement>(null);

  if (node.type === "pane") {
    return <PaneView tab={tab} paneId={node.id} active={active} />;
  }

  return (
    <div
      ref={splitRef}
      className={`split ${node.dir === "h" ? "split-h" : "split-v"}`}
    >
      {node.children.map((child, i) => (
        <div
          key={childKey(child)}
          className="split-cell"
          style={{ flexGrow: node.sizes[i] ?? 1 }}
        >
          {i > 0 && (
            <Splitter
              dir={node.dir}
              onDrag={(delta) =>
                resizeSplit(splitRef.current, node.dir, node.sizes, i, delta, tab.id, path)
              }
            />
          )}
          <NodeView node={child} tab={tab} active={active} path={[...path, i]} />
        </div>
      ))}
    </div>
  );
}

function childKey(node: PaneNode): string {
  return node.type === "pane" ? node.id : node.children.map(childKey).join("+");
}

/** Drag handle between two cells; delta is accumulated pixels. */
function Splitter({
  dir,
  onDrag,
}: {
  dir: SplitDir;
  onDrag: (deltaPx: number) => void;
}) {
  const last = useRef(0);
  return (
    <div
      className={`splitter ${dir === "h" ? "splitter-h" : "splitter-v"}`}
      onMouseDown={(e) => {
        e.preventDefault();
        last.current = dir === "h" ? e.clientX : e.clientY;
        const onMove = (ev: MouseEvent) => {
          const pos = dir === "h" ? ev.clientX : ev.clientY;
          onDrag(pos - last.current);
          last.current = pos;
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
    />
  );
}

function resizeSplit(
  splitEl: HTMLElement | null,
  dir: SplitDir,
  sizes: number[],
  secondIndex: number,
  deltaPx: number,
  tabId: string,
  path: number[],
) {
  const state = useAppStore.getState();
  const next = [...sizes];
  const a = next[secondIndex - 1];
  const b = next[secondIndex];
  if (a == null || b == null) return;

  const total = sizes.reduce((s, v) => s + v, 0) || 1;
  const containerPx = splitEl
    ? dir === "h"
      ? splitEl.clientWidth
      : splitEl.clientHeight
    : 0;
  if (containerPx <= 0) return;

  // Convert the pixel delta into ratio units for this split level.
  const ratioPx = containerPx / total;
  const delta = deltaPx / ratioPx;

  const min = 0.08;
  const na = Math.max(min, Math.min(a + delta, a + b - min));
  const nb = a + b - na;
  next[secondIndex - 1] = na;
  next[secondIndex] = nb;
  state.setSplitSizes(tabId, path, next);
}

function PaneView({
  tab,
  paneId,
  active,
}: {
  tab: Tab;
  paneId: string;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isActivePane = tab.activePaneId === paneId;
  const profile = useSettingsStore(
    (s) => s.settings.profiles.find((p) => p.id === s.settings.defaultProfileId),
  );

  // Re-parent the persistent xterm element into/out of this container.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      terminalManager.attach(paneId, el);
    } else {
      terminalManager.detach(paneId);
    }
  }, [paneId, active, ref]);

  return (
    <div
      ref={ref}
      className={`pane${isActivePane && active ? " pane-active" : ""}`}
      onMouseDown={() => useAppStore.getState().selectPane(tab.id, paneId)}
    >
      <TerminalPane paneId={paneId} cwd={profile?.cwd ?? null} shell={profile?.shell ?? null} />
      <button
        className="pane-close"
        aria-label="Close pane"
        title="Close pane"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          useAppStore.getState().closePane(tab.id, paneId);
        }}
      >
        ×
      </button>
    </div>
  );
}
