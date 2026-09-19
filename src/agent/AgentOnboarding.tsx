import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

import { useSettingsStore } from "../store/settingsStore";
import { isTauri } from "../terminal/ipc";
import { loadAgents, type AgentInfo } from "../settings/IntegrationsSection";

const PROMPTED_KEY = "commandwave.agentOnboarding";

/**
 * First-launch guidance: if any known agents are installed on this machine
 * but no integration is set up yet, offer to install CommandWave's hooks once.
 * Nothing is written without an explicit checkbox + confirm.
 */
export function AgentOnboarding() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    if (localStorage.getItem(PROMPTED_KEY)) return;
    void loadAgents().then((list) => {
      const candidates = list.filter((a) => a.detected && !a.installed);
      if (candidates.length === 0) {
        localStorage.setItem(PROMPTED_KEY, "1");
        return;
      }
      setAgents(candidates);
      setSelected(new Set(candidates.map((a) => a.id)));
    });
  }, []);

  if (!agents) return null;

  const dismiss = () => {
    localStorage.setItem(PROMPTED_KEY, "1");
    setAgents(null);
  };

  const confirm = async () => {
    setBusy(true);
    for (const agent of agents) {
      if (!selected.has(agent.id)) continue;
      try {
        await invoke("agent_install", { agentId: agent.id });
        useSettingsStore.getState().update((draft) => {
          draft.notifications.integrations[agent.id] = { enabled: true, installed: true };
        });
      } catch {
        // best-effort; the Integrations tab can retry
      }
    }
    setBusy(false);
    dismiss();
  };

  return (
    <div className="settings-overlay" onMouseDown={dismiss}>
      <div
        className="settings-dialog agent-onboarding"
        role="dialog"
        aria-label={t("dialogs.onboarding.label")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-header">
          <h2>{t("dialogs.onboarding.title")}</h2>
          <button className="settings-close" aria-label={t("common.close")} onClick={dismiss}>
            ×
          </button>
        </header>
        <div className="settings-body">
          <p className="settings-hint">{t("dialogs.onboarding.description")}</p>
          <div className="agent-list">
            {agents.map((agent) => (
              <label key={agent.id} className="check-row">
                <input
                  type="checkbox"
                  checked={selected.has(agent.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(agent.id);
                    else next.delete(agent.id);
                    setSelected(next);
                  }}
                />
                <span>
                  {agent.label}
                  {agent.configPath ? ` — ${agent.configPath}` : ""}
                </span>
              </label>
            ))}
          </div>
          <div className="field-row">
            <button className="settings-button" disabled={busy} onClick={() => void confirm()}>
              {busy ? t("dialogs.onboarding.installing") : t("dialogs.onboarding.installSelected")}
            </button>
            <button className="settings-button" disabled={busy} onClick={dismiss}>
              {t("dialogs.onboarding.notNow")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
