#!/usr/bin/env node

// Suppress experimental SQLite warning (used for multi-tool readers)
const _origEmit = process.emit;
process.emit = function (event, ...args) {
  if (event === 'warning' && args[0]?.name === 'ExperimentalWarning' && args[0]?.message?.includes('SQLite')) return false;
  return _origEmit.call(this, event, ...args);
};

import { resolve, join, dirname } from 'path';
import { existsSync, writeFileSync, readFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { homedir, platform } from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
const VERSION = PKG.version;

import { readAllJSONL, aggregateDaily, aggregateByModel, aggregateByProject } from '../readers/jsonl-reader.js';
import { readStatsCache } from '../readers/stats-cache.js';
import { readSessionMeta } from '../readers/session-meta.js';
import { readCacheBreaks } from '../readers/cache-breaks.js';
import { readClaudeMdStack } from '../readers/claude-md.js';
import { readOAuthUsage } from '../readers/oauth-usage.js';
import { analyzeUsage, fetchPricing } from '../analyzers/cost-calculator.js';
import { analyzeCacheHealth } from '../analyzers/cache-health.js';
import { detectAnomalies } from '../analyzers/anomaly-detector.js';
import { generateRecommendations } from '../analyzers/recommendations.js';
import { detectInflectionPoints } from '../analyzers/inflection-detector.js';
import { analyzeSessionIntelligence } from '../analyzers/session-intelligence.js';
import { analyzeModelRouting } from '../analyzers/model-routing.js';
import { analyzeEnvironment } from '../analyzers/environment-analyzer.js';
import { renderHTML } from '../renderers/html-report.js';
import { renderTerminal } from '../renderers/terminal-summary.js';
import { shouldSendTelemetry, sendTelemetry } from '../telemetry.js';
import { saveRun, getDelta, getHistory } from '../history.js';
import { readCursorUsage } from '../readers/cursor-reader.js';
import { readCodexUsage } from '../readers/codex-reader.js';
import { readCopilotUsage } from '../readers/copilot-reader.js';

const args = process.argv.slice(2);
const flags = {
  help: args.includes('--help') || args.includes('-h'),
  json: args.includes('--json'),
  noTelemetry: args.includes('--no-telemetry'),
  noOpen: args.includes('--no-open'),
  watch: args.includes('--watch') || args.includes('-w'),
  output: (() => {
    const idx = args.indexOf('--output') !== -1 ? args.indexOf('--output') : args.indexOf('-o');
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  })(),
  days: (() => {
    const idx = args.indexOf('--days') !== -1 ? args.indexOf('--days') : args.indexOf('-d');
    const val = idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 0;
    return isNaN(val) ? 0 : val;
  })(),
  budget: (() => {
    const idx = args.indexOf('--budget');
    const val = idx !== -1 && args[idx + 1] ? parseFloat(args[idx + 1]) : null;
    return val !== null && !isNaN(val) ? val : null;
  })(),
};

if (flags.help) {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║              CC Hubber v${VERSION}                 ║
  ║  What you spent. Why you spent it. Is that    ║
  ║  normal.                                      ║
  ╚═══════════════════════════════════════════════╝

  Usage: cchubber [options]

  Options:
    --days, -d <n>     Analyze last N days of data (default: all time)
    --output, -o <path> Output HTML report to custom path
    --budget <n>       Warn if daily cost exceeds $n (persisted)
    --watch, -w        Live monitoring mode (poll for changes)
    --no-open          Don't auto-open the report in browser
    --no-telemetry     Disable anonymous telemetry for this run
    --json             Output raw analysis as JSON
    -h, --help         Show this help

  Telemetry:
    Anonymous environment and usage stats are sent once per day to help
    build community benchmarks. No tokens, file contents, or project names.
    Opt out permanently: set CC_HUBBER_TELEMETRY=0
      PowerShell:  $env:CC_HUBBER_TELEMETRY="0"
      CMD:         set CC_HUBBER_TELEMETRY=0
      Unix:        export CC_HUBBER_TELEMETRY=0

  Examples:
    cchubber                    Scan & open HTML report
    cchubber --days 7           Default report view to 7 days
    cchubber -o report.html     Custom output path
    cchubber --json             Machine-readable output

  Shipped with Mover OS at speed.
  https://moveros.dev
`);
  process.exit(0);
}

async function main() {
  const claudeDir = getClaudeDir();

  if (!existsSync(claudeDir)) {
    console.error('\n  ✗ Claude Code data directory not found at: ' + claudeDir);
    console.error('    Make sure Claude Code is installed and has been used at least once.\n');
    process.exit(1);
  }

  console.log(`
    /\\  _  /\\
   /  \\(_)/  \\   CC Hubber v${VERSION}
   \\  / ◉ \\  /   What you spent. Why. Is that normal.
    \\/  ~  \\/
  `);
  console.log('  Reading local Claude Code data...\n');

  // Read all data sources
  const jsonlEntries = readAllJSONL(claudeDir);
  const statsCache = readStatsCache(claudeDir);
  const sessionMeta = readSessionMeta(claudeDir);
  const cacheBreaks = readCacheBreaks(claudeDir);
  const claudeMdStack = readClaudeMdStack(claudeDir);
  const oauthUsage = await readOAuthUsage(claudeDir);

  // Filter JSONL entries by --days window before aggregation (0 = all time)
  let filteredEntries;
  if (flags.days > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - flags.days);
    const cutoffISO = cutoffDate.toISOString();
    filteredEntries = jsonlEntries.filter(e => {
      const ts = e.timestamp || e.ts;
      return !ts || ts >= cutoffISO;
    });
  } else {
    filteredEntries = jsonlEntries;
  }

  if (jsonlEntries.length === 0 && !statsCache) {
    console.error('  ✗ No usage data found. Use Claude Code first, then run CC Hubber.\n');
    process.exit(1);
  }

  // Aggregate filtered JSONL into daily + model + project views
  const dailyFromJSONL = aggregateDaily(filteredEntries);
  const modelFromJSONL = aggregateByModel(filteredEntries);
  const projectBreakdown = aggregateByProject(filteredEntries, claudeDir);

  // Fetch dynamic pricing (LiteLLM) with hardcoded fallback
  const pricing = await fetchPricing();
  const pricingSource = pricing === null ? 'hardcoded' : 'LiteLLM';

  console.log(`  ✓ ${jsonlEntries.length.toLocaleString()} total entries → ${filteredEntries.length.toLocaleString()}${flags.days > 0 ? ` in last ${flags.days} days` : ' (all time)'}`);
  console.log(`  ✓ ${dailyFromJSONL.length} days of data found`);
  console.log(`  ✓ Pricing: ${pricingSource}`);
  console.log(`  ✓ ${sessionMeta.length} sessions found`);
  console.log(`  ✓ ${cacheBreaks.length} cache break events found`);
  console.log(`  ✓ CLAUDE.md stack: ${claudeMdStack.totalTokensEstimate.toLocaleString()} tokens (~${(claudeMdStack.totalBytes / 1024).toFixed(1)} KB)`);
  if (oauthUsage) console.log('  ✓ Live rate limits loaded');
  else console.log('  ○ Live rate limits skipped (no OAuth token)');

  // Multi-tool data (Cursor, Codex, Copilot CLI)
  console.log('\n  Scanning other AI tools...\n');
  const multiTool = [];

  const cursorData = await readCursorUsage();
  if (cursorData) {
    multiTool.push(cursorData);
    console.log(`  ✓ Cursor: ${cursorData.summary.activeDays} active days, ${cursorData.summary.totalLines.toLocaleString()} lines accepted`);
  }

  const codexData = await readCodexUsage();
  if (codexData) {
    multiTool.push(codexData);
    const totalTokens = codexData.summary.totalInputTokens + codexData.summary.totalOutputTokens;
    console.log(`  ✓ Codex CLI: ${codexData.summary.sessionCount} sessions, ${totalTokens.toLocaleString()} tokens (${codexData.summary.totalEvents} events${codexData.partial ? ', partial' : ''})`);
  }

  const copilotData = await readCopilotUsage();
  if (copilotData) {
    multiTool.push(copilotData);
    console.log(`  ✓ Copilot CLI: ${copilotData.summary.totalSessions} sessions, ${copilotData.summary.totalTurns} turns, ${copilotData.summary.filesEdited} files edited`);
  }

  if (multiTool.length === 0) {
    console.log('  ○ No other AI tool data found');
  }

  console.log('\n  Analyzing...\n');
  const costAnalysis = analyzeUsage(statsCache, sessionMeta, flags.days, dailyFromJSONL, modelFromJSONL);
  const cacheHealth = analyzeCacheHealth(statsCache, cacheBreaks, flags.days, dailyFromJSONL);
  const anomalies = detectAnomalies(costAnalysis);
  const inflection = detectInflectionPoints(dailyFromJSONL);
  const sessionIntel = analyzeSessionIntelligence(sessionMeta, jsonlEntries);
  const modelRouting = analyzeModelRouting(costAnalysis, jsonlEntries);
  const recommendations = generateRecommendations(costAnalysis, cacheHealth, claudeMdStack, anomalies, inflection, sessionIntel, modelRouting, projectBreakdown);
  const environment = analyzeEnvironment(claudeDir);

  if (inflection) console.log(`  ✓ Inflection: ${inflection.summary}`);
  if (sessionIntel.available) console.log(`  ✓ ${sessionIntel.totalSessions} sessions analyzed (${sessionIntel.avgDuration} min avg)`);
  if (modelRouting.available) console.log(`  ✓ Model routing: ${modelRouting.opusPct}% Opus, ${modelRouting.sonnetPct}% Sonnet`);
  console.log(`  ✓ ${projectBreakdown.length} projects detected`);
  if (environment.available) {
    console.log(`  ✓ Environment: ${environment.system.os}/${environment.system.arch}, ${environment.frameworks.length} frameworks, ${environment.aiTools.length} AI tools`);
  }

  // Fetch community stats for leaderboard (non-blocking, 5s timeout, fails silently)
  let communityStats = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://cchubber-telemetry.asmirkhan087.workers.dev/stats-public', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) communityStats = await res.json();
  } catch {}
  if (communityStats) console.log(`  ✓ Community data: ${communityStats.totalReports} users from ${Object.keys(communityStats.countries || {}).length} countries`);
  else console.log('  ○ Community data unavailable (offline)');

  const report = {
    generatedAt: new Date().toISOString(),
    periodDays: flags.days,
    costAnalysis,
    cacheHealth,
    anomalies,
    inflection,
    sessionIntel,
    modelRouting,
    projectBreakdown,
    claudeMdStack,
    oauthUsage,
    recommendations,
    communityStats,
    environment,
    multiTool,
    history: getHistory(),
  };

  // Output
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Track over time — save run, then compare against previous
  const currentRun = saveRun(report);
  const delta = getDelta(currentRun);
  if (delta && delta.daysSince > 0) {
    console.log(`  ✓ Compared to last run (${delta.daysSince}d ago):`);
    if (delta.gradeChange) console.log(`    Grade: ${delta.gradeChange}`);
    const ratioDir = delta.ratioChange > 0 ? '↑' : delta.ratioChange < 0 ? '↓' : '→';
    console.log(`    Ratio: ${ratioDir} ${Math.abs(delta.ratioChange)} (${delta.prev.ratio}→${currentRun.ratio})`);
    const scoreDir = delta.scoreChange > 0 ? '↑' : delta.scoreChange < 0 ? '↓' : '→';
    console.log(`    Score: ${scoreDir} ${Math.abs(delta.scoreChange)} (${delta.prev.score}→${currentRun.score})`);
    console.log('');
  } else if (!delta) {
    console.log('  ○ First run — future runs will show improvement tracking\n');
  }

  renderTerminal(report);

  // Cost alerts (--budget)
  if (flags.budget !== null) {
    const avgDaily = costAnalysis.totalCost / Math.max(dailyFromJSONL.length, 1);
    const configDir = join(homedir(), '.cchubber');
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, 'config.json');
    let config = {};
    try { config = JSON.parse(readFileSync(configPath, 'utf-8')); } catch {}
    config.budget = flags.budget;
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    console.log(`  Budget: $${flags.budget.toFixed(2)}/day (saved to ${configPath})`);
    if (avgDaily > flags.budget) {
      console.log(`  ⚠ OVER BUDGET: avg $${avgDaily.toFixed(2)}/day exceeds $${flags.budget.toFixed(2)} limit`);
    } else {
      console.log(`  ✓ Under budget: avg $${avgDaily.toFixed(2)}/day`);
    }
    console.log('');
  } else {
    // Check saved budget from config
    try {
      const configPath = join(homedir(), '.cchubber', 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.budget) {
        const avgDaily = costAnalysis.totalCost / Math.max(dailyFromJSONL.length, 1);
        if (avgDaily > config.budget) {
          console.log(`  ⚠ OVER BUDGET: avg $${avgDaily.toFixed(2)}/day exceeds $${config.budget.toFixed(2)} saved limit`);
          console.log('');
        }
      }
    } catch {}
  }

  // Anonymous telemetry (opt out: --no-telemetry or CC_HUBBER_TELEMETRY=0)
  if (shouldSendTelemetry(flags)) {
    console.log('  ○ Sharing anonymous stats...');
    await sendTelemetry(report, VERSION);
    console.log('  ✓ Stats shared (opt out: --no-telemetry)');
  }

  // Default report output: ~/.cchubber/reports/cchubber-report-YYYY-MM-DD.html
  let outputPath;
  if (flags.output) {
    outputPath = flags.output;
  } else {
    const dateStr = new Date().toISOString().slice(0, 10);
    const reportsDir = join(homedir(), '.cchubber', 'reports');
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
    outputPath = join(reportsDir, `cchubber-report-${dateStr}.html`);
  }
  const html = renderHTML(report);
  writeFileSync(outputPath, html, 'utf-8');
  console.log(`\n  ✓ Report saved to: ${outputPath}`);

  if (!flags.noOpen) {
    openInBrowser(outputPath);
    console.log('  ✓ Opened in browser\n');
  }
}

function getClaudeDir() {
  const home = homedir();
  return join(home, '.claude');
}

function openInBrowser(filePath) {
  const p = platform();
  try {
    if (p === 'win32') {
      spawn('cmd', ['/c', 'start', '', filePath], { stdio: 'ignore', detached: true }).unref();
    } else if (p === 'darwin') {
      spawn('open', [filePath], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [filePath], { stdio: 'ignore', detached: true }).unref();
    }
  } catch {
    console.log('  ○ Could not auto-open browser. Open the file manually.');
  }
}

/**
 * Watch mode: poll Claude Code JSONL files and print live cost/cache updates.
 * This is a stub — future versions will use a rich terminal UI (blessed/ink).
 */
async function watchMode() {
  const claudeDir = getClaudeDir();
  if (!existsSync(claudeDir)) {
    console.error('  ✗ Claude Code data directory not found.');
    process.exit(1);
  }

  const pricing = await fetchPricing();
  console.log(`
    /\\  ◉  /\\
   /  \\ ~ /  \\   CC Hubber WATCH MODE
   \\  /   \\  /   Polling every 10s... (Ctrl+C to stop)
    \\/     \\/
  `);

  let lastEntryCount = 0;
  const pollInterval = 10_000;

  const poll = () => {
    try {
      const entries = readAllJSONL(claudeDir);
      const newCount = entries.length;

      if (newCount !== lastEntryCount) {
        const now = new Date().toLocaleTimeString();
        const daily = aggregateDaily(entries);
        const models = aggregateByModel(entries);
        const costAnalysis = analyzeUsage(null, [], 1, daily, models);

        const todayCost = daily.length > 0 ? daily[daily.length - 1] : null;
        const todayStr = todayCost ? `$${(todayCost.inputTokens * 0.000003 + todayCost.outputTokens * 0.000015).toFixed(4)}` : '$0.00';

        console.log(`  [${now}] ${newCount} entries (+${newCount - lastEntryCount}) | Today: ${todayStr} | Grade: ${costAnalysis.grade || '?'}`);

        // Check budget
        try {
          const configPath = join(homedir(), '.cchubber', 'config.json');
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          if (config.budget) {
            const avgDaily = costAnalysis.totalCost / Math.max(daily.length, 1);
            if (avgDaily > config.budget) {
              console.log(`  ⚠ BUDGET ALERT: $${avgDaily.toFixed(2)}/day > $${config.budget.toFixed(2)} limit`);
            }
          }
        } catch {}

        lastEntryCount = newCount;
      }
    } catch (err) {
      console.error(`  ✗ Poll error: ${err.message}`);
    }
  };

  poll();
  setInterval(poll, pollInterval);
}

// Entry point
if (flags.watch) {
  watchMode().catch((err) => {
    console.error('\n  ✗ Watch error:', err.message);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error('\n  ✗ Error:', err.message);
    process.exit(1);
  });
}
