"""All assumed numbers live here. Anything marked ASSUMPTION is not in the data."""

# ASSUMPTION: typical full-size (12 m) DTC bus standing+seated capacity. A 9 m midi bus is ~40.
BUS_CAPACITY = 60
# ASSUMPTION: pass holders and unticketed riders add this fraction on top of ticketed riders.
PASS_HOLDER_UPLIFT = 0.30
# ASSUMPTION (unverified): fraction of all riders that appear in this ticket sample.
# Only used for the informational est_load_per_bus column; levels are relative and do not use it.
TICKET_SAMPLE_RATE = 0.03

# Relative levels: percentile of riders-per-bus among all route-stretch-hours of the same day type.
LEVEL_BANDS = (0.50, 0.85)          # <=50% seats, <=85% standing, above crowded
LEVEL_NAMES = ("seats", "standing", "crowded")

# Low-data handling
MIN_TICKETS_RAW = 20                # use the cell's own tickets at or above this
MIN_TICKETS_POOLED = 20             # else pool hour-1..hour+1; need at least this many
CONF_HIGH = 50

# Days that behave like holidays: weekday ticket volume under 65% of the typical weekday (found in Phase 3,
# see reports/validation.md). 2 Oct is Gandhi Jayanti; 20 Oct is likely Dussehra (not confirmed in the data).
# They are treated as weekend-like so they do not drag down weekday estimates.
HOLIDAY_DATES = ("2026-10-02", "2026-10-20")

# Very thin scheduled service makes riders-per-bus explode (found in Phase 3: the "most crowded" routes ran
# 1-2 scheduled buses an hour, and the GTFS schedule may undercount real buses).
# Per-bus figures use at least this many buses, and cells below it are marked low confidence.
MIN_TRIPS_PER_HOUR = 2
