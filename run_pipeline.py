import sys, pandas as pd
from crowding import clean, stop_order, load_index
src = sys.argv[1] if len(sys.argv) > 1 else "data/raw/October-Delhi.csv"
df = clean.load(src)
order = stop_order.infer_orders(df)
order.to_csv("data/processed/stop_order.csv", index=False)
t = load_index.add_levels(load_index.stretch_load(df, order))
t.to_csv("data/processed/crowding.csv", index=False)
print(len(df), "tickets;", order.route.nunique(), "routes ordered;", len(t), "stretch-hour cells")
print(t.level.value_counts().to_string()); print(t.confidence.value_counts().to_string())
