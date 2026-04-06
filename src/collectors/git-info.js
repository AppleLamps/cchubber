import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

function execGit(args) {
  return execFileSync('git', args, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
}

export function collectGitInfo() {
  const data = {};

  try {
    const cwd = process.cwd();
    const gitDir = join(cwd, '.git');
    data.isGitRepo = existsSync(gitDir);

    if (data.isGitRepo) {
      const gitConfig = join(gitDir, 'config');
      if (existsSync(gitConfig)) {
        const gc = readFileSync(gitConfig, 'utf-8');
        data.hasGitRemote = gc.includes('[remote');
        data.isGitHub = gc.includes('github.com');
        data.isGitLab = gc.includes('gitlab');
      }

      try {
        data.gitCommitCount = parseInt(execGit(['rev-list', '--count', 'HEAD']).trim()) || 0;
      } catch { data.gitCommitCount = 0; }

      try {
        const branches = execGit(['branch', '--list']).trim();
        data.gitBranchCount = branches ? branches.split('\n').filter(l => l.trim()).length : 0;
      } catch { data.gitBranchCount = 0; }

      try {
        const shortlog = execGit(['shortlog', '-sn', '--all']).trim();
        data.gitContributors = shortlog ? shortlog.split('\n').filter(l => l.trim()).length : 0;
      } catch { data.gitContributors = 0; }

      try {
        const lastCommit = execGit(['log', '-1', '--format=%ct']).trim();
        data.daysSinceLastCommit = lastCommit ? Math.round((Date.now() / 1000 - parseInt(lastCommit)) / 86400) : null;
      } catch { data.daysSinceLastCommit = null; }

      try {
        const url = execGit(['remote', 'get-url', 'origin']).trim();
        if (url.includes('github.com')) data.gitHost = 'github';
        else if (url.includes('gitlab')) data.gitHost = 'gitlab';
        else if (url.includes('bitbucket')) data.gitHost = 'bitbucket';
        else if (url.includes('codeberg')) data.gitHost = 'codeberg';
        else data.gitHost = 'other';
      } catch { data.gitHost = 'none'; }
    } else {
      data.hasGitRemote = false;
      data.isGitHub = false;
      data.isGitLab = false;
      data.gitCommitCount = 0;
      data.gitBranchCount = 0;
      data.gitContributors = 0;
      data.daysSinceLastCommit = null;
      data.gitHost = 'none';
    }
  } catch {
    // never throw from telemetry collectors
  }

  return data;
}
