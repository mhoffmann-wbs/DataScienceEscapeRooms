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
  d_tickets[("tickets.py<br/>wristbands, surveys")]

  subgraph p1["Open from the start"]
    lemonade["1 · The lemonade stand's cup log<br/>mean vs median, outliers, sd"]
    dice["2 · Lucky Seven<br/>classical probability, binom.cdf, verdict"]
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
  dicesign -->|"🔎 a 7 or an 11 wins; claim 2 in 9"| dice
  handbook -->|"🔎 threshold 0.01 = 1 in 100"| dice
  ducksign -->|"🔎 6 ducks, every 4th starred, 3+ stars win;<br/>€2 a game, teddy costs €5"| ducks
  filllaw -->|"🔎 limit 285 ml, allowed share 2 %"| filler
  flyer -->|"🔎 source: VIP tent, Saturday, 40 guests"| tickets
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
- **Second wave:** the filling machine has no data of its own and needs the cup log's μ and σ plus the fill regulation's limit and share; the ticket office laptop needs the PIN from the duck pond's reveal. Both open as soon as the first wave's stations are done, so a team that splits well finishes the first wave and the second wave in two parallel lanes.
- **Final:** the gate needs all four seals and the fair map.

## Chains

- Lemonade → filling machine → gate and duck pond → ticket office → gate: 3 stations each, the longest paths.
- Lucky Seven → gate: 2 stations.
- The two long chains don't share a station, so two sub-teams can each take one.

## Hand-offs

- Between stations: 2 (μ/σ, the PIN), plus 4 seal digits into the gate.
- From clues: 7 clues, all hard. Only the intro's "every stall gives a seal digit" is context (the gate's task repeats it).

## Where things are

- Next to their station: Kai's note (lemonade), the duck pond sign, the Lucky Seven sign, Bruno's flyer (ticket office).
- On the north wall, away from their stations: the inspection handbook, the fill regulation and the fair map (the map hangs at the opposite end from the gate). The filling machine stands in the south row, the fill regulation on the north wall. So Lucky Seven, the filling machine and the gate each need a walk to the north wall.

## Findings

Fixed (the earlier findings):

- **Soft clues made hard.** Lucky Seven's task no longer names the winning sums (the sign does); the filling machine's task and starter no longer name 285 ml or 2 % (new `limit` and `allowed` variables, values only on the fill regulation); the check's error messages no longer leak them either.
- **The flyer is needed.** The laptop now holds four surveys (`surveys` with `place`, `day`, `spent`: VIP tent Saturday and Friday, main entrance, beer garden); only the flyer's small print (VIP tent, Saturday, 40 guests) says which one to average as `flyer_mean`. The check names it when a team picks a wrong survey or averages them all.
- **The handbook's rule is checked.** Lucky Seven now asks for `threshold` (0.01, from the handbook) and the verdict `rigged`.
- **Lucky Seven needs something from elsewhere:** the handbook on the north wall.
- **The cup log's reveal says** its seal comes from the filling machine.

Left as they are:

- **The Lucky Seven sign's "2 in 9" is p_theory.** A team can copy it instead of counting outcomes; the check can't tell. It's the stall's claim the inspection tests, and the count of wins and the p-value still need the winning sums, so it stays.
- **Lucky Seven and the duck pond get nothing from other stations,** only from clues. With two lanes of three stations already chained, a third chain would push the room past 30 minutes.
