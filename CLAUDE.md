# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Early build. The step-by-step plan, with what is done, is in [docs/PLAN.md](docs/PLAN.md). Mark steps done there as they land, and add new ideas to its "Ideas not yet scheduled" section. Keep this file and the docs below in sync with the code.

## What this is

A browser-based, gather.town-style virtual escape room for data science students: a 2D top-down lobby with presence, chat and proximity voice/video, and doors to themed rooms where teams of 2–5 solve data science puzzles. It ships as a static site on GitHub Pages, with **no backend and no third-party accounts**.

Rooms: `python-lab` ("Quarantine"), `sql-hotel` ("The Blue Index"), `pandas-market` ("Market Day"), `ts-nordlys` ("Station Nordlys"), `ts-festival` ("Festival Season", with a Prophet-style model, see [docs/prophet-lite.md](docs/prophet-lite.md)), `stats-fair` ("The Rigged Fair") and `stats-ab` ("The Chocolate Experiment", A/B testing with scipy). A room should take a beginner team about 30 minutes; puzzle design rules are in [docs/architecture/rooms.md](docs/architecture/rooms.md).

## Stack

Vite + TypeScript + React (UI overlays) around a **Phaser 4** canvas (`import Phaser from 'phaser'`; most Phaser 3 examples still apply); maps from the **Tiled** editor; all art drawn by `scripts/generate-art.mjs`; **Trystero** for P2P (WebRTC); **Pyodide** and **sql.js** in Web Workers; CodeMirror 6, i18next (DE/EN), Vitest, zod. Deployed by GitHub Actions to GitHub Pages.

## Commands

```bash
npm install
npm run dev          # Vite dev server
npm run build        # typecheck + production build into dist/
npm run preview      # serve the built dist/ locally
npm run lint
npm run typecheck
npm test             # Vitest, all tests
npx vitest run path/to/file.test.ts   # single test file
npx vitest run -t "test name"         # single test by name
node scripts/generate-art.mjs               # regenerate the tileset and the avatar parts sheet
npm run validate-rooms                # room tests: manifests, map placement, data files, reference solutions
npm run hash-answer -- <roomId>       # re-derive answer hashes from solutions.json (add --write to update the manifest)
npm run walkthrough [-- <roomId>]     # regenerate the instructor walkthroughs in docs/walkthroughs/
npm run instructor-keys               # create the instructor key pair: writes content/instructor.json (commit it); asks for a passphrase
npm run fetch-packages                # download the Pyodide package wheels rooms declare into vendor/pyodide/ (needed for the time series rooms, their tests and builds)
VITE_AUTHOR=1 npm run build           # production build with the author shortcut enabled
```

Author shortcut (dev server, or a `VITE_AUTHOR=1` build): open `#/room/<roomId>` or `#/room/<roomId>?puzzle=<id or 1-based index>` to jump into an offline copy of a room with a puzzle open and locks ignored. Use it to playtest puzzles without forming a team.

## Rules that apply everywhere

- **Networking only through `Transport` (`src/net/`).** Importing `trystero` outside `src/net/` is a lint error. Game, UI and room code never import it.
- **Peers are untrusted.** Received data is `unknown`. Parse it with the zod schemas (`protocol.ts`, `teams.ts`, `run.ts`).
- **Create every channel synchronously right after `join`**, because Trystero does not buffer early messages.
- **Shared state must converge without a leader.** Use earliest-timestamp-per-key maps, highest-counter maps, or last-write-wins registers, as in `run.ts` and `notebook.ts`. Any other shape stops `mergeRun` converging.
- **React and Phaser talk only through the typed event bus** (`src/game/events.ts`). To add a message, add it to `GameEvents`.
- **Maps drive the engine.** Doors, puzzles, clues, spawns and areas are Tiled objects with custom properties; never hard-code coordinates. Tileset tiles are referenced by index: append new tiles, never reorder.
- **Rooms are data.** Adding a room is a folder in `content/rooms/<roomId>/`, with no engine changes. All in-room text comes from manifests. Every room has a handbook (manifest `reference`, map object `reference`) listing the functions and concepts its puzzles need, with links to the official docs; keep it in step with the puzzles. Answers are only ever stored as salted hashes. After any content change, run `hash-answer --write`, `walkthrough` and `validate-rooms`, and update the room's flow in `docs/flows/` if it has one (`room-flow` skill).
- **i18n:** every UI string exists in `src/i18n/locales/{en,de}.json` (a test checks that both have the same keys). Never hard-code user-facing strings.
- **Node-run modules** (`pythonCore.ts`, `sqlCore.ts`, `rooms/answers.ts`, `rooms/manifest.ts`, `rooms/solutions.ts`, `instructorCrypto.ts`) stay free of browser APIs and Vite-only imports, and import each other with explicit `.ts` extensions.
- **GitHub Pages:** `base` is `/DataScienceEscapeRooms/`. Load assets through Vite imports or `import.meta.env.BASE_URL`, never absolute `/` paths. Use hash routing only. `.github/workflows/deploy.yml` runs lint, tests and the build, then deploys on every push to `main` (Pages source must be "GitHub Actions").
- **Keyboard:** scenes register keys with `enableCapture = false` and ignore movement while an HTML field has focus (`isTypingInUi`). Keep it this way, or text inputs break.
- **Storage:** every `localStorage` key starts with `dser.`, and stored data is zod-validated on load.

## Where the details are

Read the relevant file before working in that area:

- [docs/architecture/networking.md](docs/architecture/networking.md): sessions, presence, teams, notebook, code share, run sync and merge rules, proximity, voice/video, multi-peer testing
- [docs/architecture/world.md](docs/architecture/world.md): scenes, the place flow (join → lobby → room, solo, rejoin), map conventions, avatars and looks, doors and team flow, chat and keyboard UI
- [docs/architecture/rooms.md](docs/architecture/rooms.md): the rooms' stories and topics, room folder and manifest format, check types, authoring loop, walkthroughs, Pyodide/sql.js runners, packages, room modules, charts, hints, debrief, puzzle design rules
- [docs/flows/](docs/flows/): per room, a flowchart of what knowledge moves between stations, clues and the final lock, with findings (written by the `room-flow` skill)
- [docs/architecture/persistence.md](docs/architecture/persistence.md): saved runs, scoreboard, instructor mode (keys, signing, announcements, resets, visits, go-to)
