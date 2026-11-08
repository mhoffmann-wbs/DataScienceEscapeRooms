# Generates the data files of The Seed Bank. Not bundled with the site.
# The graders' reference values (in the data files' _..._check functions) are worked out here
# with scikit-learn and checked against the reference solutions by the room tests.
# Needs numpy, pandas and scikit-learn. Run from this folder:  python3 generate_data.py
import warnings

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")
COLUMNS = ["length_mm", "width_mm", "weight_mg", "brightness"]

# Six heritage species: means and spreads of length, width, weight and the camera's brightness
# (0 black to 255 white). Weight runs from 26 mg to 600 mg, so without scaling it rules every distance.
SPECIES = ["rye", "lentil", "bean", "oat", "buckwheat", "pea"]
MEANS = {
    "rye": (7.0, 2.3, 30, 140), "lentil": (5.0, 5.2, 55, 125), "bean": (15.0, 10.0, 600, 85),
    "oat": (10.5, 2.8, 33, 205), "buckwheat": (5.6, 4.0, 26, 45), "pea": (7.6, 7.2, 240, 175),
}
SPREADS = {
    "rye": (0.45, 0.18, 5, 10), "lentil": (0.30, 0.30, 7, 9), "bean": (1.0, 0.8, 95, 10),
    "oat": (0.6, 0.2, 5, 9), "buckwheat": (0.35, 0.25, 4, 8), "pea": (0.5, 0.5, 35, 10),
}
COUNTS = {"rye": 300, "lentil": 240, "bean": 180, "oat": 280, "buckwheat": 260, "pea": 232}
# The curator's catalogue numbers (species cards); the final enters them, 0 for a stranger.
CATALOGUE = {"buckwheat": 1, "pea": 2, "rye": 3, "bean": 4, "oat": 5, "lentil": 6}
# Weed seeds the flood washed in: further from every species than any real envelope.
WEEDS = [(24, 12, 520, 45), (23, 2.6, 28, 185), (2.2, 1.6, 2, 250), (10, 9, 900, 230),
         (3.0, 3.0, 9, 250), (20, 3, 60, 140), (16, 11, 700, 250)]
FOREIGN_RULE = 2.0
# The order slips: last year's sample seed of each field, measured by the machine.
FIELDS = ["oat", "lentil", None, "pea", "rye", "buckwheat"]
FIELD_STRANGER = (21, 2.4, 24, 195)

rng = np.random.default_rng(11)


def measure(species, n):
    """n seeds of one species, rounded as the machine prints them."""
    x = rng.normal(MEANS[species], SPREADS[species], (n, 4))
    return np.column_stack([x[:, 0].round(1), x[:, 1].round(1), x[:, 2].round(), x[:, 3].round().clip(0, 255)])


def frame(x, index_name):
    df = pd.DataFrame(x, columns=COLUMNS)
    df[["weight_mg", "brightness"]] = df[["weight_mg", "brightness"]].astype(int)
    df.index = pd.RangeIndex(1, len(df) + 1, name=index_name)
    return df


def csv(df):
    return df.to_csv(lineterminator="\n").strip()


def digits(values, per_line=75):
    s = "".join(str(int(v)) for v in values)
    return "(\n" + "\n".join(f'    "{s[i:i + per_line]}"' for i in range(0, len(s), per_line)) + "\n)"


HEADER = '''import io as _io
import numpy as np
import pandas as pd


def _problems_or(problems, ok):
    for p in problems:
        print(p)
    return ok if not problems else "rejected"


def _labels(labels, n):
    try:
        a = np.asarray(labels).ravel()
    except Exception:
        return None
    return a if len(a) == n else None
'''

# --- The weighing tray: one shelf, three species (rye, lentil, bean) ------------------------------
TRAY_SPECIES = ["rye", "lentil", "bean"]
tray_parts = [(s, measure(s, n)) for s, n in zip(TRAY_SPECIES, (86, 72, 42))]
tray_x = np.vstack([x for _, x in tray_parts])
tray_y = np.concatenate([[i] * len(x) for i, (_, x) in enumerate(tray_parts)])
order = rng.permutation(len(tray_x))
tray_x, tray_y = tray_x[order], tray_y[order]
tray = frame(tray_x, "envelope")
# Four tagged envelopes per species, for the clue.
tags = {s: sorted((np.flatnonzero(tray_y == i)[:4] + 1).tolist()) for i, s in enumerate(TRAY_SPECIES)}

raw = KMeans(3, n_init=10, random_state=0).fit_predict(tray.values)
scaled = KMeans(3, n_init=10, random_state=0).fit_predict(StandardScaler().fit_transform(tray.values))
same = lambda labels: all(len(set(labels[tray_y == i])) == 1 for i in range(3)) and len(set(labels)) == 3
assert same(scaled) and not same(raw), "the tray must only sort right once scaled"

with open("data/tray.py", "w") as f:
    f.write(f'''# The weighing tray: 200 envelopes from one shelf of the seed bank, as the sorting machine
# measured them. Loaded before your code runs.
{HEADER}
tray = pd.read_csv(_io.StringIO("""{csv(tray)}
"""), index_col="envelope")

_TRAY_SPECIES = np.array([int(c) for c in {digits(tray_y)}])
_TRAY_TAGS = {tags!r}


def _tray_check(labels):
    \'\'\'The tray's check: three groups, each holding exactly one species.\'\'\'
    a = _labels(labels, len(tray))
    if a is None:
        return _problems_or(["labels needs one group per envelope on the tray (200). / labels braucht eine Gruppe pro Umschlag auf dem Tablett (200)."], "")
    problems = []
    if len(set(a.tolist())) != 3:
        problems.append(f"labels has {{len(set(a.tolist()))}} groups; the shelf label says three species. / labels hat {{len(set(a.tolist()))}} Gruppen; das Regaletikett sagt drei Arten.")
    else:
        groups = [set(a[_TRAY_SPECIES == i].tolist()) for i in range(3)]
        if any(len(g) > 1 for g in groups) or len(set().union(*groups)) < 3:
            mixed = [s for s, i in zip(("rye", "lentil", "bean"), range(3))
                     if any(set(a[_TRAY_SPECIES == i].tolist()) & set(a[_TRAY_SPECIES == j].tolist()) for j in range(3) if j != i)]
            split = [s for s, g in zip(("rye", "lentil", "bean"), groups) if len(g) > 1]
            if split:
                problems.append("Envelopes with the same tag ended up in different groups. Compare your groups with the tags on the tray. / Umschläge mit demselben Etikett sind in verschiedenen Gruppen gelandet. Vergleicht eure Gruppen mit den Etiketten auf dem Tablett.")
            if mixed:
                problems.append("Envelopes with different tags share a group. Look at the numbers: which column decides the distances? / Umschläge mit verschiedenen Etiketten teilen sich eine Gruppe. Schaut auf die Zahlen: Welche Spalte bestimmt die Abstände?")
    return _problems_or(problems, "sorted")
''')

# --- The archive: 1,500 envelopes of six species, plus the weed seeds --------------------------
parts = [measure(s, COUNTS[s]) for s in SPECIES]
weeds = np.array(WEEDS, dtype=float)
arch_x = np.vstack(parts + [weeds])
arch_y = np.concatenate([[i] * COUNTS[s] for i, s in enumerate(SPECIES)] + [[9] * len(weeds)])
order = rng.permutation(len(arch_x))
arch_x, arch_y = arch_x[order], arch_y[order]
archive = frame(arch_x, "envelope")
X = archive.values.astype(float)
scaler = StandardScaler().fit(X)
Xs = scaler.transform(X)
genuine = arch_y != 9

inertias, raw_inertias, silhouettes = [], [], []
for k in range(1, 11):
    km = KMeans(k, n_init=10, random_state=0).fit(Xs)
    inertias.append(km.inertia_)
    raw_inertias.append(KMeans(k, n_init=10, random_state=0).fit(X).inertia_)
    if k > 1:
        silhouettes.append(silhouette_score(Xs, km.labels_))
assert int(np.argmax(silhouettes)) + 2 == 6, silhouettes
best = KMeans(6, n_init=10, random_state=0).fit(Xs)
for seed in range(8):
    other = KMeans(6, n_init=10, random_state=seed).fit(Xs)
    assert abs(other.inertia_ - best.inertia_) < 1e-6 and all(
        len(set(other.labels_[genuine & (arch_y == i)])) == 1 for i in range(6)), "every seed must find the six species"
dist = best.transform(Xs).min(axis=1)
assert dist[genuine].max() < FOREIGN_RULE - 0.25 and dist[~genuine].min() > FOREIGN_RULE + 0.25, (dist[genuine].max(), np.sort(dist[~genuine]))
foreign = sorted((np.flatnonzero(~genuine) + 1).tolist())

# The old sorter starts from six envelopes of its service sheet: two beans, two peas, a rye, an oat.
first = lambda species, i: int(np.flatnonzero(arch_y == SPECIES.index(species))[i] + 1)
start = [first("bean", 0), first("pea", 0), first("rye", 0), first("bean", 1), first("oat", 0), first("pea", 1)]
old = KMeans(6, init=scaler.transform(archive.loc[start].values.astype(float)), n_init=1).fit(Xs)
biggest = int(np.bincount(old.labels_).max())
assert old.inertia_ > 2 * best.inertia_, (old.inertia_, best.inertia_)

# The order slips.
samples = np.vstack([measure(s, 1) if s else np.array([FIELD_STRANGER], dtype=float) for s in FIELDS])
fields = frame(samples, "field")
far = best.transform(scaler.transform(fields.values.astype(float))).min(axis=1)
assert all((d > FOREIGN_RULE + 0.25) == (s is None) for d, s in zip(far, FIELDS)), far
answer = [CATALOGUE[s] if s else 0 for s in FIELDS]
centres = {s: [round(float(v), 3) for v in archive[genuine & (arch_y == i)].mean()] for i, s in enumerate(SPECIES)}

with open("data/archive.py", "w") as f:
    f.write(f'''# The seed bank's archive after the flood: every envelope as the sorting machine measured it,
# and the six farmers' order slips. Loaded before your code runs.
{HEADER}
archive = pd.read_csv(_io.StringIO("""{csv(archive)}
"""), index_col="envelope")

orders = pd.read_csv(_io.StringIO("""{csv(fields)}
"""), index_col="field")

_SPECIES = np.array([int(c) for c in {digits(arch_y)}])
_CENTRES = {[centres[s] for s in SPECIES]!r}
_CATALOGUE = {[CATALOGUE[s] for s in SPECIES]!r}
_INERTIAS = {[round(v, 2) for v in inertias]!r}
_RAW_INERTIAS = {[round(v) for v in raw_inertias]!r}
_SILHOUETTES = {[round(v, 4) for v in silhouettes]!r}
_OLD_START = {start!r}
_OLD_INERTIA = {round(old.inertia_, 2)!r}
_FOREIGN = {foreign!r}
_ANSWER = {answer!r}


def _model(km, name):
    if not hasattr(km, "cluster_centers_"):
        return f"{{name}} must be a fitted KMeans model (call .fit first). / {{name}} muss ein trainiertes KMeans-Modell sein (erst .fit aufrufen)."
    if np.shape(km.cluster_centers_)[1] != 4:
        return f"{{name}} must be fitted on all four columns of the archive. / {{name}} muss auf allen vier Spalten des Archivs trainiert sein."
    return None


def _elbow_check(inertias, silhouettes, k):
    \'\'\'The elbow's check: inertia for k = 1..10 and silhouette for k = 2..10 on the scaled archive, and the chosen k.\'\'\'
    try:
        ins = [float(v) for v in (inertias.values() if isinstance(inertias, dict) else inertias)]
        sil = [float(v) for v in (silhouettes.values() if isinstance(silhouettes, dict) else silhouettes)]
    except (TypeError, ValueError):
        return _problems_or(["inertias and silhouettes must be lists of numbers. / inertias und silhouettes müssen Listen von Zahlen sein."], "")
    problems = []
    if len(ins) != 10 or len(sil) != 9:
        problems.append(f"inertias needs 10 values (k = 1 to 10) and silhouettes 9 (k = 2 to 10); you have {{len(ins)}} and {{len(sil)}}. / inertias braucht 10 Werte (k = 1 bis 10) und silhouettes 9 (k = 2 bis 10); ihr habt {{len(ins)}} und {{len(sil)}}.")
    elif abs(ins[0] - _RAW_INERTIAS[0]) < 0.01 * _RAW_INERTIAS[0]:
        problems.append("These inertias are in milligrams squared: the archive isn't scaled yet. / Diese Inertias sind in Milligramm zum Quadrat: Das Archiv ist noch nicht skaliert.")
    elif any(abs(a - b) > 0.01 * b for a, b in zip(ins[:5], _INERTIAS[:5])):
        problems.append("The inertias don't match the scaled archive. Scale all four columns with one StandardScaler, then fit KMeans for each k. / Die Inertias passen nicht zum skalierten Archiv. Skaliert alle vier Spalten mit einem StandardScaler und trainiert dann KMeans für jedes k.")
    elif ins[5] > _INERTIAS[5] * 1.05:
        problems.append("The inertia for k = 6 is higher than it can be: one run of KMeans got stuck. Let it start several times (n_init=10). / Die Inertia für k = 6 ist höher als möglich: Ein Durchlauf von KMeans ist hängen geblieben. Lasst es mehrmals starten (n_init=10).")
    elif abs(sil[4] - _SILHOUETTES[4]) > 0.01:
        problems.append("The silhouette for k = 6 is off: compute it on the scaled archive with the labels of that k. / Die Silhouette für k = 6 stimmt nicht: Berechnet sie auf dem skalierten Archiv mit den Labels dieses k.")
    elif k != 6:
        problems.append("k is not the number of clusters both the elbow and the silhouette point to. / k ist nicht die Clusterzahl, auf die Ellbogen und Silhouette beide zeigen.")
    return _problems_or(problems, "six")


def _card_check(km, scaler, catalogue):
    \'\'\'The cards' check: every cluster of the scaled archive gets the right catalogue number.\'\'\'
    problem = _model(km, "km")
    if problem:
        return _problems_or([problem], "")
    if len(km.cluster_centers_) != 6:
        return _problems_or([f"km has {{len(km.cluster_centers_)}} clusters; the elbow says how many species there are. / km hat {{len(km.cluster_centers_)}} Cluster; der Ellbogen sagt, wie viele Arten es gibt."], "")
    if not hasattr(scaler, "transform"):
        return _problems_or(["scaler must be the StandardScaler fitted on the archive. / scaler muss der auf dem Archiv trainierte StandardScaler sein."], "")
    try:
        cat = {{int(key): int(v) for key, v in dict(catalogue).items()}}
    except (TypeError, ValueError):
        return _problems_or(["catalogue must be a dict from cluster number to catalogue number, e.g. {{0: 3, 1: 5, ...}}. / catalogue muss ein Dict von Clusternummer zu Katalognummer sein, z. B. {{0: 3, 1: 5, ...}}."], "")
    labels = km.predict(scaler.transform(pd.DataFrame(_CENTRES, columns=archive.columns)))
    problems = []
    if len(set(labels.tolist())) < 6:
        problems.append("km puts two species into one cluster. Was it fitted on the scaled archive? / km steckt zwei Arten in einen Cluster. Wurde es auf dem skalierten Archiv trainiert?")
    else:
        wrong = sum(cat.get(int(l)) != c for l, c in zip(labels, _CATALOGUE))
        if wrong:
            problems.append(f"{{wrong}} of the six clusters have the wrong catalogue number. Turn the centres back into millimetres and milligrams and compare them with the cards. / {{wrong}} der sechs Cluster haben die falsche Katalognummer. Rechnet die Zentren in Millimeter und Milligramm zurück und vergleicht sie mit den Karten.")
    return _problems_or(problems, "matched")


def _sorter_check(old, best):
    \'\'\'The old sorter's check: its run from the service sheet's start, and a run that finds the best clusters.\'\'\'
    problems = [p for p in (_model(old, "old"), _model(best, "best")) if p]
    if problems:
        return _problems_or(problems, "")
    if abs(best.inertia_ - _INERTIAS[5]) > 0.01 * _INERTIAS[5]:
        problems.append("best should be KMeans with six clusters on the scaled archive, started several times (n_init=10). / best soll KMeans mit sechs Clustern auf dem skalierten Archiv sein, mehrmals gestartet (n_init=10).")
    if abs(old.inertia_ - _OLD_INERTIA) > 0.01 * _OLD_INERTIA:
        if abs(old.inertia_ - _INERTIAS[5]) < 0.01 * _INERTIAS[5]:
            problems.append("old found the best clusters, so it didn't run like the old sorter. Start it from the six envelopes on the service sheet, once. / old hat die besten Cluster gefunden, ist also nicht wie die alte Sortiermaschine gelaufen. Startet es einmal von den sechs Umschlägen auf dem Wartungsblatt.")
        else:
            problems.append("old doesn't match the old sorter: init= the six envelopes from the service sheet (scaled, in that order), n_init=1. / old passt nicht zur alten Sortiermaschine: init= die sechs Umschläge vom Wartungsblatt (skaliert, in dieser Reihenfolge), n_init=1.")
    return _problems_or(problems, "explained")


def _foreign_check(foreign):
    \'\'\'The foreign seeds' check: exactly the envelopes further than the inspection rule's limit from every centre.\'\'\'
    try:
        got = sorted(int(v) for v in foreign)
    except (TypeError, ValueError):
        return _problems_or(["foreign must be a list of envelope numbers. / foreign muss eine Liste von Umschlagnummern sein."], "")
    problems = []
    if got != _FOREIGN:
        if len(got) > 50:
            problems.append(f"foreign has {{len(got)}} envelopes. Measure each envelope's distance to its nearest centre in the scaled archive. / foreign hat {{len(got)}} Umschläge. Messt den Abstand jedes Umschlags zu seinem nächsten Zentrum im skalierten Archiv.")
        elif got and min(got) == 0:
            problems.append("Envelope numbers start at 1: use the archive's index, not row positions. / Umschlagnummern beginnen bei 1: Nehmt den Index des Archivs, nicht die Zeilenpositionen.")
        else:
            problems.append(f"foreign has {{len(got)}} envelopes, and they aren't exactly the ones beyond the inspection rule's limit. / foreign hat {{len(got)}} Umschläge, und es sind nicht genau die jenseits der Grenze aus der Prüfregel.")
    return _problems_or(problems, "quarantined")


def _sowing_check(fields):
    \'\'\'The final check: the catalogue number for each field, 0 for a seed that is no species of ours.\'\'\'
    try:
        got = [int(v) for v in (fields.values() if isinstance(fields, dict) else fields)]
    except (TypeError, ValueError):
        return _problems_or(["fields must be a list of six catalogue numbers, field 1 first. / fields muss eine Liste von sechs Katalognummern sein, Feld 1 zuerst."], "")
    problems = []
    if len(got) != 6:
        problems.append(f"fields needs six numbers, one per field; you have {{len(got)}}. / fields braucht sechs Zahlen, eine pro Feld; ihr habt {{len(got)}}.")
    else:
        stranger = _ANSWER.index(0) + 1
        if got[stranger - 1] != 0:
            problems.append(f"Field {{stranger}}'s sample is far from every species. KMeans puts every seed in some cluster, even a weed: check the distance before you trust a label. / Die Probe von Feld {{stranger}} liegt weit weg von jeder Art. KMeans steckt jeden Samen in irgendeinen Cluster, auch Unkraut: Prüft den Abstand, bevor ihr einem Label traut.")
        wrong = [str(i + 1) for i, (a, b) in enumerate(zip(got, _ANSWER)) if a != b and b != 0]
        if wrong and sorted(got) == list(range(6)):
            problems.append("These look like cluster numbers. The farmers order by catalogue number (the species cards). / Das sehen nach Clusternummern aus. Die Bauern bestellen nach Katalognummer (die Artenkarten).")
        elif wrong:
            problems.append(f"Wrong species for field(s) {{', '.join(wrong)}}. / Falsche Art für Feld(er) {{', '.join(wrong)}}.")
    return _problems_or(problems, "sown")
''')

print("tray tags:", tags)
print("inertias:", [round(v, 1) for v in inertias])
print("silhouettes:", [round(v, 3) for v in silhouettes])
print("old sorter start:", start, "inertia", round(old.inertia_, 1), "drawers", sorted(np.bincount(old.labels_).tolist()), "biggest", biggest)
print("foreign:", foreign, "distances", np.sort(dist[~genuine]).round(2), "genuine max", dist[genuine].max().round(2))
print("fields:", answer, "distances", far.round(2))
print("centres:", {s: [round(v, 1) for v in c] for s, c in centres.items()})
print("species sizes:", {s: int((arch_y == i).sum()) for i, s in enumerate(SPECIES)})
