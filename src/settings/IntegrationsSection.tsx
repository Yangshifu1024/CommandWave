import { useSettingsStore } from "../store/settingsStore";

/**
 * Settings section for external integrations: editor command for ⌘/Ctrl-
 * click file links.
 */
export function IntegrationsSection() {
  const editorCommand = useSettingsStore((s) => s.settings.editorCommand);
  const update = useSettingsStore((s) => s.update);

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
    </section>
  );
}
