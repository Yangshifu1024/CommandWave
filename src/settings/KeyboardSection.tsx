import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  KEYBINDING_ACTIONS,
  acceleratorToDisplay,
  eventToAccelerator,
  findConflicts,
} from "../hooks/keybindings";
import { useSettingsStore } from "../store/settingsStore";

/**
 * Click-to-record keybinding editor. Recording captures the next bindable
 * combo; Escape cancels, Backspace unbinds. Conflicts are flagged inline.
 */
export function KeyboardSection() {
  const { t } = useTranslation();
  const keybindings = useSettingsStore((s) => s.settings.keybindings);
  const setKeybinding = useSettingsStore((s) => s.setKeybinding);
  const resetKeybindings = useSettingsStore((s) => s.resetKeybindings);
  const [recording, setRecording] = useState<string | null>(null);
  const [conflictNote, setConflictNote] = useState<string | null>(null);
  const recordRef = useRef<(action: string | null) => void>(() => {});

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        recordRef.current(null);
        return;
      }
      if (e.key === "Backspace") {
        setKeybinding(recording, "");
        recordRef.current(null);
        return;
      }
      const accel = eventToAccelerator(e);
      if (!accel) return; // keep waiting for a full combo
      setKeybinding(recording, accel);
      recordRef.current(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, setKeybinding]);

  recordRef.current = (action) => {
    setRecording(action);
    setConflictNote(null);
  };

  const conflicts = findConflicts(keybindings);

  return (
    <section className="settings-section">
      <h3>{t("settings.keyboard.title")}</h3>
      <p className="kb-hint">{t("settings.keyboard.hint")}</p>
      <div className="kb-list">
        {KEYBINDING_ACTIONS.map(({ action, labelKey, default: defaultAcc }) => {
          const bound = keybindings[action] ?? "";
          const conflictWith = conflicts.get(bound);
          const label = t(labelKey);
          return (
            <div key={action} className="kb-row">
              <span className="kb-label">{label}</span>
              <button
                type="button"
                className={`kb-key${recording === action ? " recording" : ""}${
                  conflictWith && bound ? " conflict" : ""
                }`}
                onClick={() => recordRef.current(recording === action ? null : action)}
              >
                {recording === action
                  ? t("settings.keyboard.recording")
                  : acceleratorToDisplay(bound)}
              </button>
              {bound !== defaultAcc && (
                <button
                  type="button"
                  className="kb-reset"
                  title={t("settings.keyboard.restoreDefault")}
                  aria-label={t("settings.keyboard.resetAria", { label })}
                  onClick={() => setKeybinding(action, defaultAcc)}
                >
                  ↺
                </button>
              )}
            </div>
          );
        })}
      </div>
      {conflictNote && <p className="field-error">{conflictNote}</p>}
      <button type="button" className="settings-secondary-btn" onClick={resetKeybindings}>
        {t("settings.keyboard.resetAll")}
      </button>
    </section>
  );
}
