import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectGitInfo } from '../src/collectors/git-info.js';
import { collectProjectInfo } from '../src/collectors/project-info.js';
import { collectToolsInfo } from '../src/collectors/tools-detection.js';
import { collectSystemInfo } from '../src/collectors/system-info.js';
import { collectClaudeConfig } from '../src/collectors/claude-config.js';

describe('collectGitInfo', () => {
  it('returns an object with expected keys', () => {
    const info = collectGitInfo();
    assert.equal(typeof info, 'object');
    assert.equal(typeof info.isGitRepo, 'boolean');
    if (info.isGitRepo) {
      assert.equal(typeof info.gitCommitCount, 'number');
      assert.equal(typeof info.gitBranchCount, 'number');
      assert.equal(typeof info.gitContributors, 'number');
    }
  });

  it('never throws', () => {
    assert.doesNotThrow(() => collectGitInfo());
  });
});

describe('collectProjectInfo', () => {
  it('returns an object with hasPackageJson', () => {
    const info = collectProjectInfo();
    assert.equal(typeof info, 'object');
    assert.equal(typeof info.hasPackageJson, 'boolean');
  });

  it('detects package manager', () => {
    const info = collectProjectInfo();
    assert.ok(['npm', 'yarn', 'pnpm', 'bun', 'none'].includes(info.packageManager));
  });

  it('never throws', () => {
    assert.doesNotThrow(() => collectProjectInfo());
  });
});

describe('collectToolsInfo', () => {
  it('returns editor and shell', () => {
    const info = collectToolsInfo();
    assert.equal(typeof info.editor, 'string');
    assert.equal(typeof info.shell, 'string');
  });

  it('returns boolean AI tool flags', () => {
    const info = collectToolsInfo();
    assert.equal(typeof info.usesCopilot, 'boolean');
    assert.equal(typeof info.usesCursor, 'boolean');
  });

  it('returns aiTools array with name and version', () => {
    const info = collectToolsInfo();
    assert.ok(Array.isArray(info.aiTools));
    for (const tool of info.aiTools) {
      assert.equal(typeof tool.name, 'string');
      assert.equal(typeof tool.version, 'string');
      assert.equal(typeof tool.source, 'string');
    }
  });

  it('never throws', () => {
    assert.doesNotThrow(() => collectToolsInfo());
  });
});

describe('collectSystemInfo', () => {
  it('returns OS and hardware info', () => {
    const info = collectSystemInfo();
    assert.ok(['win32', 'darwin', 'linux'].includes(info.os));
    assert.equal(typeof info.cpuCores, 'number');
    assert.ok(info.cpuCores > 0);
    assert.equal(typeof info.ramGB, 'number');
    assert.ok(info.ramGB > 0);
  });

  it('returns node version', () => {
    const info = collectSystemInfo();
    assert.ok(info.nodeVersion.startsWith('v'));
  });

  it('never throws', () => {
    assert.doesNotThrow(() => collectSystemInfo());
  });
});

describe('collectClaudeConfig', () => {
  it('returns an object even with invalid dir', () => {
    const info = collectClaudeConfig('/nonexistent/path');
    assert.equal(typeof info, 'object');
  });

  it('never throws', () => {
    assert.doesNotThrow(() => collectClaudeConfig(null));
  });
});
