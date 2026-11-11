# Does picking the best strategy help?

November 2026. Code: `research/selection.research.ts`, `research/selection_summary.py`. Real data from EODHD (AAPL, MSFT, AMZN, TSLA, VTI from 1990 to 2026, and Bitcoin), which is licensed and not committed.

## Question

The Command Centre ranks six library strategies on an instrument over the last two years by return per unit of risk (Sharpe ratio) and names the top one. A user will naturally read that as "the strategy to use". Does last period's winner do better than the others over the next period?

## Method

Rolling windows on each instrument. Two years in sample, then one year out of sample, stepping forward a year. Every window runs all six rankable strategies (moving-average crossover, RSI mean reversion, MACD momentum, breakout, trend following, volatility breakout) on the engine with the market's default costs. Each strategy is warmed up on data before the window. The in-sample winner is then ranked against the other five out of sample, and compared with buy and hold.

Under no persistence, the winner's out-of-sample rank is uniform on 1 to 6, with a mean of 3.5, and in-sample and out-of-sample scores are uncorrelated. Confidence intervals are 95% bootstrap intervals over windows.

## Result

| Real markets, 2 years in, 1 year out | Value | Chance |
|---|---|---|
| Windows | 140 over 6 instruments | |
| Winner's average rank the next year | 3.66 (3.39 to 3.92) | 3.50 |
| Winner lands in the top half | 44% | 50% |
| Winner ranks first again | 16% | 17% |
| Rank correlation, in sample against next year | −0.016 (−0.094 to +0.061) | 0 |
| Winner beats buy and hold, risk-adjusted | 29% (21% to 36%) | |
| Winner beats buy and hold, total return | 26% | |

**Last period's winner carries no detectable information about next period's.** It does no better than a random pick from the six, and about seven times in ten it loses to simply holding.

### Robustness

| Design | Windows | Winner's rank | Top half | Rank correlation | Beats holding, risk-adjusted |
|---|---|---|---|---|---|
| 1 year in, 1 year out | 146 | 3.61 | 42% | −0.061 | 27% |
| 3 years in, 1 year out | 134 | 3.63 | 45% | −0.014 | 31% |
| 2 years in, 2 years out | 68 | 4.06 | 35% | −0.029 | 21% |
| 1 year in, 6 months out | 294 | 3.61 | 46% | −0.000 | 32% |
| Windows starting before 2008 | 50 | 3.74 | 40% | −0.027 | 24% |
| Windows starting 2008 on | 90 | 3.61 | 46% | −0.010 | 31% |

By instrument, none shows persistence. Bitcoin, with 13 windows, is the only market where these rules usually beat holding (62%). VTI, the closest analogue to an index fund like STW, beat holding in 9% of windows.

### The demo dataset agrees

The same study on the demo-v3 process (30 independent paths of STW, CBA and BHP) gives a winner's rank of 3.42 and a rank correlation of +0.010, also chance. The demo data therefore teaches the same lesson as real markets. That was not true of demo-v2, whose regime drifts manufactured momentum (see `demo-data-calibration.md`).

## What it means for the product

1. A ranking of strategies over a past window is a description, not a recommendation. Calling the top row "best" without saying so misleads.
2. The useful thing to show next to any winner is whether picking winners works: what last period's winner did next, and how a set of coin-flip strategies with the same exposure would have ranked.
3. Buy and hold is the bar. On these instruments, these six rules mostly failed to clear it.

## Limitations

- Six strategies with library default parameters. Tuning parameters in sample, which is what users do in the Lab, adds another layer of selection, so persistence would be expected to be weaker still.
- Five US large caps and Bitcoin. ASX history was not available under the demo token.
- Windows on one instrument overlap in their in-sample years, so they are not fully independent. Out-of-sample years do not overlap.
