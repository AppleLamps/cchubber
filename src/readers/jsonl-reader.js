import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

/**
 * Read all JSONL conversation files from Claude Code's data directories.
 * This is the primary data source — same approach as ccusage (12K stars, proven pattern).
 * Claude Code stores full conversation transcripts with token usage per message.
 */
export function readAllJSONL(claudeDir) {
  const projectsDir = join(claudeDir, 'projects');
  const xdgDir = join(homedir(), '.config', 'claude', 'projects'); // XDG fallback for Linux

  const entries = [];
  const seenMessageIds = new Set();

  // Read from primary location
  if (existsSync(projectsDir)) {
    readProjectsDir(projectsDir, entries, seenMessageIds);
  }

  // XDG fallback (Linux with newer Claude Code)
  if (existsSync(xdgDir) && xdgDir !== projectsDir) {
    readProjectsDir(xdgDir, entries, seenMessageIds);
  }

  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function readProjectsDir(dir, entries, seenIds) {
  try {
    const projectHashes = readdirSync(dir).filter(f => {
      const full = join(dir, f);
      return statSync(full).isDirectory();
    });

    for (const hash of projectHashes) {
      const projectDir = join(dir, hash);

      // Read top-level JSONL files (one per session)
      const jsonlFiles = readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
      for (const file of jsonlFiles) {
        readJsonlFile(join(projectDir, file), basename(file, '.jsonl'), hash, entries, seenIds);
      }

      // Read subagent JSONL files (for Haiku/Sonnet model attribution)
      // Dedup by message ID prevents double-counting
      const subdirs = readdirSync(projectDir).filter(f => {
        try { return statSync(join(projectDir, f)).isDirectory(); } catch { return false; }
      });
      for (const subdir of subdirs) {
        const subagentDir = join(projectDir, subdir, 'subagents');
        if (existsSync(subagentDir)) {
          try {
            const subFiles = readdirSync(subagentDir).filter(f => f.endsWith('.jsonl'));
            for (const file of subFiles) {
              readJsonlFile(join(subagentDir, file), basename(file, '.jsonl'), hash, entries, seenIds);
            }
          } catch { /* skip */ }
        }
      }
    }
  } catch {
    // Directory read failed
  }
}

function readJsonlFile(filePath, sessionId, projectHash, entries, seenIds) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const record = JSON.parse(line);

        // Only assistant messages have token usage
        if (record.type !== 'assistant') continue;

        const usage = record.message?.usage;
        if (!usage) continue;

        // Deduplicate by message ID or content-based key
        const msgId = record.message?.id;
        const dedupKey = msgId
          || `${projectHash}:${sessionId}:${record.timestamp}:${record.message?.model}:${usage.input_tokens}:${usage.output_tokens}:${usage.cache_creation_input_tokens || 0}:${usage.cache_read_input_tokens || 0}`;
        if (seenIds.has(dedupKey)) continue;
        seenIds.add(dedupKey);

        entries.push({
          sessionId,
          projectHash,
          timestamp: record.timestamp || '',
          model: record.message?.model || 'unknown',
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheCreationTokens: usage.cache_creation_input_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
          costUSD: record.costUSD || 0,
        });
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Skip unreadable files
  }
}

/**
 * Aggregate JSONL entries into daily summaries.
 */
export function aggregateDaily(entries) {
  const byDate = {};

  for (const entry of entries) {
    // Extract date from timestamp
    let date;
    if (entry.timestamp && entry.timestamp.length >= 10) {
      date = entry.timestamp.slice(0, 10);
    } else if (entry.timestamp) {
      // Epoch milliseconds
      const ts = parseInt(entry.timestamp);
      if (!isNaN(ts)) {
        date = new Date(ts).toISOString().slice(0, 10);
      }
    }
    if (!date) continue;

    if (!byDate[date]) {
      byDate[date] = {
        date,
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        messageCount: 0,
        models: {},
        sessions: new Set(),
      };
    }

    const day = byDate[date];
    day.totalCost += entry.costUSD;
    day.inputTokens += entry.inputTokens;
    day.outputTokens += entry.outputTokens;
    day.cacheCreationTokens += entry.cacheCreationTokens;
    day.cacheReadTokens += entry.cacheReadTokens;
    day.messageCount++;
    day.sessions.add(entry.sessionId);

    // Per-model breakdown
    const model = entry.model;
    if (!day.models[model]) {
      day.models[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        messageCount: 0,
      };
    }
    const m = day.models[model];
    m.inputTokens += entry.inputTokens;
    m.outputTokens += entry.outputTokens;
    m.cacheCreationTokens += entry.cacheCreationTokens;
    m.cacheReadTokens += entry.cacheReadTokens;
    m.cost += entry.costUSD;
    m.messageCount++;
  }

  // Convert sets to counts and sort
  return Object.values(byDate)
    .map(d => ({
      ...d,
      sessionCount: d.sessions.size,
      sessions: undefined,
      cacheOutputRatio: d.outputTokens > 0 ? Math.round(d.cacheReadTokens / d.outputTokens) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Aggregate entries into per-model totals.
 */
export function aggregateByModel(entries) {
  const byModel = {};

  for (const entry of entries) {
    const model = cleanModelName(entry.model);
    if (!byModel[model]) {
      byModel[model] = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, cost: 0, messageCount: 0 };
    }
    const m = byModel[model];
    m.inputTokens += entry.inputTokens;
    m.outputTokens += entry.outputTokens;
    m.cacheCreationTokens += entry.cacheCreationTokens;
    m.cacheReadTokens += entry.cacheReadTokens;
    m.cost += entry.costUSD;
    m.messageCount++;
  }

  return byModel;
}

/**
 * Aggregate entries into per-project totals.
 * Uses the project directory hash — resolves to real path where possible.
 */
export function aggregateByProject(entries, claudeDir) {
  const byProject = {};

  for (const entry of entries) {
    const hash = entry.projectHash || 'unknown';
    if (!byProject[hash]) {
      byProject[hash] = {
        hash,
        path: null,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        messageCount: 0,
        sessionCount: 0,
        sessions: new Set(),
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
      };
    }
    const p = byProject[hash];
    p.inputTokens += entry.inputTokens;
    p.outputTokens += entry.outputTokens;
    p.cacheCreationTokens += entry.cacheCreationTokens;
    p.cacheReadTokens += entry.cacheReadTokens;
    p.messageCount++;
    p.sessions.add(entry.sessionId);
    if (entry.timestamp > p.lastSeen) p.lastSeen = entry.timestamp;
    if (entry.timestamp < p.firstSeen) p.firstSeen = entry.timestamp;
  }

  // Decode project paths from directory names
  // Claude Code encodes paths as: C--Users-username-Documents-Project-Name
  // Decode: replace leading drive letter pattern, split on -, take last meaningful segments
  for (const proj of Object.values(byProject)) {
    proj.sessionCount = proj.sessions.size;
    delete proj.sessions;

    // Decode the hash (which is the encoded path)
    const decoded = decodeProjectHash(proj.hash, claudeDir);
    proj.path = decoded.path;
    proj.name = decoded.name;
  }

  return Object.values(byProject)
    .sort((a, b) => b.messageCount - a.messageCount);
}

function cleanModelName(name) {
  return (name || 'unknown')
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')
    .replace(/-20\d{6}$/, '');
}

/**
 * Decode Claude Code's encoded project directory name into a readable path and name.
 * Claude Code encodes paths by replacing path separators with hyphens.
 * Windows: C--Users-username-Documents-Projects-My-Project
 * Unix: -home-username-projects-my-project
 *
 * First tries Claude Code's internal project registry for accurate names.
 */
function decodeProjectHash(hash, claudeDir) {
  if (!hash || hash === 'unknown') return { path: null, name: 'Unknown' };

  // Try Claude Code's project registry first (most accurate)
  if (claudeDir) {
    try {
      const registryPath = join(claudeDir, 'projects', hash, '.project.json');
      if (existsSync(registryPath)) {
        const reg = JSON.parse(readFileSync(registryPath, 'utf-8'));
        if (reg.path || reg.name) {
          const regPath = reg.path || null;
          const regName = reg.name || (regPath ? regPath.split(/[\\/]/).pop() : null);
          if (regName) return { path: regPath, name: regName };
        }
      }
    } catch {}
  }

  // Reconstruct path from the encoded hash
  let path;
  if (/^[A-Z]--/.test(hash)) {
    // Windows: C--Users-username-Documents-Project → C:/Users/username/Documents/Project
    path = hash.replace(/^([A-Z])--/, '$1:/').replace(/-/g, '/');
  } else if (hash.startsWith('-')) {
    // Unix absolute: -home-user-projects-foo → /home/user/projects/foo
    path = hash.replace(/-/g, '/');
  } else {
    path = hash.replace(/-/g, '/');
  }

  // Extract project name from path: use the last non-generic segment
  const pathParts = path.split('/').filter(Boolean);
  const genericNames = new Set([
    'users', 'home', 'documents', 'desktop', 'downloads', 'repos', 'projects',
    'code', 'dev', 'src', 'workspace', 'work', 'github', 'gitlab', 'bitbucket',
    'var', 'opt', 'usr', 'local', 'mnt', 'c:', 'd:', 'e:',
  ]);

  // Walk backwards to find the most specific meaningful segment(s)
  let nameStart = pathParts.length;
  for (let i = pathParts.length - 1; i >= 0; i--) {
    if (genericNames.has(pathParts[i].toLowerCase())) break;
    nameStart = i;
  }

  const nameSegments = pathParts.slice(nameStart);
  const name = nameSegments.length > 0
    ? nameSegments.slice(-2).join('/')  // At most 2 segments: "org/repo"
    : pathParts.slice(-1)[0] || hash.slice(0, 12);

  return { path, name };
}
