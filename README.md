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

Levels are relative (seats / standing / crowded) and every cell carries `confidence`; see `/meta`.
