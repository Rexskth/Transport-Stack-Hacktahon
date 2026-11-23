"""Step 2: infer stop order per route+direction from tickets (fallback when GTFS absent).

A ticket says start precedes end. Score each stop by (#times it was a start before others
- #times it was an end); Copeland-style ranking is robust to noisy pairs. With GTFS,
replace `infer_orders` with stop_times.txt ordering.
"""
import pandas as pd

def infer_orders(df: pd.DataFrame, min_pairs: int = 30) -> pd.DataFrame:
    rows = []
    for route, g in df.groupby("route"):
        if len(g) < min_pairs:
            continue
        pairs = g.groupby(["start", "end"]).size().reset_index(name="n")
        score = {}
        for s, e, n in pairs.itertuples(index=False):
            score[s] = score.get(s, 0) + n
            score[e] = score.get(e, 0) - n
        # normalise by involvement so busy stops don't dominate
        inv = pd.concat([pairs.groupby("start").n.sum(), pairs.groupby("end").n.sum()], axis=1).fillna(0).sum(axis=1)
        s = pd.Series(score) / inv.reindex(score.keys())
        for rank, (stop, val) in enumerate(s.sort_values(ascending=False).items()):
            rows.append((route, stop, rank, val, int(inv[stop])))
    return pd.DataFrame(rows, columns=["route", "stop", "seq", "score", "tickets"])
