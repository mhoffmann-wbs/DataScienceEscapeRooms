# Heating fuel burned at Station Nordlys, litres per month, January 2010 to December 2025.
# None = the meter was frozen that month. Loaded before your code runs.
import numpy as np
import pandas as pd

fuel = pd.Series([
    4464, 4473, 4087, 3555, 2950, 2709, 2527, 2794, 2925, 3670, 3790, 4455,
    4599, 4547, 3949, 3593, 2914, 2471, 2430, 2684, 2731, 3462, 3629, 4264,
    4353, 4291, 3759, 3422, 2760, 2338, 2207, 2467, 2449, 3089, 3281, 4000,
    4260, 4220, 3676, 3192, 2782, 2307, None, 2452, 2491, 3260, 3573, 3994,
    4065, 4135, 3515, 3157, 2771, 2480, 2372, 2501, 2565, 3364, 3665, 4078,
    4438, 4261, 3680, 3204, 2751, 2350, 2294, 2531, 2691, 3186, 3437, 4010,
    4249, 4152, 3769, 3261, 2739, 2456, 2306, 2607, 2770, 3480, 3794, 4267,
    4577, None, None, 3307, 2860, 2487, 2422, 2555, 2722, 3513, 3788, 4448,
    4566, 4243, 3677, 3329, 2880, 2422, 2320, 2429, 2540, 3355, 3437, 4141,
    4402, 4035, 3545, 3127, 2805, 2367, 2363, 2476, 2630, 3385, 3598, 4347,
    4570, 4444, 3873, 3442, 2943, 2575, 2520, 2612, 2845, 3716, 3995, 4664,
    5020, 5011, 4271, 3868, 3336, 2896, 2680, 2878, 3091, 3813, None, 4973,
    5057, 5125, 4427, 4080, 3544, 2918, 2820, 2887, 3259, 4161, 4450, 5405,
    5674, 5855, 4764, 4420, 3757, 3281, 3326, 3470, 3766, 4793, 5181, 6527,
    6560, 6679, 5605, 4936, 4246, 3648, 3534, 3718, 4202, 5265, 5498, 6746,
    6905, 7027, 5891, 5056, 4439, 3949, 3864, 3920, 4371, 5350, 5476, 7179
], index=pd.date_range("2010-01-01", periods=192, freq="MS"), name="fuel", dtype="float64")


_fuel_raw = fuel.copy()


def _supply_check(chief_mae, holdout_mae, litres, repaired):
    """The supply terminal's check: the chief's error, the model's holdout error, the January 2026 order and
    the repaired log it was built on (gaps filled in proportion to time).
    The model must be the station's airline model (holdout MAE about 269 l, January about 7220 l)."""
    def number(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None
    chief_mae, holdout_mae, litres = number(chief_mae), number(holdout_mae), number(litres)
    problems = []
    if chief_mae is None or round(chief_mae) != 602:
        problems.append("The terminal doesn't recognise mae_chief as the chief's error. / Das Terminal erkennt mae_chief nicht als Fehler der Leiterin.")
    elif holdout_mae is None or holdout_mae >= chief_mae:
        problems.append("Order refused: that model doesn't beat the chief (mae_sarima). / Bestellung abgelehnt: Dieses Modell schlägt die Leiterin nicht (mae_sarima).")
    elif abs(holdout_mae - 269) > 10:
        problems.append("Order refused: mae_sarima doesn't match the station's model on the repaired log, on the chief's test period. / Bestellung abgelehnt: mae_sarima passt nicht zum Modell der Station auf dem reparierten Logbuch, auf dem Testzeitraum der Leiterin.")
    if litres is None or abs(litres - 7220) > 15:
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
