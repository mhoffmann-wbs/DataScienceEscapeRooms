# Build plan

A browser-based, gather.town-style escape room game for data science students. Players walk around a 2D lobby, chat and talk with people nearby, form teams at doors, and solve themed data science puzzles together. It runs as a static site on GitHub Pages with no backend and no third-party accounts.

Architecture details live in [CLAUDE.md](../CLAUDE.md). This file tracks *what* gets built and in which order. Finished steps are summarised; each room's stations, values and solutions are in its walkthrough (`docs/walkthroughs/`) and flow page (`docs/flows/`), and the git history has the full step notes.

## Decisions

| Topic | Decision |
|---|---|
| Hosting | Static site on GitHub Pages (`/DataScienceEscapeRooms/`), deployed by GitHub Actions |
| Stack | Vite, TypeScript, React overlays, Phaser 4 world, Tiled maps |
| Networking | Peer-to-peer via Trystero over public, account-free relays, behind a swappable `Transport` interface |
| Communication | Text chat (lobby and per team room) and proximity voice/video |
| Identity | Nickname and avatar; no accounts |
| Scale | One shared lobby, designed for about 10–30 players at a time; teams of 2–5 |
| Teams | Walk to a door, create or join a team, public or password-protected; each team gets its own room instance |
| Puzzle state | Shared per team, so a puzzle solved by anyone is solved for everyone; each player has their own code sandbox |
| Code execution | Pyodide (Python) and sql.js (SQLite), in Web Workers, loaded lazily |
| Validation | Typed answers, Python check expressions and SQL results, all compared against salted hashes |
| Authoring | Each room is a folder with a Tiled map, a JSON manifest and datasets; adding one needs no engine changes |
| Language | German and English throughout |
| Play time | About 30 minutes per room: 5–6 puzzles plus a final lock |
| Prophet, TensorFlow | Neither runs in the browser, so rooms use small stand-ins with the real API names, labelled as such: [prophet-lite](prophet-lite.md), [tensorflow-lite](tensorflow-lite.md) |

## Steps

Each step ends with typecheck, lint, tests and build passing, and a git commit.

### 1–5. Engine ✅
Scaffold (event bus, DE/EN with a key-parity test, the `src/net/` lint rule, Pages deploy); lobby with walking, collision and doors from Tiled; P2P presence and lobby/nearby chat behind `Transport`; teams at doors with their own room instance and leaderless shared state (earliest timestamp per key), rejoin after a refresh; the room engine: zod manifests and `validate-rooms`, puzzle dialogs with CodeMirror, Pyodide and sql.js workers (a stuck run restarts the worker), `answer`/`python`/`sql` checks with `hash-answer`, tiered team hints, and the author shortcut `#/room/<id>?puzzle=<n>`.

### 6. The two starter rooms ✅ content built, playtest pending
Quarantine (`python-lab`) and The Blue Index (`sql-hotel`); clues and reveals; the debrief screen after escaping (what each puzzle practised, model solutions, time and hints), reopenable from the HUD.

### 7. Proximity, voice/video and collaboration ✅
A/V with players nearby in the lobby and the whole team in a room (hysteresis, mute, camera, devices, a clear message when the network blocks it); the nearby ring; speech bubbles; private `area` zones; the team notebook (leaderless notes with last-write-wins fields and sortable positions, "pin to notes" from clues and reveals); the shared code view (watch and copy; real-time co-editing would need a text CRDT such as Yjs).

### 8. Progress, scoreboard, instructor mode, solo mode ✅
Saved runs and rejoin from the door; the lobby scoreboard (not cheat-proof); instructor mode with signed messages (progress, hints and wrong attempts per puzzle, resets, announcements, calls, visits, removing scoreboard entries); the help page (`HelpDialog`, `help.*`; keep it in sync when mechanics change); solo practice mode.

### 8b. Doors as room types ✅
Lobby doors stand for room types, with a scenario list per door, a five-tier difficulty badge (beginner, elementary, intermediate, advanced, expert) and an ⓘ with story, topics and tools. Planned scenarios show as "Coming soon" from `content/lobby/doors.json`; move an entry from `upcoming` into a manifest when the room is built.

### 9. Polish
- ✅ Art from our own generator (`scripts/generate-art.mjs`), avatar customization from a recoloured parts sheet, an accessibility pass (focus handling, Esc, focus ring, announced chat, reduced motion; keyboard-only play works).
- **Open:** an optional TURN server setting for networks that block P2P; an audio cue or text description of the map for blind players.

### 10. Time series rooms ✅ content built (`ts-nordlys`, `ts-festival`), playtest pending
Per-room Python packages served from our own site (`npm run fetch-packages`), charts in the output panel, and tolerance graders in data files. Station Nordlys teaches the statsmodels path (interpolate, detrend + AR, baselines, log and differencing, ACF/PACF and AIC, a SARIMA forecast); Festival Season the Prophet-style one (gaps left empty, changepoints, baselines, multiplicative seasonality, holidays). The rule for both: every preprocessing step only where it fits the model (no differencing for Prophet, never both detrending and differencing). The Prophet-style model fits by Gauss-Newton with non-negative least squares, so CPython and Pyodide agree.

### 11. Playtest fixes (November 2026) ✅
Content fixes in Quarantine and The Blue Index, `from helpers import …`, Tab indents and Esc in the editor, pin once, notes above the video tiles, mic noise suppression, "Go to a player" for instructors, players who left early shown in results.
- **Watch for:** if the instructor panel again shows no running rooms (not reproduced), suspect a network blocking P2P between instructor and students, and relay summaries through other lobby peers as the scoreboard does. If mic noise is still a problem: push-to-talk or a WASM noise filter.

### 12–13. Market Day and the statistics rooms ✅ content built (`pandas-market`, `stats-fair`, `stats-ab`), playtest pending
Market Day: pandas cleaning, `groupby` and `merge`, with CSVs written into Pyodide's file system for `pd.read_csv`. A 📊 statistics door in a side wall (doors take a `facing`), with The Rigged Fair (descriptive statistics, probability, binomial and normal) and The Chocolate Experiment (power, t-tests, CLT, chi-squared). These introduced player-opened code locks (manifest `lock`) and `show_hist`/`show_bars`.

### 14–15. Room flows and handbooks ✅
A flow page per room (`room-flow` skill); no room uses `requires` any more (stations need an earlier result through `uses`, or sit behind a code lock), and clue values were taken out of the task texts. Every room has a 📖 handbook on a lectern with DE/EN entries linking the official docs, at the room's level.

### 16–17. The Silent Archive and The Butterfly House ✅ content built (`python-docs`, `python-debug`), playtest pending
The Silent Archive practises finding facts in the official Python docs (clues only say where to look); every link and fact is pinned to `docs.python.org/3.14/`, the Python Pyodide 0.29 runs. The Butterfly House is debugging prewritten scripts; student code runs as `script.py`, so tracebacks show Python 3.14's markers, and every starter puzzle has a "± Changes" view of the player's edits.
- **Open:** whether 30 minutes is enough when nobody knows the docs (the fees station's first hint may need to name `decimal`); when Pyodide moves to a new Python, re-check the archive's facts and move the pin; an optional `npm run check-doc-facts` that fetches the pinned pages (network, not in CI); a pandas docs room would fit behind the 🐍 door too. In The Butterfly House, "nectar → 6" isn't derived from the script's output like the other digits.

### 18–19. Night Train and The Last Show ✅ content built (`sql-train`, `sql-cinema`), playtest pending
Night Train: subqueries, CTEs, `LEFT JOIN … IS NULL`, `LAG` and `ROW_NUMBER`. The Last Show, between it and The Blue Index: `HAVING`, `CASE` pivots, date functions, gaps in a sequence and a running total. Both databases come from `generate_data.py`, which asserts the room's results.
- **Open:** window functions are new to most students, so the speed recorder may need its first hint early; The Last Show's database is 380 KB (6,000 tickets), so check runs stay quick on slow laptops.

### 20. Neural network rooms ✅ content built (`nn-post`, `nn-tablets`), playtests pending
A 🧠 door with The Night Post (a dense network on 16 × 16 digits) and The Varda Tablets (a CNN on 24 × 24 signs anywhere in the image), on `content/python/tensorflow.py`, a numpy-only TensorFlow-style model whose maths match Keras (gradient-tested), plus `show_images`. Budget per run: 16 × 16 images, at most about 3,000 training images and 20 epochs; convolutions run about 5× slower than native numpy (no BLAS in Pyodide). Training differs slightly between CPython and Pyodide, so exact answers only come from deterministic steps (given weights, parameter counts, recorded logs); anything trained goes through a threshold grader.
- **Open:** training speed on slow laptops (the Tablets' final takes about 4 s in Node against the 10 s run limit); whether advanced teams find the seal's kernel layout too fiddly; both archives are about 300 KB.

### 21. Machine learning rooms: `ml-seeds`, `ml-customs` and `ml-auction` ✅ content built, two rooms drafted
A 🤖 door with five rooms on **real scikit-learn** (Pyodide ships 1.8.0; `import sklearn` goes into `PRELOAD`, `n_jobs` stays 1, everything fits the 10 s limit). Built: The Seed Bank (KMeans: scaling, elbow and silhouette, init, outliers), Pier 9 (trees, KNN in a pipeline, logistic regression, metrics) and Going Once (linear regression: metrics, log target, dummies, residuals, age²), plus `show_scatter`. Drafted below: Rush Hour and The Pass Road.

**Checks:** with a fixed `random_state` the results are deterministic within the one Pyodide build that the game and `hash-answer` share. Answers must still survive harmless differences in students' code (another seed, `drop_first` or not): prefer counts on well-separated data, hyperparameters with a clear optimum, IDs and feature names over long decimals; anything trained freely goes through a threshold grader that passes every sound run (test seeds 0–20); cluster numbers are arbitrary, so no answer may depend on them. A final that names items should also check the team's own fitted objects, so the answer can't be read off a table.

- **Open:** whether the Seed Bank's elbow station is too easy; whether Pier 9's threshold of 40 in the chief's test is too tight for scaled KNN with k = 5 (41–42); whether Going Once's final starter (log target and dummies already in it) gives too much away; `show_matrix(m, x=, y=)` (a heatmap for confusion matrices) if a later room needs it; LightGBM 4.6 loads and fits fast if `ml-avalanche` wants it.

**ML4 "Rush Hour"** (`ml-courier`, advanced; feature engineering and selection). Blitzkurier, a bike and scooter courier service; its delivery-time model broke on the evening of the city marathon, and dispatch must promise times for tonight's orders. The raw order log is messy: order timestamps as text, pickup and drop-off as grid coordinates, weather as words, vehicle type, number of items, restaurant ID, a leaky `delivered_at` column, and 40 columns of scooter telemetry, of which only a few matter.
1. **The raw log** (datetime features; open): `pd.to_datetime`, then hour, weekday and a rush-hour flag. A linear model on raw numbers alone vs with the new features; answer: the test MAE in minutes, with the features. Clue: the dispatcher's shift plan (rush hours).
2. **Couriers can't fly** (an engineered feature; open): the straight-line distance vs the street distance on the city grid (`abs(dx) + abs(dy)`; clue: the city map with its grid of streets). Answer: the correlation of each with duration, or the gain in MAE.
3. **Weather and vehicles** (encoding; `OneHotEncoder` for unordered, `OrdinalEncoder` with an explicit order for "dry < drizzle < rain < storm"; `ColumnTransformer`; open): answer: the number of columns after the transformer. Clue: the weather service's scale.
4. **Too good to be true** (data leakage; uses 1): one colleague's model has R² 0.99. The data dictionary (clue) shows that `delivered_at` and `tip_time` are only known afterwards; a scaler fitted before the split is the second leak. Answer: the honest test MAE after removing both.
5. **Forty sensors** (feature selection; open): KNN gets worse with all telemetry columns (noise dominates distances). `SelectKBest(f_regression)`, `RFE` or `permutation_importance` find the same few useful columns. Answer: their numbers, which open the dispatch office (lock of 6).
6. **Tonight's promises** (final): a `Pipeline` with the `ColumnTransformer`, the engineered features and the selected columns; the grader wants a holdout MAE below a threshold and checks the predicted times for five marathon-night orders (±3 minutes).

**ML5 "The Pass Road"** (`ml-avalanche`, advanced; ensembles). The avalanche warning office in a mountain village; the 6:00 bulletin decides whether the pass road opens, and the forecaster is snowed in on the other side. 15 winters of daily records (new snow, wind, temperature change, slope, aspect, settled snowpack) with "avalanche on the slope that day", plus the decision trees of five former forecasters. The jury is the metaphor throughout: one tree is one juror.
1. **One forecaster** (variance of deep trees; open): five unpruned trees on five bootstrap samples (seeds given) disagree on many test days. Answer: on how many days at least one disagrees with the rest. Clue: the five forecasters' logbooks, which never agree.
2. **The committee** (bagging, majority vote; uses 1): vote the five trees by hand (`np.round(mean)`), then `BaggingClassifier(n_estimators=100)`; both beat a single tree. Answer: the bagged test accuracy, in percent.
3. **The forest** (random forest, `max_features`, `oob_score_`, `feature_importances_`; open): a forest with `max_features=None` and `bootstrap=False` grows 100 identical trees and gains nothing (a jury of clones). With defaults, OOB rises. Answer: the two most important features, as their column numbers. Clue: the office's poster "a jury only helps if its members think differently".
4. **The apprentices** (boosting; `GradientBoostingClassifier`, `learning_rate` × `n_estimators`, `staged_predict` on a validation set; open): find the iteration with the best validation score at `learning_rate=0.1`; at 1.0 it overfits quickly. Answer: the best number of trees. Clue: the apprenticeship board, where each apprentice fixes the last one's mistakes. Optionally LightGBM with the same idea.
5. **The council** (`VotingClassifier`, hard vs soft, or `StackingClassifier` with LogisticRegression, KNN and a tree; lock from 3): soft voting beats each member and hard voting. Answer: the soft-vote recall, which opens the radio room's cabinet.
6. **The bulletin** (final): the best ensemble (the grader wants test recall ≥ 0.85 at accuracy ≥ 0.8), then tomorrow's five slopes along the pass road: open or closed. The code is the closed slopes' numbers.

**Open:** prototype each room's data so the answers are robust (well-separated clusters, a clear optimum in every search, the same top four containers for any reasonable model); check that the handbooks stay at each room's level (`ml-courier` and `ml-avalanche` don't re-explain `train_test_split`). The two advanced rooms come next.

### 22. Room restyle ✅ (playtests pending)
Every room has its own layout, size and art instead of the shared 22 x 15 template: separate areas that tell the story, themed walls and floors, `decor` and `above` layers, a block of 32 tiles per room from 208 on, solid tiles declared in the art generator, and a map test that every object can be walked to from the spawn. Each map is built by an ASCII script in `scripts/maps/<roomId>.mjs` (helpers in `mapkit.mjs`, previews with `render.mjs`).
- **To check in playtests:** walking distances changed. In `stats-ab` the agenda hangs in Ana's office, far from the console; in `sql-train` every clue stands next to its station, which may make the room easier.

### 23. Shortcut review follow-ups
Every room was checked for shortcuts (November 2026) ✅: data that gives a later answer away, reveals that show another station's result, guessable inputs and codes, checks a typed or hard-coded answer passes. The fixes are in each room's "Fixed in the shortcut review" block in `docs/flows/`. Several lock codes, starters and checks changed, so playtest those rooms again. These need a bigger redesign; items 1 and 2 are done, the others are still open:

1. ✅ **The Last Show (`sql-cinema`): the ticket printers are needed.** A second foyer counter (the drinks bar, `snack_sales.counter`) and a decoy swap (Marta planned at the drinks bar, stood at till 1) make rota plus foyer tills name two suspects, Tobias and Marta; only the printers' result (all gaps on till 2) picks Tobias. Rota, foyer tills, office hints and reveals reworked; see "Fixed in step 23" in `docs/flows/sql-cinema.md`. Playtest again.
2. ✅ **Market Day (`pandas-market`): the register feeds the final.** The complaint is now an honest customer's note (€80 change brought back to the honey stall next to the fountain, S04, badge 9); Tobi's theft is another €80 from the other honey stall (S07). Two badges are €80 short, and only the register's S04 rules one out; lock code 160. See "Fixed in step 23" in `docs/flows/pandas-market.md`. Playtest again.
3. **The Varda Tablets (`nn-tablets`): make Mika's notebook needed.** The final retrains the same reader from scratch, and the cabinet code comes only from the laptop. Add a digit to the cabinet code that only the notebook gives, from a result that does not depend on how the team trains (so not the test accuracy).
4. **Station Nordlys (`ts-nordlys`): the true model should not be the airline model.** A team that knows `SARIMAX((0,1,1),(0,1,1,12))` skips the echo chamber's ACF/PACF and AIC reasoning. Regenerate the fuel data so another model wins, e.g. (1,1,1)(0,1,1,12) (its January differs by about 25 l), with tighter tolerances, a new chief's MAE (602 now) and updated hints and ACF/PACF reading.
5. **The Rigged Fair (`stats-fair`): the gate code can be brute-forced.** It is one digit per stall, so a team with three seals tries ten values for the fourth and skips the lemonade stand and the filling machine. Use a code that is not a plain digit per stall, or a lock with an attempt limit.
6. **The Silent Archive (`python-docs`): make the docs needed.** The packing table (a slicing loop instead of `itertools.batched`), the returns cart (hand-sorting 12 titles, or trying both orders) and the ledger (integer cents) can be solved without reading the docs. Ask for things only the docs entry says, e.g. `batched`'s `strict=True` behaviour or an iterator input, and enlarge the cart data.
7. **The Night Post and The Varda Tablets (`nn-post`, `nn-tablets`): hidden holdout set.** A model trained on the test cards (or on train plus test) still passes the 85 % accuracy checks. Keep a second, hidden test set in the data and score the model on it; needs a generator change and a data regeneration.

## Known limits

- **One shared lobby:** everyone using the site meets in the same lobby, a full P2P mesh. It is meant for about 10–30 people at once; several classes playing at the same time would make it heavy. If that happens, split the lobby again (e.g. a lobby name in the URL) rather than adding a server.

- **Strict networks:** without a TURN relay, voice and video may fail on some school or company networks. Text chat is unaffected.
- **No authority:** with no central server, the scoreboard and the progress the instructor sees can be faked. Instructor messages themselves are signed and can't be.
- **Download size:** Pyodide is about 12 MB, so it is loaded only when a Python puzzle opens. The time series rooms add about 29 MB of packages, loaded only in rooms that declare them and cached by the browser afterwards.

## Ideas not yet scheduled

Add new ideas here before they move into a step.

- **Visual state changes:** a solved object swaps its tile (the freezer opens, the vent fan spins), set via a Tiled property such as `solvedTile`. Best done with the art pass in step 9.
- **Split clues:** some clues show different halves to different players, so the team has to talk. Fits proximity voice.
- **Overlays hide the map:** on smaller windows the chat panel covers the map's lower-left corner, and the camera can't scroll there because the map fits the screen. Either let the camera scroll past the left edge (like `UI_INSET_*`), or make the chat collapsible. Until then, keep important objects out of the lower-left of room maps.
- **Speaking indicator:** highlight the tile (and the avatar on the map) of whoever is talking, using an AudioContext analyser on each remote stream.
- **Italic text in manifests:** RichText only knows `**bold**` and `` `code` ``; a single `*star*` shows literally. Either support it or add a manifest test that rejects it.
- **Clue shortcut for authors:** `#/room/<id>?clue=<id>` to check clue texts without walking.
- **Scoreboard export:** let the instructor export and import the scoreboard as JSON from the panel, as a backup that doesn't depend on returning browsers.
- **Ambient animation in rooms:** a few tiles that animate (flickering alarm beacons, swaying lanterns and string lights, rippling water in the fountain, the lily pond and the harbour, the turning carousel), e.g. tile animations listed next to the tiles in `generate-art.mjs` and played by `WorldScene` on the `decor`, `walls` and `above` layers.
- **Darkness in the night rooms:** a dark overlay for rooms set at night (Pier 9, the Night Train, the Rigged Fair, the Night Post) that lifts in a soft circle around each player and around light sources such as lamps and beacons, e.g. a render texture over the map with erased light circles; switched on by a map or manifest property.
- **Paired t-test station:** a follow-up tasting where the same tasters rate both recipes (`ttest_rel`), next to the independent design of `stats-ab`.
- **Handbook from the HUD:** once a team has found the handbook, a 📖 button in the room HUD could reopen it from anywhere, so nobody has to walk back to the lectern mid-puzzle.
- **Go to from the map:** the instructor's "Go to" menu also on avatar name labels and in the instructor panel's member list.
- **Run limit per room:** a manifest `runTimeout` (e.g. 20 s) for rooms that train networks, so slow laptops don't hit the 10 s limit in `nn-tablets`; the worker already restarts after a timeout, so only the limit would change.
- **Feature maps station:** `model.layers[0](x)` on a sign and on the same sign shifted shows that a convolution's maps move with the sign (equivariance) while global pooling's numbers stay put (invariance). Would fit a third neural network room, or a harder variant of `nn-tablets`' laptop.
- **Data augmentation:** `RandomTranslation` / `RandomFlip` layers in the TensorFlow-style model, for a room where a dense net learns to cope with shifted images only from augmented training data.
- **Second unsupervised room:** PCA (explained variance, a 2D view of many columns), DBSCAN (clusters of any shape, noise points) and hierarchical clustering, next to the KMeans-only `ml-seeds`. Also a natural place for "when KMeans fails" (moons, unequal densities).
- **XGBoost:** Pyodide ships `xgboost` 2.1.4, but a first fit crashed in Node; if it works in the browser worker, `ml-avalanche` could use it next to scikit-learn's boosting, since many courses teach it.
