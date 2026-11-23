"""Phase 1 entry point: build GTFS-derived tables and report ticket match rates.

Usage: python scripts/build_gtfs_tables.py [data/raw/October-Delhi.csv]
Writes data/processed/{route_stops,trips_per_hour,trip_starts,stop_match}.csv
"""
import sys
sys.path.insert(0, ".")
from crowding import clean, gtfs

src = sys.argv[1] if len(sys.argv) > 1 else "data/raw/October-Delhi.csv"
g = gtfs.load()
rs = gtfs.route_stops(g); rs.to_csv("data/processed/route_stops.csv", index=False)
tph = gtfs.trips_per_hour(g); tph.to_csv("data/processed/trips_per_hour.csv", index=False)
gtfs.trip_starts(g).to_csv("data/processed/trip_starts.csv", index=False)
print(f"route_stops: {rs.route_short_name.nunique()} routes, {len(rs)} rows; trips_per_hour: {len(tph)} rows")

df = clean.load(src)
in_gtfs = df.route.isin(set(rs.route_short_name))
print(f"tickets on routes found in GTFS: {in_gtfs.mean():.1%}")
df = df[in_gtfs]
m = gtfs.match_stops(df, rs); m.to_csv("data/processed/stop_match.csv", index=False)
w = m.groupby("method").tickets.sum(); print("\nstop matches (ticket-weighted):"); print((w / w.sum()).round(3).to_string())
