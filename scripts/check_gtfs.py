"""Check that the GTFS files are in data/gtfs/ and show what they contain.

Usage: python scripts/check_gtfs.py [data/gtfs]
Accepts either extracted .txt files or a single .zip in that folder.
"""
import sys, zipfile, io, pathlib
import pandas as pd

folder = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "data/gtfs")
REQUIRED = ["stops", "routes", "trips", "stop_times"]
OPTIONAL = ["calendar", "calendar_dates", "shapes", "agency", "fare_attributes"]

def open_table(name):
    p = folder / f"{name}.txt"
    if p.exists():
        return pd.read_csv(p, dtype=str, nrows=None)
    for z in folder.glob("*.zip"):
        with zipfile.ZipFile(z) as zf:
            if f"{name}.txt" in zf.namelist():
                return pd.read_csv(io.BytesIO(zf.read(f"{name}.txt")), dtype=str)
    return None

missing = []
for name in REQUIRED + OPTIONAL:
    t = open_table(name)
    tag = "REQUIRED" if name in REQUIRED else "optional"
    if t is None:
        print(f"[missing] {name}.txt ({tag})")
        if name in REQUIRED: missing.append(name)
    else:
        print(f"[ok] {name}.txt: {len(t):,} rows; columns: {', '.join(t.columns)}")
if missing:
    sys.exit(f"\nMissing required files: {missing}. Put them in {folder}/")

routes, stops = open_table("routes"), open_table("stops")
tix = pd.read_csv("data/raw/October-Delhi.csv", usecols=["route", "start_stop_name"], dtype=str) \
    if pathlib.Path("data/raw/October-Delhi.csv").exists() else None
if tix is not None:
    tr = set(tix.route.unique())   # full ticket route, e.g. 717AUP == GTFS route_short_name
    for col in [c for c in ("route_id", "route_short_name") if c in routes.columns]:
        hit = len(tr & set(routes[col]))
        print(f"ticket routes equal to routes.{col}: {hit}/{len(tr)}")
    sn = set(tix.start_stop_name.str.lower().str.strip().unique())
    gs = set(stops.stop_name.str.lower().str.strip())
    print(f"ticket start stops exactly in stops.stop_name: {len(sn & gs)}/{len(sn)}")
