import { useTranslation } from "react-i18next";

import { useSettingsStore, type Trigger } from "../store/settingsStore";
import {
  PASSWORD_TRIGGER_DEFAULT_TITLE,
  PASSWORD_TRIGGER_ID,
} from "../terminal/triggers";

/**
 * Settings section for Triggers (regex over printed lines → highlight /
 * notify / sound / send-text), Auto Answers, and per-session auto logging.
 */

const TRIGGER_ACTIONS: Trigger["action"][] = ["highlight", "notify", "sound", "send-text"];

/** Translation key of each action's option label in the trigger row. */
const TRIGGER_ACTION_KEYS = {
  highlight: "settings.automation.actionHighlight",
  notify: "settings.automation.actionNotify",
  sound: "settings.automation.actionSound",
  "send-text": "settings.automation.actionSendText",
} as const satisfies Record<Trigger["action"], string>;

export function AutomationSection() {
  const { t } = useTranslation();
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
      <h3>{t("settings.automation.triggers")}</h3>
      <p className="section-hint">{t("settings.automation.triggersHint")}</p>
      {triggers.map((trigger) => (
        <div key={trigger.id} className="trigger-row">
          <input
            type="checkbox"
            title={t("common.enabled")}
            checked={trigger.enabled}
            onChange={(e) =>
              mutateTrigger(trigger.id, (x) => (x.enabled = e.target.checked))
            }
          />
          <input
            className="trigger-regex"
            type="text"
            placeholder={t("settings.automation.regexPlaceholder")}
            value={trigger.regex}
            spellCheck={false}
            onChange={(e) =>
              mutateTrigger(trigger.id, (x) => (x.regex = e.target.value))
            }
          />
          <select
            value={trigger.action}
            onChange={(e) =>
              mutateTrigger(trigger.id, (x) => (x.action = e.target.value as Trigger["action"]))
            }
          >
            {TRIGGER_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(TRIGGER_ACTION_KEYS[a])}
              </option>
            ))}
          </select>
          {trigger.action !== "sound" && (
            <input
              className="trigger-param"
              type="text"
              placeholder={
                trigger.action === "highlight"
                  ? t("settings.automation.paramColor")
                  : trigger.action === "notify"
                    ? t("settings.automation.paramMessage")
                    : t("settings.automation.paramSendText")
              }
              value={
                trigger.id === PASSWORD_TRIGGER_ID &&
                trigger.param === PASSWORD_TRIGGER_DEFAULT_TITLE
                  ? t("terminal.notify.passwordPromptDefault")
                  : (trigger.param ?? "")
              }
              spellCheck={false}
              onChange={(e) =>
                mutateTrigger(trigger.id, (x) => (x.param = e.target.value || null))
              }
            />
          )}
          <label className="trigger-case" title={t("settings.automation.caseSensitive")}>
            <input
              type="checkbox"
              checked={trigger.caseSensitive}
              onChange={(e) =>
                mutateTrigger(trigger.id, (x) => (x.caseSensitive = e.target.checked))
              }
            />
            Aa
          </label>
          <button
            type="button"
            className="settings-mini-btn"
            aria-label={t("settings.automation.deleteTriggerAria")}
            onClick={() =>
              update((draft) => {
                draft.triggers = draft.triggers.filter((x) => x.id !== trigger.id);
              })
            }
          >
            −
          </button>
        </div>
      ))}
      <div className="field-row">
        <button type="button" className="settings-add-btn" onClick={addTrigger}>
          {t("settings.automation.addTrigger")}
        </button>
      </div>

      <h3>{t("settings.automation.autoAnswers")}</h3>
      <p className="section-hint">{t("settings.automation.autoAnswersHint")}</p>
      {answers.map((a, i) => (
        <div key={i} className="trigger-row">
          <input
            type="checkbox"
            title={t("common.enabled")}
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
            placeholder={t("settings.automation.promptRegexPlaceholder")}
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
            placeholder={t("settings.automation.replyPlaceholder")}
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
            aria-label={t("settings.automation.deleteAutoAnswerAria")}
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
          {t("settings.automation.addAutoAnswer")}
        </button>
      </div>

      <h3>{t("settings.automation.sessionLog")}</h3>
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
        <span>{t("settings.automation.autoLog")}</span>
      </label>
      {autoLog.enabled && (
        <div className="field-row">
          <label className="field">
            <span>{t("settings.automation.logDirectory")}</span>
            <input
              type="text"
              value={autoLog.directory ?? ""}
              placeholder={t("settings.automation.logDirectoryPlaceholder")}
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
