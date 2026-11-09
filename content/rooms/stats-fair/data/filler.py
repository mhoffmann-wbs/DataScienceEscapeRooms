# The lemonade stand's filling machine. Nothing to load.
import numpy as np


def _filler_check(z, share_below, legal, target):
    """The filling machine's check, with some room for the values rounded on the calibration sticker."""
    from numbers import Real
    problems = []
    if not isinstance(z, Real) or abs(z - (-1.443)) > 0.02:
        problems.append("z is off: how many standard deviations the limit for a short cup lies from the mean (negative: below it). / z stimmt nicht: wie viele Standardabweichungen die Grenze für einen zu knappen Becher vom Mittelwert entfernt liegt (negativ: darunter).")
    if not isinstance(share_below, Real) or abs(share_below - 0.0745) > 0.002:
        if isinstance(share_below, Real) and abs(share_below - 7.45) < 0.2:
            problems.append("share_below looks like a percentage. Give it as a share between 0 and 1. / share_below sieht nach Prozent aus. Gebt es als Anteil zwischen 0 und 1 an.")
        else:
            problems.append("share_below is off: the share of a normal distribution below the limit. / share_below stimmt nicht: der Anteil einer Normalverteilung unter der Grenze.")
    if not isinstance(legal, (bool, np.bool_)):
        problems.append("legal should be True or False. / legal soll True oder False sein.")
    elif legal:
        problems.append("legal is off: compare share_below with the share the law allows. / legal stimmt nicht: Vergleicht share_below mit dem Anteil, den das Gesetz erlaubt.")
    if not isinstance(target, Real) or abs(target - 301.2) > 0.15:
        problems.append("target is off: the mean that puts exactly the allowed share of cups below the limit, with the same standard deviation. / target stimmt nicht: der Mittelwert, bei dem genau der erlaubte Anteil der Becher unter der Grenze liegt, bei gleicher Standardabweichung.")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
