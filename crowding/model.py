"""Phase 2: tickets -> riders per stretch -> riders per bus -> relative crowding level.

Pipeline
 1. resolve_positions: place each ticket's start/end on the GTFS stop order of its route.
 2. stretch_counts: spread each ticket over the stretches between its stops. The hour of a
    stretch is the ticket time plus the scheduled travel offset to that stretch.
 3. trips_at_stretch: scheduled buses passing each stretch per hour (GTFS trips shifted by offsets).
 4. estimate: per-day riders, low-data fallback (raw -> pooled +-1h -> route average),
    riders per bus, percentile index within day type, level, confidence.
A stretch k is the segment between stop position k and k+1 of the route.
"""
import numpy as np
import pandas as pd
from . import config as C

NHOURS = 24


def resolve_positions(df: pd.DataFrame, rs: pd.DataFrame, match: pd.DataFrame):
    """Return (tickets with s_pos/e_pos, stats). Drops unmatched stops and wrong-direction pairs."""
    tri = df[["route", "start", "end"]].drop_duplicates()
    m = match.dropna(subset=["stop_norm"])[["route", "ticket_stop", "stop_norm"]]
    pos = rs[["route_short_name", "stop_norm", "pos"]].rename(columns={"route_short_name": "route"})
    tri = (tri.merge(m.rename(columns={"ticket_stop": "start", "stop_norm": "s_norm"}), on=["route", "start"])
              .merge(m.rename(columns={"ticket_stop": "end", "stop_norm": "e_norm"}), on=["route", "end"])
              .merge(pos.rename(columns={"stop_norm": "s_norm", "pos": "s_pos"}), on=["route", "s_norm"])
              .merge(pos.rename(columns={"stop_norm": "e_norm", "pos": "e_pos"}), on=["route", "e_norm"]))
    tri = tri[tri.e_pos > tri.s_pos]
    tri = tri.assign(span=tri.e_pos - tri.s_pos).sort_values("span").drop_duplicates(["route", "start", "end"])
    out = df.merge(tri[["route", "start", "end", "s_pos", "e_pos"]], on=["route", "start", "end"])
    stats = {"tickets_in": len(df), "tickets_placed": len(out), "share_placed": len(out) / len(df),
             "pax_placed": int(out.passenger_count.sum())}
    return out, stats


def _route_index(rs: pd.DataFrame):
    rs = rs.sort_values(["route_short_name", "pos"]).reset_index(drop=True)
    base = rs.groupby("route_short_name").cumcount().rsub(rs.index.to_series()).groupby(rs.route_short_name).first()
    return rs, base            # base[route] = row index of the route's first stop


def stretch_counts(t: pd.DataFrame, rs: pd.DataFrame):
    """Passenger counts per (row-index of stretch start, is_weekend, week, hour)."""
    rs, base = _route_index(rs)
    off = rs.offset_s.values.astype(np.int64)
    t = t.assign(b=t.route.map(base)).dropna(subset=["b"])
    parts = []
    for _, d in t.groupby("date"):
        s, e, b = d.s_pos.values.astype(np.int64), d.e_pos.values.astype(np.int64), d.b.values.astype(np.int64)
        n = e - s
        rep = np.repeat(np.arange(len(d)), n)
        within = np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n)
        ridx = b[rep] + s[rep] + within
        tsec = (d.t.dt.hour * 3600 + d.t.dt.minute * 60 + d.t.dt.second).values[rep]
        sec = tsec + off[ridx] - off[b[rep] + s[rep]]
        parts.append(pd.DataFrame({"ridx": ridx, "wk": int(d.is_weekend.iloc[0]), "week": int(d.week.iloc[0]),
                                   "hour": (sec // 3600) % NHOURS, "pax": d.passenger_count.values[rep],
                                   "tix": 1}))
    c = pd.concat(parts).groupby(["ridx", "wk", "week", "hour"], as_index=False)[["pax", "tix"]].sum()
    return c, rs, base


def trips_at_stretch(starts: pd.DataFrame, rs: pd.DataFrame, base: pd.Series) -> np.ndarray:
    """F[ridx, hour] = scheduled trips passing the stretch in that hour (all trips assumed full length)."""
    off = rs.offset_s.values.astype(np.int64)
    F = np.zeros((len(rs), NHOURS))
    n_by = rs.groupby("route_short_name").size()
    for route, g in starts.groupby("route_short_name"):
        if route not in base.index:
            continue
        b, n = int(base[route]), int(n_by[route])
        hrs = ((g.start_s.values[:, None] + off[b:b + n][None, :]) // 3600) % NHOURS
        F[b:b + n] = np.bincount((np.arange(n)[None, :] * NHOURS + hrs).ravel(), minlength=n * NHOURS).reshape(n, NHOURS)
    return F


def estimate(counts: pd.DataFrame, rs: pd.DataFrame, base: pd.Series, F: np.ndarray, days: dict) -> pd.DataFrame:
    """days = {0: n weekday dates, 1: n weekend dates}. Returns one row per route-stretch-daytype-hour."""
    N = len(rs)
    agg = counts.groupby(["ridx", "wk", "hour"], as_index=False)[["pax", "tix"]].sum()
    P, T = np.zeros((N, 2, NHOURS)), np.zeros((N, 2, NHOURS))
    P[agg.ridx, agg.wk, agg.hour] = agg.pax
    T[agg.ridx, agg.wk, agg.hour] = agg.tix
    nd = np.array([days[0], days[1]], dtype=float)[None, :, None]

    def pool(X):
        W = X.copy(); W[..., 1:] += X[..., :-1]; W[..., :-1] += X[..., 1:]; return W
    Pw, Tw = pool(P), pool(T)

    raw_ok = T >= C.MIN_TICKETS_RAW
    pool_ok = ~raw_ok & (Tw >= C.MIN_TICKETS_POOLED)
    rpd = np.where(raw_ok, P / nd, np.where(pool_ok, Pw / 3 / nd, np.nan))
    source = np.where(raw_ok, 0, np.where(pool_ok, 1, 2))          # 0 raw, 1 pooled, 2 route average / none

    # route-average fallback: mean riders per stretch of the route at that day type and hour
    bases = base.sort_values().values
    nstr = np.diff(np.append(bases, N))
    ravg = np.add.reduceat(P, bases, axis=0) / nstr[:, None, None] / nd
    rcode = np.repeat(np.arange(len(bases)), nstr)
    ravg_full = ravg[rcode]
    has = np.add.reduceat(T, bases, axis=0)[rcode] > 0
    fb = (source == 2) & has
    rpd = np.where(fb, ravg_full, rpd)

    Fx = np.broadcast_to(F[:, None, :], P.shape)
    ok = np.isfinite(rpd) & (Fx > 0)
    rpb = np.where(ok, rpd / np.maximum(Fx, C.MIN_TRIPS_PER_HOUR), np.nan)   # floor: thin service is unreliable

    ridx, wk, hour = np.nonzero(ok)
    out = pd.DataFrame({"ridx": ridx, "is_weekend": wk.astype(bool), "hour": hour,
                        "riders_per_day": rpd[ok], "trips": Fx[ok], "riders_per_bus": rpb[ok],
                        "tickets": T[ok], "tickets_pooled": Tw[ok], "source_code": source[ok]})
    out["source"] = out.source_code.map({0: "raw", 1: "pooled_hours", 2: "route_average"})
    out["index"] = out.groupby("is_weekend").riders_per_bus.rank(pct=True)
    out["level"] = pd.cut(out["index"], [0, *C.LEVEL_BANDS, 1.0], labels=C.LEVEL_NAMES, include_lowest=True)
    out["est_load_per_bus"] = out.riders_per_bus / C.TICKET_SAMPLE_RATE * (1 + C.PASS_HOLDER_UPLIFT)
    out["load_factor"] = out.est_load_per_bus / C.BUS_CAPACITY
    own = np.where(out.source_code == 0, out.tickets, out.tickets_pooled)
    out["confidence"] = np.select(
        [out.trips < C.MIN_TRIPS_PER_HOUR,
         (out.source_code == 0) & (own >= C.CONF_HIGH), (out.source_code <= 1) & (own >= C.MIN_TICKETS_RAW)],
        ["low", "high", "medium"], "low")
    r = rs.loc[out.ridx]
    nxt = rs.stop_name.shift(-1)
    out["route"] = r.route_short_name.values
    out["stretch"] = r.pos.values
    out["from_stop"] = r.stop_name.values
    out["to_stop"] = nxt.loc[out.ridx].values
    out["from_stop_id"] = r.stop_id.values
    out["lat"], out["lon"] = r.stop_lat.values, r.stop_lon.values
    cols = ["route", "stretch", "from_stop", "to_stop", "from_stop_id", "lat", "lon", "is_weekend", "hour",
            "riders_per_day", "trips", "riders_per_bus", "index", "level", "est_load_per_bus", "load_factor",
            "tickets", "source", "confidence"]
    return out[cols]
