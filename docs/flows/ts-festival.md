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
  d_planner[("scans.py<br/>scans")]
  d_mode[("scans.py<br/>scans, _mode_check<br/>+ prophet module")]
  d_events[("scans.py<br/>scans, _events_check<br/>+ prophet module")]
  d_stages[("scans.py<br/>scans, _order_check<br/>+ prophet module")]

  subgraph p1["Open from the start"]
    gate["1 · The gate scanner log<br/>ds/y format, recording errors as gaps"]
    tram["2 · The tram counter<br/>trend changepoints, delta, trend component"]
  end

  subgraph p2["Needs an earlier station (requires)"]
    planner["3 · The planner's rule 🔒<br/>time split, naive and seasonal naive, MAE"]
    mode["4 · The lighting desk 🔒<br/>additive vs multiplicative vs log"]
    events["5 · The events desk 🔒<br/>holidays table with windows"]
  end

  subgraph p3["Final lock"]
    stages{{"6 · The stage order 🔒<br/>final check: mae_model below 422,<br/>opening_2026 ≈ 19078"}}
  end

  d_gate --> gate
  d_tram --> tram
  d_planner --> planner
  d_mode --> mode
  d_events --> events
  d_stages --> stages

  itnote -->|"🔎 4–17 Mar 2024 = outage, 9999 = test booking;<br/>leave them empty"| gate
  newspaper -->|"🔎 Line 7 opened 1 April 2023"| tram
  plannernotebook -->|"🔎 Marta: same day 364 days back;<br/>train to May 2025, test Jun–Sep"| planner
  cheatsheet -->|"🔎 seasonality_mode=multiplicative,<br/>or fit np.log y and take np.exp"| mode
  cheatsheet -.->|"🔎 components are shares of the trend"| events
  eventcalendar -->|"🔎 opening Fri–Sun: window 0..2;<br/>Lantern Night + eve: -1..0; 2021–2026"| events
  eventcalendar -.->|"🔎 2026 opening Friday 19 June"| stages
  orderform -.->|"🔎 sum of 19–21 June 2026;<br/>must beat the best simple rule"| stages
  intro -.->|"📜 a forecast the order system trusts"| stages

  gate --o|"⛓ requires; cleaning is in the starter"| planner
  gate --o|"⛓ requires; cleaning is in the starter"| mode
  gate --o|"⛓ requires; cleaning is in the starter"| events

  tram ==>|"📤 changepoints = 2023-04-01 ⛓"| stages
  mode ==>|"📤 seasonality_mode = multiplicative ⛓"| stages
  events ==>|"📤 the events holidays table ⛓"| stages
  planner -.->|"📤 best baseline 422 a day ⛓"| stages

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class gate,tram station
  class planner,mode,events locked
  class itnote,newspaper,plannernotebook,cheatsheet,eventcalendar,orderform clue
  class d_gate,d_tram,d_planner,d_mode,d_events,d_stages data
  class stages final
  class intro intro
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `--o` ⛓ | A `requires` lock: the station stays closed until the other is solved, but no knowledge moves |
| ⛓ at the end of a label | The target also `requires` the source |
| `-.->` dotted | Context only: the value is also in the task text or starter code, or the check doesn't need it |

🔒 here marks a station behind `requires`; the room has no code locks. "+ prophet module" means the station's starter imports `from prophet import Prophet`, the room module in `content/python/prophet.py` (declared in the manifest's `modules`).

## Phases

- **Start:** 2 stations open (gate scanner log, tram counter). A team of 2 fits exactly; in a team of 3–5 the rest have only clues to read.
- **Second wave:** the planner's rule, the lighting desk and the events desk all open once the gate is solved, and the tram counter may still be running: up to 4 stations at once, enough for a team of 4–5.
- **Final:** the stage order opens when the tram counter, planner, lighting desk and events desk are all solved.

## Chains

- Gate → planner / lighting desk / events desk → stage order: 3 stations, the longest paths (all three run through the gate, so the gate is the bottleneck early on).
- Tram counter → stage order: 2 stations.

## Hand-offs

- Between stations: 3 hard results into the stage order (changepoint, multiplicative mode, events table) and 1 soft one (the 422 baseline). Plus 7 `requires` edges, 3 of which (gate → 3, 4, 5) carry no knowledge at all.
- From clues: 6 clues; 5 hard (IT note, City Courier, planning notebook, whiteboard, event calendar), 1 soft (the stage order form). The whiteboard and the event calendar each have one more soft edge.

## Where things are

- Next to their station: the City Courier (tram counter), the planning notebook (planner), the stage order form (stage order), and, a few tiles away, the IT note (gate) and the event calendar (events desk).
- Away from its station: the whiteboard hangs on the north wall near the tram counter, while the lighting desk that needs it stands in the middle of the room.
- The event calendar also feeds the stage order (2026 dates), which stands at the opposite, south-east corner.

## Findings

- **The gate's `requires` are purely mechanical.** The planner, lighting desk, events desk and stage order starters all contain the gate's cleaning code ("The cleaned gate log from the scanner terminal"), so they hand out station 1's model solution and the lock only delays. Take the cleaning out of those starters and make them `uses: ["gate"]` (teams copy their own `df`), or put them behind a code lock whose code is in the gate's reveal (for example the 1714 counted days).
- **The stage order's `requires` on tram, mode and events could become `uses`:** the task already needs their results (`changepoints=["2023-04-01"]`, multiplicative, the events table), and the order check's messages ("multiplicative? the right changepoint?") tell teams what's missing.
- **The planner's 422 is never needed.** The order check enforces `mae_model < 422` and its rejection text states 422 itself, so the stage order needs nothing from the planner; that `requires` is mechanical too. Asking for the best baseline's error (or its name) in the stage order would turn it into a real `uses`.
- **The stage order form is soft:** the task text and the starter already say "all three days added up" and "forecast until 21 June 2026"; the calendar gives 19 June too.
- **The events desk leaks the lighting desk's answer:** its task and starter already use `seasonality_mode="multiplicative"`, and both open at the same time. The stage order can also rebuild `events` from the calendar without the events desk.
- **The whiteboard is the model's API reference for every Prophet station** but is listed only for the lighting desk; the tram counter's starter carries its own API notes.
- **The tram counter needs nothing from elsewhere** but the newspaper: the automatic `biggest_change` passes within 75 days of the opening, but `growth_before`/`growth_after` need the exact date.
