# Implementation Plan: Crowdedness-aware Journey Planner

Transport Stack Hackathon 2026, **Problem 2**. Phase 1 deadline: **24 Nov 2026, 11:59 PM IST**.

## 1. Goal

Turn ~2.56M October 2026 bus tickets into a crowding estimate by route, direction, stretch and hour. Show it next to journey options in a simple planner, and let the user pick faster vs. more comfortable.

Judged on: how well the crowding estimate is grounded in data, and how clearly it is shown. A simple planner with a sound model beats a polished planner with a weak model. **Spend effort on the model and the note, not the UI.**

## 2. What we found in the data (read this first)

| Finding | Consequence |
|---|---|
| 2,559,899 tickets, 1-31 Oct, 2,259 routes, ~7k stop names | Small enough to process in pandas |
| `vehicle_number` blank on **48.5%** of rows; ~2.8 tickets per vehicle/day/route; vehicles change routes in-day (81%) | **Cannot rebuild bus trips from tickets.** Do not try. Estimate per route+direction+stretch+hour instead |
| ~83k tickets/day, far below real Delhi ridership | Tickets are a sample. Output a **relative crowding index**, not a headcount |
| `ticket_type_id` is always 1; `passenger_count` is 1 on 93% of rows | Ignore ticket type. Use passenger_count as weight |
| Stop names inconsistent ("Badarpur Border (T)" vs "Badarpur Border(T)") | Normalise, then fuzzy-match to GTFS |
| Peaks 8-9 AM and 6-7 PM; Sunday lowest; 2 Oct and 18 Oct anomalously low | Use as sanity checks; flag odd days |
| No bus capacity, no pass-holder data | State assumptions explicitly in the note |
| Static GTFS **not in repo** | Requested from Transport Stack. Pipeline has a fallback (inferred stop order) |

## 3. Architecture

```
data/raw/October-Delhi.csv ──► crowding/clean.py ──► crowding/stop_order.py ──► crowding/load_index.py
                                                          ▲                          │
                              GTFS stop_times.txt (when available) ┘                 ▼
                                                                         data/processed/crowding.csv
                                                                                     │
                                                              api/main.py (FastAPI) ◄┘
                                                                     │
                                                              web/ (Leaflet demo + planner)
```

Existing code (done): `clean.py`, `stop_order.py`, `load_index.py`, `run_pipeline.py`. Running `python run_pipeline.py` over the full CSV works and produces `data/processed/crowding.csv` (1.55M stretch-hour cells) and `stop_order.csv`.

## 4. Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
unzip October-Delhi.csv.zip -d data/raw/        # CSV is gitignored
python run_pipeline.py data/raw/October-Delhi.csv
```

Data files and `*.zip`/`*.csv` are gitignored. Share them out-of-band (the zip comes from the Transport Stack download in `data_README`).

## 5. Work packages

Owners: **A** = pipeline/model, **B** = API/UI. Suggested split for two people working in parallel. Estimates are rough.

### WP1: Fix the model (A, ~1.5 h) **highest priority**
1. **Normalise per day type.** `load_index.py` currently averages per date within weekday/weekend groups, which is right, but check that cell comparisons across weekday/weekend use per-day rates, not totals. Verify with a unit check: mean daily riders weekday vs weekend.
2. **Bus-size / capacity assumption.** Add `config.py` with `BUS_CAPACITY = 60` (assumed, 12 m bus; 40 for 9 m), `PASS_HOLDER_UPLIFT` (e.g. 1.3, assumed) and level thresholds. Convert riders per hour into riders per bus using scheduled frequency (WP3). Without GTFS, use route-relative percentiles only (current behaviour).
3. **Crowding levels.** Three bands: `seats`, `standing`, `crowded`. Currently percentile-based (<=50%, <=85%, rest). Keep, but compute percentiles within day type.
4. **Confidence.** Keep `high/medium/low` by ticket count. For `low` cells, **fall back** to the route's hourly average, then to the route's overall average. Record which fallback was used in a `source` column.
5. **Smoothing.** Merge adjacent hours for low-ticket cells (e.g. 3-hour window) so the index is not noisy.

### WP2: Validation checks (A, ~1 h)
Write `crowding/validate.py` that outputs numbers and charts for the note:
- Hourly profile: morning (8-9) and evening (18-19) peaks present.
- Weekday vs weekend: weekend lower overall; Sunday lowest.
- Busiest corridors: top 10 routes/stretches by index. Do they look plausible (e.g. 717A, 511A, 729 which are the top ticket routes)?
- **Week-to-week stability:** compute the index separately for weeks 1-4 and report rank correlation (Spearman) between weeks. Required by the problem statement.
- Anomalous days: report 2 Oct and 18 Oct, and decide whether to exclude them.
- Where estimates are least reliable (share of low-confidence cells, by hour and by route).

### WP3: GTFS integration (A, ~2 h, **blocked until data arrives**)
Files: `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, `calendar*.txt`, optionally `shapes.txt`.
1. `crowding/gtfs.py` loads the feed.
2. Replace `stop_order.infer_orders` with GTFS stop order per route+direction. Keep the inferred version as a fallback.
3. Fuzzy-match ticket stop names to `stops.txt` (normalised lowercase; `rapidfuzz` or difflib; log match rate).
4. Map ticket `route` (e.g. `717AUP`) to GTFS `route_id` / `route_short_name` + `direction_id`. Confirm the mapping with the organisers (the email asks this).
5. Scheduled trips per route/direction/hour from `trips.txt` + `stop_times.txt` -> riders per bus.

**If GTFS does not arrive in time:** ship with inferred order. State this plainly in the note. The planner then uses stop names without coordinates (see WP5 fallback).

### WP4: API (B, ~1.5 h)
FastAPI app in `api/main.py`, loading `data/processed/crowding.csv` into memory at startup.
- `GET /crowding?route=717AUP&hour=18&weekend=false` -> per-stretch levels, index, confidence.
- `GET /routes` -> list of routes with a headline level per hour.
- `GET /heatmap?hour=18&weekend=false` -> overloaded routes ranking (for operators).
- `GET /journeys?from=...&to=...&depart=...&prefer=fast|comfort` -> options with travel time + crowding (WP5).
- Auto docs at `/docs`. Add a short section to the README listing the endpoints with an example response.

### WP5: Journey planner (B, ~2.5 h)
Keep it simple and honest.
- **With GTFS:** build a graph from stop_times; find direct routes and 1-transfer routes between two stops; travel time = scheduled stop_times difference (no live data in this problem); attach the crowding level for the stretches travelled (worst level and the average). Return 2-3 options.
- **Without GTFS (fallback):** find routes that serve both stops in correct order (from inferred order); estimate time as a placeholder (stops x 2 min, clearly labelled as such); show crowding per option.
- `prefer=comfort` ranks by crowding first, then time; `fast` the reverse. Also offer "leave 20 min later" variants (the problem statement's own example).

### WP6: Demo UI (B, ~1.5 h)
Single static page in `web/` with Leaflet.
- From/To inputs (dropdown of stop names), departure time, weekday/weekend, fast vs comfort toggle.
- Result cards: route, time, crowding badge (green seats / amber standing / red crowded) and a confidence note. A commuter must understand it in one second.
- Operator view: ranked list or map of most overloaded routes/hours (from `/heatmap`).
- If no coordinates are available (no GTFS), skip the map and show cards + a bar chart of hourly crowding per route.

### WP7: Technical note (both, ~1.5 h)
`NOTE.md`, 1-2 pages. Cover:
1. Method: tickets -> stretches -> riders/day -> relative index -> levels.
2. Assumptions: capacity, pass-holder uplift, tickets are a sample, boarding/alighting stops may differ from the stated destination.
3. Why we do not reconstruct trips (data evidence from section 2).
4. Fallbacks for low data and how confidence is shown.
5. Where estimates are least reliable (WP2 numbers).
6. Validation results (WP2).

### WP8: Packaging (both, ~0.5 h)
README with run instructions (setup, pipeline, API, UI), `requirements.txt` pinned, a one-command `make run` or script. Someone else must be able to rerun it from the raw CSV.

## 6. Timeline for 24 Nov (deadline 11:59 PM IST)

Work in this order. Cut from the bottom if time runs short.

| Order | Item | Notes |
|---|---|---|
| 1 | WP1 model fixes + WP4 basic `/crowding` API | Core of the submission |
| 2 | WP2 validation | Gives the evidence judges want |
| 3 | WP6 minimal UI + WP5 fallback planner | Demo |
| 4 | WP7 note, WP8 README | **Do not skip** |
| 5 | WP3 GTFS integration | Only if data has arrived; otherwise submit with fallback |
| Last | Submit on the platform, with 1 h buffer | Check required submission fields (proposal, prototype, repo URL) |

Phase 1 asks for a **proposal, a working prototype and a code repo URL**. Make sure the repo is public (or accessible to judges) and the README works from a clean clone.

## 7. Risks

| Risk | Mitigation |
|---|---|
| GTFS not available before deadline | Inferred stop order; say so openly; planner fallback |
| Inferred stop order wrong on low-volume routes | Skip routes under 30 tickets; show low confidence |
| Registration closed 20 Nov | Confirm the team is registered and can submit; contact organisers now |
| Over-claiming load numbers | Call the output a relative index; document assumptions |
| UI time sink | Static page, no framework |

## 8. Conventions
- Python 3.11+, pandas; keep each pipeline stage runnable alone via its module.
- Write intermediate outputs to `data/processed/`, never commit data.
- Small commits on feature branches; merge to `main` when it runs.
- Any assumed number (capacity, uplift, thresholds) lives in `crowding/config.py`, not inline.
