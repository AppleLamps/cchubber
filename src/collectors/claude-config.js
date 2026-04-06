import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function collectClaudeConfig(claudeDir) {
  const data = {};

  try {
    if (!claudeDir) claudeDir = join(homedir(), '.claude');

    // Claude Code version
    try {
      const statsCache = join(claudeDir, 'stats-cache.json');
      if (existsSync(statsCache)) {
        const raw = JSON.parse(readFileSync(statsCache, 'utf-8'));
        data.ccVersion = raw.version || null;
      } else {
        data.ccVersion = null;
      }
    } catch { data.ccVersion = null; }

    // Global settings
    const settingsPath = join(claudeDir, 'settings.json');
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        data.hasSettings = true;

        // MCP servers
        if (settings.mcpServers) {
          const mcpNames = Object.keys(settings.mcpServers);
          data.mcpServerCount = mcpNames.length;
          data.mcpServers = mcpNames;
        } else {
          data.mcpServerCount = 0;
          data.mcpServers = [];
        }

        // Hooks
        data.hasHooks = !!(settings.hooks && Object.keys(settings.hooks).length > 0);
        data.hookCount = settings.hooks ? Object.values(settings.hooks).flat().length : 0;

        // Model & permissions
        data.defaultModel = settings.model || null;
        data.hasCustomPermissions = !!settings.permissions;
      } catch {
        data.hasSettings = false;
      }
    } else {
      data.hasSettings = false;
      data.mcpServerCount = 0;
      data.mcpServers = [];
      data.hasHooks = false;
      data.hookCount = 0;
      data.defaultModel = null;
      data.hasCustomPermissions = false;
    }

    // Local MCP servers (from .claude.json in cwd)
    try {
      const localSettings = join(process.cwd(), '.claude.json');
      if (existsSync(localSettings)) {
        const local = JSON.parse(readFileSync(localSettings, 'utf-8'));
        if (local.mcpServers) {
          data.localMcpCount = Object.keys(local.mcpServers).length;
          data.localMcpServers = Object.keys(local.mcpServers);
        } else {
          data.localMcpCount = 0;
          data.localMcpServers = [];
        }
      } else {
        data.localMcpCount = 0;
        data.localMcpServers = [];
      }
    } catch {
      data.localMcpCount = 0;
      data.localMcpServers = [];
    }

    // Skills
    try {
      const skillsDir = join(claudeDir, 'skills');
      if (existsSync(skillsDir)) {
        data.skillCount = readdirSync(skillsDir).filter(f => {
          try { return statSync(join(skillsDir, f)).isDirectory(); } catch { return false; }
        }).length;
      } else {
        data.skillCount = 0;
      }
    } catch { data.skillCount = 0; }

    // .claudeignore
    data.hasClaudeignore = existsSync(join(process.cwd(), '.claudeignore'));

    // Project count
    const projectsDir = join(claudeDir, 'projects');
    try {
      if (existsSync(projectsDir)) {
        data.totalProjectDirs = readdirSync(projectsDir).filter(f => {
          try { return statSync(join(projectsDir, f)).isDirectory(); } catch { return false; }
        }).length;
      } else {
        data.totalProjectDirs = 0;
      }
    } catch { data.totalProjectDirs = 0; }

    // OAuth credentials
    data.hasOauthCreds = existsSync(join(claudeDir, '.credentials.json'));

    // Global CLAUDE.md
    data.hasGlobalClaudeMd = existsSync(join(claudeDir, 'CLAUDE.md'));

    // Session files
    try {
      const sessionMetaDir = join(claudeDir, 'usage-data', 'session-meta');
      if (existsSync(sessionMetaDir)) {
        data.totalSessionFiles = readdirSync(sessionMetaDir).filter(f => f.endsWith('.json')).length;
      } else {
        data.totalSessionFiles = 0;
      }
    } catch { data.totalSessionFiles = 0; }

    // Memory & commands
    data.hasMemory = existsSync(join(claudeDir, 'memory'));
    data.hasCustomCommands = existsSync(join(claudeDir, 'commands'));

    // Keybindings
    data.hasKeybindings = existsSync(join(claudeDir, 'keybindings.json'));

    // Auth method
    try {
      if (existsSync(join(claudeDir, '.credentials.json'))) {
        const creds = JSON.parse(readFileSync(join(claudeDir, '.credentials.json'), 'utf-8'));
        data.authMethod = creds.apiKey ? 'apikey' : creds.oauthToken ? 'oauth' : 'unknown';
      } else {
        data.authMethod = 'none';
      }
    } catch { data.authMethod = 'none'; }

    // CC installation age
    try {
      const configPath = join(claudeDir, 'settings.json');
      if (existsSync(configPath)) {
        const age = Date.now() - statSync(configPath).birthtimeMs;
        data.ccInstallDays = Math.round(age / 86400000);
      } else {
        data.ccInstallDays = null;
      }
    } catch { data.ccInstallDays = null; }

    // Total conversations (JSONL count across projects)
    try {
      if (existsSync(projectsDir)) {
        data.totalConversations = readdirSync(projectsDir).reduce((count, d) => {
          try { return count + readdirSync(join(projectsDir, d)).filter(f => f.endsWith('.jsonl')).length; } catch { return count; }
        }, 0);
      } else {
        data.totalConversations = 0;
      }
    } catch { data.totalConversations = 0; }

    // JSONL total size
    try {
      let totalJSONLSize = 0;
      if (existsSync(projectsDir)) {
        for (const d of readdirSync(projectsDir)) {
          const pDir = join(projectsDir, d);
          try {
            if (!statSync(pDir).isDirectory()) continue;
            for (const f of readdirSync(pDir)) {
              if (f.endsWith('.jsonl')) {
                try { totalJSONLSize += statSync(join(pDir, f)).size; } catch {}
              }
            }
          } catch {}
        }
      }
      data.jsonlTotalMB = Math.round(totalJSONLSize / 1048576);
    } catch { data.jsonlTotalMB = 0; }

  } catch {
    // never throw from telemetry collectors
  }

  return data;
}
