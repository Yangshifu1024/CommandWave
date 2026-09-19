import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  { id: "terminal", labelKey: "settings.tabs.terminal" },
  { id: "appearance", labelKey: "settings.tabs.appearance" },
  { id: "keyboard", labelKey: "settings.tabs.keyboard" },
  { id: "session", labelKey: "settings.tabs.session" },
  { id: "automation", labelKey: "settings.tabs.automation" },
  { id: "integrations", labelKey: "settings.tabs.integrations" },
  { id: "updates", labelKey: "settings.tabs.updates" },
  { id: "secrets", labelKey: "settings.tabs.secrets" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Settings dialog: one tab per area (Terminal, Appearance, Keyboard, …).
 * Changes apply immediately and persist.
 */
export function SettingsDialog() {
  const { t } = useTranslation();
  const close = useAppStore((s) => s.closeSettings);
  const [tab, setTab] = useState<TabId>("terminal");

  return (
    <div className="settings-overlay" onMouseDown={close}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-label={t("settings.title")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-header">
          <h2>{t("settings.title")}</h2>
          <button className="settings-close" aria-label={t("settings.closeAria")} onClick={close}>
            ×
          </button>
        </header>

        <div className="settings-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={`settings-tab${tab === item.id ? " active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
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
