# The Chocolate Experiment: flow

What a team has to carry from where to where in `stats-ab`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/stats-ab.en.md).

```mermaid
flowchart LR
  intro(["Intro · Ana's decision cards"])

  qcmanual[/"🔎 The quality manual"/]
  ananote[/"🔎 A note from Ana"/]
  tastingsheet[/"🔎 The tasting protocol"/]
  agenda[/"🔎 Tomorrow's agenda"/]

  d_scale[("scale.py<br/>weights")]
  d_orders[("orders.py<br/>orders")]
  d_tasting[("tasting.py<br/>ratings")]
  d_checkout[("shop.py<br/>daily")]

  subgraph p1["Open from the start"]
    plan["1 · The planning board<br/>experimental design, α, power, sample size"]
    scale["2 · The packing line scale<br/>t confidence interval, one-sample t-test"]
    orders["3 · Ana's laptop: order values<br/>CLT, standard error, skewness"]
  end

  subgraph p2["Needs an earlier result or code"]
    tasting["4 · The tasting room 🔒<br/>Welch t-test, pre-registered α"]
    checkout["5 · The web shop dashboard 🔒<br/>chi-squared goodness of fit, independence"]
  end

  subgraph p3["Final lock"]
    release{{"6 · The release console<br/>final code 5294"}}
  end

  d_scale --> scale
  d_orders --> orders
  d_tasting --> tasting
  d_checkout --> checkout

  qcmanual -->|"🔎 95 % interval; recalibrate if 100 g lies outside"| scale
  ananote -->|"🔎 reports average n = 50 orders; means spread by σ/√n"| orders
  tastingsheet -->|"🔎 one bar each: independent groups, not paired"| tasting
  agenda -->|"🔎 order: 1 checkout, 2 recipe,<br/>3 packing line, 4 revenue reporting"| release
  intro -.->|"📜 every analysis prints a decision card digit"| release

  plan ==>|"🔒 padlock 77 = tasters per recipe"| tasting
  plan ==>|"📤 α = 0.01, two-sided"| tasting
  plan -.->|"📤 α = 0.01 (decision not checked)"| checkout
  orders ==>|"🔒 PIN 499 = SE €4.99 in cents"| checkout

  checkout ==>|"🔢 card 5"| release
  tasting ==>|"🔢 card 2"| release
  scale ==>|"🔢 card 9"| release
  orders ==>|"🔢 card 4"| release

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class plan,scale,orders station
  class tasting,checkout locked
  class qcmanual,ananote,tastingsheet,agenda clue
  class d_scale,d_orders,d_tasting,d_checkout data
  class release final
  class intro intro
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result, lock code or final digit moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also in the task text, or it only helps to judge a result that isn't checked |

## Phases

- **Start:** 3 stations open at once (planning board, packing line scale, Ana's laptop). Each needs a clue from the wall, so a team of 4–5 has people reading and walking, not waiting.
- **Second wave:** 2 stations. The tasting room opens with the fridge padlock (77, from the planning board) and decides at the plan's α = 0.01. The web shop dashboard opens with the PIN 499 (the standard error €4.99 from Ana's laptop). The packing line has no follow-up, so whoever solves it moves to the console or helps one of the two.
- **Final:** the console needs all four decision card digits and the agenda's order.

## Chains

- Planning board → tasting room → console, and Ana's laptop → dashboard → console: 3 stations each.
- Packing line → console: 2 stations.
- Two equal chains instead of one bottleneck: the planning board and Ana's laptop should both be opened early.

## Hand-offs

- Between stations: 3 hard (padlock code 77 and α = 0.01 two-sided from the plan to the tasting room; PIN 499 from Ana's laptop to the dashboard) and 1 soft (α to the dashboard), plus 4 card digits into the console.
- From clues: 4 clues, all hard: the quality manual (the 95 % level), Ana's note (the sample size 50 and σ/√n), the tasting protocol (independent, not paired) and the agenda.

## Where things are

The factory has four parts: the marble foyer with the exit, the release console and Ana's binder (where the team arrives), the blind-tasting room off the foyer, the long packing hall below, and Ana's office, reached only through the hall.

- Next to its station: the tasting protocol, on an easel at the tasting room's door, 6 tiles from the fridge.
- On the wall right above their stations: Ana's note (2 tiles above Ana's laptop, in the office) and the quality manual (3 tiles above the packing line scale, in the hall).
- Ana's laptop and the dashboard stand 5 tiles apart in the same office, so the PIN is a short hand-off.
- The agenda hangs in Ana's office; the console stands by the exit in the foyer, a walk through the packing hall away.
- The planning board hangs in the office's north-west corner; the tasting room's fridge is reached from the foyer, about 20 tiles of walking through the hall: the hand-off that makes the team walk and talk.

## Findings

Fixed in this round: the quality manual's level, Ana's note's sample size and the tasting protocol's "independent" are no longer in the task texts or starters; the dashboard sits behind a PIN from Ana's laptop instead of a soft `uses: plan`; the plan's reveal now limits α = 0.01 to the two experiments, and a 99 % interval at the packing line gets a message pointing to the manual; a paired t-test in the tasting room gets its own message.

Left on purpose:

- **The dashboard's α is still context only.** Step 3 asks whether the difference is significant at the registered level, but with p = 0.00024 the answer is the same at 0.01 and 0.05, and it isn't checked. Making it matter would mean regenerating the data so p lands between 0.01 and 0.05, which turns the checkout into a second "not significant" story next to the recipe. The tasting room already teaches that lesson.
- **The manual's decision rule is still weak.** The confidence level is now needed, but `recalibrate` comes out True under any sensible rule (p = 0.0017). The manual is hard through the level, which is enough.
- **Student's t-test passes in the tasting room.** With 77 tasters per group it gives the same p as Welch's (0.0252), so "without assuming equal spreads" isn't enforced. The distinction the protocol carries (independent vs. paired) is.
