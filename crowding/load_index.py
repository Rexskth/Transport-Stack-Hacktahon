"""Step 3: riders per stretch per hour -> relative crowding index + level + confidence."""
import numpy as np, pandas as pd

def stretch_load(df: pd.DataFrame, order: pd.DataFrame) -> pd.DataFrame:
    seq = order.set_index(["route", "stop"]).seq
    d = df.join(seq.rename("s_seq"), on=["route", "start"]).join(seq.rename("e_seq"), on=["route", "end"])
    d = d.dropna(subset=["s_seq", "e_seq"])
    d = d[d.e_seq > d.s_seq]
    d["s_seq"], d["e_seq"] = d.s_seq.astype(int), d.e_seq.astype(int)
    # explode ticket -> stretches [s_seq, e_seq): stretch k = between stop k and k+1
    d["stretch"] = [range(a, b) for a, b in zip(d.s_seq, d.e_seq)]
    x = d[["route", "hour", "is_weekend", "week", "date", "passenger_count", "stretch"]].explode("stretch")
    x["stretch"] = x.stretch.astype(int)
    day = x.groupby(["route", "stretch", "is_weekend", "hour", "date"], as_index=False).passenger_count.sum()
    out = day.groupby(["route", "stretch", "is_weekend", "hour"]).agg(
        riders_per_day=("passenger_count", "mean"), days=("date", "nunique"), tickets=("passenger_count", "sum")).reset_index()
    return out

def add_levels(t: pd.DataFrame) -> pd.DataFrame:
    # index = riders per day on stretch/hour, ranked against all stretch-hours (percentile)
    t["index"] = t.riders_per_day.rank(pct=True)
    t["level"] = pd.cut(t["index"], [0, .5, .85, 1.0], labels=["seats", "standing", "crowded"], include_lowest=True)
    t["confidence"] = np.select([t.tickets >= 50, t.tickets >= 10], ["high", "medium"], "low")
    return t
