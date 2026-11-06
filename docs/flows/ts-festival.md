# Festival Season: flow

What a team has to carry from where to where in `ts-festival`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/ts-festival.en.md).

```mermaid
flowchart LR
  intro(["Intro · the order system wants a forecast it can trust"])

  itnote[/"🔎 A note from IT"/]
  newspaper[/"🔎 The City Courier"/]
  plannernotebook[/"🔎 The planning notebook"/]
  cheatsheet[/"🔎 The whiteboard"/]
  eventcalendar[/"🔎 The event calendar"/]
  orderform[/"🔎 The stage order form"/]

  d_gate[("scans.py<br/>scans")]
  d_tram[("tram.py<br/>tram, _tram_check<br/>+ prophet module")]
  d_planner[("scans.py<br/>scans, _clean_df")]
  d_mode[("scans.py<br/>scans, _mode_check<br/>+ prophet module")]
  d_events[("scans.py<br/>scans, _events_check<br/>+ prophet module")]
  d_stages[("scans.py<br/>scans, _order_check<br/>+ prophet module")]

  subgraph p1["Open from the start, needs only clues"]
    gate["1 · The gate scanner log<br/>ds/y format, recording errors as gaps"]
    tram["2 · The tram counter<br/>trend changepoints, delta, trend component"]
  end

  subgraph p2["Open from the start, needs the cleaned df"]
    planner["3 · The planner's rule<br/>time split, naive and seasonal naive, MAE"]
    mode["4 · The lighting desk<br/>additive vs multiplicative vs log"]
    events["5 · The events desk<br/>holidays table with windows"]
  end

  subgraph p3["Final lock"]
    stages{{"6 · The stage order<br/>final check: best_baseline 422,<br/>mae_model below it, opening_2026 ≈ 19078"}}
  end

  d_gate --> gate
  d_tram --> tram
  d_planner --> planner
  d_mode --> mode
  d_events --> events
  d_stages --> stages

  itnote -->|"🔎 4–17 Mar 2024 = outage, 9999 = test booking;<br/>leave them empty"| gate
  newspaper -->|"🔎 Line 7 opened 1 April 2023"| tram
  cheatsheet -.->|"🔎 forecast has a trend column"| tram
  plannernotebook -->|"🔎 Marta: same day 364 days back;<br/>train to May 2025, test Jun–Sep"| planner
  cheatsheet -->|"🔎 seasonality_mode=multiplicative,<br/>or fit np.log y and take np.exp"| mode
  cheatsheet -.->|"🔎 components are shares of the trend"| events
  eventcalendar -->|"🔎 opening Fri–Sun: window 0..2;<br/>Lantern Night + eve: -1..0; 2021–2026"| events
  cheatsheet -->|"🔎 make_future_dataframe periods"| stages
  eventcalendar -.->|"🔎 2026 opening Friday 19 June"| stages
  orderform -->|"🔎 sum of Fri 19 – Sun 21 June 2026;<br/>must beat the best simple rule"| stages
  intro -.->|"📜 a forecast the order system trusts"| stages

  gate ==>|"📤 cleaned df: a row per day,<br/>0s and 9999s empty"| planner
  gate ==>|"📤 cleaned df"| mode
  gate ==>|"📤 cleaned df"| events
  gate ==>|"📤 cleaned df"| stages
  mode ==>|"📤 seasonality_mode = multiplicative"| events

  tram ==>|"📤 changepoints = 2023-04-01"| stages
  planner ==>|"📤 best baseline: 422 a day"| stages
  mode ==>|"📤 seasonality_mode = multiplicative"| stages
  events ==>|"📤 the events holidays table"| stages

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class gate,tram,planner,mode,events station
  class itnote,newspaper,plannernotebook,cheatsheet,eventcalendar,orderform clue
  class d_gate,d_tram,d_planner,d_mode,d_events,d_stages data
  class stages final
  class intro intro
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also in the task text or starter code, or the check doesn't need it |

The room has no `requires` and no code locks; every station is open from the start and every link is a `uses` or a clue. "+ prophet module" means the station's starter imports `from prophet import Prophet`, the room module in `content/python/prophet.py` (declared in the manifest's `modules`). The planner, lighting desk, events desk and stage order starters begin with `df = None`: teams copy their `df` from the gate scanner log, and every grader there checks it (1734 rows, 1714 counted days) before anything else.

## Phases

- **Start:** all 6 stations are open, but only the gate scanner log and the tram counter can be solved without another station's result. A team of 2 fits exactly; in a team of 3–5 the others can read the planning notebook, whiteboard and event calendar and start building the planner's forecasts and the `events` table while the gate is being cleaned.
- **Once the gate's `df` is in hand:** the planner's rule and the lighting desk can be finished, and the events desk once the lighting desk names the seasonality mode. With the tram counter still running that is up to 4 stations at once, enough for a team of 4–5.
- **Final:** the stage order needs the cleaned `df`, the changepoint (tram), the best baseline (planner), the seasonality mode (lighting desk) and the `events` table (events desk); its check names what is missing without giving values.

## Chains

- Gate → lighting desk → events desk → stage order: 4 stations, the longest path. Building the `events` table doesn't wait for the lighting desk; only the final fit does.
- Gate → planner's rule → stage order, gate → lighting desk → stage order: 3 stations.
- Tram counter → stage order: 2 stations.

## Hand-offs

- Between stations: 9 hard results. The cleaned `df` from the gate into 4 stations, the seasonality mode into the events desk, and into the stage order the changepoint, the 422 baseline, the mode and the `events` table.
- From clues: 6 clues, all hard for at least one station (IT note → gate, City Courier → tram, planning notebook → planner, whiteboard → lighting desk and stage order, event calendar → events desk, stage order form → stage order). Soft extras: the whiteboard for the tram counter and the events desk, the event calendar for the stage order.

## Where things are

- Next to their station: the City Courier (tram counter), the planning notebook (planner), the stage order form (stage order), and, a few tiles away, the IT note (gate) and the event calendar (events desk).
- Away from its station: the whiteboard hangs on the north wall near the tram counter, while the lighting desk and the stage order that need it stand in the middle and the south-east corner.
- The event calendar also gives the stage order the 2026 dates, from the opposite corner.

## Findings

Fixed (this revision):

- The gate's `requires` are gone. The four later starters no longer contain the gate's cleaning code; they start from `df = None`, list `uses: ["gate"]`, and their graders reject any `df` that isn't the cleaned log. The gate's task, last hint and check now insist on keeping a row for every day (the planner's `shift(364)` needs it), and its reveal says to take the code along.
- The stage order's `requires` on tram, lighting desk and events desk are now `uses`; its rejection texts name the stations to check instead of "multiplicative? the right changepoint?".
- The planner's 422 now travels: the stage order asks for `best_baseline` and checks it, and its rejection text no longer states 422.
- The stage order form is now hard: the task and starter only say "the figure the stage order form asks for"; which days and that they are summed are on the form (the last hint still gives it away).
- The events desk no longer leaks the lighting desk's answer: its task and starter ask for the mode that won at the lighting desk (`uses: ["gate", "mode"]`), and the check's rejection points there instead of naming `multiplicative`.
- The whiteboard is now listed for every Prophet station (tram counter, lighting desk, events desk, stage order); the stage order's starter doesn't mention `make_future_dataframe`, so it needs it.

Left on purpose:

- The stage order can rebuild `events` from the event calendar without the events desk. The windows have to be worked out from the calendar's wording either way, and the events desk is where its check explains them; forcing the hand-off would need a lock or an extra variable for little gain.
- The tram counter needs nothing from other stations, only the City Courier. It is one of the two stations that have to be open from the start.
- The whiteboard's "swings that grow with the level: multiplicative" hints at the lighting desk's winner; that is the clue the lighting desk is built on, and the desk still has to show it on the holdout.
- The gate is a bottleneck: four stations need its `df`. It is the shortest station, the tram counter runs alongside it, and the other stations' preparation (reading clues, writing forecasts and the `events` table) doesn't need it.
