import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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

  // Labels are resolved on every render so the open menu follows a language
  // switch immediately.
  const items: MenuItemDef[] = menu.tabId
    ? [
        { label: t("dialogs.contextMenu.newTab"), action: "new-tab" },
        { sep: true },
        { label: t("dialogs.contextMenu.renameTab"), action: "rename-tab" },
        { label: t("dialogs.contextMenu.toggleTabLock"), action: "toggle-tab-lock" },
        { sep: true },
        { label: t("dialogs.contextMenu.closeTab"), action: "close-tab" },
      ]
    : [
        { label: t("common.copy"), action: "edit-copy", disabled: !menu.hasSelection },
        { label: t("dialogs.contextMenu.copyLastOutput"), action: "copy-last-output" },
        { label: t("dialogs.contextMenu.paste"), action: "edit-paste" },
        { label: t("dialogs.contextMenu.selectAll"), action: "edit-select-all" },
        { sep: true },
        { label: t("dialogs.contextMenu.search"), action: "open-search" },
        { label: t("dialogs.contextMenu.clearBuffer"), action: "clear-buffer" },
        { sep: true },
        { label: t("dialogs.contextMenu.splitRight"), action: "split-right" },
        { label: t("dialogs.contextMenu.splitDown"), action: "split-down" },
        { sep: true },
        { label: t("dialogs.contextMenu.maximizePane"), action: "toggle-maximize-pane" },
        { label: t("dialogs.contextMenu.detachPane"), action: "detach-pane" },
        { sep: true },
        { label: t("dialogs.contextMenu.closePane"), action: "close-pane" },
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
