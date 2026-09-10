import { useEffect } from "react";

import { dispatchMenuAction, isMac } from "../layout/TitleBar";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { bindingLookup, eventToAccelerator } from "./keybindings";
import { handleCopyModeKeyEvent } from "../terminal/copyModeController";

/**
 * Per-profile keybinding overrides: the active pane's spawn profile wins
 * over the global map (only overridden actions are replaced).
 */
function profileKeybindingLookup(): Map<string, string> {
  const s = useAppStore.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (!tab) return new Map();
  const profileId = tab.paneMeta[tab.activePaneId]?.profileId;
  if (!profileId) return new Map();
  const profile = useSettingsStore
    .getState()
    .settings.profiles.find((p) => p.id === profileId);
  return bindingLookup(profile?.keybindings ?? {});
}

/**
 * Global keyboard shortcuts, registered with capture so they win over xterm
 * key handling. Actions resolve through the customizable keybindings map
 * (Settings → Keyboard); Cmd/Ctrl+1–9 tabs stay fixed, as does Escape.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Copy Mode owns the keyboard while active (except webview inputs).
      if (
        useAppStore.getState().copyModePane &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        if (handleCopyModeKeyEvent(e)) return;
      }
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
      const override = profileKeybindingLookup().get(accel);
      const action = override ?? lookup.get(accel);
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
