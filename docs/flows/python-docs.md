# The Silent Archive: flow

What a team has to carry from where to where in `python-docs`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/python-docs.en.md).

This room has one source the others don't: the official Python 3.14 documentation, open in another browser tab. It is drawn as its own node, with an edge to every station that needs a fact from it.

```mermaid
flowchart LR
  intro(["Intro · Margarete's rule:<br/>notes only say where to look"])
  docs(["📚 Python 3.14 docs<br/>docs.python.org/3.14"])
  handbook[/"📖 How to read the Python docs"/]

  cartnote[/"🔎 Note on the returns cart"/]
  boxlabel[/"🔎 Label on an archive box"/]
  feerules[/"🔎 Fee rules"/]
  scriptlist[/"🔎 Margarete's script list"/]
  stampinstructions[/"🔎 Stamp machine instructions"/]
  cataloguecard[/"🔎 Card in the card catalogue"/]

  d_cart[("cart.py<br/>returns")]
  d_boxes[("boxes.py<br/>book_ids")]
  d_fees[("fees.py<br/>ledger")]
  d_stamps[("stamps.py<br/>returned")]

  subgraph p1["Open from the start"]
    cart["1 · Returns cart<br/>a HOWTO: stable sorts"]
    boxes["2 · Packing table<br/>a function from a description"]
    fees["3 · Late-fees ledger<br/>notes under round, decimal"]
    terminal["4 · The old terminal<br/>version notes"]
  end

  subgraph p2["Needs a code"]
    stamps["5 · Date-stamp machine 🔒<br/>the strftime table"]
  end

  subgraph p3["Final lock"]
    door{{"6 · Archive door<br/>final code 8714"}}
  end

  d_cart --> cart
  d_boxes --> boxes
  d_fees --> fees
  d_stamps --> stamps

  handbook -.->|"📖 links to the indexes, HOWTOs, glossary"| docs
  intro -.->|"📜 use the 3.14 docs"| docs

  cartnote -->|"🔎 shelves A→Z, titles Z→A;<br/>sorting HOWTO, stability"| cart
  boxlabel -->|"🔎 7 per box, call-number order;<br/>itertools has a function"| boxes
  feerules -->|"🔎 4.5 cents a day,<br/>half a cent rounds up"| fees
  scriptlist -->|"🔎 removeprefix, dist, pairwise,<br/>fmean, batched"| terminal
  stampinstructions -->|"🔎 ISO year-Wweek-weekday,<br/>2026-W45-3; table on datetime page"| stamps
  cataloguecard -->|"🔎 order: stamps, returns,<br/>fees, packing"| door

  docs -->|"📚 sorts are stable;<br/>secondary key first"| cart
  docs -.->|"📚 itertools.batched"| boxes
  docs -->|"📚 round: ties to even, floats inexact;<br/>Decimal, quantize, ROUND_HALF_UP"| fees
  docs -->|"📚 Added in version 3.9, 3.8,<br/>3.10, 3.8, 3.12"| terminal
  docs -->|"📚 %G, %V, %u; not interchangeable<br/>with %Y, %W"| stamps

  terminal ==>|"🔒 PIN 5318"| stamps

  stamps ==>|"🔢 stamps → 8"| door
  cart ==>|"🔢 returns → 7"| door
  fees ==>|"🔢 fees → 1"| door
  boxes ==>|"🔢 packing → 4"| door

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class cart,boxes,fees,terminal station
  class stamps locked
  class cartnote,boxlabel,feerules,scriptlist,stampinstructions,cataloguecard,handbook clue
  class d_cart,d_boxes,d_fees,d_stamps data
  class door final
  class intro,docs intro
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result, lock code or final digit moves from one station to another |
| `-->` solid | A clue, data file or doc fact the station can't be solved without |
| `-.->` dotted | Context only: helps to find something, or the station can be solved without it |

## Phases

- **Start:** 4 stations open at once (returns cart, packing table, late-fees ledger, old terminal). Enough for a team of 4; a team of 5 pairs up on the ledger, the longest read.
- **Second wave:** the date-stamp machine opens with the terminal's PIN.
- **Final:** the door needs the four digits and the card catalogue's order.

## Chains

- Old terminal → date-stamp machine → door: 3 stations, the longest path. Both are version and table lookups, so one docs-confident player can take the whole chain.
- Every other station → door: 2 stations.

## Hand-offs

- Between stations: 1 (the PIN), plus 4 digits into the door.
- From clues: 6 clues, all hard. The handbook only helps to find pages in the docs.
- From the docs: 5 stations need a doc fact; 4 of them can't pass without it.

## Where things are

- The room has five parts: the reading hall with the sealed door in the middle, the stacks to the west, Margarete's office to the north-east, the packing room with the cellar stairs south of the hall and the circulation desk to the south-east.
- Next to their station: the cart note (on the stacks' north wall, above the cart), the script list (pinned on the office wall beside the terminal), the box label (on a stack of boxes two tiles from the packing table), the stamp instructions (on the wall above the stamp machine, in the circulation room).
- Away from their station: the fee rules hang on the circulation room's east wall, three tiles from the ledger desk, so they're near but not on it. The card catalogue stands in the reading hall by the door, the door's keypad on the north wall beside it.
- The handbook stands on a reading stand in the hall, next to where players arrive; the docs themselves are in another browser tab, so every player reads them on their own screen.

## Findings

- **The packing table doesn't need the docs.** A loop over `sorted(book_ids)` packs the boxes without `itertools.batched`; only the box label is hard. It's also the smallest station (one line with `batched`). Options: ask for a second thing only the `batched` entry says (what happens with `strict=True` on the short last box), or keep it as the gentle start.
- **No station needs another station's result,** only the terminal's PIN. That keeps four lanes open in parallel but means little talk between them, apart from the final digits. A link could be: the fee ledger's titles come off the returns cart, or the stamp tray holds the books from the packing table.
- **The digits are fixed in the reveals,** not derived from the results (as in the other rooms). Fine for the door, but a team could share them across teams.
- **Doc facts are pinned to 3.14.** The version notes never change; the round note, the HOWTO and the format-code table could be reworded in later editions. Re-check when Pyodide's Python moves.
