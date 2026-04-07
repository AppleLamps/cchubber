/**
 * Inflection Point Detection
 * Finds BOTH the worst degradation AND best improvement in cache efficiency.
 * Prioritizes degradation — that's what users care about ("why is my usage draining?").
 *
 * Uses 7-day sliding windows with a minimum day count per side to reduce noise.
 */
const MIN_DAYS_PER_SIDE = 4;
const MIN_TOTAL_DAYS = 9;
const MIN_MULTIPLIER = 1.5;

export function detectInflectionPoints(dailyFromJSONL) {
  if (!dailyFromJSONL || dailyFromJSONL.length < MIN_TOTAL_DAYS) return null;

  const sorted = [...dailyFromJSONL]
    .filter(d => d.outputTokens > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < MIN_TOTAL_DAYS) return null;

  const degradations = [];
  let bestImprovement = null;
  let bestScore = 0;

  for (let i = MIN_DAYS_PER_SIDE; i <= sorted.length - MIN_DAYS_PER_SIDE; i++) {
    const before = sorted.slice(Math.max(0, i - 7), i);
    const after = sorted.slice(i, Math.min(sorted.length, i + 7));

    if (before.length < MIN_DAYS_PER_SIDE || after.length < MIN_DAYS_PER_SIDE) continue;

    const beforeRatio = computeRatio(before);
    const afterRatio = computeRatio(after);

    if (beforeRatio === 0 || afterRatio === 0) continue;

    if (afterRatio > beforeRatio) {
      const mult = afterRatio / beforeRatio;
      if (mult >= MIN_MULTIPLIER) {
        degradations.push(
          buildResult(sorted[i].date, beforeRatio, afterRatio, mult, 'worsened', before.length, after.length),
        );
      }
    } else {
      const mult = beforeRatio / afterRatio;
      if (mult > bestScore && mult >= MIN_MULTIPLIER) {
        bestScore = mult;
        bestImprovement = buildResult(
          sorted[i].date,
          beforeRatio,
          afterRatio,
          mult,
          'improved',
          before.length,
          after.length,
        );
      }
    }
  }

  degradations.sort((a, b) => b.multiplier - a.multiplier);
  const primary = degradations[0] || bestImprovement;
  if (!primary) return null;

  primary.secondary = degradations[0] ? bestImprovement : null;
  primary.alternate = degradations.length > 1 ? degradations[1] : null;
  primary.methodology =
    '7-day sliding windows; at least 4 days with usage on each side of the split; multiplier ≥ ' +
    MIN_MULTIPLIER;

  return primary;
}

function buildResult(date, beforeRatio, afterRatio, multiplier, direction, beforeDays, afterDays) {
  const mult = Math.round(multiplier * 10) / 10;
  const dirLabel = direction === 'worsened' ? 'dropped' : 'improved';
  return {
    date,
    beforeRatio,
    afterRatio,
    multiplier: mult,
    direction,
    beforeDays,
    afterDays,
    summary: `Your cache efficiency ${dirLabel} ${mult}x starting ${formatDate(date)}. Before: ${beforeRatio.toLocaleString()}:1. After: ${afterRatio.toLocaleString()}:1.`,
  };
}

function computeRatio(days) {
  const totalOutput = days.reduce((s, d) => s + (d.outputTokens || 0), 0);
  const totalCacheRead = days.reduce((s, d) => s + (d.cacheReadTokens || 0), 0);
  return totalOutput > 0 ? Math.round(totalCacheRead / totalOutput) : 0;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
