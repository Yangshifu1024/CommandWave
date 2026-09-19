import { useTranslation } from "react-i18next";

import { useSettingsStore, type Settings } from "../store/settingsStore";
import { scrollbackLines } from "../store/settingsStore";
import { requestAttention, sendNotification } from "../notifications/backend";
import { clampInt } from "./clamp";

/**
 * Settings tab for the shell/session: shell command, working directory,
 * scrollback, badge, environment and notifications.
 */
export function TerminalSection() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  /** Verify permission + toast style from the settings dialog. */
  const sendTestNotification = async (): Promise<void> => {
    await sendNotification({
      title: "CommandWave",
      body: t("settings.terminal.testNotificationBody"),
    });
    void requestAttention();
  };

  const set = (patch: Partial<Settings>) => {
    update((draft) => {
      Object.assign(draft, patch);
    });
  };

  return (
    <>
      <section className="settings-section">
        <h3>{t("settings.terminal.shell")}</h3>
        <div className="field-row">
          <label className="field">
            <span>{t("settings.terminal.shellCommand")}</span>
            <input
              type="text"
              placeholder={t("settings.terminal.shellCommandPlaceholder")}
              value={settings.shell ?? ""}
              onChange={(e) => set({ shell: e.target.value || null })}
              spellCheck={false}
            />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>{t("settings.terminal.workingDirectory")}</span>
            <input
              type="text"
              placeholder={t("settings.terminal.workingDirectoryPlaceholder")}
              value={settings.cwd ?? ""}
              onChange={(e) => set({ cwd: e.target.value || null })}
              spellCheck={false}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.terminal.buffer")}</h3>
        <div className="field-row">
          <label className="field field-narrow">
            <span>{t("settings.terminal.scrollback")}</span>
            <input
              type="number"
              min={100}
              max={1000000}
              step={100}
              placeholder={String(scrollbackLines)}
              value={settings.scrollback ?? ""}
              onChange={(e) =>
                set({
                  scrollback: e.target.value
                    ? clampInt(e.target.value, 100, 1000000, scrollbackLines)
                    : null,
                })
              }
            />
          </label>
          <label className="field">
            <span>{t("settings.terminal.badge")}</span>
            <input
              type="text"
              placeholder={t("settings.terminal.badgePlaceholder")}
              value={settings.badge ?? ""}
              spellCheck={false}
              onChange={(e) => set({ badge: e.target.value || null })}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.terminal.environment")}</h3>
        <label className="field">
          <span>{t("settings.terminal.envVariables")}</span>
          <textarea
            rows={2}
            className="env-textarea"
            spellCheck={false}
            placeholder={t("settings.terminal.envPlaceholder")}
            value={(settings.env ?? []).join("\n")}
            onChange={(e) =>
              set({
                env: e.target.value
                  ? e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)
                  : null,
              })
            }
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>{t("settings.terminal.notifications")}</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.notifications.events.finished}
            onChange={(e) =>
              update((draft) => {
                draft.notifications.events.finished = e.target.checked;
              })
            }
          />
          <span>{t("settings.terminal.notifyFinished")}</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.notifications.events.needsConfirmation}
            onChange={(e) =>
              update((draft) => {
                draft.notifications.events.needsConfirmation = e.target.checked;
              })
            }
          />
          <span>{t("settings.terminal.notifyNeedsConfirmation")}</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.notifications.events.error}
            onChange={(e) =>
              update((draft) => {
                draft.notifications.events.error = e.target.checked;
              })
            }
          />
          <span>{t("settings.terminal.notifyError")}</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.notifications.taskbarAttention}
            onChange={(e) =>
              update((draft) => {
                draft.notifications.taskbarAttention = e.target.checked;
              })
            }
          />
          <span>{t("settings.terminal.notifyTaskbarAttention")}</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.notifications.titleDetection}
            onChange={(e) =>
              update((draft) => {
                draft.notifications.titleDetection = e.target.checked;
              })
            }
          />
          <span>{t("settings.terminal.notifyTitleDetection")}</span>
        </label>
        <div className="field-row">
          <label className="field field-narrow">
            <span>{t("settings.terminal.idleThreshold")}</span>
            <input
              type="number"
              min={1}
              max={60}
              step={1}
              value={Math.round(settings.notifications.idleThresholdMs / 1000)}
              onChange={(e) =>
                update((draft) => {
                  draft.notifications.idleThresholdMs =
                    clampInt(e.target.value, 1, 60, 5) * 1000;
                })
              }
            />
          </label>
          <button
            className="settings-button"
            onClick={() => {
              void sendTestNotification();
            }}
          >
            {t("settings.terminal.sendTestNotification")}
          </button>
        </div>
      </section>
    </>
  );
}
