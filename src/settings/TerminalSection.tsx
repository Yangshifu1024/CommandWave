import { useSettingsStore, type Settings } from "../store/settingsStore";
import { scrollbackLines } from "../store/settingsStore";
import { requestAttention, sendNotification } from "../notifications/backend";
import { clampInt } from "./clamp";

/** Verify permission + toast style from the settings dialog. */
async function sendTestNotification(): Promise<void> {
  await sendNotification({
    title: "CommandWave",
    body: "Test notification — agent alerts are working.",
  });
  void requestAttention();
}

/**
 * Settings tab for the shell/session: shell command, working directory,
 * scrollback, badge, environment and notifications.
 */
export function TerminalSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const set = (patch: Partial<Settings>) => {
    update((draft) => {
      Object.assign(draft, patch);
    });
  };

  return (
    <>
      <section className="settings-section">
        <h3>Shell</h3>
        <div className="field-row">
          <label className="field">
            <span>Shell command</span>
            <input
              type="text"
              placeholder="system default"
              value={settings.shell ?? ""}
              onChange={(e) => set({ shell: e.target.value || null })}
              spellCheck={false}
            />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Working directory</span>
            <input
              type="text"
              placeholder="home"
              value={settings.cwd ?? ""}
              onChange={(e) => set({ cwd: e.target.value || null })}
              spellCheck={false}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Buffer</h3>
        <div className="field-row">
          <label className="field field-narrow">
            <span>Scrollback (lines)</span>
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
            <span>Badge ({"{cwd}"} / {"{duration}"} placeholders)</span>
            <input
              type="text"
              placeholder="e.g. {cwd}"
              value={settings.badge ?? ""}
              spellCheck={false}
              onChange={(e) => set({ badge: e.target.value || null })}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Environment</h3>
        <label className="field">
          <span>Extra variables (one KEY=VALUE per line)</span>
          <textarea
            rows={2}
            className="env-textarea"
            spellCheck={false}
            placeholder="EDITOR=vim"
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
        <h3>Notifications</h3>
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
          <span>
            Finished — a command or agent turn completed while you were away
          </span>
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
          <span>Needs confirmation — an agent is waiting for your answer</span>
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
          <span>Error — an agent or command failed</span>
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
          <span>Flash the taskbar / Dock when an agent needs you</span>
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
          <span>
            Detect agent state from window titles (Claude, Gemini, Codex…)
          </span>
        </label>
        <div className="field-row">
          <label className="field field-narrow">
            <span>Idle threshold (seconds)</span>
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
            Send test notification
          </button>
        </div>
      </section>
    </>
  );
}
