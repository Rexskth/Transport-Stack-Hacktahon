"""In-memory data layer for the API. Loads data/processed/crowding.csv.gz once."""
import pathlib
import numpy as np
import pandas as pd
from crowding import config as C

CROWDING = pathlib.Path("data/processed/crowding.csv.gz")
ROUTE_STOPS = pathlib.Path("data/processed/route_stops.csv")
CONF_RANK = {"low": 0, "medium": 1, "high": 2}
CATS = ["route", "from_stop", "to_stop", "level", "source", "confidence"]


def level_from_index(x: float) -> str:
    return C.LEVEL_NAMES[0] if x <= C.LEVEL_BANDS[0] else C.LEVEL_NAMES[1] if x <= C.LEVEL_BANDS[1] else C.LEVEL_NAMES[2]


class Store:
    def __init__(self, crowding=CROWDING, route_stops=ROUTE_STOPS):
        df = pd.read_csv(crowding, dtype={c: "category" for c in CATS})
        df["conf_rank"] = df.confidence.map(CONF_RANK).astype("int8")
        self.cells = df
        self.by_slice = {k: g for k, g in df.groupby(["is_weekend", "hour"], observed=True)}
        self.stops = pd.read_csv(route_stops, usecols=["route_short_name", "pos", "stop_id", "stop_name", "stop_lat", "stop_lon"])
        self.routes = self._route_table()
        self.stop_index = (self.stops.groupby(["stop_id", "stop_name", "stop_lat", "stop_lon"], as_index=False)
                           .agg(routes=("route_short_name", "nunique")))
        self.stop_index["key"] = self.stop_index.stop_name.str.lower()

    def _route_table(self) -> pd.DataFrame:
        rs = self.stops.sort_values(["route_short_name", "pos"])
        g = rs.groupby("route_short_name")
        t = pd.DataFrame({"first_stop": g.stop_name.first(), "last_stop": g.stop_name.last(), "n_stops": g.size()})
        c = self.cells
        for wk in (False, True):
            h = c[c.is_weekend == wk].groupby(["route", "hour"], observed=True).agg(
                index=("index", "mean"), rpb=("riders_per_bus", "mean")).reset_index()
            pk = h.loc[h.groupby("route", observed=True).rpb.idxmax()].set_index("route")
            t[f"peak_hour_{'weekend' if wk else 'weekday'}"] = pk.hour.astype("Int64")
            t[f"peak_level_{'weekend' if wk else 'weekday'}"] = pk["index"].map(level_from_index)
        conf = c.groupby("route", observed=True).conf_rank.apply(lambda s: (s >= 1).mean()).rename("share_medium_or_high")
        t = t.join(conf)
        t.index.name = "route"
        return t.reset_index()

    def slice(self, weekend: bool, hour: int) -> pd.DataFrame:
        return self.by_slice.get((weekend, hour), self.cells.iloc[0:0])
