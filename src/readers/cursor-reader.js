/**
 * Cursor usage reader.
 * Reads daily AI code tracking stats from Cursor's state.vscdb (SQLite).
 * Metrics: tab suggestions/acceptances, composer suggestions/acceptances (lines).
 */
import { join } from 'path';
import { existsSync } from 'fs';

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
 * Read Cursor daily stats. Returns null if Cursor isn't installed or sqlite unavailable.
 */
export async function readCursorUsage() {
  await loadSqlite();
  if (!DatabaseSync) return null;

  const dbPath = getCursorDbPath();
  if (!dbPath || !existsSync(dbPath)) return null;

  try {
    const db = new DatabaseSync(dbPath, { open: true, readOnly: true });

    // Match any schema version: aiCodeTracking.dailyStats.*.YYYY-MM-DD
    const rows = db.prepare(
      "SELECT key, value FROM ItemTable WHERE key LIKE 'aiCodeTracking.dailyStats.%' ORDER BY key"
    ).all();

    const dailyStats = [];
    let totalSuggested = 0;
    let totalAccepted = 0;
    let totalTabSuggested = 0;
    let totalTabAccepted = 0;

    for (const row of rows) {
      try {
        const val = JSON.parse(row.value);
        const date = val.date || row.key.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];
        if (!date) continue;

        const entry = {
          date,
          composerSuggestedLines: val.composerSuggestedLines || 0,
          composerAcceptedLines: val.composerAcceptedLines || 0,
          tabSuggestedLines: val.tabSuggestedLines || 0,
          tabAcceptedLines: val.tabAcceptedLines || 0,
        };
        dailyStats.push(entry);

        totalSuggested += entry.composerSuggestedLines;
        totalAccepted += entry.composerAcceptedLines;
        totalTabSuggested += entry.tabSuggestedLines;
        totalTabAccepted += entry.tabAcceptedLines;
      } catch { /* skip malformed entries */ }
    }

    db.close();

    if (dailyStats.length === 0) return null;

    const activeDays = dailyStats.filter(d =>
      d.composerSuggestedLines > 0 || d.tabSuggestedLines > 0
    ).length;

    return {
      tool: 'Cursor',
      metricType: 'lines',
      dailyStats,
      summary: {
        totalDays: dailyStats.length,
        activeDays,
        dateRange: { from: dailyStats[0].date, to: dailyStats[dailyStats.length - 1].date },
        composer: { suggestedLines: totalSuggested, acceptedLines: totalAccepted },
        tab: { suggestedLines: totalTabSuggested, acceptedLines: totalTabAccepted },
        totalLines: totalAccepted + totalTabAccepted,
        acceptRate: totalSuggested > 0
          ? Math.round((totalAccepted / totalSuggested) * 100)
          : 0,
      },
    };
  } catch {
    return null;
  }
}

function getCursorDbPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
    return join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  if (process.platform === 'darwin') {
    return join(process.env.HOME || '', 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  // Linux
  return join(process.env.HOME || '', '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}
