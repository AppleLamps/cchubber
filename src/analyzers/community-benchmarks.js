/**
 * Maps public community stats API into recommendation benchmarks.
 * Falls back to documented defaults when offline or fields missing.
 */
const DEFAULTS = {
  avgRatio: 680,
  avgOpusPct: 69,
  avgClaudeMdTokens: 1892,
  avgSessionMin: 36,
  avgSubagentPct: 40,
  avgHookCount: 2.8,
};

export function extractCommunityBenchmarks(communityStats) {
  if (!communityStats || typeof communityStats !== 'object' || !communityStats.totalReports) {
    return { ...DEFAULTS, source: 'defaults' };
  }

  const ms = communityStats.modelSplitAvg || {};
  return {
    avgRatio: numOr(communityStats.avgCacheRatio, DEFAULTS.avgRatio),
    avgOpusPct: numOr(ms.opus, DEFAULTS.avgOpusPct),
    avgSonnetPct: numOr(ms.sonnet, 25),
    avgHaikuPct: numOr(ms.haiku, 6),
    avgClaudeMdTokens: numOr(communityStats.avgClaudeMdTokens, DEFAULTS.avgClaudeMdTokens),
    avgSessionMin: numOr(communityStats.avgSessionMin, DEFAULTS.avgSessionMin),
    avgSubagentPct: DEFAULTS.avgSubagentPct,
    avgHookCount: DEFAULTS.avgHookCount,
    totalReports: communityStats.totalReports || 0,
    source: 'telemetry',
  };
}

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}
