/**
 * Codex CLI usage reader.
 * Reads token usage events from Codex's logs_1.sqlite (otel traces).
 * Metrics: input/output/cached/reasoning tokens per event, model breakdown.
 * Note: data may be sparse — labeled as partial/experimental.
 */
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
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
 * Read Codex CLI token usage. Returns null if not installed or sqlite unavailable.
 */
export async function readCodexUsage() {
  await loadSqlite();
  if (!DatabaseSync) return null;

  const dbPath = join(homedir(), '.codex', 'logs_1.sqlite');
  if (!existsSync(dbPath)) return null;

  try {
    const db = new DatabaseSync(dbPath, { open: true, readOnly: true });

    // Token events are in otel log entries with input_token_count= in the body
    const rows = db.prepare(
      "SELECT ts, feedback_log_body FROM logs WHERE feedback_log_body LIKE '%input_token_count=%' ORDER BY ts"
    ).all();

    const events = [];
    const modelTotals = {};

    for (const row of rows) {
      const body = row.feedback_log_body;
      const parsed = {
        timestamp: new Date(row.ts * 1000).toISOString(),
        date: new Date(row.ts * 1000).toISOString().split('T')[0],
        inputTokens: parseInt(body.match(/input_token_count=(\d+)/)?.[1] || '0'),
        outputTokens: parseInt(body.match(/output_token_count=(\d+)/)?.[1] || '0'),
        cachedTokens: parseInt(body.match(/cached_token_count=(\d+)/)?.[1] || '0'),
        reasoningTokens: parseInt(body.match(/reasoning_token_count=(\d+)/)?.[1] || '0'),
        model: body.match(/model=(\S+)/)?.[1] || 'unknown',
      };
      events.push(parsed);

      const model = parsed.model.replace(/\s+slug=.*/, '');
      if (!modelTotals[model]) {
        modelTotals[model] = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, events: 0 };
      }
      modelTotals[model].inputTokens += parsed.inputTokens;
      modelTotals[model].outputTokens += parsed.outputTokens;
      modelTotals[model].cachedTokens += parsed.cachedTokens;
      modelTotals[model].reasoningTokens += parsed.reasoningTokens;
      modelTotals[model].events += 1;
    }

    // Also get session count from history.jsonl
    let sessionCount = 0;
    const historyPath = join(homedir(), '.codex', 'history.jsonl');
    if (existsSync(historyPath)) {
      try {
        const lines = readFileSync(historyPath, 'utf8').split('\n').filter(l => l.trim());
        sessionCount = lines.length;
      } catch { /* skip */ }
    }

    db.close();

    if (events.length === 0 && sessionCount === 0) return null;

    const totalInput = events.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutput = events.reduce((s, e) => s + e.outputTokens, 0);
    const totalCached = events.reduce((s, e) => s + e.cachedTokens, 0);
    const totalReasoning = events.reduce((s, e) => s + e.reasoningTokens, 0);
    const dates = [...new Set(events.map(e => e.date))];

    return {
      tool: 'Codex CLI',
      metricType: 'tokens',
      partial: true,
      events,
      modelTotals,
      summary: {
        totalEvents: events.length,
        sessionCount,
        activeDays: dates.length,
        dateRange: dates.length > 0
          ? { from: dates[0], to: dates[dates.length - 1] }
          : null,
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalCachedTokens: totalCached,
        totalReasoningTokens: totalReasoning,
      },
    };
  } catch {
    return null;
  }
}
