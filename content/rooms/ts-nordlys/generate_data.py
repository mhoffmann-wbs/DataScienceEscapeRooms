# Generates data/fuel.py and data/freezer.py for Station Nordlys. Not bundled with the site.
# The supply check's reference values (holdout MAE 269 litres, Jan 2026 forecast 7220 litres)
# and the chief's 602 come from the reference solutions in solutions.json; update it if the data changes (the room tests will notice).
# Needs numpy (any Python with numpy works); the seeds were chosen so that the ACF/PACF of the
# fuel series show the airline-model pattern clearly and the freezer's AR(2) coefficients round
# cleanly. Run from this folder:  python3 generate_data.py
import numpy as np

# Heating fuel, monthly 2010-01..2025-12: airline model (0,1,1)(0,1,1,12) on the log scale,
# so the seasonal swing grows with the level. Four months are missing (frozen meter).
N = 192
rng = np.random.default_rng(255)
n = N + 36
e = rng.normal(0, 0.03, n)
w = e.copy()
w[1:] += -0.4 * e[:-1]
w[12:] += -0.6 * e[:-12]
w[13:] += 0.24 * e[:-13]
z = np.zeros(n)
z[:13] = np.log(3000) + 0.32 * np.cos(2 * np.pi * np.arange(13) / 12) + 0.004 * np.arange(13)
for t in range(13, n):
    z[t] = z[t - 1] + z[t - 12] - z[t - 13] + w[t]
fuel = np.round(np.exp(z[36:])).astype(int).tolist()
GAPS = [(2013, 7), (2017, 2), (2017, 3), (2021, 11)]
for y, m in GAPS:
    fuel[(y - 2010) * 12 + m - 1] = None

def rows(values, per_line):
    text = [str(v) if v is not None else "None" for v in values]
    return ",\n".join("    " + ", ".join(text[i:i + per_line]) for i in range(0, len(text), per_line))

with open("data/fuel.py", "w") as f:
    f.write('''# Heating fuel burned at Station Nordlys, litres per month, January 2010 to December 2025.
# None = the meter was frozen that month. Loaded before your code runs.
import numpy as np
import pandas as pd

fuel = pd.Series([
''' + rows(fuel, 12) + '''
], index=pd.date_range("2010-01-01", periods=192, freq="MS"), name="fuel", dtype="float64")


def _supply_check(chief_mae, holdout_mae, litres):
    """The supply terminal's check: the chief's error, the model's holdout error and the January 2026 order.
    The model must be the echo chamber's airline model (holdout MAE about 269 l, January about 7220 l)."""
    def number(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None
    chief_mae, holdout_mae, litres = number(chief_mae), number(holdout_mae), number(litres)
    problems = []
    if chief_mae is None or round(chief_mae) != 602:
        problems.append("The terminal doesn't recognise mae_chief as the chief's error. Ask at the chief's desk. / Das Terminal erkennt mae_chief nicht als Fehler der Leiterin. Fragt am Schreibtisch der Leiterin nach.")
    elif holdout_mae is None or holdout_mae >= chief_mae:
        problems.append("Order refused: that model doesn't beat the chief (mae_sarima). / Bestellung abgelehnt: Dieses Modell schlägt die Leiterin nicht (mae_sarima).")
    elif abs(holdout_mae - 269) > 10:
        problems.append("Order refused: mae_sarima doesn't match the station's model (the echo chamber's winner on the repaired log) on the chief's test period. / Bestellung abgelehnt: mae_sarima passt nicht zum Modell der Station (dem Gewinner der Echokammer auf dem reparierten Logbuch) auf dem Testzeitraum der Leiterin.")
    if litres is None or abs(litres - 7220) > 15:
        problems.append("Order refused: that January order doesn't match the station's model on the repaired log. Read the order form. / Bestellung abgelehnt: Diese Januar-Bestellung passt nicht zum Modell der Station auf dem reparierten Logbuch. Lest das Bestellformular.")
    for p in problems:
        print(p)
    return "approved" if not problems else "rejected"
''')

# Freezer: hourly temperature, 20 days. AR(2) fluctuations (0.6, -0.3) on top of a sensor
# that drifts upwards in a straight line.
rng = np.random.default_rng(3)
n = 480
e = rng.normal(0, 0.15, n + 50)
x = np.zeros(n + 50)
for t in range(2, n + 50):
    x[t] = 0.6 * x[t - 1] - 0.3 * x[t - 2] + e[t]
temps = np.round(-20 + 0.004 * np.arange(n) + x[50:], 3).tolist()
with open("data/freezer.py", "w") as f:
    f.write('''# Sample freezer temperature log, one reading per hour from 1 to 20 November 2025, in °C.
# Loaded before your code runs.
import numpy as np
import pandas as pd

freezer = pd.Series([
''' + rows(temps, 10) + '''
], index=pd.date_range("2025-11-01", periods=480, freq="h"), name="freezer")
''')
print("wrote data/fuel.py and data/freezer.py")
