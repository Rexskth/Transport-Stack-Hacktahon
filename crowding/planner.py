"""Phase 5: bus journey planner with crowding.

Scope (kept simple on purpose): bus only, direct trips and trips with one transfer, scheduled
(GTFS) bus times, no live data. The crowding model is the main contribution.

How a journey is built
 - Origin/destination are a GTFS stop_id or "lat,lon". Coordinates snap to the nearest stops within
   MAX_WALK_M. Stops with the same name within ~300 m form one "node" so transfers work across the road.
 - Direct: a route that visits an origin node and later a destination node.
 - One transfer: route A from the origin to a node x, route B from x to the destination.
 - Times: walking at WALK_MPS with a detour factor, wait for the next scheduled trip, ride time from the
   GTFS stop offsets, a fixed buffer when changing buses.
 - Crowding: for every stretch ridden we look up the model cell at the hour the bus is there.
"""
from collections import defaultdict
import numpy as np
import pandas as pd
from . import config as C

WALK_MPS = 1.25          # 4.5 km/h
DETOUR = 1.3             # straight line -> street distance
MAX_WALK_M = 1000
K_STOPS = 6              # nearest stops considered at each end when given coordinates
TRANSFER_S = 180         # buffer when changing buses
MAX_TOTAL_MIN = 240
TOP_TRANSFERS = 40
LATER_OFFSETS_S = (0, 20 * 60, 40 * 60)
NH = 24
LEVELS = C.LEVEL_NAMES


def level_from_index(x):
    if x is None or not np.isfinite(x):
        return "unknown"
    return LEVELS[0] if x <= C.LEVEL_BANDS[0] else LEVELS[1] if x <= C.LEVEL_BANDS[1] else LEVELS[2]


def level_rank(level):
    return LEVELS.index(level) if level in LEVELS else 1      # unknown ranks as middle


def comfort_rank(cr):
    """Rank for 'prefer comfort'. A level backed by little data does not get credit: it ranks as 'standing'."""
    return 1 if cr["confidence"] == "low" else level_rank(cr["level"])


def hav_m(lat1, lon1, lat2, lon2):
    p = np.pi / 180
    a = np.sin((lat2 - lat1) * p / 2) ** 2 + np.cos(lat1 * p) * np.cos(lat2 * p) * np.sin((lon2 - lon1) * p / 2) ** 2
    return 12742000 * np.arcsin(np.sqrt(a))


def hhmm(sec):
    sec = int(sec) % 86400
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}"


class Planner:
    def __init__(self, route_stops: pd.DataFrame, trip_starts: pd.DataFrame, cells: pd.DataFrame):
        rs = route_stops.sort_values(["route_short_name", "pos"]).reset_index(drop=True)
        self.rs = rs
        self.N = len(rs)
        self.names = rs.route_short_name.unique().tolist()
        self.code_of = {n: i for i, n in enumerate(self.names)}
        self.base = np.flatnonzero(rs.pos.values == 0)
        self.nstops = np.diff(np.append(self.base, self.N))
        self.rcode = np.repeat(np.arange(len(self.names)), self.nstops)
        self.off = rs.offset_s.values.astype(np.int64)
        self.lat, self.lon = rs.stop_lat.values, rs.stop_lon.values
        self.stop_id, self.stop_name = rs.stop_id.astype(str).values, rs.stop_name.values
        # nodes: same normalised name within one ~330 m grid cell
        key = rs.stop_norm + "|" + (rs.stop_lat / 0.003).round().astype(int).astype(str) + "|" + (rs.stop_lon / 0.003).round().astype(int).astype(str)
        self.node = key.factorize()[0]
        self.stop_routes = defaultdict(list)
        for n, c, p in zip(self.node, self.rcode, rs.pos.values):
            self.stop_routes[n].append((int(c), int(p)))
        u = rs.drop_duplicates("stop_id")
        self.stops = u[["stop_id", "stop_name", "stop_lat", "stop_lon"]].astype({"stop_id": str}).reset_index(drop=True)
        first = pd.Series(np.arange(self.N), index=self.stop_id).groupby(level=0).first()
        self.stop_row = first.to_dict()                               # stop_id -> a row index
        self.starts = {self.code_of[r]: np.sort(g.start_s.values) for r, g in trip_starts.groupby("route_short_name") if r in self.code_of}
        self._build_crowd(cells)

    # ---- crowding lookup -------------------------------------------------------------------------
    def _build_crowd(self, cells):
        self.IDX = np.full((self.N, 2, NH), np.nan, dtype=np.float32)
        self.CONF = np.full((self.N, 2, NH), -1, dtype=np.int8)
        code = cells.route.astype(str).map(self.code_of)
        ok = code.notna().values
        rows = self.base[code[ok].astype(int).values] + cells.stretch.values[ok]
        wk, hr = cells.is_weekend.values[ok].astype(int), cells.hour.values[ok]
        self.IDX[rows, wk, hr] = cells["index"].values[ok]
        self.CONF[rows, wk, hr] = cells.conf_rank.values[ok]

    # ---- resolving origin / destination ----------------------------------------------------------
    def _resolve(self, spec: str):
        """-> list of (node, walk_seconds, stop_id, name). Raises ValueError if nothing found."""
        spec = spec.strip()
        if "," in spec:
            try:
                la, lo = (float(x) for x in spec.split(","))
            except ValueError:
                raise ValueError(f"cannot read coordinates '{spec}'")
            d = hav_m(la, lo, self.stops.stop_lat.values, self.stops.stop_lon.values)
            order = np.argsort(d)[:K_STOPS * 3]
            out, seen = [], set()
            for i in order:
                if d[i] > MAX_WALK_M:
                    break
                sid = self.stops.stop_id[i]
                n = int(self.node[self.stop_row[sid]])
                if n in seen:
                    continue
                seen.add(n)
                out.append((n, d[i] * DETOUR / WALK_MPS, sid, self.stops.stop_name[i]))
                if len(out) == K_STOPS:
                    break
            if not out:
                raise ValueError(f"no bus stop within {MAX_WALK_M} m of {spec}")
            return out
        if spec not in self.stop_row:
            raise ValueError(f"unknown stop_id '{spec}'")
        r = self.stop_row[spec]
        return [(int(self.node[r]), 0.0, spec, self.stop_name[r])]

    # ---- timetable ---------------------------------------------------------------------------------
    def _next_trip(self, code, pos, arrive_s):
        """Start time of the first trip of `code` that reaches `pos` at or after arrive_s."""
        st = self.starts.get(code)
        if st is None:
            return None
        i = np.searchsorted(st, arrive_s - self.off[self.base[code] + pos])
        return None if i >= len(st) else int(st[i])

    # ---- crowding for a leg ------------------------------------------------------------------------
    def _leg(self, code, pos_o, pos_d, trip_start, weekend):
        b = self.base[code]
        ks = np.arange(pos_o, pos_d)
        hours = ((trip_start + self.off[b + ks]) // 3600) % NH
        idx = self.IDX[b + ks, int(weekend), hours]
        conf = self.CONF[b + ks, int(weekend), hours]
        levels = [level_from_index(v) for v in idx]
        known = np.isfinite(idx)
        rows = b + np.arange(pos_o, pos_d + 1)
        return {
            "route": self.names[code],
            "board": {"stop_id": self.stop_id[rows[0]], "name": self.stop_name[rows[0]], "lat": float(self.lat[rows[0]]), "lon": float(self.lon[rows[0]])},
            "alight": {"stop_id": self.stop_id[rows[-1]], "name": self.stop_name[rows[-1]], "lat": float(self.lat[rows[-1]]), "lon": float(self.lon[rows[-1]])},
            "board_time": hhmm(trip_start + self.off[b + pos_o]),
            "alight_time": hhmm(trip_start + self.off[b + pos_d]),
            "minutes_on_bus": round((self.off[b + pos_d] - self.off[b + pos_o]) / 60, 1),
            "stops": int(pos_d - pos_o),
            "path": [[float(self.lat[r]), float(self.lon[r])] for r in rows],
            "stretch_levels": levels,
            "_idx": idx, "_known": known, "_conf": conf,
        }

    @staticmethod
    def _crowding(legs):
        idx = np.concatenate([l["_idx"] for l in legs])
        conf = np.concatenate([l["_conf"] for l in legs])
        known = np.isfinite(idx)
        avg = float(np.nanmean(idx)) if known.any() else None
        coverage = float(((conf >= 1) & known).mean()) if len(idx) else 0.0
        peak = float(np.nanmax(idx)) if known.any() else None
        lv = level_from_index(avg)
        return {"level": lv, "avg_index": avg, "peak_level": level_from_index(peak),
                "crowded_share": float(np.mean([x == LEVELS[2] for l in legs for x in l["stretch_levels"]])),
                "data_coverage": coverage,
                "confidence": "high" if coverage >= 0.8 else "medium" if coverage >= 0.5 else "low"}

    # ---- search ------------------------------------------------------------------------------------
    def _candidates(self, o, d):
        dest_by_route = defaultdict(list)
        for node, walk, *_ in d:
            for c, p in self.stop_routes[node]:
                dest_by_route[c].append((p, walk))
        direct = {}
        for node, walk, *_ in o:
            for c, po in self.stop_routes[node]:
                cs = [(pd_, wd) for pd_, wd in dest_by_route.get(c, []) if pd_ > po]
                if not cs:
                    continue
                b = self.base[c]
                pd_, wd = min(cs, key=lambda x: self.off[b + x[0]] + x[1])
                est = walk + self.off[b + pd_] - self.off[b + po] + wd
                if c not in direct or est < direct[c][0]:
                    direct[c] = (est, c, po, pd_, walk, wd)
        # one transfer
        upstream = defaultdict(list)
        for c2, lst in dest_by_route.items():
            b2 = self.base[c2]
            for pd_, wd in lst:
                for p in range(pd_):
                    upstream[int(self.node[b2 + p])].append((c2, p, pd_, wd))
        best = {}
        for node, walk, *_ in o:
            for c1, po in self.stop_routes[node]:
                b1 = self.base[c1]
                for p in range(po + 1, self.nstops[c1]):
                    for c2, px2, pd_, wd in upstream.get(int(self.node[b1 + p]), ()):
                        if c2 == c1:
                            continue
                        b2 = self.base[c2]
                        est = walk + self.off[b1 + p] - self.off[b1 + po] + TRANSFER_S + self.off[b2 + pd_] - self.off[b2 + px2] + wd
                        k = (c1, c2)
                        if k not in best or est < best[k][0]:
                            best[k] = (est, c1, po, p, c2, px2, pd_, walk, wd)
        # a transfer that uses a route which already runs origin->destination directly is dominated by that route
        trans = sorted(v for k, v in best.items() if k[0] not in direct and k[1] not in direct)[:TOP_TRANSFERS]
        return list(direct.values()), trans

    def _schedule(self, direct, trans, t, weekend):
        out = []
        for est, c, po, pd_, walk, wd in direct:
            ts = self._next_trip(c, po, t + walk)
            if ts is None:
                continue
            leg = self._leg(c, po, pd_, ts, weekend)
            arrive = ts + self.off[self.base[c] + pd_] + wd
            out.append(dict(legs=[leg], walk_first=walk, walk_last=wd, arrive=arrive))
        for est, c1, po, px, c2, px2, pd_, walk, wd in trans:
            ts1 = self._next_trip(c1, po, t + walk)
            if ts1 is None:
                continue
            at_x = ts1 + self.off[self.base[c1] + px] + TRANSFER_S
            ts2 = self._next_trip(c2, px2, at_x)
            if ts2 is None:
                continue
            legs = [self._leg(c1, po, px, ts1, weekend), self._leg(c2, px2, pd_, ts2, weekend)]
            arrive = ts2 + self.off[self.base[c2] + pd_] + wd
            out.append(dict(legs=legs, walk_first=walk, walk_last=wd, arrive=arrive))
        return out

    def journeys(self, origin: str, dest: str, depart_s: int, weekend: bool = False, prefer: str = "fast", limit: int = 5):
        o, d = self._resolve(origin), self._resolve(dest)
        if {x[0] for x in o} & {x[0] for x in d}:
            raise ValueError("origin and destination are the same place")
        direct, trans = self._candidates(o, d)
        opts = []
        for off in LATER_OFFSETS_S:
            leave = depart_s + off
            for r in self._schedule(direct, trans, leave, weekend):
                total = (r["arrive"] - depart_s) / 60
                if total > MAX_TOTAL_MIN:
                    continue
                cr = self._crowding(r["legs"])
                opts.append({"routes": [l["route"] for l in r["legs"]], "transfers": len(r["legs"]) - 1,
                             "leave_after_min": off // 60, "leave_at": hhmm(leave),
                             "arrive_at": hhmm(r["arrive"]), "total_minutes": round(total, 1),
                             "trip_minutes": round((r["arrive"] - leave) / 60, 1),
                             "walk_to_first_min": round(r["walk_first"] / 60, 1), "walk_from_last_min": round(r["walk_last"] / 60, 1),
                             "crowding": cr, "legs": r["legs"]})
        # later departures are only worth showing when they are less crowded than leaving now
        base = {tuple(x["routes"]): x for x in opts if x["leave_after_min"] == 0}
        keep = []
        for x in opts:
            b = base.get(tuple(x["routes"]))
            if x["leave_after_min"] == 0 or b is None or level_rank(x["crowding"]["level"]) < level_rank(b["crowding"]["level"]):
                keep.append(x)
        best_later = {}
        for x in keep:                                  # one variant per route sequence and crowding level
            k = (tuple(x["routes"]), comfort_rank(x["crowding"]))
            if k not in best_later or x["leave_after_min"] < best_later[k]["leave_after_min"]:
                best_later[k] = x
        keep = list(best_later.values())
        if keep:                                         # drop options far slower than the fastest one
            fastest = min(x["total_minutes"] for x in keep)
            keep = [x for x in keep if x["total_minutes"] <= max(1.5 * fastest, fastest + 30)]
        if prefer == "comfort":
            keep.sort(key=lambda x: (comfort_rank(x["crowding"]), x["total_minutes"]))
        else:
            keep.sort(key=lambda x: (x["total_minutes"], comfort_rank(x["crowding"])))
        keep = keep[:limit]
        for x in keep:
            for l in x["legs"]:
                for k in ("_idx", "_known", "_conf"):
                    l.pop(k, None)
        return {"origin": [{"stop_id": s, "name": n, "walk_min": round(w / 60, 1)} for _, w, s, n in o],
                "destination": [{"stop_id": s, "name": n, "walk_min": round(w / 60, 1)} for _, w, s, n in d],
                "options": keep}
