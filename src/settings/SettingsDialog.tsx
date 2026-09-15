import { useState } from "react";

import { useAppStore } from "../store/appStore";
import { AppearanceSection } from "./AppearanceSection";
import { TerminalSection } from "./TerminalSection";
import { KeyboardSection } from "./KeyboardSection";
import { AutomationSection } from "./AutomationSection";
import { SessionSection } from "./SessionSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { UpdatesSection } from "./UpdatesSection";
import { SecretsSection } from "./SecretsSection";

const TABS = [
  { id: "terminal", label: "Terminal" },
  { id: "appearance", label: "Appearance" },
  { id: "keyboard", label: "Keyboard" },
  { id: "session", label: "Session" },
  { id: "automation", label: "Automation" },
  { id: "integrations", label: "Integrations" },
  { id: "updates", label: "Updates" },
  { id: "secrets", label: "Secrets" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Settings dialog: one tab per area (Terminal, Appearance, Keyboard, …).
 * Changes apply immediately and persist.
 */
export function SettingsDialog() {
  const close = useAppStore((s) => s.closeSettings);
  const [tab, setTab] = useState<TabId>("terminal");

  return (
    <div className="settings-overlay" onMouseDown={close}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" aria-label="Close settings" onClick={close}>
            ×
          </button>
        </header>

        <div className="settings-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`settings-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {tab === "terminal" && <TerminalSection />}
          {tab === "appearance" && <AppearanceSection />}
          {tab === "keyboard" && <KeyboardSection />}
          {tab === "session" && <SessionSection />}
          {tab === "automation" && <AutomationSection />}
          {tab === "integrations" && <IntegrationsSection />}
          {tab === "updates" && <UpdatesSection />}
          {tab === "secrets" && <SecretsSection />}
        </div>
      </div>
    </div>
  );
}
