"""
An independent reimplementation of EdgeLab's execution rules, written from the
documented semantics rather than from the TypeScript, to cross-check the
engine on real data.

Rules reproduced (ARCHITECTURE.md, backtest.ts docs):
  - Daily bars, split and dividend adjusted by scaling OHLC by adjusted_close / close.
  - The strategy decides at bar i's close. Orders fill at bar i+1's open.
  - Buys pay open * (1 + slippage), sells receive open * (1 - slippage).
  - Fees: notional * fee_bps + a flat fee per order. Buys are scaled down so
    cash covers the notional, the proportional fee and the flat fee.
  - Sells execute before buys on the same bar.
  - Anything open at the end is sold at the final close less slippage, with fees.
  - Moving average crossover: buy when flat and the fast average crosses above
    the slow one (previous fast <= previous slow, now fast > slow). Sell when
    held and it crosses back below. EMA is seeded with the SMA of the first
    `period` closes. Trading starts after `slow` bars of warm-up.

Usage: python3 -I reference_engine.py <eodhd.json> <engine_output.json>
"""

import json
import sys


def load_eodhd(path):
    rows = json.load(open(path))
    bars = []
    for r in rows:
        o, h, l, c = r["open"], r["high"], r["low"], r["close"]
        adj = r.get("adjusted_close")
        if c is None or c <= 0:
            continue
        f = adj / c if adj and adj > 0 else 1.0
        bars.append({
            "date": r["date"],
            "open": o * f,
            "high": max(h, o, c) * f,
            "low": min(l, o, c) * f,
            "close": c * f,
        })
    bars.sort(key=lambda b: b["date"])
    return bars


def sma(values, n):
    out = [None] * len(values)
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= n:
            s -= values[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def ema(values, n):
    out = [None] * len(values)
    k = 2.0 / (n + 1)
    prev = None
    for i, v in enumerate(values):
        if i < n - 1:
            continue
        if prev is None:
            prev = sum(values[: n]) / n
        else:
            prev = v * k + prev * (1 - k)
        out[i] = prev
    return out


def run(bars, kind, fast=20, slow=60, ma="ema", capital=10_000.0, fee_bps=5, slip_bps=5, fee_fixed=10.0):
    fee_rate = fee_bps / 10_000
    slip = slip_bps / 10_000
    closes = [b["close"] for b in bars]
    if kind == "ma_crossover":
        fn = ema if ma == "ema" else sma
        fa, sl = fn(closes, fast), fn(closes, slow)
        start = slow
    else:
        start = 0
    end = len(bars) - 1
    cash = capital
    pos = None  # {"qty", "entry_price", "entry_fee", "entry_date"}
    pending = None  # ("buy", notional) | ("sell",)
    trades = []

    def sell(i, price):
        nonlocal cash, pos
        gross = pos["qty"] * price
        fee = gross * fee_rate + fee_fixed
        cash += gross - fee
        pnl = gross - fee - pos["qty"] * pos["entry_price"] - pos["entry_fee"]
        trades.append({"entry": pos["entry_date"], "exit": bars[i]["date"], "entryPrice": pos["entry_price"], "exitPrice": price, "pnl": pnl})
        pos = None

    for i in range(start, end + 1):
        b = bars[i]
        if pending is not None and i > start:
            if pending[0] == "sell" and pos is not None:
                sell(i, b["open"] * (1 - slip))
            elif pending[0] == "buy" and pos is None:
                fill = b["open"] * (1 + slip)
                affordable = (cash - fee_fixed) / (1 + fee_rate)
                notional = min(pending[1], affordable)
                if notional >= 1:
                    fee = notional * fee_rate + fee_fixed
                    cash -= notional + fee
                    pos = {"qty": notional / fill, "entry_price": fill, "entry_fee": fee, "entry_date": b["date"]}
            pending = None
        equity = cash + (pos["qty"] * b["close"] if pos else 0.0)
        if i == end:
            break
        if kind == "buy_and_hold":
            if pos is None and not trades:
                pending = ("buy", equity)
        else:
            f, s, pf, ps = fa[i], sl[i], fa[i - 1], sl[i - 1]
            if None in (f, s, pf, ps):
                continue
            if pos is None and pf <= ps and f > s:
                pending = ("buy", equity)
            elif pos is not None and pf >= ps and f < s:
                pending = ("sell",)
    if pos is not None:
        sell(end, bars[end]["close"] * (1 - slip))
    return {"final": cash, "trades": trades}


def main():
    data_path, engine_path = sys.argv[1], sys.argv[2]
    bars = load_eodhd(data_path)
    engine = json.load(open(engine_path))
    worst = 0.0
    ok = True
    for case in engine["cases"]:
        ref = run(bars, case["kind"], ma=case.get("ma", "ema"))
        eng_trades = case["trades"]
        same_count = len(ref["trades"]) == len(eng_trades)
        mismatches = 0
        for a, b in zip(ref["trades"], eng_trades):
            if a["entry"] != b["entry"] or a["exit"] != b["exit"]:
                mismatches += 1
                continue
            for k in ("entryPrice", "exitPrice"):
                rel = abs(a[k] - b[k]) / abs(a[k])
                worst = max(worst, rel)
            worst = max(worst, abs(a["pnl"] - b["pnl"]) / max(1.0, abs(a["pnl"])))
        rel_final = abs(ref["final"] - case["final"]) / ref["final"]
        worst = max(worst, rel_final)
        good = same_count and mismatches == 0 and rel_final < 1e-9
        ok = ok and good
        print(f"{case['label']:28s} trades ref={len(ref['trades']):4d} engine={len(eng_trades):4d} date mismatches={mismatches} "
              f"final ref={ref['final']:.6f} engine={case['final']:.6f} rel diff={rel_final:.2e} {'MATCH' if good else 'DIFFERENT'}")
    print(f"largest relative difference on any price, P&L or final value: {worst:.2e}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
