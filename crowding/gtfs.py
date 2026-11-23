"""Phase 1: load static GTFS and map ticket routes/stops onto it.

Findings that shape this module:
- Ticket `route` (e.g. '717AUP') equals GTFS routes.route_short_name (98% of tickets).
- GTFS has no direction_id; UP/DOWN are separate routes, so one route = one direction.
- calendar.txt has a single service for all days -> scheduled frequency has no weekday/weekend split.
- trip_id embeds departure time ('1_FULL_06_05'); we use stop_times instead.
"""
import difflib
import html
import pathlib
import pandas as pd
from .clean import norm_stop

GTFS_DIR = pathlib.Path("data/gtfs")


def load(gtfs_dir=GTFS_DIR):
    d = pathlib.Path(gtfs_dir)
    rd = lambda n, **k: pd.read_csv(d / f"{n}.txt", dtype=str, **k)
    stops = rd("stops").astype({"stop_lat": float, "stop_lon": float})
    stops["stop_name"] = stops.stop_name.map(html.unescape)       # the feed contains '&amp;' in some names
    return {
        "routes": rd("routes"),
        "stops": stops,
        "trips": rd("trips"),
        "stop_times": rd("stop_times", usecols=["trip_id", "departure_time", "stop_id", "stop_sequence"]),
    }


def route_stops(g) -> pd.DataFrame:
    """Ordered stops per route, taken from the trip with the most stops (the full-length pattern)."""
    st = g["stop_times"].assign(seq=lambda x: x.stop_sequence.astype(int), dep_s=lambda x: _secs(x.departure_time))
    n = st.groupby("trip_id").size().rename("n")
    trips = g["trips"].join(n, on="trip_id").dropna(subset=["n"])
    best = trips.sort_values("n", ascending=False).drop_duplicates("route_id")[["route_id", "trip_id"]]
    rs = st.merge(best, on="trip_id").merge(g["stops"], on="stop_id").merge(
        g["routes"][["route_id", "route_short_name"]], on="route_id")
    rs = rs.sort_values(["route_short_name", "seq"])
    rs["pos"] = rs.groupby("route_short_name").cumcount()          # 0..n-1 position along the route
    rs["offset_s"] = rs.dep_s - rs.groupby("route_short_name").dep_s.transform("first")   # scheduled seconds from first stop
    rs["stop_norm"] = rs.stop_name.map(norm_stop)
    return rs[["route_short_name", "pos", "stop_id", "stop_name", "stop_norm", "stop_lat", "stop_lon", "offset_s"]]


def _secs(hms: pd.Series) -> pd.Series:
    p = hms.str.split(":", expand=True).astype(int)
    return p[0] * 3600 + p[1] * 60 + p[2]


def trip_starts(g) -> pd.DataFrame:
    """Scheduled first-stop departure (seconds) of every trip, with its route_short_name."""
    st = g["stop_times"].assign(seq=lambda x: x.stop_sequence.astype(int))
    first = st.sort_values("seq").drop_duplicates("trip_id")[["trip_id", "departure_time"]]
    first["start_s"] = _secs(first.departure_time)
    return first.merge(g["trips"][["trip_id", "route_id"]], on="trip_id").merge(
        g["routes"][["route_id", "route_short_name"]], on="route_id")[["route_short_name", "start_s"]]


def trips_per_hour(g) -> pd.DataFrame:
    """Scheduled trips starting per route and hour (hour 0-23; GTFS times >24h wrap)."""
    st = g["stop_times"].assign(seq=lambda x: x.stop_sequence.astype(int))
    first = st.sort_values("seq").drop_duplicates("trip_id")[["trip_id", "departure_time"]]
    first["hour"] = first.departure_time.str[:2].astype(int) % 24
    x = first.merge(g["trips"][["trip_id", "route_id"]], on="trip_id").merge(
        g["routes"][["route_id", "route_short_name"]], on="route_id")
    return x.groupby(["route_short_name", "hour"]).size().rename("trips").reset_index()


def _variants(names) -> dict:
    """variant string -> GTFS stop_norm. Variants are the full name plus its '/'-separated parts."""
    v = {}
    for n in names:
        v.setdefault(n, n)
        for part in n.split("/"):
            part = part.strip()
            if part:
                v.setdefault(part, n)
    return v


def match_stops(tickets: pd.DataFrame, rs: pd.DataFrame, cutoff: float = 0.8) -> pd.DataFrame:
    """Map each (route, normalised ticket stop name) to a stop on that route.

    Order of attempts, always limited to the route's own stops:
      exact    - same normalised name
      segment  - equals one '/'-separated part of a GTFS name
      prefix   - one name starts with the other (both >= 5 chars)
      fuzzy    - difflib close match (ratio >= cutoff) over names and parts
    """
    by_route = {r: _variants(set(g.stop_norm)) for r, g in rs.groupby("route_short_name")}
    names = pd.concat([tickets[["route", "start"]].rename(columns={"start": "stop"}),
                       tickets[["route", "end"]].rename(columns={"end": "stop"})])
    cnt = names.groupby(["route", "stop"]).size().rename("tickets").reset_index()
    out = []
    for route, stop, n in cnt.itertuples(index=False):
        v = by_route.get(route)
        if not v:
            out.append((route, stop, None, "no_route", 0.0, n)); continue
        if stop in v:
            full = stop in set(v.values())
            out.append((route, stop, v[stop], "exact" if full else "segment", 1.0, n)); continue
        pre = [k for k in v if len(stop) >= 5 and len(k) >= 5 and (k.startswith(stop) or stop.startswith(k))]
        if pre:
            k = min(pre, key=lambda x: abs(len(x) - len(stop)))
            out.append((route, stop, v[k], "prefix", 0.9, n)); continue
        m = difflib.get_close_matches(stop, list(v), n=1, cutoff=cutoff)
        if m:
            out.append((route, stop, v[m[0]], "fuzzy", difflib.SequenceMatcher(None, stop, m[0]).ratio(), n))
        else:
            out.append((route, stop, None, "unmatched", 0.0, n))
    return pd.DataFrame(out, columns=["route", "ticket_stop", "stop_norm", "method", "score", "tickets"])
