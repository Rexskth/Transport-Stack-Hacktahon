"""Shared pipeline steps used by run_pipeline.py and crowding/validate.py."""
import pandas as pd
from . import clean, gtfs, model


def prepare(src: str = "data/raw/October-Delhi.csv") -> dict:
    """Load tickets + GTFS and run everything up to the per-stretch counts."""
    g = gtfs.load()
    rs = gtfs.route_stops(g)
    starts = gtfs.trip_starts(g)
    df = clean.load(src)
    match = gtfs.match_stops(df[df.route.isin(set(rs.route_short_name))], rs)
    t, stats = model.resolve_positions(df, rs, match)
    counts, rs2, base = model.stretch_counts(t, rs)
    F = model.trips_at_stretch(starts, rs2, base)
    days = {0: df[~df.is_weekend].date.nunique(), 1: df[df.is_weekend].date.nunique()}
    return dict(df=df, t=t, stats=stats, counts=counts, rs=rs2, base=base, F=F, days=days, match=match)


def days_in_week(df: pd.DataFrame, week: int) -> dict:
    d = df[df.week == week]
    return {0: d[~d.is_weekend].date.nunique(), 1: d[d.is_weekend].date.nunique()}
