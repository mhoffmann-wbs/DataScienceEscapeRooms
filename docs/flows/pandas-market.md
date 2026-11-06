# Market Day: flow

What a team has to carry from where to where in `pandas-market`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/pandas-market.en.md).

```mermaid
flowchart LR
  intro(["Intro · Greta's locked hall"])

  marketplan[/"🔎 Market plan"/]
  complaint[/"🔎 A complaint"/]
  priceboard[/"🔎 Price board"/]
  marketrules[/"🔎 Market rules"/]
  rota[/"🔎 Helper rota"/]

  d_register[("market.py<br/>stalls.csv")]
  d_pricetags[("market.py<br/>sales.csv")]
  d_cardterminal[("market.py<br/>sales.csv")]
  d_ledger[("market.py<br/>sales.csv")]
  d_envelopes[("market.py<br/>sales.csv, stalls.csv, handover.csv")]

  subgraph p1["Open from the start"]
    register["1 · The market register<br/>read_csv, filtering rows"]
    pricetags["2 · Price tags<br/>.str cleaning, astype, sum"]
    cardterminal["3 · The card terminal<br/>value_counts, normalising labels"]
  end

  subgraph p2["Waits for earlier stations (requires)"]
    ledger["4 · The cash ledger 🔒<br/>filter, groupby sum, idxmax"]
    envelopes["5 · The envelope table 🔒<br/>merge, reset_index, groupby"]
  end

  subgraph p3["Final lock"]
    report{{"6 · Greta's report<br/>final code Tobi"}}
  end

  d_register --> register
  d_pricetags --> pricetags
  d_cardterminal --> cardterminal
  d_ledger --> ledger
  d_envelopes --> envelopes

  complaint -->|"🔎 honey stall right next to the fountain"| register
  marketplan -->|"🔎 fountain between pitch 4 and 5"| register
  priceboard -.->|"🔎 2,50 € = €2.50 = 2,5: point, no € sign"| pricetags
  marketrules -->|"🔎 EC = card payment"| cardterminal
  marketrules -.->|"🔎 only cash goes into envelopes"| ledger
  rota -->|"🔎 badge 7 = Tobi Wendt"| report
  intro -.->|"📜 envelopes counted, total is short"| report

  pricetags --o|"⛓ requires; cleaning is in the starter"| ledger
  cardterminal --o|"⛓ requires; cleaning is in the starter"| ledger
  ledger --o|"⛓ requires; cash_by_stall is in the starter"| envelopes
  register --o|"⛓ requires; suspect S04 is a red herring"| report

  envelopes ==>|"🔢 badge 7 carried every short envelope, €145"| report

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class register,pricetags,cardterminal station
  class ledger,envelopes locked
  class marketplan,complaint,priceboard,marketrules,rota clue
  class d_register,d_pricetags,d_cardterminal,d_ledger,d_envelopes data
  class report final
  class intro intro
```

All five data nodes are the same file, `market.py`, which writes the three CSVs; they are drawn per station to show which tables each task reads.

| Arrow | Meaning |
|---|---|
| `==>` thick | A result, lock code or final word moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also in the task text or the data, or it only helps to judge a result that isn't checked |
| `--o` circle | `requires`: the game waits for the earlier station, but no knowledge moves |

## Phases

- **Start:** 3 stations open at once (register, price tags, card terminal). Fits a team of 3; a team of 5 pairs up.
- **Second wave:** the cash ledger opens once both price tags and the card terminal are solved, then the envelope table once the ledger is solved. Width 1 each: one person types, the rest watch.
- **Final:** the report opens once the register and the envelope table are solved, and needs badge 7 and the helper rota.
- Parallel width per phase: 3, 1, 1, 1.

## Chains

- Price tags (or card terminal) → cash ledger → envelope table → report: 4 stations, the longest path.
- Register → report: 2 stations.
- The long chain is strictly serial after the first wave; only the register runs beside it.

## Hand-offs

- Between stations: 1 piece of knowledge (badge 7, envelope table → report), plus 4 `requires` that move nothing.
- From clues: 6 clue edges from 5 clues; 4 hard (complaint, market plan, market rules → card terminal, helper rota), 2 soft (price board, market rules → ledger).

## Where things are

The map is 22 × 15 tiles.

- Next to their station: the complaint (about 4 tiles from the register) and the price board (about 3.5 tiles from the price tags, and as close to the register).
- On the north wall, away from their stations: the market plan (north-west, about 11 tiles from the register), the market rules (about 8.5 tiles from the card terminal and 9 from the ledger) and the helper rota (north-east, about 11 tiles from the report in the south-east corner).

## Findings

- **All four `requires` are mechanical.** The ledger's starter code already contains the cleaning from price tags and card terminal, and the envelope table's starter already computes `cash_by_stall`, so no result moves along them.
  - Ledger ← price tags, card terminal: could become `uses` by dropping the cleaning lines from the starter (the team brings its own code), or a code lock from their reveals (e.g. the 128 cash sales, or €1,889).
  - Envelope table ← ledger: could become a code lock on the reveal's €1,110 (e.g. PIN 1110), or `uses` by dropping `cash_by_stall` from the starter.
  - Report ← register: the register's answer (S04) is a red herring and not needed for "Tobi"; the `requires` only forces the team to meet the suspicion before the report. Fine as story, but it could go, or become a hint-level link.
  - Report ← envelope table: redundant with the hard badge-7 edge, though it stops guessing the name from the rota alone.
- **The middle of the room is a single-file chain.** After the first wave only one station is open at a time for two phases; a team of 4–5 idles. Turning the ledger's `requires` into `uses` doesn't fix that; a second parallel station in phase 2 would.
- **The price board is soft.** The starter prints `sales["price"].unique()`, which shows every spelling; the board only confirms what the data already says.
- **Market rules → ledger is soft.** The ledger task says "keep only the cash sales"; the clue's §5 only explains why.
- **The final answer depends on one station.** Only the envelope table (badge 7) and the rota feed "Tobi"; price tags, card terminal and ledger contribute only through `requires` and the starter code.
- **The market rules hang far from the card terminal**, its only hard use, which is good for walk-and-talk but the clue is easy to overlook; the card terminal's hint 2 points to it.
