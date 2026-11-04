# Generates data/fuel.py and data/freezer.py for Station Nordlys. Not bundled with the site.
# The supply check's reference forecast (7220 litres, Jan 2026) comes from the reference
# solution in solutions.json; update it if the data changes (the room tests will notice).
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


def _supply_check(pin, litres, holdout_mae):
    """The supply terminal's check: PIN, January 2026 forecast and the holdout error."""
    import hashlib
    problems = []
    if hashlib.sha256(str(pin).strip().encode()).hexdigest() != "de650d61f5bd166a91f8ccec3158297db18b9d50eaedca238cd29dc3a214a916":
        problems.append("The terminal rejects the PIN. / Das Terminal lehnt die PIN ab.")
    if not isinstance(holdout_mae, (int, float)) or not 100 < holdout_mae < 602:
        problems.append("Order refused: the model must beat the chief's 602 litres on 2024-2025 (check mae_sarima). / Bestellung abgelehnt: Das Modell muss die 602 Liter der Leiterin auf 2024-2025 schlagen (mae_sarima prüfen).")
    if not isinstance(litres, (int, float)) or abs(litres - 7220) > 0.03 * 7220:
        problems.append("Order refused: that January forecast doesn't match a sound model (log scale? back-transformed?). / Bestellung abgelehnt: Diese Januar-Prognose passt zu keinem stimmigen Modell (Log-Skala? zurücktransformiert?).")
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
