import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEnvironment } from '../src/analyzers/environment-analyzer.js';

describe('analyzeEnvironment', () => {
  it('returns a structured environment profile', () => {
    const env = analyzeEnvironment(null);
    assert.equal(env.available, true);
    assert.equal(typeof env.system, 'object');
    assert.equal(typeof env.git, 'object');
    assert.equal(typeof env.project, 'object');
    assert.ok(Array.isArray(env.languages));
    assert.ok(Array.isArray(env.frameworks));
    assert.ok(Array.isArray(env.aiTools));
    assert.ok(Array.isArray(env.maturitySignals));
    assert.equal(typeof env.claude, 'object');
  });

  it('has valid system info', () => {
    const env = analyzeEnvironment(null);
    assert.ok(['win32', 'darwin', 'linux'].includes(env.system.os));
    assert.equal(typeof env.system.cpuCores, 'number');
    assert.equal(typeof env.system.editor, 'string');
  });

  it('detects git repo status', () => {
    const env = analyzeEnvironment(null);
    assert.equal(typeof env.git.isGitRepo, 'boolean');
  });

  it('has Claude config info', () => {
    const env = analyzeEnvironment(null);
    assert.equal(typeof env.claude.authMethod, 'string');
    assert.equal(typeof env.claude.mcpServerCount, 'number');
  });
});
