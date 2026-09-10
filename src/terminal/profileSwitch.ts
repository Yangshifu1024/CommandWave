/**
 * Profile auto-switch: rules that map the OSC 7-reported hostname to a
 * profile, re-theming panes that report a matching host (e.g. ssh sessions
 * with remote shell integration).
 */

export interface AutoSwitchRule {
  /** glob (with *) or plain substring matched against the OSC 7 host */
  hostPattern: string;
  profileId: string;
}

/** Glob-or-substring match for hostnames. */
export function matchHostRule(host: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase();
  const h = host.trim().toLowerCase();
  if (!p || !h) return false;
  if (p.includes("*")) {
    const re = new RegExp(
      `^${p.split("*").map(escapeRe).join(".*")}$`,
    );
    return re.test(h);
  }
  return h.includes(p);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** First rule whose pattern matches the host, or null. */
export function pickProfileForHost(
  host: string,
  rules: AutoSwitchRule[],
): AutoSwitchRule | null {
  for (const rule of rules) {
    if (matchHostRule(host, rule.hostPattern)) return rule;
  }
  return null;
}
