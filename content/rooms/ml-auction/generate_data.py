# Generates the data file of Going Once. Not bundled with the site.
# Graders that depend on a fit recompute it in Pyodide when they check; the reference values stored
# here (the forged lot, the catalogue's estimates and what the usual mistakes would print) are
# checked against the reference solutions by the room tests, which run the same Pyodide build as
# the game.
# Needs numpy, pandas and scikit-learn. Run from this folder:  python3 generate_data.py
import warnings

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")
COLUMNS = ["age", "maker_tier", "case_mm", "condition", "box_papers", "movement"]
NUMERIC = ["age", "maker_tier", "case_mm", "condition", "box_papers"]
# The house's validation rule (clue): a fifth held back, and the printer's deadline as the seed.
TEST_SIZE, SPLIT_SEED = 0.2, 6
# The insurer's letter (clue): every estimate within this share of its valuation.
TOLERANCE = 0.10

rng = np.random.default_rng(3)

# Log hammer price: tier, condition, size and papers add a share of the price each; quartz watches
# fetch far less; young watches and antiques fetch more than the 30-to-40-year-olds in between.
MOVEMENT_EFFECT = {"automatic": 0.0, "manual": 0.08, "quartz": -0.6}
# Box and papers survive more often with automatics than with quartz watches, so leaving out the
# movement inflates the papers' premium.
PAPERS_SHARE = {"automatic": 0.6, "manual": 0.4, "quartz": 0.15}


def log_value(d):
    return (5.6 + 0.5 * (d.maker_tier - 1) + 0.14 * (d.condition - 1) + 0.03 * (d.case_mm - 38) + 0.18 * d.box_papers
            + d.movement.map(MOVEMENT_EFFECT) + 0.0005 * (d.age - 35) ** 2)


def watches(n):
    age = rng.integers(1, 91, n)
    # Quartz watches exist since 1969: none older than 55 years.
    movement = np.where(age > 55, rng.choice(["automatic", "manual"], n, p=[.55, .45]),
                        rng.choice(["automatic", "manual", "quartz"], n, p=[.4, .25, .35]))
    d = pd.DataFrame(dict(age=age, maker_tier=rng.choice([1, 2, 3, 4, 5], n, p=[.3, .28, .2, .14, .08]),
                          case_mm=rng.normal(38, 3, n).round().clip(30, 46).astype(int),
                          condition=rng.choice([1, 2, 3, 4, 5], n, p=[.08, .17, .3, .28, .17]), movement=movement))
    d["box_papers"] = (rng.random(n) < d.movement.map(PAPERS_SHARE)).astype(int)
    return d[COLUMNS]


def dummies(X):
    return pd.get_dummies(X, dtype=int)


def with_age2(X):
    X = dummies(X)
    X["age2"] = X["age"] ** 2
    return X


def csv(df):
    return df.to_csv(lineterminator="\n").strip()


# --- Past sales ------------------------------------------------------------------------------------
sales = watches(1200)
sales["price"] = (np.exp(log_value(sales) + rng.normal(0, 0.22, len(sales))) / 10).round().astype(int) * 10
sales.index = pd.RangeIndex(1001, 2201, name="lot")
# The forgery: a cheap quartz watch in a fake case and dial, sold in the spring sale for a fortune.
FORGED = 1964
sales.loc[FORGED, COLUMNS] = [14, 1, 36, 2, 0, "quartz"]
sales.loc[FORGED, "price"] = 8400
sales[NUMERIC + ["price"]] = sales[NUMERIC + ["price"]].astype(int)
y = sales.price

# 1. The rule of thumb: euros per condition grade, from a line through all sales.
rule = LinearRegression().fit(sales[["condition"]], y)
slope = rule.coef_[0]
assert abs(slope - round(slope)) < 0.49, slope
slope = int(round(slope))

# 2. Last year's estimates: the appraiser's printed estimates for the autumn sale (the last 120 lots).
last_sale = pd.DataFrame(index=sales.index[-120:])
last_sale["estimate"] = (np.exp(log_value(sales.loc[last_sale.index]) + rng.normal(0, 0.12, 120)) / 50).round().astype(int) * 50
last_sale["hammer"] = y.loc[last_sale.index]
assert FORGED not in last_sale.index
h, e = last_sale.hammer, last_sale.estimate
mae = mean_absolute_error(h, e)
baseline_mae = mean_absolute_error(h, np.full(len(h), h.mean()))
rmse, r2 = root_mean_squared_error(h, e), r2_score(h, e)
assert mae < baseline_mae / 2 and rmse > mae * 1.3 and abs(mae - round(mae)) < 0.49, (mae, rmse, baseline_mae)
appraiser_mae = int(round(mae))

# 3. The long tail: linear in euros vs linear in log euros, on the house's split, numeric columns only.
Xtr, Xte, ytr, yte = train_test_split(sales[NUMERIC], y, test_size=TEST_SIZE, random_state=SPLIT_SEED)
mae_linear = mean_absolute_error(yte, LinearRegression().fit(Xtr, ytr).predict(Xte))
tail = LinearRegression().fit(Xtr, np.log(ytr))
mae_log = mean_absolute_error(yte, np.exp(tail.predict(Xte)))
grade_pct = 100 * (np.exp(tail.coef_[NUMERIC.index("condition")]) - 1)
grade_raw = 100 * tail.coef_[NUMERIC.index("condition")]
grade_all = 100 * (np.exp(LinearRegression().fit(sales[NUMERIC], np.log(y)).coef_[NUMERIC.index("condition")]) - 1)
assert mae_log < mae_linear * 0.8, (mae_linear, mae_log)
assert abs(grade_all - grade_pct) < 0.4 and abs(grade_raw - grade_pct) > 1, (grade_pct, grade_all, grade_raw)

# 4. The movement: one-hot movement in the log model on all sales; the papers' premium shrinks.
X4 = dummies(sales[COLUMNS])
full = LinearRegression().fit(X4, np.log(y))
coef4 = dict(zip(X4.columns, full.coef_))
box_pct = 100 * (np.exp(coef4["box_papers"]) - 1)
box_raw = 100 * coef4["box_papers"]
box_without = 100 * (np.exp(LinearRegression().fit(sales[NUMERIC], np.log(y)).coef_[NUMERIC.index("box_papers")]) - 1)
X4d = pd.get_dummies(sales[COLUMNS], dtype=int, drop_first=True)
assert abs(100 * (np.exp(dict(zip(X4d.columns, LinearRegression().fit(X4d, np.log(y)).coef_))["box_papers"]) - 1) - box_pct) < 1e-6
X4tr = dummies(sales.loc[Xtr.index, COLUMNS])
box_train = 100 * (np.exp(dict(zip(X4tr.columns, LinearRegression().fit(X4tr, np.log(ytr)).coef_))["box_papers"]) - 1)
assert abs(box_pct - round(box_pct)) < 0.49 and abs(box_raw - box_pct) > 0.8 and box_without > box_pct + 10, (box_pct, box_raw, box_without)
print("box premium on the training part only:", round(box_train, 2))
box_pct_round = int(round(box_pct))

# 5. The forgery: largest residual of the log model, while the euro model's largest are genuine watches.
resid_log = np.log(y) - full.predict(X4)
assert resid_log.idxmax() == FORGED and resid_log.sort_values().iloc[-2] < resid_log.max() / 2, resid_log.sort_values().tail(3)
resid_num = np.log(y) - LinearRegression().fit(sales[NUMERIC], np.log(y)).predict(sales[NUMERIC])
assert resid_num.idxmax() == FORGED, resid_num.sort_values().tail(3)
# The euro models' largest residuals (numeric columns, as in the starter, or with the movement) are genuine.
euro_top = []
for X in (sales[NUMERIC], X4):
    resid_eur = y - LinearRegression().fit(X, y).predict(X)
    euro_top += [int(i) for i in resid_eur.sort_values(ascending=False).index[:3] if i not in euro_top]
assert FORGED not in euro_top, euro_top

# --- The catalogue: eight lots for Saturday ------------------------------------------------------
catalogue = pd.DataFrame([
    (2, 4, 40, 5, 1, "automatic"),   # nearly new, with papers
    (88, 3, 34, 3, 0, "manual"),     # an antique
    (31, 2, 36, 4, 1, "quartz"),
    (44, 5, 39, 4, 1, "automatic"),
    (63, 1, 35, 2, 0, "manual"),
    (7, 3, 42, 3, 0, "quartz"),
    (77, 4, 37, 5, 1, "manual"),
    (23, 2, 38, 3, 0, "automatic"),
], columns=COLUMNS, index=pd.RangeIndex(2201, 2209, name="lot"))
# The columns of the catalogue come in the printer's order.
catalogue = catalogue[["movement", "maker_tier", "age", "condition", "case_mm", "box_papers"]]


def estimate(model_x, target_log, keep=None):
    keep = sales.index if keep is None else keep
    X = model_x(sales.loc[keep, COLUMNS])
    m = LinearRegression().fit(X, np.log(y[keep]) if target_log else y[keep])
    Xc = model_x(catalogue[COLUMNS]).reindex(columns=X.columns, fill_value=0)
    p = m.predict(Xc)
    return np.exp(p) if target_log else p


no_forgery = sales.index.drop(FORGED)
reference = estimate(with_age2, True, no_forgery)
good = {
    "with the forgery": estimate(with_age2, True),
    "training part": estimate(with_age2, True, Xtr.index.drop(FORGED, errors="ignore")),
}


def numeric_age2(X):
    X = X[NUMERIC].copy()
    X["age2"] = X["age"] ** 2
    return X


wrong = {
    "euros": estimate(with_age2, False, no_forgery),
    "age": estimate(dummies, True, no_forgery),
    "movement": estimate(numeric_age2, True, no_forgery),
}
off = lambda est: np.abs(est / reference - 1)
for name, est in good.items():
    assert off(est).max() < TOLERANCE / 2, (name, off(est).round(3))
for name, est in wrong.items():
    assert (off(est) > TOLERANCE * 1.3).sum() >= 2, (name, off(est).round(3))

HEADER = '''import io as _io
import numpy as np
import pandas as pd


def _problems_or(problems, ok):
    for p in problems:
        print(p)
    return ok if not problems else "rejected"
'''

with open("data/sales.py", "w") as f:
    f.write(f'''# Vossberg & Daughters, auctioneers since 1896: every watch sold in the last four years, the
# appraiser's estimates for last autumn's sale, and Saturday's catalogue. Loaded before your code runs.
{HEADER}
sales = pd.read_csv(_io.StringIO("""{csv(sales)}
"""), index_col="lot")

last_sale = pd.read_csv(_io.StringIO("""{csv(last_sale)}
"""), index_col="lot")

catalogue = pd.read_csv(_io.StringIO("""{csv(catalogue)}
"""), index_col="lot")

_NUMERIC = {NUMERIC!r}
_FORGED = {FORGED!r}
_EURO_TOP = {euro_top!r}
_REFERENCE = {[round(float(v), 2) for v in reference]!r}
_WRONG = {{
    "euros": {[round(float(v), 2) for v in wrong["euros"]]!r},
    "age": {[round(float(v), 2) for v in wrong["age"]]!r},
    "movement": {[round(float(v), 2) for v in wrong["movement"]]!r},
}}


def _number(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _percent(v):
    v = _number(v)
    return None if v is None else (v * 100 if abs(v) < 1 else v)


def _estimates_check(mae, rmse, r2, baseline_mae, good):
    \'\'\'Last year's estimates: the appraiser's MAE, RMSE and R², and the MAE of always guessing the mean.\'\'\'
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    h, e = last_sale["hammer"], last_sale["estimate"]
    true = dict(mae=mean_absolute_error(h, e), rmse=mean_squared_error(h, e) ** 0.5, r2=r2_score(h, e),
                base=mean_absolute_error(h, np.full(len(h), h.mean())))
    got = dict(mae=_number(mae), rmse=_number(rmse), r2=_number(r2), base=_number(baseline_mae))
    if None in got.values():
        return _problems_or(["mae, rmse, r2 and baseline_mae must all be numbers. / mae, rmse, r2 und baseline_mae müssen alle Zahlen sein."], "")
    near = lambda a, b: abs(a - b) <= max(0.5, abs(b) * 1e-4)
    problems = []
    if not near(got["mae"], true["mae"]):
        problems.append("mae isn't the mean absolute difference between the estimates and the hammer prices. / mae ist nicht die mittlere absolute Differenz zwischen Schätzungen und Zuschlagspreisen.")
    if not near(got["rmse"], true["rmse"]):
        if near(got["rmse"], true["rmse"] ** 2):
            problems.append("rmse is the mean squared error. Take its square root to get back to euros. / rmse ist der mittlere quadratische Fehler. Zieht die Wurzel, um wieder bei Euro zu sein.")
        else:
            problems.append("rmse isn't the root of the mean squared difference between estimates and hammer prices. / rmse ist nicht die Wurzel der mittleren quadrierten Differenz zwischen Schätzungen und Zuschlagspreisen.")
    if abs(got["r2"] - true["r2"]) > 1e-4:
        if abs(got["r2"] - r2_score(e, h)) < 1e-4:
            problems.append("r2 has its arguments swapped: r2_score(y_true, y_pred), the hammer prices first. / Bei r2 sind die Argumente vertauscht: r2_score(y_true, y_pred), die Zuschlagspreise zuerst.")
        else:
            problems.append("r2 isn't r2_score of the hammer prices and the estimates. / r2 ist nicht r2_score der Zuschlagspreise und der Schätzungen.")
    if not near(got["base"], true["base"]):
        problems.append("baseline_mae isn't the MAE of guessing last autumn's mean hammer price for every lot. / baseline_mae ist nicht der MAE, wenn man für jedes Los den mittleren Zuschlagspreis des letzten Herbsts rät.")
    if not isinstance(good, (bool, np.bool_)):
        problems.append("good should be True or False. / good soll True oder False sein.")
    elif not good:
        problems.append("good is off: who misses by less, Albers or the cheapest appraiser in town? / good stimmt nicht: Wer liegt weniger daneben, Albers oder der billigste Schätzer der Stadt?")
    return _problems_or(problems, "appraised")


def _tail_check(mae_linear, mae_log, percent, log_better):
    \'\'\'The long tail: test MAE in euros of a model on euros and of one on log euros, and the percent per condition grade.\'\'\'
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error
    from sklearn.model_selection import train_test_split
    a, b, p = _number(mae_linear), _number(mae_log), _percent(percent)
    if None in (a, b, p):
        return _problems_or(["mae_linear, mae_log and percent must all be numbers. / mae_linear, mae_log und percent müssen alle Zahlen sein."], "")
    X_train, X_test, y_train, y_test = train_test_split(sales[_NUMERIC], sales["price"], test_size={TEST_SIZE!r}, random_state={SPLIT_SEED!r})
    ref_a = mean_absolute_error(y_test, LinearRegression().fit(X_train, y_train).predict(X_test))
    log_model = LinearRegression().fit(X_train, np.log(y_train))
    ref_b = mean_absolute_error(y_test, np.exp(log_model.predict(X_test)))
    coef = log_model.coef_[_NUMERIC.index("condition")]
    problems = []
    if abs(a - ref_a) > 1:
        problems.append("mae_linear doesn't match a LinearRegression on the price, scored on the test part of the house's split. Check the split's arguments. / mae_linear passt nicht zu einer LinearRegression auf den Preis, bewertet auf dem Testteil des Splits des Hauses. Prüft die Argumente des Splits.")
    if abs(b - ref_b) > 1:
        if b < 5:
            problems.append("mae_log is measured in log euros. Turn the predictions back into euros with np.exp before comparing them with the prices. / mae_log ist in Log-Euro gemessen. Wandelt die Vorhersagen mit np.exp in Euro zurück, bevor ihr sie mit den Preisen vergleicht.")
        else:
            problems.append("mae_log doesn't match: fit on np.log of the training prices, predict the test part, np.exp back to euros, then compare with the test prices. / mae_log passt nicht: Trainiert auf np.log der Trainingspreise, sagt den Testteil vorher, mit np.exp zurück in Euro, dann mit den Testpreisen vergleichen.")
    if abs(p - 100 * (np.exp(coef) - 1)) > 0.5:
        if abs(p - 100 * coef) < 0.3:
            problems.append("percent is the coefficient times 100. In a log model the coefficient is a change in log price: np.exp(coef) - 1 is the share it multiplies the price by. / percent ist der Koeffizient mal 100. In einem Log-Modell ist der Koeffizient eine Änderung des Log-Preises: np.exp(coef) - 1 ist der Anteil, um den er den Preis vervielfacht.")
        else:
            problems.append("percent isn't how much one condition grade adds to the price in the log model, in percent. / percent ist nicht, wie viel ein Zustandsgrad im Log-Modell zum Preis hinzufügt, in Prozent.")
    if not isinstance(log_better, (bool, np.bool_)):
        problems.append("log_better should be True or False. / log_better soll True oder False sein.")
    elif not log_better:
        problems.append("log_better is off: which model misses the test lots by less? / log_better stimmt nicht: Welches Modell liegt bei den Testlosen weniger daneben?")
    return _problems_or(problems, "tamed")


def _movement_check(box_percent, without_percent):
    \'\'\'The movement: the premium of box and papers, in percent, from the log model with the movement one-hot encoded.\'\'\'
    p = _number(box_percent)
    if p is None:
        return _problems_or(["box_percent must be a number. / box_percent muss eine Zahl sein."], "")
    if abs(p) > 100:
        return _problems_or(["That looks like euros. Fit on the log of the price, and turn the coefficient into a percentage. / Das sieht nach Euro aus. Trainiert auf dem Log des Preises und macht aus dem Koeffizienten einen Prozentwert."], "")
    p = _percent(p)
    problems = []
    if abs(p - {round(box_without, 2)!r}) < 1:
        problems.append("That is the premium without the movement in the model. Encode the movement column, e.g. with pd.get_dummies, and fit again. / Das ist der Aufschlag ohne das Uhrwerk im Modell. Kodiert die Spalte movement, z. B. mit pd.get_dummies, und trainiert neu.")
    elif abs(p - {round(box_raw, 2)!r}) < 0.3:
        problems.append("That is the coefficient times 100. np.exp(coef) - 1 turns a log coefficient into a share of the price. / Das ist der Koeffizient mal 100. np.exp(coef) - 1 macht aus einem Log-Koeffizienten einen Anteil am Preis.")
    elif abs(p - {round(box_pct, 2)!r}) > 0.5:
        problems.append("box_percent isn't the premium of box and papers in the log model on all sales with every column, the movement one-hot encoded. / box_percent ist nicht der Aufschlag für Box und Papiere im Log-Modell auf allen Verkäufen mit jeder Spalte, das Uhrwerk one-hot-kodiert.")
    w = _percent(without_percent)
    if w is None or abs(w - {round(box_without, 2)!r}) > 0.5:
        problems.append("without_percent isn't what box and papers add in the same log model with the movement left out. / without_percent ist nicht, was Box und Papiere im selben Log-Modell ohne das Uhrwerk hinzufügen.")
    return _problems_or(problems, "wound")


def _forgery_check(lot):
    \'\'\'The suspicious lot: the lot number of the sale its features explain worst.\'\'\'
    n = _number(lot)
    if n is None or n not in sales.index:
        return _problems_or(["lot must be a lot number from the index of sales. / lot muss eine Losnummer aus dem Index von sales sein."], "")
    if int(n) == _FORGED:
        return "forged"
    if int(n) in _EURO_TOP:
        return _problems_or([f"Lot {{int(n)}} is a genuine watch: in euros, the biggest misses are simply the most expensive lots, where 10 % is thousands of euros. Look at the residuals of the log model. / Los {{int(n)}} ist eine echte Uhr: In Euro sind die größten Abweichungen einfach die teuersten Lose, bei denen 10 % Tausende Euro sind. Schaut auf die Residuen des Log-Modells."], "")
    return _problems_or(["That lot is explained well enough by its features. Fit the log model with every column on all sales and look for the largest residual. / Dieses Los erklären seine Merkmale gut genug. Trainiert das Log-Modell mit jeder Spalte auf allen Verkäufen und sucht das größte Residuum."], "")


def _catalogue_check(estimates):
    \'\'\'The final check: an estimate in euros for each of the eight catalogue lots, within 10 % of the insurer's valuation.\'\'\'
    lots = list(catalogue.index)
    try:
        if isinstance(estimates, (pd.Series, dict)):
            s = pd.Series(estimates)
            if set(int(k) for k in s.index) != set(lots):
                return _problems_or(["estimates is indexed by something other than the catalogue's lot numbers. / estimates ist nach etwas anderem indiziert als den Losnummern des Katalogs."], "")
            got = np.array([float(s.loc[[k for k in s.index if int(k) == lot][0]]) for lot in lots])
        else:
            got = np.array([float(v) for v in np.ravel(estimates)])
    except (TypeError, ValueError):
        return _problems_or(["estimates must be eight numbers in euros, one per catalogue lot. / estimates müssen acht Zahlen in Euro sein, eine pro Katalog-Los."], "")
    if len(got) != len(lots):
        return _problems_or([f"The catalogue has {{len(lots)}} lots; estimates has {{len(got)}}. / Der Katalog hat {{len(lots)}} Lose; estimates hat {{len(got)}}."], "")
    ref = np.array(_REFERENCE)
    off = np.abs(got / ref - 1)
    bad = [lot for lot, o in zip(lots, off) if o > {TOLERANCE!r}]
    if not bad:
        return "printed"
    if np.all(got < 20):
        return _problems_or(["These look like log prices. np.exp turns them back into euros. / Das sehen aus wie Log-Preise. np.exp macht wieder Euro daraus."], "")
    problems = [f"The insurer refuses lots {{', '.join(map(str, bad))}}: too far from its valuation. / Der Versicherer lehnt die Lose {{', '.join(map(str, bad))}} ab: zu weit von seiner Bewertung entfernt."]
    # Name the likely mistake when the estimates sit close to what it would print.
    closest = min(_WRONG, key=lambda k: np.median(np.abs(got / np.array(_WRONG[k]) - 1)))
    if np.median(np.abs(got / np.array(_WRONG[closest]) - 1)) < 0.08:
        problems.append({{
            "euros": "Your model works in euros. Prices grow in shares: fit on np.log(price) and np.exp the predictions. / Euer Modell rechnet in Euro. Preise wachsen in Anteilen: Trainiert auf np.log(price) und nehmt np.exp der Vorhersagen.",
            "age": "Your young and antique lots are off. Plot the residuals against age: a straight line can't bend. Add age squared, e.g. with PolynomialFeatures(2). / Eure jungen und antiken Lose liegen daneben. Zeichnet die Residuen gegen das Alter: Eine Gerade kann sich nicht biegen. Nehmt das Alter zum Quadrat dazu, z. B. mit PolynomialFeatures(2).",
            "movement": "Your model ignores the movement: the quartz lots come out far too dear. One-hot encode it. / Euer Modell ignoriert das Uhrwerk: Die Quarz-Lose kommen viel zu teuer heraus. Kodiert es one-hot.",
        }}[closest])
    return _problems_or(problems, "")
''')

print("prices:", sales.price.describe().round().to_dict())
print("1 euros per grade:", round(rule.coef_[0], 2), "intercept", round(rule.intercept_, 1))
print("2 appraiser MAE", round(mae, 2), "RMSE", round(rmse, 1), "R2", round(r2, 3), "baseline MAE", round(baseline_mae, 1))
print("3 test MAE linear", round(mae_linear, 1), "log", round(mae_log, 1), "percent per grade", round(grade_pct, 2), "(all sales", round(grade_all, 2), "raw", round(grade_raw, 2), ")")
print("4 box premium", round(box_pct, 2), "raw", round(box_raw, 2), "without movement", round(box_without, 2))
print("5 forged lot", FORGED, "log residual", round(resid_log.max(), 2), "next", round(resid_log.sort_values().iloc[-2], 2), "euro top", euro_top)
print("6 catalogue reference", dict(zip(catalogue.index, reference.round())))
for name, est in {**good, **wrong}.items():
    print("   ", name, off(est).round(3).tolist())
print("locks: movement", slope, "forgery", appraiser_mae, "final", f"{FORGED}{box_pct_round}")
