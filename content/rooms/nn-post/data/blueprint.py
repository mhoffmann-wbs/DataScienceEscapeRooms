# The blueprint station has no data; this file holds its check. Loaded before your code runs.

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
            problems.append("model's layers aren't one of the drafts on the blueprint. / Die Schichten von model sind keiner der Entwürfe auf dem Bauplan.")
        elif [l._act for l in dense] != ["relu", "relu", "softmax"]:
            problems.append("The units are right; check the activation of each layer on the blueprint. / Die Neuronen stimmen; prüft die Aktivierung jeder Schicht auf dem Bauplan.")
    return _problems_or(problems, "fits")
