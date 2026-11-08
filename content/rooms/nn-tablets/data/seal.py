# The cylinder seal: its impression in fresh clay, and Amara's stamps of the eight signs.
# Loaded before your code runs.

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


# The eight signs the seal pressed into the clay, left to right, as 24 x 24 depth scans
# (bytes: 0 = surface, 255 = deepest).
impressions = _levels((
    "eNrFWAuygzAIdPn1/jd+JFGrhNaap206HTuEEFKWhThNQwOCXG6JnJoctMxh1jVyOVtcAzH1T7IFma9JnEn1YUpkoM7+7M9EH/q/"
    "Oe92Fs8f2SJkj5f/53TFwGWWxj3AiNOr8zi/7mL/B1SiBOkxoA5eRQ9pRylphzupqlCJAKX6N7FFM0Um9blPMqpAX/Sx4Fi1xKqz"
    "7xIlJP5U/x+anuw4bBiOGM4ZOw8/YkIHYi7BMhNG5B81j9iOhVwFLKs+Du1/fuZfYfw2dvitOZzlo5vd22x1oj5gLkjIijAb128c"
    "XiK93kokaJiThn8RdnKJeEHtiq2q5wBNkrJSXRZZCev85hzr+vIDWyZ5yyj4J0kglErcBTscyUbZ640CniNE3sejstO0bWKc6Nm5"
    "jDVwOsTljgvRCCGhKpfgjEjRJ9UA6dlOV2GavtsJmUYMmQTMFxMFEgFGmih8jaYwZh9J550NT+1czMsEAqVQv6KxTMc1tZ1Hae73"
    "E14h0QiH9pmHWR5zFZU7aj+DbdBgbXRdFzMxt2KLU8l4ebHCsLUv1GYMb3fIyeQpDaEeKV581HqkCJVOSpaJlQfm+xZTR3GdF61J"
    "9vJCXW/tYimfSHClsy57ImB6tQ78uE8aCui9Tv+3Hg9cTXF8ocjeQgDtbUN3obJKKbUcYQ8TfvATPdhVTsleBTjpzVtjb8c4ueG9"
    "uPi1DMj7wYO3EBcG8g/UKQfU"
), (8, 24, 24))

# Amara's stamps: one 11 x 11 filter per sign, in the sign list's order (0 to 7).
# Positive where the sign is cut, negative around it; each adds up to 0.
templates = _floats((
    "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"
), (8, 11, 11))

_SEAL_ORDER = [5, 0, 7, 2, 6, 4, 1, 3]
_VALUES = ['ra', 'mi', 'ko', 'ta', 're', 'lu', 'ne', 'sa']


def _seal_check(finder, order, values):
    """The seal: a Conv2D with the stamps as filters, the signs it finds, and their sound values."""
    import tensorflow as tf
    problems = []
    if not isinstance(finder, tf.keras.Sequential):
        problems.append("finder should be a tf.keras.Sequential model. / finder soll ein tf.keras.Sequential-Modell sein.")
    else:
        convs = [l for l in finder.layers if isinstance(l, tf.keras.layers.Conv2D)]
        if len(convs) != 1 or convs[0].kernel_size != (11, 11) or convs[0].filters != 8:
            problems.append("finder needs one Conv2D layer with 8 filters of 11 x 11: one per stamp. / finder braucht eine Conv2D-Schicht mit 8 Filtern von 11 x 11: einen pro Stempel.")
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
        values = {int(k): str(v).strip().lower() for k, v in dict(values).items()}
    except (TypeError, ValueError):
        values = None
    if values != dict(enumerate(_VALUES)):
        problems.append("values isn't right yet: a dict from each sign number (0 to 7) to its sound in the caption, e.g. {0: \"ra\", ...}. / values stimmt noch nicht: ein Dict von jeder Zeichennummer (0 bis 7) zu ihrem Laut in der Beischrift, z. B. {0: \"ra\", ...}.")
    return _problems_or(problems, "deciphered")
