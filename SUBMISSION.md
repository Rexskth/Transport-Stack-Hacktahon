# Submission pack: Transport Stack Hackathon 2026, Phase 1

Problem 2: crowdedness-aware journey planner. Repository: https://github.com/Rexskth/Transport-Stack-Hacktahon (public).

Phase 1 closes **24 Nov 2026, 11:59 PM IST** according to the Where U Elevate page; submit with a buffer. The page and the hackathon site also said registration closed on 20 Nov, so confirm the team can still submit. The form fields were not visible to us: check them and adapt the text below.

## Proposal (draft, about 250 words)

**Problem.** Journey planners rank bus options by time and changes only, yet how crowded a bus is matters as much to a commuter. Delhi records every ticket, so the data to estimate crowding exists.

**Approach.** We turn the October 2026 tickets (2.56 million) and the Delhi static GTFS feed into a relative crowding level (seats, standing, crowded) for every route stretch, day type and hour. Each ticket is placed on the route's stops and spread over the stretches it covers, timed with the scheduled travel offsets, and divided by the scheduled buses passing. Where tickets are thin we pool neighbouring hours, then fall back to the route average, and every estimate carries a confidence. Half of the tickets have no vehicle number, so we estimate per stretch and hour rather than rebuilding individual bus trips.

**Prototype.** An API (`/crowding`, `/heatmap`, `/journeys`) and a map page. A commuter enters two places and a time, sees bus options (direct or one change) with time and a crowding badge, and chooses faster or more comfortable. An operator view ranks the most overloaded routes and stretches by hour.

**Evidence.** Weekday peaks at 9:00 and 18:00, weekends at 63% of weekdays, and the same crowding level in 91% of cells week to week (optimistic: only well-sampled cells). Two issues found by validation were fixed.

**Honest limits.** Levels are relative, not headcounts. 66% of cells are low confidence. 18.7% of tickets could not be placed on a route. Times follow the schedule, not live traffic.

**Open source.** Code, tests, validation report and technical note are in the repository.

## Checklist

- [ ] Repository is public and `main` has everything (PRs 1 to 6 merged). No data files in git.
- [ ] Clean-clone run verified (see "Verified" below); the team re-runs it once on a second machine, using the data from Transport Stack.
- [ ] Proposal text pasted and adapted to the form's fields and limits.
- [ ] Prototype: the repo link plus the run steps in the README. **No hosted demo exists**; judges must run it locally with the data. If the form wants a live link or video, record a 1 to 2 minute screen capture of the planner (Anand Vihar to Connaught Place at 18:00, then the operator view) or deploy the app.
- [ ] Attach or link: `NOTE.md`, `reports/validation.md`, `docs/demo-planner.png`.
- [ ] Submit at least an hour before the deadline and save the confirmation.

## Things the judges may not be able to do without us

- The ticket CSV and GTFS files are not in the repo (size). The README says where they come from. If the judges need them, provide a download link, since Transport Stack data access may require registration.
