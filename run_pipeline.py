"""Full pipeline: tickets + GTFS -> data/processed/crowding.csv.gz."""
import sys
from crowding import model, pipeline

src = sys.argv[1] if len(sys.argv) > 1 else "data/raw/October-Delhi.csv"
p = pipeline.prepare(src)
s = p["stats"]
print(f"tickets placed on GTFS stop order: {s['tickets_placed']:,}/{s['tickets_in']:,} ({s['share_placed']:.1%})")
out = model.estimate(p["counts"], p["rs"], p["base"], p["F"], p["days"])
out.to_csv("data/processed/crowding.csv.gz", index=False)
print(f"{len(out):,} route-stretch-hour cells -> data/processed/crowding.csv.gz")
for c in ("level", "source", "confidence"):
    print(out[c].value_counts(normalize=True).round(3).to_string(), "\n")
