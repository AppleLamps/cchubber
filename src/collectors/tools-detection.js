import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync, execSync } from 'child_process';

/**
 * Run a CLI command and return trimmed stdout, or null on failure.
 */
function tryExec(cmd, args) {
  try {
    if (process.platform === 'win32') {
      // On Windows, execFileSync can't find .cmd/.ps1 scripts without shell.
      const full = [cmd, ...args].join(' ');
      return execSync(full, { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim().split('\n')[0];
    }
    return execFileSync(cmd, args, { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().split('\n')[0];
  } catch { return null; }
}

/**
 * Scan an extensions directory for a matching publisher/name pattern.
 * Extension folders follow the pattern: publisher.name-version
 * Returns the highest version found, or null.
 */
function findExtensionVersion(extDir, pattern) {
  try {
    if (!existsSync(extDir)) return null;
    const matches = readdirSync(extDir)
      .filter(f => pattern.test(f))
      .map(f => {
        const m = f.match(/-(\d+\.\d+\.\d+)$/);
        return m ? { folder: f, version: m[1] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    return matches.length > 0 ? matches[0].version : 'installed';
  } catch { return null; }
}

/**
 * Try to read version from a JSON file's "version" field.
 */
function readJsonVersion(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return data.version || null;
  } catch { return null; }
}

export function collectToolsInfo() {
  const data = {};

  try {
    const home = homedir();
    const isWin = process.platform === 'win32';
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');

    // Editor/IDE detection (from env vars)
    data.editor = process.env.VSCODE_PID ? 'vscode'
      : process.env.CURSOR_TRACE ? 'cursor'
      : process.env.JETBRAINS_IDE ? 'jetbrains'
      : process.env.WINDSURF_PID ? 'windsurf'
      : process.env.TERM_PROGRAM || 'terminal';

    data.shell = process.env.SHELL?.split('/').pop() || (process.env.PSModulePath ? 'powershell' : 'unknown');

    // Productivity tool
    data.usesObsidian = existsSync(join(home, '.obsidian'))
      || existsSync(join(home, 'Documents', 'Obsidian'))
      || existsSync(join(home, 'Obsidian'));

    // Extension directories for VS Code, Cursor, Windsurf
    const vscodeExtDir = join(home, '.vscode', 'extensions');
    const cursorExtDir = join(home, '.cursor', 'extensions');
    const windsurfExtDir = join(home, '.windsurf', 'extensions');

    // --- AI Tool Detection with Versions ---
    data.aiTools = [];

    // Claude Code — CLI version
    const claudeVersion = tryExec('claude', ['--version']);
    if (claudeVersion) {
      const ver = claudeVersion.match(/^([\d.]+)/);
      data.aiTools.push({ name: 'Claude Code', version: ver ? ver[1] : claudeVersion, source: 'cli' });
    }

    // GitHub Copilot — VS Code/Cursor extension
    const copilotPaths = [
      existsSync(join(home, '.config', 'github-copilot')),
      existsSync(join(home, '.copilot')),
    ];
    const copilotVscVer = findExtensionVersion(vscodeExtDir, /^github\.copilot-\d/);
    const copilotCurVer = findExtensionVersion(cursorExtDir, /^github\.copilot(?:-chat)?-\d/);
    if (copilotVscVer || copilotCurVer || copilotPaths.some(Boolean)) {
      data.aiTools.push({
        name: 'GitHub Copilot',
        version: copilotVscVer || copilotCurVer || 'installed',
        source: copilotVscVer ? 'vscode-ext' : copilotCurVer ? 'cursor-ext' : 'config',
      });
    }

    // Cursor — app package.json or config dir
    const cursorPkgPaths = isWin
      ? [join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'package.json'),
         join(localAppData, 'cursor', 'resources', 'app', 'package.json')]
      : ['/Applications/Cursor.app/Contents/Resources/app/package.json'];
    let cursorVer = null;
    for (const p of cursorPkgPaths) { cursorVer = readJsonVersion(p); if (cursorVer) break; }
    if (cursorVer || existsSync(join(home, '.cursor'))) {
      data.aiTools.push({ name: 'Cursor', version: cursorVer || 'installed', source: cursorVer ? 'package.json' : 'config' });
    }

    // Cline / Roo-Cline — VS Code or Cursor extension
    const clineVscVer = findExtensionVersion(vscodeExtDir, /cline.*-\d/i);
    const clineCurVer = findExtensionVersion(cursorExtDir, /cline.*-\d/i);
    if (clineVscVer || clineCurVer || existsSync(join(home, '.cline'))) {
      data.aiTools.push({
        name: 'Cline',
        version: clineVscVer || clineCurVer || 'installed',
        source: clineVscVer ? 'vscode-ext' : clineCurVer ? 'cursor-ext' : 'config',
      });
    }

    // Windsurf — app package.json or config dir
    const windsurfPkgPaths = isWin
      ? [join(localAppData, 'Programs', 'windsurf', 'resources', 'app', 'package.json')]
      : ['/Applications/Windsurf.app/Contents/Resources/app/package.json'];
    let windsurfVer = null;
    for (const p of windsurfPkgPaths) { windsurfVer = readJsonVersion(p); if (windsurfVer) break; }
    if (windsurfVer || existsSync(join(home, '.windsurf'))) {
      data.aiTools.push({ name: 'Windsurf', version: windsurfVer || 'installed', source: windsurfVer ? 'package.json' : 'config' });
    }

    // Continue — config dir + package.json version
    const continueVer = readJsonVersion(join(home, '.continue', 'package.json'));
    const continueExtVer = findExtensionVersion(vscodeExtDir, /continue.*dev.*-\d/i)
      || findExtensionVersion(cursorExtDir, /continue.*-\d/i);
    if (continueVer || continueExtVer || existsSync(join(home, '.continue'))) {
      data.aiTools.push({
        name: 'Continue',
        version: continueExtVer || continueVer || 'installed',
        source: continueExtVer ? 'extension' : continueVer ? 'package.json' : 'config',
      });
    }

    // Codex CLI
    const codexVersion = tryExec('codex', ['--version']);
    if (codexVersion) {
      const ver = codexVersion.match(/([\d.]+)/);
      data.aiTools.push({ name: 'Codex CLI', version: ver ? ver[1] : codexVersion, source: 'cli' });
    } else if (existsSync(join(home, '.codex'))) {
      data.aiTools.push({ name: 'Codex CLI', version: 'installed', source: 'config' });
    }

    // Gemini CLI
    const geminiVersion = tryExec('gemini', ['--version']);
    if (geminiVersion) {
      const ver = geminiVersion.match(/([\d.]+)/);
      data.aiTools.push({ name: 'Gemini CLI', version: ver ? ver[1] : geminiVersion, source: 'cli' });
    } else if (existsSync(join(home, '.gemini'))) {
      data.aiTools.push({ name: 'Gemini CLI', version: 'installed', source: 'config' });
    }

    // Aider
    const aiderVersion = tryExec('aider', ['--version']);
    if (aiderVersion) {
      const ver = aiderVersion.match(/([\d.]+)/);
      data.aiTools.push({ name: 'Aider', version: ver ? ver[1] : aiderVersion, source: 'cli' });
    } else if (existsSync(join(home, '.aider'))) {
      data.aiTools.push({ name: 'Aider', version: 'installed', source: 'config' });
    }

    // Amazon Q
    if (existsSync(join(home, '.aws', 'amazonq'))) {
      data.aiTools.push({ name: 'Amazon Q', version: 'installed', source: 'config' });
    }

    // Tabnine
    if (existsSync(join(home, '.tabnine'))) {
      data.aiTools.push({ name: 'Tabnine', version: 'installed', source: 'config' });
    }

    // Cody / Sourcegraph
    if (existsSync(join(home, '.sourcegraph'))) {
      data.aiTools.push({ name: 'Cody', version: 'installed', source: 'config' });
    }

    // Legacy boolean flags for backward compat
    data.usesCopilot = data.aiTools.some(t => t.name === 'GitHub Copilot');
    data.usesCursor = data.aiTools.some(t => t.name === 'Cursor');
    data.usesCline = data.aiTools.some(t => t.name === 'Cline');
    data.usesWindsurf = data.aiTools.some(t => t.name === 'Windsurf');
    data.usesContinue = data.aiTools.some(t => t.name === 'Continue');
    data.usesCodex = data.aiTools.some(t => t.name === 'Codex CLI');
    data.usesGeminiCLI = data.aiTools.some(t => t.name === 'Gemini CLI');
    data.usesAider = data.aiTools.some(t => t.name === 'Aider');
    data.usesTabnine = data.aiTools.some(t => t.name === 'Tabnine');
    data.usesCody = data.aiTools.some(t => t.name === 'Cody');
    data.usesAmazonQ = data.aiTools.some(t => t.name === 'Amazon Q');
  } catch {
    // never throw from telemetry collectors
  }

  return data;
}
