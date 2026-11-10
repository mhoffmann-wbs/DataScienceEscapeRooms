# Generates the data files of The Night Post: handwritten digits, old Iris's weights and the
# training logbook. Not bundled with the site.
# The digits are drawn here from strokes (no MNIST): 16 x 16 pixels, stored with 16 grey levels
# and zlib-packed to keep the files small. Old Iris is trained with the room's TensorFlow-style
# model (content/python/tensorflow.py), so its weights load into it as they are.
# Needs numpy. Run from this folder:  python3 generate_data.py   (takes about a minute)
import base64
import importlib.util
import json
import sys
import zlib

sys.dont_write_bytecode = True  # no __pycache__ next to content/python/tensorflow.py

import numpy as np

spec = importlib.util.spec_from_file_location("tensorflow", "../../python/tensorflow.py")
tf = importlib.util.module_from_spec(spec)
sys.modules["tensorflow"] = tf
spec.loader.exec_module(tf)

# ---- handwriting ----

# Strokes per digit in a unit box (x to the right, y down): (smooth, control points).
# Smooth strokes are Catmull-Rom curves, the others straight lines.
STROKES = {
    0: [(True, [(0.5, 0.08), (0.76, 0.22), (0.8, 0.55), (0.62, 0.9), (0.36, 0.9), (0.2, 0.6), (0.24, 0.24), (0.5, 0.08)])],
    1: [(False, [(0.3, 0.28), (0.56, 0.08), (0.56, 0.92)])],
    2: [(True, [(0.2, 0.3), (0.38, 0.1), (0.64, 0.09), (0.78, 0.28), (0.68, 0.5), (0.4, 0.72), (0.2, 0.92)]), (False, [(0.2, 0.92), (0.84, 0.9)])],
    3: [(True, [(0.22, 0.18), (0.5, 0.07), (0.74, 0.2), (0.68, 0.4), (0.44, 0.5)]), (True, [(0.44, 0.5), (0.72, 0.58), (0.76, 0.8), (0.5, 0.93), (0.2, 0.84)])],
    4: [(False, [(0.6, 0.08), (0.16, 0.64), (0.86, 0.64)]), (False, [(0.62, 0.3), (0.62, 0.93)])],
    5: [(False, [(0.8, 0.09), (0.3, 0.09), (0.25, 0.46)]), (True, [(0.25, 0.46), (0.52, 0.38), (0.77, 0.55), (0.72, 0.84), (0.45, 0.93), (0.2, 0.83)])],
    6: [(True, [(0.72, 0.09), (0.42, 0.24), (0.25, 0.55), (0.3, 0.85), (0.55, 0.93), (0.76, 0.76), (0.67, 0.53), (0.42, 0.51), (0.26, 0.66)])],
    7: [(False, [(0.18, 0.1), (0.82, 0.1), (0.4, 0.93)])],
    8: [(True, [(0.5, 0.48), (0.27, 0.3), (0.5, 0.08), (0.73, 0.28), (0.5, 0.48), (0.24, 0.7), (0.5, 0.93), (0.76, 0.7), (0.5, 0.48)])],
    9: [(True, [(0.74, 0.36), (0.5, 0.5), (0.27, 0.34), (0.42, 0.09), (0.7, 0.12), (0.74, 0.36)]), (False, [(0.74, 0.36), (0.66, 0.93)])],
}
CROSSBAR_7 = (False, [(0.36, 0.5), (0.74, 0.5)])  # half the sevens are crossed, as many Germans write them


def catmull(pts, n=24):
    pts = np.asarray(pts, float)
    p = np.vstack([pts[0], pts, pts[-1]])
    t = np.linspace(0, 1, n, endpoint=False)[:, None]
    out = [0.5 * (2 * p[i] + (-p[i - 1] + p[i + 1]) * t + (2 * p[i - 1] - 5 * p[i] + 4 * p[i + 1] - p[i + 2]) * t ** 2
                  + (-p[i - 1] + 3 * p[i] - 3 * p[i + 1] + p[i + 2]) * t ** 3) for i in range(1, len(p) - 2)]
    return np.vstack(out + [pts[-1:]])


def polyline(pts, n=24):
    pts = np.asarray(pts, float)
    t = np.linspace(0, 1, n, endpoint=False)[:, None]
    return np.vstack([pts[i] + (pts[i + 1] - pts[i]) * t for i in range(len(pts) - 1)] + [pts[-1:]])


S = 4  # supersampling
GRID = (np.stack(np.meshgrid(np.arange(16 * S), np.arange(16 * S)), -1).reshape(-1, 2) + 0.5) / S


def draw(digit, rng, messy):
    """One handwritten digit as 16 x 16 ink levels 0..15 (0 = paper)."""
    strokes = list(STROKES[digit]) + ([CROSSBAR_7] if digit == 7 and rng.random() < 0.5 else [])
    angle = np.deg2rad(rng.normal(0, 7 * messy))
    shear = rng.normal(0, 0.12 * messy)
    sx, sy = rng.uniform(0.8, 1.08), rng.uniform(0.86, 1.04)
    shift = rng.normal(0, 0.035 * messy, 2)
    a = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]) @ np.array([[sx, shear], [0, sy]])
    pts = np.vstack([(catmull if smooth else polyline)(np.asarray(p) + rng.normal(0, 0.025 * messy, (len(p), 2)))
                     for smooth, p in strokes])
    pts = (pts - 0.5) @ a.T + 0.5 + shift
    px = np.column_stack([2 + pts[:, 0] * 12, 1 + pts[:, 1] * 14])
    d = np.sqrt(((GRID[:, None, :] - px[None, :, :]) ** 2).sum(-1)).min(1)
    ink = np.clip((rng.uniform(0.55, 0.95) - d) * S / 1.5 + 0.5, 0, 1).reshape(16 * S, 16 * S)
    img = ink.reshape(16, S, 16, S).mean((1, 3)) * rng.uniform(0.8, 1.0)
    return np.round(img * 15).astype(np.uint8)


def drawn(labels, seed, messy):
    rng = np.random.default_rng(seed)
    return np.stack([draw(int(d), rng, messy) for d in labels])


def dataset(n, seed, messy=1.6):
    labels = np.random.default_rng(seed).integers(0, 10, n)
    return drawn(labels, seed + 1000, messy), labels


def bytes_of(levels):
    """Ink levels 0..15 as Iris stores them: 0 = paper, 255 = ink."""
    return levels.astype(np.uint8) * 17


def packed(levels):
    """Ink levels 0..15, zlib-packed and base64-encoded, wrapped into lines for a .py file."""
    s = base64.b64encode(zlib.compress(levels.astype(np.uint8).tobytes(), 9)).decode()
    return "(\n" + "\n".join(f'    "{s[i:i + 100]}"' for i in range(0, len(s), 100)) + "\n)"


def digit_string(labels):
    s = "".join(str(int(d)) for d in labels)
    return "(\n" + "\n".join(f'    "{s[i:i + 100]}"' for i in range(0, len(s), 100)) + "\n)"


def floats(a):
    s = base64.b64encode(np.asarray(a, "<f4").tobytes()).decode()
    return "(\n" + "\n".join(f'    "{s[i:i + 100]}"' for i in range(0, len(s), 100)) + "\n)"


UNPACK = '''
import base64 as _base64
import zlib as _zlib
import numpy as np


def _levels(data, shape):
    return np.frombuffer(_zlib.decompress(_base64.b64decode(data)), np.uint8).reshape(shape) * np.uint8(17)


def _digits(text):
    return np.array([int(c) for c in text], dtype=np.int64)


def _floats(data, shape):
    return np.frombuffer(_base64.b64decode(data), "<f4").reshape(shape).copy()
'''

COMMON = '''

def _problems_or(problems, ok):
    for p in problems:
        print(p)
    return ok if not problems else "rejected"


def _array(a, shape):
    try:
        a = np.asarray(a, dtype=float)
    except (TypeError, ValueError):
        return None
    return a if a.shape == shape else None
'''


def write(name, header, body):
    with open(f"data/{name}", "w") as f:
        f.write(header.strip() + "\n" + UNPACK + COMMON + body)
    print("wrote", name)


# ---- the archive: Iris's training and test cards ----

x_train, y_train = dataset(3000, 1)
x_test, y_test = dataset(600, 2)
print("drew the archive", flush=True)
x_train_scaled = bytes_of(x_train) / 255
x_test_scaled = bytes_of(x_test) / 255


def iris2():
    L = tf.keras.layers
    return tf.keras.Sequential([tf.keras.Input((16, 16)), L.Flatten(), L.Dense(64, activation="relu"),
                                L.Dense(32, activation="relu"), L.Dense(10, activation="softmax")])


# Reference models for the urgent letters: many seeds and epoch counts, all must agree.
references = []
for seed in range(8):
    tf.keras.utils.set_random_seed(seed)
    m = iris2()
    m.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    m.fit(x_train_scaled, y_train, epochs=[6, 10, 15, 20][seed % 4], validation_split=0.2, verbose=0)
    acc = m.evaluate(x_test_scaled, y_test, verbose=0)[1]
    print("reference model", seed, "test accuracy", round(acc, 3), flush=True)
    references.append(m)

# The six urgent letters: one bin number each, written neatly, every reference model sure of it.
URGENT_BINS = [4, 7, 1, 9, 2, 6]
rng = np.random.default_rng(77)
urgent = []
for b in URGENT_BINS:
    for attempt in range(500):
        img = draw(b, rng, 0.8)
        x = bytes_of(img)[None] / 255
        if all(m.predict(x, verbose=0)[0, b] > 0.95 for m in references):
            urgent.append(img)
            break
    else:
        raise SystemExit(f"no urgent letter {b} that every reference model reads")
    print("urgent letter", b, "after", attempt + 1, "tries", flush=True)
urgent = np.stack(urgent)
# As the scanner delivers them: one flat line of 256 values per letter, paper 255 and ink 0.
urgent_scan = 255 - bytes_of(urgent).reshape(6, 256)
for m in references:
    assert (m.predict(urgent_scan.reshape(6, 16, 16) / 255, verbose=0).argmax(1) != URGENT_BINS).sum() >= 3, "unconverted scans should misread"

ARCHIVE_GRADERS = '''

def _iris2_layout(model):
    """Problems with a model that should be Iris 2 from the blueprint (draft C)."""
    import tensorflow as tf
    if not isinstance(model, tf.keras.Sequential):
        return ["model should be a tf.keras.Sequential model. / model soll ein tf.keras.Sequential-Modell sein."]
    dense = [l for l in model.layers if isinstance(l, tf.keras.layers.Dense)]
    if [l.units for l in dense] != [64, 32, 10] or not model.built or tuple(model.input_shape) != (None, 16, 16):
        return ["model isn't Iris 2: 16 x 16 inputs, then the layers of the draft that fits the chip. / model ist nicht Iris 2: 16 x 16 Eingaben, dann die Schichten des Entwurfs, der auf den Chip passt."]
    return []


def _accuracy(model):
    """Accuracy on the test cards, with the inputs scaled the way the model expects."""
    import tensorflow as tf
    rescales = any(isinstance(l, tf.keras.layers.Rescaling) for l in model.layers)
    probs = model.predict(_x_test if rescales else _x_test / 255, verbose=0)
    return float((probs.argmax(axis=1) == _y_test).mean())


def _apprentice_check(model):
    """Jonas's script: Iris 2 trained well enough for service."""
    problems = _iris2_layout(model)
    if not problems:
        acc = _accuracy(model)
        if not acc >= 0.85:
            problems.append(f"model reads only {acc:.0%} of the test cards; Iris needs at least 85 %. Look at the loss in the training output. / model liest nur {acc:.0%} der Testkarten; Iris braucht mindestens 85 %. Schaut euch den loss in der Trainingsausgabe an.")
    return _problems_or(problems, "in service")


def _sort_check(model, letters, bins):
    """The midnight sort: a well-trained Iris 2 (trained with validation cards), the urgent letters in the
    format the model expects, and the bins that model reads from them."""
    import tensorflow as tf
    problems = _iris2_layout(model)
    rescales = False
    if not problems:
        rescales = any(isinstance(l, tf.keras.layers.Rescaling) for l in model.layers)
        acc = _accuracy(model)
        if not acc >= 0.9:
            problems.append(f"model reads only {acc:.0%} of the test cards; the night sort needs at least 90 %. / model liest nur {acc:.0%} der Testkarten; die Nachtsortierung braucht mindestens 90 %.")
        elif "val_loss" not in (getattr(getattr(model, "history", None), "history", None) or {}):
            problems.append("model wasn't trained with validation cards: Ferdinand's rules keep 20 % of the cards aside (validation_split) and let EarlyStopping watch them. / model wurde nicht mit Validierungskarten trainiert: Ferdinands Regeln legen 20 % der Karten beiseite (validation_split) und lassen EarlyStopping sie beobachten.")
    expected = 1 - _urgent.reshape(6, 16, 16) / 255
    l = _array(letters, (6, 16, 16))
    if l is None:
        problems.append("letters should be an array of shape (6, 16, 16): the six urgent letters as 16 x 16 images. / letters soll ein Array der Form (6, 16, 16) sein: die sechs Eilbriefe als 16 x 16-Bilder.")
    elif not (np.allclose(l, expected, atol=1e-6) or (rescales and np.allclose(l, 255 * expected, atol=1e-3))):
        problems.append("letters aren't in the format Iris reads yet: the scanner's format has to be converted just like at the scanner. Look at them with show_images. / letters haben noch nicht das Format, das Iris liest: Das Format des Scanners muss so umgerechnet werden wie am Scanner. Schaut sie mit show_images an.")
    try:
        bins = [int(b) for b in bins]
    except (TypeError, ValueError):
        bins = None
    if bins is None or len(bins) != 6:
        problems.append("bins should be a list of 6 numbers: the bin of each urgent letter, in order. / bins soll eine Liste von 6 Zahlen sein: das Fach jedes Eilbriefs, der Reihe nach.")
    elif bins != _URGENT_BINS:
        problems.append("bins are wrong. Look at the urgent letters with show_images: do they look like Iris's cards? / bins stimmen nicht. Schaut euch die Eilbriefe mit show_images an: Sehen sie aus wie Iris' Karten?")
    elif not problems:
        try:
            read = model.predict(l, verbose=0).argmax(axis=1).tolist()
        except Exception:
            read = None
        if read != bins:
            problems.append("bins aren't what your model reads from your letters: let Iris read them with predict and argmax. / bins sind nicht das, was euer Modell aus euren letters liest: Lasst Iris sie mit predict und argmax lesen.")
    return _problems_or(problems, "sorted")
'''

write("archive.py", '''
# Iris's archive: handwritten digit cards she learned from, and the six urgent letters.
# Loaded before your code runs.
''', f'''

# Training and test cards: 16 x 16 pixels each, stored as bytes, 0 = paper and 255 = ink.
_x_train = _levels({packed(x_train)}, (3000, 16, 16))
_y_train = _digits({digit_string(y_train)})
_x_test = _levels({packed(x_test)}, (600, 16, 16))
_y_test = _digits({digit_string(y_test)})
x_train, y_train, x_test, y_test = _x_train.copy(), _y_train.copy(), _x_test.copy(), _y_test.copy()

# The urgent letters as the scanner delivers them: one line of 256 values per letter.
urgent = 255 - _levels({packed(urgent)}, (6, 256))
_urgent = urgent.copy()
_URGENT_BINS = {URGENT_BINS}
''' + ARCHIVE_GRADERS)

# ---- the scanner strip: one envelope's postcode ----

POSTCODE = "35781"
strip_levels = drawn([int(c) for c in POSTCODE], 35, 0.9)          # (5, 16, 16)
assert all(m.predict(bytes_of(strip_levels) / 255, verbose=0).argmax(1).tolist() == [int(c) for c in POSTCODE] for m in references)
strip = strip_levels.transpose(1, 0, 2).reshape(16, 80)            # the five digits side by side
stream = 255 - bytes_of(strip).reshape(-1)                         # line by line, paper 255

write("scanner.py", '''
# The envelope scanner's output: one test envelope's postcode. Loaded before your code runs.
''', f'''

stream = 255 - _levels({packed(strip)}, (1280,))
_DIGITS = 1 - stream.reshape(16, 5, 16).transpose(1, 0, 2) / 255


def _scanner_check(digits, postcode):
    """The scanner: five digit images in Iris's format, and the postcode read from them."""
    problems = []
    d = _array(digits, (5, 16, 16))
    if d is None:
        problems.append("digits should be an array of shape (5, 16, 16): five digits of 16 x 16 pixels. / digits soll ein Array der Form (5, 16, 16) sein: fünf Ziffern mit 16 x 16 Pixeln.")
    elif np.allclose(d, _DIGITS, atol=1e-6):
        pass
    elif np.allclose(d, 1 - _DIGITS, atol=1e-6) or np.allclose(d, 255 * (1 - _DIGITS), atol=1e-3):
        problems.append("digits are the right shape, but still in the scanner's format, not in Iris's. / digits haben die richtige Form, sind aber noch im Format des Scanners, nicht in dem von Iris.")
    elif np.allclose(d, 255 * _DIGITS, atol=1e-3):
        problems.append("digits are the right way round, but not on Iris's scale yet. / digits sind richtig herum, aber noch nicht auf Iris' Skala.")
    else:
        problems.append("digits don't show the five digits yet. Look at them with show_images. / digits zeigen die fünf Ziffern noch nicht. Schaut sie mit show_images an.")
    if str(postcode).strip() != {POSTCODE!r}:
        problems.append("postcode isn't what the envelope says. Write it as a string of five digits, e.g. \\"12345\\". / postcode ist nicht, was auf dem Umschlag steht. Schreibt sie als Text aus fünf Ziffern, z. B. \\"12345\\".")
    return _problems_or(problems, "read")
''')

# ---- old Iris: a small network that reads most cards, but not all ----

tf.keras.utils.set_random_seed(5)
L = tf.keras.layers
old = tf.keras.Sequential([tf.keras.Input((16, 16)), L.Flatten(), L.Dense(16, activation="relu"), L.Dense(10, activation="softmax")])
old.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
old.fit(x_train_scaled[:2000], y_train[:2000], epochs=10, verbose=0)
print("old Iris test accuracy", round(old.evaluate(x_test_scaled, y_test, verbose=0)[1], 3))
w1, b1, w2, b2 = old.get_weights()

# Six self-test cards: five old Iris reads with confidence, one it confidently gets wrong.
CARD_DIGITS = [3, 0, 5, 7, 1, 8]
WRONG_CARD = 3
rng = np.random.default_rng(3)
cards = []
for i, digit in enumerate(CARD_DIGITS):
    for attempt in range(3000):
        img = draw(digit, rng, 1.0 if i != WRONG_CARD else 1.8)
        p = old.predict(bytes_of(img)[None] / 255, verbose=0)[0]
        guess, lead = int(p.argmax()), np.sort(p)[-1] - np.sort(p)[-2]
        if (i != WRONG_CARD and guess == digit and lead > 0.5) or (i == WRONG_CARD and guess != digit and lead > 0.5 and p[digit] < 0.05):
            cards.append(img)
            break
    else:
        raise SystemExit(f"no self-test card for {digit}")
    print("self-test card", digit, "after", attempt + 1, "tries", flush=True)
cards = np.stack(cards)
cards_float = bytes_of(cards) / 255
reading = "".join(str(d) for d in old.predict(cards_float, verbose=0).argmax(1))
print("self-test cards", CARD_DIGITS, "old Iris reads", reading)

write("wiring.py", '''
# Old Iris's last backup: the weights of her network and her six self-test cards.
# Loaded before your code runs.
''', f'''

# Self-test cards in Iris's format: 16 x 16 pixels, 0.0 = paper and 1.0 = ink.
cards = _levels({packed(cards)}, (6, 16, 16)) / 255

# Weights: 256 inputs -> 16 hidden neurons (W1, b1) -> 10 outputs (W2, b2).
W1 = _floats({floats(w1)}, (256, 16))
b1 = _floats({floats(b1)}, (16,))
W2 = _floats({floats(w2)}, (16, 10))
b2 = _floats({floats(b2)}, (10,))

_HIDDEN = np.maximum(cards.reshape(6, 256) @ W1 + b1, 0)
_SCORES = _HIDDEN @ W2 + b2
_PROBS = np.exp(_SCORES - _SCORES.max(axis=1, keepdims=True))
_PROBS /= _PROBS.sum(axis=1, keepdims=True)


def _wiring_check(hidden, probs, reading, old_iris):
    """Old Iris: the forward pass by hand, the reading, and the same network rebuilt in Keras."""
    import tensorflow as tf
    problems = []
    h = _array(hidden, (6, 16))
    if h is None or not np.allclose(h, _HIDDEN, atol=1e-4):
        problems.append("hidden is off: one row per card, 16 values each: the cards as rows of 256 pixels, times W1, plus b1, then ReLU. / hidden stimmt nicht: eine Zeile pro Karte mit 16 Werten: die Karten als Zeilen aus 256 Pixeln, mal W1, plus b1, dann ReLU.")
    p = _array(probs, (6, 10))
    if p is None or not np.allclose(p, _PROBS, atol=1e-4):
        if p is not None and np.allclose(p.sum(axis=1), 1, atol=1e-4):
            problems.append("probs add up to 1 per card, but the values are off: start from hidden, times W2, plus b2. / probs ergeben pro Karte 1, aber die Werte stimmen nicht: Geht von hidden aus, mal W2, plus b2.")
        else:
            problems.append("probs is off: the output layer's scores turned into probabilities with softmax (each row adds up to 1). / probs stimmt nicht: die Werte der Ausgabeschicht, mit Softmax in Wahrscheinlichkeiten umgerechnet (jede Zeile ergibt 1).")
    if str(reading).strip() != {reading!r}:
        problems.append("reading isn't what old Iris reads: for each card the digit with the highest probability, as one string of six digits. / reading ist nicht, was die alte Iris liest: für jede Karte die Ziffer mit der höchsten Wahrscheinlichkeit, als ein Text aus sechs Ziffern.")
    if not isinstance(old_iris, tf.keras.Sequential):
        problems.append("old_iris should be a tf.keras.Sequential model with old Iris's layers. / old_iris soll ein tf.keras.Sequential-Modell mit den Schichten der alten Iris sein.")
    else:
        try:
            same = np.allclose(old_iris.predict(cards, verbose=0), _PROBS, atol=1e-4)
        except Exception:
            same = False
        if not same:
            problems.append("old_iris doesn't predict what your hand calculation gives yet: same layers (16 neurons with ReLU, 10 with softmax), then set_weights([W1, b1, W2, b2]). / old_iris sagt noch nicht vorher, was eure Handrechnung ergibt: gleiche Schichten (16 Neuronen mit ReLU, 10 mit Softmax), dann set_weights([W1, b1, W2, b2]).")
    return _problems_or(problems, "self-test passed")
''')

# ---- the blueprint: only a grader ----

write("blueprint.py", '''
# The blueprint station has no data; this file holds its check. Loaded before your code runs.
''', '''

def _blueprint_check(model):
    """The blueprint: the draft that fits the memory chip, built as a Keras model."""
    import tensorflow as tf
    problems = []
    if not isinstance(model, tf.keras.Sequential):
        return _problems_or(["model should be a tf.keras.Sequential model. / model soll ein tf.keras.Sequential-Modell sein."], "")
    if not model.built or tuple(model.input_shape) != (None, 16, 16):
        problems.append("model's input should be one 16 x 16 card: start with tf.keras.Input(shape=(16, 16)). / Die Eingabe von model soll eine 16 x 16-Karte sein: Beginnt mit tf.keras.Input(shape=(16, 16)).")
    elif not isinstance(model.layers[0], tf.keras.layers.Flatten):
        problems.append("A Dense layer needs each card as one row of 256 numbers: start with a Flatten layer. / Eine Dense-Schicht braucht jede Karte als eine Zeile aus 256 Zahlen: Beginnt mit einer Flatten-Schicht.")
    dense = [l for l in model.layers if isinstance(l, tf.keras.layers.Dense)]
    if not problems:
        if model.count_params() > 20000:
            problems.append(f"model has {model.count_params():,} parameters: too many for Iris's memory chip. / model hat {model.count_params():,} Parameter: zu viele für Iris' Speicherchip.")
        elif [l.units for l in dense] != [64, 32, 10]:
            problems.append("model's layers aren't one of Ferdinand's drafts. / Die Schichten von model sind keiner von Ferdinands Entwürfen.")
        elif [l._act for l in dense] != ["relu", "relu", "softmax"]:
            problems.append("The units are right; check the activation of each layer. / Die Neuronen stimmen; prüft die Aktivierung jeder Schicht.")
    return _problems_or(problems, "fits")
''')

# ---- Ferdinand's logbook: a training run that overfits ----

val_loss = [1.62, 1.05, 0.78, 0.62, 0.53, 0.47, 0.43, 0.40, 0.42, 0.41, 0.37, 0.35, 0.34, 0.33, 0.325, 0.32, 0.31,
            0.315, 0.33, 0.35, 0.37, 0.39, 0.42, 0.44, 0.47, 0.49, 0.52, 0.55, 0.57, 0.60]
n = len(val_loss)
e = np.arange(n)
loss = np.round(1.9 * np.exp(-e / 4.2) + 0.03 + 0.012 * np.cos(e), 4)
accuracy = np.round(np.minimum(1 - 0.62 * np.exp(-e / 3.2) + 0.004 * np.sin(e), 1.0), 4)
val_accuracy = np.round(np.concatenate([1 - 0.55 * np.exp(-e[:17] / 3.5), 0.93 - 0.0035 * e[:n - 17]]) + 0.003 * np.sin(2 * e), 4)
BEST_EPOCH, STOP_EPOCH = 17, 20
assert int(np.argmin(val_loss)) + 1 == BEST_EPOCH
log = {"accuracy": accuracy.tolist(), "loss": loss.tolist(), "val_accuracy": val_accuracy.tolist(), "val_loss": val_loss}

write("logbook.py", '''
# Ferdinand's training logbook: the history of one long training run of Iris 2.
# Loaded before your code runs.
''', f'''

# One value per epoch, like history.history after model.fit.
log = {json.dumps(log)}


class _Snapshot:
    """Stands in for the model while the logbook is replayed: its "weights" are the epoch they come from."""

    def __init__(self):
        self.stop_training = False
        self.weights_from = None

    def get_weights(self):
        return self.weights_from

    def set_weights(self, weights):
        self.weights_from = weights


def replay(callback, history):
    """Replays a training history (like log) through a callback such as EarlyStopping, as if training
    ran again. Prints what happens and returns the epoch training stops at (counting from 1),
    or None if it runs to the end. Afterwards, callback.model.weights_from says which epoch's
    weights the model keeps."""
    model = _Snapshot()
    callback.set_model(model)
    callback.on_train_begin()
    epochs = len(next(iter(history.values())))
    stopped = None
    for epoch in range(epochs):
        model.weights_from = epoch + 1
        callback.on_epoch_end(epoch, {{k: v[epoch] for k, v in history.items()}})
        if model.stop_training:
            stopped = epoch + 1
            break
    callback.on_train_end()
    print(f"Training stops at epoch {{stopped}}." if stopped else f"Training runs all {{epochs}} epochs.",
          f"The model keeps the weights of epoch {{model.weights_from}}.")
    return stopped


def _logbook_check(best_epoch, stopper, stop_epoch, kept_epoch):
    """The logbook: the best epoch, Ferdinand's early stopping, where it stops and which weights it keeps."""
    import tensorflow as tf
    problems = []
    if best_epoch != {BEST_EPOCH}:
        if best_epoch == {BEST_EPOCH - 1}:
            problems.append("best_epoch is one too low: Keras counts epochs from 1, Python from 0. / best_epoch ist um eins zu klein: Keras zählt Epochen ab 1, Python ab 0.")
        else:
            problems.append("best_epoch is off: the epoch with the lowest validation loss. / best_epoch stimmt nicht: die Epoche mit dem niedrigsten Validierungs-Loss.")
    if not isinstance(stopper, tf.keras.callbacks.EarlyStopping):
        problems.append("stopper should be a tf.keras.callbacks.EarlyStopping. / stopper soll ein tf.keras.callbacks.EarlyStopping sein.")
    elif stopper.monitor != "val_loss" or stopper.patience != 3 or not stopper.restore_best_weights:
        problems.append("stopper isn't set up right yet: what it watches, its patience, and which weights it keeps. / stopper ist noch nicht richtig eingestellt: was er beobachtet, seine Geduld und welche Gewichte er behält.")
    if stop_epoch != {STOP_EPOCH}:
        problems.append("stop_epoch is off: the epoch at which your stopper ends the training (replay returns it). / stop_epoch stimmt nicht: die Epoche, in der euer stopper das Training beendet (replay gibt sie zurück).")
    if kept_epoch != {BEST_EPOCH}:
        problems.append("kept_epoch is off: from which epoch are the weights the model keeps? / kept_epoch stimmt nicht: Aus welcher Epoche stammen die Gewichte, die das Modell behält?")
    return _problems_or(problems, "logged")
''')

print("postcode", POSTCODE, "| self-test reading", reading, "| urgent bins", URGENT_BINS,
      "| best epoch", BEST_EPOCH, "stop epoch", STOP_EPOCH)
