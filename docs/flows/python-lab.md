# Quarantine: flow

What a team has to carry from where to where in `python-lab`. Hand-maintained with the `room-flow` skill; update it when the room's puzzles, clues, reveals or locks change. Values and solutions: [the walkthrough](../walkthroughs/python-lab.en.md).

```mermaid
flowchart LR
  intro(["Intro · digits hidden in Ida's equipment"])

  photo[/"🔎 A framed photo"/]
  diploma[/"🔎 A diploma"/]
  manual[/"🔎 Incubator manual"/]
  microscope[/"🔎 The microscope"/]
  poster[/"🔎 Air-quality poster"/]
  whiteboard[/"🔎 The whiteboard"/]
  jars[/"🔎 A shelf of jars"/]

  d_incubator[("incubator.py<br/>temps")]
  d_notebook[("notebook.py<br/>notes, unshift")]
  d_freezer[("catalog.py<br/>catalog")]
  d_ventilation[("ventilation.py<br/>co2")]

  subgraph p1["Open from the start"]
    terminal["1 · Ida's terminal<br/>variables, str, upper, len"]
    incubator["2 · The incubator<br/>lists, for/enumerate, if/elif, None"]
    notebook["3 · The encrypted notebook<br/>string slicing, loops, a function"]
    ventilation["5 · The ventilation control<br/>debugging, int, +="]
  end

  subgraph p2["Needs an earlier result"]
    freezer["4 · The sample freezer 🔒<br/>nested dicts, .items, filtering"]
  end

  subgraph p3["Final lock"]
    exit{{"6 · The exit keypad<br/>final code 6348"}}
  end

  d_incubator --> incubator
  d_notebook --> notebook
  d_freezer --> freezer
  d_ventilation --> ventilation

  photo -->|"🔎 cat = Pixel (2017 is a decoy)"| terminal
  diploma -->|"🔎 doctorate 2019"| terminal
  manual -->|"🔎 safe range 20.0–26.0 °C, limits safe"| incubator
  microscope -->|"🔎 KEY = 7"| notebook
  poster -->|"🔎 HIGH = 1000, MEDIUM = 600"| ventilation
  whiteboard -.->|"🔎 ☀ incubator, 🍄 notebook,<br/>❄ freezer, 🌀 vents"| exit
  intro -.->|"📜 one digit per piece of equipment"| exit

  notebook ==>|"📤 code = sum of spores of the door's samples · ⛓"| freezer

  terminal ==>|"🔢 order ☀ 🍄 ❄ 🌀 · ⛓"| exit
  incubator ==>|"🔢 ☀ 6 · ⛓"| exit
  notebook ==>|"🔢 🍄 3, mushroom digit · ⛓"| exit
  freezer ==>|"🔢 ❄ 4 · ⛓"| exit
  ventilation ==>|"🔢 🌀 8 · ⛓"| exit

  classDef station fill:#8fb8de,stroke:#2b5d8a,color:#10263b
  classDef locked fill:#e0b36a,stroke:#8a5a12,color:#3a2504
  classDef clue fill:#e8e2b0,stroke:#8a7f2b,color:#2e2a0b
  classDef data fill:#b9c4cc,stroke:#55636e,color:#1c2329
  classDef final fill:#9fd4a3,stroke:#2f7a36,color:#0f2e12
  classDef intro fill:#d3c1e3,stroke:#6a4c86,color:#25163a
  class terminal,incubator,notebook,ventilation station
  class freezer locked
  class photo,diploma,manual,microscope,poster,whiteboard,jars clue
  class d_incubator,d_notebook,d_freezer,d_ventilation data
  class exit final
  class intro intro
```

| Arrow | Meaning |
|---|---|
| `==>` thick | A result or final digit moves from one station to another |
| `-->` solid | A clue or data file the station can't be solved without |
| `-.->` dotted | Context only: the value is also elsewhere, or it only helps to read a result |
| `⛓` in a label | The source is also in the target's `requires`: the game keeps the target closed until the source is solved (no lock code; the freezer's 🔒 is this mechanical lock) |

The shelf of jars is flavour only and has no edge.

## Phases

- **Start:** 4 stations open at once (terminal, incubator, notebook, ventilation). Enough for a team of 4; a team of 2–3 takes two each, a team of 5 pairs up on one.
- **Second wave:** the freezer stays closed until the notebook is solved (`requires`), and its padlock rule comes from the notebook's decrypted notes. Only 1 station wide, so most of the team idles or walks to the whiteboard while one sub-team does it.
- **Final:** the keypad waits for all five stations (`requires`) and needs four digits plus the order from the terminal.

## Chains

- Notebook → freezer → exit: 3 stations, the longest path.
- Terminal, incubator, ventilation → exit: 2 stations each.
- The notebook is the bottleneck: it feeds both the freezer and a digit, so a team should start it early.

## Hand-offs

- Between stations: 1 result (the spore-sum rule, notebook → freezer), plus 4 digits and 1 symbol order into the keypad.
- From clues: 7 clues; 5 hard (photo, diploma, manual, microscope, poster), 1 soft (whiteboard), 1 flavour (jars).
- Mechanical: 6 `requires` links (1 into the freezer, 5 into the exit), all of them doubling a knowledge edge.

## Where things are

- Next to their station: the photo (64 px right of the terminal) and the diploma (about 100 px away, same corner).
- Away from their station, so the team has to walk and talk: the incubator manual hangs on the east side next to the freezer (about 320 px from the incubator); the microscope stands in the south middle (about 300 px from the notebook); the air-quality poster is in the west (about 440 px from the ventilation control in the north-east).
- The whiteboard hangs in the north-west by the terminal, about 256 px from the exit keypad.

## Findings

- **The whiteboard is soft.** The terminal's draft already gives the order in symbols (☀ 🍄 ❄ 🌀) and every reveal shows its digit next to its symbol, so the symbol → station key is never needed; only the notebook's "mushroom digit is three" lacks a symbol, and "mushroom" reads as 🍄 on its own. To make it hard, have the draft give the order by station names (or the reveals show only symbols and the draft names stations), so the whiteboard's key is the bridge.
- **The whiteboard says "one digit from each station", but the terminal gives none** (it gives the order). Five stations, four digits: teams may hunt for a terminal digit. Hint 1 of the keypad repeats the same wording.
- **Freezer `requires: ["notebook"]` could become `uses: ["notebook"]`.** The knowledge already travels (the spore-sum rule is nowhere in the freezer's task), so the freezer could open from the start and widen the first wave to 5; the team would explore the catalogue and the smudged label while the notebook is decoded. Alternatively the notes could end in a short code and the freezer get a `lock` with `from: "notebook"`.
- **The exit's five `requires` duplicate its knowledge edges.** The code can't be read without the four digits and the draft's order, so they could all become `uses` (or be dropped); keeping them only guards a 4-digit keypad against guessing.
- **The microscope's KEY = 7 is brute-forceable** (26 values, and the notes read as plain text at the right one), so it is hard for the check but a determined team can skip the walk. Minor at beginner level.
- **The manual is only half needed:** "None means the sensor dropped out" is also in the data file's comment and the task; the safe range and "limits still safe" are the hard part.
- **The shelf of jars is flavour only**, as intended; no station uses it.
