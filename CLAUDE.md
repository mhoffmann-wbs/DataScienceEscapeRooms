# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Early build. The step-by-step plan, with what is done, is in [docs/PLAN.md](docs/PLAN.md). Mark steps done there as they land, and add new ideas to its "Ideas not yet scheduled" section. Sections below that describe parts not built yet are the target design, so keep this file in sync as they land.

## What this is

A browser-based, gather.town-style virtual escape room for data science students. Players walk around a 2D top-down lobby, see each other, chat, and talk via proximity voice/video. Doors lead to themed escape rooms where teams solve data science puzzles together. The repo ships as a static site on GitHub Pages, with **no backend and no third-party accounts**.

First milestone: lobby skeleton (movement, presence, chat, proximity A/V, team formation) plus two beginner rooms:
- **Python room: "Abandoned research lab".** Fix a scientist's broken scripts (variables, lists, loops, string decoding, dict lookups).
- **SQL room: "Hotel mystery".** Query bookings, guests and key-card logs to find out who entered room 404 (SELECT/WHERE, ORDER BY, GROUP BY, simple JOIN).

Target play time is **about 30 minutes per room** for a beginner team. In practice this means 5–6 puzzles of roughly 4–6 minutes each, ordered from easy to hard, ending in a final lock that combines earlier results. Size new puzzles and datasets to this budget.

## Stack

- Vite + TypeScript + React (UI overlays) around a **Phaser 4** canvas (`import Phaser from 'phaser'`; most Phaser 3 examples still apply) (world rendering)
- Maps authored in the **Tiled** editor (JSON export). The art is a placeholder for now: `scripts/generate-placeholder-art.mjs` writes `content/tilesets/placeholder.png` and `content/sprites/avatars.png`, to be replaced by a CC0 tileset (e.g. Kenney) in plan step 9
- **Trystero** for P2P networking (WebRTC data and media) over public, account-free signaling relays
- **Pyodide** (Python) and **sql.js** (SQLite), both WASM, both run in Web Workers
- CodeMirror 6 for code editing, i18next for DE/EN, Vitest for tests
- Deployed through a GitHub Actions workflow to GitHub Pages

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
node scripts/generate-placeholder-art.mjs   # regenerate placeholder tileset and avatar sheet
# planned, added with the room engine:
# npm run hash-answer -- "<answer>"   # produce the hash to put in a room manifest
# npm run validate-rooms              # schema-check every room manifest
```

## Architecture

### Networking: P2P behind a swappable transport
- All networking goes through a `Transport` interface (`src/net/`). ESLint enforces this: importing `trystero` outside `src/net/` is a lint error. The only implementation for now is Trystero. A self-hosted WebSocket server may be added later as a second adapter, so **game, UI and room code must never import Trystero directly.**
- Channel names are namespaced as `appId / classCode / scope`. Scope is either `lobby` or `room:<roomId>:<teamId>`. The class code (entered on join) keeps cohorts apart. Each team's room instance is its own P2P room, with separate chat, A/V and puzzle state.
- There is no authoritative server. Design shared state so it **converges without a leader**:
  - Puzzle progress is a grow-only set of `solved` events, which are idempotent and merge by union. When a peer joins, peers exchange their full state.
  - The team timer start is the minimum start timestamp any peer reports.
  - Positions are ephemeral, sent last-write-wins at a throttled rate, and interpolated on receivers.
- Expected scale is about 10–30 players per class code and teams of 2–5. A full mesh is acceptable at that size. Do not add an SFU or relay unless scale requirements change.
- Code map, all in `src/net/`:
  - `transport.ts`: the `Transport`/`NetRoom`/`Channel` contract. Received data is typed `unknown` on purpose: peers are untrusted, so parse everything with zod schemas (`protocol.ts`, `teams.ts`, `run.ts`). `onPeerJoin` replays already-connected peers to late subscribers, and the memory transport holds early messages for a channel's first subscriber. Trystero does not hold them, so **create every channel synchronously right after `join`**, which is what the session constructors do.
  - `trysteroTransport.ts` uses the default Nostr strategy. `memoryTransport.ts` is an in-process hub used by tests and planned for solo mode.
  - `Session` (one per scope) bundles a `NetRoom`, `Presence` (who is here and where) and `Chat` (everyone, or only peers within `NEARBY_RADIUS`). `LobbySession` adds `Teams`; `RoomSession` adds `RunSync`. `Session.leave()` is idempotent; `World` also calls it on `pagehide`, so peers see a leave at once instead of after WebRTC's ~10 s timeout.
  - `teams.ts`: team formation in the lobby. This is the one leader-owned piece. Only a team's leader may publish its record; others send `join`/`leave` requests to the leader. When the leader leaves or disconnects, the team is gone. Starting publishes `status: 'started'` with `startedAt`, every member switches to scope `room:<roomId>:<teamId>`, and the team drops out of the lobby list.
  - `run.ts`: a team's shared progress (`startedAt`, `solved`, `hints`) is a CRDT where every field keeps the earliest timestamp per key. `mergeRun` is commutative, associative and idempotent (tested), so peers just exchange full states on join and after local changes. Add new shared run fields in the same "earliest wins" shape, or the merge stops converging. Timestamps come from each peer's clock, so the timer is only as accurate as the clocks agree.
- Presence protocol: a peer appears only after its `hello` (name, avatar, position) arrives. Hellos go out on peer join and on the first known position, and **a peer's first hello is always answered with ours**, so greetings lost to timing heal themselves. Positions are sent at most every 100 ms and only on change; receivers smooth them (`RemoteAvatars`).
- Test multi-peer logic in Vitest with several `Session`s on one `MemoryHub` (see `src/net/session.test.ts`). To try real P2P by hand, open two browser windows that don't share `localStorage` (e.g. one private window), using the same class code. One of Trystero's default relays is dead, so a few `ERR_NAME_NOT_RESOLVED` console errors are expected.

### Proximity voice/video
- Media streams connect only to peers within a radius of the local avatar, and disconnect with hysteresis when peers move away so streams don't flap at the edge. Inside a room instance the whole team is always connected.
- Some networks block P2P without a TURN server. A/V must fail gracefully, and text chat must keep working when it does. TURN config is pluggable but not shipped.

### World and scenes
- Phaser scenes: `Boot` (loads every map and the sprites) → `World`, one generic scene that shows whichever map the registry's `mapKey` names (`lobby` or a roomId). React overlays sit on top of the canvas and talk to Phaser only through the typed event bus in `src/game/events.ts`. They never reach into scene internals. To add a message, add it to the `GameEvents` map.
- The app moves between places: join screen → lobby → room (`src/ui/App.tsx`). `World` (`src/ui/World.tsx`) owns one place: it creates that place's session and a fresh Phaser game, and tears both down on switch. The current run (`dser.run`, `src/player/run.ts`) is saved on every state change, and rejoining with the same class code resumes it.
- Doors, interactive objects (terminals, safes, notes) and spawn points are **Tiled object-layer objects** with custom properties (e.g. `puzzleId`, `doorTo`). The engine reads these properties. It never uses hard-coded coordinates.
- Map conventions, read by `src/game/tiled.ts`:
  - Tile layers are named `floor` and `walls`. A tile blocks movement when its tileset tile has the boolean property `collides`.
  - The object layer is named `objects`. Objects are identified by their class (`type`/`class` in the JSON): `spawn` (a point, which gets a small random offset, or a rectangle players arrive somewhere inside) and `door` (a rectangle with a `doorTo` roomId, or `lobby` for a room's exit).
  - The lobby map is `content/lobby/map.json`, and room maps are `content/rooms/<roomId>/map.json`, discovered by `src/game/maps.ts`. Tests run over every map: the spawn is walkable and not on a door, doors are reachable, the lobby has a door to every room, and every room has an exit.
- Maps and images are bundled through Vite imports (`import url from '…png'`, `import map from '…json'`) rather than `public/`. This keeps them hashed and base-path-safe.
- Keyboard input: the scenes register keys with `enableCapture = false` and ignore movement while an HTML field has focus (`isTypingInUi`). Keep it this way, or chat and form inputs break. Keys: E uses doors and objects; Enter opens chat, Enter again sends and returns to walking, Esc leaves the chat.
- The game and React share one `Session`. The scene reads it from the Phaser registry (`src/game/registry.ts`); components subscribe with `useEmitterValue` (`src/ui/useStore.ts`). Presence's `roster` event fires only on join/leave, so React doesn't re-render at position-update rate.
- Each avatar sprite sheet row is one avatar; its columns are 4 directions × 2 walk frames. `src/game/avatars.ts` owns this layout, and Phaser and the React avatar preview both use it.
- The camera may scroll past the map edges by the height of the React top bar and status bar (`UI_INSET_*` in `LobbyScene`), so the overlays never hide parts of the map.
- `Avatar` (`src/game/entities/`) is the sprite plus name label. The local player adds an arcade body sized to the feet; remote players will reuse the class without physics.
- Team flow: when a player steps on a lobby door, a dialog lets them create or join a team waiting at that door. Entering then switches the player to that team's room instance.

### Rooms are data, not code
- Each room is a folder `content/rooms/<roomId>/` containing:
  - `map.json`: the Tiled export
  - `manifest.json`: metadata, DE/EN story text, puzzles, hints, answer hashes, dataset refs
  - `data/`: CSVs or a `.sqlite` file
- Rooms are discovered with `import.meta.glob`. Adding a room means adding a folder, with no engine changes. Manifests are validated with a zod schema, both at runtime and in tests.
- Puzzle validation types:
  - `answer`: a typed answer, compared against a salted hash. Plaintext answers never go in the bundle.
  - `python-test`: hidden assertions run against the student's function in Pyodide.
  - `sql-result`: the student's query result compared to an expected result hash, either order-insensitive or ordered.

### Code execution
- Pyodide loads **lazily, only when a Python puzzle opens**, because it is about 10 MB. Both runtimes run in Web Workers. A runaway loop is stopped by terminating and respawning the worker; this approach does not rely on SharedArrayBuffer, because GitHub Pages can't send COOP/COEP headers.
- Each player has their own sandbox. Only the *outcome* (solved/not solved) is shared with the team.

### Hints
- Each puzzle has 2–3 tiered hints in its manifest, from a gentle nudge up to near-solution. A hint is revealed for the whole team, and the reveal counts as a shared `hintUsed` event that merges by union, the same way `solved` events do.
- Hint usage is part of the result: the scoreboard shows escape time *and* hints used, and the instructor view shows hints per puzzle per team. This shows instructors which puzzles are too hard.

### Persistence, scoreboard, instructor
- Progress and identity (nickname, avatar, class code) live in `localStorage`, so a page refresh restores the current run. Every storage key starts with `dser.`; the profile is zod-validated on load (`src/player/profile.ts`), and corrupt data counts as missing.
- The lobby scoreboard is gossiped P2P and **not cheat-proof**. The UI should not present it as authoritative.
- Instructor mode is unlocked with an instructor PIN set per class code. It can see teams and their progress, reset a team's room, and broadcast announcements. In a P2P setup this is trust-based, not real security, so state that wherever it matters.

### i18n
- All UI strings and all story/puzzle text exist in both `de` and `en`. In-room text lives in the room manifest; UI strings live in `src/i18n/locales/{en,de}.json`, and a test fails if the two files' keys differ. Do not hard-code user-facing strings in components.

### GitHub Pages specifics
- The repo is `DataScienceEscapeRooms`, so Vite `base` is `/DataScienceEscapeRooms/`. Load assets through `import.meta.env.BASE_URL` and never through absolute `/` paths.
- `.github/workflows/deploy.yml` runs lint, tests and the build, then deploys on every push to `main`. In the repo settings, Pages must be set to "GitHub Actions" as its source.
- There is no server-side routing. Use hash routing, or a single page with in-app state.
