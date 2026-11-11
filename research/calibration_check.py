"""
Pre-registered acceptance criteria for the demo dataset, fixed before tuning
from the real-data ranges in stylised_facts.py. Prints PASS or FAIL per check.

Usage: python3 -I calibration_check.py <demo-daily.json>
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

CRITERIA = [
    # group, statistic, low, high
    ("equities", "kurt", 3.0, 9.0),
    ("equities", "absacf1", 0.10, 0.25),
    ("equities", "absacf20", 0.04, 0.20),
    ("equities", "vr60", 0.70, 1.15),
    ("equities", "mom_ic", -0.08, 0.03),
    ("crypto", "vr60", 0.95, 1.35),
    ("crypto", "mom_ic", -0.02, 0.08),
    ("crypto", "kurt", 3.0, 12.0),
]


def stw_checks(close):
    c = np.asarray(close)
    years = len(c) / 252
    cagr = (c[-1] / c[0]) ** (1 / years) - 1
    r = np.diff(np.log(c))
    vol = r.std(ddof=1) * np.sqrt(252)
    peak = np.maximum.accumulate(c)
    dd = ((peak - c) / peak).max()
    return [("STW annual volatility", vol, 0.13, 0.18), ("STW annual growth", cagr, 0.05, 0.11), ("STW worst fall", dd, 0.15, 0.35)]


def main():
    demo = json.load(open(sys.argv[1]))
    groups = {"equities": [], "crypto": []}
    for s in demo.values():
        groups["crypto" if s["market"] == "CRYPTO" else "equities"].append(sf.window_stats(s["c"]))
    ok = True
    for g, k, lo, hi in CRITERIA:
        v = float(np.median([r[k] for r in groups[g]]))
        good = lo <= v <= hi
        ok &= good
        print(f"{'PASS' if good else 'FAIL'}  {g:9s} {k:9s} median {v:7.3f}   accept [{lo}, {hi}]")
    for name, v, lo, hi in stw_checks(demo["ASX:STW"]["c"]):
        good = lo <= v <= hi
        ok &= good
        print(f"{'PASS' if good else 'FAIL'}  {name:28s} {v:7.3f}   accept [{lo}, {hi}]")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
