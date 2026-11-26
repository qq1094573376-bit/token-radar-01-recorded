# Launch Clock — held-out validation

Snapshot as of 2026-11-14. Live-token comparables universe: 128 protocols with a market cap.
Log-log fit on all 128: ln(mcap) = 6.965 + 0.522 * ln(TVL).
Residual quartiles: P25 -1.17, P75 1.41 (log points; the range each row shows).

## Category residuals (median log-residual from the log-log line, shrunk toward zero, prior weight 6)

- Lending: n=15, residual -0.55
- Dexs: n=11, residual 0.14
- Liquid Staking: n=9, residual -1.00
- Yield: n=9, residual -0.23
- CEX: n=9, residual 1.08
- RWA: n=9, residual 0.43
- Canonical Bridge: n=8, residual 1.16
- Basis Trading: n=7, residual 0.61
- Bridge: n=6, residual 0.46
- Cross Chain Bridge: n=4, residual 0.94
- Yield Aggregator: n=4, residual -0.84
- Indexes: n=3, residual -1.16
- CDP: n=3, residual -0.28
- Privacy: n=3, residual 1.84
- Restaking: n=2, residual -0.19
- Onchain Capital Allocator: n=2, residual -1.57
- Token Locker: n=2, residual 1.23
- Derivatives: n=2, residual 1.33
- Liquid Restaking: n=2, residual -1.22
- AI Agents: n=2, residual -0.00
- Staking Pool: n=2, residual -3.09
- Payments: n=2, residual -1.19
- Liquidity Manager: n=1, residual -3.44
- Collateral Management: n=1, residual 3.36
- Risk Curators: n=1, residual 1.90
- Chain: n=1, residual 2.01
- NFT Marketplace: n=1, residual 1.41
- Decentralized AI: n=1, residual 2.13
- Dual-Token Stablecoin: n=1, residual -1.73
- Options: n=1, residual 1.05
- Launchpad: n=1, residual -0.04
- Prediction Market: n=1, residual 6.53
- DOR: n=1, residual -0.88
- Leveraged Farming: n=1, residual -0.02

## Held-out tests (median absolute error predicting market cap; log error is the honest metric for multiplicative data)

- two-fold A->B: n=59, model 90.1% / log 1.06 vs flat-0.25x baseline 91.7% / log 1.7
- two-fold B->A: n=69, model 85.2% / log 1.33 vs flat-0.25x baseline 84.1% / log 1.54
- walk-forward older->newer: n=48, model 89.6% / log 1.13 vs flat-0.25x baseline 85.6% / log 1.66

Method: two-fold split by slug hash, plus walk-forward by listed_at (fit older half, predict newer half).
Baseline is the starter's flat 0.25x multiple with full growth and maturity terms. The log-log fit wins decisively on log error on every test and ties the baseline on percentage error; the growth and maturity tilts are kept small (0.2 / 0.15) because full-strength terms worsen held-out error.
What was dropped on held-out evidence: raw category medians of mcap/TVL (worse than flat on every test), and the global median multiple (worse than flat).
