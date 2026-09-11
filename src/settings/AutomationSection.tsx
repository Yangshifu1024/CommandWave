import { useSettingsStore, type Trigger } from "../store/settingsStore";

/**
 * Settings section for Triggers (regex over printed lines → highlight /
 * notify / sound / send-text), Auto Answers, and per-session auto logging.
 */

const TRIGGER_ACTIONS: Trigger["action"][] = ["highlight", "notify", "sound", "send-text"];

export function AutomationSection() {
  const triggers = useSettingsStore((s) => s.settings.triggers);
  const answers = useSettingsStore((s) => s.settings.autoAnswers);
  const autoLog = useSettingsStore((s) => s.settings.autoLog);
  const update = useSettingsStore((s) => s.update);

  const mutateTrigger = (id: string, fn: (t: Trigger) => void) => {
    update((draft) => {
      const t = draft.triggers.find((x) => x.id === id);
      if (t) fn(t);
    });
  };

  const addTrigger = () => {
    update((draft) => {
      draft.triggers.push({
        id: `trigger-${Date.now().toString(36)}`,
        regex: "",
        caseSensitive: false,
        action: "highlight",
        param: null,
        enabled: true,
      });
    });
  };

  return (
    <section className="settings-section">
      <h3>Triggers</h3>
      <p className="section-hint">
        Regular expressions over printed lines. On a match: highlight the
        line, send an OS notification, play a sound, or send text to the
        session.
      </p>
      {triggers.map((t) => (
        <div key={t.id} className="trigger-row">
          <input
            type="checkbox"
            title="Enabled"
            checked={t.enabled}
            onChange={(e) => mutateTrigger(t.id, (x) => (x.enabled = e.target.checked))}
          />
          <input
            className="trigger-regex"
            type="text"
            placeholder="regex"
            value={t.regex}
            spellCheck={false}
            onChange={(e) => mutateTrigger(t.id, (x) => (x.regex = e.target.value))}
          />
          <select
            value={t.action}
            onChange={(e) =>
              mutateTrigger(t.id, (x) => (x.action = e.target.value as Trigger["action"]))
            }
          >
            {TRIGGER_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {t.action !== "sound" && (
            <input
              className="trigger-param"
              type="text"
              placeholder={
                t.action === "highlight" ? "color (css)" : t.action === "notify" ? "message" : "text to send"
              }
              value={t.param ?? ""}
              spellCheck={false}
              onChange={(e) => mutateTrigger(t.id, (x) => (x.param = e.target.value || null))}
            />
          )}
          <label className="trigger-case" title="Case sensitive">
            <input
              type="checkbox"
              checked={t.caseSensitive}
              onChange={(e) => mutateTrigger(t.id, (x) => (x.caseSensitive = e.target.checked))}
            />
            Aa
          </label>
          <button
            type="button"
            className="settings-mini-btn"
            aria-label="Delete trigger"
            onClick={() =>
              update((draft) => {
                draft.triggers = draft.triggers.filter((x) => x.id !== t.id);
              })
            }
          >
            −
          </button>
        </div>
      ))}
      <div className="field-row">
        <button type="button" className="settings-add-btn" onClick={addTrigger}>
          + Add Trigger
        </button>
      </div>

      <h3>Auto Answers</h3>
      <p className="section-hint">
        Instantly reply to matching prompts (e.g. “Are you sure? [y/N]” → y).
      </p>
      {answers.map((a, i) => (
        <div key={i} className="trigger-row">
          <input
            type="checkbox"
            title="Enabled"
            checked={a.enabled}
            onChange={(e) =>
              update((draft) => {
                draft.autoAnswers[i].enabled = e.target.checked;
              })
            }
          />
          <input
            className="trigger-regex"
            type="text"
            placeholder="prompt regex"
            value={a.pattern}
            spellCheck={false}
            onChange={(e) =>
              update((draft) => {
                draft.autoAnswers[i].pattern = e.target.value;
              })
            }
          />
          <input
            className="trigger-param"
            type="text"
            placeholder="reply"
            value={a.reply}
            spellCheck={false}
            onChange={(e) =>
              update((draft) => {
                draft.autoAnswers[i].reply = e.target.value;
              })
            }
          />
          <button
            type="button"
            className="settings-mini-btn"
            aria-label="Delete auto answer"
            onClick={() =>
              update((draft) => {
                draft.autoAnswers.splice(i, 1);
              })
            }
          >
            −
          </button>
        </div>
      ))}
      <div className="field-row">
        <button
          type="button"
          className="settings-add-btn"
          onClick={() =>
            update((draft) => {
              draft.autoAnswers.push({ pattern: "", reply: "", enabled: true });
            })
          }
        >
          + Add Auto Answer
        </button>
      </div>

      <h3>Session Log</h3>
      <label className="check-row">
        <input
          type="checkbox"
          checked={autoLog.enabled}
          onChange={(e) =>
            update((draft) => {
              draft.autoLog.enabled = e.target.checked;
            })
          }
        />
        <span>Automatically log all output of new sessions to file</span>
      </label>
      {autoLog.enabled && (
        <div className="field-row">
          <label className="field">
            <span>Log directory (empty = app log dir)</span>
            <input
              type="text"
              value={autoLog.directory ?? ""}
              placeholder="default"
              spellCheck={false}
              onChange={(e) =>
                update((draft) => {
                  draft.autoLog.directory = e.target.value || null;
                })
              }
            />
          </label>
        </div>
      )}
    </section>
  );
}
