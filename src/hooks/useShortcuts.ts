import { useEffect } from "react";

import { dispatchMenuAction, isMac } from "../layout/TitleBar";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { bindingLookup, eventToAccelerator } from "./keybindings";

/**
 * Global keyboard shortcuts, registered with capture so they win over xterm
 * key handling. Actions resolve through the customizable keybindings map
 * (Settings → Keyboard); Cmd/Ctrl+1–9 tabs stay fixed, as does Escape.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const s = useAppStore.getState();
        if (s.settingsOpen) {
          s.closeSettings();
          e.preventDefault();
          return;
        }
        if (
          s.searchOpen &&
          (e.target as HTMLElement | null)?.closest?.(".search-bar")
        ) {
          s.closeSearch();
          e.preventDefault();
          return;
        }
      }
      // Ctrl+Tab cycles tabs on Windows/Linux (Ctrl+Tab is not text input).
      if (!isMac && e.ctrlKey && !e.altKey && e.key === "Tab") {
        useAppStore.getState().cycleTab(e.shiftKey ? -1 : 1);
        e.preventDefault();
        return;
      }

      const accel = eventToAccelerator(e);
      if (!accel) return;
      const lookup = bindingLookup(useSettingsStore.getState().settings.keybindings);
      const action = lookup.get(accel);
      if (action) {
        dispatchMenuAction(action);
        e.preventDefault();
        return;
      }

      // Fixed: Cmd/Ctrl+1–9 selects the nth tab.
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && !e.altKey && /^[1-9]$/.test(e.key)) {
        useAppStore.getState().selectTabIndex(Number(e.key) - 1);
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
