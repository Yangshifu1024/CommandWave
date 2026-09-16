/**
 * Color-scheme reporting: DECSET 2031 plus CSI ? 996 n / CSI ? 997 ; Ps n.
 *
 * The OSC 11 background query is answered once, so a long-running TUI
 * (opencode, neovim, …) can never learn that the user flipped the app theme
 * while it was running. Terminals solve that with a subscription: the program
 * sets DECSET 2031, and the terminal then *pushes* CSI ? 997 ; 1 n (dark) or
 * CSI ? 997 ; 2 n (light) on every polarity change, while CSI ? 996 n asks for
 * the current polarity. iTerm2, kitty and Ghostty implement it; xterm.js —
 * which CommandWave renders with — does not, so the protocol lives here.
 *
 * Everything in this module is pure: the byte strings and the edge-trigger
 * rule are unit-testable without an xterm instance.
 */

/** DECSET/DECRST mode a program sets to subscribe to polarity reports. */
export const COLOR_SCHEME_REPORT_MODE = 2031;
/** CSI ? 996 n — "which polarity are you using right now?" */
export const COLOR_SCHEME_QUERY = 996;
/** CSI ? 997 ; Ps n — the terminal's polarity report. */
export const COLOR_SCHEME_STATUS = 997;
/** Ps values of the CSI ? 997 report. */
export const COLOR_SCHEME_DARK = 1;
export const COLOR_SCHEME_LIGHT = 2;

/** CSI parameter list as xterm.js hands it to a registered handler. */
export type CsiParams = (number | number[])[];

/**
 * Primary parameter of a CSI sequence: the leading number, or the first
 * sub-parameter when the sequence used the colon form. Null when the
 * parameter list is empty.
 */
export function primaryParam(params: CsiParams): number | null {
  const first = params[0];
  if (typeof first === "number") return first;
  if (Array.isArray(first) && typeof first[0] === "number") return first[0];
  return null;
}

/** Whether a `CSI ? Ps h` / `CSI ? Ps l` parameter switches report mode. */
export function isColorSchemeReportMode(params: CsiParams): boolean {
  return primaryParam(params) === COLOR_SCHEME_REPORT_MODE;
}

/** Whether a `CSI ? Ps n` parameter asks for the current polarity. */
export function isColorSchemeQuery(params: CsiParams): boolean {
  return primaryParam(params) === COLOR_SCHEME_QUERY;
}

/** The CSI ? 997 report string for a polarity. */
export function colorSchemeReport(dark: boolean): string {
  return dark
    ? `\x1b[?${COLOR_SCHEME_STATUS};${COLOR_SCHEME_DARK}n`
    : `\x1b[?${COLOR_SCHEME_STATUS};${COLOR_SCHEME_LIGHT}n`;
}

/**
 * The report to write for a polarity, or null when there is nothing to say:
 * the program never subscribed (`watched` false), or it already knows this
 * polarity. Reports are edge-triggered — a font-size change or switching
 * between two same-polarity themes must stay silent.
 *
 * Callers record `dark` as the new reported polarity whenever this returns a
 * non-null report.
 */
export function schemeReport(
  watched: boolean,
  reportedDark: boolean | null,
  dark: boolean,
): string | null {
  if (!watched) return null;
  if (reportedDark === dark) return null;
  return colorSchemeReport(dark);
}
