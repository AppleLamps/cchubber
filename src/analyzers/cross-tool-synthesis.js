/**
 * Heuristic cross-tool insights when Claude Code is used alongside other AI tools.
 */
export function analyzeCrossToolSynthesis(multiTool, costAnalysis) {
  const insights = [];
  if (!multiTool || multiTool.length === 0) {
    return { available: false, insights, note: 'No other AI tools detected on this machine.' };
  }

  const totalCost = costAnalysis?.totalCost || 0;
  const activeDays = costAnalysis?.activeDays || 0;
  const daily = costAnalysis?.dailyCosts || [];
  const recent7 = daily.slice(-7);
  const recentCost = recent7.reduce((s, d) => s + (d.cost || 0), 0);

  const cursor = multiTool.find((t) => t.metricType === 'lines');
  if (cursor && cursor.summary?.totalLines > 3000 && totalCost > 15) {
    insights.push({
      kind: 'cursor_claude',
      title: 'Heavy Cursor + Claude Code overlap',
      detail: `Cursor accepted ${cursor.summary.totalLines.toLocaleString()} lines while Claude shows ~$${totalCost.toFixed(0)} equivalent spend. Consider routing repetitive edits to one tool per task to avoid double-paying context.`,
    });
  }

  const codex = multiTool.find((t) => t.metricType === 'tokens');
  if (codex?.summary?.totalInputTokens > 500_000 && activeDays > 3) {
    insights.push({
      kind: 'codex_volume',
      title: 'High Codex CLI token volume',
      detail: `Codex logged ${(codex.summary.totalInputTokens + codex.summary.totalOutputTokens).toLocaleString()} tokens. If the same repos are open in Claude Code, align workflows so large refactors use one primary agent.`,
    });
  }

  const copilot = multiTool.find((t) => t.metricType === 'engagement');
  if (
    copilot &&
    copilot.summary?.totalTurns > 200 &&
    totalCost > 0 &&
    recentCost > totalCost * 0.35
  ) {
    insights.push({
      kind: 'copilot_parallel',
      title: 'Copilot CLI activity alongside concentrated Claude cost',
      detail: `${copilot.summary.totalTurns} Copilot turns recorded; a large share of Claude cost is in the last 7 days. If both tools touch the same repos, batch by tool to reduce redundant context.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      kind: 'general',
      title: 'Multi-tool setup',
      detail: `${multiTool.length} AI coding tool(s) have local usage data. Compare their roles: use the cheapest model tier for grep/docs, reserve Opus-class models for architecture.`,
    });
  }

  return {
    available: true,
    insights: insights.slice(0, 4),
    note: null,
  };
}
