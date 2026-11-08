# The blueprint station has no data; this file holds its check. Loaded before your code runs.

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
