/**
 * Region: `terminal` — in-terminal banners and OS notification texts.
 *
 * Rules for whoever owns this region:
 * - English pack is the reference: every key added here must exist in `zh-CN` too.
 * - Never translate terminal output, command echoes, paths or host names.
 * - Dynamic values use i18next interpolation (`{{count}}`), never string concat.
 */
export const terminal = {
  copyMode: {
    banner: "COPY MODE · hjkl/↑↓ move · ⌃/⌥f/b page · v select · y copy · q quit",
  },
  broadcast: {
    banner: "BROADCAST INPUT — keystrokes go to every pane (toggle to disable)",
  },
  shell: {
    startFailed: "Failed to start shell: {{error}}",
    processCompleted: "[Process completed (exit code {{exitCode}})]",
  },
  image: {
    sixelTitle: "sixel image",
  },
  notify: {
    commandFinished: "Command finished",
    commandFailed: "Command failed (exit {{exitCode}})",
    triggerFired: "Trigger fired",
    /** Must stay identical to the default `param` of `trigger-password`. */
    passwordPromptDefault: "Password prompt detected",
    agentNeedsYou: "{{title}} needs you",
    agentErrored: "{{title}} errored",
    agentFinished: "{{title}} finished",
  },
} as const;
