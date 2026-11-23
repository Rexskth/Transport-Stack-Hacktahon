"""Step 1: load and clean raw ticket CSV -> data/processed/tickets.parquet-like CSV."""
import re, sys
import pandas as pd
from . import config

def norm_stop(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"\s*\(\s*", " (", s)          # 'Border(T)' == 'Border (T)'
    s = re.sub(r"\s+", " ", s)
    return s

def load(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df["passenger_count"] = pd.to_numeric(df.passenger_count, errors="coerce").fillna(1).astype(int)
    df["amount"] = pd.to_numeric(df.amount, errors="coerce")
    df["vehicle_number"] = df.vehicle_number.where(~df.vehicle_number.isin(["", "NULL"]))
    df["is_ac"] = df.is_ac.eq("True")
    df["t"] = pd.to_datetime(df.created_at.str[:19])   # already IST
    df["date"] = df.t.dt.date
    df["hour"] = df.t.dt.hour
    df["dow"] = df.t.dt.dayofweek
    df["is_weekend"] = (df.dow >= 5) | df.t.dt.strftime("%Y-%m-%d").isin(config.HOLIDAY_DATES)
    df["week"] = (df.t.dt.day - 1) // 7 + 1            # week 1..5 of October
    m = df.route.str.extract(r"^(.*?)(UP|DOWN)$")
    df["route_base"], df["direction"] = m[0], m[1]
    df = df.dropna(subset=["direction"])                # drops ~32k rows w/o direction
    df["start"] = df.start_stop_name.map(norm_stop)
    df["end"] = df.end_stop_name.map(norm_stop)
    df = df[df.start != df.end]
    return df

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    d = load(src)
    d.drop(columns=["created_at", "ticket_type_id", "start_stop_name", "end_stop_name"]).to_csv(dst, index=False)
    print(len(d), "rows ->", dst)
