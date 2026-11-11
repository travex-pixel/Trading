"""
Does the demo dataset behave like real markets?

Compares stylised facts of daily returns between EdgeLab's synthetic demo
instruments and real price histories, window by window, with the window
length matched to the demo calendar (5 years for equities, 3 for crypto).

The facts that matter for what the product teaches:
  - volatility and fat tails (excess kurtosis)
  - daily autocorrelation, and volatility clustering (autocorrelation of |r|)
  - variance ratios VR(q): above 1 means prices trend, below 1 means they revert
  - the momentum information coefficient: correlation between the past 60-day
    return and the next 20-day return, sampled every 20 days. This is the
    quantity a trend-following rule harvests. Near zero in an efficient market.
  - time-series momentum versus buy and hold: Sharpe of "hold when the price is
    above its level 90 days ago" minus Sharpe of always holding.

Usage: python3 -I stylised_facts.py <demo-daily.json> <folder of EODHD json> [--json out.json]
"""

import json
import os
import sys

import numpy as np

RNG = np.random.default_rng(20261111)


def window_stats(close):
    close = np.asarray(close, dtype=float)
    r = np.diff(np.log(close))
    n = len(r)
    sd = r.std(ddof=1)
    out = {
        "vol": sd * np.sqrt(252),
        "kurt": ((r - r.mean()) ** 4).mean() / sd ** 4 - 3,
        "acf1": np.corrcoef(r[:-1], r[1:])[0, 1],
        "absacf1": np.corrcoef(np.abs(r[:-1]), np.abs(r[1:]))[0, 1],
        "absacf20": np.corrcoef(np.abs(r[:-20]), np.abs(r[20:]))[0, 1],
    }
    for q in (5, 20, 60):
        sums = np.convolve(r, np.ones(q), "valid")
        out[f"vr{q}"] = sums.var(ddof=1) / (q * r.var(ddof=1))
    logp = np.log(close)
    xs, ys = [], []
    for t in range(60, len(logp) - 20, 20):
        xs.append(logp[t] - logp[t - 60])
        ys.append(logp[t + 20] - logp[t])
    out["mom_ic"] = np.corrcoef(xs, ys)[0, 1] if len(xs) > 5 else np.nan
    # Time-series momentum, close to close, decided at t and applied to t+1. No costs.
    lb = 90
    pos = (close[lb:-1] > close[:-lb - 1]).astype(float)
    strat = pos * r[lb:]
    hold = r[lb:]
    sh = lambda x: x.mean() / x.std(ddof=1) * np.sqrt(252) if x.std(ddof=1) > 0 else 0.0
    out["tsmom_minus_hold_sharpe"] = sh(strat) - sh(hold)
    return out


def load_real(folder, name):
    rows = json.load(open(os.path.join(folder, name)))
    rows = [x for x in rows if x.get("close") and x.get("adjusted_close")]
    rows.sort(key=lambda x: x["date"])
    return [x["date"] for x in rows], [x["adjusted_close"] for x in rows]


def windows(dates, close, years, start_year):
    """Non-overlapping calendar windows of `years` years from `start_year`."""
    out = []
    y = start_year
    while True:
        lo, hi = f"{y}-01-01", f"{y + years}-01-01"
        idx = [i for i, d in enumerate(dates) if lo <= d < hi]
        if len(idx) < 200 * years:
            break
        out.append((f"{y}-{y + years - 1}", [close[i] for i in idx]))
        y += years
    return out


def summarise(rows, keys):
    arr = {k: np.array([r[k] for r in rows if np.isfinite(r[k])]) for k in keys}
    return {k: (v.mean(), v.std(ddof=1) / np.sqrt(len(v)), len(v)) for k, v in arr.items()}


def boot_diff(a, b, n=10_000):
    a, b = np.asarray(a), np.asarray(b)
    d = [RNG.choice(a, len(a)).mean() - RNG.choice(b, len(b)).mean() for _ in range(n)]
    return np.percentile(d, [2.5, 97.5])


def main():
    demo_path, real_dir = sys.argv[1], sys.argv[2]
    demo = json.load(open(demo_path))
    keys = ["vol", "kurt", "acf1", "absacf1", "absacf20", "vr5", "vr20", "vr60", "mom_ic", "tsmom_minus_hold_sharpe"]

    groups = {"demo equities": [], "real equities": [], "demo crypto": [], "real crypto": []}
    for inst, s in demo.items():
        st = window_stats(s["c"])
        groups["demo crypto" if s["market"] == "CRYPTO" else "demo equities"].append(st)
    for name, start in (("AAPL.US.json", 1991), ("MSFT.US.json", 1991), ("AMZN.US.json", 1998), ("TSLA.US.json", 2011), ("VTI.US.json", 2002)):
        d, c = load_real(real_dir, name)
        for label, cl in windows(d, c, 5, start):
            groups["real equities"].append(window_stats(cl))
    d, c = load_real(real_dir, "BTC-USD.CC.json")
    for label, cl in windows(d, c, 3, 2014):
        groups["real crypto"].append(window_stats(cl))

    labels = {
        "vol": "annualised volatility",
        "kurt": "excess kurtosis (fat tails)",
        "acf1": "lag-1 autocorrelation of returns",
        "absacf1": "volatility clustering, |r| lag 1",
        "absacf20": "volatility clustering, |r| lag 20",
        "vr5": "variance ratio, 5 days",
        "vr20": "variance ratio, 20 days",
        "vr60": "variance ratio, 60 days",
        "mom_ic": "momentum IC (60d past vs 20d next)",
        "tsmom_minus_hold_sharpe": "trend rule Sharpe minus holding",
    }
    result = {}
    for pair in (("demo equities", "real equities"), ("demo crypto", "real crypto")):
        a, b = groups[pair[0]], groups[pair[1]]
        sa, sb = summarise(a, keys), summarise(b, keys)
        print(f"\n{pair[0]} (n={len(a)} windows) vs {pair[1]} (n={len(b)} windows)")
        print(f"{'statistic':40s} {'demo':>16s} {'real':>16s}   95% CI of difference")
        for k in keys:
            lo, hi = boot_diff([r[k] for r in a if np.isfinite(r[k])], [r[k] for r in b if np.isfinite(r[k])])
            flag = "  <- differs" if lo > 0 or hi < 0 else ""
            print(f"{labels[k]:40s} {sa[k][0]:8.3f} ±{sa[k][1]:6.3f} {sb[k][0]:8.3f} ±{sb[k][1]:6.3f}   [{lo:7.3f}, {hi:7.3f}]{flag}")
            result[f"{pair[0]}|{k}"] = {"demo": sa[k][0], "demo_se": sa[k][1], "real": sb[k][0], "real_se": sb[k][1], "ci": [lo, hi]}
    if "--json" in sys.argv:
        json.dump(result, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)


if __name__ == "__main__":
    main()
