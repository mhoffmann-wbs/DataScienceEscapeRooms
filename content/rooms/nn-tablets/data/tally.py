# The worn tally tablet (V-17): a laser scan of its surface. Loaded before your code runs.

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


# Height of the tablet's surface in millimetres, 30 rows x 96 columns (one pixel = 0.5 mm).
scan = _floats((
    "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"
), (30, 96))

_KERNEL = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
_EDGES = sum(_KERNEL[i, j] * scan[i:i + 28, j:j + 94] for i in range(3) for j in range(3))


def _tally_check(edges, raking, number):
    """The raking light: the filter by hand, the same filter as a Keras Conv2D, and the number on the tablet."""
    import tensorflow as tf
    problems = []
    e = _array(edges, (28, 94))
    if e is None:
        problems.append("edges should be an array of shape (28, 94): the 3 x 3 window only fits 28 x 94 times into the scan. / edges soll ein Array der Form (28, 94) sein: Das 3 x 3-Fenster passt nur 28 x 94 Mal in den Scan.")
    elif not np.allclose(e, _EDGES, atol=1e-4):
        problems.append("edges has the right shape, but its values are off: for each position, the 3 x 3 window of the scan times the kernel, added up. / edges hat die richtige Form, aber die Werte stimmen nicht: für jede Position das 3 x 3-Fenster des Scans mal den Kernel, aufaddiert.")
    try:
        out = np.asarray(raking(scan[None, :, :, None]), dtype=float)
        same = out.shape == (1, 28, 94, 1) and np.allclose(out[0, :, :, 0], _EDGES, atol=1e-4)
    except Exception:
        same = False
    if not same:
        problems.append("raking doesn't give your edges yet: a Conv2D layer (or a model) with 1 filter of 3 x 3, no bias, and the kernel loaded with set_weights. It gets the scan as scan[None, :, :, None]. / raking ergibt noch nicht eure edges: eine Conv2D-Schicht (oder ein Modell) mit 1 Filter von 3 x 3, ohne Bias, und dem Kernel mit set_weights geladen. Sie bekommt den Scan als scan[None, :, :, None].")
    try:
        right = int(number) == 246
    except (TypeError, ValueError):
        right = False
    if not right:
        problems.append("number isn't what the tablet says. Look at edges with show_images and count again. / number ist nicht, was auf der Tafel steht. Schaut edges mit show_images an und zählt noch einmal.")
    return _problems_or(problems, "read")
