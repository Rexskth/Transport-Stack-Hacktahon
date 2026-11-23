# Technical note: crowdedness-aware journey planner

Transport Stack Hackathon 2026, Problem 2. Code, data steps and tests are in this repository; validation numbers are in [reports/validation.md](reports/validation.md).

## 1. What we built

A pipeline that turns the October 2026 bus ticket records (2.56 million tickets) and the static Delhi GTFS feed into a **relative crowding level for every route stretch, day type and hour**, an API that serves it, and a journey planner and map that show it next to each route option.

```
tickets (CSV) ─► clean ─► match stops to GTFS ─► place on route ─► riders per stretch-hour
                                                                          │
GTFS stop order, offsets, schedule ───────────────────────────────────────┤
                                                                          ▼
                              riders per scheduled bus ─► percentile level + confidence
                                                                          │
                                         API (/crowding /heatmap /journeys) ─► web page
```

Levels are `seats`, `standing` and `crowded`. Every estimate carries a `confidence` (high, medium, low) and a `source` (own tickets, pooled neighbouring hours, or route average) so a reader can see how much data is behind it.

## 2. The data, and the finding that shaped the method

- 2,559,899 tickets, 1 to 31 October, about 2,260 routes. 93% carry one passenger. `ticket_type_id` is always 1, so it carries no information.
- `vehicle_number` is **blank on 48.5% of tickets**, and where present there are only about 2.8 tickets per vehicle, day and route. Vehicles also change routes during the day (81% of vehicle-days). **Rebuilding individual bus trips from tickets is therefore not possible**, so we do not try. The problem statement suggests grouping tickets by trip and keeping a running count; the data cannot support that.
- About 83,000 tickets a day is far below real Delhi ridership, so the tickets are a **sample**. We cannot recover absolute headcounts, and we do not claim to.

Instead we estimate **riders per stretch, hour and day type, divided by the buses scheduled to pass**, and rank that against the rest of the network.

## 3. Method

1. **Clean.** Parse times (IST), split routes into UP and DOWN, normalise stop names (case, spacing, brackets). Days that run far below the typical day (2 Oct at 45% of a normal Friday and 20 Oct at 57% of a normal Tuesday) are treated as holiday-like.
2. **Match ticket stops to GTFS.** Ticket `route` equals GTFS `route_short_name` for 98% of tickets. Stops are matched only among the route's own stops: exact name, then one part of a combined GTFS name ("A / B"), then prefix, then fuzzy. 91% of ticket stops are matched (63% exact). Tickets whose stops cannot be matched, or whose start is not before the end on the route, are dropped: **18.7% of tickets** are not used.
3. **Place tickets on the route.** Each ticket adds its passengers to every stretch between its start and end stop. The hour of a stretch is the ticket time plus the scheduled travel time to that stretch (from GTFS offsets), so a stretch reached half an hour after boarding lands in the right hour.
4. **Normalise by service.** Riders per day on a stretch and hour are divided by the scheduled buses passing it in that hour (GTFS trips shifted by the stop offsets), with a floor of 2 buses an hour (see section 6).
5. **Handle thin data.** A cell with at least 20 tickets uses its own. Otherwise it pools hour-1 to hour+1, and otherwise falls back to the route's average at that hour. The `source` column records which.
6. **Level.** The percentile of riders per bus among all route-stretch-hours of the same day type: up to 50% `seats`, up to 85% `standing`, above that `crowded`.
7. **Confidence.** High: own tickets, at least 50. Medium: at least 20 tickets, own or pooled. Low: route-average fallback, or fewer than 2 scheduled buses an hour.

## 4. Assumptions (all in `crowding/config.py`)

| Assumption | Value | Effect |
|---|---|---|
| Typical bus capacity | 60 | Only used in the informational `load_factor` |
| Pass holders and unticketed riders | +30% | Only used in `est_load_per_bus` |
| Share of riders in the ticket sample | 3% | Only used in `est_load_per_bus` |
| Minimum buses per hour in per-bus figures | 2 | Prevents thin services looking extremely crowded |
| Holiday-like days | 2 and 20 Oct | Treated as weekend-like |

**How we deal with the issues the problem statement raises**
- *Pass holders and riders without tickets:* not in the data. Because levels are relative, a uniform missing share does not change them; it matters only for the absolute figures, which depend on the unverified 3% and 30% assumptions and **should not be shown as headcounts**. If pass holders ride different routes or hours than ticket buyers, the ranking is biased, and we cannot measure that.
- *Bus size:* GTFS has no vehicle size and half the tickets have no vehicle number, so levels do not use it. A 9 m bus would be crowded at a lower load than a 12 m bus; we do not capture that.
- *Where riders really get off:* we assume the ticket's destination. Riders who get off earlier or later are counted on the wrong stretches.
- *Few tickets:* handled by pooling, fallback and confidence, as above.

## 5. Planner

Bus only, direct trips and trips with one transfer, on the GTFS schedule (no live data). It includes the walk to and from stops (4.5 km/h, 1.3 detour factor), the wait for the next scheduled trip, ride time from GTFS and a 3 minute transfer buffer. Each option's crowding is looked up per stretch at the hour the bus is actually there. "Faster" ranks by total time. "More comfortable" ranks by crowding level, then time, and a level backed by little data gets no credit. Options leaving 20 or 40 minutes later are shown only when they are less crowded than leaving now. This is rare: in random origin-destination pairs around the morning and evening peaks it appears for roughly 2 to 8% of trips, because levels are relative to the whole day and the peaks last longer than 40 minutes.

Example from the problem statement (Anand Vihar ISBT to Connaught Place, 6 pm on a weekday), see [docs/demo-planner.png](docs/demo-planner.png): the fastest option, route 943 UP, takes 46 minutes and is crowded for 86% of the ride. The next options take about 50 minutes with a change and mostly standing room. Leaving 20 or 40 minutes later did not make any of the top options less crowded, so no later variant is shown.

## 6. Checks against known patterns

| Check | Result |
|---|---|
| Morning and evening peaks | Weekday tickets peak at 9:00 and 18:00; midday is 20% of the peak. Model riders per bus peaks at 9:00 and 19:00 |
| Weekday vs weekend | Weekend-like days are 63% of a weekday; Sunday is lowest (49k vs about 100k on weekdays) |
| Busiest corridors | The 717 family (717A, 717B, 717) is at the top both by ticket volume and by weekday-peak riders per bus, with 717B DOWN around Vasant Kunj at 18:00 the most crowded stretches. Across all routes, though, ticket volume and riders per bus are essentially uncorrelated (Spearman -0.01), because busy routes also run more buses |
| Week-to-week stability | Spearman 0.90 at stretch level and 0.85 at route-hour level across weeks 1 to 4; the same level in 91% of cells. **Optimistic**: covers only well-sampled cells |
| Ride length | Median 10 stops, 90th percentile 25 |

Two problems found by these checks were fixed: low-volume holiday days dragging down weekday averages, and routes with 1 to 2 scheduled buses an hour topping the crowding ranking, which is why the 2-bus floor exists.

## 7. Where estimates are least reliable

- **Most cells rest on thin data.** 19% use their own tickets, 21% pool neighbouring hours and 60% use the route average. Confidence is **high for 7%, medium for 27% and low for 66%** of cells. For the smallest quarter of routes (by tickets), essentially every cell is low confidence; for the largest quarter it is 44%.
- **Late night and early morning** are the weakest hours (98% of cells at midnight are low confidence).
- **Routes with poor stop naming** are under-counted, because 18.7% of tickets cannot be placed.
- **Thin scheduled service** (1 to 2 buses an hour) gives noisy per-bus figures. The top-ranked route D-7701A UP may be genuinely crowded or may be a service the GTFS schedule undercounts.
- **Schedule, not reality.** Frequency assumes every scheduled trip runs the full route on time. Planner times ignore traffic and delays.
- **One month, one season.** There is no festival, monsoon or winter pattern, and stability was only checked across four weeks.
- **We validated the shape of the estimates, not their absolute accuracy**, because there is no ground truth for on-board loads in the data.

## 8. Reproduce

```bash
pip install -r requirements.txt
bash scripts/run_all.sh              # GTFS tables, model, validation, tests (about 3 minutes)
uvicorn api.main:app                 # http://localhost:8000/ (map, planner) and /docs (API)
```
Needs `data/raw/October-Delhi.csv` and the GTFS files in `data/gtfs/`; see [README.md](README.md).
