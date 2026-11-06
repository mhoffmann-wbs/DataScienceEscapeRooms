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


def strs(values, per_line=6):
    """A Python list literal of strings, wrapped."""
    lines = [", ".join(repr(v) for v in values[i:i + per_line]) for i in range(0, len(values), per_line)]
    return "[\n        " + ",\n        ".join(lines) + ",\n    ]"


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


def _dice_check(p_theory, wins, p_value, threshold, rigged):
    '''Lucky Seven's check: the theoretical chance, the wins, how unlikely they are, and the verdict.'''
    from numbers import Real
    problems = []
    if not isinstance(p_theory, Real) or abs(p_theory - 8 / 36) > 0.0005:
        if isinstance(p_theory, Real) and abs(p_theory - 6 / 36) < 0.0005:
            problems.append("p_theory only counts one of the winning sums. The sign says which win. / p_theory zählt nur eine der Gewinnsummen. Das Schild sagt, welche gewinnen.")
        else:
            problems.append("p_theory is off: winning outcomes (see the sign) divided by all 36 outcomes. / p_theory stimmt nicht: Gewinn-Ergebnisse (siehe Schild) geteilt durch alle 36 Ergebnisse.")
    if not isinstance(wins, Real) or wins != 163:
        problems.append("wins is off: count the games whose two dice add up to a winning sum (see the sign). / wins stimmt nicht: Zählt die Spiele, deren zwei Würfel zusammen eine Gewinnsumme ergeben (siehe Schild).")
    if not isinstance(p_value, Real) or abs(p_value - 0.00140) > 0.0002:
        problems.append("p_value is off: the probability of at most that many wins in 900 games with fair dice (binomial). / p_value stimmt nicht: die Wahrscheinlichkeit für höchstens so viele Gewinne in 900 Spielen mit fairen Würfeln (binomial).")
    if not isinstance(threshold, Real) or abs(threshold - 0.01) > 1e-9:
        if isinstance(threshold, Real) and threshold in (1, 100):
            problems.append("threshold should be a probability between 0 and 1. / threshold soll eine Wahrscheinlichkeit zwischen 0 und 1 sein.")
        else:
            problems.append("threshold is off: the probability below which the inspection handbook calls a game suspicious. / threshold stimmt nicht: die Wahrscheinlichkeit, unter der das Prüfhandbuch ein Spiel verdächtig nennt.")
    if not isinstance(rigged, (bool, np.bool_)):
        problems.append("rigged should be True or False: compare p_value with the threshold. / rigged soll True oder False sein: Vergleicht p_value mit dem Schwellenwert.")
    elif not rigged:
        problems.append("rigged is off: is p_value below the handbook's threshold? / rigged stimmt nicht: Liegt p_value unter dem Schwellenwert des Handbuchs?")
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
# Bruno's surveys. The flyer's source is the VIP tent on Saturday (40 guests), who spend far more
# than the average visitor; the other surveys are there so that the team has to read the flyer.
rng = np.random.default_rng(23)
spent = np.round(rng.gamma(2.2, 14.0, 6000)).astype(int) + 3
vip = np.round(rng.gamma(6.0, 9.5, 40)).astype(int) + 4
groups = [
    ("Main entrance", "Saturday", np.round(rng.gamma(2.2, 14.0, 40)).astype(int) + 3),
    ("VIP tent", "Friday", np.round(rng.gamma(6.0, 8.0, 30)).astype(int) + 4),
    ("VIP tent", "Saturday", vip),
    ("Beer garden", "Friday", np.round(rng.gamma(3.0, 13.0, 25)).astype(int) + 3),
]
rows = [(place, day, int(v)) for place, day, values in groups for v in values]
rows = [rows[i] for i in rng.permutation(len(rows))]
# Means a team gets from the wrong survey (or from all of them); the check names those.
others = [round(float(np.mean(values)), 3) for place, day, values in groups if values is not vip]
others.append(round(float(np.mean([r[2] for r in rows])), 3))
print("survey means:", [(place, day, len(values), round(float(np.mean(values)), 3)) for place, day, values in groups])
with open("data/tickets.py", "w") as f:
    f.write(f"""# Ticket office: what each of tonight's 6,000 visitors spent on their cashless wristband, in euros
# (wristbands), and Bruno's surveys: one row per guest asked, with where and when (surveys).
# Loaded before your code runs.
import numpy as np
import pandas as pd

wristbands = pd.Series({ints(spent, 25)}, name="spent")

surveys = pd.DataFrame({{
    "place": {strs([r[0] for r in rows], 6)},
    "day": {strs([r[1] for r in rows], 8)},
    "spent": {ints([r[2] for r in rows], 20).replace(chr(10) + "    ", chr(10) + "        ").replace(chr(10) + "]", chr(10) + "    ]")},
}})


def _ticket_check(mu, sample_mean, flyer_mean, means):
    '''The ticket office's check: parameter, statistic, the flyer's survey, and the spread of sample means.'''
    from numbers import Real
    problems = []
    if not isinstance(mu, Real) or abs(mu - 33.509) > 0.001:
        problems.append("mu is off: the mean of all wristbands. / mu stimmt nicht: der Mittelwert aller Armbänder.")
    if not isinstance(sample_mean, Real) or abs(sample_mean - 34.225) > 0.001:
        problems.append("sample_mean is off: the mean of wristbands.sample(40, random_state=7). / sample_mean stimmt nicht: der Mittelwert von wristbands.sample(40, random_state=7).")
    if not isinstance(flyer_mean, Real) or abs(flyer_mean - 65.175) > 0.001:
        if isinstance(flyer_mean, Real) and any(abs(flyer_mean - o) < 0.01 for o in {others!r}):
            problems.append("flyer_mean comes from the wrong survey: the flyer's small print says which one. / flyer_mean kommt aus der falschen Umfrage: Das Kleingedruckte auf dem Flyer sagt, welche.")
        else:
            problems.append("flyer_mean is off: the mean of the one survey behind the flyer (filter surveys by place and day). / flyer_mean stimmt nicht: der Mittelwert der einen Umfrage hinter dem Flyer (filtert surveys nach place und day).")
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
