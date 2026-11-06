---
name: room-flow
description: Draw a room's flow diagram (docs/flows/<roomId>.md), a Mermaid flowchart of every station, clue, data file and the final lock, with arrows labelled by the knowledge that has to travel between them, plus a short analysis of parallelism, chains and weak clues. Use when asked for a room's flow, dependency graph or prerequisite diagram, or after a room's puzzles, clues, reveals or locks change.
---

# Room flow diagram

Goal: one page per room that shows what a team has to carry from where to where. A reader should see at a glance which stations are open from the start, which knowledge each one needs, and how everything ends up at the final lock.

Argument: a room id (`content/rooms/<roomId>/`). Output: `docs/flows/<roomId>.md`, English only, hand-maintained (unlike the walkthroughs, nothing generates it). The finished example is [docs/flows/stats-fair.md](../../../docs/flows/stats-fair.md); match its layout.

## 1. Gather

Read, for the room:

- `manifest.json`: `intro`, and per puzzle `id`, `title.en`, `practises.en`, `text.en`, `starter`, `data`, `clues`, `uses`, `requires`, `lock` (`from`), `final`, `reveal.en`, `hints`; and every clue's `title.en` and `text.en`. `src/rooms/manifest.ts` is the source of truth for the fields.
- `docs/walkthroughs/<roomId>.en.md`: the same content with the model solutions and concrete values; quickest to read in one go.
- `data/*`: what each data file loads (the names students work with), and which puzzle has no data at all.
- `map.json`: the `clue`, `puzzle` and `door` objects and their x/y, to say where things stand relative to each other.

```bash
node -e '
const m = require("./content/rooms/<roomId>/manifest.json");
for (const p of m.puzzles) console.log(p.id, JSON.stringify({ clues: p.clues, uses: p.uses, requires: p.requires, lock: p.lock?.from, final: p.final, data: p.data }));
const map = require("./content/rooms/<roomId>/map.json");
for (const l of map.layers) for (const o of l.objects ?? []) console.log(o.type, o.name, o.x, o.y);'
```

## 2. Find every edge

The manifest's fields are only a start. Collect each piece of knowledge that a team has to bring to a station, and where it comes from:

| Kind | Source → target | Where you find it |
|---|---|---|
| 🔎 clue | clue → station | `clues`; the clue's text says which value |
| 📄 data | data file → station | `data`; name the variables it loads |
| 📤 result | station → station | `uses`, and reveals whose values another task asks for |
| 🔒 lock code | station → locked station | `lock.from`; the reveal says how to read the code |
| 🔢 final digit | station → final | reveals that hand out digits or words for the final lock |
| ⛓ mechanical | station → station | `requires` (older rooms): no knowledge moves, the game just waits |
| 📜 intro | intro → station | rules or mechanics the intro explains |

Also look for links the fields miss: a reveal that mentions another station, a hint that says "solve X first", a task that only makes sense after another station's story.

Label each edge with the knowledge itself, concretely and short: `0 ml = spilled, > 400 ml = typo`, `μ = 296.4 ml, σ = 7.9 ml`, `PIN 1694 = p_win`, `seal 8`. Spoilers are fine; this is an author document like the walkthroughs.

Then decide for each edge whether it is **hard** or **soft**:

- **hard**: the check or lock cannot pass without it (the value is nowhere in the task text or starter code, and the team can't derive it in that station).
- **soft**: context or interpretation only: the task text already contains the value, or the clue only helps to judge the result, which isn't checked.

Verify this against the task text, starter code and the check, not the manifest's `clues` list. Soft clues are a finding worth reporting (step 4).

## 3. Write the diagram

Use a Mermaid `flowchart LR` (GitHub renders it; in VS Code the preview needs a Mermaid extension). Conventions:

- Nodes: station `["n · Title<br/>practises, short"]`; locked station title ends in 🔒; clue `[/"🔎 Title"/]`; data `[("file.py<br/>variables")]`; final lock `{{"n · Title<br/>final code …"}}`; intro `(["Intro · …"])`. Node ids are the manifest ids (clue ids without dashes); data nodes `d_<puzzleId>`.
- Edges: `==>` a result, lock code or final digit moving between stations; `-->` a hard clue or data file; `-.->` a soft one. Prefix each label with the kind's emoji. Quote labels: `A ==>|"📤 …"| B`.
- Group stations in `subgraph`s by phase: open from the start, open once an earlier result or code is in hand, final. Leave clues and data outside the subgraphs.
- Style with `classDef` for station, locked, clue, data, final and intro, using mid-tone fills with dark text so it reads on light and dark GitHub themes (copy the classDefs from the stats-fair example).

Below the diagram, a legend table of the edge styles.

## 4. Analyse

Short sections, a few bullets each, with numbers:

- **Phases**: which stations a team can start at once, which wait for what, and the parallel width per phase (compare with a team of 2–5).
- **Chains**: the longest paths into the final lock, in stations.
- **Hand-offs**: how many pieces of knowledge move between stations, and between clues and stations.
- **Where things are**: whether each clue stands next to its station or forces the team to walk and talk (from the map coordinates).
- **Findings**: soft clues, clues nobody needs, stations that need nothing from elsewhere, `requires` that could become `uses` or a lock, and anything else that breaks the puzzle design rules in [docs/architecture/rooms.md](../../../docs/architecture/rooms.md). Report them; don't change the room's content unless asked.

## 5. Check

- The diagram has a node for every puzzle, clue and data file in the manifest, and every edge from step 2.
- The Mermaid parses: GitHub's preview or https://mermaid.live. Common breaks are unquoted labels with `(`, `)`, `|` or `#`, and HTML other than `<br/>`.
- Link the page from the overview list in [docs/flows/README.md](../../../docs/flows/README.md).
