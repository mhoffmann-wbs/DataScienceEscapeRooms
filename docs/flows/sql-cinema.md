# The Last Show: flow

What a team has to carry from where to where in `sql-cinema`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/sql-cinema.en.md).

```mermaid
flowchart LR
  intro(["Intro · two tills, Ben's tally, rota, snack till, clicker"])

  tallynote[/"🔎 Ben's clipboard"/]
  firenotice[/"🔎 The fire marshal's notice"/]
  officenote[/"🔎 A note by the office door"/]
  edithnote[/"🔎 Edith's note on the rota board"/]
  tobiasnote[/"🔎 A note on the snack bar"/]
  newspaper[/"🔎 A newspaper"/]

  d_cinema[("cinema.sql<br/>halls, screenings, tickets, tally,<br/>staff, rota, snack_sales, clicks")]

  subgraph p1["Open from the start"]
    tally["1 · Ben's tally<br/>GROUP BY + HAVING over a join"]
    printer["2 · The ticket printers<br/>gaps: NOT EXISTS, MIN/MAX subqueries"]
    clicker["3 · The fire marshal's clicker<br/>running total SUM() OVER"]
  end

  subgraph p2["Needs an earlier result"]
    rota["4 · The staff rota<br/>MAX(CASE WHEN …) pivot"]
    snacks["5 · The snack till<br/>date(), time(), GROUP BY two columns"]
  end

  subgraph p3["Final lock"]
    office{{"6 · Edith's office 🔒<br/>code 132, final answer Tobias Rehm"}}
  end

  d_cinema -->|"📄 screenings, tally, tickets"| tally
  d_cinema -->|"📄 tickets"| printer
  d_cinema -->|"📄 clicks, halls"| clicker
  d_cinema -->|"📄 rota, staff"| rota
  d_cinema -->|"📄 snack_sales, staff"| snacks
  d_cinema -.->|"📄 all tables, to re-check"| office

  tallynote -->|"🔎 Ben is off by 2 at most"| tally
  firenotice -->|"🔎 limit = the Studio's seats"| clicker
  officenote -->|"🔎 code = most people in the Studio at once"| office
  edithnote -.->|"🔎 rota is a plan; snack till knows who was there"| office
  tobiasnote -.->|"🔎 Tobias: I was at the snack bar"| snacks
  newspaper -.->|"🔎 bank decides Monday"| office
  intro -.->|"📜 two tills, one roll each"| printer

  tally ==>|"📤 6, 7 and 14 Nov, Studio late show"| rota
  tally ==>|"📤 6, 7 and 14 Nov"| snacks

  clicker ==>|"🔒 code 132 = peak in the Studio"| office
  printer ==>|"📤 all gaps on till 2"| office
  rota ==>|"📤 till 2 planned: Lukas, Lukas, Selin;<br/>snack bar planned: Tobias"| office
  snacks ==>|"📤 evening snacks sold by Lukas, Lukas, Selin"| office
  tally -.->|"📤 57 people without a ticket"| printer

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class tally,printer,clicker,rota,snacks station
  class tallynote,firenotice,officenote,edithnote,tobiasnote,newspaper clue
  class d_cinema data
  class office final
  class intro intro
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result or lock code moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also in the task text or the data, or it only helps to judge a result that isn't checked |

All six stations load the same `cinema.sql`, so the room has one data node; the edges name the tables each station needs. The room has no `requires`: the office is behind a code lock, and the rota and the snack till need the dates from Ben's tally (`uses`).

## Phases

- **Start:** 3 stations at once (tally, ticket printers, clicker), each about 4–6 minutes. Enough for a team of 3; in a team of 4–5 the others read the clues and the handbook.
- **Second wave:** the rota and the snack till both need the three dates from the tally, and open together as soon as it is solved, so the room stays 2–3 wide.
- **Final:** the office opens with 132 (clicker + the note by the office door), then needs a name that only printers + rota + snack till give together: till 2 was skimmed, the people planned there sold snacks instead, so the one planned at the snack bar stood at till 2.

## Chains

- Tally → rota → office and tally → snack till → office: 3 stations, the longest paths for the name.
- Ticket printers → office: 2 stations, which till.
- Clicker → office: 2 stations, the lock code.

## Hand-offs

- Between stations: 7 edges, 6 hard (the dates twice, the lock code, till 2, the planned posts, the evening snack sellers) and 1 soft (57 missing tickets, which the printers confirm on their own).
- From clues: 7 clue and intro edges from 6 clues and the intro, 3 of them hard (Ben's margin of 2, the fire limit, the office door code rule).

## Where things are

The room is the cinema's ground floor: the dark Studio with its screen and seats (top left), the art-deco foyer below it with the snack bar, the usher's post at the Studio door and the box office, and the staff room behind the box office (top right) with Edith's office door. Players arrive at the street doors on the right.

- The note by the office door (672, 32) hangs right next to the office (704, 32), but the code comes from the clicker at the Studio door (352, 352), about 480 px away across the foyer.
- Ben's clipboard (224, 320) hangs beside his tally podium (256, 352), and the fire notice (384, 320) beside the clicker (352, 352), both on the Studio's back wall.
- The tally's dates have to travel from the Studio door (256, 352) to the rota computer in the staff room (800, 64), about 610 px, and to the snack bar (96, 384), about 160 px.
- Edith's note on the rota board (736, 32) is about 70 px from the rota computer and next to the office.
- Tobias's note (128, 384) is taped to the end of the snack bar, beside the snack till (96, 384).

## Findings

Fixed in the second review (every clue once, no pointers to clues outside the hints, a clear goal per station):

- **The tally's task no longer points at Ben's clipboard;** the first hint now says where his margin is.
- **The clicker's limit lives only on the fire notice.** The task asks when the Studio was "fuller than the fire department allows" instead of "more people than it has seats", so the notice is now a hard clue (the seat count itself is in `halls`); the first hint says where the limit is. The task and the notice no longer both explain the clicker: the notice keeps the rule, the task the data.
- Nothing the checks compare changed; the starters only show `SELECT * … LIMIT 5`.

Earlier findings:

- **The hard clues stand next to their stations.** The walking comes from the results instead: the tally's dates go across the room to the rota and the snack bar, and the clicker's code across to the office. A playtest should show whether that is enough talking.
- **The ticket printers need no clue:** the task text explains the two rolls. The station still matters, since it is the only one that says the cash went missing at till 2.
- **The trap in the final:** the rota names Lukas Feld and Selin Aydın at till 2, so a team that skips the snack till will likely answer one of them. Tobias's note on the snack bar points at the snack till on purpose: without the evening filter (`time(sold_at) >= '18:15'`) it shows him selling snacks on all three days, which looks like an alibi.
- **The lock can't be taken from Ben's tally:** he let in 134 on the 14th, but two people walked out before the last latecomers came, so the clicker peaks at 132.
- **The tally needs Ben's margin:** without it, `HAVING admitted > COUNT(…)` returns 35 screenings instead of 3.
- **The printers' natural mistake:** without the per-till `MAX`, the last ticket of each roll shows up as a gap (14 rows instead of 12).
- **The newspaper is flavour**, by design.
