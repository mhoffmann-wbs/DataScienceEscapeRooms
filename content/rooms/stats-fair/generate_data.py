# Generates the data files of The Rigged Fair. Not bundled with the site.
# The graders' reference values (in the data files' _..._check functions) come from the
# reference solutions in solutions.json; update them if the data changes (the room tests will notice).
# Needs numpy (any Python with it works). Run from this folder:  python3 generate_data.py
import numpy as np


def ints(values, per_line=20):
    """A Python list literal of ints, wrapped."""
    values = [int(v) for v in values]
    lines = [", ".join(str(v) for v in values[i:i + per_line]) for i in range(0, len(values), per_line)]
    return "[\n    " + ",\n    ".join(lines) + ",\n]"


def digits(values, per_line=75):
    """A string of single digits, wrapped (compact for long logs)."""
    s = "".join(str(int(v)) for v in values)
    return "(\n" + "\n".join(f'    "{s[i:i + per_line]}"' for i in range(0, len(s), per_line)) + "\n)"


# Lemonade stand: 120 cups sold as 300 ml. The machine pours a bit low and varies. Three spilled
# cups were typed in as 0 (refunded), and one 298 was typed as 2980.
rng = np.random.default_rng(4)
cups = list(np.round(rng.normal(296.5, 8, 116)).astype(int))
for pos, value in [(17, 0), (52, 2980), (77, 0), (103, 0)]:
    cups.insert(pos, value)
with open("data/lemonade.py", "w") as f:
    f.write(f"""# Lemonade stand: the fill volume of every cup sold tonight, in ml (in the order sold).
# Loaded before your code runs.
import numpy as np
import pandas as pd

cups = pd.Series({ints(cups, 15)}, name="ml")


def _cup_check(mean_raw, median_raw, clean, mean, median, sd):
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
            problems.append(f"clean has {{len(clean) if hasattr(clean, '__len__') else 0}} cups, but the log has 116 real ones (see Kai's note). / clean hat {{len(clean) if hasattr(clean, '__len__') else 0}} Becher, das Protokoll hat aber 116 echte (siehe Kais Notiz).")
        elif abs(mean - 296.388) > 0.01 or median != 296:
            problems.append("mean and median should describe the clean cups. / mean und median sollen die bereinigten Becher beschreiben.")
        elif abs(sd - 7.840) < 0.005:
            problems.append("sd divides by n. For a sample, divide by n - 1 (pandas' .std() does that; numpy needs ddof=1). / sd teilt durch n. Für eine Stichprobe teilt durch n - 1 (pandas' .std() macht das; numpy braucht ddof=1).")
        elif abs(sd - 7.874) > 0.005:
            problems.append("sd is off: the standard deviation of the clean cups. / sd stimmt nicht: die Standardabweichung der bereinigten Becher.")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
""")

# Lucky Seven: two dice per game, 900 games. Both dice are loaded: 5 and 6 come up too rarely.
rng = np.random.default_rng(9)
weights = [0.22, 0.18, 0.18, 0.18, 0.12, 0.12]
die1 = rng.choice(np.arange(1, 7), 900, p=weights)
die2 = rng.choice(np.arange(1, 7), 900, p=weights)
with open("data/dice.py", "w") as f:
    f.write(f"""# Lucky Seven: the stall's game log, one row per game (two dice each), 900 games tonight.
# Loaded before your code runs.
import numpy as np
import pandas as pd

_die1 = {digits(die1)}
_die2 = {digits(die2)}
games = pd.DataFrame({{"die1": [int(c) for c in _die1], "die2": [int(c) for c in _die2]}})


def _dice_check(p_theory, wins, p_value):
    '''Lucky Seven's check: the theoretical chance, the wins and how unlikely they are.'''
    from numbers import Real
    problems = []
    if not isinstance(p_theory, Real) or abs(p_theory - 8 / 36) > 0.0005:
        if isinstance(p_theory, Real) and abs(p_theory - 6 / 36) < 0.0005:
            problems.append("p_theory only counts the 7s. An 11 wins too. / p_theory zählt nur die 7en. Eine 11 gewinnt auch.")
        else:
            problems.append("p_theory is off: winning outcomes divided by all 36 outcomes. / p_theory stimmt nicht: Gewinn-Ergebnisse geteilt durch alle 36 Ergebnisse.")
    if not isinstance(wins, Real) or wins != 163:
        problems.append("wins is off: count the games whose two dice add up to 7 or 11. / wins stimmt nicht: Zählt die Spiele, deren zwei Würfel zusammen 7 oder 11 ergeben.")
    if not isinstance(p_value, Real) or abs(p_value - 0.00140) > 0.0002:
        problems.append("p_value is off: the probability of at most that many wins in 900 games with fair dice (binomial). / p_value stimmt nicht: die Wahrscheinlichkeit für höchstens so viele Gewinne in 900 Spielen mit fairen Würfeln (binomial).")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
""")

# Duck pond: 6 ducks fished per game, 1 in 4 ducks has a star. An honest stall.
rng = np.random.default_rng(16)
stars = rng.binomial(6, 0.25, 400)
with open("data/ducks.py", "w") as f:
    f.write(f"""# Duck pond: the stall's game log: how many star ducks each player fished (6 ducks per game),
# 400 games tonight. Loaded before your code runs.
import numpy as np
import pandas as pd

_stars = {digits(stars)}
stars = pd.Series([int(c) for c in _stars], name="stars")


def _duck_check(p_win, profit, observed):
    '''The duck pond's check: the chance to win, Bruno's expected profit and tonight's share.'''
    from numbers import Real
    problems = []
    if not isinstance(p_win, Real) or abs(p_win - 0.16943) > 0.0001:
        problems.append("p_win is off: the chance of 3 or more stars when fishing 6 ducks. / p_win stimmt nicht: die Chance auf 3 oder mehr Sterne beim Angeln von 6 Enten.")
    if not isinstance(profit, Real) or abs(profit - 1.1528) > 0.005:
        problems.append("profit is off: what a game brings in minus the teddy's price times the chance to win it. / profit stimmt nicht: was ein Spiel einbringt, minus Teddypreis mal Gewinnchance.")
    if not isinstance(observed, Real) or abs(observed - 0.1675) > 0.0001:
        problems.append("observed is off: the share of tonight's games with 3 or more stars. / observed stimmt nicht: der Anteil der heutigen Spiele mit 3 oder mehr Sternen.")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
""")

# Ticket office: every visitor's spending on their cashless wristband (the population), and
# Bruno's survey of 40 guests in the VIP tent, who spend far more than the average visitor.
rng = np.random.default_rng(23)
spent = np.round(rng.gamma(2.2, 14.0, 6000)).astype(int) + 3
vip = np.round(rng.gamma(6.0, 9.5, 40)).astype(int) + 4
with open("data/tickets.py", "w") as f:
    f.write(f"""# Ticket office: what each of tonight's 6,000 visitors spent on their cashless wristband, in euros
# (wristbands), and the answers of Bruno's survey in the VIP tent (vip_survey, 40 guests).
# Loaded before your code runs.
import numpy as np
import pandas as pd

wristbands = pd.Series({ints(spent, 25)}, name="spent")

vip_survey = pd.Series({ints(vip, 20)}, name="spent")


def _ticket_check(mu, sample_mean, vip_mean, means):
    '''The ticket office's check: parameter, statistic, survey, and the spread of sample means.'''
    from numbers import Real
    problems = []
    if not isinstance(mu, Real) or abs(mu - 33.509) > 0.001:
        problems.append("mu is off: the mean of all wristbands. / mu stimmt nicht: der Mittelwert aller Armbänder.")
    if not isinstance(sample_mean, Real) or abs(sample_mean - 34.225) > 0.001:
        problems.append("sample_mean is off: the mean of wristbands.sample(40, random_state=7). / sample_mean stimmt nicht: der Mittelwert von wristbands.sample(40, random_state=7).")
    if not isinstance(vip_mean, Real) or abs(vip_mean - 65.175) > 0.001:
        problems.append("vip_mean is off: the mean of the VIP tent survey. / vip_mean stimmt nicht: der Mittelwert der Umfrage im VIP-Zelt.")
    try:
        m = np.asarray(means, dtype=float)
    except (TypeError, ValueError):
        m = np.array([])
    if m.ndim != 1 or len(m) < 500:
        problems.append("means needs the means of many random samples of 40 (1,000 is good). / means braucht die Mittelwerte vieler Zufallsstichproben von 40 (1.000 sind gut).")
    elif abs(m.mean() - 33.51) > 0.6 or not 2.6 < m.std() < 4.0:
        problems.append("Your means don't look like means of random samples of 40 wristbands. / Eure Mittelwerte sehen nicht nach Zufallsstichproben von 40 Armbändern aus.")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
""")
print("wrote data/lemonade.py, data/dice.py, data/ducks.py, data/tickets.py")
