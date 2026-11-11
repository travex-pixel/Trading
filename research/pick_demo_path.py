"""
Judges the demo generator as a process across many independent paths, and
picks each market's published path as the most typical candidate.

Usage: python3 -I pick_demo_path.py <demo-paths.json>
"""

import importlib.util
import json
import os
import sys

import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("sf", os.path.join(here, "stylised_facts.py"))
sf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sf)
cal = importlib.util.spec_from_file_location("cc", os.path.join(here, "calibration_check.py"))
cc = importlib.util.module_from_spec(cal)
cal.loader.exec_module(cc)

INDEX = {"ASX": "ASX:STW", "US": "US:SPY", "CRYPTO": "CRYPTO:BTC"}


def path_summary(close):
    c = np.asarray(close)
    years = len(c) / 252
    r = np.diff(np.log(c))
    peak = np.maximum.accumulate(c)
    st = sf.window_stats(c)
    return {
        "cagr": (c[-1] / c[0]) ** (1 / years) - 1,
        "dd": ((peak - c) / peak).max(),
        "vol": r.std(ddof=1) * np.sqrt(252),
        # What users learn from: whether the path happens to reward trend rules.
        "acf1": st["acf1"],
        "vr20": st["vr20"],
        "trend": st["tsmom_minus_hold_sharpe"],
    }


def main():
    paths = json.load(open(sys.argv[1]))
    # Process-level stylised facts: median across every path and instrument.
    groups = {"equities": [], "crypto": []}
    for p in paths.values():
        for s in p.values():
            groups["crypto" if s["market"] == "CRYPTO" else "equities"].append(sf.window_stats(s["c"]))
    print(f"process level, {len(paths)} paths")
    ok = True
    for g, k, lo, hi in cc.CRITERIA:
        vals = np.array([r[k] for r in groups[g]])
        v = float(np.median(vals))
        good = lo <= v <= hi
        ok &= good
        print(f"  {'PASS' if good else 'FAIL'}  {g:9s} {k:9s} median {v:7.3f}  IQR [{np.percentile(vals, 25):.3f}, {np.percentile(vals, 75):.3f}]   accept [{lo}, {hi}]")
    # Most typical path per market: closest to the process medians, in robust z units, on growth, worst
    # fall and volatility, and on the dimensions that decide whether trend rules look good: day-to-day
    # autocorrelation, the 20-day variance ratio and a trend rule's Sharpe advantage over holding.
    choice = {}
    for market, idx in INDEX.items():
        rows = {int(k): path_summary(p[idx]["c"]) for k, p in paths.items()}
        keys = ("cagr", "dd", "vol", "acf1", "vr20", "trend")
        med = {k: np.median([r[k] for r in rows.values()]) for k in keys}
        mad = {k: np.median([abs(r[k] - med[k]) for r in rows.values()]) or 1e-9 for k in keys}
        dist = {pid: sum(((r[k] - med[k]) / mad[k]) ** 2 for k in keys) for pid, r in rows.items()}
        best = min(dist, key=dist.get)
        choice[market] = best
        b = rows[best]
        print(f"{market:6s} {idx:11s} median: growth {med['cagr']:6.1%} fall {med['dd']:5.1%} vol {med['vol']:5.1%} acf1 {med['acf1']:6.3f} vr20 {med['vr20']:5.3f} trend-vs-hold {med['trend']:6.3f}")
        print(f"{'':18s} path {best:2d}: growth {b['cagr']:6.1%} fall {b['dd']:5.1%} vol {b['vol']:5.1%} acf1 {b['acf1']:6.3f} vr20 {b['vr20']:5.3f} trend-vs-hold {b['trend']:6.3f}")
    print("DEMO_PATH =", json.dumps(choice))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
