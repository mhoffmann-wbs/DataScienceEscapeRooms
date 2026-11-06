# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Early build. The step-by-step plan, with what is done, is in [docs/PLAN.md](docs/PLAN.md). Mark steps done there as they land, and add new ideas to its "Ideas not yet scheduled" section. Sections below that describe parts not built yet are the target design, so keep this file in sync as they land.

## What this is

A browser-based, gather.town-style virtual escape room for data science students. Players walk around a 2D top-down lobby, see each other, chat, and talk via proximity voice/video. Doors lead to themed escape rooms where teams solve data science puzzles together. The repo ships as a static site on GitHub Pages, with **no backend and no third-party accounts**.

First milestone: lobby skeleton (movement, presence, chat, proximity A/V, team formation) plus two beginner rooms:
- **Python room: "Quarantine" (abandoned research lab).** A mycologist's lab sealed itself; fix her broken scripts (variables, lists, loops, string decoding, dict lookups, debugging) to collect the 4 digits of the override code.
- **SQL room: "The Blue Index" (hotel mystery).** A diamond vanished from room 404 on a storm night; query bookings, key cards, the door log and receipts to name the thief (SELECT/WHERE, ORDER BY, GROUP BY, simple JOIN).

Later rooms: **Time series 1, "Station Nordlys"** (`ts-nordlys`: interpolation, detrending vs differencing, log transform, baselines, AR and SARIMA with statsmodels) and, planned, **Time series 2** with a Prophet-style model (scope in [docs/prophet-lite.md](docs/prophet-lite.md)). Plan step 10 has the design, including which processing step fits which model family.

Target play time is **about 30 minutes per room** for a beginner team. In practice this means 5–6 puzzles of roughly 4–6 minutes each, ordered from easy to hard, ending in a final lock that combines earlier results. Size new puzzles and datasets to this budget. A puzzle that takes one line of code is too small: each station should need several lines, a clue from elsewhere in the room, or both.

Puzzles should combine the room with the code: **clues** (photos, posters, manuals) hold values that the scripts need, and solved stations hand out **reveals** (code digits, decoded messages) that other stations or the final lock need. This makes teams split up and talk. Keep several stations open from the start so a team of 3–5 can work in parallel.

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
npm run validate-rooms                # room tests: manifests, map placement, data files, reference solutions
npm run hash-answer -- <roomId>       # re-derive answer hashes from solutions.json (add --write to update the manifest)
npm run walkthrough [-- <roomId>]     # regenerate the instructor walkthroughs in docs/walkthroughs/
npm run instructor-keys               # create the instructor key pair: writes content/instructor.json (commit it); asks for a passphrase
npm run fetch-packages                # download the Pyodide package wheels rooms declare into vendor/pyodide/ (needed for the time series rooms, their tests and builds)
VITE_AUTHOR=1 npm run build           # production build with the author shortcut enabled
```

Author shortcut (dev server, or a `VITE_AUTHOR=1` build): open `#/room/<roomId>` or `#/room/<roomId>?puzzle=<id or 1-based index>` to jump into an offline copy of a room with a puzzle open and locks ignored. Use it to playtest puzzles without forming a team.

## Architecture

### Networking: P2P behind a swappable transport
- All networking goes through a `Transport` interface (`src/net/`). ESLint enforces this: importing `trystero` outside `src/net/` is a lint error. The only implementation for now is Trystero. A self-hosted WebSocket server may be added later as a second adapter, so **game, UI and room code must never import Trystero directly.**
- Everyone shares one world: rooms are named `world/<scope>` within the app id, where scope is either `lobby` or `room:<roomId>:<teamId>`. Each team's room instance is its own P2P room, with separate chat, A/V, notes and puzzle state. Password-protected teams join their room with `transport.join(scope, { password })`, which Trystero uses to encrypt signaling, so peers without the password can't connect.
- There is no authoritative server. Design shared state so it **converges without a leader**:
  - Puzzle progress and hint reveals are "earliest timestamp per key" maps, which merge without conflicts (see `run.ts` below). When a peer joins, peers exchange their full state.
  - The team timer start is the earliest start timestamp any peer reports.
  - Positions are ephemeral, sent last-write-wins at a throttled rate, and interpolated on receivers.
- Expected scale is about 10–30 players in the shared lobby at once and teams of 2–5. A full mesh is acceptable at that size. Do not add an SFU or relay unless scale requirements change.
- Code map, all in `src/net/`:
  - `transport.ts`: the `Transport`/`NetRoom`/`Channel` contract. Received data is typed `unknown` on purpose: peers are untrusted, so parse everything with zod schemas (`protocol.ts`, `teams.ts`, `run.ts`). `onPeerJoin` replays already-connected peers to late subscribers, and the memory transport holds early messages for a channel's first subscriber. Trystero does not hold them, so **create every channel synchronously right after `join`**, which is what the session constructors do.
  - `trysteroTransport.ts` uses the default Nostr strategy. `memoryTransport.ts` is an in-process hub used by tests and planned for solo mode.
  - `Session` (one per scope) bundles a `NetRoom`, `Presence` (who is here and where) and `Chat` (everyone, or only peers within `NEARBY_RADIUS`). `LobbySession` adds `Teams`; `RoomSession` adds `RunSync`. `Session.leave()` is idempotent; `World` also calls it on `pagehide`, so peers see a leave at once instead of after WebRTC's ~10 s timeout.
  - `teams.ts`: team formation in the lobby. This is the one leader-owned piece. A team is public or password-protected (`locked`): only the leader knows the password, joiners send `passwordHash(teamId, password)`, and a mismatch gets a `rejected` reply. The password reaches members' room sessions through the `started` event and is saved with the run, never in a team record. Only a team's leader may publish its record; others send `join`/`leave` requests to the leader. When the leader leaves or disconnects, the team is gone. Starting publishes `status: 'started'` with `startedAt`, every member switches to scope `room:<roomId>:<teamId>`, and the team drops out of the lobby list.
  - `notebook.ts`: a team's shared notes (`Notebook`, in `RoomSession`). Every field of every note (text, crossed off, deleted, position) is a last-write-wins register (newest timestamp, ties by peer id; a player's own changes are always strictly newer than what they replace). Deletes are tombstones that keep their text, so they sit in a shared trash until restored (`deleted` set back to false) or deleted for good (text blanked; a blank note never shows again, even after a concurrent restore); order is a numeric position halfway between neighbours. Full states are exchanged like the run, and saved with it (`SavedRun.notes`). The UI is `NotesPanel` below the team list (deletes ask for confirmation; folding notes to one line is a per-player view setting); clue cards and reveals have a "Pin to notes" button.
  - `codeShare.ts`: the shared code view (`CodeShare`, in `RoomSession`). Whoever has a puzzle's editor open broadcasts its code (throttled to `CODE_THROTTLE_MS`, `null` on close); teammates on the same puzzle get tabs in the puzzle dialog to watch it read-only (`CodeViewer`) and copy it into their own editor. It is watching, not co-editing: each player's draft stays their own.
  - `runs.ts`: live run summaries in the lobby (`LobbySession.runs`). Every team member in a room publishes its run's summary (room, team, group, members and their peer ids, solved, hints and attempts per puzzle); the newest wins, and a run disappears once no member reports it. Read by the scoreboard and the instructor view; not authoritative.
  - `run.ts`: a team's shared progress (`epoch`, `startedAt`, `solved`, `hints`, `attempts`, `players`). Timestamps keep the earliest value per key (`players`: nickname → first joined, so results can list players who left before the escape), failed-check counters (`<puzzleId>|<peerId>`, only that player increments) keep the highest, and a higher `epoch` (an instructor reset) replaces the whole state. `mergeRun` is commutative, associative and idempotent (tested), so peers just exchange full states on join and after local changes. Add new shared run fields in one of these shapes, or the merge stops converging. Timestamps come from each peer's clock, so the timer is only as accurate as the clocks agree.
- Presence protocol: a peer appears only after its `hello` (name, avatar, position) arrives. Hellos go out on peer join and on the first known position, and **a peer's first hello is always answered with ours**, so greetings lost to timing heal themselves. Positions are sent at most every 100 ms and only on change; receivers smooth them (`RemoteAvatars`).
- Test multi-peer logic in Vitest with several `Session`s on one `MemoryHub` (see `src/net/session.test.ts`). To try real P2P by hand, open two browser windows that don't share `localStorage` (e.g. one private window). Anyone else running the app at the same time shows up too, since the lobby is shared. One of Trystero's default relays is dead, so a few `ERR_NAME_NOT_RESOLVED` console errors are expected.

### Proximity
- One rule decides who is "near" for both nearby chat and A/V: `Proximity` (`src/net/proximity.ts`). Inside a private area (Tiled `area` object) near means the same area, whatever the distance; outside every area it means within `NEARBY_RADIUS` (5 tiles), and peers already near stay near up to `LEAVE_FACTOR` × the radius, so links don't flap at the edge. Sessions get the map's areas from `World`; use `presence.nearby(proximity, wasNear)`.
- The lobby shows a faint, outline-free disc of that radius around the local avatar. Private areas are marked in the map itself (a rug on the floor layer); the area you stand in brightens slightly and the disc hides. Rooms show no ring because the whole team hears each other there.

### Proximity voice/video
- Media goes through the transport too: `NetRoom.sendStream`/`stopStream`/`onPeerStream`. Receivers are never told that a stream stopped (WebRTC doesn't either); each side decides for itself what to play.
- `Media` (`src/net/media.ts`, one per Session) decides whom to stream to: peers that are near (`Proximity`, with hysteresis) in the lobby, the whole team in a room (`mode: 'team'`), and only peers whose A/V state (`av` channel: `on`, `sending`, `mic`, `cam`) says they joined. It re-evaluates every `MEDIA_TICK_MS` while A/V is on, and lists the peers to show and play. A peer that is linked and claims to send, but whose stream hasn't arrived after `CONNECT_TIMEOUT_MS`, is marked `failed`, which the UI explains (likely a network that blocks WebRTC). Test it with stand-in stream objects on a `MemoryHub` (`media.test.ts`).
- `LocalMedia` (`src/av/localMedia.ts`, browser-only) owns microphone and camera: getUserMedia errors become `AvError` codes shown as `av.errors.*`; without a microphone the player joins listen-only; a missing camera falls back to voice. Muting toggles `track.enabled`; turning the camera on or off re-acquires the stream (so the camera light goes off), which Media re-sends. Preferences (`dser.av`: on, cam, device ids) make A/V rejoin automatically when walking between lobby and room.
- `AvDock` (`src/ui/AvDock.tsx`) shows the controls, device picker and tiles bottom right; sound plays through hidden `<audio>` elements, video tiles are always muted. It is not mounted in author mode.
- Some networks block P2P without a TURN server. A/V must fail gracefully, and text chat must keep working when it does. TURN config is pluggable but not shipped. Note that chat also runs over WebRTC data channels, so a network that blocks P2P entirely breaks chat too; only media-specific failures leave chat working.
- To try it by hand, open two windows that don't share `localStorage` and stand next to each other. Headless Chrome with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` gives fake devices for automated checks.

### World and scenes
- Phaser scenes: `Boot` (loads every map and the sprites) → `World`, one generic scene that shows whichever map the registry's `mapKey` names (`lobby` or a roomId). React overlays sit on top of the canvas and talk to Phaser only through the typed event bus in `src/game/events.ts`. They never reach into scene internals. To add a message, add it to the `GameEvents` map.
- The app moves between places: join screen → lobby → room (`src/ui/App.tsx`). `App` owns the transport and the `LobbySession`, which stays connected for as long as the player is in the world, **including while in a room**: presence then marks them `away` (the roomId), so they vanish from the lobby map and from "nearby" but still count for the scoreboard, instructors and rejoining. `World` (`src/ui/World.tsx`) owns one place: a fresh Phaser game, plus the `RoomSession` for rooms; it tears both down on switch. Author mode stays offline (no lobby session). Solo practice (`SavedRun.solo`, "Practice alone" at a door) plays the room on an in-process `MemoryHub` too, but keeps the lobby connection; it hides chat and voice and publishes no run summary. The current run (`dser.run`, `src/player/run.ts`) is saved on every state change (with the room password, if any), and joining again resumes it. Leaving a room before escaping keeps it saved: the room's door then offers Rejoin (merging with the team's current state) or Discard.
- Doors, puzzle objects (terminals, safes, keypads), clues and spawn points are **Tiled object-layer objects** with custom properties (`doorTo`, `puzzleId`, `clueId`). The engine reads these properties. It never uses hard-coded coordinates. The scene treats doors, puzzles and clues alike as interactables: it emits `interact:changed`/`interact:use` on the bus, and React decides what happens. React sends `puzzles:solved` back so the scene can draw ✓ markers; it re-sends on `scene:ready`.
- Map conventions, read by `src/game/tiled.ts`:
  - Tile layers are named `floor` and `walls`. A tile blocks movement when its tileset tile has the boolean property `collides`.
  - The object layer is named `objects`. Objects are identified by their class (`type`/`class` in the JSON): `spawn` (a point, which gets a small random offset, or a rectangle players arrive somewhere inside), `door` (a rectangle with a `doorTo`: in the lobby a room type from `content/lobby/doors.json`, in a room `lobby` for its exit) `puzzle` (a rectangle with a `puzzleId`, covering the object's tile and the tile in front of it, where the player stands), `clue` (shaped the same, with a `clueId`) and `area` (a named rectangle: a private area, see Proximity).
  - The lobby map is `content/lobby/map.json`, and room maps are `content/rooms/<roomId>/map.json`, discovered by `src/game/maps.ts`. Tests run over every map: the spawn is walkable and not on a door, doors are reachable, the lobby has a door to every room, and every room has an exit.
- Maps and images are bundled through Vite imports (`import url from '…png'`, `import map from '…json'`) rather than `public/`. This keeps them hashed and base-path-safe.
- Keyboard input: the scenes register keys with `enableCapture = false` and ignore movement while an HTML field has focus (`isTypingInUi`). Keep it this way, or chat and form inputs break. Keys: E uses doors and objects; Enter opens chat, Enter again sends and returns to walking, Esc leaves the chat.
- The game and React share one `Session`. The scene reads it from the Phaser registry (`src/game/registry.ts`); components subscribe with `useEmitterValue` (`src/ui/useStore.ts`). Presence's `roster` event fires only on join/leave, so React doesn't re-render at position-update rate.
- Each avatar sprite sheet row is one avatar; its columns are 4 directions × 2 walk frames. `src/game/avatars.ts` owns this layout, and Phaser and the React avatar preview both use it.
- The camera may scroll past the map edges by the height of the React top bar and status bar (`UI_INSET_*` in `WorldScene`), so the overlays never hide parts of the map.
- Chat messages also appear as speech bubbles over the sender, if they are on the same map: `ChatBubbles` forwards new ones as `chat:bubble` on the bus, and `Avatar.say` shows them for a few seconds.
- The chat panel can be collapsed to a bar with an unread count; Enter reopens it. Clicking the map blurs any focused field, so walking works again; text fields also leave on Esc (chat, notes) and on Enter after sending.
- `Avatar` (`src/game/entities/`) is the sprite plus name label. The local player adds an arcade body sized to the feet; remote players will reuse the class without physics.
- Lobby doors are **room types**, not rooms: `content/lobby/doors.json` lists each door's id (its `doorTo`), icon, title and planned scenarios (`upcoming`, shown greyed out as "Coming soon"). `WorldScene` draws the icon and title as a sign above each lobby door. Each room's manifest names its door in `category` and its `difficulty` (`beginner`/`advanced`/`expert`); `scenariosAt(doorId)` (`src/rooms/doors.ts`) lists a door's scenarios, playable first, each group easiest first. Tests check that the lobby has exactly one door per type and every room's type has a door.
- Team flow: when a player steps on a lobby door, a dialog lets them pick a scenario (clicking one selects it; its ⓘ button shows its `about`: story, what it practises, tools) and create a team for it (public, or private with a password; optionally tagged with a group such as a class name) or join a team waiting at that door for any of its scenarios (🔒 teams ask for the password). Entering then switches the player to that team's room instance.
- Enter does not open the chat while a modal (`aria-modal`) is open or a code editor has focus.

### Rooms are data, not code
- Each room is a folder `content/rooms/<roomId>/`; the folder name is the roomId. It contains:
  - `map.json`: the Tiled export, with one `puzzle` object per manifest puzzle and one `clue` object per manifest clue.
  - `manifest.json`: title and intro text, its lobby door (`category`), `difficulty` and `about` (tools, what it practises and a one-sentence story, for the scenario picker), the puzzles and the clues. Each puzzle has DE/EN title, text and hints, a `workspace` (`none`/`python`/`sql`), starter code (a string, or DE/EN when its comments need translating), an optional data file, an optional `reveal` (shown to the team once solved), `practises` (what it teaches), `clues` (the clue ids it needs), `requires`, `final`, and a `check`. Each clue has DE/EN title and text and is read-only. Text supports blank-line paragraphs, `` `code` `` and `**bold**`. The format is defined in `src/rooms/manifest.ts`, which is the source of truth.
  - `data/`: `.py` files, run before the student's code, and `.sql` files, which build the database. They load lazily, so a room's data is only downloaded when needed.
  - `solutions.json`: reference solutions, `{ puzzleId: answer | Python code | SQL query }`. An `answer` check worked out in a code workspace takes `{ "answer": …, "code": … }`: the answer is hashed, the code is the model solution in the walkthrough and debrief, and the tooling fails unless running it shows the answer (in its output or result rows). Solutions are public on purpose, like the walkthroughs.
- Data files are shared by both languages, so checks stay language-independent. When students must read text from the data (like encrypted notes), provide both languages in it (e.g. `notes["en"]`, `notes["de"]`) and make the check cover both.
- Rooms are discovered with `import.meta.glob` (`src/rooms/index.ts`). Adding a room means adding a folder, with no engine changes. Room titles and all in-room text come from manifests, never from the locale files.
- Check types (`check.type`); every one compares a salted PBKDF2 hash, so plaintext answers never go in the bundle:
  - `answer`: typed text, normalized per `mode` (`caseless`/`exact`/`number`).
  - `python`: after the student's code runs, `expr` is evaluated in its namespace and compared as canonical JSON.
  - `sql`: the last statement's rows, with column names ignored and floats rounded; sorted unless `ordered`.
  - Results that aren't exact (forecasts) use a `python` check whose `expr` calls a grader function defined in the puzzle's data file, e.g. `_supply_check(pin, jan_2026, mae_sarima)` in `ts-nordlys`: it prints what is wrong (in both languages) and returns a fixed string such as `"approved"`, which is what gets hashed.
- Authoring loop: write the reference solution into `solutions.json`, run `npm run hash-answer -- <roomId> --write` (it runs the solution through the same runner code as the game), then `npm run walkthrough -- <roomId>` and `npm run validate-rooms`. Every puzzle needs a reference solution.
- **Instructor walkthroughs** (`docs/walkthroughs/<roomId>.<en|de>.md`) are generated from the manifest and solutions by `src/rooms/walkthrough.ts`: overview, final code, and per station the task, starter code, model solution, checked result, reveal, hints and clues. A room test fails when a committed walkthrough is out of date, so regenerate after every content change.
- Hashes only keep answers out of the running game's code: the solutions and walkthroughs are public in the repo anyway. Treat answers as a game mechanic, not a secret.

### Code execution
- Pyodide loads **lazily, only when a Python puzzle opens**, because it is about 12 MB. Its runtime files are served from our own site, not a CDN: the `pyodide-files` plugin in `vite.config.ts` serves them from `node_modules` in dev and copies them to `dist/pyodide/` in builds. sql.js's wasm is bundled as a Vite asset.
- **Packages:** a room's manifest can list Pyodide packages (`"packages": ["statsmodels"]`). `npm run fetch-packages` downloads them and their dependencies (sha256-checked against `pyodide-lock.json`) into the gitignored `vendor/pyodide/`, which the same plugin serves and copies; CI fetches and caches them. The worker loads a room's packages during warm-up and pre-imports heavy modules (`PRELOAD` in `pythonCore.ts`; `import statsmodels` alone takes seconds), so neither counts against the run timeout. Node tests and scripts get the same setup from `nodePyodide(packages)` (`src/runners/nodePython.ts`). statsmodels with numpy, pandas and scipy is about 30 MB.
- **Charts:** every Python run has `show_plot(*series, labels=, title=)` (lines; pandas indexes become the x axis and are aligned across series), `plot_acf` and `plot_pacf` (bars with the 95 % band; need statsmodels). They collect chart data in the run's namespace; `runPython` returns it as `plots`, and `Chart` (`src/ui/Chart.tsx`) draws it as SVG with a hover readout and a data table.
- **Helpers module:** after the data files run, the public functions of the prelude and the data files (e.g. `unshift`, `show_plot`) also form the module `helpers`. Starter code imports them (`from helpers import unshift`), so students see where a helper comes from; they stay global too. Name data-file functions that students shouldn't call with a leading `_` (graders).
- Both runtimes run in Web Workers (`src/runners/*.worker.ts`), driven by `runners` in `src/runners/index.ts`. A run longer than `RUN_TIMEOUT_MS` (10 s) terminates the worker, and the next run starts a fresh one. This doesn't need SharedArrayBuffer, which matters because GitHub Pages can't send COOP/COEP headers.
- `pythonCore.ts`, `sqlCore.ts`, `rooms/answers.ts`, `rooms/manifest.ts` and `rooms/solutions.ts` also run under plain Node (the tests and `scripts/hash-answer.ts`). Keep them free of browser APIs and Vite-only imports, and use explicit `.ts` extensions for relative imports between them. Every Python run gets a fresh namespace, and every SQL run a fresh database built from the setup script, so one attempt can't break the next.
- Each player has their own sandbox. Only the *outcome* (solved/not solved) is shared with the team, plus the live read-only code view. Editor drafts are kept per puzzle in `localStorage` (`dser.draft.<roomId>.<puzzleId>`).

### Hints
- Each puzzle has 1–3 tiered hints in its manifest, from a gentle nudge up to near-solution, revealed in order. A reveal applies to the whole team and is recorded in the run state's `hints` map (`<puzzleId>#<tier>`), which merges the same way `solved` does.
- Hint usage is part of the result: the scoreboard shows escape time *and* hints used, and the instructor view shows hints per puzzle per team. This shows instructors which puzzles are too hard.

### Debrief
- Solving the final puzzle opens the debrief (`DebriefDialog` in `src/ui/RoomDialogs.tsx`): escape time, total hints, and per puzzle its `practises`, solve time, hints used and the model solution. A HUD button reopens it. The numbers come from `debriefRows` (`src/rooms/debrief.ts`); solutions load lazily from `solutions.json` only when the debrief opens.

### Persistence, scoreboard, instructor
- Progress and identity (nickname, avatar) live in `localStorage`, so a page refresh restores the current run. Every storage key starts with `dser.`; the profile is zod-validated on load (`src/player/profile.ts`), and corrupt data counts as missing.
- The lobby scoreboard (`Scores`, `src/net/scores.ts`; `ScoreboardDialog`) turns finished runs from the live summaries into results, keeps them in `localStorage` (`dser.scores`, newest 300, 60 days) and hands them to every newcomer, so it fills up across visits. Results merge per team and epoch (earliest escape wins); implausible times are dropped. Players who joined the run but left before the escape are listed struck through, "left early". It is **not cheat-proof**, and the dialog says so. An unlocked instructor can remove a result (Remove in the scoreboard): the signed `removeScore` is kept as a tombstone (`dser.scores.removed`) so the result can't return from browsers that missed it, and is relayed to every newcomer; unlike other instructor messages it has no freshness limit, since replaying it changes nothing.
- **Instructor mode** (`src/net/instructor.ts`, `instructorCrypto.ts`; `InstructorPanel`, `Announcements`): announcements (to everyone or one group) and run resets are **signed** with an ECDSA P-256 key. `content/instructor.json` holds the public key and the private key encrypted with the instructor's passphrase (PBKDF2 + AES-GCM); without that file the Instructor button is hidden and instructor messages are ignored. Every client verifies signatures, freshness (±10 min) and nonces (no replays), so students can't fake them; a weak passphrase could still be brute-forced offline, since the file is public. The unlocked key lives only in memory. The panel reads the live run summaries (filterable by group): progress, time, hints and wrong attempts per puzzle. That data comes from players' browsers and isn't verified; the panel says so. A reset carries a new epoch; team members in the room apply it, and the banner tells them.
- **Messages and visits:** announcements can target one team (`teamId`). Players in a room can call the instructor (🙋 in the HUD); `HelpDesk` (`src/net/help.ts`, `LobbySession.help`) lists the calls in the panel and on the Instructor button. "Visit" sends a signed `visit` naming the instructor's lobby peer id; team members answer that peer, and only that peer, with an invite (room, password), so private rooms stay private. The instructor then enters as an observer (`Place.observer`): the run isn't saved, isn't reported, and visitors are left out of the team's member list. Calls and invites aren't signed. **Go to a player:** an unlocked instructor's people list turns names into a menu with "Go to <name>" (`App.goTo`). A player on the same map: the scene jumps next to them (`player:goto` on the bus, retried until the peer is on the map). In the lobby while the instructor is in a room: back to the lobby first. In a room: the visit flow above, finding the team through the run summaries' `peers`. Once unlocked, the instructor also broadcasts a signed `present` (re-signed for every peer that joins later), and everyone shows 🎓 before that peer's name over its avatar (`instructors:changed` on the bus); 🎓 is stripped from nicknames so it can't be copied.
- `instructorCrypto.ts` runs under plain Node (the key script) and is imported with explicit `.ts`; keep it free of parameter properties and non-`.ts` imports, since Node only strips types.

### i18n
- All UI strings and all story/puzzle text exist in both `de` and `en`. In-room text lives in the room manifest; UI strings live in `src/i18n/locales/{en,de}.json`, and a test fails if the two files' keys differ. Do not hard-code user-facing strings in components.

### GitHub Pages specifics
- The repo is `DataScienceEscapeRooms`, so Vite `base` is `/DataScienceEscapeRooms/`. Load assets through `import.meta.env.BASE_URL` and never through absolute `/` paths.
- `.github/workflows/deploy.yml` runs lint, tests and the build, then deploys on every push to `main`. In the repo settings, Pages must be set to "GitHub Actions" as its source.
- There is no server-side routing. Use hash routing, or a single page with in-app state.
