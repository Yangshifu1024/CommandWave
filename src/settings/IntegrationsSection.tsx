import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

import { useSettingsStore } from "../store/settingsStore";
import { isTauri } from "../terminal/ipc";

export interface AgentInfo {
  id: string;
  label: string;
  binaries: string[];
  /** Detected on this machine (binary on PATH or config directory present). */
  detected: boolean;
  installed: boolean;
  configPath: string | null;
}

/** Agent registry (Rust) shared by the Integrations UI and onboarding. */
export async function loadAgents(): Promise<AgentInfo[]> {
  if (!isTauri) return [];
  try {
    return await invoke<AgentInfo[]>("agent_registry");
  } catch {
    return [];
  }
}

/**
 * Settings section for external integrations: the editor command for file
 * links, plus the Tier-3 agent hook installer.
 */
export function IntegrationsSection() {
  const { t } = useTranslation();
  const editorCommand = useSettingsStore((s) => s.settings.editorCommand);
  const update = useSettingsStore((s) => s.update);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void loadAgents().then(setAgents);
  };
  useEffect(refresh, []);

  const install = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const outcome = await invoke<{ path: string; preview: string }>("agent_install", {
        agentId: id,
      });
      setPreview({ id, text: `${outcome.path}\n\n${outcome.preview}` });
      update((draft) => {
        draft.notifications.integrations[id] = { enabled: true, installed: true };
      });
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await invoke("agent_uninstall", { agentId: id });
      update((draft) => {
        draft.notifications.integrations[id] = { enabled: false, installed: false };
      });
      setPreview(null);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="settings-section">
        <h3>{t("settings.integrations.editor")}</h3>
        <div className="field-row">
          <label className="field">
            <span>{t("settings.integrations.editorCommand")}</span>
            <input
              type="text"
              placeholder={t("settings.integrations.editorPlaceholder")}
              value={editorCommand ?? ""}
              spellCheck={false}
              onChange={(e) =>
                update((draft) => {
                  draft.editorCommand = e.target.value.trim() || null;
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.integrations.agents")}</h3>
        <p className="settings-hint">{t("settings.integrations.agentsHint")}</p>
        {error && <div className="settings-error">{error}</div>}
        <div className="agent-list">
          {agents.length === 0 && (
            <div className="settings-hint">{t("settings.integrations.noAgents")}</div>
          )}
          {agents.map((agent) => (
            <div key={agent.id} className="agent-row">
              <div className="agent-row-main">
                <span className="agent-row-label">{agent.label}</span>
                <span className="agent-row-meta">
                  {agent.detected
                    ? t("settings.integrations.detected")
                    : t("settings.integrations.notFound")}
                  {agent.configPath ? ` · ${agent.configPath}` : ""}
                </span>
              </div>
              {agent.installed ? (
                <button
                  className="settings-button"
                  disabled={busy === agent.id}
                  onClick={() => void uninstall(agent.id)}
                >
                  {busy === agent.id ? "…" : t("settings.integrations.uninstall")}
                </button>
              ) : (
                <button
                  className="settings-button"
                  disabled={busy === agent.id}
                  onClick={() => void install(agent.id)}
                >
                  {busy === agent.id ? "…" : t("settings.integrations.install")}
                </button>
              )}
            </div>
          ))}
        </div>
        {preview && (
          <pre className="agent-preview" aria-label={t("settings.integrations.previewAria")}>
            {preview.text}
          </pre>
        )}
      </section>
    </>
  );
}
