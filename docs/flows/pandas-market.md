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
  d_ledger[("market.py<br/>sales.csv, raw")]
  d_envelopes[("market.py<br/>stalls.csv, handover.csv")]

  subgraph p1["Open from the start"]
    register["1 · The market register<br/>read_csv, filtering rows"]
    pricetags["2 · Price tags<br/>.str cleaning, astype, sum"]
    cardterminal["3 · The card terminal<br/>value_counts, normalising labels"]
    ledger["4 · The cash ledger<br/>filter, groupby sum, idxmax"]
    envelopes["5 · The envelope table<br/>merge, reset_index, groupby"]
  end

  subgraph p3["Final lock"]
    report{{"6 · Greta's report 🔒<br/>final code Tobi"}}
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
  marketrules -->|"🔎 only cash goes into the envelopes"| ledger
  rota -->|"🔎 badge 7 = Tobi Wendt"| report
  intro -.->|"📜 envelopes counted, total is short"| report

  pricetags ==>|"📤 code: price cleaning, revenue"| ledger
  cardterminal ==>|"📤 code: payment and stall_id cleaning"| ledger
  ledger ==>|"📤 code: expected per stall, €1,110"| envelopes
  envelopes ==>|"🔒 lock code 145 = euros missing"| report
  envelopes ==>|"🔢 badge 7 carried every short envelope"| report

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class register,pricetags,cardterminal,ledger,envelopes station
  class marketplan,complaint,priceboard,marketrules,rota clue
  class d_register,d_pricetags,d_cardterminal,d_ledger,d_envelopes data
  class report final
  class intro intro
```

All five data nodes are the same file, `market.py`, which writes the three CSVs; they are drawn per station to show which tables each task reads. The ledger's starter loads `sales.csv` raw, and the envelope table's starter loads only `stalls.csv` and `handover.csv`: the cleaning and `expected` have to come from the stations that wrote them.

| Arrow | Meaning |
|---|---|
| `==>` thick | A result (here: working code), lock code or final word moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also in the task text or the data, or it only helps to judge a result that isn't checked |

No `requires` are left in this room.

## Phases

- **Start:** all five code stations can be opened at once. Three are self-contained (register, price tags, card terminal). The cash ledger and the envelope table can be started (the ledger's `groupby`, the envelope table's `handover` × `stalls` merge) but only finish with code from other stations.
- **Hand-over wave:** price tags + card terminal → ledger → envelope table. Each hand-over is a paste of a teammate's code, not a wait for the game; the person at the next station has already written their own part.
- **Final:** the report's lock opens with the envelope table's 145; the name needs badge 7 and the helper rota.
- Effective parallel width: about 4–5 at the start (3 full stations plus 1–2 preparing), then 2, then 1. Fits a team of 2–5.

## Chains

- Price tags (or card terminal) → cash ledger → envelope table → report: 4 stations, the longest path, now carried by code rather than `requires`.
- Register → nothing: its answer S04 is the red herring (see findings).

## Hand-offs

- Between stations: 5 pieces of knowledge (cleaning code ×2 → ledger, `expected` → envelope table, lock code 145 and badge 7 → report).
- From clues: 6 clue edges from 5 clues; 5 hard (complaint, market plan, market rules → card terminal, market rules → ledger, helper rota), 1 soft (price board).

## Where things are

The map is 22 × 15 tiles.

- Next to their station: the complaint (about 4 tiles from the register) and the price board (about 3.5 tiles from the price tags, and as close to the register).
- On the north wall, away from their stations: the market plan (north-west, about 11 tiles from the register), the market rules (about 8.5 tiles from the card terminal and 9 from the ledger) and the helper rota (north-east, about 11 tiles from the report in the south-east corner).

## Findings

Fixed in the second review (every clue once, no pointers to clues or other stations outside the hints, a clear goal per station):

- **No task or starter names another station any more.** The ledger's task no longer says the cleaning comes from the price tags and the card terminal, and its starter only lists the columns to clean; the envelope table's task and starter no longer mention the cash ledger's code or `expected`. Hint 1 of each now says where that code comes from.
- **No task names its clue.** The register's task no longer mentions the complaint (it says one stall is suspected of short-changing a customer), and its starter comment no longer says "the stall in the complaint". Hint 1 of the register, the price tags and the card terminal now says where the complaint, the market plan, the price board and the market rules are.
- **The cash-only rule lives only in §5 of the market rules.** The intro no longer says "cash envelope", the ledger's task drops "Careful: not every sale goes into an envelope" (its goal, the sales that belong in the envelopes, stays), and the helper rota no longer repeats that each badge collects the cash envelopes. The price tags' task no longer repeats the price board's "written a different way at every stall".
- **Left:** every station already ends in checked values, so no booleans were added; the report's lock note ("Code = the euros missing in total") is the lock's own text, not a pointer.

Fixed (the first review):

- **Fixed: all four `requires` are gone.** The ledger's starter no longer contains the cleaning (`uses` price tags and card terminal), the envelope table's starter no longer computes the expected cash (`uses` the ledger; the Series is now called `expected`), and the report sits behind a code lock whose code (145, the euros missing) is in the envelope table's reveal. The lock replaces both of the report's `requires`, including the one that guarded against guessing a name from the rota.
- **Fixed: the middle is no longer single-file.** Ledger and envelope table are open from the start, so their own parts (filter + `groupby`; the `handover` × `stalls` merge) run beside the first three stations, and only the hand-over of code waits.
- **Fixed: market rules → ledger is hard.** The task no longer says "keep only the cash sales", the variable is no longer `cash_by_stall`, and the card terminal's reveal no longer says that only cash went into the envelopes; §5 of the market rules is the source, and hint 1 points to it.
- **Left: the price board is soft.** It describes spellings that `sales["price"].unique()` shows anyway. Giving it a hidden rule (cents, deposits) would add a conditional cleaning step to the easiest station; it stays as context.
- **Left, deliberately: the register is a red herring.** Its answer S04 feeds nothing; the report's hints and the envelope table's reveal ("Imkerei Sommer's envelope matches to the cent") close the suspicion. It is no longer a mechanical gate on the report.
- **Partly left: the final answer still comes from one station.** The envelope table hands over both the lock code and badge 7, but it can only be solved with the code of the ledger, price tags and card terminal, so four stations now feed the final through real hand-offs.
- **The market rules hang far from the card terminal and the ledger**, its hard uses: good for walk-and-talk, easy to overlook; hints point to it at both stations.
