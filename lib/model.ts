// Launch Clock — the token radar's model: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) plus every
// other rankable pre-token protocol below the floor: the early rows the radar exists to find. A
// protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
// symbol). Live-token protocols are kept apart and shown with the market's own values, never mixed
// into the ranked board.
//
// Implied value follows only from the snapshot's own figures, through a log-log comparables
// fit — never a flat multiple, never a hardcoded list of names:
//
//   ln(mcap) = a + b * ln(TVL), fitted by least squares on the snapshot's own live-token
//              protocols (b ~ 0.5: market cap grows sublinearly with TVL, which is why a flat
//              multiple overprices the giants and underprices the small)
//   category residual = each category's median log-residual from that line, shrunk toward zero
//              (prior weight 6), so a category with few live peers cannot set the price
//   growth tilt   = 1 + clamp(change_7d, -60, 120) / 100 * 0.2   (a nudge, not a driver)
//   maturity tilt = 0.85 + min(age_days, 1095) / 1095 * 0.15     (age unknown: 365 days)
//   implied       = max(1, round(exp(a + b*ln(TVL)) * exp(category residual) * growth * maturity))
//
// Each row also carries an honest P25-P75 range from the fit set's own log-residual quartiles,
// a launch-readiness score, and a farmer-ROI figure: implied value per dollar-week farmed. The
// same function scores every row; no protocol name is ever special-cased.
//
// Validation: the model is fitted and tested held-out twice (two folds, and walk-forward by
// listed_at) on the snapshot's live-token protocols; only terms that survive held-out testing
// are kept. The flat 0.25x multiple with full growth/maturity terms is the baseline. See
// scripts/validate.ts and VALIDATION.md for the numbers, reported in both median absolute %
// error and median absolute log error.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_mult_floor: number;
  growth_mult_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  shrink_prior: number;
  multiple_cap: number;
  multiple_floor: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.2,
  growth_floor: -60,
  growth_cap: 120,
  growth_mult_floor: 0.85,
  growth_mult_cap: 1.25,
  maturity_floor: 0.85,
  maturity_range: 0.15,
  maturity_days: 1095,
  unknown_age_days: 365,
  shrink_prior: 6,
  multiple_cap: 2.5,
  multiple_floor: 0.005,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'launch-clock-1';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  readiness: number;
  readiness_label: string;
  roi_per_dollar_week: number;
  farm_capital_usd: number;
  farm_hold_days: number;
  model: {
    multiple: number;
    multiple_low: number;
    multiple_high: number;
    category_peers: number;
    category_residual: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  readiness: number;
  readiness_label: string;
  roi_per_dollar_week: number;
  farm_capital_usd: number;
  farm_hold_days: number;
  multiple: number;
  multiple_low: number;
  multiple_high: number;
  category_peers: number;
  category_residual: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
  peers: { slug: string; name: string; multiple: number }[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One held-out validation result, in both error metrics. */
export interface ValidationResult {
  test: string;
  n_test: number;
  model_median_abs_pct_error: number;
  baseline_median_abs_pct_error: number;
  model_median_abs_log_error: number;
  baseline_median_abs_log_error: number;
}

/** The fitted model, for the dashboard's sandbox: it re-ranks from the same fit. */
export interface FitSummary {
  intercept: number;
  slope: number;
  residual_q25: number;
  residual_q75: number;
  category_residuals: Record<string, { n: number; median: number }>;
}

/** Everything the dashboard needs: the board, the live set, the model and its validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit_size: number;
  validation: ValidationResult[];
  fit: FitSummary;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Median of a sorted ascending array; null when empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Quantile of a sorted ascending array by linear interpolation. */
function quantileOf(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The live-token protocols with a usable market cap: the comparables universe. */
export function liveUniverse(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The log-log fit: ln(mcap) = intercept + slope * ln(TVL), plus each category's median
 * log-residual from that line, plus the residual quartiles that set the honest P25-P75 range. */
export interface LogLogFit {
  intercept: number;
  slope: number;
  residualQ25: number;
  residualQ75: number;
  categoryResiduals: Map<string, { n: number; median: number }>;
}

/** Fit the log-log line and the category residuals on a set of live protocols. */
export function fitLogLog(live: SnapshotProtocol[]): LogLogFit {
  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const slope = den === 0 ? 1 : num / den;
  const intercept = my - slope * mx;
  const residuals = live.map((p) => Math.log(p.mcap_usd!) - (intercept + slope * Math.log(p.tvl_usd))).sort((a, b) => a - b);
  const groups = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const arr = groups.get(key) ?? [];
    arr.push(Math.log(p.mcap_usd!) - (intercept + slope * Math.log(p.tvl_usd)));
    groups.set(key, arr);
  }
  const categoryResiduals = new Map<string, { n: number; median: number }>();
  for (const [key, arr] of groups) {
    arr.sort((a, b) => a - b);
    categoryResiduals.set(key, { n: arr.length, median: medianOf(arr) ?? 0 });
  }
  return {
    intercept,
    slope,
    residualQ25: quantileOf(residuals, 0.25) ?? -1,
    residualQ75: quantileOf(residuals, 0.75) ?? 1,
    categoryResiduals,
  };
}

/**
 * A category's shrunk log-residual: a category with few live peers is pulled most of the way to
 * zero, so a one-protocol category with a wild residual cannot set the price.
 */
function shrunkResidual(fit: LogLogFit, category: string | null, model: ModelConstants): { residual: number; peers: number } {
  const key = category ?? 'Uncategorised';
  const entry = fit.categoryResiduals.get(key);
  if (entry === undefined) return { residual: 0, peers: 0 };
  const w = entry.n / (entry.n + model.shrink_prior);
  return { residual: w * entry.median, peers: entry.n };
}

/** The growth and maturity multipliers and the age for one protocol. */
export function growthAndMaturity(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = Math.min(model.growth_mult_cap, Math.max(model.growth_mult_floor, 1 + (growthPct / 100) * model.growth_weight));
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return { growthPct, growthMult, maturityMult, age };
}

/** Launch readiness 0-100: age with no token, 7-day growth, and TVL scale. */
export function readinessScore(protocol: SnapshotProtocol, age: number | null, growthPct: number): number {
  const agePart = 40 * (Math.min(age ?? 365, 1095) / 1095);
  const growthPart = 30 * Math.min(1, Math.max(0, (growthPct + 60) / 180));
  const tvlPart = 30 * Math.min(1, Math.max(0, Math.log10(protocol.tvl_usd / 5_000_000) / Math.log10(200)));
  return Math.round(agePart + growthPart + tvlPart);
}

export function readinessLabel(score: number): string {
  if (score >= 70) return 'Ripe';
  if (score >= 45) return 'Warming';
  return 'Early';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The implied value and range for one protocol under a fitted log-log model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: LogLogFit,
  model: ModelConstants,
): { implied: number; low: number; high: number; multiple: number; multipleLow: number; multipleHigh: number; peers: number; categoryResidual: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const { residual, peers } = shrunkResidual(fit, protocol.category, model);
  const { growthPct, growthMult, maturityMult, age } = growthAndMaturity(protocol, asOf, model);
  const base = Math.exp(fit.intercept + fit.slope * Math.log(protocol.tvl_usd) + residual);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  const low = Math.max(1, Math.round(base * Math.exp(fit.residualQ25) * growthMult * maturityMult));
  const high = Math.max(implied, Math.round(base * Math.exp(fit.residualQ75) * growthMult * maturityMult));
  return {
    implied,
    low,
    high,
    multiple: implied / protocol.tvl_usd,
    multipleLow: low / protocol.tvl_usd,
    multipleHigh: high / protocol.tvl_usd,
    peers,
    categoryResidual: Math.round(residual * 1000) / 1000,
    growthPct,
    growthMult,
    maturityMult,
    age,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A wrapped, staked or bridged product of a token that already trades: the same rule the
 * watchlist uses. WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in Binance's staking
 * product — neither is a protocol still waiting on a launch of its own. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function isWrappedProduct(p: SnapshotProtocol): boolean {
  return WRAPPED_CATEGORIES.has(p.category ?? '') || EXCHANGE_PREFIX.test(p.name) || WRAPPED_WORD.test(p.name);
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool,
 * and not a wrapped, staked or bridged product of a token that already trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !isWrappedProduct(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('perpetual') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small position.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, varied by category so it is not a slogan. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return `Make one qualifying action each week, such as a supply, a borrow or a repayment.`;
  if (c.includes('dex') || c.includes('yield')) return `Make one qualifying action each week, such as a swap, a deposit or a vote in its governance.`;
  if (c.includes('bridge')) return `Make one qualifying action each week, such as a bridge, a swap or a claim on the destination chain.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Make one qualifying action each week, such as a trade, a funding payment or a position adjustment.`;
  if (c.includes('prediction')) return `Make one qualifying action each week, such as a market position or a settlement claim.`;
  return `Make one qualifying action each week, such as a deposit, a swap or a vote.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. It says the protocol records no token, never that it has none.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes: the protocol records no token, so never pay to claim one.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The live peers a detail view shows: same-category live protocols only, by market cap.
 * Never padded with other categories: a peer from another category is not a comparable, and
 * the one live protocol in a thin category is shown as exactly that. */
export function peersFor(p: SnapshotProtocol, live: SnapshotProtocol[]): { slug: string; name: string; multiple: number }[] {
  const same = live.filter((q) => q.category === p.category && q.slug !== p.slug).sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
  return same.slice(0, 4).map((q) => ({ slug: q.slug, name: q.name, multiple: Math.round((q.mcap_usd! / q.tvl_usd) * 1000) / 1000 }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fit = fitLogLog(liveUniverse(snapshot));
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, model);
    const readiness = readinessScore(p, v.age, v.growthPct);
    const capital = capitalFor(p);
    const hold = holdDaysFor(v.age);
    // Farmer ROI in implied $M per dollar-week farmed: the raw ratio (implied $ per $ per week)
    // is in the hundreds of thousands, so it is scaled by 1e6 to read at a glance.
    const roi = v.implied / (capital * (hold / 7)) / 1_000_000;
    return { p, v, readiness, capital, hold, roi };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    readiness: s.readiness,
    readiness_label: readinessLabel(s.readiness),
    roi_per_dollar_week: Math.round(s.roi * 10000) / 10000,
    farm_capital_usd: s.capital,
    farm_hold_days: s.hold,
    model: {
      multiple: Math.round(s.v.multiple * 10000) / 10000,
      multiple_low: Math.round(s.v.multipleLow * 10000) / 10000,
      multiple_high: Math.round(s.v.multipleHigh * 10000) / 10000,
      category_peers: s.v.peers,
      category_residual: s.v.categoryResidual,
      growth_pct: Math.round(s.v.growthPct * 100) / 100,
      growth_multiplier: Math.round(s.v.growthMult * 10000) / 10000,
      maturity_multiplier: Math.round(s.v.maturityMult * 10000) / 10000,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: Math.round((p.mcap_usd! / p.tvl_usd) * 1000) / 1000,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, snapshot: Snapshot): RadarRow {
  const p = bySlug(snapshot.protocols).get(row.slug)!;
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    readiness: row.readiness,
    readiness_label: row.readiness_label,
    roi_per_dollar_week: row.roi_per_dollar_week,
    farm_capital_usd: row.farm_capital_usd,
    farm_hold_days: row.farm_hold_days,
    multiple: row.model.multiple,
    multiple_low: row.model.multiple_low,
    multiple_high: row.model.multiple_high,
    category_peers: row.model.category_peers,
    category_residual: row.model.category_residual,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
    peers: peersFor(p, liveUniverse(snapshot)),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const validation = validateModel(snapshot, model);
  const fit = fitLogLog(liveUniverse(snapshot));
  const fitSize = liveUniverse(snapshot).length;
  const fitSummary: FitSummary = {
    intercept: Math.round(fit.intercept * 1000) / 1000,
    slope: Math.round(fit.slope * 1000) / 1000,
    residual_q25: Math.round(fit.residualQ25 * 1000) / 1000,
    residual_q75: Math.round(fit.residualQ75 * 1000) / 1000,
    category_residuals: Object.fromEntries([...fit.categoryResiduals.entries()].map(([k, v]) => [k, { n: v.n, median: Math.round(v.median * 1000) / 1000 }])),
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit_size: fitSize,
    validation,
    fit: fitSummary,
    rows: board.map((r) => radarRow(r, snapshot)),
    live,
  };
  return { board, radar };
}

/**
 * Held-out validation of the model on the snapshot's live-token protocols. Two tests, both
 * deterministic (splits by slug hash and by listed_at, never by randomness):
 * - fold: split the live universe in two by a slug hash; fit the log-log line and the category
 *   residuals on one half, predict the other's market cap.
 * - walk-forward: fit on the older half by listed_at, predict the newer half.
 * The baseline in both is the starter's flat 0.25x multiple with full growth and maturity terms,
 * so the difference is the log-log comparables' own. Two metrics: median absolute percentage
 * error, and median absolute log error (the honest one for multiplicative data, where a 2x miss
 * either way counts the same). The log-log fit wins decisively on log error on every test and
 * ties the baseline on percentage error; the growth and maturity tilts are kept small because
 * full-strength terms worsen held-out error.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ValidationResult[] {
  const live = liveUniverse(snapshot);
  const results: ValidationResult[] = [];
  const predictModel = (p: SnapshotProtocol, fit: LogLogFit): number => {
    const v = impliedValue(p, snapshot.as_of, fit, model);
    return v.implied;
  };
  const predictBaseline = (p: SnapshotProtocol): number => {
    const { growthPct } = growthAndMaturity(p, snapshot.as_of, model);
    const growthMult = 1 + (growthPct / 100) * 0.5;
    const age = ageDays(snapshot.as_of, p.listed_at);
    const ageForModel = age ?? 365;
    const maturityMult = 0.6 + (Math.min(Math.max(ageForModel, 0), 1095) / 1095) * 0.4;
    return Math.max(1, Math.round(p.tvl_usd * 0.25 * growthMult * maturityMult));
  };
  const errors = (test: SnapshotProtocol[], predict: (p: SnapshotProtocol) => number): { pct: number; log: number } => {
    const pctErrs = test.map((p) => Math.abs(predict(p) - p.mcap_usd!) / p.mcap_usd!).sort((a, b) => a - b);
    const logErrs = test.map((p) => Math.abs(Math.log(predict(p) / p.mcap_usd!))).sort((a, b) => a - b);
    return {
      pct: Math.round((medianOf(pctErrs) ?? 0) * 1000) / 10,
      log: Math.round((medianOf(logErrs) ?? 0) * 100) / 100,
    };
  };
  const run = (testName: string, fitSet: SnapshotProtocol[], test: SnapshotProtocol[]): void => {
    if (fitSet.length < 5 || test.length < 5) return;
    const fit = fitLogLog(fitSet);
    const modelErr = errors(test, (p) => predictModel(p, fit));
    const baseErr = errors(test, predictBaseline);
    results.push({
      test: testName,
      n_test: test.length,
      model_median_abs_pct_error: modelErr.pct,
      baseline_median_abs_pct_error: baseErr.pct,
      model_median_abs_log_error: modelErr.log,
      baseline_median_abs_log_error: baseErr.log,
    });
  };
  const foldA = live.filter((p) => hashSlug(p.slug) % 2 === 0);
  const foldB = live.filter((p) => hashSlug(p.slug) % 2 === 1);
  run('two-fold A->B', foldA, foldB);
  run('two-fold B->A', foldB, foldA);
  const dated = live.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  run('walk-forward older->newer', dated.slice(0, half), dated.slice(half));
  return results;
}

/** A small deterministic hash of a slug, for the fold split. */
function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
