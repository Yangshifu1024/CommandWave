# CommandWave Roadmap

以 iTerm2 为对标，按优先级分阶段补齐功能。每个阶段的目标是：完成后
CommandWave 在该领域达到「日常可完全替代 iTerm2」的水平。

状态标记：✅ 已完成 · 🚧 进行中 · ⬜ 未开始 · ⚠️ 部分完成/简化实现

> 2026-09 更新：Phase 1–5 与 Phase 6/6.5 的主体功能已实现（commit
> `1c43326`…`c799eb1`）。以下如实标注了简化实现与暂缓项。

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
| Sixel / 图片协议 (imgcat) | ⬜ | 暂缓：xterm.js 无内联图片渲染，需自研 addon，收益/成本比低 |

## Phase 2 — 触发器与自动化 ✅

| 功能 | 状态 | 说明 |
|---|---|---|
| Triggers | ✅ | 正则匹配输出 → 高亮 / 通知 / 发声 / 发送文本，Settings → Automation 管理 |
| 密码提示捕获 | ✅ | 内置默认触发器（password/passphrase 提示 → OS 通知） |
| 自动回复 (Automatic Answer) | ✅ | 提示语正则 → 自动回答回车 |
| 自动会话日志 | ✅ | Rust 侧 tee 每会话输出到独立日志文件，目录可配置 |
| 命令完成通知 | ✅ | 已有（≥2s + 失焦） |

## Phase 3 — Profile 与外观配置 ✅

| 功能 | 状态 | 说明 |
|---|---|---|
| 自定义配色编辑器 | ✅ | 21 个颜色槽逐项覆盖；✅ 导入 iTerm2 .itermcolors（XML plist 解析器带测试） |
| 光标样式与闪烁配置 | ✅ | block/bar/underline + blink/steady |
| 字体进阶设置 | ⚠️ | 行高、字间距已实现；连字 (ligatures) 受 xterm.js WebGL 渲染器限制暂缺 |
| 透明度与模糊 | ⚠️ | 背景不透明度（allowTransparency + rgba 合成）已实现；窗口级透明/背景图暂缺（需各平台窗口 API 支持） |
| Profile 完整化 | ⚠️ | 滚动行数、环境变量、badge、starship 开关已实现；每 profile 按键覆盖暂缓 |
| Profile 自动切换 | ⬜ | 暂缓（需检测远程会话，依赖 shell integration 扩展） |
| Dynamic Profiles | ⬜ | 暂缓 |
| Badge | ✅ | {cwd}/{profile} 占位符，右下角覆盖层 |

## Phase 4 — 分屏、标签与窗口管理 ✅

| 功能 | 状态 | 说明 |
|---|---|---|
| 按方向导航 pane | ✅ | ⌘⌥+方向键，由布局树推导几何（paneNav 纯函数带测试） |
| Pane 临时最大化 | ✅ | ⇧⌘Enter |
| Broadcast 输入 | ✅ | 全部 pane 同步输入 + 视觉横幅 |
| Arrangements | ✅ | 命名保存/恢复窗口布局（Settings → Session） |
| 会话恢复 | ✅ | 布局自动保存，启动时恢复（pane id 重映射，快照模块带测试） |
| 拖出 pane 成新窗口 | ⬜ | 暂缓（需要多窗口 Tauri 支持） |
| Exposé 总览 | ⚠️ | 简化为列表式 pane 选择器（⇧⌘E），无缩略图渲染 |
| 标签固定 / 命名 | ✅ | ⌘I 重命名、🔒 锁定防误关 |

## Phase 5 — Shell Integration 深度功能 ✅

| 功能 | 状态 | 说明 |
|---|---|---|
| 命令耗时显示 | ⚠️ | 记录并显示于 Recent Commands 面板；提示行内嵌显示暂缺 |
| Recent Commands (⌘;) | ✅ | 命令/耗时/退出码/cwd 列表，过滤，Enter 重跑 |
| Autocomplete 弹窗 | ⚠️ | 基于历史的提示符补全（Alt+1..3/点击接受）；无 fuzzy/参数级补全 |
| 命令历史搜索 (⌘;) | ✅ | 同 Recent Commands 面板 |
| 语义历史搜索 (⌥⌘;) | ✅ | 面板内可勾选"含输出搜索"（记录每命令输出片段） |
| 点击命令输出跳转 | ✅ | OSC 133 提示跳转（已有 ⌘↑/↓）；逐命令块点击跳转暂缓 |

## Phase 6 — 集成与生态 ⚠️

| 功能 | 状态 | 说明 |
|---|---|---|
| ⌘点击文件路径 | ✅ | 识别路径（含 :line:col），用 settings.editorCommand（如 `code {file}`）打开 |
| tmux 控制模式 | ⬜ | 暂缓（工程量大） |
| Python API / 脚本化 | ⬜ | 暂缓 |
| CPU / 内存指示 | ✅ | 侧栏底部 CPU/RAM 百分比（sysinfo，3s 轮询） |
| SSH 配置文件集成 | ✅ | 一键导入 ~/.ssh/config 生成 SSH profiles（Rust 解析器带测试） |
| 密码 / API Key 管理器 | ⬜ | 暂缓（涉及安全设计） |
| 进度条 escape 序列 | ⚠️ | OSC 9;4 → Windows 任务栏进度条；macOS Dock / 标签页进度暂缺 |
| Instant Replay | ⬜ | 原 Phase 1 外补充项，暂缓 |

## Phase 6.5 — Starship 整合 ⚠️

| 功能 | 状态 | 说明 |
|---|---|---|
| Starship 检测 + 一键启用 | ⚠️ | Settings → Integrations 检测安装；profile 级 ⌾starship 开关，zsh 经 ZDOTDIR 链自动 init；bash/fish/PowerShell 需手动（见 README） |
| 官方 preset 画廊 | ✅ | preset 列表 + 一键写入 starship.toml |
| starship.toml 图形化编辑器 | ⬜ | 暂缓 |
| 内置分发 (sidecar) | ⬜ | 暂缓（包体 + 三平台二进制维护成本） |
| OSC 133 兼容性测试 | ✅ | starship 只替换 PS1，precmd 钩子由我们注入，功能不受影响；单元测试覆盖标记解析 |

## 暂不做 / 需要论证

- **Natural Language Editing (⌘.)** — 依赖大量 macOS 平台能力
- **拼写检查** — 现代 spell-check API 可后补，非核心
- **Metal 渲染器** — 已有 WebGL，xterm.js 性能够用

---

## 里程碑口径

- **M1（替代日常使用）**：✅ Phase 1 + 2 完成（sixel 除外）
- **M2（替代配置控）**：✅ Phase 3 完成（连字/窗口级透明除外）
- **M3（替代重度用户）**：✅ Phase 4 + 5 完成（拖出 pane、缩略图 Exposé 除外）
- **M4（生态对标）**：⚠️ Phase 6/6.5 主体完成，tmux/Python API/sidecar 暂缓
