# CommandWave Roadmap

以 iTerm2 为对标，按优先级分阶段补齐功能。每个阶段的目标是：完成后
CommandWave 在该领域达到「日常可完全替代 iTerm2」的水平。

状态标记：✅ 已完成 · 🚧 进行中 · ⬜ 未开始 · ⚠️ 部分完成/简化实现

> 2026-09 更新：Phase 1–5 与 Phase 6/6.5 的主体功能已实现（commit
> `1c43326`…`c799eb1`）。以下如实标注了简化实现与暂缓项。
>
> 2026-09 追加：应用内自动更新已落地（Tauri updater + CI 产出签名更新包与
> `latest.json`，启动静默检查 + 设置页/菜单手动入口）。发版与更新机制见
> README「Auto-update」与 `.agents/skills/commandwave-release/SKILL.md`。

---

## Phase 1 — 核心终端体验（最高优先级）✅

| 功能 | 状态 | 说明 |
|---|---|---|
| Copy Mode | ✅ | ⇧⌘C 进入行导向键盘导航（hjkl/翻页/v 选区/y 复制/q 退出），高亮 + 横幅提示 |
| 矩形选择 (⌥ 拖拽) | ✅ | 列块高亮 + 复制，宽字符安全 |
| 智能复制 | ✅ | 随矩形选择/Copy Mode 提供；逐行 trim |
| 搜索增强 | ✅ | 匹配计数、全量高亮、⌘G 跳下一个（跨标签全局查询） |
| 鼠标上报透传 | ✅ | xterm.js 原生支持（less/vim/htop 滚轮点击透传），随 MVP 已具备 |
| 大段/多行粘贴警告 | ✅ | 多行 / 超大 / 危险命令（rm -rf 等）确认对话框，可关闭 |
| 会话内字体缩放 | ✅ | ⌘+ / ⌘- / ⌘0，持久化 ui.fontSizeDelta |
| Sixel / 图片协议 (imgcat) | ⚠️ | imgcat (OSC 1337) 与 Sixel (DCS q) 均解码显示于 pane 右上浮动图片托盘；xterm.js 无内联图片渲染器，图片不占行内位置 |

## Phase 2 — 触发器与自动化 ✅

| 功能 | 状态 | 说明 |
|---|---|---|
| Triggers | ✅ | 正则匹配输出 → 高亮 / 通知 / 发声 / 发送文本，Settings → Automation 管理 |
| 密码提示捕获 | ✅ | 内置默认触发器（password/passphrase 提示 → OS 通知） |
| 自动回复 (Automatic Answer) | ✅ | 提示语正则 → 自动回答回车 |
| 自动会话日志 | ✅ | Rust 侧 tee 每会话输出到独立日志文件，目录可配置 |
| 命令完成通知 | ✅ | 已有（≥2s + 失焦） |

## Phase 3 — 外观与终端配置 ✅

> 2026-09：profile 概念已移除——原 per-profile 设置（shell、起始目录、
> 字体、主题、光标、滚动行数、背景、badge、环境变量）全部
> 扁平化为全局设置；设置页改为按 Terminal / Appearance / Keyboard /
> Session / Automation / Integrations / Secrets 分 tab 展示。旧
> settings.json 中默认 profile 的取值会在加载时自动迁移到全局字段。
> 随之移除：Profile 自动切换、Dynamic Profiles（profiles/*.json 合并）、
> 每 profile 按键覆盖、SSH 配置导入（ssh_hosts 命令）。

| 功能 | 状态 | 说明 |
|---|---|---|
| 自定义配色编辑器 | ✅ | 21 个颜色槽逐项覆盖；✅ 导入 iTerm2 .itermcolors（XML plist 解析器带测试；修复了真实 iTerm2 导出因色块内 `Alpha Component`/`Color Space` 键而整份失效或大面积静默丢色的 bug） |
| 内置配色方案 | ✅ | 42 款（26 暗 + 16 亮），设置页按暗/亮分档；每款登记上游项目与许可证（`THIRD-PARTY-NOTICES.md`），`themes.test.ts` 守住命名唯一/颜色格式/极性/对比度/许可白名单；4 款旧主题因许可证问题下线（Nord→Nordfox 别名迁移，无同族则回退默认） |
| 光标样式与闪烁配置 | ✅ | block/bar/underline + blink/steady |
| 字体进阶设置 | ⚠️ | 行高、字间距已实现；连字 (ligatures) 需 xterm.js 渲染器支持（WebGL 不支持，Node-only addon），暂缺 |
| 透明度与模糊 | ⚠️ | 背景图 + 图片透明度（无需 OS 透明，Windows 验证）；桌面级透明默认关闭——Windows DWM 在透明 WebView2 窗口右缘产生 2-3px 白线（实测复现/修复对照），需在 tauri.conf 开 transparent 后可用，纯透明设置在不透明窗口下自动降级为不透明（防止白底） |
| 全局终端设置 | ✅ | 滚动行数、环境变量、badge（Settings → Terminal） |
| Profile 自动切换 | ⬜ | 已随 profile 概念移除 |
| Dynamic Profiles | ⬜ | 已随 profile 概念移除 |
| Badge | ✅ | {cwd}/{duration} 占位符，右下角覆盖层 |

## Phase 4 — 分屏、标签与窗口管理 ✅

| 功能 | 状态 | 说明 |
|---|---|---|
| 按方向导航 pane | ✅ | ⌘⌥+方向键，由布局树推导几何（paneNav 纯函数带测试） |
| Pane 临时最大化 | ✅ | ⇧⌘Enter |
| Broadcast 输入 | ✅ | 全部 pane 同步输入 + 视觉横幅 |
| Arrangements | ✅ | 命名保存/恢复窗口布局（Settings → Session） |
| 会话恢复 | ✅ | 布局自动保存，启动时恢复（pane id 重映射，快照模块带测试） |
| 拖出 pane 成新窗口 | ✅ | 右键/Shell 菜单 "Move Pane to New Window"：Rust 侧 Session 持有可替换的输出路由（pty_attach），子窗口以 ?detach= 参数只渲染被迁移的 pane，原窗口移除 pane 但不杀 PTY。注意：回滚缓冲不随迁移（新窗口从 attach 时刻接收输出） |
| Exposé 总览 | ⚠️ | 简化为列表式 pane 选择器（⇧⌘E），无缩略图渲染 |
| 标签固定 / 命名 | ✅ | ⌘I 重命名、🔒 锁定防误关 |

## Phase 5 — Shell Integration 深度功能 ✅

| 功能 | 状态 | 说明 |
|---|---|---|
| 命令耗时显示 | ✅ | Recent Commands 面板列 + badge {duration} 占位符（命令完成时实时刷新） |
| Recent Commands (⌘;) | ✅ | 命令/耗时/退出码/cwd 列表，过滤，Enter 重跑 |
| Autocomplete 弹窗 | ⚠️ | 基于历史的提示符补全（Alt+1..3/点击接受）；fuzzy/参数级补全暂缓 |
| 命令历史搜索 (⌘;) | ✅ | 同 Recent Commands 面板 |
| 语义历史搜索 (⌥⌘;) | ✅ | 面板内可勾选"含输出搜索"（记录每命令输出片段） |
| 点击命令输出跳转 | ✅ | OSC 133 提示跳转（已有 ⌘↑/↓）；逐命令块点击跳转暂缓 |

## Phase 6 — 集成与生态 ⚠️

| 功能 | 状态 | 说明 |
|---|---|---|
| ⌘点击文件路径 | ✅ | 识别路径（含 :line:col），用 settings.editorCommand（如 `code {file}`）打开 |
| tmux 控制模式 | ⚠️ | Shell 菜单 "Attach tmux Session…"（`tmux -CC new -A`）：解析 %output/%layout-change/%window-add|close/%window-renamed/%session-changed/%pane-mode-changed/%exit，tmux 布局树映射为 CommandWave 分屏（tmux-%N pane），输入经 send-keys 双向同步、尺寸经 resize-pane 同步，关标签即 kill-window。协议解析/布局解析/输入映射全部带单元测试。未做：tmux copy-mode/-pane 专用 UI、%begin 命令输出展示、滚动历史回传 |
| Python API / 脚本化 | ⚠️ | 本地脚本 API：127.0.0.1 HTTP JSON（GET /panes、POST /write、POST /new-tab、GET /health），端口+token 写入 api.json 供 Python/curl 发现；非 iTerm2 式 in-process Python API |
| CPU / 内存指示 | ⬜ | 已移除（原生读数对终端用户价值低；连带删除 `system_stats` 命令与 `sysinfo` 依赖） |
| SSH 配置文件集成 | ⬜ | 已随 profile 概念移除（原为导入 ~/.ssh/config 生成 SSH profiles） |
| 密码 / API Key 管理器 | ⚠️ | 基础版：AES-GCM + PBKDF2(250k) 客户端加密 vault（Rust 仅存密文），主密码不落盘；触发器/自动回复 send-text 支持 {secret:name} 引用（引用解析带测试）；未做浏览器集成/自动填充 |
| 进度条 escape 序列 | ✅ | OSC 9;4 → Windows 任务栏进度条 + macOS Dock 徽标数字 |
| 明暗主题同步（color scheme reporting） | ⚠️ | TUI 用 DECSET 2031 订阅后，切主题时手推送 `CSI ? 997;1n`（暗）/ `;2n`（明），`CSI ? 996 n` 查询即应答（xterm.js 不实现该协议，在 `src/terminal/colorScheme.ts` + TerminalPane 的 parser handler 层自行接管，带单元测试）；未覆盖 tmux 镜像 pane |
| Instant Replay | ⚠️ | ⌥⌘B（Ctrl/Cmd+Alt+B）：每 pane 10 秒快照（10 分钟历史）+ 时间滑杆回放只读视图；非全缓冲时间旅行 |

## Phase 6.5 — Starship 整合 ⬜ 已移除

> 2026-09-11：starship 集成整体移除——检测、preset 画廊、starship.toml
> 编辑器、捆绑下载脚本（scripts/fetch-starship.mjs）与 `useStarship`
> 设置全部删除；旧 settings.json 中的 `useStarship` 键在加载时被
> serde 静默忽略。提示符回归 shell 自身。

## Phase 7 — 传统 Prompt 与 Shell 集成 ✅

> 2026-09-11：自研的 Warp 式块模型 prompt（原生输入卡片、prompt 分段
> 自定义、`prompt.focus`（⌘L）、Rust `env_info` 环境检测）同日加入又
> 移除（commit `34a91a2` → `268a56c`），应用回归 iTerm2 式经典终端：
> shell 自身的 prompt（starship/oh-my-zsh 等）原样显示，键盘输入直接经
> xterm.js → PTY 由 shell 处理。旧 settings.json 中的 `prompt` 段在加载
> 时被清除并回写（见 `settings.rs` 兼容逻辑与回归测试）。

| 功能 | 状态 | 说明 |
|---|---|---|
| 经典 shell prompt | ✅ | 不注入、不隐藏用户 prompt；fish/nu 等同样保持原样 |
| OSC 7 / 133 注入 | ✅ | zsh 经 ZDOTDIR 链、bash 经 PROMPT_COMMAND/PS0 自动注入；`TERM_PROGRAM == "CommandWave"` 守卫，嵌套 shell/其他终端不受影响 |
| PowerShell 集成 | ✅ | `-NoExit -Command` 注入 `Prompt`/`PSConsoleHostReadLine` 包装（保留用户 prompt），发 OSC 7 + 133 A/C/D；不碰 `$PROFILE` |
| 命令历史与耗时 | ✅ | 基于 OSC 133 的 Recent Commands（⌘;）、命令时长、退出码高亮、⌘↑/⌘↓ 提示符跳转、Copy Last Output |

## 暂不做 / 需要论证

- **Natural Language Editing (⌘.)** — 依赖大量 macOS 平台能力
- **拼写检查** — 现代 spell-check API 可后补，非核心
- **Metal 渲染器** — 已有 WebGL，xterm.js 性能够用

---

## 里程碑口径

- **M1（替代日常使用）**：✅ Phase 1 + 2 完成（图片以浮动托盘显示，非行内）
- **M2（替代配置控）**：✅ Phase 3 完成（连字除外——渲染器限制）
- **M3（替代重度用户）**：✅ Phase 4 + 5 完成（拖出 pane、缩略图 Exposé 除外）
- **M4（生态对标）**：⚠️ Phase 6/6.5 主体完成（脚本 API 为本地 HTTP；tmux 控制模式为唯一暂缓项）
