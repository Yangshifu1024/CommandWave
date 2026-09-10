/**
 * Detached pane windows: a pane moved to its own window passes its identity
 * through the URL (?detach=<base64 JSON>); this module decodes it at boot,
 * before any store or terminal exists.
 */

export interface DetachedPaneInfo {
  paneId: string;
  ptyId: number;
  cwd: string | null;
  shell: string | null;
  profileId: string | null;
}

export function encodeDetachParam(info: DetachedPaneInfo): string {
  const json = JSON.stringify(info);
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(json)));
  return encodeURIComponent(json);
}

export function decodeDetachParam(param: string): DetachedPaneInfo | null {
  try {
    const json =
      param.includes("%") && !param.endsWith("=")
        ? decodeURIComponent(param)
        : decodeURIComponent(escape(atob(param)));
    const parsed = JSON.parse(json);
    if (
      typeof parsed?.paneId === "string" &&
      typeof parsed?.ptyId === "number"
    ) {
      return {
        paneId: parsed.paneId,
        ptyId: parsed.ptyId,
        cwd: parsed.cwd ?? null,
        shell: parsed.shell ?? null,
        profileId: parsed.profileId ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** The detached pane this webview window hosts, or null in the main window. */
export const detachedPane: DetachedPaneInfo | null = (() => {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("detach");
  return param ? decodeDetachParam(param) : null;
})();
