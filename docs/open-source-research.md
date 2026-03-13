# Open Source Research and Improvement Log

This document records the open-source projects analyzed during aidock's development, the patterns borrowed and rejected from each, and the concrete improvements implemented as a result.

---

## Table of Contents

- [Research Phase 1: Initial Competitive Analysis](#research-phase-1-initial-competitive-analysis)
- [Research Phase 2: Deep-Dive Analysis](#research-phase-2-deep-dive-analysis)
- [Improvements Implemented](#improvements-implemented)
- [Summary of Decisions](#summary-of-decisions)

---

## Research Phase 1: Initial Competitive Analysis

Four projects were cloned and analyzed to understand the existing landscape of multi-AI CLI orchestration frameworks.

### 1. metaswarm

- **Repository:** https://github.com/dsifry/metaswarm
- **Description:** Production-tested multi-agent orchestration framework for Claude Code, Gemini CLI, and Codex CLI. Orchestrates 18 specialized agents and 13 skills through a 9-phase software development lifecycle.
- **Architecture:** Recursive orchestration with parallel review gates, git-native knowledge base (BEADS), JSONL fact store with selective priming.
- **Dependencies:** Node.js 18+, BEADS CLI, GitHub CLI

| Pattern | Decision | Reason |
|---------|----------|--------|
| 9-phase workflow concept | Rejected | Over-engineered for aidock's human-routing model |
| 18 specialized agent personas | Rejected | Too much role fragmentation; aidock uses 3 real CLI tools |
| Parallel design review gate | Rejected | Automatic routing, conflicts with human-in-the-loop |
| Recursive orchestration | Rejected | Scaling concerns; aidock is single-level delegation |
| Knowledge priming with filters | Noted | Interesting but unnecessary for MVP |

### 2. claude_code_bridge (ccb)

- **Repository:** https://github.com/bfly123/claude_code_bridge
- **Description:** Multi-model collaboration via split-pane terminal. Lightweight async messaging between Claude, Codex, Gemini, OpenCode, and Droid.
- **Architecture:** Daemon-based execution with auto-managed background processes, watchdog file monitoring, terminal backend abstraction (tmux/WezTerm).
- **Dependencies:** Python 3.10+, WezTerm or tmux

| Pattern | Decision | Reason |
|---------|----------|--------|
| Terminal backend abstraction | Rejected | aidock uses subprocess non-interactive mode, not terminal emulation |
| Daemon-based execution | Rejected | Adds lifecycle complexity; aidock spawns and waits |
| Session isolation via project-local storage | Adopted (conceptually) | aidock's `.aidock/` directory serves the same purpose |
| Email-to-AI gateway | Rejected | Irrelevant to CLI orchestration |

### 3. myclaude

- **Repository:** https://github.com/stellarlinkco/myclaude
- **Description:** AI-powered development automation with multi-backend execution (Codex/Claude/Gemini/OpenCode). 5-phase feature development workflow.
- **Architecture:** Modular skill system, codeagent-wrapper abstraction layer, dual orchestrator model (Claude for planning + codeagent for execution).
- **Dependencies:** Node.js, backend CLI tools
- **License:** AGPL (restrictive)

| Pattern | Decision | Reason |
|---------|----------|--------|
| codeagent-wrapper abstraction | Adopted (conceptually) | Similar to aidock's BaseAdapter pattern |
| 5-phase workflow | Rejected | aidock's assign/handoff model is simpler and more flexible |
| Module configuration system | Rejected | Over-engineering for 3 adapters |
| Interactive installer | Rejected | aidock is `npm install -g` |

### 4. Claude-Code-Workflow (CCW)

- **Repository:** https://github.com/catlog22/Claude-Code-Workflow
- **Description:** JSON-driven multi-agent framework with 37 skills, 22 agents, queue scheduler, and terminal dashboard. Most feature-complete of the analyzed projects.
- **Architecture:** Semantic CLI invocation, team cadence control (beat model), React Flow visual editor, better-sqlite3 state management.
- **Dependencies:** Node.js 18+, better-sqlite3, node-pty, web-tree-sitter

| Pattern | Decision | Reason |
|---------|----------|--------|
| Process lifecycle management | **Adopted** | SIGTERM -> SIGKILL graceful shutdown pattern |
| Retry with error classification | **Adopted** | Error categorization + retry hints |
| WebSocket message throttling | **Adopted** | Per-type throttle intervals + dedup |
| Output parsing fallback chain | **Adopted** | JSON -> JSONL -> text degradation |
| SQLite state management | Rejected | JSON files are sufficient for aidock's scale |
| React dashboard | Rejected | Vanilla JS keeps dependencies at zero |
| 37 modular skills | Rejected | Over-abstraction; aidock has 8 CLI commands |
| 22 specialized agents | Rejected | aidock delegates to real CLI tools, not virtual roles |
| Session clustering | Rejected | Not needed for single-machine orchestration |
| Message bus architecture | Rejected | Direct subprocess communication is simpler |

**4 improvements were implemented from CCW analysis** (see [Improvement Set 1](#improvement-set-1-from-ccw-analysis)).

---

## Research Phase 2: Deep-Dive Analysis

A broader search identified 10 additional projects. Three were selected for deep analysis based on relevance to aidock's architecture.

### Projects Surveyed (Not Deep-Analyzed)

| Project | Stars | Why Excluded |
|---------|-------|-------------|
| nyldn/claude-octopus | -- | Consensus gating model conflicts with human routing |
| Z-M-Huang/claude-codex-gemini | -- | Fixed pipeline (Gemini -> Claude -> Codex), not flexible |
| fengshao1227/ccg-workflow | -- | Fixed routing (frontend -> Gemini, backend -> Codex) |
| GreenSheep01201/claw-empire | -- | Pixel-art office simulator; entertainment, not tooling |
| ruvnet/ruflo | ~18K+ | 175+ MCP tools, swarm intelligence; massively over-scoped |
| nwiizo/ccswarm | -- | Claude-only, no multi-CLI |
| jayminwest/overstory | ~959 | SQLite mail system + 7 agent types; too complex |

### 5. codexmcp

- **Repository:** https://github.com/GuDaStudio/codexmcp
- **Description:** Thin MCP bridge (~200 lines effective code) that wraps Codex CLI as an MCP tool for Claude Code to invoke.
- **Architecture:** FastMCP server wrapping `codex exec --json` subprocess. Single-turn execution: detects `turn.completed` event, waits 300ms, force-terminates. Session continuity via `resume <SESSION_ID>` passthrough.
- **Dependencies:** 2 (mcp, pydantic)

| Pattern | Decision | Reason |
|---------|----------|--------|
| `turn.completed` detection + force-terminate | **Adopted** | Codex `--json` mode sometimes hangs after completion; proactive kill is more reliable |
| Session ID passthrough (`resume <SESSION_ID>`) | **Adopted** | Enables context continuity on retry with same agent |
| MCP as bridge protocol | Rejected | aidock calls CLIs directly; MCP adds unnecessary indirection |
| No structured handoff | N/A | Confirms aidock's structured handoff is a differentiated feature |

### 6. cli-agent-orchestrator (CAO)

- **Repository:** https://github.com/awslabs/cli-agent-orchestrator
- **Stars:** ~291
- **Description:** AWS Labs project. Supervisor-worker hierarchy using tmux sessions. Three orchestration modes: Handoff (sync), Assign (async), Send Message (queued inbox).
- **Architecture:** FastAPI REST server on localhost:9889, SQLAlchemy + SQLite for state, libtmux for terminal isolation, watchdog for inbox polling, regex-based agent status detection (spinner characters).
- **Dependencies:** 12 (fastapi, uvicorn, sqlalchemy, libtmux, watchdog, etc.)

| Pattern | Decision | Reason |
|---------|----------|--------|
| Handoff/Assign/Send Message modes | Rejected | CAO's "handoff" is raw text, not structured context; aidock's HandoffDocument is superior |
| tmux session isolation | Rejected | aidock uses `-p` non-interactive subprocess, not terminal emulation |
| SQLite + watchdog inbox | Rejected | Over-engineered; aidock's JSON file store is sufficient |
| Regex-based terminal scraping | Rejected | aidock reads structured stdout/stderr, not terminal output |
| Bracketed paste for input | Rejected | Only needed for TUI interaction, irrelevant for pipe mode |

**Conclusion: CAO's architecture (tmux interactive mode) is fundamentally different from aidock (subprocess non-interactive mode). No patterns adopted.**

### 7. agent-orchestrator (Composio)

- **Repository:** https://github.com/ComposioHQ/agent-orchestrator
- **Stars:** ~3,100
- **Description:** Most mature project analyzed. Plugin-based orchestration with 8 plugin slots, 19 plugin packages, git worktree isolation, SSE-based web dashboard, CI failure routing.
- **Architecture:** pnpm monorepo (7 packages), Next.js dashboard, 14-state session lifecycle, dual-axis state model (SessionStatus x ActivityState), 30s polling with webhook fast-path.
- **Dependencies:** ~60 unique packages

| Pattern | Decision | Reason |
|---------|----------|--------|
| Git worktree isolation (`create/destroy/list/exists/restore`) | Noted for V2 | Clean interface; `~/.worktrees/{projectId}/{sessionId}` path structure + symlink shared files |
| Dual-axis state model (Status x Activity) | Partially adopted | Inspired attention level concept for task board |
| Attention levels (merge > respond > review > pending > working > done) | **Adopted** | Directly useful for human-routed model; helps user prioritize |
| SSE for state push | Rejected | aidock already has WebSocket; no advantage to switching |
| 8-slot plugin architecture | Rejected | Over-abstraction for 3 adapters |
| CI failure auto-routing | Rejected | Automatic routing violates human-in-the-loop principle |
| Webhook fast-path | Rejected | aidock has no external service integrations |
| Fingerprint-based dedup for review comments | Noted | Interesting but not applicable to current scope |

---

## Improvements Implemented

### Improvement Set 1: From CCW Analysis

Commit: `3bf31f0` — "feat: add process manager, retry command, WS throttling, output parsing hardening"

#### 1.1 Process Lifecycle Manager

**File:** `src/adapters/base-adapter.ts`

Added running process tracking and graceful shutdown:
- `runningProcesses` Set tracks all spawned child processes
- `killAllProcesses()` implements two-phase termination: SIGTERM (graceful) then SIGKILL after 2 seconds (force)
- Exit handlers on `SIGINT` and `SIGTERM` ensure cleanup
- Timeout in `execute()` uses the same SIGTERM -> 2s -> SIGKILL pattern

#### 1.2 Retry Command

**File:** `src/commands/retry.ts`

New `aidock retry <taskId>` command:
- Validates task exists and is in `failed` status
- Records previous failure to `retryHistory` array (error text, exit code, error category, timestamp)
- Increments `attempt` counter
- Re-executes with fresh context collection
- Provides error-category-specific hints on failure:
  - `auth` -> "Check your authentication. Try logging in again."
  - `rate_limit` -> "Rate limited. Wait a moment before retrying."
  - `timeout` -> "Task timed out. Try increasing --timeout."

**Types added:** `RetryRecord` in `src/types/task.ts`, `attempt` and `retryHistory` fields on `Task`.

#### 1.3 WebSocket Message Throttling

**File:** `src/server/ws.ts`

Rewrote WebSocket server with structured message types and per-type throttling:

| Message Type | Throttle Interval | Rationale |
|-------------|-------------------|-----------|
| `handoff_created` | 0ms (immediate) | User needs to see handoffs instantly |
| `process_log` | 200ms | High-frequency but not critical |
| `task_update` | 500ms | Status changes are important but batching is fine |
| `agent_status` | 1000ms | Availability rarely changes |

Content-based deduplication via MD5 hash prevents identical messages from being sent within the throttle window. Broadcast metrics (`sent`, `throttled`, `deduped`) are exported for monitoring.

#### 1.4 Output Parsing Fallback Chain

**File:** `src/adapters/base-adapter.ts` (shared), all three adapters updated

Unified `parseOutputFallback()` function with three-tier degradation:
1. **JSON** — attempt `JSON.parse()` on full output
2. **JSONL** — scan from last line upward for first valid JSON line
3. **Text** — return raw string as-is

All three adapters (`claude-adapter.ts`, `codex-adapter.ts`, `gemini-adapter.ts`) were refactored to use this shared function, eliminating duplicated parsing logic.

Error classification function `classifyError()` added with regex patterns:
- `auth` — unauthorized, login, credentials, api key
- `rate_limit` — rate limit, 429, throttle
- `timeout` — timeout, SIGTERM, SIGKILL, exit code 143
- `not_found` — command not found, ENOENT
- `task_error` — non-zero exit code (fallback)

---

### Improvement Set 2: From Phase 2 Analysis

Commit: `509f38a` — "feat: completion event detection, session ID passthrough, attention levels"

#### 2.1 Codex Completion Event Detection

**Files:** `src/adapters/base-adapter.ts`, `src/adapters/codex-adapter.ts`

Problem: Codex CLI's `--json` mode sometimes does not exit after emitting `turn.completed`, causing the subprocess to hang indefinitely until timeout.

Solution:
- `BaseAdapter` gained a virtual method `isCompletionEvent(line: string): boolean` (default: false)
- `execute()` now streams stdout line-by-line and checks each line against this method
- When a completion event is detected, the subprocess is terminated after a 500ms grace period via SIGTERM
- `CodexAdapter` overrides `isCompletionEvent()` to detect `turn.completed` and `response.completed` JSON events
- Claude and Gemini adapters are unaffected (they exit cleanly on their own)

#### 2.2 Session ID Passthrough for Retry

**Files:** `src/types/agent.ts`, `src/types/task.ts`, all three adapters, `src/commands/assign.ts`, `src/commands/handoff.ts`, `src/commands/retry.ts`

Problem: When retrying a failed task with the same agent, the agent starts from scratch with no memory of the previous attempt.

Solution:
- `ExecuteOptions` gained `sessionId?: string` field
- `TaskResult` gained `sessionId?: string` field
- All three commands (`assign`, `handoff`, `retry`) now persist `sessionId` from the adapter result
- On retry, the previous task's `sessionId` is extracted and passed to the adapter
- Each adapter maps `sessionId` to its native session resume mechanism:

| Agent | Session Resume Flag |
|-------|-------------------|
| Claude | `--resume <sessionId>` |
| Codex | `resume <sessionId>` (replaces `exec` subcommand) |
| Gemini | `-r <sessionId>` |

- Codex adapter also extracts `thread_id` from JSONL output as its session ID

#### 2.3 Task Attention Levels

**Files:** `web/components/task-board.js`, `web/style.css`

Problem: In a human-routed model, the user needs to quickly identify which tasks require attention. A flat list sorted by time is not sufficient.

Solution: Derived attention level from task status:

| Level | Status | Label | Visual |
|-------|--------|-------|--------|
| 4 | `failed` | "action needed" | Red left border + badge |
| 3 | `handed_off` | "review handoff" | Purple left border + badge |
| 2 | `running` | "monitoring" | Yellow badge (no border) |
| 1 | `pending` | (none) | No indicator |
| 0 | `done` | (none) | No indicator |

Tasks within each kanban column are sorted by attention level (descending), then by creation time (newest first). Failed tasks and handoffs visually stand out with a 3px colored left border. Retry attempt count is displayed in the task meta line when `attempt > 1`.

---

## Summary of Decisions

### Design Principles Applied

Every pattern was evaluated against aidock's core principles:

1. **Human routing** — reject any auto-routing, auto-dispatch, or consensus-gating mechanism
2. **Minimal dependencies** — 2 runtime deps (commander, nanoid); reject SQLite, React, MCP, etc.
3. **Subprocess non-interactive mode** — reject tmux, terminal scraping, daemon management
4. **Structured handoff** — the HandoffDocument is aidock's core differentiation; reject raw text forwarding
5. **Simplicity** — reject plugin architectures, role-based agents, recursive orchestration

### Adopted vs Rejected Summary

| Adopted (7 patterns) | Source |
|----------------------|--------|
| Process lifecycle (SIGTERM -> SIGKILL) | CCW |
| Retry with error classification + hints | CCW |
| WebSocket per-type throttling + dedup | CCW |
| Output parsing fallback (JSON -> JSONL -> text) | CCW |
| Completion event detection + proactive kill | codexmcp |
| Session ID passthrough for retry | codexmcp |
| Attention levels for task prioritization | agent-orchestrator |

| Rejected (20+ patterns) | Common Reason |
|-------------------------|---------------|
| Auto-routing / consensus gates | Violates human routing |
| tmux / terminal emulation | aidock uses non-interactive subprocess |
| SQLite / database state | JSON files sufficient |
| React / heavy frontend | Vanilla JS, zero deps |
| MCP protocol bridge | Unnecessary indirection |
| Plugin slot architecture | Over-abstraction for 3 adapters |
| Daemon lifecycle management | Spawn-and-wait is simpler |
| 18-37 specialized agents/skills | aidock has 3 real tools, 8 commands |
| Recursive orchestration | Single-level delegation is sufficient |
| CI failure auto-routing | Automatic, not human-routed |

### Total Projects Analyzed

| Phase | Projects | Deep-Analyzed | Patterns Adopted |
|-------|----------|--------------|-----------------|
| Phase 1 | 4 | 4 | 4 (all from CCW) |
| Phase 2 | 10 | 3 | 3 |
| **Total** | **14** | **7** | **7** |
