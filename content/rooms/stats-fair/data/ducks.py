# Duck pond: the stall's game log: how many star ducks each player fished (6 ducks per game),
# 400 games tonight. Loaded before your code runs.
import numpy as np
import pandas as pd

_stars = (
    "210120330212023420113121012122022204333210222031042122211201112123002120031"
    "031022021412220212321421211111211211224122111302123034123115112100212123013"
    "202211002113001012031010112211203101001211020102001111021100200110101013012"
    "111121131331120031210422311131111312232111224221241021233321322221223101113"
    "012310222302223032021222221132221323104221211011202120112111201032233233042"
    "2243013000222013201342111"
)
stars = pd.Series([int(c) for c in _stars], name="stars")


def _duck_check(p_win, profit, observed, honest):
    '''The duck pond's check: the chance to win, Bruno's expected profit and tonight's share.'''
    from numbers import Real
    problems = []
    if not isinstance(p_win, Real) or abs(p_win - 0.16943) > 0.0001:
        problems.append("p_win is off: the chance of winning a teddy in one game. / p_win stimmt nicht: die Chance, in einem Spiel einen Teddy zu gewinnen.")
    if not isinstance(profit, Real) or abs(profit - 1.1528) > 0.005:
        problems.append("profit is off: what a game brings in minus the teddy's price times the chance to win it. / profit stimmt nicht: was ein Spiel einbringt, minus Teddypreis mal Gewinnchance.")
    if not isinstance(observed, Real) or abs(observed - 0.1675) > 0.0001:
        problems.append("observed is off: the share of tonight's games that won a teddy. / observed stimmt nicht: der Anteil der heutigen Spiele, die einen Teddy gewonnen haben.")
    if not isinstance(honest, (bool, np.bool_)):
        problems.append("honest should be True or False. / honest soll True oder False sein.")
    elif not honest:
        problems.append("honest is off: compare tonight's share with the chance in theory. / honest stimmt nicht: Vergleicht den heutigen Anteil mit der Chance in der Theorie.")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
