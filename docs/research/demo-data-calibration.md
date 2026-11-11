# Does the demo dataset behave like real markets?

November 2026. Code in `research/`. Real data from EODHD's public demo token (AAPL, MSFT, AMZN, TSLA, VTI, BTC), which is licensed and is not committed.

## Why this matters

Every number a new user sees comes from the synthetic demo dataset: the Command Centre, Today's Five, the Arena and every default backtest. If the generator behaves unlike real prices, the product teaches the wrong lessons. Two failure modes matter most:

- If demo prices **trend** more than real ones, trend-following rules look better than they are.
- If demo returns are **too calm**, with thin tails and no volatility clustering, drawdowns, stop gaps and the case for volatility-based sizing are all understated.

## Method

Daily log returns were compared window by window, with windows matched to the demo calendar: 5 years for equities, 3 for crypto. Real equities give 27 non-overlapping windows from 1991 to 2025. Real Bitcoin gives 4.

| Statistic | What it detects |
|---|---|
| Excess kurtosis | Fat tails, meaning crash days |
| Autocorrelation of absolute returns at lags 1 and 20 | Volatility clustering, meaning calm and storm |
| Lag-1 autocorrelation, variance ratios VR(5, 20, 60) | Trending (above 1) or reverting (below 1) |
| Momentum coefficient: correlation of the past 60-day return with the next 20 days | What a trend rule harvests |
| Sharpe of "hold when above the price 90 days ago" minus Sharpe of holding | Whether trend rules beat holding |

Acceptance criteria were written down from the real-data ranges **before** any tuning (`research/calibration_check.py`). The generator is a random process, so it was judged on 40 independent paths, then on 200 for crypto. A single path proved misleading. It hid the equity momentum problem described below.

**Estimator bias.** On a pure random walk, the momentum coefficient has a median of −0.046 over 3 years and −0.042 over 5. This is small-sample bias from a persistent predictor, the Stambaugh effect. Raw values must therefore be read against about −0.04, not against zero. Demo and real data are measured with the same estimator, so demo-versus-real comparisons are like for like.

## Findings on demo-v2, the previous dataset

| | demo-v2 | Real |
|---|---|---|
| Equity excess kurtosis | 0.73 | 8.8 |
| Equity volatility clustering, lag 1 / lag 20 | 0.04 / 0.003 | 0.18 / 0.085 |
| Equity momentum coefficient, process median of 40 paths | +0.045 | about −0.03 to −0.07 |
| Crypto momentum coefficient | +0.18 | +0.05 |
| Crypto 60-day variance ratio | 1.60 | 1.19 |

demo-v2 returns were close to Gaussian, with almost no crash days and volatility that forgot itself within three trading days. Its regime drifts manufactured momentum in both markets. Measured against the random-walk null, that was about +0.09 for equities and +0.20 for crypto. Overnight news was generated inside the first hour of trading and the open was then overwritten, so stops rarely gapped through.

The first single-path test said demo equities did *not* flatter trend rules. Judging the process across 40 paths overturned that. One path is one draw.

## What changed in demo-v3

- Daily log-volatility follows an AR(1) process with a half-life of about 46 trading days and a leverage effect. It is normalised so average volatility is unchanged.
- Innovations are Student-t, so overnight news gaps are fat-tailed and land on the open, where fills and stops see them.
- Single stocks get about four earnings-style gaps a year. ETFs get none.
- Equity regime drifts are about half as strong and shorter. Crypto regimes are weaker, with a milder crash-and-recovery cycle and fat-tailed daily news shocks.
- The published path is the most typical of 40 candidates, chosen on growth, worst fall, volatility, day-to-day autocorrelation, the 20-day variance ratio and a trend rule's advantage over holding. It is deliberately neither the most flattering path nor one that happens to reward trend rules.

## Results

Process level, median of 40 paths:

| Criterion | Accept | demo-v3 | |
|---|---|---|---|
| Equity excess kurtosis | 3 to 9 | 5.1 | pass |
| Equity clustering, lag 1 | 0.10 to 0.25 | 0.18 | pass |
| Equity clustering, lag 20 | 0.04 to 0.20 | 0.11 | pass |
| Equity VR(60) | 0.70 to 1.15 | 1.04 | pass |
| Equity momentum coefficient | −0.08 to 0.03 | −0.027 | pass |
| Crypto VR(60) | 0.95 to 1.35 | 0.94 | **miss** |
| Crypto momentum coefficient | −0.02 to 0.08 | −0.044 | **miss** |
| Crypto excess kurtosis | 3 to 12 | 4.8 | pass |

Published dataset against real data, 95% bootstrap intervals of the difference:

| Equities | demo-v3 | Real | Distinguishable? |
|---|---|---|---|
| Excess kurtosis | 9.3 | 8.8 | no |
| Clustering, lag 1 / lag 20 | 0.175 / 0.096 | 0.179 / 0.085 | no |
| Lag-1 autocorrelation | −0.011 | −0.034 | no |
| Momentum coefficient | −0.028 | −0.053 | no |
| Trend rule Sharpe minus holding | −0.14 | −0.13 | no |
| VR(5 / 20 / 60) | 0.98 / 1.04 / 0.98 | 0.92 / 0.88 / 0.83 | yes |

The published ASX index fund (STW) shows 15.2% volatility, 7.9% annual growth and a 24.7% worst fall, all inside their pre-registered ranges.

## Remaining weaknesses

- **Variance ratios.** Demo prices behave like a random walk at 5 to 60 days, while real single stocks revert slightly. This makes demo marginally kinder to trend rules than real stocks, although the direct trend-versus-holding test finds no detectable difference.
- **Crypto missed two pre-registered bands**, narrowly, at the process level. Its momentum coefficient (−0.044) equals the random-walk null, so demo crypto has no manufactured momentum. Real Bitcoin's +0.05 rests on only 4 windows, with a standard error near 0.07, so the bands were narrower than the evidence supported. They were not widened after the fact. On the published crypto path, volatility is high (86% median across BTC, ETH and SOL) and the trend rule does worse than it did historically on Bitcoin.
- **The real comparison set** is five US names, four of them large technology stocks. No ASX history was available under the demo token, so ASX calibration assumes ASX large caps share these stylised facts. That is well established in the literature but not verified here.

## Reproduce

```bash
# Real data (EODHD demo token covers AAPL, MSFT, AMZN, TSLA, VTI, BTC-USD.CC)
mkdir -p /tmp/real && for t in AAPL.US MSFT.US AMZN.US TSLA.US VTI.US BTC-USD.CC; do
  curl -s "https://eodhd.com/api/eod/$t?api_token=demo&fmt=json&from=1990-01-01" > /tmp/real/$t.json; done
OUT=/tmp/out npx vitest run --config research/vitest.research.config.mts dump-demo demo-paths
python3 -I research/stylised_facts.py /tmp/out/demo-daily.json /tmp/real
python3 -I research/calibration_check.py /tmp/out/demo-daily.json
python3 -I research/pick_demo_path.py /tmp/out/demo-paths.json
```
