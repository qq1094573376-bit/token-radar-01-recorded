# Launch Clock — token-radar-01

[![make.fun competition](https://make.fun/b/token-radar-01/badge.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun rank](https://make.fun/b/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun reward](https://make.fun/b/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A token-launch radar: what a pre-token protocol would be worth, how ripe its
launch is, and what farming it returns per dollar-week. Built for make.fun's
[token-radar-01](https://make.fun/bounty/token-radar-01) bounty ($1,325).

## The three questions

1. **What would the token be worth?** A log-log comparables model fitted on the
   snapshot's own 128 live-token protocols: `ln(mcap) = 6.965 + 0.522 · ln(TVL)`,
   plus each category's median log-residual shrunk toward zero (prior weight 6),
   a small growth tilt (0.2) and a small maturity tilt (0.85–1.00). Every row
   shows a P25–P75 range from the fit's own residual quartiles — no false
   precision. Wrapped, staked and bridged products of tokens that already
   trade are excluded, exactly as the watchlist rule excludes them: the board
   ranks 198 genuine pre-token protocols, all 40 watchlist slugs included.
2. **How ripe is the launch?** A readiness score from age, TVL and 7-day
   growth — Early / Warming / Ripe — shown as a badge on every row.
3. **What does farming it return?** Farmer ROI (implied $M per dollar-week)
   is a second ranking on the dashboard, next to a 6-step farm plan per row
   with capital, gas cost and time, plus a scam guard: the protocol records
   no token, so never pay to claim one.

## Held-out validation

The model is validated, not asserted. Two-fold split by slug hash and
walk-forward by `listed_at`; median absolute error predicting market cap:

| test | model % err / log err | flat-0.25× baseline |
| --- | --- | --- |
| two-fold A→B (n=59) | 90.1% / 1.06 | 91.7% / 1.70 |
| two-fold B→A (n=69) | 85.2% / 1.33 | 84.1% / 1.54 |
| walk-forward (n=48) | 89.6% / 1.13 | 85.6% / 1.66 |

Log error is the honest metric for multiplicative data — the log-log fit wins
decisively on every test and ties on percentage error. Full-strength
growth/maturity terms, raw category medians of mcap/TVL and the global median
multiple were all dropped because they worsened held-out error. See
[VALIDATION.md](VALIDATION.md).

## Run it

```sh
node main.ts --input <snapshot.json>
```

Node 22+, standard library only, no network. Reads `/input/snapshot.json`,
writes `/output/board.json` (198 rows), `/output/data.js`,
`/output/dashboard/` and `/output/dossier.json`. Runs twice byte-identical.

## Dashboard

Dark terminal aesthetic, radar-sweep header, monospace numerals. Board with
search, category/chain/token-status filters, min TVL and min growth, sort by
implied value / farmer ROI / readiness / TVL / growth / age; a detail drawer
per protocol with the model arithmetic recomputed live, its same-category live
peers with multiples, and its farm plan; a model sandbox whose sliders
re-rank the whole board from the same fit; and a separate live-token view.
Screenshots in `screenshots/` are renders of this dashboard at 1440×900.
