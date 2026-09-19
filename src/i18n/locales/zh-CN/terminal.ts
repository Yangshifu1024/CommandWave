/** Region: `terminal` — 终端内的提示横幅与系统通知文字。键名与英文包一一对应。 */
export const terminal = {
  copyMode: {
    banner: "复制模式 · hjkl/↑↓ 移动 · ⌃/⌥f/b 翻页 · v 选择 · y 复制 · q 退出",
  },
  broadcast: {
    banner: "广播输入 — 按键会发送到每个窗格（再次切换可关闭）",
  },
  shell: {
    startFailed: "无法启动 Shell：{{error}}",
    processCompleted: "[进程已结束（退出码 {{exitCode}}）]",
  },
  image: {
    sixelTitle: "Sixel 图像",
  },
  notify: {
    commandFinished: "命令已完成",
    commandFailed: "命令失败（退出码 {{exitCode}}）",
    triggerFired: "触发器已触发",
    passwordPromptDefault: "检测到密码提示",
    agentNeedsYou: "{{title}} 需要你",
    agentErrored: "{{title}} 出错",
    agentFinished: "{{title}} 已完成",
  },
} as const;
