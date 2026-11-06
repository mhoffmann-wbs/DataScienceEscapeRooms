# Web shop checkout test: sessions and orders per day and variant (A = old checkout,
# B = green button, C = one-page checkout), 5 to 18 October 2026. Loaded before your code runs.
import numpy as np
import pandas as pd

daily = pd.DataFrame([
    ('2026-10-05', 'A', 693, 26), ('2026-10-05', 'B', 709, 18), ('2026-10-05', 'C', 705, 28),
    ('2026-10-06', 'A', 711, 18), ('2026-10-06', 'B', 718, 21), ('2026-10-06', 'C', 756, 26),
    ('2026-10-07', 'A', 701, 21), ('2026-10-07', 'B', 747, 24), ('2026-10-07', 'C', 700, 27),
    ('2026-10-08', 'A', 714, 26), ('2026-10-08', 'B', 731, 29), ('2026-10-08', 'C', 696, 29),
    ('2026-10-09', 'A', 678, 23), ('2026-10-09', 'B', 697, 21), ('2026-10-09', 'C', 721, 31),
    ('2026-10-10', 'A', 702, 20), ('2026-10-10', 'B', 676, 19), ('2026-10-10', 'C', 702, 35),
    ('2026-10-11', 'A', 664, 22), ('2026-10-11', 'B', 693, 17), ('2026-10-11', 'C', 710, 27),
    ('2026-10-12', 'A', 751, 19), ('2026-10-12', 'B', 730, 27), ('2026-10-12', 'C', 744, 27),
    ('2026-10-13', 'A', 685, 25), ('2026-10-13', 'B', 717, 26), ('2026-10-13', 'C', 755, 31),
    ('2026-10-14', 'A', 760, 20), ('2026-10-14', 'B', 690, 28), ('2026-10-14', 'C', 711, 30),
    ('2026-10-15', 'A', 728, 19), ('2026-10-15', 'B', 726, 22), ('2026-10-15', 'C', 701, 24),
    ('2026-10-16', 'A', 718, 17), ('2026-10-16', 'B', 704, 20), ('2026-10-16', 'C', 718, 26),
    ('2026-10-17', 'A', 704, 19), ('2026-10-17', 'B', 670, 24), ('2026-10-17', 'C', 781, 28),
    ('2026-10-18', 'A', 743, 25), ('2026-10-18', 'B', 700, 18), ('2026-10-18', 'C', 740, 35),
], columns=["date", "variant", "sessions", "orders"])


def _checkout_check(srm_p, chi2, p_value, winner):
    """The dashboard's check: the sample ratio check, the chi-squared test and the winner."""
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
    for p in problems:
        print(p)
    return "approved" if not problems else "rejected"
