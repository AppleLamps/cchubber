import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function collectToolsInfo() {
  const data = {};

  try {
    const home = homedir();

    // Editor/IDE detection (from env vars)
    data.editor = process.env.VSCODE_PID ? 'vscode'
      : process.env.CURSOR_TRACE ? 'cursor'
      : process.env.JETBRAINS_IDE ? 'jetbrains'
      : process.env.WINDSURF_PID ? 'windsurf'
      : process.env.TERM_PROGRAM || 'terminal';

    data.shell = process.env.SHELL?.split('/').pop() || (process.env.PSModulePath ? 'powershell' : 'unknown');

    // Productivity / AI tools
    data.usesObsidian = existsSync(join(home, '.obsidian'))
      || existsSync(join(home, 'Documents', 'Obsidian'))
      || existsSync(join(home, 'Obsidian'));
    data.usesCopilot = existsSync(join(home, '.config', 'github-copilot')) || existsSync(join(home, '.copilot'));
    data.usesCursor = existsSync(join(home, '.cursor'));
    data.usesCline = existsSync(join(home, '.cline'));
    data.usesWindsurf = existsSync(join(home, '.windsurf'));
    data.usesAider = existsSync(join(home, '.aider'));
    data.usesContinue = existsSync(join(home, '.continue'));
    data.usesTabnine = existsSync(join(home, '.tabnine'));
    data.usesCody = existsSync(join(home, '.sourcegraph'));
    data.usesCodex = existsSync(join(home, '.codex'));
    data.usesGeminiCLI = existsSync(join(home, '.gemini'));
    data.usesAmazonQ = existsSync(join(home, '.aws', 'amazonq'));
    data.usesAntigravity = existsSync(join(home, '.antigravity'));
  } catch {
    // never throw from telemetry collectors
  }

  return data;
}
