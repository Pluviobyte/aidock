# aidock

**Human-routed multi-AI CLI orchestration framework**

Assign tasks to Claude Code, Codex CLI, and Gemini CLI from a single interface. You decide which AI handles what — aidock handles the context handoff between them.

[English](#overview) | [中文](#概述)

---

## Overview

Most multi-AI frameworks try to automatically route tasks between models. aidock takes a different approach: **you make the routing decisions**, and the framework provides structured handoff documents so each AI picks up exactly where the last one left off.

### Why aidock?

- **Human routing** — You assign tasks to specific AIs. No black-box routing logic.
- **Structured handoff** — Context is passed between AIs via structured documents, not raw file dumps.
- **Visual dashboard** — Web panel shows task status, agent availability, and handoff chains.
- **Plug and play** — Auto-detects installed CLIs. Zero config to start.
- **Lightweight** — 2 runtime dependencies. No database. JSON file storage.

### How it works

```
You assign a task          aidock runs it             You hand off to next AI
      |                         |                            |
      v                         v                            v
aidock assign claude       claude -p "..."            aidock handoff t_xxx codex
  "design the API"         (subprocess)                (generates handoff doc)
                                                             |
                                                             v
                                                      codex exec "..."
                                                      (with handoff context)
```

## Installation

```bash
git clone https://github.com/Pluviobyte/aidock.git
cd aidock
npm install
npm run build
```

Link globally (optional):

```bash
npm link
```

### Prerequisites

At least one of these CLIs must be installed:

| CLI | Install |
|-----|---------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` |
| Codex CLI | `npm install -g @openai/codex` |
| Gemini CLI | `npm install -g @anthropic-ai/gemini-cli` |

## Quick Start

```bash
# Check which AIs are available
aidock detect

# Initialize in your project
cd your-project
aidock init

# Assign a task
aidock assign claude "Design the database schema for a blog app"

# Hand off the result to another AI
aidock handoff t_abc123 codex --notes "Focus on the User model"

# Check status
aidock status

# Open the web dashboard
aidock serve
```

## Commands

| Command | Description |
|---------|-------------|
| `aidock init` | Initialize `.aidock/` in current project |
| `aidock detect` | Show installed CLIs and versions |
| `aidock assign <agent> "<prompt>"` | Assign a task to claude, codex, or gemini |
| `aidock handoff <taskId> <toAgent>` | Hand off a completed task to another agent |
| `aidock status` | Show all tasks and their states |
| `aidock history` | Show task and handoff timeline |
| `aidock serve [--port 3457]` | Start the web dashboard |

### assign options

```
--timeout <seconds>   Execution timeout (default: 300)
--model <model>       Override the default model
--no-context          Skip automatic git context injection
--verbose             Show stderr output
```

### handoff options

```
--notes <text>        Additional context for the receiving agent
--prompt <text>       Override the default handoff prompt
--dry-run             Generate handoff doc without executing
--timeout <seconds>   Execution timeout (default: 300)
```

## Handoff Documents

When you hand off a task, aidock generates a structured document that gets injected into the next AI's prompt:

```markdown
# Handoff: t_abc123 -> codex

## Summary
Designed the API layer with Express routes for /auth, /users, /posts.

## Current State
3 files changed. Routes scaffolded in src/routes/.

## Known Issues
- JWT secret hardcoded in auth.ts line 15

## Relevant Files
- src/routes/auth.ts (modified)
- src/middleware/auth.ts (created)

## Constraints (Do Not Change)
- Express as the HTTP framework
- JWT for authentication

## Suggested Next Steps
1. Fix hardcoded JWT secret
2. Add rate limiting
```

This is the core mechanism for cross-model context sharing. Native CLI sessions are used only for same-model task continuation.

## Web Dashboard

Start with `aidock serve` and open `http://localhost:3457`.

The dashboard shows:

- **Agent status cards** — Which CLIs are installed, their versions
- **Task board** — Kanban view with Pending / Running / Done / Failed columns
- **Handoff chain** — Visual timeline showing how tasks flow between agents
- **Task detail** — Click any task to see full prompt, output, and diff stats

## Architecture

```
src/
  adapters/         # One adapter per CLI (independent event normalizers)
    claude-adapter  # claude -p --output-format json
    codex-adapter   # codex exec --full-auto --json
    gemini-adapter  # gemini --approval-mode=yolo -o json
  core/
    task-manager    # Task lifecycle (create/start/complete/fail)
    handoff-engine  # Structured handoff generation and chain tracking
    context-collector  # Git diff and file context gathering
    store           # JSON file persistence in .aidock/
  server/
    api             # REST endpoints
    ws              # WebSocket (zero-dependency native implementation)
  commands/         # CLI command implementations
web/                # Vanilla JS dashboard (zero dependencies)
```

### Adapter design

Each CLI adapter independently handles:

- Command construction and prompt injection
- JSON output parsing (event normalization)
- Permission mode mapping (`safe` / `auto` / `full`)
- Version detection and minimum version enforcement
- stdout/stderr semantics (Codex uses stderr for progress)

The three CLIs are **not treated as equivalent**. Each adapter encapsulates the differences.

### Permission mapping

| User setting | Claude | Codex | Gemini |
|-------------|--------|-------|--------|
| `safe` | default | exec (read-only sandbox) | default |
| `auto` | bypassPermissions | --full-auto | --approval-mode=yolo |
| `full` | bypassPermissions | --sandbox danger-full-access | --approval-mode=yolo |

## Configuration

Project-level config lives in `.aidock/config.json`:

```json
{
  "defaultTimeout": 300,
  "permissionLevel": "auto",
  "promptLengthThreshold": 4096,
  "models": {
    "claude": "sonnet",
    "codex": "o3",
    "gemini": "pro"
  },
  "webPort": 3457
}
```

## Storage

```
.aidock/
  config.json       # Project configuration
  tasks.json        # All tasks
  handoffs.json     # All handoff documents
  logs/             # Raw stdout/stderr per task
    t_abc123.stdout.log
    t_abc123.stderr.log
```

All data is local JSON files. No database, no cloud, no accounts.

## License

MIT

## Contributors

Created by [Pluviobyte](https://github.com/Pluviobyte)

---

# 中文文档

## 概述

大多数多 AI 框架试图自动路由任务。aidock 采用不同的方式：**由你决定哪个 AI 做什么**，框架负责在它们之间传递结构化的交接文档。

### 为什么选择 aidock？

- **人工路由** — 你决定任务分配给哪个 AI，没有黑盒路由。
- **结构化交接** — 通过结构化文档在 AI 之间传递上下文，而非原始文件拼接。
- **可视化面板** — Web 面板展示任务状态、Agent 可用性和交接链路。
- **即插即用** — 自动检测已安装的 CLI，零配置启动。
- **轻量级** — 仅 2 个运行时依赖，无数据库，JSON 文件存储。

## 安装

```bash
git clone https://github.com/Pluviobyte/aidock.git
cd aidock
npm install
npm run build
```

### 前置条件

至少安装以下 CLI 之一：

| CLI | 安装命令 |
|-----|---------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` |
| Codex CLI | `npm install -g @openai/codex` |
| Gemini CLI | `npm install -g @anthropic-ai/gemini-cli` |

## 快速开始

```bash
# 检测可用的 AI
aidock detect

# 在项目中初始化
cd your-project
aidock init

# 分配任务
aidock assign claude "设计博客应用的数据库 schema"

# 将结果交接给另一个 AI
aidock handoff t_abc123 codex --notes "只关注 User model"

# 查看状态
aidock status

# 启动 Web 面板
aidock serve
```

## 命令列表

| 命令 | 说明 |
|------|------|
| `aidock init` | 在当前项目初始化 `.aidock/` |
| `aidock detect` | 显示已安装的 CLI 及版本 |
| `aidock assign <agent> "<prompt>"` | 将任务分配给 claude、codex 或 gemini |
| `aidock handoff <taskId> <toAgent>` | 将已完成的任务交接给另一个 agent |
| `aidock status` | 显示所有任务状态 |
| `aidock history` | 显示任务和交接时间线 |
| `aidock serve [--port 3457]` | 启动 Web 面板 |

## 交接文档

执行 handoff 时，aidock 生成结构化文档并注入到下一个 AI 的 prompt 中：

```markdown
# 交接: t_abc123 -> codex

## 摘要
设计了 API 层，Express 路由在 src/routes/

## 当前状态
修改了 3 个文件，路由已搭建在 src/routes/

## 已知问题
- auth.ts 第 15 行 JWT secret 硬编码

## 相关文件
- src/routes/auth.ts (已修改)
- src/middleware/auth.ts (新建)

## 约束（不可更改）
- 使用 Express 作为 HTTP 框架
- 使用 JWT 认证

## 建议下一步
1. 修复硬编码的 JWT secret
2. 添加速率限制
```

这是跨模型上下文共享的核心机制。原生 CLI 会话仅用于同模型的任务续接。

## Web 面板

运行 `aidock serve` 后打开 `http://localhost:3457`。

面板包含：

- **Agent 状态卡片** — 显示各 CLI 安装状态和版本
- **任务看板** — 看板视图：待处理 / 运行中 / 已完成 / 失败
- **交接链路** — 可视化展示任务在 Agent 之间的流转
- **任务详情** — 点击任务查看完整 prompt、输出和 diff 统计

## 许可证

MIT

## 贡献者

创建者：[Pluviobyte](https://github.com/Pluviobyte)
