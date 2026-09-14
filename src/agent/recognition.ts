/**
 * Agent recognition (Tier 1, zero-config): decide whether a pane is running a
 * known CLI coding agent by looking at the command line captured at the
 * OSC 133 `C` mark.
 *
 * The captured line is the whole prompt line (shell prompt included), so we
 * scan every whitespace token's basename against a known-binary table rather
 * than trusting the first or last token. The Rust `agent` module owns the
 * installer side; this list is the frontend recognition mirror.
 */

export interface AgentDef {
  id: string;
  label: string;
  /** Binary basenames (lowercase, without extension). */
  binaries: string[];
}

export const AGENT_LIST: AgentDef[] = [
  { id: "claude", label: "Claude Code", binaries: ["claude"] },
  { id: "codex", label: "Codex CLI", binaries: ["codex"] },
  { id: "gemini", label: "Gemini CLI", binaries: ["gemini"] },
  { id: "opencode", label: "OpenCode", binaries: ["opencode"] },
  { id: "aider", label: "aider", binaries: ["aider"] },
  { id: "cursor", label: "Cursor CLI", binaries: ["cursor-agent", "agent"] },
  { id: "copilot", label: "GitHub Copilot CLI", binaries: ["copilot"] },
  { id: "kimi", label: "Kimi CLI", binaries: ["kimi", "kimi-code"] },
  { id: "crush", label: "Crush", binaries: ["crush"] },
  { id: "grok", label: "Grok CLI", binaries: ["grok"] },
  { id: "antigravity", label: "Antigravity", binaries: ["agy"] },
  { id: "amp", label: "Amp", binaries: ["amp"] },
  { id: "pi", label: "Pi", binaries: ["pi"] },
];

/** Wrappers that precede the real command (`sudo claude`, `env FOO=1 claude`). */
const WRAPPERS = new Set(["sudo", "env", "command", "npx", "pnpx", "bunx", "pnpm", "yarn", "bun"]);

/**
 * A shell-prompt token (`user@host`, `~`, `%`, `$`, `❯`, `C:\proj>`). The
 * captured line includes the prompt, so the command starts after the last
 * such token — otherwise we would mistake a prompt word for the command.
 */
function isPromptToken(token: string): boolean {
  if (token.startsWith("-")) return false;
  return /[@#$%>❯λ]/.test(token);
}

/** `FOO=bar` environment assignment (skipped while hunting the command). */
function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/** Final path component of a token, unquoted and extension-stripped. */
export function binaryBasename(token: string): string {
  let t = token.trim().replace(/^["']+/, "").replace(/["']+$/, "");
  const slash = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
  if (slash >= 0) t = t.slice(slash + 1);
  return t.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
}

/**
 * The agent whose binary starts the captured command, or null. The line
 * includes the shell prompt, so we locate the command position (after the
 * last prompt-like token) and skip wrappers / env assignments / flags rather
 * than scanning every token — which would match a word inside an argument.
 */
export function matchAgent(promptLine: string): AgentDef | null {
  if (!promptLine || !promptLine.trim()) return null;
  const tokens = promptLine.trim().split(/\s+/);
  let start = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isPromptToken(tokens[i])) {
      start = i + 1;
      break;
    }
  }
  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith("-") || isEnvAssignment(token)) continue;
    const base = binaryBasename(token);
    if (!base || WRAPPERS.has(base)) continue;
    const hit = AGENT_LIST.find((a) => a.binaries.includes(base));
    return hit ?? null;
  }
  return null;
}

/** Agent definition by id. */
export function agentById(id: string | null | undefined): AgentDef | null {
  if (!id) return null;
  return AGENT_LIST.find((a) => a.id === id) ?? null;
}
