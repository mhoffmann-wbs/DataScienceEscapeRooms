# Heating fuel burned at Station Nordlys, litres per month, January 2010 to December 2025.
# None = the meter was frozen that month. Loaded before your code runs.
import numpy as np
import pandas as pd

fuel = pd.Series([
    4132, 4162, 3607, 3392, 2816, 2286, 2209, 2237, 2680, 3196, 3698, 4213,
    4172, 4165, 3544, 3178, 2682, 2204, 2199, 2390, 2742, 3155, 3495, 3970,
    3977, 3983, 3365, 3024, 2550, 2245, 2106, 2224, 2612, 3009, 3352, 3888,
    3865, 4012, 3631, 3097, 2616, 2192, None, 2045, 2466, 3023, 3433, 4046,
    4073, 4237, 3572, 3020, 2600, 2108, 1911, 1978, 2423, 2849, 3263, 3704,
    3955, 3974, 3425, 2955, 2646, 2264, 2114, 2117, 2581, 3223, 3644, 3938,
    4122, 4176, 3616, 3179, 2657, 2305, 2167, 2303, 2649, 3168, 3712, 4197,
    4247, None, None, 3265, 2806, 2528, 2372, 2457, 2978, 3407, 3865, 4404,
    4566, 4570, 3968, 3339, 2796, 2512, 2367, 2379, 2880, 3427, 3970, 4411,
    4444, 4370, 3929, 3615, 2991, 2722, 2529, 2548, 3121, 3689, 4503, 4930,
    5154, 5122, 4275, 3790, 3159, 2755, 2431, 2603, 3272, 3842, 4629, 5274,
    5303, 5712, 4599, 3933, 3310, 2926, 2635, 2671, 3447, 3868, None, 5122,
    5345, 5758, 4770, 4054, 3402, 3005, 2722, 2956, 3668, 4252, 4972, 5520,
    5959, 6024, 4861, 4312, 3808, 3330, 3195, 3368, 4078, 4749, 5722, 6455,
    6649, 6567, 5585, 4789, 4152, 3682, 3186, 3327, 4346, 4958, 5952, 6703,
    6782, 6765, 5555, 4998, 4184, 3659, 3498, 3616, 4361, 5164, 6421, 7291
], index=pd.date_range("2010-01-01", periods=192, freq="MS"), name="fuel", dtype="float64")


_fuel_raw = fuel.copy()


def _supply_check(chief_mae, holdout_mae, litres, repaired):
    """The supply terminal's check: the chief's error, the model's holdout error, the January 2026 order and
    the repaired log it was built on (gaps filled in proportion to time).
    The model must be the station's (1,1,1)(0,1,1,12) model (holdout MAE about 177 l, January about 7426 l)."""
    def number(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None
    chief_mae, holdout_mae, litres = number(chief_mae), number(holdout_mae), number(litres)
    problems = []
    if chief_mae is None or round(chief_mae) != 440:
        problems.append("The terminal doesn't recognise mae_chief as the chief's error. / Das Terminal erkennt mae_chief nicht als Fehler der Leiterin.")
    elif holdout_mae is None or holdout_mae >= chief_mae:
        problems.append("Order refused: that model doesn't beat the chief (mae_sarima). / Bestellung abgelehnt: Dieses Modell schlägt die Leiterin nicht (mae_sarima).")
    elif abs(holdout_mae - 177) > 10:
        problems.append("Order refused: mae_sarima doesn't match the station's model on the repaired log, on the chief's test period. / Bestellung abgelehnt: mae_sarima passt nicht zum Modell der Station auf dem reparierten Logbuch, auf dem Testzeitraum der Leiterin.")
    if litres is None or abs(litres - 7426) > 15:
        problems.append("Order refused: that January order doesn't match the station's model on the repaired log. / Bestellung abgelehnt: Diese Januar-Bestellung passt nicht zum Modell der Station auf dem reparierten Logbuch.")
    try:
        repaired_ok = len(repaired) == len(_fuel_raw) and bool(((repaired - _fuel_raw.interpolate(method="time")).abs() < 0.5).all())
    except Exception:
        repaired_ok = False
    if not repaired_ok:
        problems.append("The terminal doesn't accept fuel_filled as the repaired log. / Das Terminal erkennt fuel_filled nicht als repariertes Logbuch an.")
    for p in problems:
        print(p)
    return "approved" if not problems else "rejected"
