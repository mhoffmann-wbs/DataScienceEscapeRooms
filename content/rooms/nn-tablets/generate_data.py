# Generates the data files of The Varda Tablets: depth scans of clay fragments with signs of the
# (invented) Varda script, a worn tally tablet, a cylinder seal's impression, two pretrained readers
# and the jar's lid. Not bundled with the site.
# The signs are drawn here from strokes: 24 x 24 depth scans, stored with 8 depth levels and
# zlib-packed to keep the files small. The readers are trained with the room's TensorFlow-style
# model (content/python/tensorflow.py), so their weights load into it as they are.
# Needs numpy. Run from this folder:  python3 generate_data.py   (takes a few minutes)
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
L = tf.keras.layers

# ---- the Varda script ----


def arc(cx, cy, r, a0=0, a1=2 * np.pi, n=10):
    t = np.linspace(a0, a1, n)
    return list(zip(cx + r * np.cos(t), cy + r * np.sin(t)))


# Strokes per sign in a unit box (x to the right, y down): (smooth, control points).
SIGNS = {
    0: [(True, arc(0.5, 0.5, 0.4)), (False, [(0.46, 0.5), (0.54, 0.5)])],                                   # sun
    1: [(False, [(0.05, 0.35), (0.27, 0.15), (0.5, 0.35), (0.73, 0.15), (0.95, 0.35)]),
        (False, [(0.05, 0.8), (0.27, 0.6), (0.5, 0.8), (0.73, 0.6), (0.95, 0.8)])],                         # water
    2: [(False, [(0.05, 0.9), (0.3, 0.15), (0.5, 0.6), (0.7, 0.15), (0.95, 0.9)])],                         # mountain
    3: [(False, [(0.5, 0.05), (0.5, 0.95)]), (False, [(0.15, 0.2), (0.5, 0.5), (0.85, 0.2)]),
        (False, [(0.2, 0.55), (0.5, 0.8), (0.8, 0.55)])],                                                     # tree
    4: [(False, [(0.2, 0.5), (0.2, 0.92), (0.8, 0.92), (0.8, 0.5)]), (False, [(0.05, 0.55), (0.5, 0.08), (0.95, 0.55)])],  # house
    5: [(False, [(0.5, 0.05), (0.5, 0.95)]), (False, [(0.1, 0.28), (0.9, 0.72)]), (False, [(0.1, 0.72), (0.9, 0.28)])],  # star
    6: [(False, [(0.05, 0.2), (0.95, 0.2)])] + [(False, [(x, 0.2), (x, 0.85)]) for x in (0.15, 0.38, 0.62, 0.85)],     # comb
    7: [(True, arc(0.5, 1.0, 0.62, -2.3, -0.84)), (True, arc(0.5, 0.0, 0.62, 2.3, 0.84)), (True, arc(0.5, 0.5, 0.12))],  # eye
}
VALUES = ["ra", "mi", "ko", "ta", "re", "lu", "ne", "sa"]  # what the seal's caption teaches


def catmull(pts, n=16):
    pts = np.asarray(pts, float)
    p = np.vstack([pts[0], pts, pts[-1]])
    t = np.linspace(0, 1, n, endpoint=False)[:, None]
    out = [0.5 * (2 * p[i] + (-p[i - 1] + p[i + 1]) * t + (2 * p[i - 1] - 5 * p[i] + 4 * p[i + 1] - p[i + 2]) * t ** 2
                  + (-p[i - 1] + 3 * p[i] - 3 * p[i + 1] + p[i + 2]) * t ** 3) for i in range(1, len(p) - 2)]
    return np.vstack(out + [pts[-1:]])


def polyline(pts, n=16):
    pts = np.asarray(pts, float)
    t = np.linspace(0, 1, n, endpoint=False)[:, None]
    return np.vstack([pts[i] + (pts[i + 1] - pts[i]) * t for i in range(len(pts) - 1)] + [pts[-1:]])


S = 3  # supersampling


def grid(h, w):
    return (np.stack(np.meshgrid(np.arange(w * S), np.arange(h * S)), -1).reshape(-1, 2) + 0.5) / S


GRID = grid(24, 24)


def sign_points(sign, rng, messy):
    """The sign's stroke points around (0, 0), jittered, rotated and sheared by `messy`."""
    angle = np.deg2rad(rng.normal(0, 8 * messy))
    shear = rng.normal(0, 0.1 * messy)
    a = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]) @ np.array([[1, shear], [0, 1]])
    pts = np.vstack([(catmull if smooth else polyline)(np.asarray(p) + rng.normal(0, 0.03 * messy, (len(p), 2)))
                     for smooth, p in SIGNS[sign]])
    return (pts - 0.5) @ a.T


def depth_of(px, h, w, width):
    """Depth 0..1 of strokes through points px (in pixels) on an h x w scan, antialiased."""
    g = GRID if (h, w) == (24, 24) else grid(h, w)
    d = np.sqrt(((g[:, None, :] - px[None]) ** 2).sum(-1)).min(1)
    return np.clip((width - d) * S / 1.5 + 0.5, 0, 1).reshape(h * S, w * S).reshape(h, S, w, S).mean((1, 3))


def press(sign, rng, messy=1.0, centred=False, size=None, at=None):
    """One fragment: a 24 x 24 depth scan with the sign pressed in, as levels 0..7 (0 = surface)."""
    size = size or rng.uniform(10, 13)
    if at is None:
        at = 12 + rng.normal(0, 0.5, 2) if centred else rng.uniform(size / 2 + 0.5, 24 - size / 2 - 0.5, 2)
    depth = depth_of(sign_points(sign, rng, messy) * size + at, 24, 24, rng.uniform(0.55, 0.85))
    img = depth * rng.uniform(0.7, 1.0) * 7 + np.abs(rng.normal(0, 0.23, (24, 24)))
    return np.clip(np.round(img), 0, 7).astype(np.uint8)


def dataset(n, seed, messy=1.0, centred=False):
    rng = np.random.default_rng(seed)
    labels = rng.integers(0, 8, n)
    return np.stack([press(int(s), rng, messy, centred) for s in labels]), labels


def bytes_of(levels):
    """Depth levels 0..7 as the scanner stores them: bytes from 0 (surface) to 255 (deepest)."""
    return ((levels.astype(np.uint16) * 255 + 3) // 7).astype(np.uint8)


def scaled(levels):
    """Levels as the reader wants them: (n, 24, 24, 1), 0.0 = surface, 1.0 = deepest."""
    return bytes_of(levels)[..., None] / 255


# ---- packing ----

def lines(s):
    return "(\n" + "\n".join(f'    "{s[i:i + 100]}"' for i in range(0, len(s), 100)) + "\n)"


def packed(levels):
    """Levels 0..7, zlib-packed and base64-encoded."""
    return lines(base64.b64encode(zlib.compress(levels.astype(np.uint8).tobytes(), 9)).decode())


def digit_string(labels):
    return lines("".join(str(int(d)) for d in labels))


def floats(a, dtype="<f4"):
    return lines(base64.b64encode(zlib.compress(np.asarray(a, dtype).tobytes(), 9)).decode())


UNPACK = '''
import base64 as _base64
import zlib as _zlib
import numpy as np


def _levels(data, shape):
    """Depth scans as bytes: 0 = the clay's surface, 255 = deepest."""
    levels = np.frombuffer(_zlib.decompress(_base64.b64decode(data)), np.uint8).reshape(shape)
    return ((levels.astype(np.uint16) * 255 + 3) // 7).astype(np.uint8)


def _digits(text):
    return np.array([int(c) for c in text], dtype=np.int64)


def _floats(data, shape, dtype="<f4"):
    return np.frombuffer(_zlib.decompress(_base64.b64decode(data)), dtype).reshape(shape).astype(np.float32)
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
    print("wrote", name, flush=True)


def reader():
    """Draft 3 of Amara's blueprint."""
    return tf.keras.Sequential([tf.keras.Input((24, 24, 1)), L.Conv2D(8, 3, padding="same", activation="relu"), L.MaxPooling2D(),
                                L.Conv2D(16, 3, activation="relu"), L.GlobalMaxPooling2D(), L.Dense(8, activation="softmax")])


def trained(model, x, y, epochs):
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(x, y, epochs=epochs, validation_split=0.2, verbose=0)
    return model


# ---- the archive: fragments sorted by hand, signs anywhere ----

x_train, y_train = dataset(2400, 1)
x_test, y_test = dataset(600, 2)
print("drew the archive", flush=True)

references = []
for seed in range(8):
    tf.keras.utils.set_random_seed(seed)
    m = trained(reader(), scaled(x_train), y_train, [5, 6, 8, 10][seed % 4])
    acc = m.evaluate(scaled(x_test), y_test, verbose=0)[1]
    print("reference reader", seed, "test accuracy", round(acc, 3), flush=True)
    assert acc > 0.86, "a reference reader should pass the room's 85 %"
    references.append(m)

# ---- the seal: identical stamped signs, read with the stamps as filters ----

STAMP = 11


def stamp_depth(sign):
    """A sign as the seal cutter carved it: no jitter, 10 px, centred in an 11 x 11 stamp."""
    g = grid(STAMP, STAMP)
    pts = sign_points(sign, np.random.default_rng(0), 0) * 10 + STAMP / 2
    d = np.sqrt(((g[:, None, :] - pts[None]) ** 2).sum(-1)).min(1)
    return np.clip((0.7 - d) * S / 1.5 + 0.5, 0, 1).reshape(STAMP * S, STAMP * S).reshape(STAMP, S, STAMP, S).mean((1, 3))


stamps = np.stack([stamp_depth(s) for s in range(8)])
templates = stamps - stamps.mean(axis=(1, 2), keepdims=True)
templates /= np.sqrt((templates ** 2).sum(axis=(1, 2), keepdims=True))
templates = templates.astype(np.float32)

SEAL_ORDER = [5, 0, 7, 2, 6, 4, 1, 3]
rng = np.random.default_rng(11)
impressions = []
for s in SEAL_ORDER:
    img = np.abs(rng.normal(0, 0.23, (24, 24)))
    r, c = rng.integers(0, 24 - STAMP + 1, 2)
    img[r:r + STAMP, c:c + STAMP] += stamps[s] * 6
    impressions.append(np.clip(np.round(img), 0, 7).astype(np.uint8))
impressions = np.stack(impressions)


def finder_scores(levels):
    finder = tf.keras.Sequential([tf.keras.Input((24, 24, 1)), L.Conv2D(8, STAMP, use_bias=False), L.GlobalMaxPooling2D()])
    finder.set_weights([templates.transpose(1, 2, 0)[:, :, None, :]])
    return finder.predict(scaled(levels), verbose=0)


scores = finder_scores(impressions)
assert scores.argmax(1).tolist() == SEAL_ORDER, scores.argmax(1)
lead = np.sort(scores, 1)[:, -1] - np.sort(scores, 1)[:, -2]
print("seal read by the stamps, smallest lead", round(float(lead.min()), 3))
assert lead.min() > 0.1
CAPTION = [VALUES[s] for s in SEAL_ORDER]

write("seal.py", '''
# The cylinder seal: its impression in fresh clay, and Amara's stamps of the eight signs.
# Loaded before your code runs.
''', f'''

# The eight signs the seal pressed into the clay, left to right, as 24 x 24 depth scans
# (bytes: 0 = surface, 255 = deepest).
impressions = _levels({packed(impressions)}, (8, 24, 24))

# Amara's stamps: one 11 x 11 filter per sign, in the sign list's order (0 to 7).
# Positive where the sign is cut, negative around it; each adds up to 0.
templates = _floats({floats(templates)}, (8, {STAMP}, {STAMP}))

_SEAL_ORDER = {SEAL_ORDER}
_VALUES = {VALUES}


def _seal_check(finder, order, values):
    """The seal: a Conv2D with the stamps as filters, the signs it finds, and their sound values."""
    import tensorflow as tf
    problems = []
    if not isinstance(finder, tf.keras.Sequential):
        problems.append("finder should be a tf.keras.Sequential model. / finder soll ein tf.keras.Sequential-Modell sein.")
    else:
        convs = [l for l in finder.layers if isinstance(l, tf.keras.layers.Conv2D)]
        if len(convs) != 1 or convs[0].kernel_size != ({STAMP}, {STAMP}) or convs[0].filters != 8:
            problems.append("finder needs one Conv2D layer with 8 filters of {STAMP} x {STAMP}: one per stamp. / finder braucht eine Conv2D-Schicht mit 8 Filtern von {STAMP} x {STAMP}: einen pro Stempel.")
        elif not np.allclose(convs[0].get_weights()[0], templates.transpose(1, 2, 0)[:, :, None, :], atol=1e-6):
            problems.append("finder's filters aren't the stamps yet. Filter number i should be templates[i]; check the kernel's shape (rows, columns, channels in, filters) and look at one with show_images. / Die Filter von finder sind noch nicht die Stempel. Filter Nummer i soll templates[i] sein; prüft die Form des Kernels (Zeilen, Spalten, Kanäle rein, Filter) und schaut einen mit show_images an.")
        elif not any(isinstance(l, (tf.keras.layers.GlobalMaxPooling2D)) for l in finder.layers):
            problems.append("finder should give one score per stamp for each impression: the strongest match anywhere in it. / finder soll pro Abdruck einen Wert je Stempel liefern: die stärkste Übereinstimmung irgendwo darin.")
    try:
        order = [int(s) for s in order]
    except (TypeError, ValueError):
        order = None
    if order != _SEAL_ORDER:
        problems.append("order isn't the seal's signs yet: for each of the 8 impressions, the number of the stamp that matches best. / order sind noch nicht die Zeichen des Siegels: für jeden der 8 Abdrücke die Nummer des Stempels, der am besten passt.")
    try:
        values = {{int(k): str(v).strip().lower() for k, v in dict(values).items()}}
    except (TypeError, ValueError):
        values = None
    if values != dict(enumerate(_VALUES)):
        problems.append("values isn't right yet: a dict from each sign number (0 to 7) to its sound in the caption, e.g. {{0: \\"ra\\", ...}}. / values stimmt noch nicht: ein Dict von jeder Zeichennummer (0 bis 7) zu ihrem Laut in der Beischrift, z. B. {{0: \\"ra\\", ...}}.")
    return _problems_or(problems, "deciphered")
''')

# ---- the worn tally tablet: numerals only a Laplacian filter shows ----

TALLY = 246
H, W = 30, 96
g = grid(H, W)
marks = []
x = 6.0
for _ in range(TALLY // 100):                         # a tall bar is a hundred
    marks.append(np.column_stack([np.full(24, x), np.linspace(7, 23, 24)]))
    x += 7
x += 3
for i in range(TALLY // 10 % 10):                     # a circle is ten
    cx, cy = x + (i // 2) * 9, 10.5 if i % 2 == 0 else 19.5
    marks.append(np.array(arc(cx, cy, 3.0, n=40)))
x += ((TALLY // 10 % 10 + 1) // 2) * 9 + 3
for i in range(TALLY % 10):                           # a wedge is one
    cx, cy = x + (i // 2) * 8, 9 if i % 2 == 0 else 19
    marks.append(polyline([(cx - 2.6, cy), (cx + 2.6, cy), (cx, cy + 5), (cx - 2.6, cy)], 12))
assert x + ((TALLY % 10 + 1) // 2) * 8 < W - 4
d = np.sqrt(((g[:, None, :] - np.vstack(marks)[None]) ** 2).sum(-1)).min(1)
groove = np.clip((0.9 - d) * S / 1.5 + 0.5, 0, 1).reshape(H * S, W * S).reshape(H, S, W, S).mean((1, 3))
yy, xx = np.mgrid[0:H, 0:W]
dome = 3.2 * np.cos((xx - W / 2) / W * 2.2) * np.cos((yy - H / 2) / H * 1.6) + 0.004 * xx   # the tablet's curve, in mm
rng = np.random.default_rng(246)
scan = (dome - 0.03 * groove + rng.normal(0, 0.001, (H, W))).astype(np.float32)
KERNEL = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
EDGES = sum(KERNEL[i, j] * scan[i:i + H - 2, j:j + W - 2] for i in range(3) for j in range(3))
background = EDGES[groove[1:-1, 1:-1] == 0]
contrast = np.abs(EDGES[groove[1:-1, 1:-1] > 0.3] - background.mean()).mean() / background.std()
plain = (scan.max() - scan.min()) / 0.03
print("tally: groove/background contrast after the filter", round(float(contrast), 1), "| scan range / groove depth", round(float(plain), 1))
assert contrast > 2.5 and plain > 70

write("tally.py", '''
# The worn tally tablet (V-17): a laser scan of its surface. Loaded before your code runs.
''', f'''

# Height of the tablet's surface in millimetres, {H} rows x {W} columns (one pixel = 0.5 mm).
scan = _floats({floats(scan)}, ({H}, {W}))

_KERNEL = np.array({KERNEL.astype(int).tolist()}, dtype=np.float32)
_EDGES = sum(_KERNEL[i, j] * scan[i:i + {H - 2}, j:j + {W - 2}] for i in range(3) for j in range(3))


def _tally_check(edges, raking, number):
    """The raking light: the filter by hand, the same filter as a Keras Conv2D, and the number on the tablet."""
    import tensorflow as tf
    problems = []
    e = _array(edges, ({H - 2}, {W - 2}))
    if e is None:
        problems.append("edges should be an array of shape ({H - 2}, {W - 2}): the 3 x 3 window only fits {H - 2} x {W - 2} times into the scan. / edges soll ein Array der Form ({H - 2}, {W - 2}) sein: Das 3 x 3-Fenster passt nur {H - 2} x {W - 2} Mal in den Scan.")
    elif not np.allclose(e, _EDGES, atol=1e-4):
        problems.append("edges has the right shape, but its values are off: for each position, the 3 x 3 window of the scan times the kernel, added up. / edges hat die richtige Form, aber die Werte stimmen nicht: für jede Position das 3 x 3-Fenster des Scans mal den Kernel, aufaddiert.")
    try:
        out = np.asarray(raking(scan[None, :, :, None]), dtype=float)
        same = out.shape == (1, {H - 2}, {W - 2}, 1) and np.allclose(out[0, :, :, 0], _EDGES, atol=1e-4)
    except Exception:
        same = False
    if not same:
        problems.append("raking doesn't give your edges yet: a Conv2D layer (or a model) with 1 filter of 3 x 3, no bias, and the kernel loaded with set_weights. It gets the scan as scan[None, :, :, None]. / raking ergibt noch nicht eure edges: eine Conv2D-Schicht (oder ein Modell) mit 1 Filter von 3 x 3, ohne Bias, und dem Kernel mit set_weights geladen. Sie bekommt den Scan als scan[None, :, :, None].")
    try:
        right = int(number) == {TALLY}
    except (TypeError, ValueError):
        right = False
    if not right:
        problems.append("number isn't what the tablet says. Look at edges with show_images and count again. / number ist nicht, was auf der Tafel steht. Schaut edges mit show_images an und zählt noch einmal.")
    return _problems_or(problems, "read")
''')

# ---- the blueprint: only a grader ----

write("blueprint.py", '''
# The blueprint station has no data; this file holds its check. Loaded before your code runs.
''', '''

def _reader_layout(model):
    """Problems with a model that should be draft 3 of Amara's blueprint."""
    import tensorflow as tf
    if not isinstance(model, tf.keras.Sequential):
        return ["model should be a tf.keras.Sequential model. / model soll ein tf.keras.Sequential-Modell sein."]
    if not model.built or tuple(model.input_shape)[1:3] != (24, 24):
        return ["model's input should be one 24 x 24 fragment with 1 channel: tf.keras.Input(shape=(24, 24, 1)). / Die Eingabe von model soll ein 24 x 24-Fragment mit 1 Kanal sein: tf.keras.Input(shape=(24, 24, 1))."]
    kinds = [type(l).__name__ for l in model.layers if not isinstance(l, (tf.keras.layers.Rescaling, tf.keras.layers.Reshape))]
    if "Flatten" in kinds:
        return ["model has a Flatten layer, but the blueprint has none: look at the output shape of the stained layer and Amara's margin note. / model hat eine Flatten-Schicht, der Bauplan aber keine: Schaut auf die Ausgabeform der verschmierten Schicht und Amaras Randnotiz."]
    if kinds != ["Conv2D", "MaxPooling2D", "Conv2D", "GlobalMaxPooling2D", "Dense"]:
        return ["model's layers aren't the blueprint's: Conv2D, MaxPooling2D, Conv2D, the stained layer, Dense. / Die Schichten von model sind nicht die des Bauplans: Conv2D, MaxPooling2D, Conv2D, die verschmierte Schicht, Dense."]
    shapes = [tuple(l.output_shape) for l in model.layers if type(l).__name__ in ("Conv2D", "MaxPooling2D", "GlobalMaxPooling2D", "Dense")]
    if shapes != [(None, 24, 24, 8), (None, 12, 12, 8), (None, 10, 10, 16), (None, 16), (None, 8)]:
        return ["The layer types are right, but the output shapes aren't the blueprint's yet: compare model.summary() with it line by line (padding, kernel size, filters, pool size). / Die Schichttypen stimmen, aber die Ausgabeformen noch nicht mit dem Bauplan: Vergleicht model.summary() Zeile für Zeile damit (padding, Kernelgröße, Filter, Poolgröße)."]
    if model.count_params() != 1384:
        return [f"model has {model.count_params():,} parameters, not the blueprint's: check the kernel sizes and biases. / model hat {model.count_params():,} Parameter, nicht die des Bauplans: Prüft Kernelgrößen und Biases."]
    acts = [l._act for l in model.layers if type(l).__name__ in ("Conv2D", "Dense")]
    if acts != ["relu", "relu", "softmax"]:
        return ["Shapes and parameters are right; check each layer's activation on the blueprint. / Formen und Parameter stimmen; prüft die Aktivierung jeder Schicht auf dem Bauplan."]
    return []


def _blueprint_check(model):
    """The blueprint: draft 3 built as a Keras model, matching every legible number."""
    return _problems_or(_reader_layout(model), "matches")
''')

# ---- Amara's laptop: an old dense reader and a prototype, both trained on centred photos ----

x_tidy, y_tidy = dataset(2400, 3, messy=0.5, centred=True)
tf.keras.utils.set_random_seed(3)
old_reader = tf.keras.Sequential([tf.keras.Input((24, 24, 1)), L.Flatten(), L.Dense(32, activation="relu"), L.Dense(8, activation="softmax")],
                                 name="old_reader")
trained(old_reader, scaled(x_tidy), y_tidy, 8)
tf.keras.utils.set_random_seed(4)
prototype = trained(reader(), scaled(x_tidy), y_tidy, 8)
# Store the weights the way the data file loads them (float16 for the old reader), and use those from here on.
old_weights = [w.astype(np.float16).astype(np.float32) for w in old_reader.get_weights()]
old_reader.set_weights(old_weights)
proto_weights = prototype.get_weights()

x_new, y_new = dataset(100, 5, messy=0.5)
po, pp = old_reader.predict(scaled(x_new), verbose=0), prototype.predict(scaled(x_new), verbose=0)
for p in (po, pp):
    top = np.sort(p, 1)
    assert (top[:, -1] - top[:, -2]).min() > 1e-3, "a new fragment too close to call"
OLD_RIGHT, PROTO_RIGHT = int((po.argmax(1) == y_new).sum()), int((pp.argmax(1) == y_new).sum())
print("new fragments: old reader", OLD_RIGHT, "| prototype", PROTO_RIGHT)
assert 10 <= OLD_RIGHT <= 40 and PROTO_RIGHT >= 85

# The probe: a centred sign the old reader knows, and from which shift to the right it loses it.
def lead(p, sign):
    """How far the right sign's probability is ahead of (or behind) the best other one."""
    others = np.delete(p, sign, axis=1).max(1)
    return p[:, sign] - others


rng = np.random.default_rng(8)
PROBE_SIGN = 5
for attempt in range(200):
    probe = press(PROBE_SIGN, rng, 0.5, centred=True, size=11.5)
    shifted = np.stack([np.roll(probe, k, axis=1) for k in range(9)])
    po, pp = old_reader.predict(scaled(shifted), verbose=0), prototype.predict(scaled(shifted), verbose=0)
    old_lead, proto_lead = lead(po, PROBE_SIGN), lead(pp, PROBE_SIGN)
    misses = np.flatnonzero(old_lead < 0)
    if (po[0, PROBE_SIGN] > 0.95 and (proto_lead > 0.3).all() and len(misses) and 2 <= misses[0] <= 4
            and (old_lead[misses[0]:] < 0).all() and np.abs(old_lead).min() > 0.1):
        break
else:
    raise SystemExit("no probe")
FIRST_MISS = int(misses[0])
print("probe: the old reader misreads from shift", FIRST_MISS, "| p(right):", po[:, PROBE_SIGN].round(2), pp[:, PROBE_SIGN].round(2))

write("laptop.py", '''
# Amara's laptop: her old reader, the prototype of draft 3, and 100 new fragments.
# Loaded before your code runs.
import tensorflow as _tf
''', f'''

# 100 new fragments, sorted by hand at the dig: depth scans (bytes, 0 = surface, 255 = deepest) and sign numbers.
x_new = _levels({packed(x_new)}, (100, 24, 24))
y_new = _digits({digit_string(y_new)})

# A test fragment with a star (5) in the middle.
probe = _levels({packed(probe)}, (24, 24))

_layers = _tf.keras.layers

# Amara's old reader: a dense network, trained on the photo set (every sign in the middle).
old_reader = _tf.keras.Sequential([_tf.keras.Input((24, 24, 1)), _layers.Flatten(), _layers.Dense(32, activation="relu"),
                                   _layers.Dense(8, activation="softmax")], name="old_reader")
old_reader.set_weights([
    _floats({floats(old_weights[0], "<f2")}, (576, 32), "<f2"),
    _floats({floats(old_weights[1], "<f2")}, (32,), "<f2"),
    _floats({floats(old_weights[2], "<f2")}, (32, 8), "<f2"),
    _floats({floats(old_weights[3], "<f2")}, (8,), "<f2"),
])

# The prototype: draft 3 of the blueprint, trained on the same photo set.
prototype = _tf.keras.Sequential([_tf.keras.Input((24, 24, 1)), _layers.Conv2D(8, 3, padding="same", activation="relu"),
                                  _layers.MaxPooling2D(), _layers.Conv2D(16, 3, activation="relu"), _layers.GlobalMaxPooling2D(),
                                  _layers.Dense(8, activation="softmax")], name="prototype")
prototype.set_weights([{", ".join(f"_floats({floats(w)}, {w.shape})" for w in proto_weights)}])
_tf.keras.backend.clear_session()


def _laptop_check(old_right, proto_right, first_miss):
    """Amara's comparison: both readers on the new fragments, and the shift that throws the old one off."""
    problems = []
    def count(v):
        try:
            v = float(v)
        except (TypeError, ValueError):
            return None
        return round(v * 100) if 0 < v < 1 else round(v)
    if count(old_right) != {OLD_RIGHT}:
        problems.append("old_right is off: how many of the 100 new fragments the old reader reads right, prepared the way the readers expect them. / old_right stimmt nicht: wie viele der 100 neuen Fragmente der alte Leser richtig liest, so vorbereitet, wie die Leser sie erwarten.")
    if count(proto_right) != {PROTO_RIGHT}:
        problems.append("proto_right is off: how many of the 100 new fragments the prototype reads right. / proto_right stimmt nicht: wie viele der 100 neuen Fragmente der Prototyp richtig liest.")
    if first_miss != {FIRST_MISS}:
        problems.append("first_miss is off: shift the probe 0, 1, 2, ... pixels to the right with np.roll(probe, shift, axis=1). From which shift on does the old reader no longer see the star (5)? / first_miss stimmt nicht: Verschiebt die Probe um 0, 1, 2, ... Pixel nach rechts mit np.roll(probe, shift, axis=1). Ab welcher Verschiebung sieht der alte Leser keinen Stern (5) mehr?")
    return _problems_or(problems, "compared")
''')

# ---- the jar's lid: six signs in a scribe's hand ----

JAR_SIGNS = [3, 5, 1, 0, 2, 6]
JAR_WORD = "".join(VALUES[s] for s in JAR_SIGNS)
rng = np.random.default_rng(31)
jar = []
for s in JAR_SIGNS:
    for attempt in range(2000):
        img = press(s, rng, 1.15)
        x = scaled(img[None])
        if all(lead(m.predict(x, verbose=0), s)[0] > 0.2 for m in references):
            jar.append(img)
            break
    else:
        raise SystemExit(f"no jar sign {s} that every reference reader reads")
    print("jar sign", s, "after", attempt + 1, "tries", flush=True)
jar = np.stack(jar)
proto_misses = int((prototype.predict(scaled(jar), verbose=0).argmax(1) != JAR_SIGNS).sum())
stamp_misses = int((finder_scores(jar).argmax(1) != JAR_SIGNS).sum())
# Only for information: the jar station loads neither the prototype nor the stamps, and its check wants a reader trained there.
print("jar: the prototype misreads", proto_misses, "| the stamps misread", stamp_misses)
lid = jar.transpose(1, 0, 2).reshape(24, 24 * len(JAR_SIGNS))

# ---- crate 7: Mika sorted it by hand, and got some wrong ----
# Only fragments every reference reader reads clearly, so any reader that passes the 85 % check counts
# Mika's mistakes the same way, however it was trained. The count is part of the jar cabinet's code.
CRATE_SIZE, MIKA_WRONG = 60, 13
rng = np.random.default_rng(47)
crate, crate_signs = [], []
while len(crate) < CRATE_SIZE:
    s = int(rng.integers(0, 8))
    img = press(s, rng)
    x = scaled(img[None])
    if all(lead(m.predict(x, verbose=0), s)[0] > 0.3 for m in references):
        crate.append(img)
        crate_signs.append(s)
crate, crate_signs = np.stack(crate), np.array(crate_signs)
y_mika = crate_signs.copy()
for i in rng.choice(CRATE_SIZE, MIKA_WRONG, replace=False):
    y_mika[i] = (crate_signs[i] + int(rng.integers(1, 8))) % 8
assert int((y_mika != crate_signs).sum()) == MIKA_WRONG
print("crate 7:", CRATE_SIZE, "fragments, Mika got", MIKA_WRONG, "wrong", flush=True)

ARCHIVE_GRADERS = '''

def _reader_layout(model):
    """Problems with a model that should be draft 3 of Amara's blueprint."""
    import tensorflow as tf
    if not isinstance(model, tf.keras.Sequential):
        return ["model should be a tf.keras.Sequential model. / model soll ein tf.keras.Sequential-Modell sein."]
    kinds = [type(l).__name__ for l in model.layers if not isinstance(l, (tf.keras.layers.Rescaling, tf.keras.layers.Reshape))]
    if not model.built or kinds != ["Conv2D", "MaxPooling2D", "Conv2D", "GlobalMaxPooling2D", "Dense"] or model.count_params() != 1384:
        return ["model isn't the reader (draft 3) yet: check its layers and output shapes. / model ist noch nicht der Leser (Entwurf 3): Prüft seine Schichten und Ausgabeformen."]
    return []


def _accuracy(model):
    """Accuracy on the test fragments, prepared the way the model expects them."""
    import tensorflow as tf
    x = _x_test if any(isinstance(l, tf.keras.layers.Rescaling) for l in model.layers) else _x_test / 255
    if len(model.input_shape) == 4:
        x = x[..., None]
    return float((model.predict(x, verbose=0).argmax(axis=1) == _y_test).mean())


def _notebook_check(model, mika_wrong):
    """Mika's notebook: the reader trained well enough to read the archive, and Mika's sorting of crate 7 checked with it."""
    problems = _reader_layout(model)
    if not problems:
        acc = _accuracy(model)
        if not acc >= 0.85:
            problems.append(f"model reads only {acc:.0%} of the test fragments; it needs at least 85 %. Look at the accuracy in the training output: has it finished learning? / model liest nur {acc:.0%} der Testfragmente; nötig sind mindestens 85 %. Schaut auf die accuracy in der Trainingsausgabe: Ist es schon fertig mit Lernen?")
    try:
        mika_wrong = int(mika_wrong)
    except (TypeError, ValueError):
        mika_wrong = None
    if mika_wrong != _MIKA_WRONG:
        problems.append("mika_wrong is off: let the reader read crate 7 (x_crate, prepared like the training fragments) and count where it disagrees with Mika's labels y_mika. / mika_wrong stimmt nicht: Lasst den Leser Kiste 7 lesen (x_crate, vorbereitet wie die Trainingsfragmente) und zählt, wo er Mikas Etiketten y_mika widerspricht.")
    return _problems_or(problems, "trained")


def _jar_check(model, fragments, signs, word):
    """The jar: a well-trained reader, the lid's six fields in the format it expects, and the signs that reader
    reads from them with their sounds."""
    import tensorflow as tf
    problems = _reader_layout(model)
    rescales = False
    if not problems:
        rescales = any(isinstance(l, tf.keras.layers.Rescaling) for l in model.layers)
        acc = _accuracy(model)
        if not acc >= 0.85:
            problems.append(f"model reads only {acc:.0%} of the test fragments; it needs at least 85 %. / model liest nur {acc:.0%} der Testfragmente; nötig sind mindestens 85 %.")
    expected = np.stack(np.hsplit(_jar, 6))[..., None] / 255
    f = _array(fragments, (6, 24, 24, 1))
    if f is None:
        problems.append("fragments should be an array of shape (6, 24, 24, 1): the lid's six fields, each with a channel axis. / fragments soll ein Array der Form (6, 24, 24, 1) sein: die sechs Felder des Deckels, jedes mit Kanalachse.")
    elif not (np.allclose(f, expected, atol=1e-6) or (rescales and np.allclose(f, 255 * expected, atol=1e-3))):
        problems.append("fragments aren't the lid's six fields in the format the reader expects: prepare them exactly like the training fragments. / fragments sind nicht die sechs Felder des Deckels im Format, das der Leser erwartet: Bereitet sie genau so vor wie die Trainingsfragmente.")
    try:
        signs = [int(s) for s in signs]
    except (TypeError, ValueError):
        signs = None
    if signs is None or len(signs) != 6:
        problems.append("signs should be a list of 6 sign numbers, the lid's signs from left to right. / signs soll eine Liste aus 6 Zeichennummern sein, die Zeichen des Deckels von links nach rechts.")
    elif signs != _JAR_SIGNS:
        problems.append("signs aren't what's on the lid. Cut the lid into its six 24 x 24 fields and prepare them like the training data. / signs ist nicht, was auf dem Deckel steht. Schneidet den Deckel in seine sechs 24 x 24-Felder und bereitet sie vor wie die Trainingsdaten.")
    elif f is not None and not problems:
        try:
            read = model.predict(f, verbose=0).argmax(axis=1).tolist()
        except Exception:
            read = None
        if read != signs:
            problems.append("signs aren't what your reader reads from your fragments: let it read them with predict and argmax. / signs sind nicht das, was euer Leser aus euren fragments liest: Lasst ihn sie mit predict und argmax lesen.")
    if "".join(c for c in str(word).lower() if c.isalpha()) != _JAR_WORD:
        problems.append("word isn't how the lid sounds: each sign's sound, in order. / word ist nicht, wie der Deckel klingt: der Laut jedes Zeichens, der Reihe nach.")
    return _problems_or(problems, "read")
'''

write("archive.py", '''
# The archive: depth scans of clay fragments, each with one sign, sorted by hand; and the jar's lid.
# Loaded before your code runs.
''', f'''

# Fragments: 24 x 24 depth scans, stored as bytes, 0 = the clay's surface and 255 = deepest.
_x_train = _levels({packed(x_train)}, (2400, 24, 24))
_y_train = _digits({digit_string(y_train)})
_x_test = _levels({packed(x_test)}, (600, 24, 24))
_y_test = _digits({digit_string(y_test)})
x_train, y_train, x_test, y_test = _x_train.copy(), _y_train.copy(), _x_test.copy(), _y_test.copy()

# The jar's lid: six signs side by side, 24 rows x 144 columns.
jar = _levels({packed(lid)}, (24, 144))
_jar = jar.copy()
_JAR_SIGNS = {JAR_SIGNS}
_JAR_WORD = {JAR_WORD!r}

# Crate 7: {CRATE_SIZE} more fragments, sorted by Mika by hand. y_mika are Mika's sign numbers.
x_crate = _levels({packed(crate)}, ({CRATE_SIZE}, 24, 24))
y_mika = _digits({digit_string(y_mika)})
_MIKA_WRONG = {MIKA_WRONG}
''' + ARCHIVE_GRADERS)

print(json.dumps({"tally": TALLY, "seal order": SEAL_ORDER, "caption": CAPTION, "old right": OLD_RIGHT,
                  "proto right": PROTO_RIGHT, "mika wrong": MIKA_WRONG, "first miss": FIRST_MISS, "jar": JAR_SIGNS, "word": JAR_WORD}))
