"""Crowding API. Run: uvicorn api.main:app --reload   (docs at /docs)"""
from contextlib import asynccontextmanager
from typing import Literal, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query

from crowding import config as C
from .store import Store, CONF_RANK, level_from_index

state: dict = {}


@asynccontextmanager
async def lifespan(app):
    state["store"] = Store()
    yield


app = FastAPI(
    title="Delhi bus crowding API",
    version="0.1",
    description=("Relative crowding estimates for Delhi buses from October 2026 ticket data and static GTFS. "
                 "Levels (seats / standing / crowded) are relative to the rest of the network at the same day type, "
                 "not headcounts. Always read `confidence`: most cells have thin data."),
    lifespan=lifespan,
)
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


@app.get("/stops")
def stops(q: str = Query(..., min_length=2, description="Substring of the stop name"),
          limit: int = Query(20, ge=1, le=100)):
    """Search stops by name (for the journey planner and the map)."""
    s = store().stop_index
    m = s[s.key.str.contains(q.lower(), regex=False)].sort_values("routes", ascending=False).head(limit)
    return {"count": len(m), "stops": _clean(m[["stop_id", "stop_name", "stop_lat", "stop_lon", "routes"]])}
