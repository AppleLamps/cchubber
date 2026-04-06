import https from 'https';
import { platform, arch, homedir } from 'os';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { collectGitInfo } from './collectors/git-info.js';
import { collectProjectInfo } from './collectors/project-info.js';
import { collectToolsInfo } from './collectors/tools-detection.js';
import { collectSystemInfo } from './collectors/system-info.js';
import { collectClaudeConfig } from './collectors/claude-config.js';

// Anonymous usage telemetry — no PII, no tokens, no file contents.
// Opt out: npx cchubber --no-telemetry
// Or set env: CC_HUBBER_TELEMETRY=0

const TELEMETRY_URL = 'https://cchubber-telemetry.asmirkhan087.workers.dev/collect';

export function shouldSendTelemetry(flags) {
  if (flags.noTelemetry) return false;
  if (process.env.CC_HUBBER_TELEMETRY === '0') return false;
  if (process.env.DO_NOT_TRACK === '1') return false;

  // Throttle: once per 24 hours per machine
  const stampFile = join(homedir(), '.cchubber-last-telemetry');
  try {
    if (existsSync(stampFile)) {
      const last = parseInt(readFileSync(stampFile, 'utf-8').trim());
      if (Date.now() - last < 86400000) return false; // <24h since last send
    }
  } catch {}

  return true;
}

function markTelemetrySent() {
  try { writeFileSync(join(homedir(), '.cchubber-last-telemetry'), String(Date.now())); } catch {}
}

export function sendTelemetry(report, version) {
  const payload = {
    v: version || 'unknown',
    uid: getOrCreateUID(),
    ts: new Date().toISOString(),
    os: platform(),
    arch: arch(),

    // Aggregated stats — no file contents, no project names, no personal data
    // Usage profile
    grade: report.cacheHealth?.grade?.letter || '?',
    cacheRatio: report.cacheHealth?.efficiencyRatio || 0,
    cacheHitRate: report.cacheHealth?.cacheHitRate || 0,
    cacheBreaks: report.cacheHealth?.totalCacheBreaks || 0,
    estimatedBreaks: report.cacheHealth?.estimatedBreaks || 0,
    cacheSaved: report.cacheHealth?.savings?.fromCaching || 0,
    cacheWasted: report.cacheHealth?.savings?.wastedFromBreaks || 0,

    // Cost & scale
    activeDays: report.costAnalysis?.activeDays || 0,
    totalCostBucket: costBucket(report.costAnalysis?.totalCost || 0),
    avgDailyCost: Math.round(report.costAnalysis?.avgDailyCost || 0),
    peakDayCost: Math.round(report.costAnalysis?.peakDay?.cost || 0),
    totalMessages: report.costAnalysis?.dailyCosts?.reduce((s, d) => s + (d.messageCount || 0), 0) || 0,

    // Model usage (key for understanding subscription behavior)
    modelSplit: modelSplitSummary(report.costAnalysis?.modelCosts || {}),
    modelCount: Object.keys(report.costAnalysis?.modelCosts || {}).length,
    opusPct: report.modelRouting?.opusPct || 0,
    sonnetPct: report.modelRouting?.sonnetPct || 0,
    haikuPct: report.modelRouting?.haikuPct || 0,
    subagentPct: report.modelRouting?.subagentPct || 0,

    // CLAUDE.md (how people configure their AI)
    claudeMdTokens: report.claudeMdStack?.totalTokensEstimate || 0,
    claudeMdBytes: report.claudeMdStack?.totalBytes || 0,
    claudeMdSections: report.claudeMdStack?.globalSections?.length || 0,
    claudeMdFiles: report.claudeMdStack?.files?.length || 0,
    claudeMdCostCached: report.claudeMdStack?.costPerMessage?.cached || 0,
    claudeMdCostUncached: report.claudeMdStack?.costPerMessage?.uncached || 0,

    // Session patterns (how people work)
    sessionCount: report.sessionIntel?.totalSessions || 0,
    avgSessionMin: report.sessionIntel?.avgDuration || 0,
    medianSessionMin: report.sessionIntel?.medianDuration || 0,
    p90SessionMin: report.sessionIntel?.p90Duration || 0,
    maxSessionMin: report.sessionIntel?.maxDuration || 0,
    longSessionPct: report.sessionIntel?.longSessionPct || 0,
    avgToolsPerSession: report.sessionIntel?.avgToolsPerSession || 0,
    linesPerHour: report.sessionIntel?.linesPerHour || 0,
    peakOverlapPct: report.sessionIntel?.peakOverlapPct || 0,
    topTools: (report.sessionIntel?.topTools || []).slice(0, 6).map(t => t.name),

    // Scale indicators
    projectCount: report.projectBreakdown?.length || 0,
    anomalyCount: report.anomalies?.anomalies?.length || 0,
    trend: report.anomalies?.trend || 'stable',
    inflectionDir: report.inflection?.direction || 'none',
    inflectionMult: report.inflection?.multiplier || 0,
    entryCount: report.costAnalysis?.dailyCosts?.length || 0,
    recCount: report.recommendations?.length || 0,

    // Rate limits (shows subscription tier indirectly)
    hasOauth: !!report.oauthUsage,
    rateLimit5h: report.oauthUsage?.five_hour?.utilization || null,
    rateLimit7d: report.oauthUsage?.seven_day?.utilization || null,

    // Token volumes (bucketed for anonymity)
    totalInputBucket: tokenBucket(report.cacheHealth?.totals?.input || 0),
    totalOutputBucket: tokenBucket(report.cacheHealth?.totals?.output || 0),
    totalCacheReadBucket: tokenBucket(report.cacheHealth?.totals?.cacheRead || 0),
    totalCacheWriteBucket: tokenBucket(report.cacheHealth?.totals?.cacheWrite || 0),

    // Hour distribution (when people work — 24 values)
    hourDistribution: report.sessionIntel?.hourDistribution || [],

    // Which recommendations fired (shows common problems)
    recsTriggered: (report.recommendations || []).map(r => r.title.slice(0, 50)),

    // CLAUDE.md top sections by tokens (what people put in their rules)
    claudeMdTopSections: (report.claudeMdStack?.globalSections || []).slice(0, 5).map(s => ({
      name: s.name.slice(0, 40),
      tokens: s.tokens,
      lines: s.lines,
    })),

    // Per-message cost impact
    msgCostCached: report.claudeMdStack?.costPerMessage?.cached || 0,
    msgCostUncached: report.claudeMdStack?.costPerMessage?.uncached || 0,
    dailyCost200: report.claudeMdStack?.costPerMessage?.dailyCached200 || 0,

    // Daily cost trend (last 30 days — shows impact curve)
    dailyCostTrend: (report.costAnalysis?.dailyCosts || []).slice(-30).map(d => ({
      d: d.date, c: Math.round(d.cost * 100) / 100, r: d.cacheOutputRatio || 0
    })),

    // Environment deep dive
    ...gatherEnvironmentData(report),
  };

  // Returns a promise that resolves when the request completes (or times out)
  // CLI must await this before exiting, otherwise the process kills the request
  return new Promise((resolve) => {
    try {
      const data = JSON.stringify(payload);
      const url = new URL(TELEMETRY_URL);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, (res) => {
        res.resume(); // drain response
        res.on('end', () => { markTelemetrySent(); resolve(); });
      });
      req.on('error', () => resolve()); // silent fail, still resolve
      req.setTimeout(4000, () => { req.destroy(); resolve(); });
      req.write(data);
      req.end();
    } catch {
      resolve(); // never block on telemetry failure
    }
  });
}

function costBucket(cost) {
  // Bucketed so we can't identify individuals by exact cost
  if (cost < 10) return '<10';
  if (cost < 50) return '10-50';
  if (cost < 200) return '50-200';
  if (cost < 500) return '200-500';
  if (cost < 1000) return '500-1K';
  if (cost < 5000) return '1K-5K';
  return '5K+';
}

function getOrCreateUID() {
  // Anonymous install ID — random, no PII. Same approach as Next.js/Turborepo telemetry.
  const idFile = join(homedir(), '.cchubber-uid');
  try {
    if (existsSync(idFile)) return readFileSync(idFile, 'utf-8').trim();
    const uid = 'u_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    writeFileSync(idFile, uid);
    return uid;
  } catch {
    return 'anon_' + Math.random().toString(36).slice(2, 10);
  }
}

function gatherEnvironmentData(report) {
  try {
    const claudeDir = join(homedir(), '.claude');
    return {
      ...collectGitInfo(),
      ...collectProjectInfo(),
      ...collectToolsInfo(),
      ...collectSystemInfo(),
      ...collectClaudeConfig(claudeDir),
      // Report-derived fields
      periodDays: report?.periodDays || 30,
      recCount: report?.recommendations?.length || 0,
    };
  } catch {
    return {};
  }
}

function tokenBucket(tokens) {
  if (tokens < 1e6) return '<1M';
  if (tokens < 10e6) return '1-10M';
  if (tokens < 100e6) return '10-100M';
  if (tokens < 1e9) return '100M-1B';
  if (tokens < 10e9) return '1-10B';
  return '10B+';
}

function modelSplitSummary(modelCosts) {
  const total = Object.values(modelCosts).reduce((s, c) => s + c, 0);
  if (total === 0) return {};
  const split = {};
  for (const [name, cost] of Object.entries(modelCosts)) {
    split[name] = Math.round((cost / total) * 100);
  }
  return split;
}
