# Lemonade stand: the fill volume of every cup sold tonight, in ml (in the order sold).
# Loaded before your code runs.
import numpy as np
import pandas as pd

cups = pd.Series([
    291, 295, 310, 302, 283, 296, 292, 298, 284, 298, 298, 309, 299, 301, 285,
    315, 281, 0, 305, 294, 289, 291, 291, 300, 296, 308, 282, 296, 289, 303,
    280, 294, 298, 285, 304, 298, 305, 304, 289, 290, 295, 302, 303, 291, 292,
    290, 292, 295, 295, 313, 292, 294, 2980, 300, 289, 294, 297, 303, 286, 307,
    294, 298, 303, 302, 305, 298, 296, 299, 289, 306, 290, 286, 313, 295, 287,
    311, 294, 0, 305, 290, 295, 283, 281, 289, 296, 303, 316, 288, 305, 292,
    295, 285, 285, 290, 287, 296, 291, 307, 298, 298, 306, 301, 296, 0, 296,
    296, 305, 303, 299, 303, 292, 301, 285, 307, 297, 298, 301, 296, 294, 306,
], name="ml")


def _cup_check(mean_raw, median_raw, clean, mean, median, sd, mean_moved, median_moved):
    '''The cup log's check: the raw and the clean description.'''
    from numbers import Real
    problems = []
    numbers = (mean_raw, median_raw, mean, median, sd)
    if not all(isinstance(v, Real) for v in numbers):
        problems.append("mean_raw, median_raw, mean, median and sd must all be numbers. / mean_raw, median_raw, mean, median und sd müssen alle Zahlen sein.")
    else:
        if abs(mean_raw - 311.342) > 0.01 or median_raw != 296:
            problems.append("mean_raw and median_raw describe the log as it is, before any cleaning. / mean_raw und median_raw beschreiben das Protokoll, wie es ist, vor jeder Bereinigung.")
        if not hasattr(clean, "__len__") or len(clean) != 116:
            problems.append(f"clean has {len(clean) if hasattr(clean, '__len__') else 0} cups, but the log has 116 real ones. / clean hat {len(clean) if hasattr(clean, '__len__') else 0} Becher, das Protokoll hat aber 116 echte.")
        elif abs(mean - 296.388) > 0.01 or median != 296:
            problems.append("mean and median should describe the clean cups. / mean und median sollen die bereinigten Becher beschreiben.")
        elif abs(sd - 7.840) < 0.005:
            problems.append("sd divides by n. For a sample, divide by n - 1 (pandas' .std() does that; numpy needs ddof=1). / sd teilt durch n. Für eine Stichprobe teilt durch n - 1 (pandas' .std() macht das; numpy braucht ddof=1).")
        elif abs(sd - 7.874) > 0.005:
            problems.append("sd is off: the standard deviation of the clean cups. / sd stimmt nicht: die Standardabweichung der bereinigten Becher.")
    if not all(isinstance(v, (bool, np.bool_)) for v in (mean_moved, median_moved)):
        problems.append("mean_moved and median_moved should be True or False. / mean_moved und median_moved sollen True oder False sein.")
    elif not mean_moved or median_moved:
        problems.append("mean_moved or median_moved is off: compare each value before and after cleaning. / mean_moved oder median_moved stimmt nicht: Vergleicht jeden Wert vor und nach dem Bereinigen.")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
