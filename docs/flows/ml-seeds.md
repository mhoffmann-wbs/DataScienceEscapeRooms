# The Seed Bank: flow

What a team has to carry from where to where in `ml-seeds`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/ml-seeds.en.md).

```mermaid
flowchart LR
  traytags[/"🔎 Tags pinned next to the tray"/]
  curatornote[/"🔎 The curator's whiteboard"/]
  servicesheet[/"🔎 The old sorter's service sheet"/]
  speciescards[/"🔎 The curator's species cards"/]
  inspectorrule[/"🔎 Notice from the plant health inspection"/]
  fieldmap[/"🔎 The cooperative's field map"/]

  d_tray[("tray.py<br/>tray")]
  d_archive[("archive.py<br/>archive, orders")]

  subgraph p1["Open from the start"]
    tray["1 · The test tray<br/>scaling before KMeans"]
    elbow["2 · The curator's terminal<br/>inertia, elbow, silhouette"]
    sorter["3 · The old sorting machine<br/>init, local minima, n_init"]
    foreign["5 · The stereo microscope<br/>distance to the nearest centre"]
  end

  subgraph p2["Needs an earlier result or code"]
    cards["4 · The card index 🔒<br/>inverse_transform, arbitrary labels"]
  end

  subgraph p3["Final lock"]
    sowing{{"6 · The cold store 🔒<br/>fields 5, 6, 0, 2, 3, 1"}}
  end

  d_tray --> tray
  d_archive --> elbow
  d_archive --> sorter
  d_archive --> cards
  d_archive --> foreign
  d_archive -->|"📄 orders: six samples"| sowing

  traytags -.->|"🔎 tagged envelopes per species"| tray
  curatornote -.->|"🔎 trust k when elbow and silhouette agree"| elbow
  servicesheet -->|"🔎 start at envelopes 2, 3, 4, 8, 1, 7; n_init = 1"| sorter
  speciescards -->|"🔎 typical seed per catalogue number 1–6"| cards
  speciescards -->|"🔎 catalogue numbers"| sowing
  inspectorrule -->|"🔎 foreign = distance > 2"| foreign
  inspectorrule -->|"🔎 foreign = distance > 2"| sowing
  fieldmap -->|"🔎 foreign sample → 0, field order"| sowing

  tray -.->|"📤 scale first"| elbow
  tray -.->|"📤 scale first"| sorter
  tray -.->|"📤 scale first"| foreign
  tray ==>|"🔒 427286 = 42 beans, 72 lentils, 86 rye"| cards
  elbow ==>|"📤 k = 6"| cards
  elbow ==>|"📤 k = 6"| foreign
  sorter ==>|"🔒 PIN, first half: 556 = old sorter's biggest drawer"| sowing
  cards ==>|"🔒 PIN, second half: 302 rye envelopes"| sowing
  cards -.->|"📤 cluster → catalogue mapping"| sowing
  foreign -.->|"📤 KMeans labels even a weed"| sowing

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  class tray,elbow,sorter,foreign station
  class cards locked
  class traytags,curatornote,servicesheet,speciescards,inspectorrule,fieldmap clue
  class d_tray,d_archive data
  class sowing final
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result or lock code moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also in the task text, starter or hints, or it only helps to judge a result that the check verifies anyway |

## Phases

- **Start:** 4 stations open at once (tray, terminal, old sorter, microscope). The microscope also needs the number of species, so in practice it starts once the terminal has its k; that leaves 3 truly independent lanes, right for a team of 3, with pairs in a team of 5.
- **Second wave:** the card index opens with the tray's combination and needs k from the terminal; the microscope follows the terminal.
- **Final:** the cold store's PIN joins the old sorter's biggest drawer and the card index's rye count (556302); the final then needs the species cards, the inspection rule and the field map. The card index's mapping and the microscope's distance check are what it repeats on six new samples.

## Chains

- Tray → card index → cold store and terminal → card index → cold store: 3 stations each, the longest paths.
- Old sorter → cold store: 2 stations, through the first half of the PIN.
- Terminal → microscope → cold store: 3 stations, but the last step is soft (the inspection rule itself is on a clue).

## Hand-offs

- Between stations: 2 lock codes (427286, and 556302 from two stations) and 1 hard result (k = 6, into the card index and the microscope), plus 2 soft ones into the final (the mapping, the outlier lesson) and the tray's "scale first".
- From clues: 6 clues, 4 hard (service sheet, species cards, inspection rule, field map; the cards and the rule are each needed twice) and 2 soft (tray tags, whiteboard).

## Where things are

- Next to their station: the tray tags (tray), the service sheet (old sorter), the species cards (card index), the whiteboard (above the terminal).
- Away from their station: the inspection notice hangs on the north wall, while the microscope stands in the middle row; the cold store is at the east end of the north wall, beside the jar shelf, with the field map and the notice to the west of the exit and the species cards by the card index in the south-west. The microscope and the final each need a walk.

## Findings

- **Soft clues.** The tray tags only help a team see that their groups are wrong; the check compares with the true species and doesn't need them. The whiteboard explains the elbow and the silhouette, but the task asks for both anyway. Both are meant as support for an intermediate room's first two stations, so they stay.
- **k is derivable elsewhere.** The terminal's k = 6 is a hard input to the card index and the microscope only because their tasks no longer say "six" (they ask for one cluster per species). The six species cards and the service sheet's "Clusters: 6" still corroborate it, so a team could skip the terminal's reasoning. That's acceptable: the terminal is still solved for the room, and the cards make a good cross-check.
- **The card index is on the final's path through the PIN.** Its mapping is soft (the final can rebuild it from the species cards), so the cold store's PIN takes its second half from the card index's reveal (302 rye); without that, the card index could be skipped. The manifest's `lock.from` names only the old sorter, the card index is in `uses`.
- **No station hands a result to the tray or the old sorter.** Both only need clues and data, which keeps the start wide.
