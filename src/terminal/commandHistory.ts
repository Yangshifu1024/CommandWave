/**
 * Command history: records from OSC 133 marks (command text at C, exit code
 * and duration at D), queryable for the Recent Commands palette and for
 * autocomplete suggestions. Pure query helpers are unit tested.
 */

export interface CommandRecord {
  paneId: string;
  command: string;
  /** wall-clock ms, -1 when unknown (missing C mark) */
  durationMs: number;
  exitCode: number | null;
  cwd: string | null;
  /** output snippet between C and D, capped (semantic search) */
  output: string;
  at: number;
}

const MAX_RECORDS = 500;
const MAX_OUTPUT_CHARS = 4000;

const records: CommandRecord[] = [];

export function recordCommand(rec: CommandRecord): void {
  records.push({ ...rec, output: rec.output.slice(0, MAX_OUTPUT_CHARS) });
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
}

export function allCommands(): readonly CommandRecord[] {
  return records;
}

export interface HistoryQuery {
  /** substring filter over the command text */
  filter: string;
  /** include command output in the filter (semantic search) */
  includeOutput: boolean;
}

/**
 * Most-recent-first records matching the query. Empty filter returns all.
 * Matching is case-insensitive substring.
 */
export function queryCommands(
  query: HistoryQuery,
  source: readonly CommandRecord[] = records,
): CommandRecord[] {
  const needle = query.filter.trim().toLowerCase();
  const out = source.filter((r) => {
    if (!needle) return true;
    if (r.command.toLowerCase().includes(needle)) return true;
    return query.includeOutput && r.output.toLowerCase().includes(needle);
  });
  return [...out].sort((a, b) => b.at - a.at);
}

/**
 * Autocomplete suggestions: distinct commands from history that start with
 * the given prefix (case-insensitive), most frequently used first.
 */
export function suggestCommands(
  prefix: string,
  limit: number,
  source: readonly CommandRecord[] = records,
): string[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];
  const counts = new Map<string, { cmd: string; n: number; last: number }>();
  for (const r of source) {
    const cmd = r.command.trim();
    if (!cmd.toLowerCase().startsWith(p) || cmd === prefix.trim()) continue;
    const entry = counts.get(cmd) ?? { cmd, n: 0, last: 0 };
    entry.n += 1;
    entry.last = Math.max(entry.last, r.at);
    counts.set(cmd, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || b.last - a.last)
    .slice(0, limit)
    .map((e) => e.cmd);
}

/** Format a duration for the history list. */
export function formatDuration(ms: number): string {
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  return `${m}m${Math.round((ms % 60_000) / 1000)}s`;
}
