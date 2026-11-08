# Ferdinand's training logbook: the history of one long training run of Iris 2.
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


# One value per epoch, like history.history after model.fit.
log = {"accuracy": [0.38, 0.5498, 0.6718, 0.7578, 0.8193, 0.8662, 0.9038, 0.9331, 0.9531, 0.9644, 0.9706, 0.9761, 0.9833, 0.991, 0.9962, 0.9969, 0.9947, 0.9931, 0.9948, 0.999, 1.0, 1.0, 0.9993, 0.9961, 0.996, 0.9992, 1.0, 1.0, 1.0, 0.9973], "loss": [1.942, 1.5339, 1.2052, 0.9482, 0.7552, 0.6111, 0.4969, 0.3979, 0.3111, 0.242, 0.1956, 0.1685, 0.1492, 0.1269, 0.0994, 0.0743, 0.0606, 0.0599, 0.0641, 0.0625, 0.0511, 0.0362, 0.0281, 0.0316, 0.0414, 0.0468, 0.0417, 0.0296, 0.0209, 0.0229], "val_accuracy": [0.45, 0.5894, 0.6871, 0.7658, 0.8276, 0.8666, 0.8993, 0.9285, 0.9432, 0.9557, 0.9712, 0.9762, 0.9794, 0.9889, 0.9907, 0.9895, 0.996, 0.9316, 0.9235, 0.9239, 0.9217, 0.9133, 0.9126, 0.9117, 0.9032, 0.9012, 0.9015, 0.8933, 0.8899, 0.891], "val_loss": [1.62, 1.05, 0.78, 0.62, 0.53, 0.47, 0.43, 0.4, 0.42, 0.41, 0.37, 0.35, 0.34, 0.33, 0.325, 0.32, 0.31, 0.315, 0.33, 0.35, 0.37, 0.39, 0.42, 0.44, 0.47, 0.49, 0.52, 0.55, 0.57, 0.6]}


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
        callback.on_epoch_end(epoch, {k: v[epoch] for k, v in history.items()})
        if model.stop_training:
            stopped = epoch + 1
            break
    callback.on_train_end()
    print(f"Training stops at epoch {stopped}." if stopped else f"Training runs all {epochs} epochs.",
          f"The model keeps the weights of epoch {model.weights_from}.")
    return stopped


def _logbook_check(best_epoch, stopper, stop_epoch, kept_epoch):
    """The logbook: the best epoch, Ferdinand's early stopping, where it stops and which weights it keeps."""
    import tensorflow as tf
    problems = []
    if best_epoch != 17:
        if best_epoch == 16:
            problems.append("best_epoch is one too low: Keras counts epochs from 1, Python from 0. / best_epoch ist um eins zu klein: Keras zählt Epochen ab 1, Python ab 0.")
        else:
            problems.append("best_epoch is off: the epoch with the lowest validation loss. / best_epoch stimmt nicht: die Epoche mit dem niedrigsten Validierungs-Loss.")
    if not isinstance(stopper, tf.keras.callbacks.EarlyStopping):
        problems.append("stopper should be a tf.keras.callbacks.EarlyStopping. / stopper soll ein tf.keras.callbacks.EarlyStopping sein.")
    elif stopper.monitor != "val_loss" or stopper.patience != 3 or not stopper.restore_best_weights:
        problems.append("stopper isn't set up as Ferdinand's note says: what it watches, its patience, and which weights it keeps. / stopper ist nicht so eingestellt, wie Ferdinands Notiz sagt: was er beobachtet, seine Geduld und welche Gewichte er behält.")
    if stop_epoch != 20:
        problems.append("stop_epoch is off: the epoch at which Ferdinand's early stopping ends the training (replay prints it). / stop_epoch stimmt nicht: die Epoche, in der Ferdinands Early Stopping das Training beendet (replay gibt sie aus).")
    if kept_epoch != 17:
        problems.append("kept_epoch is off: from which epoch are the weights the model keeps? / kept_epoch stimmt nicht: Aus welcher Epoche stammen die Gewichte, die das Modell behält?")
    return _problems_or(problems, "logged")
