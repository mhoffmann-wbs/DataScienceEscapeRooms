# Generates the data file of Pier 9. Not bundled with the site.
# Graders that depend on a fit recompute it in Pyodide when they check; the few reference values
# stored here (best depth, best k, the odds board's count) are checked against the reference
# solutions by the room tests, which run the same Pyodide build as the game.
# Needs numpy, pandas and scikit-learn. Run from this folder:  python3 generate_data.py
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

warnings.filterwarnings("ignore")
FEATURES = ["weight_gap_pct", "value_per_kg", "transit_days", "route_risk", "xray_density"]
# The harbour master's audit rule (clue): a quarter held back, stratified, Pier 9's seed.
TEST_SIZE, SPLIT_SEED = 0.25, 9
# The night colleague's note (clue): odd k from 1 to 31, F1 on five folds.
K_GRID = list(range(1, 32, 2))
# The chief's order (clue): the odds board's dial moves in steps of 0.05; catch at least 4 in 5.
DIAL = [round(0.5 - 0.05 * i, 2) for i in range(10)]
TARGET_RECALL = 0.8
# The old XR-90 scanner raised its alarm above this X-ray density.
OLD_ALARM = 1.25
# The chief's test for any model: of the 100 sealed inspections it scores riskiest, at least this
# many must be among the sealed smuggling cases.
SEALED_TOP, SEALED_NEEDED = 100, 40

rng = np.random.default_rng(17)


def inspections_like(n, rate=0.06, flip=0.01):
    """n past inspections. Contraband shows as a weight gap (measured above declared), denser X-ray
    images, riskier routes and longer transits; 1 % of labels are flipped (tip-offs, mistakes)."""
    y = (rng.random(n) < rate).astype(int)
    gap = np.where(y == 1, rng.normal(9, 4, n), rng.normal(2, 3, n)).round().astype(int)
    dens = np.where(y == 1, rng.normal(1.05, 0.2, n), rng.normal(0.8, 0.18, n)).clip(0.2, 2.2).round(2)
    risk = np.where(y == 1, rng.choice([1, 2, 3, 4, 5], n, p=[.1, .15, .2, .25, .3]),
                    rng.choice([1, 2, 3, 4, 5], n, p=[.3, .3, .2, .12, .08]))
    days = np.where(y == 1, rng.normal(28, 9, n), rng.normal(22, 8, n)).clip(3, 70).round().astype(int)
    value = np.exp(np.where(y == 1, rng.normal(4.6, 1.1, n), rng.normal(4.9, 1.2, n))).clip(1, 9000).round(2)
    y = np.where(rng.random(n) < flip, 1 - y, y)
    df = pd.DataFrame(dict(zip(FEATURES, (gap, value, days, risk, dens))))
    return df, y


def csv(df):
    return df.to_csv(lineterminator="\n").strip()


def digits(values, per_line=75):
    s = "".join(str(int(v)) for v in values)
    return "(\n" + "\n".join(f'    "{s[i:i + per_line]}"' for i in range(0, len(s), per_line)) + "\n)"


# --- The inspection log ------------------------------------------------------------------------
X, y = inspections_like(3000)
inspections = X.copy()
inspections["old_flag"] = (X.xray_density > OLD_ALARM).astype(int)
inspections["contraband"] = y
inspections.index = pd.RangeIndex(1, len(X) + 1, name="inspection")

# 1. The rule card: a depth-3 tree on all inspections splits first on the weight gap.
card = DecisionTreeClassifier(max_depth=3, random_state=0).fit(X, y)
root_feature, root_threshold = FEATURES[card.tree_.feature[0]], card.tree_.threshold[0]
assert root_feature == "weight_gap_pct" and root_threshold == 8.5, (root_feature, root_threshold)
second = {FEATURES[card.tree_.feature[i]] for i in (card.tree_.children_left[0], card.tree_.children_right[0])}
assert second == {"xray_density"}, second
with_flag = DecisionTreeClassifier(max_depth=3, random_state=0).fit(inspections.drop(columns="contraband"), y)
assert with_flag.tree_.threshold[0] == 8.5

# 2. The proud dashboard: the old scanner is right most of the time and catches almost nothing.
old = inspections.old_flag.values
accuracy = (old == y).mean()
missed = int(((old == 0) & (y == 1)).sum())
caught = int(((old == 1) & (y == 1)).sum())
assert 0.93 < accuracy < 0.94 and caught < 30, (accuracy, caught)

# The audit split, used by stations 3 to 5.
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=TEST_SIZE, stratify=y, random_state=SPLIT_SEED)

# 3. Neighbours: scaled KNN has a clear best k by F1; raw KNN is ruled by euros per kg.
grid = lambda pipe: GridSearchCV(pipe, {"kneighborsclassifier__n_neighbors": K_GRID}, scoring="f1", cv=5).fit(Xtr, ytr)
scaled = grid(make_pipeline(StandardScaler(), KNeighborsClassifier()))
raw = grid(make_pipeline(KNeighborsClassifier()))
best_k = scaled.best_params_["kneighborsclassifier__n_neighbors"]
f1s = np.sort(scaled.cv_results_["mean_test_score"])
assert best_k == 5 and f1s[-1] - f1s[-2] > 0.01, (best_k, f1s[-3:])
assert raw.best_score_ < scaled.best_score_ - 0.2, (raw.best_score_, scaled.best_score_)

# 4. The overgrown tree: train accuracy climbs to 1, test accuracy peaks at one depth for any tree seed.
curves = np.array([[DecisionTreeClassifier(max_depth=d, random_state=s).fit(Xtr, ytr).score(Xte, yte) for d in range(1, 16)]
                   for s in range(8)])
best_depths = {int(np.argmax(c)) + 1 for c in curves}
margin = min(np.sort(c)[-1] - np.sort(c)[-2] for c in curves)
assert best_depths == {3} and margin > 3 / len(yte), (best_depths, margin)
train_curve = [DecisionTreeClassifier(max_depth=d, random_state=0).fit(Xtr, ytr).score(Xtr, ytr) for d in range(1, 16)]
print("train curve", np.round(train_curve, 4).tolist()); assert train_curve[-1] > 0.995
best_depth = 3

# 5. The odds board: logistic regression on standardised features; the highest dial step catching 4 in 5.
odds = make_pipeline(StandardScaler(), LogisticRegression()).fit(Xtr, ytr)
coef = dict(zip(FEATURES, odds[-1].coef_[0]))
assert max(coef, key=coef.get) == "weight_gap_pct", coef
p = odds.predict_proba(Xte)[:, 1]
step = next(t for t in DIAL if ((p >= t) & (yte == 1)).sum() / yte.sum() >= TARGET_RECALL)
opened = int((p >= step).sum())
assert step == 0.15 and opened == 76 and np.abs(p - step).min() > 1e-3, (step, opened)
for c in (0.1, 10):
    pc = make_pipeline(StandardScaler(), LogisticRegression(C=c)).fit(Xtr, ytr).predict_proba(Xte)[:, 1]
    assert int((pc >= step).sum()) == opened

# --- The sealed inspections: the chief's test for the final model --------------------------------
sealed_x, sealed_y = inspections_like(1000)
sealed = sealed_x.copy()
sealed.index = pd.RangeIndex(1, len(sealed) + 1, name="inspection")


def found(model):
    s = model.predict_proba(sealed)[:, 1]
    return int(sealed_y[np.argsort(-s, kind="stable")[:SEALED_TOP]].sum())


good = {
    "tree depth 3": DecisionTreeClassifier(max_depth=3, random_state=0),
    "tree depth 4": DecisionTreeClassifier(max_depth=4, random_state=0),
    "knn 5 scaled": make_pipeline(StandardScaler(), KNeighborsClassifier(5)),
    "knn 15 scaled": make_pipeline(StandardScaler(), KNeighborsClassifier(15)),
    "logistic scaled": make_pipeline(StandardScaler(), LogisticRegression()),
    "logistic raw": LogisticRegression(max_iter=5000),
    "forest": RandomForestClassifier(200, random_state=0),
}
bad = {"knn 5 raw": KNeighborsClassifier(5)}
scores = {}
for name, model in {**good, **bad}.items():
    for label, (fx, fy) in {"train": (Xtr, ytr), "all": (X, y)}.items():
        scores[name, label] = found(model.fit(fx, fy))
assert all(scores[n, l] >= SEALED_NEEDED for n in good for l in ("train", "all")), scores
assert all(scores[n, l] < SEALED_NEEDED - 5 for n in bad for l in ("train", "all")), scores

# --- Tonight's arrivals: 40 containers on the MV Kestrel ------------------------------------------
# Four smugglers, clear on every count; decoys that fool one rule each (the old scanner's density,
# a risky route, a heavy but plain cargo, expensive goods); the rest ordinary.
SMUGGLERS = [(15, 160, 38, 5, 1.28), (13, 95, 34, 4, 1.22), (16, 60, 41, 5, 1.31), (14, 130, 36, 4, 1.25)]
DECOYS = [(1, 140, 20, 2, 1.36), (3, 80, 46, 5, 0.86), (7, 70, 24, 3, 0.9), (2, 8400, 18, 1, 0.78),
          (9, 210, 12, 1, 0.72), (5, 120, 30, 4, 1.02)]
ordinary = []
while len(ordinary) < 40 - len(SMUGGLERS) - len(DECOYS):
    row, label = inspections_like(1, rate=0, flip=0)
    r = row.iloc[0]
    if r.weight_gap_pct <= 6 and r.xray_density <= 1.0:
        ordinary.append(tuple(r))
rows = SMUGGLERS + DECOYS + ordinary
kinds = ["smuggler"] * len(SMUGGLERS) + ["decoy"] * len(DECOYS) + ["ordinary"] * len(ordinary)
order = rng.permutation(len(rows))
while any(kinds[i] != "ordinary" for i in order[:8]):   # keep the manifest's head (printed by the starter) plain
    order = rng.permutation(len(rows))
numbers = sorted(rng.choice(np.arange(4100, 4999), len(rows), replace=False).tolist())
arrivals = pd.DataFrame([rows[i] for i in order], columns=FEATURES)
arrivals[["weight_gap_pct", "transit_days", "route_risk"]] = arrivals[["weight_gap_pct", "transit_days", "route_risk"]].astype(int)
arrivals.index = pd.Index(numbers, name="container")
smugglers = sorted(n for n, i in zip(numbers, order) if kinds[i] == "smuggler")
# The ship's manifest lists the columns in its own order.
arrivals = arrivals[["route_risk", "xray_density", "transit_days", "value_per_kg", "weight_gap_pct"]]
for name, model in good.items():
    for fx, fy in ((Xtr, ytr), (X, y)):
        s = pd.Series(model.fit(fx, fy).predict_proba(arrivals[FEATURES])[:, 1], index=arrivals.index).sort_values(ascending=False)
        assert sorted(s.index[:4]) == smugglers and s.iloc[3] > s.iloc[4], (name, s.head(6))

HEADER = '''import io as _io
import numpy as np
import pandas as pd


def _problems_or(problems, ok):
    for p in problems:
        print(p)
    return ok if not problems else "rejected"
'''

with open("data/inspections.py", "w") as f:
    f.write(f'''# The customs office on Pier 9: every inspection of the last two years, and the manifest of
# tonight's arrivals. Loaded before your code runs.
{HEADER}
inspections = pd.read_csv(_io.StringIO("""{csv(inspections)}
"""), index_col="inspection")

arrivals = pd.read_csv(_io.StringIO("""{csv(arrivals)}
"""), index_col="container")

_FEATURES = {FEATURES!r}
_SEALED = pd.read_csv(_io.StringIO("""{csv(sealed)}
"""), index_col="inspection")
_SEALED_Y = np.array([int(c) for c in {digits(sealed_y)}])
_SMUGGLERS = {smugglers!r}
_BEST_K = {best_k!r}
_BEST_F1 = {round(float(scaled.best_score_), 4)!r}
_BEST_DEPTH = {best_depth!r}
_STEP = {step!r}
_OPENED = {opened!r}


def _split():
    from sklearn.model_selection import train_test_split
    X = inspections[_FEATURES]
    y = inspections["contraband"]
    return train_test_split(X, y, test_size={TEST_SIZE!r}, stratify=y, random_state={SPLIT_SEED!r})


def _number(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _dashboard_check(accuracy, missed, recall, trust):
    \'\'\'The dashboard's check: the old scanner's accuracy, how many smugglers it let through, and its recall.\'\'\'
    y = inspections["contraband"].values
    flag = inspections["old_flag"].values
    true_acc = (flag == y).mean()
    true_missed = int(((flag == 0) & (y == 1)).sum())
    true_recall = ((flag == 1) & (y == 1)).sum() / y.sum()
    a, m, r = _number(accuracy), _number(missed), _number(recall)
    if None in (a, m, r):
        return _problems_or(["accuracy, missed and recall must all be numbers. / accuracy, missed und recall müssen alle Zahlen sein."], "")
    problems = []
    if a > 1:
        a = a / 100
    if r > 1:
        r = r / 100
    if abs(a - true_acc) > 0.001:
        problems.append("accuracy isn't the share of inspections where old_flag matches contraband. / accuracy ist nicht der Anteil der Kontrollen, bei denen old_flag mit contraband übereinstimmt.")
    if m != true_missed:
        if m == int(((flag == 1) & (y == 0)).sum()):
            problems.append("missed counts false alarms: clean containers the scanner flagged. Count the smugglers it did not flag. / missed zählt Fehlalarme: saubere Container, die der Scanner markiert hat. Zählt die Schmuggler, die er nicht markiert hat.")
        else:
            problems.append("missed isn't the number of contraband containers with old_flag 0. The confusion matrix has it. / missed ist nicht die Zahl der Schmuggel-Container mit old_flag 0. Die Konfusionsmatrix hat sie.")
    if abs(r - true_recall) > 0.001:
        problems.append("recall isn't the share of contraband the scanner flagged. / recall ist nicht der Anteil des Schmuggelguts, den der Scanner markiert hat.")
    if not isinstance(trust, (bool, np.bool_)):
        problems.append("trust should be True or False. / trust soll True oder False sein.")
    elif trust:
        problems.append("trust is off: how many of the smugglers did the scanner catch? / trust stimmt nicht: Wie viele der Schmuggler hat der Scanner gefangen?")
    return _problems_or(problems, "exposed")


def _steps(model):
    return [name for name, _ in getattr(model, "steps", [])]


def _neighbours_check(search):
    \'\'\'The neighbours' check: a fitted grid search over k, on scaled features, scored by F1.\'\'\'
    if not hasattr(search, "best_params_"):
        return _problems_or(["search must be a fitted GridSearchCV (call .fit first). / search muss ein trainiertes GridSearchCV sein (erst .fit aufrufen)."], "")
    est = search.estimator
    problems = []
    if not any("scaler" in s for s in _steps(est)):
        problems.append("The pipeline doesn't scale: value_per_kg (up to thousands of euros) rules every distance. Put a StandardScaler before the KNN. / Die Pipeline skaliert nicht: value_per_kg (bis zu Tausenden Euro) bestimmt jeden Abstand. Setzt einen StandardScaler vor das KNN.")
    elif search.scoring != "f1":
        problems.append("The search doesn't judge k by the right score. / Die Suche bewertet k nicht mit dem richtigen Maß.")
    else:
        ks = [int(v) for v in np.ravel([p for key, p in search.param_grid.items() if key.endswith("n_neighbors")][0])] if isinstance(search.param_grid, dict) else []
        if sorted(ks) != {K_GRID!r}:
            problems.append("The grid doesn't try the right values of k. / Das Raster probiert nicht die richtigen Werte für k.")
        elif len(search.cv_results_["mean_test_score"]) and getattr(search, "n_splits_", 5) != 5:
            problems.append("The search doesn't use the right number of folds. / Die Suche nutzt nicht die richtige Zahl von Folds.")
        elif abs(search.best_score_ - _BEST_F1) > 0.002:
            problems.append("The scores don't match the training part of the audit split. Check the split's arguments, and fit the search on X_train and y_train. / Die Werte passen nicht zum Trainingsteil des Prüfsplits. Prüft die Argumente des Splits und trainiert die Suche auf X_train und y_train.")
        elif list(search.best_params_.values())[0] != _BEST_K:
            problems.append("best_params_ doesn't hold the best k of this search. / best_params_ enthält nicht das beste k dieser Suche.")
    return _problems_or(problems, "neighbourly")


def _depth_check(train_scores, test_scores, depth):
    \'\'\'The overgrown tree's check: train and test accuracy for depths 1 to 15 on the audit split, and the best depth.\'\'\'
    from sklearn.tree import DecisionTreeClassifier
    try:
        tr = [float(v) for v in train_scores]
        te = [float(v) for v in test_scores]
    except (TypeError, ValueError):
        return _problems_or(["train_scores and test_scores must be lists of numbers. / train_scores und test_scores müssen Listen von Zahlen sein."], "")
    if len(tr) != 15 or len(te) != 15:
        return _problems_or([f"Both lists need 15 scores, one per depth from 1 to 15; you have {{len(tr)}} and {{len(te)}}. / Beide Listen brauchen 15 Werte, einen pro Tiefe von 1 bis 15; ihr habt {{len(tr)}} und {{len(te)}}."], "")
    X_train, X_test, y_train, y_test = _split()
    ref = [DecisionTreeClassifier(max_depth=d, random_state=0).fit(X_train, y_train).score(X_test, y_test) for d in range(1, 16)]
    problems = []
    # Trees with another random_state differ by about 0.001 on average, another split by 0.003 or more.
    if np.abs(np.array(te) - ref).mean() > 0.0028:
        problems.append("The test scores don't match the audit split. Check the split's arguments, and leave old_flag out of the features. / Die Testwerte passen nicht zum Prüfsplit. Prüft die Argumente des Splits und lasst old_flag aus den Features.")
    elif tr[-1] < 0.99:
        problems.append("At depth 15 the tree should know its training data almost by heart (train accuracy near 1.0). Is max_depth set from the loop? / Bei Tiefe 15 sollte der Baum seine Trainingsdaten fast auswendig kennen (Trainingsgenauigkeit nahe 1.0). Wird max_depth aus der Schleife gesetzt?")
    elif depth != _BEST_DEPTH:
        problems.append("depth isn't the depth where the test score peaks. The training score always climbs; the test score decides. / depth ist nicht die Tiefe, bei der der Testwert am höchsten ist. Der Trainingswert steigt immer; der Testwert entscheidet.")
    return _problems_or(problems, "pruned")


def _odds_check(model, riskiest, threshold, opened):
    \'\'\'The odds board's check: logistic regression on standardised features, the riskiest feature, and the dial step.\'\'\'
    problems = []
    if not hasattr(model, "predict_proba") or "logisticregression" not in _steps(model):
        return _problems_or(["model must be a fitted pipeline with a StandardScaler and a LogisticRegression. / model muss eine trainierte Pipeline mit StandardScaler und LogisticRegression sein."], "")
    if not any("scaler" in s for s in _steps(model)):
        problems.append("Standardise the features first: only then can coefficients be compared. / Standardisiert die Features zuerst: Nur dann lassen sich Koeffizienten vergleichen.")
    if riskiest != "weight_gap_pct":
        problems.append("riskiest isn't the feature with the largest coefficient. Use the column name, e.g. \\"route_risk\\". / riskiest ist nicht das Feature mit dem größten Koeffizienten. Nehmt den Spaltennamen, z. B. \\"route_risk\\".")
    t, n = _number(threshold), _number(opened)
    if t is None or n is None:
        problems.append("threshold and opened must be numbers. / threshold und opened müssen Zahlen sein.")
    elif not problems:
        X_train, X_test, y_train, y_test = _split()
        try:
            p = model.predict_proba(X_test)[:, 1]
        except Exception:
            return _problems_or(["model can't score the test part. Fit it on the five features, without old_flag. / model kann den Testteil nicht bewerten. Trainiert es auf den fünf Features, ohne old_flag."], "")
        y = y_test.values
        rec = ((p >= t) & (y == 1)).sum() / y.sum()
        if abs(t - _STEP) > 1e-6:
            if rec < {TARGET_RECALL!r}:
                problems.append(f"At {{t}} the board catches only {{rec:.0%}} of the test set's smugglers: not enough. / Bei {{t}} fängt die Tafel nur {{rec:.0%}} der Schmuggler im Testteil: nicht genug.")
            else:
                problems.append("This step catches enough, but a higher step on the dial does too, and opens fewer containers. / Diese Stufe fängt genug, aber eine höhere Stufe auf dem Regler auch, und sie öffnet weniger Container.")
        elif int((p >= t).sum()) != _OPENED:
            problems.append("Your model opens a different number of containers than the board: fit LogisticRegression() with its default settings on the standardised training part. / Euer Modell öffnet eine andere Zahl von Containern als die Tafel: Trainiert LogisticRegression() mit Standardeinstellungen auf dem standardisierten Trainingsteil.")
        elif int(n) != _OPENED:
            problems.append("opened isn't the number of test containers with a probability at or above the threshold. / opened ist nicht die Zahl der Testcontainer mit einer Wahrscheinlichkeit auf oder über der Schwelle.")
    return _problems_or(problems, "calibrated")


def _arrivals_check(model, opened):
    \'\'\'The final check: a model that passes the chief's test on the sealed inspections, and the four containers to open.\'\'\'
    if not hasattr(model, "predict_proba"):
        return _problems_or(["model must be a fitted classifier with predict_proba. / model muss ein trainierter Klassifikator mit predict_proba sein."], "")
    try:
        s = model.predict_proba(_SEALED)[:, 1]
    except Exception:
        return _problems_or(["model can't score inspections with the five measurement columns. Train it on those five, without old_flag: the scanner is down tonight. / model kann keine Kontrollen mit den fünf Messspalten bewerten. Trainiert es auf diesen fünf, ohne old_flag: Der Scanner ist heute Nacht kaputt."], "")
    problems = []
    found = int(_SEALED_Y[np.argsort(-s, kind="stable")[:{SEALED_TOP!r}]].sum())
    if found < {SEALED_NEEDED!r}:
        problems.append(f"Chief's test failed: among the sealed inspections your model scores riskiest are only {{found}} of the {{_SEALED_Y.sum()}} smuggling cases. Scale for KNN, prune a tree. / Test des Chefs nicht bestanden: Unter den versiegelten Kontrollen, die euer Modell am riskantesten bewertet, sind nur {{found}} der {{_SEALED_Y.sum()}} Schmuggelfälle. Skaliert für KNN, beschneidet einen Baum.")
    try:
        got = sorted(int(v) for v in opened)
    except (TypeError, ValueError):
        return _problems_or(problems + ["opened must be a list of four container numbers. / opened muss eine Liste von vier Containernummern sein."], "")
    if len(got) != 4:
        problems.append(f"The crew can open four containers; opened has {{len(got)}}. / Die Crew kann vier Container öffnen; opened hat {{len(got)}}.")
    elif not set(got) <= set(arrivals.index):
        problems.append("opened must hold container numbers from the manifest (its index), not row positions. / opened muss Containernummern aus dem Manifest enthalten (sein Index), keine Zeilenpositionen.")
    elif got != _SMUGGLERS:
        problems.append(f"Only {{len(set(got) & set(_SMUGGLERS))}} of your four are among the four riskiest arrivals. Rank all 40 by predict_proba. / Nur {{len(set(got) & set(_SMUGGLERS))}} eurer vier gehören zu den vier riskantesten Ankünften. Ordnet alle 40 nach predict_proba.")
    return _problems_or(problems, "opened")
''')

print("contraband:", int(y.sum()), "of", len(y), f"({y.mean():.1%})")
print("root:", root_feature, root_threshold)
print("old scanner: accuracy", round(accuracy, 4), "missed", missed, "caught", caught, "false alarms", int(((old == 1) & (y == 0)).sum()))
print("best k:", best_k, "F1", round(scaled.best_score_, 3), "raw KNN best F1", round(raw.best_score_, 3))
print("test accuracy by depth:", np.round(curves[0], 4).tolist())
print("logistic coefficients:", {k: round(v, 2) for k, v in coef.items()})
print("odds board:", step, "opens", opened, "of", len(yte))
print("sealed: smuggling cases", int(sealed_y.sum()), "found in top 100:", {f"{n} ({l})": v for (n, l), v in scores.items()})
print("arrivals smugglers:", smugglers)
print("final lock:", f"{best_depth}{best_k}{opened}")
