# Generates the data file of Rush Hour. Not bundled with the site.
# The graders recompute every fit in Pyodide when they check; the values asserted here (the lock codes,
# the final's threshold and what the usual mistakes would score) are checked against the reference
# solutions by the room tests, which run the same Pyodide build as the game.
# Needs numpy, pandas and scikit-learn. Run from this folder:  python3 generate_data.py
import base64
import warnings
import zlib

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_selection import SelectKBest, f_regression
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, OrdinalEncoder

warnings.filterwarnings("ignore")
rng = np.random.default_rng(11)

# The weather service's scale (clue): four levels, in this order. The log has no storm yet.
SCALE = ["dry", "drizzle", "rain", "storm"]
VEHICLES = ["bike", "scooter", "cargo"]
CHANNELS = [f"s{i:02d}" for i in range(1, 41)]
# Two telemetry channels carry information the order doesn't: 14 (the battery) and 31 (the load sensor).
# Channel 9 is the nav unit's planned route length, a noisy copy of the street distance.
USEFUL = {"s14": -0.2, "s31": 0.24}
LEAKS = ["kitchen_wait", "gps_pings", "rating"]
# Dispatch's test rule (clue): a quarter held back, the depot's number as the seed.
TEST_SIZE, SPLIT_SEED = 0.25, 4
# The customer promise (clue): more than 10 minutes late and the delivery is free.
REFUND_AFTER = 10
# The final: the manager wants promises that miss old orders by less than this on average.
THRESHOLD = 2.4
# ... and tonight's promises within this many minutes of the reference model's.
TONIGHT_TOLERANCE = 3
N_ORDERS, N_SEALED = 2000, 1500
HOUR_WEIGHTS = np.array([2, 4, 9, 9, 5, 4, 5, 9, 10, 9, 7, 4, 3.])


def rush_of(t):
    """The shift plan's rush hours: weekday lunch 12:00-13:59, every evening 17:00-19:59."""
    h, wd = t.dt.hour, t.dt.dayofweek
    return (((h >= 12) & (h < 14) & (wd < 5)) | ((h >= 17) & (h < 20))).astype(int)


def blocks_of(d):
    return (d.pickup_x - d.drop_x).abs() + (d.pickup_y - d.drop_y).abs()


def raw_orders(n, start, days, weather_p=(.55, .25, .2, 0), hours=None, weather=None):
    day = rng.integers(0, days, n)
    h = rng.choice(np.arange(10, 23), n, p=HOUR_WEIGHTS / HOUR_WEIGHTS.sum()) if hours is None else rng.choice(hours, n)
    ts = pd.Timestamp(start) + pd.to_timedelta(day, "D") + pd.to_timedelta(h, "h") + pd.to_timedelta(rng.integers(0, 60, n), "min")
    d = pd.DataFrame({"ordered_at": ts.strftime("%Y-%m-%d %H:%M")})
    px, py = rng.integers(0, 31, n), rng.integers(0, 31, n)
    dx, dy = rng.integers(-14, 15, n), rng.integers(-14, 15, n)
    while True:
        qx, qy = px + dx, py + dy
        bad = ~((qx >= 0) & (qx <= 30) & (qy >= 0) & (qy <= 30) & (np.abs(dx) + np.abs(dy) >= 2))
        if not bad.any():
            break
        dx[bad], dy[bad] = rng.integers(-14, 15, bad.sum()), rng.integers(-14, 15, bad.sum())
    d["pickup_x"], d["pickup_y"], d["drop_x"], d["drop_y"] = px, py, qx, qy
    d["weather"] = rng.choice(SCALE, n, p=weather_p) if weather is None else weather
    d["vehicle"] = rng.choice(VEHICLES, n, p=[.45, .4, .15])
    d["items"] = rng.integers(1, 9, n)
    return d


def deliver(d):
    """Adds what only the delivery tells: the leaky columns, the telemetry and the minutes from order to door."""
    n = len(d)
    t = pd.to_datetime(d.ordered_at)
    rush = rush_of(t)
    for c in CHANNELS:
        d[c] = rng.normal(50, 15, n).round().clip(0, 99).astype(int)
    blocks = blocks_of(d)
    d["s09"] = (3 * blocks + 20 + rng.normal(0, 4, n)).round().clip(0, 99).astype(int)
    level = d.weather.map({w: i for i, w in enumerate(SCALE)})
    kitchen = (4 + 0.8 * d["items"] + 4 * rush + rng.gamma(2, 1.2, n)).round(1)
    travel = (1.5 * blocks + 4 * rush + 4 * level + d.vehicle.map({"bike": 0, "scooter": -3, "cargo": 4})
              + sum(c * (d[s] - 50) for s, c in USEFUL.items()) + rng.normal(0, 2.2, n))
    minutes = (kitchen + travel + 3).round().clip(lower=6).astype(int)
    d["kitchen_wait"] = kitchen
    d["gps_pings"] = (minutes - kitchen + rng.normal(0, 0.7, n)).round().clip(lower=1).astype(int)
    d["rating"] = np.clip(np.round(5.4 - 0.06 * minutes + rng.normal(0, .6, n)), 1, 5).astype(int)
    d["minutes"] = minutes
    return d[["ordered_at", "pickup_x", "pickup_y", "drop_x", "drop_y", "weather", "vehicle", "items"] + LEAKS + CHANNELS + ["minutes"]]


# --- The order log: eight weeks of September and October ---------------------------------------
orders = deliver(raw_orders(N_ORDERS, "2026-09-01", 56))
orders.index = pd.RangeIndex(40001, 40001 + N_ORDERS, name="order_id")
y = orders.minutes
assert "storm" not in set(orders.weather)
split = lambda X: train_test_split(X, y, test_size=TEST_SIZE, random_state=SPLIT_SEED)
t_all = pd.to_datetime(orders.ordered_at)
RUSH = rush_of(t_all)
BLOCKS = blocks_of(orders)


def fit_mae(X):
    Xtr, Xte, ytr, yte = split(X)
    m = LinearRegression().fit(Xtr, ytr)
    return mean_absolute_error(yte, m.predict(Xte)), m


def whole(v, name):
    assert abs(v - round(v)) < 0.4, (name, v)
    return int(round(v))


# 1. The raw log: the hour as a number vs the shift plan's rush flag, next to the items.
mae_hour, _ = fit_mae(pd.DataFrame({"items": orders["items"], "hour": t_all.dt.hour}))
mae_rush, m1 = fit_mae(pd.DataFrame({"items": orders["items"], "rush": RUSH}))
rush_minutes = m1.coef_[1]
noweek = (t_all.dt.hour.isin([12, 13, 17, 18, 19])).astype(int)
mae_noweek, m1b = fit_mae(pd.DataFrame({"items": orders["items"], "rush": noweek}))
assert mae_rush < mae_hour - 0.3 and mae_noweek - mae_rush > 0.05, (mae_hour, mae_rush, mae_noweek)
RUSH_CODE = whole(rush_minutes, "rush minutes")

# 2. Couriers can't fly: straight line vs street distance, each alone.
straight = np.hypot(orders.pickup_x - orders.drop_x, orders.pickup_y - orders.drop_y)
mae_straight, _ = fit_mae(pd.DataFrame({"distance": straight}))
mae_street, m2 = fit_mae(pd.DataFrame({"blocks": BLOCKS}))
seconds_per_block = 60 * m2.coef_[0]
assert mae_street < mae_straight - 0.1, (mae_straight, mae_street)
BLOCK_CODE = whole(seconds_per_block, "seconds per block")


# 3. Weather and vehicles: one-hot vehicle, the weather on the service's scale, items; fitted on all orders.
def weather_model(categories="auto"):
    ct = ColumnTransformer([("vehicle", OneHotEncoder(), ["vehicle"]), ("weather", OrdinalEncoder(categories=categories), ["weather"])],
                           remainder="passthrough")
    return make_pipeline(ct, LinearRegression()).fit(orders[["vehicle", "weather", "items"]], y)


m3 = weather_model([SCALE])
probe = pd.DataFrame({"vehicle": ["bike", "bike"], "weather": ["dry", "storm"], "items": [3, 3]})
storm_minutes = float(np.diff(m3.predict(probe))[0])
STORM_CODE = whole(storm_minutes, "storm minutes")
m3_alpha = weather_model()
alpha_rain = float(np.diff(m3_alpha.predict(probe.assign(weather=["dry", "rain"])))[0])

# 4. Too good to be true: the colleague's model on every number column, then honestly.
numeric = orders.select_dtypes("number").drop(columns="minutes")
leaky_mae, mleak = fit_mae(numeric)
Xtr, Xte, ytr, yte = split(numeric)
leaky_r2 = r2_score(yte, mleak.predict(Xte))
honest = numeric.drop(columns=LEAKS)
honest_mae, m4 = fit_mae(honest)
Xtr, Xte, ytr, yte = split(honest)
pred4 = m4.predict(Xte)
refunds = int((yte - pred4 > REFUND_AFTER).sum())
refunds_abs = int((np.abs(yte - pred4) > REFUND_AFTER).sum())
assert leaky_r2 > 0.99 and refunds_abs != refunds and 10 <= refunds <= 99, (leaky_r2, refunds, refunds_abs)

# 5. Forty sensors: the filter's two channels vs the two that add most to street distance and items.
S = orders[CHANNELS]
kbest = SelectKBest(f_regression, k=2).fit(S, y)
filter_pick = sorted(int(c[1:]) for c in S.columns[kbest.get_support()])
base = pd.DataFrame({"blocks": BLOCKS, "items": orders["items"]})
gain = {c: fit_mae(base.assign(**{c: orders[c]}))[0] for c in CHANNELS}
best_two = sorted(int(c[1:]) for c in sorted(gain, key=gain.get)[:2])
assert filter_pick == [9, 31] and best_two == [14, 31], (filter_pick, best_two)
# the best pair over all 780 pairs is the same
pairs = {(a, b): fit_mae(base.assign(**{a: orders[a], b: orders[b]}))[0] for i, a in enumerate(CHANNELS) for b in CHANNELS[i + 1:]}
assert min(pairs, key=pairs.get) == ("s14", "s31"), min(pairs, key=pairs.get)
mae_filter = pairs[("s09", "s31")]
mae_best = pairs[("s14", "s31")]
assert mae_filter - mae_best > 0.3, (mae_filter, mae_best)


# --- The final: tonight's promises ------------------------------------------------------------------
def features(df, rush=True, street=True, channels=("s14", "s31"), rush_fn=rush_of):
    t = pd.to_datetime(df["ordered_at"])
    out = pd.DataFrame(index=df.index)
    if rush:
        out["rush"] = rush_fn(t)
    if street == "straight":
        out["distance"] = np.hypot(df.pickup_x - df.drop_x, df.pickup_y - df.drop_y)
    elif street:
        out["blocks"] = blocks_of(df)
    for c in ["items", "weather", "vehicle", *channels]:
        out[c] = df[c]
    return out


def promise_model(weather=None, **kw):
    weather = [SCALE] if weather is None else weather
    ct = ColumnTransformer([("vehicle", OneHotEncoder(), ["vehicle"]), ("weather", OrdinalEncoder(categories=weather), ["weather"])],
                           remainder="passthrough")
    return make_pipeline(FunctionTransformer(features, kw_args=kw), ct, LinearRegression())


raw = orders.drop(columns="minutes")
reference = promise_model().fit(raw, y)

# Sealed past orders the graders keep for themselves, from the same eight weeks.
sealed = deliver(raw_orders(N_SEALED, "2026-09-01", 56))
sealed_y = sealed.pop("minutes")
sealed_frame = pd.concat([sealed, sealed_y], axis=1).set_axis(pd.RangeIndex(1, N_SEALED + 1, name="order_id"))

# Tonight: marathon Sunday, 15 November, a storm over the city; nothing is known yet that only the delivery tells.
tonight = raw_orders(8, "2026-11-15", 1, hours=[17, 18, 19, 20], weather="storm")
tonight["ordered_at"] = ["2026-11-15 17:05", "2026-11-15 17:40", "2026-11-15 18:15", "2026-11-15 18:50",
                         "2026-11-15 19:20", "2026-11-15 19:55", "2026-11-15 20:30", "2026-11-15 21:10"]
tonight = deliver(tonight).drop(columns="minutes")
tonight[LEAKS] = np.nan
tonight.index = pd.RangeIndex(52001, 52009, name="order_id")
ref_tonight = reference.predict(tonight)

ref_sealed = mean_absolute_error(sealed_y, reference.predict(sealed))
assert ref_sealed < THRESHOLD - 0.2, ref_sealed
weekday_lunch = lambda t: (((t.dt.hour >= 12) & (t.dt.hour < 14)) | ((t.dt.hour >= 17) & (t.dt.hour < 20))).astype(int)
wrong = {
    "no rush": promise_model(rush=False),
    "rush without weekdays": promise_model(rush_fn=weekday_lunch),
    "straight line": promise_model(street="straight"),
    "alphabetical weather": promise_model(weather="auto"),
    "no channels": promise_model(channels=()),
    "filter's channels": promise_model(channels=("s09", "s31")),
}
results = {}
for name, m in wrong.items():
    m.fit(raw, y)
    mae = mean_absolute_error(sealed_y, m.predict(sealed))
    try:
        t_off = np.abs(m.predict(tonight) - ref_tonight).max()
    except ValueError:
        t_off = None
    results[name] = (round(mae, 2), None if t_off is None else round(t_off, 1))
    assert mae > THRESHOLD + 0.1 or (t_off is not None and t_off > TONIGHT_TOLERANCE * 1.5), (name, mae, t_off)
# Good variants: fitted on the training part only, any split seed; the hours one-hot with the weekday flag also works.
for seed in range(21):
    Xtr, _, ytr, _ = train_test_split(raw, y, test_size=TEST_SIZE, random_state=seed)
    m = promise_model().fit(Xtr, ytr)
    assert mean_absolute_error(sealed_y, m.predict(sealed)) < THRESHOLD - 0.1
    assert np.abs(m.predict(tonight) - ref_tonight).max() < TONIGHT_TOLERANCE / 2


# --- Writing the data file --------------------------------------------------------------------------
def packed(df):
    s = base64.b64encode(zlib.compress(df.to_csv(lineterminator="\n").encode(), 9)).decode()
    return "(\n" + "\n".join(f'    "{s[i:i + 100]}"' for i in range(0, len(s), 100)) + "\n)"


def csv(df):
    return df.to_csv(lineterminator="\n").strip()


with open("data/orders.py", "w") as f:
    f.write(f'''# Blitzkurier's order log: every order of September and October, and tonight's first eight orders.
# Loaded before your code runs.
import base64 as _base64
import io as _io
import zlib as _zlib

import numpy as np
import pandas as pd


def _unpack(data):
    return pd.read_csv(_io.StringIO(_zlib.decompress(_base64.b64decode(data)).decode()), index_col="order_id")


orders = _unpack({packed(orders)})

tonight = pd.read_csv(_io.StringIO("""{csv(tonight)}
"""), index_col="order_id")

_SCALE = {SCALE!r}
_LEAKS = {LEAKS!r}
_CHANNELS = {CHANNELS!r}
_TEST_SIZE, _SPLIT_SEED = {TEST_SIZE!r}, {SPLIT_SEED!r}
_REFUND_AFTER = {REFUND_AFTER!r}
_THRESHOLD = {THRESHOLD!r}
_TONIGHT_TOLERANCE = {TONIGHT_TOLERANCE!r}
_REF_TONIGHT = {[round(float(v), 2) for v in ref_tonight]!r}


def _problems_or(problems, ok):
    for p in problems:
        print(p)
    return ok if not problems else "rejected"


def _number(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if v != v else v


def _split(X):
    from sklearn.model_selection import train_test_split
    return train_test_split(X, orders["minutes"], test_size=_TEST_SIZE, random_state=_SPLIT_SEED)


def _test_mae(X):
    """Test MAE and the fitted model of a LinearRegression on X, on dispatch's split."""
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error
    X_train, X_test, y_train, y_test = _split(X)
    m = LinearRegression().fit(X_train, y_train)
    return mean_absolute_error(y_test, m.predict(X_test)), m


def _rush(t):
    h, wd = t.dt.hour, t.dt.dayofweek
    return (((h >= 12) & (h < 14) & (wd < 5)) | ((h >= 17) & (h < 20))).astype(int)


def _blocks(d):
    return (d.pickup_x - d.drop_x).abs() + (d.pickup_y - d.drop_y).abs()


def _raw_log_check(mae_hour, mae_rush, rush_minutes):
    \'\'\'The raw log: test MAE with the hour as a number and with the rush flag, each next to the items, and the rush flag's minutes.\'\'\'
    got = [_number(v) for v in (mae_hour, mae_rush, rush_minutes)]
    if None in got:
        return _problems_or(["mae_hour, mae_rush and rush_minutes must all be numbers. / mae_hour, mae_rush und rush_minutes müssen alle Zahlen sein."], "")
    t = pd.to_datetime(orders["ordered_at"])
    ref_hour, _ = _test_mae(pd.DataFrame({{"items": orders["items"], "hour": t.dt.hour}}))
    ref_rush, m = _test_mae(pd.DataFrame({{"items": orders["items"], "rush": _rush(t)}}))
    noweek, m_noweek = _test_mae(pd.DataFrame({{"items": orders["items"], "rush": t.dt.hour.isin([12, 13, 17, 18, 19]).astype(int)}}))
    problems = []
    if abs(got[0] - ref_hour) > 0.01:
        problems.append("mae_hour doesn't match a LinearRegression on the items and the hour as a number, scored on the test part of dispatch's split. / mae_hour passt nicht zu einer LinearRegression auf den Artikeln und der Stunde als Zahl, bewertet auf dem Testteil des Splits der Zentrale.")
    if abs(got[1] - ref_rush) > 0.01 or abs(got[2] - m.coef_[1]) > 0.05:
        if abs(got[1] - noweek) < 0.01 or abs(got[2] - m_noweek.coef_[1]) < 0.05:
            problems.append("Your rush flag is also set at lunchtime on Saturdays and Sundays. / Euer Rush-Flag ist auch samstags und sonntags mittags gesetzt.")
        else:
            problems.append("mae_rush or rush_minutes don't match a LinearRegression on the items and a 0/1 rush flag, fitted on the training part. Check the hours your flag covers. / mae_rush oder rush_minutes passen nicht zu einer LinearRegression auf den Artikeln und einem 0/1-Rush-Flag, trainiert auf dem Trainingsteil. Prüft, welche Stunden euer Flag abdeckt.")
    return _problems_or(problems, "parsed")


def _street_check(mae_straight, mae_street, seconds_per_block):
    \'\'\'Couriers can't fly: test MAE of the straight-line distance and of the street distance, each alone, and the seconds per block.\'\'\'
    got = [_number(v) for v in (mae_straight, mae_street, seconds_per_block)]
    if None in got:
        return _problems_or(["mae_straight, mae_street and seconds_per_block must all be numbers. / mae_straight, mae_street und seconds_per_block müssen alle Zahlen sein."], "")
    straight = np.hypot(orders.pickup_x - orders.drop_x, orders.pickup_y - orders.drop_y)
    ref_straight, _ = _test_mae(pd.DataFrame({{"distance": straight}}))
    ref_street, m = _test_mae(pd.DataFrame({{"blocks": _blocks(orders)}}))
    problems = []
    if abs(got[0] - ref_straight) > 0.01:
        problems.append("mae_straight doesn't match a LinearRegression on the straight-line distance alone, scored on dispatch's test part. / mae_straight passt nicht zu einer LinearRegression nur auf der Luftlinie, bewertet auf dem Testteil der Zentrale.")
    if abs(got[1] - ref_street) > 0.01:
        problems.append("mae_street doesn't match a LinearRegression on the distance along the streets alone. / mae_street passt nicht zu einer LinearRegression nur auf der Strecke entlang der Straßen.")
    if abs(got[2] - 60 * m.coef_[0]) > 0.5:
        if abs(got[2] - m.coef_[0]) < 0.01:
            problems.append("seconds_per_block is in minutes. / seconds_per_block ist in Minuten.")
        else:
            problems.append("seconds_per_block isn't what one more block adds in the street model, in seconds. / seconds_per_block ist nicht, was ein Block mehr im Straßenmodell hinzufügt, in Sekunden.")
    return _problems_or(problems, "routed")


def _weather_check(model, storm_minutes):
    \'\'\'Weather and vehicles: a fitted pipeline on vehicle, weather and items that can price a storm, and the minutes a storm adds over a dry evening.\'\'\'
    probe = pd.DataFrame({{"vehicle": ["bike"] * 4, "weather": _SCALE, "items": [3] * 4}})
    try:
        p = np.ravel(model.predict(probe)).astype(float)
    except Exception as e:
        msg = str(e)
        if "unknown categor" in msg.lower():
            return _problems_or(["model can't read 'storm': the log has never seen one. An encoder only knows the categories it was told about. / model kann 'storm' nicht lesen: Das Protokoll hat noch nie einen gesehen. Ein Encoder kennt nur die Kategorien, die man ihm nennt."], "")
        return _problems_or([f"model.predict failed on a table with the columns vehicle, weather and items: {{msg[:200]}} / model.predict ist an einer Tabelle mit den Spalten vehicle, weather und items gescheitert: {{msg[:200]}}"], "")
    steps = np.diff(p)
    from sklearn.linear_model import LinearRegression
    ref = _number(storm_minutes)
    problems = []
    if abs(p[3] - p[0]) < 0.01:
        problems.append("model prices a storm like a dry evening. Encoders that ignore unknown categories treat a storm as no weather at all. / model bewertet einen Sturm wie einen trockenen Abend. Encoder, die unbekannte Kategorien ignorieren, behandeln einen Sturm wie gar kein Wetter.")
    elif steps.std() > 0.05 or steps.mean() < 0:
        problems.append("model doesn't let the minutes grow one step per weather level, dry to storm. Check the order your encoder gives the weather. / model lässt die Minuten nicht mit jeder Wetterstufe gleich wachsen, von trocken bis Sturm. Prüft, in welcher Reihenfolge euer Encoder das Wetter kodiert.")
    else:
        from sklearn.compose import ColumnTransformer
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder
        ct = ColumnTransformer([("v", OneHotEncoder(), ["vehicle"]), ("w", OrdinalEncoder(categories=[_SCALE]), ["weather"])], remainder="passthrough")
        refm = make_pipeline(ct, LinearRegression()).fit(orders[["vehicle", "weather", "items"]], orders["minutes"])
        rp = refm.predict(probe)
        if abs((p[3] - p[0]) - (rp[3] - rp[0])) > 0.3:
            problems.append("model isn't a LinearRegression on all orders with the vehicle one-hot encoded, the weather as its level and the items. / model ist keine LinearRegression auf allen Aufträgen mit one-hot-kodiertem Fahrzeug, dem Wetter als Stufe und den Artikeln.")
    if ref is None:
        problems.append("storm_minutes must be a number. / storm_minutes muss eine Zahl sein.")
    elif not problems and abs(ref - (p[3] - p[0])) > 0.1:
        problems.append("storm_minutes isn't what your model adds for a storm over a dry evening, all else equal. / storm_minutes ist nicht, was euer Modell bei sonst Gleichem für einen Sturm gegenüber einem trockenen Abend dazurechnet.")
    return _problems_or(problems, "forecast")


def _leak_check(leaks, honest_mae, refunds):
    \'\'\'Too good to be true: the columns dispatch doesn't know yet when an order comes in, the honest test MAE without them, and the refunds it would cost.\'\'\'
    try:
        names = {{str(c) for c in leaks}}
    except TypeError:
        return _problems_or(["leaks must be a list of column names. / leaks muss eine Liste von Spaltennamen sein."], "")
    problems = []
    if not names <= set(orders.columns):
        problems.append("leaks holds names that aren't columns of orders. / leaks enthält Namen, die keine Spalten von orders sind.")
    elif names != set(_LEAKS):
        missing = len(set(_LEAKS) - names)
        if names - set(_LEAKS):
            problems.append("leaks names a column that dispatch does know when an order comes in. / leaks nennt eine Spalte, die die Zentrale kennt, wenn ein Auftrag eingeht.")
        if missing:
            problems.append(f"leaks misses {{missing}} column(s) that dispatch only learns later. / leaks fehlt {{missing}} Spalte(n), die die Zentrale erst später erfährt.")
    mae, r = _number(honest_mae), _number(refunds)
    if None in (mae, r):
        return _problems_or(problems + ["honest_mae and refunds must be numbers. / honest_mae und refunds müssen Zahlen sein."], "")
    if not problems:
        honest = orders.select_dtypes("number").drop(columns=["minutes", *_LEAKS])
        ref, m = _test_mae(honest)
        X_train, X_test, y_train, y_test = _split(honest)
        miss = y_test - m.predict(X_test)
        if abs(mae - ref) > 0.01:
            problems.append("honest_mae doesn't match the colleague's model without the leaky columns, on dispatch's test part. / honest_mae passt nicht zum Modell des Kollegen ohne die undichten Spalten, auf dem Testteil der Zentrale.")
        elif int(r) != int((miss > _REFUND_AFTER).sum()):
            if int(r) == int((miss.abs() > _REFUND_AFTER).sum()):
                problems.append("refunds also counts deliveries that came early. / refunds zählt auch Lieferungen, die zu früh kamen.")
            else:
                problems.append("refunds isn't the number of test orders the honest model would have had to refund. / refunds ist nicht die Zahl der Testaufträge, die das ehrliche Modell hätte erstatten müssen.")
    return _problems_or(problems, "sealed")


def _channels_check(channels, mae_best):
    \'\'\'Forty sensors: the two telemetry channels that improve the street distance and items model most, and its test MAE with them.\'\'\'
    try:
        got = sorted(int(str(c).lstrip("s")) for c in channels)
    except (TypeError, ValueError):
        return _problems_or(["channels must be a list of channel numbers such as [3] or names such as ['s03']. / channels muss eine Liste von Kanalnummern wie [3] oder Namen wie ['s03'] sein."], "")
    m = _number(mae_best)
    base = pd.DataFrame({{"blocks": _blocks(orders), "items": orders["items"]}})
    problems = []
    if len(got) != 2:
        problems.append("channels should name as many channels as come through tonight. / channels soll so viele Kanäle nennen, wie heute Nacht durchkommen.")
    elif got != [14, 31]:
        if 9 in got:
            problems.append("Channel 9 scores well on its own, but next to the street distance it adds almost nothing. / Kanal 9 schneidet allein gut ab, aber neben der Straßenstrecke bringt er fast nichts.")
        else:
            problems.append("Those two aren't the channels that lower the test MAE of the street distance and items model most. / Das sind nicht die zwei Kanäle, die den Test-MAE des Modells mit Straßenstrecke und Artikeln am meisten senken.")
    if m is None:
        problems.append("mae_best must be a number. / mae_best muss eine Zahl sein.")
    elif not problems:
        ref, _ = _test_mae(base.assign(s14=orders["s14"], s31=orders["s31"]))
        if abs(m - ref) > 0.01:
            problems.append("mae_best doesn't match a LinearRegression on the street distance, the items and your two channels, on dispatch's test part. / mae_best passt nicht zu einer LinearRegression auf Straßenstrecke, Artikeln und euren zwei Kanälen, auf dem Testteil der Zentrale.")
    return _problems_or(problems, "tuned")


def _sealed_orders(x, y):
    """The graders' own past orders, kept inside a closure: a model is scored on orders it has never seen."""
    def score(model):
        """Problems with a model that should promise times from raw order rows, and its MAE on the sealed orders."""
        problems = []
        base = np.ravel(model.predict(x)).astype(float)
        moved = []
        for col in _LEAKS:
            shifted = x.copy()
            shifted[col] = shifted[col] + 30
            if np.abs(np.ravel(model.predict(shifted)) - base).max() > 1e-6:
                moved.append(col)
        if moved:
            problems.append(f"model reads {{len(moved)}} column(s) that dispatch doesn't know yet when an order comes in. / model liest {{len(moved)}} Spalte(n), die die Zentrale noch nicht kennt, wenn ein Auftrag eingeht.")
        used = []
        for col in _CHANNELS:
            shifted = x.copy()
            shifted[col] = shifted[col] + 20
            if np.abs(np.ravel(model.predict(shifted)) - base).max() > 1e-6:
                used.append(col)
        if len(used) > 2:
            problems.append(f"model reads {{len(used)}} telemetry channels; tonight not that many come through. / model liest {{len(used)}} Telemetriekanäle; heute Nacht kommen nicht so viele durch.")
        return problems, float(np.abs(y - base).mean())
    return score


_sealed = _unpack({packed(sealed_frame)})
_score = _sealed_orders(_sealed.drop(columns="minutes"), _sealed["minutes"].to_numpy())
del _sealed_orders, _sealed


def _probe_rush(model):
    """What the model adds for lunch on a weekday and on a Sunday, and for an evening order, over the afternoon."""
    row = tonight.iloc[[0]].copy()
    row[_LEAKS] = 0
    def at(when):
        r = row.copy()
        r["ordered_at"] = when
        return float(np.ravel(model.predict(r))[0])
    calm = at("2026-10-14 15:30")
    return at("2026-10-14 12:30") - calm, at("2026-10-18 12:30") - at("2026-10-18 15:30"), at("2026-10-14 18:30") - calm


def _promises_check(model, promises):
    \'\'\'The final check: a fitted model that promises times from raw order rows (the columns of tonight), scored on the graders' own sealed
    past orders (MAE below the manager's limit, no leaky columns, no more telemetry channels than come through), and its promises for tonight.\'\'\'
    try:
        own = np.ravel(model.predict(tonight)).astype(float)
        if len(own) != len(tonight):
            raise ValueError("one promise per order")
    except Exception as e:
        msg = str(e)
        if "nan" in msg.lower():
            return _problems_or(["model.predict(tonight) fails on empty values: your model reads a column that is still empty for tonight's orders. / model.predict(tonight) scheitert an leeren Werten: Euer Modell liest eine Spalte, die für die Aufträge von heute Nacht noch leer ist."], "")
        if "unknown categor" in msg.lower():
            return _problems_or(["model.predict(tonight) fails on a category the log has never seen. / model.predict(tonight) scheitert an einer Kategorie, die das Protokoll noch nie gesehen hat."], "")
        return _problems_or([f"model must be fitted and take raw order rows with the columns of tonight: model.predict(tonight) failed: {{msg[:200]}} / model muss trainiert sein und rohe Auftragszeilen mit den Spalten von tonight nehmen: model.predict(tonight) ist gescheitert: {{msg[:200]}}"], "")
    problems, mae = _score(model)
    if problems:
        return _problems_or(problems, "")
    if mae > _THRESHOLD:
        problems.append(f"On past orders it has never seen, your model misses by {{mae:.2f}} minutes on average; that is too much for the manager. / Bei alten Aufträgen, die es nie gesehen hat, liegt euer Modell im Schnitt {{mae:.2f}} Minuten daneben; das ist der Leitung zu viel.")
        try:
            weekday, sunday, evening = _probe_rush(model)
            if abs(weekday) < 1 and abs(evening) < 1:
                problems.append("Your model promises the same time at 12:30, 15:30 and 18:30. / Euer Modell verspricht um 12:30, 15:30 und 18:30 dieselbe Zeit.")
            elif abs(weekday - sunday) < 1:
                problems.append("Your model treats a Sunday lunch like a Wednesday lunch. / Euer Modell behandelt ein Sonntagsmittagessen wie eins am Mittwoch.")
        except Exception:
            pass
        return _problems_or(problems, "")
    ref = np.array(_REF_TONIGHT)
    off = own - ref
    if np.abs(off).max() > _TONIGHT_TOLERANCE:
        if off.mean() < -_TONIGHT_TOLERANCE:
            problems.append("Your promises for tonight are far too short. Ask your model what a storm costs. / Eure Versprechen für heute Nacht sind viel zu kurz. Fragt euer Modell, was ein Sturm kostet.")
        else:
            problems.append("Your model is good on old orders but wrong for tonight's. / Euer Modell ist bei alten Aufträgen gut, aber bei denen von heute Nacht falsch.")
        return _problems_or(problems, "")
    try:
        got = np.array([float(v) for v in np.ravel(promises)])
    except (TypeError, ValueError):
        return _problems_or(["promises must be eight numbers, one per order of tonight. / promises müssen acht Zahlen sein, eine pro Auftrag von heute Nacht."], "")
    if len(got) != len(own) or np.abs(got - own).max() > 1:
        return _problems_or(["promises aren't what your model predicts for tonight's orders, in whole minutes. / promises sind nicht, was euer Modell für die Aufträge von heute Nacht vorhersagt, in ganzen Minuten."], "")
    return "promised"
''')

print("minutes:", y.describe().round(1).to_dict())
print("1 raw log: mae_hour", round(mae_hour, 3), "mae_rush", round(mae_rush, 3), "rush minutes", round(rush_minutes, 2), "(no weekday", round(mae_noweek, 3), ")")
print("2 street: straight", round(mae_straight, 3), "street", round(mae_street, 3), "seconds per block", round(seconds_per_block, 2))
print("3 weather: storm minutes", round(storm_minutes, 2), "alphabetical dry->rain", round(alpha_rain, 2))
print("4 leaks: leaky R2", round(leaky_r2, 4), "MAE", round(leaky_mae, 2), "honest MAE", round(honest_mae, 3), "refunds", refunds, "(both ways", refunds_abs, ")")
print("5 channels: filter", filter_pick, "best", best_two, "mae filter pair", round(mae_filter, 3), "best pair", round(mae_best, 3))
print("6 sealed MAE reference", round(ref_sealed, 3), "threshold", THRESHOLD, "tonight", ref_tonight.round(1).tolist())
for name, r in results.items():
    print("   ", name, r)
print("locks: leaks", f"{RUSH_CODE}{STORM_CODE}", "channels", BLOCK_CODE, "final", f"1431{refunds}")
