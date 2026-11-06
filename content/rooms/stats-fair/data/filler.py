# The lemonade stand's filling machine. Nothing to load: the machine's values come from the cup log.


def _filler_check(z, share_below, target):
    """The filling machine's check, with some room for the values rounded on the calibration sticker."""
    from numbers import Real
    problems = []
    if not isinstance(z, Real) or abs(z - (-1.443)) > 0.02:
        problems.append("z is off: how many standard deviations 285 ml lies from the mean (negative: below it). / z stimmt nicht: wie viele Standardabweichungen 285 ml vom Mittelwert entfernt liegt (negativ: darunter).")
    if not isinstance(share_below, Real) or abs(share_below - 0.0745) > 0.002:
        if isinstance(share_below, Real) and abs(share_below - 7.45) < 0.2:
            problems.append("share_below looks like a percentage. Give it as a share between 0 and 1. / share_below sieht nach Prozent aus. Gebt es als Anteil zwischen 0 und 1 an.")
        else:
            problems.append("share_below is off: the share of a normal distribution below 285 ml. / share_below stimmt nicht: der Anteil einer Normalverteilung unter 285 ml.")
    if not isinstance(target, Real) or abs(target - 301.2) > 0.15:
        problems.append("target is off: the mean that puts exactly 2 % of cups below 285 ml, with the same standard deviation. / target stimmt nicht: der Mittelwert, bei dem genau 2 % der Becher unter 285 ml liegen, bei gleicher Standardabweichung.")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
