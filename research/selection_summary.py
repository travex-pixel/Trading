"""
Summarises research/selection.research.ts output.

Usage: python3 -I selection_summary.py <selection.json> [label]
"""

import json
import sys

import numpy as np

rng = np.random.default_rng(11)


def ci_mean(x, n=4000):
    x = np.asarray(x, dtype=float)
    b = [rng.choice(x, len(x)).mean() for _ in range(n)]
    return np.percentile(b, [2.5, 97.5])


def summarise(rows, label):
    rank = np.array([r["winnerOosRank"] for r in rows])
    sp = np.array([r["spearman"] for r in rows])
    beat_hold_ret = np.array([r["winnerOosReturn"] > r["holdOosReturn"] for r in rows], dtype=float)
    beat_hold_sc = np.array([r["winnerOosScore"] > r["holdOosScore"] for r in rows], dtype=float)
    lo, hi = ci_mean(rank)
    slo, shi = ci_mean(sp)
    hlo, hhi = ci_mean(beat_hold_sc)
    print(f"{label:34s} n={len(rows):3d}  winner rank {rank.mean():.2f} [{lo:.2f},{hi:.2f}]  top half {np.mean(rank <= 3):4.0%}  "
          f"rank corr {sp.mean():+.3f} [{slo:+.3f},{shi:+.3f}]  beats hold: return {beat_hold_ret.mean():4.0%}, risk-adj {beat_hold_sc.mean():4.0%} [{hlo:.0%},{hhi:.0%}]")
    return {"n": len(rows), "rank": rank.mean(), "rank_ci": [lo, hi], "top_half": float(np.mean(rank <= 3)), "spearman": sp.mean(), "spearman_ci": [slo, shi],
            "beat_hold_return": beat_hold_ret.mean(), "beat_hold_riskadj": beat_hold_sc.mean(), "beat_hold_riskadj_ci": [hlo, hhi]}


def main():
    d = json.load(open(sys.argv[1]))
    tag = sys.argv[2] if len(sys.argv) > 2 else ""
    out = {}
    out["real"] = summarise(d["real"], f"real {tag}")
    out["demo"] = summarise(d["demo"], f"demo-v3 {tag}")
    if tag == "":
        for inst in sorted(set(r["instrument"] for r in d["real"])):
            summarise([r for r in d["real"] if r["instrument"] == inst], f"  {inst}")
        summarise([r for r in d["real"] if r["isStart"] < "2008"], "  real, windows starting before 2008")
        summarise([r for r in d["real"] if r["isStart"] >= "2008"], "  real, windows starting 2008 on")
    json.dump(out, open(sys.argv[1].replace(".json", f".summary{tag.replace(' ', '')}.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
