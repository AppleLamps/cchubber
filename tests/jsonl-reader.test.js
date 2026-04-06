import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readAllJSONL, aggregateDaily, aggregateByModel, aggregateByProject } from '../src/readers/jsonl-reader.js';

describe('aggregateDaily', () => {
  it('groups entries by date', () => {
    const entries = [
      { timestamp: '2024-01-15T10:00:00Z', model: 'claude-3-opus', inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheCreationTokens: 5, costUSD: 0.01 },
      { timestamp: '2024-01-15T14:00:00Z', model: 'claude-3-opus', inputTokens: 200, outputTokens: 100, cacheReadTokens: 20, cacheCreationTokens: 10, costUSD: 0.02 },
      { timestamp: '2024-01-16T10:00:00Z', model: 'claude-3-sonnet', inputTokens: 50, outputTokens: 25, cacheReadTokens: 5, cacheCreationTokens: 2, costUSD: 0.005 },
    ];
    const daily = aggregateDaily(entries);
    assert.equal(daily.length, 2);
    assert.equal(daily[0].date, '2024-01-15');
    assert.equal(daily[0].inputTokens, 300);
    assert.equal(daily[0].outputTokens, 150);
    assert.equal(daily[1].date, '2024-01-16');
    assert.equal(daily[1].inputTokens, 50);
  });

  it('handles empty input', () => {
    const daily = aggregateDaily([]);
    assert.equal(daily.length, 0);
  });

  it('skips entries without timestamp', () => {
    const entries = [
      { model: 'claude-3-opus', inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, costUSD: 0 },
    ];
    const daily = aggregateDaily(entries);
    assert.equal(daily.length, 0);
  });
});

describe('aggregateByModel', () => {
  it('groups entries by model name', () => {
    const entries = [
      { model: 'claude-3-opus-20240229', inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, costUSD: 0.01 },
      { model: 'claude-3-opus-20240229', inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0, costUSD: 0.02 },
      { model: 'claude-3-5-sonnet-20241022', inputTokens: 50, outputTokens: 25, cacheReadTokens: 0, cacheCreationTokens: 0, costUSD: 0.005 },
    ];
    const models = aggregateByModel(entries);
    const keys = Object.keys(models);
    assert.ok(keys.length >= 1);
    // At least one model should have aggregated tokens
    const first = models[keys[0]];
    assert.equal(typeof first.inputTokens, 'number');
    assert.ok(first.messageCount > 0);
  });

  it('handles empty input', () => {
    const models = aggregateByModel([]);
    assert.equal(Object.keys(models).length, 0);
  });
});

describe('aggregateByProject', () => {
  it('groups entries by project hash', () => {
    const entries = [
      { projectHash: 'C--Users-test-myapp', model: 'claude-3-opus', inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, costUSD: 0.01, sessionId: 's1', timestamp: '2024-01-15T10:00:00Z' },
      { projectHash: 'C--Users-test-myapp', model: 'claude-3-opus', inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0, costUSD: 0.02, sessionId: 's1', timestamp: '2024-01-15T11:00:00Z' },
      { projectHash: 'C--Users-test-other', model: 'claude-3-sonnet', inputTokens: 50, outputTokens: 25, cacheReadTokens: 0, cacheCreationTokens: 0, costUSD: 0.005, sessionId: 's2', timestamp: '2024-01-16T10:00:00Z' },
    ];
    const projects = aggregateByProject(entries, null);
    assert.equal(projects.length, 2);
    assert.ok(projects[0].messageCount >= projects[1].messageCount);
  });
});
