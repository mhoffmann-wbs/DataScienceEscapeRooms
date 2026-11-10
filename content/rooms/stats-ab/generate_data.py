# Generates the data files of The Chocolate Experiment. Not bundled with the site.
# The graders' reference values (in the data files' _..._check functions) come from the
# reference solutions in solutions.json; update them if the data changes (the room tests will notice).
# Needs numpy and pandas (any Python with them works). Run from this folder:  python3 generate_data.py
import numpy as np
import pandas as pd


def wrap(values, per_line, fmt=str):
    """A Python list literal, wrapped."""
    values = [fmt(v) for v in values]
    lines = [", ".join(values[i:i + per_line]) for i in range(0, len(values), per_line)]
    return "[\n    " + ",\n    ".join(lines) + ",\n]"


def digits(values, per_line=77):
    """A string of single digits, wrapped (compact for long lists)."""
    s = "".join(str(int(v)) for v in values)
    return "(\n" + "\n".join(f'    "{s[i:i + per_line]}"' for i in range(0, len(s), per_line)) + "\n)"


# Packing line: 30 bars of "100 g" chocolate, weighed tonight. The line pours a little too much.
weights = np.round(np.random.default_rng(1).normal(100.9, 1.5, 30), 1)
with open("data/scale.py", "w") as f:
    f.write(f'''# Packing line: the weights of 30 bars of "100 g" chocolate, taken at random from tonight's
# production, in grams. Loaded before your code runs.
import numpy as np
import pandas as pd

weights = pd.Series({wrap(weights, 10)}, name="grams")


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
            problems.append("That's a 99 % interval: the packing line isn't one of the relaunch experiments. / Das ist ein 99-%-Intervall: Die Verpackungslinie gehört nicht zu den Relaunch-Experimenten.")
        else:
            problems.append("The confidence interval is off: use the required level, centre it on the mean, with the standard error of the mean as scale. / Das Konfidenzintervall stimmt nicht: Nehmt das vorgeschriebene Niveau, Mitte beim Mittelwert, Standardfehler des Mittelwerts als Skala.")
    if not isinstance(p_value, Real) or abs(p_value - 0.00172) > 0.0002:
        problems.append("The p-value is off: a one-sample t-test of the weights against 100 g, two-sided. / Der p-Wert stimmt nicht: ein Einstichproben-t-Test der Gewichte gegen 100 g, zweiseitig.")
    if not isinstance(recalibrate, (bool, np.bool_)):
        problems.append("recalibrate should be True or False. / recalibrate soll True oder False sein.")
    elif not recalibrate:
        problems.append("recalibrate is off: is 100 g a plausible mean weight for the line? / recalibrate stimmt nicht: Ist 100 g ein plausibles mittleres Gewicht für die Linie?")
    for p in problems:
        print(p)
    return "approved" if not problems else "rejected"
''')

# Web shop: order values in euros, heavily right-skewed (a few big corporate orders).
orders = np.round(np.random.default_rng(2).lognormal(3.3, 0.8, 8000), 2)
with open("data/orders.py", "w") as f:
    f.write(f'''# Web shop: the value of every order in 2025, in euros (8,000 orders). Loaded before your code runs.
import numpy as np
import pandas as pd

orders = pd.Series({wrap(orders, 12, lambda v: f"{v:.2f}")}, name="euros")


def _clt_check(skew_orders, means, se_theory, skew_means, t_tests_ok):
    """Ana's check of the central limit theorem for means of 50 orders, and the verdict on t-tests."""
    from numbers import Real
    from scipy import stats
    problems = []
    if not isinstance(skew_orders, Real) or abs(skew_orders - 3.346) > 0.01:
        problems.append("skew_orders is off: the skewness of all orders (scipy.stats.skew). / skew_orders stimmt nicht: die Schiefe aller Bestellungen (scipy.stats.skew).")
    if not isinstance(se_theory, Real) or abs(se_theory - 4.99) > 0.01:
        problems.append("se_theory is off: the standard deviation of the orders divided by the square root of the sample size. / se_theory stimmt nicht: die Standardabweichung der Bestellungen geteilt durch die Wurzel des Stichprobenumfangs.")
    try:
        m = np.asarray(means, dtype=float)
    except (TypeError, ValueError):
        m = np.array([])
    if m.ndim != 1 or len(m) < 1000:
        problems.append("means needs the means of at least 1,000 random samples. / means braucht die Mittelwerte von mindestens 1.000 Zufallsstichproben.")
    elif abs(m.mean() - 37.77) > 0.6 or not 4.5 < m.std() < 5.5:
        problems.append("Your sample means don't look like means of random samples as large as the board's reports use. / Eure Stichprobenmittel sehen nicht nach Mittelwerten von Zufallsstichproben in der Größe der Vorstandsberichte aus.")
    elif not 0.15 < stats.skew(m) < 1.2:
        problems.append("Your sample means are not skewed like means of random samples of these orders (a bit to the right). Draw them from the orders, don't generate them. / Eure Stichprobenmittel sind nicht so schief wie Mittelwerte von Zufallsstichproben dieser Bestellungen (leicht nach rechts). Zieht sie aus den Bestellungen, erzeugt sie nicht frei.")
    elif not isinstance(skew_means, Real) or abs(skew_means - stats.skew(m)) > 0.01:
        problems.append("skew_means should be the skewness of your sample means. / skew_means soll die Schiefe eurer Stichprobenmittel sein.")
    if not isinstance(t_tests_ok, (bool, np.bool_)):
        problems.append("t_tests_ok should be True or False. / t_tests_ok soll True oder False sein.")
    elif not t_tests_ok:
        problems.append("t_tests_ok is off: do the means of the reports' samples look normal enough? / t_tests_ok stimmt nicht: Sehen die Mittelwerte der Berichtsstichproben normal genug aus?")
    for p in problems:
        print(p)
    return "approved" if not problems else "rejected"
''')

# Tasting: 154 tasters, randomly assigned by coin flip, 77 per recipe; ratings 1-10.
rng = np.random.default_rng(2)
old = np.clip(np.round(rng.normal(6.4, 1.7, 77)), 1, 10).astype(int)
new = np.clip(np.round(rng.normal(7.0, 1.7, 77)), 1, 10).astype(int)
recipe = np.array(["old"] * 77 + ["new"] * 77)
rating = np.concatenate([old, new])
order = np.random.default_rng(3).permutation(154)
recipe, rating = recipe[order], rating[order]
with open("data/tasting.py", "w") as f:
    f.write(f'''# Tasting: one row per taster (154 tasters, blind, assigned by coin flip): which recipe they
# tasted and their rating from 1 to 10. Loaded before your code runs.
import numpy as np
import pandas as pd

_new = {digits(recipe == "new")}
_rating = {wrap(rating, 30)}
ratings = pd.DataFrame({{
    "taster": range(1, 155),
    "recipe": ["new" if c == "1" else "old" for c in _new],
    "rating": _rating,
}})


def _tasting_check(diff, p_value, ship_recipe):
    """The tasting room's check: the difference in means, the two-sample t-test and the decision."""
    from numbers import Real
    problems = []
    if not isinstance(diff, Real) or abs(diff - 0.5974) > 0.001:
        problems.append("diff is off: the mean rating of the new recipe minus the mean of the old one. / diff stimmt nicht: die mittlere Bewertung des neuen Rezepts minus die des alten.")
    if not isinstance(p_value, Real) or abs(p_value - 0.0252) > 0.0005:
        if isinstance(p_value, Real) and abs(p_value - 0.0126) < 0.0005:
            problems.append("That's a one-sided p-value. / Das ist ein einseitiger p-Wert.")
        elif isinstance(p_value, Real) and abs(p_value - 0.0295) < 0.0005:
            problems.append("That's a paired t-test. Did the same tasters rate both recipes? / Das ist ein gepaarter t-Test. Haben dieselben Testpersonen beide Rezepte bewertet?")
        else:
            problems.append("The p-value is off: a two-sample t-test of the new against the old ratings. / Der p-Wert stimmt nicht: ein Zweistichproben-t-Test der neuen gegen die alten Bewertungen.")
    if not isinstance(ship_recipe, (bool, np.bool_)):
        problems.append("ship_recipe should be True or False. / ship_recipe soll True oder False sein.")
    elif ship_recipe:
        problems.append("ship_recipe is off: is the difference significant? / ship_recipe stimmt nicht: Ist der Unterschied signifikant?")
    for p in problems:
        print(p)
    return "approved" if not problems else "rejected"
''')

# Web shop checkout test: three variants, 30,000 sessions split at random, for 14 days.
rng = np.random.default_rng(1)
sessions = rng.multinomial(30000, [1 / 3] * 3)
conversions = [rng.binomial(n, p) for n, p in zip(sessions, [0.030, 0.031, 0.037])]
days = pd.date_range("2026-10-05", periods=14, freq="D")
rows = []
for variant, n, c in zip("ABC", sessions, conversions):
    per_day = rng.multinomial(n, [1 / 14] * 14)
    conv_day = rng.multivariate_hypergeometric(per_day, c)
    rows += [(str(d.date()), variant, int(s), int(k)) for d, s, k in zip(days, per_day, conv_day)]
rows.sort()
with open("data/shop.py", "w") as f:
    f.write(f'''# Web shop checkout test: sessions and orders per day and variant (A = old checkout,
# B = green button, C = one-page checkout), 5 to 18 October 2026. Loaded before your code runs.
import numpy as np
import pandas as pd

daily = pd.DataFrame({wrap(rows, 3, repr)}, columns=["date", "variant", "sessions", "orders"])


def _checkout_check(srm_p, chi2, p_value, winner, significant):
    """The dashboard's check: the sample ratio check, the chi-squared test, the winner and the verdict."""
    from numbers import Real
    problems = []
    if not isinstance(srm_p, Real) or abs(srm_p - 0.2187) > 0.001:
        problems.append("srm_p is off: a chi-squared goodness-of-fit test of the sessions per variant against an even split. / srm_p stimmt nicht: ein Chi-Quadrat-Anpassungstest der Sitzungen pro Variante gegen eine gleichmäßige Aufteilung.")
    if not isinstance(chi2, Real) or abs(chi2 - 16.68) > 0.02:
        if isinstance(chi2, Real) and chi2 < 1:
            problems.append("chi2 is far too small: did you put sessions instead of sessions without an order in the table? Each row needs orders and non-orders. / chi2 ist viel zu klein: Habt ihr Sitzungen statt Sitzungen ohne Bestellung in die Tabelle gesetzt? Jede Zeile braucht Bestellungen und Nicht-Bestellungen.")
        else:
            problems.append("chi2 is off: a chi-squared test of independence on a table with one row per variant: orders and sessions without an order. / chi2 stimmt nicht: ein Chi-Quadrat-Unabhängigkeitstest auf einer Tabelle mit einer Zeile pro Variante: Bestellungen und Sitzungen ohne Bestellung.")
    if not isinstance(p_value, Real) or abs(p_value - 0.00024) > 0.00002:
        problems.append("p_value is off: it's the p-value of that chi-squared test. / p_value stimmt nicht: Es ist der p-Wert dieses Chi-Quadrat-Tests.")
    if str(winner).strip().upper() != "C":
        problems.append("winner should be the variant with the highest conversion rate. / winner soll die Variante mit der höchsten Konversionsrate sein.")
    if not isinstance(significant, (bool, np.bool_)):
        problems.append("significant should be True or False. / significant soll True oder False sein.")
    elif not significant:
        problems.append("significant is off: compare p_value with the significance level. / significant stimmt nicht: Vergleicht p_value mit dem Signifikanzniveau.")
    for p in problems:
        print(p)
    return "approved" if not problems else "rejected"
''')
print("wrote data/scale.py, data/orders.py, data/tasting.py, data/shop.py")
