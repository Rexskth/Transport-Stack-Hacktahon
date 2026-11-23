# Transport-Stack-Hacktahon
Crowdedness-aware journey planner (Problem 2, Transport Stack Hackathon 2026).

- Implementation plan and work split: [PLAN.md](PLAN.md)
- Data notes: [data_README](data_README)

Quick start:
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
unzip October-Delhi.csv.zip -d data/raw/
python scripts/build_gtfs_tables.py        # needs data/gtfs/ (see below)
python run_pipeline.py                       # writes data/processed/crowding.csv.gz
```

GTFS (received by email): put the files or the zip in `data/gtfs/`, then run `python scripts/check_gtfs.py`.

## API (Phase 4)
```bash
pip install -r requirements.txt
uvicorn api.main:app --reload        # interactive docs at http://localhost:8000/docs
pytest -q                            # needs data/processed/ from run_pipeline.py
```
| Endpoint | Purpose |
|---|---|
| `GET /meta` | Level and confidence definitions, all assumed numbers |
| `GET /routes?q=717` | Routes with peak hour and level (weekday and weekend) |
| `GET /routes/{route}/profile?weekend=false` | Hour-by-hour crowding for a route |
| `GET /crowding?route=717AUP&hour=18&weekend=false` | Crowding on every stretch of a route, in route order |
| `GET /heatmap?hour=18&min_confidence=medium&by=route` | Most overloaded routes or stretches (operators) |
| `GET /stops?q=kashmere` | Stop search with coordinates (for the planner and map) |
| `GET /journeys?from=2640&to=7930&depart=08:30&prefer=comfort` | Bus journeys (direct or one transfer) with scheduled times and a crowding level. `from`/`to` are a stop_id or `lat,lon` |

Levels are relative (seats / standing / crowded) and every cell carries `confidence`; see `/meta`.

## Demo UI (Phase 5)
`uvicorn api.main:app` also serves the web page at http://localhost:8000/ (Leaflet map, needs internet for map tiles).
- **Plan a trip:** type a stop name and pick a suggestion, or click the map twice (From, then To). Choose time, day type and Faster / More comfortable.
- **Operators:** most crowded routes or stretches by hour, with a minimum-confidence filter. Click a row to see it on the map.
- Shareable links: `/?from=2640&to=7930&depart=08:30&prefer=comfort` and `/?tab=ops`.

How the planner works (`crowding/planner.py`): bus only, direct or one transfer, scheduled GTFS times (no live traffic), walking at 4.5 km/h with a 1.3 detour factor, next scheduled trip for the wait, 3 min transfer buffer. Crowding is looked up for each stretch at the hour the bus is actually there. `prefer=comfort` ranks by crowding level, then time; levels backed by little data do not get credit. Options leaving 20 or 40 minutes later appear only when they are less crowded.
