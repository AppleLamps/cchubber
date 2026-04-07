import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractCommunityBenchmarks } from '../src/analyzers/community-benchmarks.js';
import { analyzeCrossToolSynthesis } from '../src/analyzers/cross-tool-synthesis.js';
import { enrichProjectCosts } from '../src/analyzers/cost-calculator.js';

describe('extractCommunityBenchmarks', () => {
  it('uses defaults when stats missing', () => {
    const b = extractCommunityBenchmarks(null);
    assert.equal(b.source, 'defaults');
    assert.equal(b.avgRatio, 680);
  });

  it('uses defaults when stats have no totalReports', () => {
    const b = extractCommunityBenchmarks({});
    assert.equal(b.source, 'defaults');
  });

  it('maps telemetry fields', () => {
    const b = extractCommunityBenchmarks({
      totalReports: 100,
      avgCacheRatio: 700,
      avgClaudeMdTokens: 2000,
      avgSessionMin: 40,
      modelSplitAvg: { opus: 72, sonnet: 20, haiku: 8 },
    });
    assert.equal(b.source, 'telemetry');
    assert.equal(b.avgRatio, 700);
    assert.equal(b.avgOpusPct, 72);
    assert.equal(b.totalReports, 100);
  });
});

describe('analyzeCrossToolSynthesis', () => {
  it('returns unavailable when no tools', () => {
    const r = analyzeCrossToolSynthesis([], { totalCost: 10, dailyCosts: [] });
    assert.equal(r.available, false);
  });
});

describe('enrichProjectCosts', () => {
  it('adds estimatedCost from per-model tokens', () => {
    const out = enrichProjectCosts([
      {
        name: 'p1',
        models: {
          'claude-sonnet-4-6': {
            inputTokens: 1_000_000,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
          },
        },
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
    ]);
    assert.ok(out[0].estimatedCost > 0);
  });
});
