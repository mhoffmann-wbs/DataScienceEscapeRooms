# Packing line: the weights of 30 bars of "100 g" chocolate, taken at random from tonight's
# production, in grams. Loaded before your code runs.
import numpy as np
import pandas as pd

weights = pd.Series([
    101.4, 102.1, 101.4, 98.9, 102.3, 101.6, 100.1, 101.8, 101.4, 101.3,
    100.9, 101.7, 99.8, 100.7, 100.2, 101.8, 101.0, 100.5, 99.7, 100.5,
    100.9, 100.5, 102.8, 102.4, 96.8, 98.1, 100.6, 100.3, 101.2, 101.2,
], name="grams")


def _scale_check(ci_low, ci_high, p_value, recalibrate):
    """The packing line's check: the confidence interval at the manual's 95 %, the t-test and the decision."""
    from numbers import Real
    problems = []
    if not all(isinstance(v, Real) for v in (ci_low, ci_high)):
        problems.append("ci_low and ci_high must be numbers. / ci_low und ci_high müssen Zahlen sein.")
    elif abs(ci_low - 100.3264) > 0.005 or abs(ci_high - 101.2669) > 0.005:
        if abs(ci_low - 100.345) < 0.005 and abs(ci_high - 101.248) < 0.005:
            problems.append("That interval uses the normal distribution. With 30 bars and an estimated standard deviation, use the t distribution (29 degrees of freedom). / Dieses Intervall nutzt die Normalverteilung. Bei 30 Tafeln und geschätzter Standardabweichung nehmt die t-Verteilung (29 Freiheitsgrade).")
        elif abs(ci_low - 100.1616) < 0.005 and abs(ci_high - 101.4318) < 0.005:
            problems.append("That's a 99 % interval. The planning board's α = 0.01 is for the relaunch experiments; the packing line follows the quality manual. / Das ist ein 99-%-Intervall. Das α = 0,01 der Planungstafel gilt für die Relaunch-Experimente; die Verpackungslinie folgt dem Qualitätshandbuch.")
        else:
            problems.append("The confidence interval is off: use the level from the quality manual, centre it on the mean, with the standard error of the mean as scale. / Das Konfidenzintervall stimmt nicht: Nehmt das Niveau aus dem Qualitätshandbuch, Mitte beim Mittelwert, Standardfehler des Mittelwerts als Skala.")
    if not isinstance(p_value, Real) or abs(p_value - 0.00172) > 0.0002:
        problems.append("The p-value is off: a one-sample t-test of the weights against 100 g, two-sided. / Der p-Wert stimmt nicht: ein Einstichproben-t-Test der Gewichte gegen 100 g, zweiseitig.")
    if not isinstance(recalibrate, (bool, np.bool_)) or not recalibrate:
        problems.append("Check the decision again: does the interval contain 100 g? / Prüft die Entscheidung noch einmal: Enthält das Intervall 100 g?")
    for p in problems:
        print(p)
    return "approved" if not problems else "rejected"
