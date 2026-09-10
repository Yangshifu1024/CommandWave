import { useEffect, useLayoutEffect, useRef } from "react";

import { dispatchMenuAction } from "./TitleBar";
import { useAppStore } from "../store/appStore";

interface MenuItemDef {
  label?: string;
  action?: string;
  sep?: boolean;
  disabled?: boolean;
}

/**
 * Right-click context menu for terminal panes and tabs. All actions route
 * through dispatchMenuAction so they behave identically to menu-bar items.
 */
export function ContextMenu() {
  const menu = useAppStore((s) => s.contextMenu);
  const close = useAppStore((s) => s.closeContextMenu);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const el = ref.current;
    const { width, height } = el.getBoundingClientRect();
    const maxX = window.innerWidth - width - 8;
    const maxY = window.innerHeight - height - 8;
    el.style.left = `${Math.max(8, Math.min(menu.x, maxX))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, maxY))}px`;
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      // Clicks inside the menu itself (menu items) must not close it early.
      if (ref.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;

  const items: MenuItemDef[] = menu.tabId
    ? [
        { label: "New Tab", action: "new-tab" },
        { sep: true },
        { label: "Rename Tab…", action: "rename-tab" },
        { label: "Lock / Unlock Tab", action: "toggle-tab-lock" },
        { sep: true },
        { label: "Close Tab", action: "close-tab" },
      ]
    : [
        { label: "Copy", action: "edit-copy", disabled: !menu.hasSelection },
        { label: "Copy Last Output", action: "copy-last-output" },
        { label: "Paste", action: "edit-paste" },
        { label: "Select All", action: "edit-select-all" },
        { sep: true },
        { label: "Search…", action: "open-search" },
        { label: "Clear Buffer", action: "clear-buffer" },
        { sep: true },
        { label: "Split Pane Right", action: "split-right" },
        { label: "Split Pane Down", action: "split-down" },
        { sep: true },
        { label: "Maximize Pane", action: "toggle-maximize-pane" },
        { label: "Move Pane to New Window", action: "detach-pane" },
        { sep: true },
        { label: "Close Pane", action: "close-pane" },
      ];

  return (
    <div ref={ref} className="context-menu" role="menu">
      {items.map((item, i) =>
        item.sep ? (
          <div key={i} className="context-menu-sep" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className="context-menu-item"
            disabled={item.disabled}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              close();
              if (item.action) dispatchMenuAction(item.action);
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
