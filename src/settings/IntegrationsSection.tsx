import { useEffect, useState } from "react";

import { useSettingsStore } from "../store/settingsStore";
import {
  sshHosts,
  starshipApplyPreset,
  starshipDetect,
  starshipPresets,
  starshipReadConfig,
  starshipWriteConfig,
  type SshHost,
} from "../terminal/ipc";
import { tomlGetBool, tomlGetValue, tomlSetValue } from "../terminal/toml";

/**
 * Settings section for external integrations: editor command for file
 * links, SSH config import, and starship prompt management.
 */
export function IntegrationsSection() {
  const editorCommand = useSettingsStore((s) => s.settings.editorCommand);
  const update = useSettingsStore((s) => s.update);
  const [starshipVersion, setStarshipVersion] = useState<string | null | null>(null); // null = checking
  const [presets, setPresets] = useState<string[]>([]);
  const [ssh, setSsh] = useState<SshHost[] | null>(null);
  const [presetStatus, setPresetStatus] = useState<string | null>(null);
  const [config, setConfig] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<string | null>(null);

  useEffect(() => {
    void starshipDetect().then((v) => setStarshipVersion(v));
    void starshipPresets().then(setPresets);
  }, []);

  const loadConfig = () => void starshipReadConfig().then(setConfig);

  const importSsh = async () => {
    const hosts = await sshHosts();
    setSsh(hosts);
    if (hosts.length === 0) return;
    update((draft) => {
      for (const host of hosts) {
        const name = `SSH ${host.host}`;
        if (draft.profiles.some((p) => p.name === name)) continue;
        draft.profiles.push({
          id: `ssh-${host.host}-${Date.now().toString(36)}`,
          name,
          shell: "ssh",
          args: [host.user ? `${host.user}@${host.host}` : host.host],
          cwd: null,
          fontFamily: null,
          fontSize: null,
          themeName: null,
          cursorStyle: null,
          cursorBlink: null,
          lineHeight: null,
          letterSpacing: null,
          scrollback: null,
          badge: "{cwd}",
          customColors: null,
          backgroundOpacity: null,
          backgroundImage: null,
          backgroundImageOpacity: null,
          env: null,
          useStarship: null,
          keybindings: null,
        });
      }
    });
  };

  return (
    <section className="settings-section">
      <h3>Integrations</h3>
      <div className="field-row">
        <label className="field">
          <span>Editor command for ⌘/Ctrl-click file links ({"{file}"})</span>
          <input
            type="text"
            placeholder="code {file}"
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

      <div className="field-row">
        <button type="button" className="settings-add-btn" onClick={() => void importSsh()}>
          Import profiles from ~/.ssh/config
        </button>
        {ssh && (
          <span className="section-hint">
            {ssh.length > 0 ? `imported/refreshed ${ssh.length} host(s)` : "no hosts found"}
          </span>
        )}
      </div>

      <h3>Starship</h3>
      <p className="section-hint">
        {starshipVersion === null
          ? "checking…"
          : starshipVersion
            ? `detected: ${starshipVersion}`
            : "starship not found on PATH — install it from starship.rs"}
      </p>
      <p className="section-hint">
        Enable “Starship prompt” per profile (Profile section) to auto-init
        it for zsh, bash and PowerShell panes; fish follows the starship docs.
      </p>
      {presets.length > 0 && (
        <div className="preset-grid">
          {presets.map((name) => (
            <button
              key={name}
              type="button"
              className="settings-add-btn"
              onClick={() =>
                void starshipApplyPreset(name).then((path) =>
                  setPresetStatus(path ? `applied → ${path}` : "apply failed"),
                )
              }
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {presetStatus && <p className="section-hint">{presetStatus}</p>}

      <div className="field-row">
        <button type="button" className="settings-add-btn" onClick={loadConfig}>
          {config === null ? "Edit starship.toml…" : "Reload from disk"}
        </button>
        {config !== null && (
          <button
            type="button"
            className="settings-add-btn"
            onClick={() =>
              void starshipWriteConfig(config).then((path) =>
                setConfigStatus(path ? `saved → ${path}` : "save failed"),
              )
            }
          >
            Save
          </button>
        )}
      </div>
      {config !== null && (
        <>
          <div className="trigger-row">
            <label className="check-row">
              <input
                type="checkbox"
                checked={tomlGetBool(config, "add_newline") !== false}
                onChange={(e) =>
                  setConfig(tomlSetValue(config, "add_newline", String(e.target.checked)))
                }
              />
              add_newline (blank line between prompts)
            </label>
            <label className="field field-narrow">
              <span>command_timeout (ms)</span>
              <input
                type="text"
                value={tomlGetValue(config, "command_timeout") ?? "500"}
                onChange={(e) =>
                  setConfig(tomlSetValue(config, "command_timeout", e.target.value || "500"))
                }
              />
            </label>
          </div>
          <textarea
            className="env-textarea"
            rows={8}
            spellCheck={false}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
          />
          {configStatus && <p className="section-hint">{configStatus}</p>}
        </>
      )}
    </section>
  );
}
