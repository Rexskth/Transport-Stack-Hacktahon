"""Crowding API. Run: uvicorn api.main:app --reload   (docs at /docs)"""
from contextlib import asynccontextmanager
from typing import Literal, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from fastapi.staticfiles import StaticFiles
from crowding import config as C
from crowding.planner import Planner
from .store import Store, CONF_RANK, level_from_index

state: dict = {}


@asynccontextmanager
async def lifespan(app):
    state["store"] = Store()
    state["planner"] = Planner(pd.read_csv("data/processed/route_stops.csv", dtype={"stop_id": str}),
                               pd.read_csv("data/processed/trip_starts.csv"), state["store"].cells)
    yield


app = FastAPI(
    title="Delhi bus crowding API",
    version="0.1",
    description=("Relative crowding estimates for Delhi buses from October 2026 ticket data and static GTFS. "
                 "Levels (seats / standing / crowded) are relative to the rest of the network at the same day type, "
                 "not headcounts. Always read `confidence`: most cells have thin data."),
    lifespan=lifespan,
)
# The React dev server (npm run dev, port 3000) calls this API on port 8000. Read-only API, so GET from anywhere is fine.
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["GET"], allow_headers=["*"])

Hour = Query(..., ge=0, le=23, description="Hour of day, 0-23 (IST)")
Weekend = Query(False, description="True for weekend or holiday-like days")
MinConf = Query("low", description="Minimum confidence to include: low, medium or high")


def store() -> Store:
    return state["store"]


def _clean(df: pd.DataFrame) -> list:
    """DataFrame -> JSON-safe records (NaN -> None, categories -> str)."""
    df = df.astype({c: object for c in df.columns if str(df[c].dtype) == "category"})
    return df.astype(object).where(df.notna(), None).to_dict("records")


def _check_route(route: str):
    if route not in set(store().routes.route):
        raise HTTPException(404, f"unknown route '{route}'")


def _check_conf(c: str) -> int:
    if c not in CONF_RANK:
        raise HTTPException(422, "min_confidence must be low, medium or high")
    return CONF_RANK[c]


@app.get("/health")
def health():
    return {"status": "ok", "cells": len(store().cells), "routes": len(store().routes)}


@app.get("/meta")
def meta():
    """Level definitions, confidence meaning and every assumed number."""
    return {
        "levels": {"names": list(C.LEVEL_NAMES), "bands": list(C.LEVEL_BANDS),
                   "definition": "percentile of riders per bus among all route-stretch-hours of the same day type"},
        "confidence": {"high": f">= {C.CONF_HIGH} tickets behind the cell",
                       "medium": f">= {C.MIN_TICKETS_RAW} tickets (own or pooled with neighbouring hours)",
                       "low": f"route-average fallback, or fewer than {C.MIN_TRIPS_PER_HOUR} scheduled buses per hour"},
        "sources": {"raw": "cell's own tickets", "pooled_hours": "pooled with hour-1 and hour+1",
                    "route_average": "average of the route's stretches at that hour"},
        "assumptions": {"bus_capacity": C.BUS_CAPACITY, "pass_holder_uplift": C.PASS_HOLDER_UPLIFT,
                        "ticket_sample_rate": C.TICKET_SAMPLE_RATE,
                        "min_trips_per_hour": C.MIN_TRIPS_PER_HOUR, "holiday_dates": list(C.HOLIDAY_DATES),
                        "note": "est_load_per_bus and load_factor depend on the unverified sample rate; do not show them as headcounts"},
        "data": "October 2026 e-ticketing sample (about 2.5M tickets) and Delhi static GTFS",
    }


@app.get("/routes")
def routes(q: Optional[str] = Query(None, description="Substring of the route name, case-insensitive"),
           limit: int = Query(50, ge=1, le=500)):
    """Routes with their peak hour and level on weekdays and weekends."""
    r = store().routes
    if q:
        r = r[r.route.str.contains(q, case=False, regex=False)]
    return {"count": len(r), "routes": _clean(r.head(limit))}


@app.get("/routes/{route}/profile")
def profile(route: str, weekend: bool = Weekend):
    """Hour-by-hour crowding for a route, averaged over its stretches."""
    _check_route(route)
    c = store().cells
    c = c[(c.route == route) & (c.is_weekend == weekend)]
    g = c.groupby("hour").agg(index=("index", "mean"), riders_per_bus=("riders_per_bus", "mean"),
                              stretches=("stretch", "nunique"), trips=("trips", "mean"),
                              share_medium_or_high=("conf_rank", lambda s: (s >= 1).mean())).reset_index()
    g["level"] = g["index"].map(level_from_index)
    return {"route": route, "weekend": weekend, "hours": _clean(g)}


@app.get("/crowding")
def crowding(route: str, hour: int = Hour, weekend: bool = Weekend):
    """Crowding on every stretch of a route at a given hour, in route order."""
    _check_route(route)
    s = store().slice(weekend, hour)
    s = s[s.route == route].sort_values("stretch")
    cols = ["stretch", "from_stop", "to_stop", "lat", "lon", "level", "index", "riders_per_bus", "trips",
            "tickets", "source", "confidence", "est_load_per_bus", "load_factor"]
    return {"route": route, "hour": hour, "weekend": weekend, "stretches": _clean(s[cols]),
            "note": "no service or no data for this hour" if s.empty else None,
            "warning": "level and index are relative; est_load_per_bus and load_factor rest on an assumed 3% ticket sample rate, do not show them as headcounts"}


@app.get("/heatmap")
def heatmap(hour: int = Hour, weekend: bool = Weekend, min_confidence: str = MinConf,
            limit: int = Query(20, ge=1, le=200),
            by: Literal["route", "stretch"] = Query("route", description="Rank whole routes or single stretches")):
    """Most overloaded routes (or stretches) at an hour. For operators and planners."""
    k = _check_conf(min_confidence)
    s = store().slice(weekend, hour)
    s = s[s.conf_rank >= k]
    if s.empty:
        return {"hour": hour, "weekend": weekend, "min_confidence": min_confidence, "count": 0, "items": []}
    if by == "stretch":
        top = s.sort_values("riders_per_bus", ascending=False).head(limit)
        cols = ["route", "stretch", "from_stop", "to_stop", "lat", "lon", "level", "index", "riders_per_bus", "trips", "confidence"]
        items = _clean(top[cols])
    else:
        s = s.assign(crowded=(s.level == C.LEVEL_NAMES[2]))
        g = s.groupby("route", observed=True).agg(index=("index", "mean"), riders_per_bus=("riders_per_bus", "mean"),
                                                   crowded_share=("crowded", "mean"), stretches=("stretch", "count"),
                                                   trips=("trips", "mean")).reset_index()
        worst = s.loc[s.groupby("route", observed=True).riders_per_bus.idxmax(), ["route", "from_stop", "to_stop", "riders_per_bus"]]
        worst = worst.rename(columns={"from_stop": "worst_from", "to_stop": "worst_to", "riders_per_bus": "worst_riders_per_bus"})
        g = g.merge(worst.astype({"route": object}), on="route").sort_values("index", ascending=False).head(limit)
        g["level"] = g["index"].map(level_from_index)
        items = _clean(g)
    return {"hour": hour, "weekend": weekend, "min_confidence": min_confidence, "by": by,
            "count": len(items), "items": items}


@app.get("/network/hourly")
def network_hourly(weekend: bool = Weekend, min_confidence: str = Query("medium", description="low, medium or high")):
    """When is the network crowded? Per hour: share of route-stretch cells at each level and the mean index,
    using only cells at or above the confidence level. Levels are relative (percentiles), so the shares show
    how crowding is spread across the day, not absolute loads."""
    k = _check_conf(min_confidence)
    c = store().cells
    c = c[(c.is_weekend == weekend) & (c.conf_rank >= k)]
    g = c.groupby("hour", observed=True)
    out = pd.DataFrame({
        "cells": g.size(),
        "mean_index": g["index"].mean(),
        "seats_share": g["level"].apply(lambda s: (s == C.LEVEL_NAMES[0]).mean()),
        "standing_share": g["level"].apply(lambda s: (s == C.LEVEL_NAMES[1]).mean()),
        "crowded_share": g["level"].apply(lambda s: (s == C.LEVEL_NAMES[2]).mean()),
    }).reindex(range(24)).reset_index().rename(columns={"index": "hour"})
    out["cells"] = out.cells.fillna(0).astype(int)
    return {"weekend": weekend, "min_confidence": min_confidence, "hours": _clean(out)}


@app.get("/stops")
def stops(q: str = Query(..., min_length=2, description="Substring of the stop name"),
          limit: int = Query(20, ge=1, le=100)):
    """Search stops by name (for the journey planner and the map)."""
    s = store().stop_index
    m = s[s.key.str.contains(q.lower(), regex=False)].sort_values("routes", ascending=False).head(limit)
    return {"count": len(m), "stops": _clean(m[["stop_id", "stop_name", "stop_lat", "stop_lon", "routes"]])}


def _hhmm(t: str) -> int:
    try:
        h, m = t.split(":")
        h, m = int(h), int(m)
        assert 0 <= h < 24 and 0 <= m < 60
    except Exception:
        raise HTTPException(422, "depart must be HH:MM, 24-hour")
    return h * 3600 + m * 60


def _json_safe(o):
    if isinstance(o, dict):
        return {k: _json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_json_safe(v) for v in o]
    if isinstance(o, np.generic):
        return o.item()
    return o


@app.get("/journeys")
def journeys(from_: str = Query(..., alias="from", description="Origin: a GTFS stop_id (see /stops) or 'lat,lon'"),
             to: str = Query(..., description="Destination: a GTFS stop_id or 'lat,lon'"),
             depart: str = Query("08:30", description="Departure time HH:MM (IST)"),
             weekend: bool = Weekend,
             prefer: Literal["fast", "comfort"] = Query("fast", description="fast: shortest total time. comfort: least crowded first, then time"),
             limit: int = Query(5, ge=1, le=10)):
    """Bus journeys (direct or one transfer) with scheduled times and a crowding level for each option.

    Travel times come from the GTFS timetable, not live traffic. Options that leave 20 or 40 minutes later
    appear only when they are less crowded than leaving now."""
    try:
        r = state["planner"].journeys(from_, to, _hhmm(depart), weekend, prefer, limit)
    except ValueError as e:
        raise HTTPException(422, str(e))
    r.update({"depart": depart, "weekend": weekend, "prefer": prefer,
              "note": None if r["options"] else "no scheduled bus journey found at this time (service may have ended)",
              "disclaimer": "Times follow the schedule, not live traffic. Crowding is a relative level from October ticket data; check confidence."})
    return _json_safe(r)


# Demo UI (web/index.html). Mounted last so it does not shadow the API routes.
import pathlib
if pathlib.Path("web").exists():
    app.mount("/", StaticFiles(directory="web", html=True), name="web")
