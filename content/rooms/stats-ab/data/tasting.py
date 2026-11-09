# Tasting: one row per taster (154 tasters, blind, assigned by coin flip): which recipe they
# tasted and their rating from 1 to 10. Loaded before your code runs.
import numpy as np
import pandas as pd

_new = (
    "00111010110110000101010010001111111111111000101001100000110101000101000001101"
    "11111001110110011110011101010011010011100011010110100110101010010000001000001"
)
_rating = [
    7, 7, 10, 6, 8, 5, 8, 5, 6, 8, 7, 4, 8, 5, 7, 4, 8, 7, 3, 10, 6, 8, 4, 8, 8, 8, 8, 5, 5, 5,
    8, 8, 6, 8, 6, 6, 5, 7, 5, 7, 6, 6, 9, 6, 5, 5, 9, 3, 8, 6, 6, 8, 8, 7, 8, 6, 8, 6, 6, 10,
    6, 5, 6, 7, 6, 6, 8, 7, 7, 2, 4, 6, 7, 5, 7, 6, 9, 6, 7, 5, 6, 4, 4, 5, 6, 8, 6, 9, 10, 6,
    2, 8, 6, 7, 9, 7, 8, 5, 9, 6, 7, 4, 9, 10, 8, 8, 8, 7, 8, 6, 10, 6, 7, 6, 6, 7, 5, 4, 6, 9,
    7, 7, 5, 5, 9, 7, 5, 8, 5, 7, 9, 8, 7, 7, 6, 6, 9, 7, 7, 7, 7, 8, 9, 8, 10, 5, 8, 4, 7, 7,
    6, 7, 8, 10,
]
ratings = pd.DataFrame({
    "taster": range(1, 155),
    "recipe": ["new" if c == "1" else "old" for c in _new],
    "rating": _rating,
})


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
