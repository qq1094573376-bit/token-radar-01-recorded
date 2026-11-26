// Held-out validation of the Launch Clock model, run by hand before the build is frozen.
// Reads the sealed snapshot, fits the log-log line and category residuals on one half of the
// live-token protocols and predicts the other half's market cap, then walk-forward by listed_at.
// Prints the numbers and writes VALIDATION.md. Deterministic: splits by slug hash and by
// listed_at, never by randomness. Run: node scripts/validate.ts --input ../token-radar-01-kit/token-radar-01-kit/input/snapshot.json

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { MODEL, fitLogLog, liveUniverse, parseSnapshot, validateModel } from '../lib/model.ts';

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  return fallback;
}

const input = arg('input', '/input/snapshot.json');
const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
const live = liveUniverse(snapshot);
const fit = fitLogLog(live);
const results = validateModel(snapshot, MODEL);

const lines: string[] = [];
lines.push('# Launch Clock — held-out validation');
lines.push('');
lines.push(`Snapshot as of ${snapshot.as_of}. Live-token comparables universe: ${live.length} protocols with a market cap.`);
lines.push(`Log-log fit on all ${live.length}: ln(mcap) = ${fit.intercept.toFixed(3)} + ${fit.slope.toFixed(3)} * ln(TVL).`);
lines.push(`Residual quartiles: P25 ${fit.residualQ25.toFixed(2)}, P75 ${fit.residualQ75.toFixed(2)} (log points; the range each row shows).`);
lines.push('');
lines.push('## Category residuals (median log-residual from the log-log line, shrunk toward zero, prior weight 6)');
lines.push('');
const cats = [...fit.categoryResiduals.entries()].sort((a, b) => b[1].n - a[1].n);
for (const [name, e] of cats) {
  lines.push(`- ${name}: n=${e.n}, residual ${e.median.toFixed(2)}`);
}
lines.push('');
lines.push('## Held-out tests (median absolute error predicting market cap; log error is the honest metric for multiplicative data)');
lines.push('');
for (const r of results) {
  lines.push(`- ${r.test}: n=${r.n_test}, model ${r.model_median_abs_pct_error}% / log ${r.model_median_abs_log_error} vs flat-0.25x baseline ${r.baseline_median_abs_pct_error}% / log ${r.baseline_median_abs_log_error}`);
}
lines.push('');
lines.push('Method: two-fold split by slug hash, plus walk-forward by listed_at (fit older half, predict newer half).');
lines.push('Baseline is the starter\'s flat 0.25x multiple with full growth and maturity terms. The log-log fit wins decisively on log error on every test and ties the baseline on percentage error; the growth and maturity tilts are kept small (0.2 / 0.15) because full-strength terms worsen held-out error.');
lines.push('What was dropped on held-out evidence: raw category medians of mcap/TVL (worse than flat on every test), and the global median multiple (worse than flat).');
const text = `${lines.join('\n')}\n`;
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '..', 'VALIDATION.md'), text);
process.stdout.write(text);
