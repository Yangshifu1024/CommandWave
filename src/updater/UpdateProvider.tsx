/**
 * In-app updater state: exposes `useUpdater()` and renders the update dialog.
 *
 * Two callers share one check implementation:
 *   - the silent launch check (auto) — never surfaces errors, only notifies
 *     when the release is new and not skipped;
 *   - `checkNow()` / `requestUpdateCheck()` (manual) — failures are written to
 *     `error` so Settings can display them.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";

import i18n from "../i18n";
import { useSettingsStore } from "../store/settingsStore";
import {
  activeSessionCount,
  appVersion,
  checkForUpdate,
  FALLBACK_APP_VERSION,
  restartApp,
  type PendingUpdate,
} from "./backend";
import { errorMessage, isSkipped, nextState, shouldAutoNotify, type UpdaterEvent } from "./updateCheck";
import { UpdateDialog } from "./UpdateDialog";
import type { AvailableUpdate, UpdaterContextValue, UpdaterState } from "./index";

/** Delay before the launch check, so first paint and PTY spawn win. */
const AUTO_CHECK_DELAY_MS = 4000;

/**
 * Module-level registry of manual-check handlers, filled by the mounted
 * provider. Empty (i.e. `requestUpdateCheck()` is a no-op) while unmounted.
 */
const checkRequests = new Set<() => void>();

function registerCheckRequest(handler: () => void): () => void {
  checkRequests.add(handler);
  return () => {
    checkRequests.delete(handler);
  };
}

/**
 * Imperative "check for updates" trigger used by the menu (TitleBar). Never
 * throws — the menu dispatcher must not be broken by an update check.
 */
export function requestUpdateCheck(): void {
  for (const handler of [...checkRequests]) {
    try {
      handler();
    } catch {
      // A broken listener must not break the caller.
    }
  }
}

/** Safe no-op used when `useUpdater()` runs outside a provider. */
const fallbackContext: UpdaterContextValue = {
  currentVersion: FALLBACK_APP_VERSION,
  state: "idle",
  update: null,
  progress: null,
  error: null,
  lastCheckedAt: null,
  activeSessions: 0,
  checkNow: () => Promise.resolve(),
  install: () => Promise.resolve(),
  restart: () => Promise.resolve(),
  dismiss: () => {},
  skip: () => {},
};

const UpdaterContext = createContext<UpdaterContextValue>(fallbackContext);

/** Updater state shared by the dialog and the Settings ▸ Updates section. */
export function useUpdater(): UpdaterContextValue {
  return useContext(UpdaterContext);
}

export function UpdateProvider({ children }: { children: ReactNode }): JSX.Element {
  const [currentVersion, setCurrentVersion] = useState(FALLBACK_APP_VERSION);
  const [versionResolved, setVersionResolved] = useState(false);
  const [state, setState] = useState<UpdaterState>("idle");
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [activeSessions, setActiveSessions] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmSessions, setConfirmSessions] = useState(0);

  /** The plugin handle for the discovered release (not part of the context contract). */
  const pendingRef = useRef<PendingUpdate | null>(null);
  /** Latest known app version, readable from async callbacks. */
  const versionRef = useRef(FALLBACK_APP_VERSION);
  /** Persisted settings have been read; before that the defaults are guesses. */
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const checkInFlight = useRef(false);
  const installInFlight = useRef(false);
  /** "Later" was clicked: auto checks stay quiet for the rest of the session. */
  const dismissedThisSession = useRef(false);
  /** The user accepted tearing down running sessions for this update. */
  const sessionWarningAcked = useRef(false);

  const apply = useCallback((event: UpdaterEvent) => {
    setState((previous) => nextState(previous, event));
  }, []);

  const refreshSessions = useCallback(async (): Promise<number> => {
    const count = await activeSessionCount();
    setActiveSessions(count);
    return count;
  }, []);

  /**
   * The single check implementation. `kind` only decides what the user gets to
   * see when things go wrong: manual checks report, launch checks stay silent.
   */
  const runCheck = useCallback(
    async (kind: "auto" | "manual"): Promise<void> => {
      if (checkInFlight.current) return;
      checkInFlight.current = true;
      setError(null);
      setConfirmSessions(0);
      sessionWarningAcked.current = false;
      setDialogOpen(false);
      apply("check-start");

      try {
        const outcome = await checkForUpdate();

        if (outcome.status === "available") {
          pendingRef.current = outcome.pending;
          setUpdate(outcome.pending.info);
          // Read the live store instead of a mirrored ref: the user may have
          // skipped this version while the check was in flight.
          const { autoCheck, skippedVersions } =
            useSettingsStore.getState().settings.updates;
          const notify =
            kind === "manual" ||
            (!dismissedThisSession.current &&
              shouldAutoNotify({
                availableVersion: outcome.pending.info.version,
                currentVersion: versionRef.current,
                autoCheck,
                skippedVersions,
              }));
          if (notify) {
            apply("found");
            setDialogOpen(true);
            return;
          }
          // Silent: auto check disabled, version skipped, or already dismissed.
          pendingRef.current = null;
          setUpdate(null);
          apply("none");
          return;
        }

        pendingRef.current = null;
        setUpdate(null);
        if (outcome.status === "error" && kind === "manual") {
          setError(errorMessage(outcome.error, i18n.t("updates.errors.check")));
          apply("fail");
          return;
        }
        if (outcome.status === "unavailable" && kind === "manual") {
          setError(i18n.t("updates.errors.unavailable"));
          apply("fail");
          return;
        }
        // "none" (up to date) and every silent failure land here: no error text,
        // no dialog — the state simply returns to idle.
        apply("none");
      } finally {
        setLastCheckedAt(Date.now());
        checkInFlight.current = false;
      }
    },
    [apply],
  );

  const runCheckRef = useRef(runCheck);
  useEffect(() => {
    runCheckRef.current = runCheck;
  }, [runCheck]);

  const checkNow = useCallback(async (): Promise<void> => {
    await runCheckRef.current("manual");
  }, []);

  const install = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current;
    if (!pending || installInFlight.current) return;
    installInFlight.current = true;
    try {
      // Sessions are re-counted right before installing: a restart ends them.
      const sessions = await refreshSessions();
      if (sessions > 0 && !sessionWarningAcked.current) {
        setConfirmSessions(sessions);
        setDialogOpen(true);
        return;
      }
      setConfirmSessions(0);
      setError(null);
      setDialogOpen(true);
      apply("install-start");
      setProgress(0);
      const outcome = await pending.install(setProgress);
      setProgress(null);
      if (outcome.ok) {
        apply("install-done");
      } else {
        setError(errorMessage(outcome.error, i18n.t("updates.errors.install")));
        apply("fail");
      }
    } finally {
      installInFlight.current = false;
    }
  }, [apply, refreshSessions]);

  const restart = useCallback(async (): Promise<void> => {
    await restartApp();
  }, []);

  const dismiss = useCallback((): void => {
    // A download in flight keeps its progress UI: hiding it would leave no way
    // to see what is happening, and "Later" would suppress the auto prompt even
    // though the update is already on its way.
    if (state === "downloading") return;
    // "Later" is a session-only decision: auto checks stop prompting, manual
    // checks (and the next launch) still offer the update.
    dismissedThisSession.current = true;
    sessionWarningAcked.current = false;
    setConfirmSessions(0);
    setDialogOpen(false);
    apply("dismiss");
  }, [apply, state]);

  const skip = useCallback((): void => {
    const version = pendingRef.current?.info.version ?? update?.version ?? null;
    if (version) {
      useSettingsStore.getState().update((draft) => {
        if (!isSkipped(version, draft.updates.skippedVersions)) {
          draft.updates.skippedVersions.push(version);
        }
      });
    }
    // "Skip This Version" is scoped to that version only: the persisted list
    // keeps it quiet across launches, while a later release still notifies. It
    // deliberately does *not* set `dismissedThisSession`, which is "Later".
    sessionWarningAcked.current = false;
    pendingRef.current = null;
    setConfirmSessions(0);
    setDialogOpen(false);
    setUpdate(null);
    apply("dismiss");
  }, [apply, update]);

  const confirmSessionInstall = useCallback((): void => {
    sessionWarningAcked.current = true;
    setConfirmSessions(0);
    void install();
  }, [install]);

  const cancelSessionInstall = useCallback((): void => {
    setConfirmSessions(0);
  }, []);

  // Current app version, compared against the release before notifying.
  useEffect(() => {
    let cancelled = false;
    void appVersion().then((version) => {
      if (cancelled) return;
      versionRef.current = version;
      setCurrentVersion(version);
      setVersionResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Silent launch check. Waiting for the persisted settings and the app version
  // matters: before they arrive `autoCheck` is the default `true` and the
  // version is the `0.0.0` placeholder, so the decision to notify would be made
  // against guesses (and would ignore a skipped version or a disabled switch).
  useEffect(() => {
    if (!settingsLoaded || !versionResolved) return;
    const timer = window.setTimeout(() => {
      void runCheckRef.current("auto");
    }, AUTO_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [settingsLoaded, versionResolved]);

  // Manual checks requested imperatively (menu item, Settings button).
  useEffect(() => {
    return registerCheckRequest(() => {
      void runCheckRef.current("manual");
    });
  }, []);

  // Opening the dialog refreshes the live session count it warns about.
  useEffect(() => {
    if (!dialogOpen) return;
    void refreshSessions();
  }, [dialogOpen, refreshSessions]);

  const value = useMemo<UpdaterContextValue>(
    () => ({
      currentVersion,
      state,
      update,
      progress,
      error,
      lastCheckedAt,
      activeSessions,
      checkNow,
      install,
      restart,
      dismiss,
      skip,
    }),
    [
      currentVersion,
      state,
      update,
      progress,
      error,
      lastCheckedAt,
      activeSessions,
      checkNow,
      install,
      restart,
      dismiss,
      skip,
    ],
  );

  return (
    <UpdaterContext.Provider value={value}>
      {children}
      <UpdateDialog
        open={dialogOpen}
        confirmSessions={confirmSessions}
        onConfirmSessions={confirmSessionInstall}
        onCancelSessions={cancelSessionInstall}
      />
    </UpdaterContext.Provider>
  );
}
