# Old Iris's last backup: the weights of her network and her six self-test cards.
# Loaded before your code runs.

import base64 as _base64
import zlib as _zlib
import numpy as np


def _levels(data, shape):
    return np.frombuffer(_zlib.decompress(_base64.b64decode(data)), np.uint8).reshape(shape) * np.uint8(17)


def _digits(text):
    return np.array([int(c) for c in text], dtype=np.int64)


def _floats(data, shape):
    return np.frombuffer(_base64.b64decode(data), "<f4").reshape(shape).copy()


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


# Self-test cards in Iris's format: 16 x 16 pixels, 0.0 = paper and 1.0 = ink.
cards = _levels((
    "eNqtVMmWxCAIFHfW/P/fjul0jDiXedPtJRKhLKAwhD8sFKxpsQuKmfa4/IKCZslFVSv3NuZSyWgejXDT9rhGNM0uOLK+Uer17W+7"
    "G5/XgOJNRo17E51soLEqp/DFBSWveIlFBKeZhVIscmcLgjA+RPP4Ra0KvDO6Nu/fv+0syfnDddXEC0VGTdK8L4QmFYgXgm3wc/VM"
    "7f/1iKKqC16yeq742OD807HbfdSL8WYQj9Gv1nmGXchgXgG7HY/o5aU3/gs52a2nSEMQZLgw6Iz5k/7HvpYPmi5aHu0wpkd+xUZn"
    "stXpXc88hT1i34YlWfcOLGGbpq0cit6BtgCIn2ScXA8Bn3yukXNsmNHcYxBQPZyQ57YO/yv7siXryfcNjnc4Xzygr07/KVFWggXf"
    "sCwdpXN0l5yI4TWE0180hay0Aoj1qf/zOT3aIw2qCeoURL8egmbzPZAcCz2CGd05DNO/ev8DuNILuQ=="
), (6, 16, 16)) / 255

# Weights: 256 inputs -> 16 hidden neurons (W1, b1) -> 10 outputs (W2, b2).
W1 = _floats((
    "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"
), (256, 16))
b1 = _floats((
    "kWjxPEiYlD0Khfw9TECdur7VFD74cGs9gnTYPciXHz515/O90ZxbvVq3Zz6G2PE9kYpSPuQRJb1vy9o9JnJmPg=="
), (16,))
W2 = _floats((
    "RSeCPn/7mr4jFSE/SddcPlQszj4fqSC/gu7Xvu+LRD4BLZA9p8mvvofiD78Xq/q+nV0iv90T5r5VxAQ/Sxz5PMijTz2TkZG+riZn"
    "v9mlZD6V3cM+IB/BPui2UL9WCQ2+thAYv5DTPD6FIHe+oBEpP83O2b3HHeW+J18SP2DNMb/it2++CYMqvy1fCb9yb+g++Jt7vUyt"
    "+r4QWBC+JqrXvlRCBD6lXQ8/J3rzPjKyCT80yDm/0YJ7vm/uIr5SmzS/kVaivkGjR72zRge+jbtdv6ZIsD5gg+s+j8cWv26WBz+z"
    "Uew+aVqQPQxG+L42MBW/svAGP9PjYjwtD8G+knEUv0vu572D4l0+B+UuP0ZhOb9RoE69FRo8vyUVVL8r0Rg/iqlevpfi977OpZU+"
    "We8Fv3OzKT9RDwO+QGZdPj8DFDvFkxS/ZxgzvzFaub5GRx2/oDTaPr0EDL6sWFG9LoDJvuSS+T4BIwq/9hP+viItKL/9Eou+StYI"
    "P3Ek274sukU+h+9gvno4hD0lv+I+M9MYP74Xy76YWS8+FAKtPmfAor5vYN6+4Ok+v06oA783RQU/oBzqvhmj9j6lXA+/T79svk9D"
    "DT9UjtK9uP6KvvvzQjz/lRs+R1xrPpSlC79wJDm/Iv0Ev82HIT9yOjm+V6z3PpBD4j76Q6m+78sSvpABjj64//Q8YaIFvnsyEj/1"
    "/DC/BgUivQ/euT5s3L6+F68hvz8dn74LKeU+h77JPowrEr9S/U++eFq2vUT6F7+FSaW+8Vp7PtazIz7lohm/kkQuv/OEiL5bE9I+"
    "syfAvrAqQD+TCYu+TFsbv32MgL4hFZA+cK0Kv+FfDT97IK8+sQJEvg=="
), (16, 10))
b2 = _floats((
    "oAFWPVUdBz74Pk28OA2NPMiImr1nheC9RR3DvUg4zLvt/wO9acwLPg=="
), (10,))

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
    if str(reading).strip() != '305118':
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
