/**
 * Region: `updates` — 更新对话框与设置里的更新页签。键名与英文包一一对应。
 *
 * 复数键（`_one` / `_other`）两种形式都保留，哪怕中文只读取 `_other`，
 * 这样两套语言包才能逐键一致（`keys.test.ts` 会检查）。
 * 版本号、日期与安装包文件名（.dmg / .msi / .AppImage）不翻译。
 */
export const updates = {
  /** 更新对话框与设置里更新页签共用的按钮。 */
  actions: {
    checkForUpdates: "检查更新",
    downloadAndInstall: "下载并安装",
    skipVersion: "跳过此版本",
    restartNow: "立即重启",
    later: "稍后",
    continue: "继续",
  },
  /** 发现更新、正在下载、安装完成时弹出的对话框。 */
  dialog: {
    ariaLabel: "软件更新",
    available: {
      title: "CommandWave {{version}} 可供更新",
      running: "你正在运行 {{version}}",
      runningWithDate: "你正在运行 {{version}} · 发布于 {{date}}",
    },
    installed: {
      title: "更新已安装",
      body: "CommandWave {{version}} 已安装，重启后即可使用。",
    },
    confirm: {
      title: "更新到 {{version}}？",
      body_one: "更新将关闭 {{count}} 个正在运行的会话，是否继续？",
      body_other: "更新将关闭 {{count}} 个正在运行的会话，是否继续？",
    },
    noNotes: "未提供更新说明。",
    progressAria: "下载进度",
    downloading: "正在下载…",
    percent: "{{percent}}%",
  },
  /** 设置里的更新页签。 */
  settings: {
    version: {
      title: "版本",
      current: "当前版本",
    },
    /** 页签的主要分组：更新从哪里来、重启的代价是什么。 */
    main: {
      title: "更新",
      hint: "更新从 GitHub 发布页下载，重启 CommandWave 后生效，重启会结束正在运行的会话。",
    },
    checking: "正在检查…",
    downloading: "正在下载…",
    downloadingWithPercent: "正在下载… {{percent}}%",
    available: "版本 {{version}} 可供更新。",
    released: "发布于 {{date}}",
    starting: "正在开始…",
    installed: "更新已安装 — 重启后完成。",
    restarting: "正在重启…",
    upToDate: "已是最新版本，上次检查：{{when}}。",
    /** 检查按钮下方的相对时间。 */
    checked: {
      justNow: "刚刚",
      seconds: "{{count}} 秒前",
      minutes_one: "{{count}} 分钟前",
      minutes_other: "{{count}} 分钟前",
    },
    auto: {
      title: "自动检查",
      label: "自动检查更新",
      hint: "启动后不久检查一次，失败时不会提示，只有你未跳过的新版本才会通知。",
    },
    skipped: {
      title: "已跳过的版本",
      empty: "没有已跳过的版本。",
      stopAria: "不再跳过 {{version}}",
      clearAll: "全部清除",
    },
  },
  /** 更新流程本身报出的错误，对话框与页签都会显示。 */
  errors: {
    check: "无法检查更新。",
    unavailable: "当前环境不支持检查更新。",
    install: "无法安装更新。",
  },
} as const;
