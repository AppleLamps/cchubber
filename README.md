# CC Hubber (improved fork)

> **This is a fork of [azkhh/cchubber](https://github.com/azkhh/cchubber) with security, correctness, Windows portability, and major feature improvements by [@lamps_apple](https://x.com/lamps_apple).**

**Fork home:** [github.com/AppleLamps/cchubber](https://github.com/AppleLamps/cchubber) · Issues and PRs welcome here.

[![npm downloads](https://img.shields.io/npm/dt/cchubber?color=c0c1ff&label=installs)](https://www.npmjs.com/package/cchubber)
[![npm version](https://img.shields.io/npm/v/cchubber?color=ffb690)](https://www.npmjs.com/package/cchubber)

Your AI coding tools, diagnosed. One command.

```bash
npx cchubber
```

Reads your local data from Claude Code, Cursor, Codex CLI, and GitHub Copilot CLI. Generates an HTML report saved to `~/.cchubber/reports/`. No API keys, no accounts. Network requests are limited to fetching pricing data, community benchmarks, and optional telemetry.

## Options

```text
--days, -d <n>     Analyze last N days of data (default: all-time)
--output, -o <path> Output HTML report to custom path
--budget <n>       Warn if daily cost exceeds $n (persisted)
--watch, -w        Live monitoring mode (poll for changes)
--no-open          Don't auto-open the report in browser
--no-telemetry     Disable anonymous telemetry for this run
--json             Output raw analysis as JSON
-h, --help         Show this help
```

## Telemetry

Sends anonymous telemetry once per day to help build community benchmarks. This includes aggregated stats (grade, cache ratio, model split), session patterns (tool usage, hour distribution, session durations), environment signals (OS, editor, framework detection, file type counts), and CLAUDE.md structure (section names, token counts). No tokens, no file contents, no project names. Opt out anytime:

- Flag: `npx cchubber --no-telemetry`
- Environment (permanent):
  - PowerShell: `$env:CC_HUBBER_TELEMETRY="0"`
  - CMD: `set CC_HUBBER_TELEMETRY=0`
  - Unix: `export CC_HUBBER_TELEMETRY=0`

Built during the March 2026 cache crisis because nobody could tell if they'd been hit. Thousands of users burning through limits 10-20x faster than normal, and Anthropic's only answer was "we're investigating." We wanted receipts.

## What you get

A single HTML report that tells you three things: what you spent, why you spent it, and whether that's normal.

**The diagnosis:**

- Cache health grade (trend-weighted, recent 7 days count more)
- Inflection point detection with stricter windows, optional alternate signal, and methodology note
- Per-project **estimated API-equivalent cost** (model-weighted from JSONL) plus decoded project names
- **Since last run:** compares grade, cache ratio, and cost vs your previous report (after first saved run)
- Session intelligence: duration stats, tool usage, activity heatmap *(only if `session-meta` exists — see [Data sources](#data-sources))*
- Model routing analysis (93% Opus? Your limits would last 3x longer on Sonnet)
- **Environment profile:** system specs, git stats, tech stack, AI tools, Claude Code config
- **Multi-tool analysis:** Cursor, Codex CLI, and GitHub Copilot CLI alongside Claude Code, plus **cross-tool synthesis** (heuristic overlap hints)
- **OAuth rate limits** in the HTML report when Claude Code has live usage data
- Recommendations use **live community benchmarks** when telemetry stats load; sensible defaults offline
- **Budget alerts:** `--budget 20` warns when avg daily cost exceeds $20

**The data:**

- Cost calculated from actual token counts (LiteLLM pricing, not the broken `costUSD` field)
- Message-level deduplication (Claude Code JSONL files contain ~50% duplicates from session resume)
- Subagent visibility: Haiku and Sonnet background agents show up in model distribution
- CLAUDE.md section-by-section analysis with per-message cost impact
- Cache breaks: **measured** from diff files when present, otherwise **estimated** from cache-write volume (called out in the report)

**The HTML report:**

- Cost trend chart with a **second series** for cache efficiency (read ÷ output) on the same timeline
- Skip link, chart range tabs (accessibility), print-friendly styles, optional layout CSS if the Tailwind CDN is blocked
- Community leaderboard loads after idle time so first paint stays snappy

**The shareable card:**
An animated card with your grade, spend, cache ratio, and diagnosis line. Export as video. Post it. Let people see the numbers Anthropic won't show them.

## Install

```bash
npx cchubber
```

Or globally:

```bash
npm install -g cchubber
cchubber
```

Node.js 18+ (22+ for multi-tool analysis). Works on macOS, Windows, Linux.

## The cache bug (March 2026)

Between v2.1.69 and v2.1.89, five things broke at once:

1. A sentinel replacement bug in Anthropic's custom Bun fork dropped cache read rates from 95% to 4-17%
2. The `--resume` flag caused full prompt-cache misses on every single resume
3. One session generated 652,069 output tokens with zero user input ($342 gone)
4. Peak-hour throttling kicked in for 7% of users without announcement
5. A 2x off-peak promotion expired, making the baseline feel like a cut

v2.1.90 fixes most of these. Run `claude update`.

CC Hubber shows you whether you were affected. If your report has a sharp inflection point around mid-March, that's probably when it hit you.

## What the community figured out

These tips came from GitHub issues, Reddit threads, and Twitter during the crisis. CC Hubber's recommendations are based on this data.

- Start a fresh session for each task. Long sessions bleed tokens.
- Route subagents to Sonnet (`model: "sonnet"` on Task calls). Same quality, 5x cheaper per token.
- Keep your CLAUDE.md under 200 lines. It gets re-read on every message. 12K tokens at 200 messages/day costs $1.23/day cached.
- Run `/compact` every 30-40 tool calls. Context bloat compounds.
- Create a `.claudeignore` file. Exclude `node_modules/`, `dist/`, `*.lock`. Saves tokens on every context load.
- Avoid `--resume` on older versions. Fixed in v2.1.90.
- Shift heavy work (refactors, test generation) outside 5am-11am PT. That's when Anthropic throttles session limits.

## How the cost works

Claude Code doesn't show costs for Max and Pro plans (`costUSD` is always 0). CC Hubber calculates equivalent API cost from your token counts using LiteLLM's pricing data.

The number you see is what you'd pay on the API tier for the same usage. Useful for comparing consumption across days and projects. Not a billing statement.

## Data sources

Everything is local. CC Hubber reads files that already exist on your machine.

**Claude Code:**

| Source | Path | What it contains |
| ------ | ---- | ---------------- |
| Conversations | `~/.claude/projects/*/` | Token counts per message, per model |
| Subagents | `~/.claude/projects/*/subagents/` | Haiku/Sonnet background agent usage |
| Session meta | `~/.claude/usage-data/session-meta/` | Duration, tool counts, lines changed *(not all Claude Code builds create this folder yet; report falls back gracefully)* |
| Cache breaks | `~/.claude/tmp/cache-break-*.diff` | Why your prompt cache broke |
| CLAUDE.md | `~/.claude/CLAUDE.md` + project-level | File sizes, section breakdown, cost per message |
| Rate limits | `~/.claude/.credentials.json` | Live 5-hour and 7-day utilization |

**Other AI tools** (requires Node.js 22+):

| Tool | Source | Metrics |
| ---- | ------ | ------- |
| Cursor | `state.vscdb` (SQLite) | Daily lines suggested/accepted, accept rate |
| Codex CLI | `logs_1.sqlite` (OpenTelemetry) | Token counts by model (input/output/cached/reasoning) |
| GitHub Copilot CLI | `session-store.db` (SQLite) | Sessions, turns, files edited per repo |

Also detects installed versions of: Cline, Windsurf, Continue, Gemini CLI.

## Compared to ccusage

[ccusage](https://github.com/ryoppippi/ccusage) (12K+ stars) is great for cost accounting. It tells you what you spent.

CC Hubber tells you why, and whether it's normal. Inflection detection, cache break estimation, model routing savings, session intelligence, trend-weighted grading. Different tools for different questions.

## License

MIT

## Credits

Originally built by [@azkhh](https://x.com/asmirkn). Shipped fast with [Mover OS](https://moveros.dev).

### Fork improvements by [@lamps_apple](https://x.com/lamps_apple)

**Phase 1 — Bug fixes:**

- **Security:** Removed env-based telemetry URL redirect; fixed command injection in browser opener
- **Windows:** Replaced all Unix shell pipelines (`find`, `wc`, `awk`, `stat --format`) with cross-platform Node.js; git commands use `execFileSync` instead of shell strings
- **Telemetry disclosure:** README and `--help` now accurately describe what telemetry collects; added `--no-telemetry` to help output with PowerShell/CMD/Unix opt-out examples
- **Correctness:** Fixed hardcoded telemetry version drift; fixed module-level dedup Set shared across imports; added content-based dedup for messages without IDs; fixed `gatherEnvironmentData` referencing out-of-scope `report`; fixed editor detection operator precedence; fixed `peakHour` crash on empty arrays

**Phase 2 — Feature improvements:**

- **Modular architecture:** Broke 810-line telemetry.js into 5 focused collector modules (`src/collectors/`)
- **Environment analysis:** New detailed environment profile in terminal output (system, git, stack, AI tools, Claude config)
- **`--days` actually filters data:** Was a UI-only default; now filters JSONL entries before aggregation
- **`--budget` cost alerts:** Warns when avg daily cost exceeds limit; persists to `~/.cchubber/config.json`
- **`--watch` live mode:** Polls JSONL files every 10s with live cost/grade updates
- **Report privacy:** Default output moved from cwd to `~/.cchubber/reports/` (no more leaking reports in shared directories)
- **Better project decoding:** Tries Claude Code's project registry first; handles Unix absolute paths; smarter boundary detection
- **Multi-tool analysis:** Reads Cursor (line stats), Codex CLI (token events), and Copilot CLI (session engagement) from local SQLite databases; shown as "AI Tool Overview" in report
- **AI tool detection:** Finds installed versions of Claude Code, Cursor, Cline, Windsurf, Continue, Codex CLI, Gemini CLI, and GitHub Copilot
- **Test suite:** 31+ tests using `node:test` covering collectors, aggregation, telemetry, environment analysis, and analyzers

**Phase 3 — Report & analysis (this fork):**

- **`package.json`:** Repository, bugs, and homepage point at [AppleLamps/cchubber](https://github.com/AppleLamps/cchubber); HTML report links match the fork
- **Comparison vs last run** in the HTML report; **per-project estimated cost** from per-model token rolls
- **Community benchmarks** wired into recommendations when public stats load; **cache break confidence** (measured vs estimated)
- **Inflection detection** tightened (minimum days per window, ranked candidates, alternate signal)
- **Cross-tool synthesis** section when multiple AI tools have local data
- **OAuth / session limit bars** in HTML when available; **dual-metric cost chart**; accessibility and print tweaks; **requestIdleCallback** for community section
- **`src/renderers/html-report/index.js`** re-exports the main renderer for a cleaner import path
