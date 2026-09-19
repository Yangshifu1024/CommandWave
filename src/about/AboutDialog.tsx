/**
 * In-app "About" window.
 *
 * Shows the app identity (icon, name, version, build time), the license, links
 * to the repository and the issue tracker, a scrollable list of the third-party
 * components that ship inside CommandWave, and an entry point to the existing
 * update flow.
 *
 * Reuses the shared `.dialog-backdrop` + `.dialog` primitives from
 * `styles/global.css` (same look as the settings and updater dialogs); only the
 * About-specific styles live in `AboutDialog.css`.
 *
 * Opened from the title bar's Help menu and from the macOS app menu, which both
 * call `openAbout()` on the app store.
 */

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

import appIcon from "../assets/app-icon.png";
import { useAppStore } from "../store/appStore";
import { openExternal } from "../terminal/ipc";
import { appVersion, FALLBACK_APP_VERSION } from "../updater/backend";
import { requestUpdateCheck } from "../updater/index";
import { credits } from "./credits";
import "./AboutDialog.css";

/** Opened in the system browser; the app window never navigates away. */
const REPOSITORY_URL = "https://github.com/Yangshifu1024/CommandWave";
const ISSUES_URL = "https://github.com/Yangshifu1024/CommandWave/issues";

/** How long the "check for updates" button stays inactive after a click. */
const CHECK_COOLDOWN_MS = 3000;

/**
 * Renders an ISO timestamp as a fixed `YYYY-MM-DD HH:mm` string in local time.
 *
 * Hand-rolled (and computed once below) so the field neither depends on the
 * machine's locale settings nor shifts on re-render. Returns `null` for a
 * missing or unparsable value; the caller shows the shared "Unknown".
 */
function formatBuildTime(raw: string): string | null {
  if (raw.trim() === "") return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ` +
    `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  );
}

/** Build timestamp baked in by `define` in vite.config.ts, formatted once. */
const BUILD_TIME = formatBuildTime(typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "");

/** Label + outbound link row. */
function LinkRow({ label, url }: { label: string; url: string }): JSX.Element {
  return (
    <div className="about-row">
      <span className="about-label">{label}</span>
      <button type="button" className="about-link" onClick={() => void openExternal(url)}>
        {url}
      </button>
    </div>
  );
}

export function AboutDialog(): JSX.Element {
  const { t } = useTranslation();
  const close = useAppStore((s) => s.closeAbout);
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // The version comes from the backend, so the first paint shows "Loading…"
  // instead of flashing "Unknown".
  useEffect(() => {
    let alive = true;
    void appVersion().then(
      (value) => {
        if (alive) setVersion(value);
      },
      () => {
        if (alive) setVersion("");
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  // Re-enable the update button after a moment so a double click cannot queue
  // two checks (the update dialog itself is driven by the updater provider).
  useEffect(() => {
    if (!checking) return;
    const timer = setTimeout(() => setChecking(false), CHECK_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [checking]);

  // Escape closes the window; capture phase so the terminal does not also see
  // the key while this dialog is modal (same approach as UpdateDialog).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [close]);

  /** Hands the check over to the updater; its own dialog reports the result. */
  const checkForUpdates = () => {
    if (checking) return;
    setChecking(true);
    requestUpdateCheck();
  };

  // `appVersion()` returns its sentinel when the version cannot be read (browser
  // dev build, missing API) — that is "unknown", not a real version number.
  const versionText =
    version === null
      ? t("common.loading")
      : version.trim() === "" || version === FALLBACK_APP_VERSION
        ? t("common.unknown")
        : version;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={close}>
      <div
        className="dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="about-header">
          {/* The product name sits right next to the icon, so it is decorative. */}
          <img className="about-icon" src={appIcon} alt="" width={48} height={48} />
          <div className="about-identity">
            <h2 id="about-dialog-title">CommandWave</h2>
            <div className="about-meta">
              <span>
                {t("about.version")} <span className="about-value">{versionText}</span>
              </span>
              <span>
                {t("about.buildTime")}{" "}
                <span className="about-value">{BUILD_TIME ?? t("common.unknown")}</span>
              </span>
            </div>
          </div>
        </header>

        <div className="about-license">
          <div className="about-row">
            <span className="about-label">{t("about.license")}</span>
            <span className="about-value">MIT</span>
          </div>
          <p className="dialog-text">{t("about.licenseNote")}</p>
        </div>

        <div className="about-links">
          <LinkRow label={t("about.repository")} url={REPOSITORY_URL} />
          <LinkRow label={t("about.issues")} url={ISSUES_URL} />
        </div>

        <section className="about-credits">
          <h3>{t("about.componentsHeading")}</h3>
          <p className="dialog-text">{t("about.componentsHint")}</p>
          <ul className="about-credits-list">
            {credits.map((entry) => (
              <li key={`${entry.name}@${entry.version}`} className="about-credit">
                <span className="about-credit-name">{entry.name}</span>
                <span className="about-credit-version">{entry.version}</span>
                <span className="about-credit-license">{entry.license}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="dialog-actions">
          <button type="button" disabled={checking} onClick={checkForUpdates}>
            {checking ? t("about.checking") : t("about.checkUpdates")}
          </button>
          <button type="button" className="primary" autoFocus onClick={close}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
