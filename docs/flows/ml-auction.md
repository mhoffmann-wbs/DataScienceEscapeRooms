# Going Once: flow

What a team has to carry from where to where in `ml-auction`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/ml-auction.en.md).

```mermaid
flowchart LR
  alberssketch[/"🔎 Albers's graph paper"/]
  ilsememo[/"🔎 Ilse Vossberg's memo"/]
  histogram[/"🔎 The histogram on the wall"/]
  houserule[/"🔎 The house rule for valuations"/]
  movementcard[/"🔎 The card in the display case"/]
  newspaper[/"🔎 The evening paper"/]
  insurerletter[/"🔎 The insurer's letter"/]
  workshopnote[/"🔎 The watchmaker's note"/]

  d_all[("sales.py<br/>sales, last_sale, catalogue")]

  subgraph p1["Open from the start"]
    rule["1 · The rule of thumb<br/>simple regression, 2D X"]
    estimates["2 · Last year's estimates<br/>MAE, RMSE, R², mean baseline"]
    tail["3 · The long tail<br/>log target, percent per unit"]
  end

  subgraph p2["Needs an earlier result or code"]
    movement["4 · The movement 🔒<br/>one-hot, omitted-variable bias"]
    forgery["5 · The suspicious lot 🔒<br/>log residuals"]
  end

  subgraph p3["Final lock"]
    catalogue{{"6 · The catalogue 🔒<br/>PIN 196414, age², 8 estimates"}}
  end

  d_all -->|"📄 sales: 1,200 lots"| rule
  d_all -->|"📄 last_sale: estimate, hammer"| estimates
  d_all -->|"📄 sales"| tail
  d_all -->|"📄 sales, movement as words"| movement
  d_all -->|"📄 sales, forgery inside"| forgery
  d_all -->|"📄 catalogue: 8 lots, columns reordered"| catalogue

  alberssketch -.->|"🔎 price against grade, one line"| rule
  ilsememo -->|"🔎 baseline = the sale's mean hammer price; no cancelling"| estimates
  histogram -.->|"🔎 long tail; buyers pay a share more"| tail
  houserule -->|"🔎 test_size 0.2, random_state 6"| tail
  movementcard -.->|"🔎 quartz cheap; papers mostly with automatics"| movement
  newspaper -.->|"🔎 price made no sense for its features"| forgery
  insurerletter -.->|"🔎 within 10 %; forgeries excluded"| catalogue
  workshopnote -.->|"🔎 young and antique dearer: a U in age"| catalogue

  rule ==>|"🔒 274 € per grade"| movement
  estimates ==>|"🔒 256 € MAE"| forgery
  tail ==>|"📤 fit on np.log, read np.exp(b) - 1"| movement
  tail ==>|"📤 log residuals are ratios"| forgery
  forgery ==>|"🔒 PIN digits 1–4: lot 1964"| catalogue
  movement ==>|"🔒 PIN digits 5–6: 14 %"| catalogue
  forgery -.->|"📤 drop lot 1964"| catalogue
  movement -.->|"📤 pd.get_dummies, reorder columns"| catalogue

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  class rule,estimates,tail station
  class movement,forgery locked
  class alberssketch,ilsememo,histogram,houserule,movementcard,newspaper,insurerletter,workshopnote clue
  class d_all data
  class catalogue final
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result or lock code moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also in the task text, starter or hints, or it only helps to judge a result that the check verifies anyway |

## Phases

- **Start:** 3 stations open at once (rule of thumb, last year's estimates, long tail), each independent: right for a team of 3, pairs in a team of 5. The rule of thumb is the shortest (one fix in the starter); the long tail the longest (split, two fits, back-transform, a percentage), and it teaches what stations 4 and 5 need.
- **Second wave:** the movement opens with the rule's 274, the suspicious lot with the estimates' 256. Both are far easier for a team that has done the long tail: the movement's grader wants a log percentage, the forgery only stands out in log residuals.
- **Final:** the press's PIN 196414 joins the forged lot and the papers' premium. The catalogue itself then needs age², found from the residual plot.

## Chains

- Rule of thumb → movement → catalogue, estimates → suspicious lot → catalogue, long tail → movement or suspicious lot → catalogue: 3 stations each.

## Hand-offs

- Between stations: 2 lock codes (274, 256), the final's PIN from 2 stations (1964, 14), and 2 hard lessons from the long tail (log target, reading log coefficients and residuals); the lessons into the final are soft, since its starter already has the log target and the dummies.
- From clues: 8 clues, 2 hard (Ilse's memo defines the baseline; the house rule gives the split, which the long tail's grader enforces) and 6 soft.

## Where things are

- The room: a marble foyer with the exit, the handbook and the coffee table in the middle of the north wall; Albers's study to the west, the gallery of display cases under the tall windows to the east; south of them the parquet saleroom (rostrum on its dais, bidders' chairs, telephone bank, lots on easels) and, behind it in the south-east, the workshop and print room.
- Next to their station: Albers's graph paper on the wall above his desk, Ilse's memo on the noticeboard above the ledger table, the histogram on the saleroom wall above the long tail's terminal with the house rule two tiles to the right, the card beside the display case under the window, the insurer's fax beside the press, the watchmaker's note on the case clock next to the watchmaker's bench.
- Away from their station: the evening paper lies on the coffee table in the foyer, across the saleroom from the workshop where the suspicious lot is examined.

## Findings

- **Many soft clues.** Six of eight clues only tell the story or repeat the task: the graph paper (the task names price against grade), the histogram (the task asks for the log), the movement card, the newspaper, the insurer's letter (the grader prints the 10 % and accepts estimates with the forgery kept) and the watchmaker's note (the residual plot shows the U). The movement card and the watchmaker's note carry the room's two ideas (confounding, the U in age) in plain words, so they stay.
- **The long tail has no code to hand on.** Its 16 % opens nothing; it matters only as the lesson stations 4 and 5 build on. A team that splits up badly may reach those two without it, and the hints there point back to it.
- **The final's starter gives a lot away.** It already fits the log target on one-hot features; the station's own work is age², the column order and the back-transform. It sits behind the locks of 4 and 5, so a team only sees it after doing both.
- **The house rule matters at one station only.** Unlike Pier 9's audit rule, only the long tail's grader enforces a split; stations 4–6 fit on all sales.
