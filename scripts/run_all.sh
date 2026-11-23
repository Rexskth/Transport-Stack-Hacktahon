#!/usr/bin/env bash
# One command from raw data to a tested system. Run from the repo root.
# Needs: data/raw/October-Delhi.csv and the GTFS files in data/gtfs/ (see README.md).
set -euo pipefail
cd "$(dirname "$0")/.."

for f in data/raw/October-Delhi.csv data/gtfs/stops.txt data/gtfs/routes.txt data/gtfs/trips.txt data/gtfs/stop_times.txt; do
  [ -f "$f" ] || { echo "Missing $f - see README.md (Data)"; exit 1; }
done
mkdir -p data/processed

echo "[1/4] GTFS tables and stop matching";  python scripts/build_gtfs_tables.py
echo "[2/4] Crowding model";                 python run_pipeline.py
echo "[3/4] Validation report";              python -m crowding.validate
echo "[4/4] Tests";                          python -m pytest -q tests
echo
echo "Done. Start the app with:  uvicorn api.main:app   then open http://localhost:8000/"
