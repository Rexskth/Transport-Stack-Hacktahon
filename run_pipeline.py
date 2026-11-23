"""Full pipeline: tickets + GTFS -> data/processed/crowding.csv.gz  (run scripts/build_gtfs_tables.py first)."""
import sys
import pandas as pd
from crowding import clean, gtfs, model

src = sys.argv[1] if len(sys.argv) > 1 else "data/raw/October-Delhi.csv"
g = gtfs.load()
rs = gtfs.route_stops(g)
starts = gtfs.trip_starts(g)
df = clean.load(src)
match = gtfs.match_stops(df[df.route.isin(set(rs.route_short_name))], rs)
t, stats = model.resolve_positions(df, rs, match)
print(f"tickets placed on GTFS stop order: {stats['tickets_placed']:,}/{stats['tickets_in']:,} ({stats['share_placed']:.1%})")
counts, rs2, base = model.stretch_counts(t, rs)
F = model.trips_at_stretch(starts, rs2, base)
days = {0: df[~df.is_weekend].date.nunique(), 1: df[df.is_weekend].date.nunique()}
out = model.estimate(counts, rs2, base, F, days)
out.to_csv("data/processed/crowding.csv.gz", index=False)
print(f"{len(out):,} route-stretch-hour cells -> data/processed/crowding.csv.gz")
for c in ("level", "source", "confidence"):
    print(out[c].value_counts(normalize=True).round(3).to_string(), "\n")
