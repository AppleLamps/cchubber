/**
 * GitHub Copilot CLI usage reader.
 * Reads session/turn data from Copilot's session-store.db.
 * Metrics: engagement only (sessions, turns, repos) — no token counts available.
 */
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

let DatabaseSync;
let sqliteLoaded = false;

async function loadSqlite() {
  if (sqliteLoaded) return;
  sqliteLoaded = true;
  try {
    const mod = await import('node:sqlite');
    DatabaseSync = mod.DatabaseSync;
  } catch {
    // node:sqlite not available (Node < 22)
  }
}

/**
 * Read Copilot CLI session data. Returns null if not installed or sqlite unavailable.
 */
export async function readCopilotUsage() {
  await loadSqlite();
  if (!DatabaseSync) return null;

  const dbPath = join(homedir(), '.copilot', 'session-store.db');
  if (!existsSync(dbPath)) return null;

  try {
    const db = new DatabaseSync(dbPath, { open: true, readOnly: true });

    const sessions = db.prepare(
      "SELECT id, cwd, repository, branch, summary, created_at, updated_at FROM sessions ORDER BY created_at"
    ).all();

    const turnCount = db.prepare("SELECT COUNT(*) as c FROM turns").get();

    // Turns per session
    const turnsPerSession = db.prepare(
      "SELECT session_id, COUNT(*) as turns FROM turns GROUP BY session_id"
    ).all();

    const turnsMap = {};
    for (const t of turnsPerSession) turnsMap[t.session_id] = t.turns;

    // Files edited
    const fileCount = db.prepare("SELECT COUNT(DISTINCT file_path) as c FROM session_files WHERE tool_name = 'edit'").get();

    db.close();

    if (sessions.length === 0) return null;

    const repos = [...new Set(sessions.map(s => s.repository).filter(Boolean))];
    const dates = [...new Set(sessions.map(s => s.created_at?.split('T')[0]).filter(Boolean))];
    const avgTurns = sessions.length > 0
      ? Math.round(turnCount.c / sessions.length)
      : 0;

    return {
      tool: 'GitHub Copilot CLI',
      metricType: 'engagement',
      sessions: sessions.map(s => ({
        id: s.id,
        repository: s.repository,
        branch: s.branch,
        summary: s.summary,
        createdAt: s.created_at,
        turns: turnsMap[s.id] || 0,
      })),
      summary: {
        totalSessions: sessions.length,
        totalTurns: turnCount.c,
        avgTurnsPerSession: avgTurns,
        activeDays: dates.length,
        dateRange: dates.length > 0
          ? { from: dates[0], to: dates[dates.length - 1] }
          : null,
        repositories: repos,
        filesEdited: fileCount.c,
      },
    };
  } catch {
    return null;
  }
}
