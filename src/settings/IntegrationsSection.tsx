import { useEffect, useState } from "react";

import { useSettingsStore } from "../store/settingsStore";
import {
  starshipApplyPreset,
  starshipDetect,
  starshipPresets,
  starshipReadConfig,
  starshipWriteConfig,
} from "../terminal/ipc";
import { tomlGetBool, tomlGetValue, tomlSetValue } from "../terminal/toml";

/**
 * Settings section for external integrations: editor command for file
 * links and starship prompt management.
 */
export function IntegrationsSection() {
  const editorCommand = useSettingsStore((s) => s.settings.editorCommand);
  const update = useSettingsStore((s) => s.update);
  const [starshipVersion, setStarshipVersion] = useState<string | null | null>(null); // null = checking
  const [presets, setPresets] = useState<string[]>([]);
  const [presetStatus, setPresetStatus] = useState<string | null>(null);
  const [config, setConfig] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<string | null>(null);

  useEffect(() => {
    void starshipDetect().then((v) => setStarshipVersion(v));
    void starshipPresets().then(setPresets);
  }, []);

  const loadConfig = () => void starshipReadConfig().then(setConfig);

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

      <h3>Starship</h3>
      <p className="section-hint">
        {starshipVersion === null
          ? "checking…"
          : starshipVersion
            ? `detected: ${starshipVersion}`
            : "starship not found on PATH — install it from starship.rs"}
      </p>
      <p className="section-hint">
        Enable “Starship prompt” (Terminal tab) to auto-init it for zsh,
        bash and PowerShell panes; fish follows the starship docs.
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
