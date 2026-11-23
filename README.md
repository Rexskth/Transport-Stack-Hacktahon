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
