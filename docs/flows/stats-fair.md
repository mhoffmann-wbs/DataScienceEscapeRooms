# The Rigged Fair: flow

What a team has to carry from where to where in `stats-fair`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/stats-fair.en.md).

```mermaid
flowchart LR
  intro(["Intro · night guard's note"])

  cupnote[/"🔎 Kai's note at the till"/]
  dicesign[/"🔎 The Lucky Seven sign"/]
  handbook[/"🔎 The inspection handbook"/]
  ducksign[/"🔎 The duck pond sign"/]
  filllaw[/"🔎 The fill regulation"/]
  flyer[/"🔎 Bruno's flyer for sponsors"/]
  fairmap[/"🔎 The fair map"/]

  d_lemonade[("lemonade.py<br/>cups")]
  d_dice[("dice.py<br/>games: die1, die2")]
  d_ducks[("ducks.py<br/>stars")]
  d_tickets[("tickets.py<br/>wristbands, vip_survey")]

  subgraph p1["Open from the start"]
    lemonade["1 · The lemonade stand's cup log<br/>mean vs median, outliers, sd"]
    dice["2 · Lucky Seven<br/>classical probability, binom.cdf"]
    ducks["3 · The duck pond<br/>binom pmf/sf, expected value"]
  end

  subgraph p2["Needs an earlier result or code"]
    filler["4 · The filling machine<br/>normal distribution, z, cdf, ppf"]
    tickets["5 · The ticket office 🔒<br/>population vs sample, biased samples"]
  end

  subgraph p3["Final lock"]
    gate{{"6 · The fairground gate<br/>final code 1836"}}
  end

  d_lemonade --> lemonade
  d_dice --> dice
  d_ducks --> ducks
  d_tickets --> tickets

  cupnote -->|"🔎 0 ml = spilled, > 400 ml = typo"| lemonade
  dicesign -.->|"🔎 claim: 2 in 9; 7 or 11 wins"| dice
  handbook -.->|"🔎 suspicious below 1 in 100"| dice
  ducksign -->|"🔎 6 ducks, every 4th starred, 3+ stars win;<br/>€2 a game, teddy costs €5"| ducks
  filllaw -.->|"🔎 at most 2 % below 285 ml"| filler
  flyer -.->|"🔎 the €65 claim, VIP tent survey"| tickets
  fairmap -->|"🔎 stall order: 1 tickets, 2 ducks,<br/>3 Lucky Seven, 4 lemonade"| gate
  intro -.->|"📜 every stall gives a seal digit"| gate

  lemonade ==>|"📤 μ = 296.4 ml, σ = 7.9 ml"| filler
  ducks ==>|"🔒 PIN 1694 = p_win 0.1694"| tickets

  tickets ==>|"🔢 seal 1"| gate
  ducks ==>|"🔢 seal 8"| gate
  dice ==>|"🔢 seal 3"| gate
  filler ==>|"🔢 seal 6 (lemonade stand)"| gate

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class lemonade,dice,ducks,filler station
  class tickets locked
  class cupnote,dicesign,handbook,ducksign,filllaw,flyer,fairmap clue
  class d_lemonade,d_dice,d_ducks,d_tickets data
  class gate final
  class intro intro
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result, lock code or final digit moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also in the task text, or it only helps to judge a result that isn't checked |

## Phases

- **Start:** 3 stations open at once (lemonade, Lucky Seven, duck pond). Enough for a team of 3; a team of 5 pairs up.
- **Second wave:** the filling machine has no data of its own and needs the cup log's μ and σ; the ticket office laptop needs the PIN from the duck pond's reveal. Both open as soon as the first wave's stations are done, so a team that splits well finishes the first wave and the second wave in two parallel lanes.
- **Final:** the gate needs all four seals and the fair map.

## Chains

- Lemonade → filling machine → gate and duck pond → ticket office → gate: 3 stations each, the longest paths.
- Lucky Seven → gate: 2 stations.
- The two long chains don't share a station, so two sub-teams can each take one.

## Hand-offs

- Between stations: 2 (μ/σ, the PIN), plus 4 seal digits into the gate.
- From clues: 7 clues; 3 hard (Kai's note, the duck pond sign, the fair map), 4 soft.

## Where things are

- Next to their station: Kai's note (lemonade), the duck pond sign, the Lucky Seven sign, Bruno's flyer (ticket office).
- On the north wall, away from their stations: the inspection handbook, the fill regulation and the fair map (the map hangs at the opposite end from the gate). The filling machine stands in the south row, the fill regulation on the north wall.

## Findings

- **Three of the four soft clues carry nothing the check needs.** The Lucky Seven task text names "7 or 11", the filling machine's task names 285 ml and 2 %, and the ticket office task already says the VIP survey is the flyer's source. The fill regulation and the flyer could become hard by taking 285 ml / 2 % (or the €65 figure) out of the task text.
- **The handbook's 1-in-100 rule is never checked.** The dice check takes `p_value` but not a verdict. A `rigged = True/False` variable in the check would make the handbook needed.
- **Lucky Seven needs nothing from elsewhere in the room** (all its clues are soft). With several lines of code it still meets the rooms.md rule, but it's the one station a solo player can finish without walking.
- **The lemonade station gives no seal itself;** its seal comes from the filling machine. The fair map calls stall 4 "Lemonade stand", which matches, but teams may look for a seal in the cup log's reveal first. Hint 1 of the gate lists which stations give seals.
