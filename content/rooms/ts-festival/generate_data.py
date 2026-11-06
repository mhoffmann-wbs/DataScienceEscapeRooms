# Generates data/scans.py and data/tram.py for Festival Season. Not bundled with the site.
# The graders' reference values (in the data files' _..._check functions) come from the reference
# solutions in solutions.json; update them if the data changes (the room tests will notice).
# Needs numpy and pandas (any Python with them works). Run from this folder:  python3 generate_data.py
import numpy as np
import pandas as pd

DAYS = pd.date_range("2021-01-01", "2025-09-30", freq="D")
N = len(DAYS)
TRAM_OPENS = pd.Timestamp("2023-04-01")
years = ((DAYS - DAYS[0]) / pd.Timedelta(days=365.25)).values
after = np.maximum(((DAYS - TRAM_OPENS) / pd.Timedelta(days=365.25)).values, 0)
doy = DAYS.day_of_year.values
dow = DAYS.day_of_week.values

# Festival grounds: daily gate scans, in the form of a multiplicative Prophet model:
# trend * (1 + yearly + weekly + events). The trend bends when tram line 7 opens; summers and
# weekends are busy; the opening weekend and Lantern Night draw crowds.
OPENINGS = ["2021-06-18", "2022-06-17", "2023-06-16", "2024-06-21", "2025-06-20"]
LANTERNS = ["2021-09-11", "2022-09-10", "2023-09-09", "2024-09-14", "2025-09-13"]
rng = np.random.default_rng(21)
trend = 700 + 40 * years + 330 * after
yearly = 0.55 * np.cos(2 * np.pi * (doy - 200) / 365.25) + 0.08 * np.cos(4 * np.pi * (doy - 200) / 365.25)
weekly = np.array([-0.28, -0.26, -0.2, -0.12, 0.12, 0.52, 0.22])[dow]
events = np.zeros(N)
for d in OPENINGS:
    i = DAYS.get_loc(pd.Timestamp(d))
    events[i:i + 3] += [1.0, 1.8, 1.3]
for d in LANTERNS:
    i = DAYS.get_loc(pd.Timestamp(d))
    events[i - 1:i + 1] += [0.4, 2.5]
scans = np.round(trend * (1 + yearly + weekly + events) * np.exp(rng.normal(0, 0.09, N))).astype(int)
assert scans.min() > 0 and scans.max() < 9999
# The scanners were down for two weeks and wrote 0; the technician's test bookings are 9999.
outage = (DAYS >= "2024-03-04") & (DAYS <= "2024-03-17")
scans[outage] = 0
for d in ["2021-11-01", "2022-05-02", "2023-02-06", "2024-08-05", "2025-01-06", "2025-07-07"]:
    scans[DAYS.get_loc(pd.Timestamp(d))] = 9999

# Tram stop "Festwiese": daily passengers. Additive: commuters on weekdays, a little summer
# bump, and a trend that bends when line 7 starts serving the stop.
rng = np.random.default_rng(7)
tram = np.round(2600 + 60 * years + 520 * after
                + 160 * np.cos(2 * np.pi * (doy - 200) / 365.25)
                + np.array([180, 210, 200, 190, 120, -330, -570])[dow]
                + rng.normal(0, 110, N)).astype(int)


# The graders the python checks call. Reference values come from the reference solutions in
# solutions.json; they print what is wrong (in both languages) and return a fixed string.
SCANS_GRADERS = """

def _number(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if x == x else None


def _verdict(problems):
    for p in problems:
        print(p)
    return "ok" if not problems else "rejected"


def _gate_problems(df):
    \"\"\"Every desk starts from the gate scanner log's df: a row for every day, the uncounted days empty.\"\"\"
    try:
        y = pd.to_numeric(df["y"], errors="coerce")
        clean = len(df) == 1734 and int(y.notna().sum()) == 1714 and round(float(y.sum())) == 1836733
    except Exception:
        clean = False
    if clean:
        return []
    return ["df isn't the cleaned gate log yet: copy your df from the gate scanner log (a row for every day, the uncounted days empty). / df ist noch nicht das bereinigte Einlass-Log: Übernehmt euer df vom Einlass-Log (eine Zeile pro Tag, die nicht gezählten Tage leer)."]


def _clean_df(df):
    \"\"\"The planner's rule: says whether df is the cleaned gate log (part of the checked result).\"\"\"
    problems = _gate_problems(df)
    for p in problems:
        print(p)
    return "clean" if not problems else "not clean"


def _mode_check(df, mae_additive, mae_multiplicative, mae_log):
    \"\"\"The lighting desk: the three holdout errors, each within 10 % of a sound fit.\"\"\"
    problems = _gate_problems(df)
    for name, value, ref in (("mae_additive", mae_additive, 516), ("mae_multiplicative", mae_multiplicative, 293), ("mae_log", mae_log, 433)):
        v = _number(value)
        if v is None:
            problems.append(f"{name} is not a number yet. / {name} ist noch keine Zahl.")
        elif name == "mae_log" and v > 1500:
            problems.append("mae_log is far too big: compare in visitors, not in log units (np.exp). / mae_log ist viel zu groß: In Besuchern vergleichen, nicht in Log-Einheiten (np.exp).")
        elif abs(v - ref) > 0.1 * ref:
            problems.append(f"{name} doesn't match a model fitted on train and tested on June-September 2025. / {name} passt nicht zu einem Modell, das auf train angepasst und auf Juni-September 2025 getestet wurde.")
    return _verdict(problems)


def _events_check(df, events, saturday_effect):
    \"\"\"The events desk: the calendar as a holidays table, and the opening Saturday's effect.\"\"\"
    problems = _gate_problems(df)
    want = {
        frozenset(("2021-06-18", "2022-06-17", "2023-06-16", "2024-06-21", "2025-06-20", "2026-06-19")): (0, 2),
        frozenset(("2021-09-11", "2022-09-10", "2023-09-09", "2024-09-14", "2025-09-13", "2026-09-12")): (-1, 0),
    }
    try:
        cols = set(events.columns)
        if not {"holiday", "ds", "lower_window", "upper_window"} <= cols:
            problems.append("events needs the columns holiday, ds, lower_window and upper_window. / events braucht die Spalten holiday, ds, lower_window und upper_window.")
        else:
            got = {}
            for _, rows in events.groupby("holiday"):
                dates = frozenset(pd.to_datetime(rows["ds"]).dt.strftime("%Y-%m-%d"))
                got[dates] = {(int(r.lower_window), int(r.upper_window)) for r in rows.itertuples()}
            for dates, window in want.items():
                if dates not in got:
                    problems.append("events doesn't list each event's dates from the calendar, 2021 to 2026, under one name. / events enthält nicht die Termine jedes Events aus dem Kalender, 2021 bis 2026, unter einem Namen.")
                    break
                if got[dates] != {window}:
                    problems.append("An event's window doesn't cover the right days (see the calendar). / Das Fenster eines Events deckt nicht die richtigen Tage ab (siehe Kalender).")
                    break
            if len(got) != 2:
                problems.append("events should hold exactly the two events from the calendar. / events sollte genau die zwei Events aus dem Kalender enthalten.")
    except AttributeError:
        problems.append("events must be a pandas DataFrame. / events muss ein pandas-DataFrame sein.")
    v = _number(saturday_effect)
    if v is None:
        problems.append("saturday_effect is not a number yet. / saturday_effect ist noch keine Zahl.")
    elif abs(v - 2.04) > 0.25:
        problems.append("saturday_effect doesn't match: the opening weekend's column on Saturday 22 June 2024, from a model with the lighting desk's seasonality mode, fitted on all of df. / saturday_effect passt nicht: die Spalte des Eröffnungswochenendes am Samstag, 22. Juni 2024, aus einem Modell mit der Saisonalität vom Lichtpult, angepasst auf ganz df.")
    return _verdict(problems)


def _order_check(df, best_baseline, mae_model, opening_2026):
    \"\"\"The stage order: the best baseline's error, a model that beats it, and its opening weekend forecast.\"\"\"
    problems = _gate_problems(df)
    base = _number(best_baseline)
    if base is None or abs(base - 422) > 1:
        problems.append("Order refused: best_baseline must be the error of the best simple rule on June-September 2025, in visitors a day. / Bestellung abgelehnt: best_baseline muss der Fehler der besten einfachen Regel auf Juni-September 2025 sein, in Besuchern pro Tag.")
    mae = _number(mae_model)
    if mae is None or not 100 < mae < 422:
        problems.append("Order refused: the model doesn't beat the best simple rule (check mae_model). / Bestellung abgelehnt: Das Modell schlägt die beste einfache Regel nicht (mae_model prüfen).")
    total = _number(opening_2026)
    if total is None:
        problems.append("opening_2026 is not a number yet. / opening_2026 ist noch keine Zahl.")
    elif total < 0.62 * 19078:
        problems.append("Order refused: far too few visitors for the opening weekend. Is it the figure the stage order form asks for? Does the model know that the 2026 opening weekend is coming? / Bestellung abgelehnt: viel zu wenige Besucher für das Eröffnungswochenende. Ist es die Zahl, nach der das Bestellformular fragt? Weiß das Modell, dass 2026 ein Eröffnungswochenende kommt?")
    elif abs(total - 19078) > 0.05 * 19078:
        problems.append("Order refused: that forecast doesn't match a sound model. Check the settings from the tram counter, the lighting desk and the events desk. / Bestellung abgelehnt: Diese Prognose passt zu keinem stimmigen Modell. Prüft die Einstellungen vom Straßenbahnzähler, vom Lichtpult und vom Veranstaltungstisch.")
    return _verdict(problems)
"""

TRAM_GRADER = """

def _tram_check(biggest_change, growth_before, growth_after):
    \"\"\"The tram counter: where the trend bends, and how fast it grew before and after.\"\"\"
    problems = []
    try:
        days = abs((pd.Timestamp(biggest_change) - pd.Timestamp("2023-04-01")).days)
    except (TypeError, ValueError):
        days = None
    if days is None or days > 75:
        problems.append("biggest_change isn't the changepoint with the largest slope change. / biggest_change ist nicht der Changepoint mit der größten Steigungsänderung.")
    for name, value, ref, tol in (("growth_before", growth_before, 70, 35), ("growth_after", growth_after, 579, 60)):
        try:
            ok = abs(float(value) - ref) <= tol
        except (TypeError, ValueError):
            ok = False
        if not ok:
            problems.append(f"{name} doesn't match the trend of a model with the line's opening date as its changepoint. / {name} passt nicht zum Trend eines Modells mit dem Eröffnungstag der Linie als Changepoint.")
    for p in problems:
        print(p)
    return "ok" if not problems else "rejected"
"""


def rows(values, per_line):
    text = [str(v) for v in values]
    return ",\n".join("    " + ", ".join(text[i:i + per_line]) for i in range(0, len(text), per_line))


with open("data/scans.py", "w") as f:
    f.write('''# Gate scans at the Lindenwiese festival grounds: visitors per day, 1 January 2021 to
# 30 September 2025. Loaded before your code runs.
import numpy as np
import pandas as pd

scans = pd.Series([
''' + rows(scans.tolist(), 14) + '''
], index=pd.date_range("2021-01-01", "2025-09-30", freq="D", name="date"), name="scans", dtype="float64")
''' + SCANS_GRADERS)

with open("data/tram.py", "w") as f:
    f.write('''# Passengers per day at the tram stop "Festwiese", 1 January 2021 to 30 September 2025.
# Loaded before your code runs.
import numpy as np
import pandas as pd

tram = pd.DataFrame({
    "ds": pd.date_range("2021-01-01", "2025-09-30", freq="D"),
    "y": [
''' + rows(tram.tolist(), 14).replace("\n    ", "\n        ").replace("    ", "        ", 1) + '''
    ],
})
''' + TRAM_GRADER)
print("wrote data/scans.py and data/tram.py")
