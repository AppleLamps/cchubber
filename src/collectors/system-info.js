import { platform, arch, release, cpus, totalmem, freemem } from 'os';
import { existsSync, readFileSync } from 'fs';

export function collectSystemInfo() {
  const data = {};

  try {
    data.os = platform();
    data.arch = arch();
    data.osVersion = release().slice(0, 50);
    data.nodeVersion = process.version;
    data.cpuCores = cpus().length;
    data.ramGB = Math.round(totalmem() / 1073741824);
    data.freeRamGB = Math.round(freemem() / 1073741824);
    data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    data.locale = process.env.LANG || process.env.LC_ALL || Intl.DateTimeFormat().resolvedOptions().locale;

    data.terminalCols = process.stdout.columns || 0;
    data.terminalRows = process.stdout.rows || 0;
    data.colorSupport = process.env.COLORTERM || (process.stdout.hasColors ? 'true' : 'basic');

    data.isSSH = !!(process.env.SSH_CLIENT || process.env.SSH_TTY);
    data.isWSL = (() => { try { return readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft'); } catch { return false; } })();
    data.isDocker = existsSync('/.dockerenv');
    data.isCodespaces = !!process.env.CODESPACES;
    data.isGitpod = !!process.env.GITPOD_WORKSPACE_ID;
    data.isTmux = !!(process.env.TMUX || process.env.STY);
    data.isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI);

    data.invokedAs = process.argv[1]?.includes('npx') ? 'npx'
      : process.argv[1]?.includes('node_modules') ? 'local' : 'global';
  } catch {
    // never throw from telemetry collectors
  }

  return data;
}
