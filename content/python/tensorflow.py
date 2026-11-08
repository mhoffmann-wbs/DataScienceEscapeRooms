"""A small TensorFlow-style neural network library for the escape rooms.

This is NOT the real TensorFlow, which can't run in the browser. It keeps TensorFlow's API
names for the parts it covers (see docs/tensorflow-lite.md), so code written here also runs
with the real library:

    import tensorflow as tf
    from tensorflow.keras import layers
    tf.keras.utils.set_random_seed(42)
    model = tf.keras.Sequential([
        tf.keras.Input(shape=(16, 16)),
        layers.Flatten(),
        layers.Dense(64, activation="relu"),
        layers.Dense(10, activation="softmax"),
    ])
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    history = model.fit(x_train, y_train, epochs=10, validation_split=0.2)
    model.evaluate(x_test, y_test)

The maths is the same as Keras's (Glorot initialisation, the same losses and optimizer update
rules with the same defaults); it runs on numpy in float32, so trained numbers come close to the
real library's but don't match exactly.
"""
import sys
import time
import types

import numpy as np

__version__ = "2.20.0-lite"

float16, float32, float64 = np.float16, np.float32, np.float64
int8, int32, int64, uint8 = np.int8, np.int32, np.int64, np.uint8
bool_ = np.bool_

_EPSILON = 1e-7
_state = {"rng": np.random.default_rng(), "names": {}}


def _rng():
    return _state["rng"]


def _unique_name(base):
    n = _state["names"].get(base, 0)
    _state["names"][base] = n + 1
    return base if n == 0 else f"{base}_{n}"


def _shape(shape):
    """A shape as Keras prints it, e.g. (None, 16, 16)."""
    return str(tuple(None if d is None else int(d) for d in shape))


def _batch_shape(shape):
    return _shape((None,) + tuple(shape)[1:])


def _module_getattr(module_name):
    def __getattr__(name):
        if name.startswith("__"):
            raise AttributeError(name)
        raise AttributeError(
            f"module '{module_name}' has no attribute '{name}'. This TensorFlow-style model only covers "
            "what the room's handbook lists; it is not the full TensorFlow."
        )
    return __getattr__


# ---- tensors ----

class Tensor(np.ndarray):
    """What a model or a tf function returns: a numpy array that also has .numpy(), like a TensorFlow tensor."""

    def numpy(self):
        return np.array(self)

    def __repr__(self):
        return f"<tf.Tensor: shape={_shape(self.shape)}, dtype={self.dtype}, numpy={np.asarray(self)!r}>"

    def __str__(self):
        return f"tf.Tensor({np.asarray(self)}, shape={_shape(self.shape)}, dtype={self.dtype})"


def _tensor(x):
    return np.asarray(x).view(Tensor)


def constant(value, dtype=None):
    """A tensor from a value. Python floats become float32 and ints int32, as in TensorFlow."""
    a = np.array(value, dtype=dtype)
    if dtype is None:
        if a.dtype.kind == "f":
            a = a.astype(float32)
        elif a.dtype.kind in "iu" and a.dtype.itemsize == 8 and not isinstance(value, np.ndarray):
            a = a.astype(int32)
    return _tensor(a)


def convert_to_tensor(value, dtype=None):
    return constant(value, dtype)


def cast(x, dtype):
    return _tensor(np.asarray(x).astype(dtype))


def reshape(tensor, shape):
    return _tensor(np.reshape(tensor, shape))


def matmul(a, b):
    return _tensor(np.matmul(a, b))


def argmax(input, axis=0):
    return _tensor(np.argmax(input, axis=axis).astype(int64))


def argmin(input, axis=0):
    return _tensor(np.argmin(input, axis=axis).astype(int64))


def reduce_sum(input_tensor, axis=None, keepdims=False):
    return _tensor(np.sum(input_tensor, axis=axis, keepdims=keepdims))


def reduce_mean(input_tensor, axis=None, keepdims=False):
    return _tensor(np.mean(input_tensor, axis=axis, keepdims=keepdims))


def reduce_max(input_tensor, axis=None, keepdims=False):
    return _tensor(np.max(input_tensor, axis=axis, keepdims=keepdims))


def reduce_min(input_tensor, axis=None, keepdims=False):
    return _tensor(np.min(input_tensor, axis=axis, keepdims=keepdims))


def exp(x):
    return _tensor(np.exp(x))


def _log(x):
    return _tensor(np.log(x))


def _abs(x):
    return _tensor(np.abs(x))


def _square(x):
    return _tensor(np.square(x))


def _sqrt(x):
    return _tensor(np.sqrt(x))


abs = _abs  # noqa: A001 (tf.abs)


# ---- activations ----

def relu(x):
    return np.maximum(x, 0).astype(np.result_type(x, float32))


def sigmoid(x):
    x = np.asarray(x, dtype=np.result_type(x, float32))
    return np.where(x >= 0, 1 / (1 + np.exp(-np.abs(x))), np.exp(-np.abs(x)) / (1 + np.exp(-np.abs(x)))).astype(x.dtype)


def softmax(x, axis=-1):
    x = np.asarray(x, dtype=np.result_type(x, float32))
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)


def tanh(x):
    return np.tanh(np.asarray(x, dtype=np.result_type(x, float32)))


def linear(x):
    return np.asarray(x)


def _act_grad(name, g, z, a):
    if name == "relu":
        return g * (z > 0)
    if name == "sigmoid":
        return g * a * (1 - a)
    if name == "tanh":
        return g * (1 - a * a)
    if name == "softmax":
        return a * (g - (g * a).sum(axis=-1, keepdims=True))
    return g


_ACTIVATIONS = {"relu": relu, "sigmoid": sigmoid, "softmax": softmax, "tanh": tanh, "linear": linear}


def _activation(identifier):
    if identifier is None:
        return "linear"
    if isinstance(identifier, str) and identifier in _ACTIVATIONS:
        return identifier
    for name, fn in _ACTIVATIONS.items():
        if identifier is fn or getattr(identifier, "__wrapped_activation__", None) == name:
            return name
    raise ValueError(f"Could not interpret activation function identifier: {identifier!r}")


def _public_activation(name):
    def fn(x, *args, **kwargs):
        return _tensor(_ACTIVATIONS[name](np.asarray(x), *args, **kwargs))
    fn.__name__ = name
    fn.__wrapped_activation__ = name
    return fn


# ---- initializers ----

def _init(name, shape, fan_in, fan_out):
    rng = _rng()
    if name == "zeros":
        return np.zeros(shape, float32)
    if name == "ones":
        return np.ones(shape, float32)
    if name == "random_normal":
        return rng.normal(0, 0.05, shape).astype(float32)
    if name == "random_uniform":
        return rng.uniform(-0.05, 0.05, shape).astype(float32)
    scale = {"glorot_uniform": 1, "glorot_normal": 1, "he_uniform": 2, "he_normal": 2}.get(name)
    if scale is None:
        raise ValueError(f"Could not interpret initializer identifier: {name!r}")
    fan = (fan_in + fan_out) / 2 if name.startswith("glorot") else fan_in
    if name.endswith("uniform"):
        limit = np.sqrt(3 * scale / fan)
        return rng.uniform(-limit, limit, shape).astype(float32)
    # Truncated normal (cut at 2 standard deviations), widened so the variance is scale / fan as in Keras.
    std = np.sqrt(scale / fan) / 0.87962566103423978
    w = rng.normal(0, std, shape)
    while (out := np.abs(w) > 2 * std).any():
        w[out] = rng.normal(0, std, out.sum())
    return w.astype(float32)


# ---- layers ----

class KerasTensor:
    """The symbolic input that tf.keras.Input returns: it only carries the shape, for a Sequential model."""

    def __init__(self, shape, name=None):
        self.shape = (None,) + tuple(shape)
        self.name = name or _unique_name("input_layer")

    def __repr__(self):
        return f"<KerasTensor shape={_shape(self.shape)}, dtype=float32, name={self.name}>"


def Input(shape=None, batch_size=None, name=None, dtype=None):
    """The input of a model: shape is one sample's shape, without the batch dimension, e.g. (16, 16)."""
    if shape is None:
        raise ValueError("You must pass a `shape` argument.")
    if isinstance(shape, int):
        shape = (shape,)
    return KerasTensor(shape, name)


def InputLayer(shape=None, batch_size=None, name=None, dtype=None, input_shape=None):
    return Input(shape if shape is not None else input_shape, name=name)


class Layer:
    """The base class of all layers."""
    _base = "layer"

    def __init__(self, name=None, input_shape=None, input_dim=None, trainable=True, dtype=None, **kwargs):
        if kwargs:
            raise TypeError(f"Unrecognized keyword arguments passed to {type(self).__name__}: {kwargs}")
        self.name = name or _unique_name(self._base)
        if input_dim is not None:
            input_shape = (input_dim,)
        if isinstance(input_shape, int):
            input_shape = (input_shape,)
        self._input_shape_arg = None if input_shape is None else tuple(input_shape)
        self.trainable = trainable
        self.built = False
        self.input_shape = None
        self.output_shape = None
        self._vars = []
        self._grads = []

    def build(self, input_shape):
        self.input_shape = tuple(input_shape)
        self.output_shape = self.compute_output_shape(self.input_shape)
        self.built = True

    def compute_output_shape(self, input_shape):
        return input_shape

    def forward(self, x, training):
        return x

    def backward(self, g):
        return g

    @property
    def weights(self):
        return [_tensor(v) for v in self._vars]

    trainable_weights = weights

    @property
    def non_trainable_weights(self):
        return []

    def get_weights(self):
        return [v.copy() for v in self._vars]

    def set_weights(self, weights):
        if len(weights) != len(self._vars):
            raise ValueError(f"Layer {self.name} weight shape mismatch: expected {len(self._vars)} weights, but received {len(weights)}.")
        for v, w in zip(self._vars, weights):
            w = np.asarray(w, dtype=float32)
            if w.shape != v.shape:
                raise ValueError(f"Layer {self.name} weight shape {_shape(v.shape)} is not compatible with provided weight shape {_shape(w.shape)}.")
            v[...] = w

    def count_params(self):
        return int(sum(v.size for v in self._vars))

    def __call__(self, inputs, training=False):
        if isinstance(inputs, KerasTensor):
            raise NotImplementedError("This TensorFlow-style model has no functional API; build your model with tf.keras.Sequential([...]).")
        x = np.asarray(inputs, dtype=float32)
        if not self.built:
            self.build((None,) + x.shape[1:])
        return _tensor(self.forward(x, training))

    def __repr__(self):
        return f"<{type(self).__name__} name={self.name}, built={self.built}>"


class Dense(Layer):
    """A fully connected layer: output = activation(input @ kernel + bias)."""
    _base = "dense"

    def __init__(self, units, activation=None, use_bias=True, kernel_initializer="glorot_uniform",
                 bias_initializer="zeros", **kwargs):
        super().__init__(**kwargs)
        if not isinstance(units, (int, np.integer)) or units < 1:
            raise ValueError(f"Received an invalid value for `units`, expected a positive integer. Received: units={units!r}")
        self.units = int(units)
        self._act = _activation(activation)
        self.activation = _public_activation(self._act)
        self.use_bias = use_bias
        self.kernel_initializer = kernel_initializer
        self.bias_initializer = bias_initializer

    def build(self, input_shape):
        if input_shape[-1] is None:
            raise ValueError("The last dimension of the inputs to a Dense layer should be defined. Found None.")
        fan_in = int(input_shape[-1])
        self._kernel = _init(self.kernel_initializer, (fan_in, self.units), fan_in, self.units)
        self._vars = [self._kernel]
        if self.use_bias:
            self._bias = _init(self.bias_initializer, (self.units,), fan_in, self.units)
            self._vars.append(self._bias)
        super().build(input_shape)

    @property
    def kernel(self):
        return _tensor(self._kernel)

    @property
    def bias(self):
        return _tensor(self._bias) if self.use_bias else None

    def compute_output_shape(self, input_shape):
        return tuple(input_shape[:-1]) + (self.units,)

    def forward(self, x, training):
        if x.shape[-1] != self._kernel.shape[0]:
            raise ValueError(
                f'Input 0 of layer "{self.name}" is incompatible with the layer: expected axis -1 of input shape '
                f"to have value {self._kernel.shape[0]}, but received input with shape {_shape(x.shape)}"
            )
        z = x @ self._kernel
        if self.use_bias:
            z = z + self._bias
        a = _ACTIVATIONS[self._act](z)
        if training:
            self._cache = (x, z, a)
        return a

    def backward(self, g):
        x, z, a = self._cache
        gz = _act_grad(self._act, g, z, a)
        x2, gz2 = x.reshape(-1, x.shape[-1]), gz.reshape(-1, self.units)
        self._grads = [x2.T @ gz2] + ([gz2.sum(axis=0)] if self.use_bias else [])
        return gz @ self._kernel.T


class Flatten(Layer):
    """Flattens each sample into one vector, e.g. (None, 16, 16) to (None, 256)."""
    _base = "flatten"

    def compute_output_shape(self, input_shape):
        rest = input_shape[1:]
        return (input_shape[0], None if None in rest else int(np.prod(rest, dtype=np.int64)))

    def forward(self, x, training):
        self._in_shape = x.shape
        return x.reshape(len(x), -1)

    def backward(self, g):
        return g.reshape(self._in_shape)


class Activation(Layer):
    """Applies an activation function, e.g. Activation("relu")."""
    _base = "activation"

    def __init__(self, activation, **kwargs):
        super().__init__(**kwargs)
        self._act = _activation(activation)

    def forward(self, x, training):
        a = _ACTIVATIONS[self._act](x)
        if training:
            self._cache = (x, a)
        return a

    def backward(self, g):
        return _act_grad(self._act, g, *self._cache)


class Dropout(Layer):
    """During training, sets a random fraction `rate` of the inputs to 0 and scales the rest by 1 / (1 - rate)."""
    _base = "dropout"

    def __init__(self, rate, noise_shape=None, seed=None, **kwargs):
        super().__init__(**kwargs)
        if not 0 <= rate < 1:
            raise ValueError(f"Invalid value received for argument `rate`. Expected a float value between 0 and 1. Received: rate={rate}")
        self.rate = float(rate)

    def forward(self, x, training):
        if not training or self.rate == 0:
            self._mask = None
            return x
        self._mask = (_rng().random(x.shape) >= self.rate).astype(float32) / (1 - self.rate)
        return x * self._mask

    def backward(self, g):
        return g if self._mask is None else g * self._mask


class Rescaling(Layer):
    """Multiplies the inputs by `scale` and adds `offset`, e.g. Rescaling(1 / 255) for pixel values."""
    _base = "rescaling"

    def __init__(self, scale, offset=0.0, **kwargs):
        super().__init__(**kwargs)
        self.scale, self.offset = float(scale), float(offset)

    def forward(self, x, training):
        return x * self.scale + self.offset

    def backward(self, g):
        return g * self.scale


# ---- losses ----

def _same_rank(y, p):
    """Like Keras: a target of shape (n,) against an output of shape (n, k) becomes (n, 1)."""
    if y.ndim == p.ndim - 1:
        y = y[..., None]
    return y


def _check_same_shape(y, p):
    if y.shape != p.shape:
        raise ValueError(
            f"Arguments `target` and `output` must have the same shape. Received: "
            f"target.shape={_batch_shape(y.shape)}, output.shape={_batch_shape(p.shape)}"
        )


def _normalised_probs(p):
    """Keras divides probabilities by their sum and clips them to [eps, 1 - eps] before taking the log."""
    s = p.sum(axis=-1, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        q = p / s
    return s, q, np.clip(q, _EPSILON, 1 - _EPSILON), (q > _EPSILON) & (q < 1 - _EPSILON)


def _through_normalisation(gq, q, s):
    with np.errstate(divide="ignore", invalid="ignore"):
        return (gq - (gq * q).sum(axis=-1, keepdims=True)) / s


class Loss:
    """Base class: loss(y_true, y_pred) gives the mean loss; models use _compute for loss and gradient."""
    _default_name = "loss"

    def __init__(self, from_logits=False, name=None, reduction="sum_over_batch_size"):
        self.from_logits = from_logits
        self.name = name or self._default_name

    def __call__(self, y_true, y_pred):
        return _tensor(float32(self._compute(np.asarray(y_true), np.asarray(y_pred, dtype=float32))[0]))

    def _compute(self, y, p):
        raise NotImplementedError


class SparseCategoricalCrossentropy(Loss):
    """Cross-entropy for integer class labels (0, 1, 2, ...) and one output per class."""
    _default_name = "sparse_categorical_crossentropy"

    def _compute(self, y, p):
        if y.ndim == p.ndim and y.shape[-1:] == (1,):
            y = y[..., 0]
        if y.shape != p.shape[:-1]:
            raise ValueError(
                f"Arguments `target` and `output` must have the same shape up until the last dimension: "
                f"target.shape={_batch_shape(y.shape)}, output.shape={_batch_shape(p.shape)}"
            )
        if y.dtype.kind == "f" and not np.all(y == np.round(y)):
            raise ValueError("sparse_categorical_crossentropy expects integer class labels such as 0, 1, 2, ...; the labels have fractions.")
        k = p.shape[-1]
        yi = y.astype(np.int64).reshape(-1)
        bad = yi[(yi < 0) | (yi >= k)]
        if bad.size:
            raise ValueError(f"Received a label value of {int(bad[0])} which is outside the valid range of [0, {k}).")
        p2 = p.reshape(-1, k)
        m, rows = len(p2), np.arange(len(p2))
        if self.from_logits:
            z = p2 - p2.max(axis=-1, keepdims=True)
            log_sm = z - np.log(np.exp(z).sum(axis=-1, keepdims=True))
            g = np.exp(log_sm)
            g[rows, yi] -= 1
            return float(-log_sm[rows, yi].mean()), (g / m).reshape(p.shape)
        s, q, qc, inside = _normalised_probs(p2)
        gq = np.zeros_like(q)
        gq[rows, yi] = -inside[rows, yi].astype(float32) / qc[rows, yi]
        return float(-np.log(qc[rows, yi]).mean()), (_through_normalisation(gq, q, s) / m).reshape(p.shape)


class CategoricalCrossentropy(Loss):
    """Cross-entropy for one-hot labels (one column per class, see to_categorical)."""
    _default_name = "categorical_crossentropy"

    def _compute(self, y, p):
        y = _same_rank(y, p)
        _check_same_shape(y, p)
        y2, p2 = y.reshape(-1, p.shape[-1]).astype(float32), p.reshape(-1, p.shape[-1])
        m = len(p2)
        if self.from_logits:
            z = p2 - p2.max(axis=-1, keepdims=True)
            log_sm = z - np.log(np.exp(z).sum(axis=-1, keepdims=True))
            g = np.exp(log_sm) * y2.sum(axis=-1, keepdims=True) - y2
            return float(-(y2 * log_sm).sum(axis=-1).mean()), (g / m).reshape(p.shape)
        s, q, qc, inside = _normalised_probs(p2)
        gq = -y2 * inside / qc
        return float(-(y2 * np.log(qc)).sum(axis=-1).mean()), (_through_normalisation(gq, q, s) / m).reshape(p.shape)


class BinaryCrossentropy(Loss):
    """Cross-entropy for yes/no labels (0 or 1) and a sigmoid output."""
    _default_name = "binary_crossentropy"

    def _compute(self, y, p):
        y = _same_rank(y, p).astype(float32)
        _check_same_shape(y, p)
        n = p.size
        if self.from_logits:
            loss = np.maximum(p, 0) - p * y + np.log1p(np.exp(-np.abs(p)))
            return float(loss.mean()), (sigmoid(p) - y) / n
        pc = np.clip(p, _EPSILON, 1 - _EPSILON)
        inside = (p > _EPSILON) & (p < 1 - _EPSILON)
        loss = -(y * np.log(pc) + (1 - y) * np.log(1 - pc))
        return float(loss.mean()), inside * (pc - y) / (pc * (1 - pc)) / n


class MeanSquaredError(Loss):
    _default_name = "mean_squared_error"

    def _compute(self, y, p):
        y = _same_rank(y, p).astype(float32)
        _check_same_shape(y, p)
        return float(np.mean((p - y) ** 2)), 2 * (p - y) / p.size


class MeanAbsoluteError(Loss):
    _default_name = "mean_absolute_error"

    def _compute(self, y, p):
        y = _same_rank(y, p).astype(float32)
        _check_same_shape(y, p)
        return float(np.mean(np.abs(p - y))), np.sign(p - y) / p.size


_LOSSES = {
    "sparse_categorical_crossentropy": SparseCategoricalCrossentropy,
    "categorical_crossentropy": CategoricalCrossentropy,
    "binary_crossentropy": BinaryCrossentropy,
    "mean_squared_error": MeanSquaredError, "mse": MeanSquaredError,
    "mean_absolute_error": MeanAbsoluteError, "mae": MeanAbsoluteError,
}


def _loss_function(name):
    def fn(y_true, y_pred):
        return _LOSSES[name]()(y_true, y_pred)
    fn.__name__ = name
    return fn


def _get_loss(identifier):
    if isinstance(identifier, Loss):
        return identifier
    if isinstance(identifier, type) and issubclass(identifier, Loss):
        return identifier()
    name = identifier if isinstance(identifier, str) else getattr(identifier, "__name__", None)
    if name in _LOSSES:
        return _LOSSES[name]()
    raise ValueError(f"Could not interpret loss identifier: {identifier!r}")


# ---- metrics ----

def _metric_counts(name, loss, y, p):
    """(sum, count) of a metric over a batch, so batches can be added up."""
    if name in ("accuracy", "acc"):
        if isinstance(loss, BinaryCrossentropy) or (p.shape[-1] == 1 and not isinstance(loss, SparseCategoricalCrossentropy)):
            name = "binary_accuracy"
        elif isinstance(loss, SparseCategoricalCrossentropy):
            name = "sparse_categorical_accuracy"
        else:
            name = "categorical_accuracy"
    if name == "sparse_categorical_accuracy":
        y = y[..., 0] if y.ndim == p.ndim else y
        hits = np.argmax(p, axis=-1) == y
    elif name == "categorical_accuracy":
        hits = np.argmax(p, axis=-1) == np.argmax(_same_rank(y, p), axis=-1)
    elif name == "binary_accuracy":
        hits = (p > 0.5) == (_same_rank(y, p) > 0.5)
    elif name in ("mae", "mean_absolute_error"):
        hits = np.abs(p - _same_rank(y, p))
    elif name in ("mse", "mean_squared_error"):
        hits = (p - _same_rank(y, p)) ** 2
    else:
        raise ValueError(f"Could not interpret metric identifier: {name!r}")
    return float(np.sum(hits)), hits.size


_METRICS = ("accuracy", "acc", "sparse_categorical_accuracy", "categorical_accuracy", "binary_accuracy",
            "mae", "mean_absolute_error", "mse", "mean_squared_error")


# ---- optimizers ----

class Optimizer:
    """Base class: updates the weights in place from their gradients."""

    def __init__(self, learning_rate=0.001, name=None):
        self.learning_rate = float(learning_rate)
        self.iterations = 0
        self._slots = {}

    def _slot(self, key, var):
        if key not in self._slots:
            self._slots[key] = np.zeros_like(var)
        return self._slots[key]

    def _apply(self, variables, grads):
        self.iterations += 1
        for i, (v, g) in enumerate(zip(variables, grads)):
            self._update(i, v, g.astype(float32))


class SGD(Optimizer):
    """Stochastic gradient descent, optionally with momentum."""

    def __init__(self, learning_rate=0.01, momentum=0.0, nesterov=False, name=None):
        super().__init__(learning_rate)
        self.momentum, self.nesterov = float(momentum), nesterov

    def _update(self, i, v, g):
        if not self.momentum:
            v -= self.learning_rate * g
            return
        m = self._slot(("m", i), v)
        m[...] = self.momentum * m - self.learning_rate * g
        v += self.momentum * m - self.learning_rate * g if self.nesterov else m


class Adam(Optimizer):
    """Adam: gradient descent with running averages of the gradients and their squares."""

    def __init__(self, learning_rate=0.001, beta_1=0.9, beta_2=0.999, epsilon=1e-7, name=None):
        super().__init__(learning_rate)
        self.beta_1, self.beta_2, self.epsilon = float(beta_1), float(beta_2), float(epsilon)

    def _update(self, i, v, g):
        t = self.iterations
        lr = self.learning_rate * np.sqrt(1 - self.beta_2 ** t) / (1 - self.beta_1 ** t)
        m, s = self._slot(("m", i), v), self._slot(("v", i), v)
        m += (g - m) * (1 - self.beta_1)
        s += (g * g - s) * (1 - self.beta_2)
        v -= lr * m / (np.sqrt(s) + self.epsilon)


class RMSprop(Optimizer):
    """RMSprop: divides each step by a running average of the squared gradients."""

    def __init__(self, learning_rate=0.001, rho=0.9, momentum=0.0, epsilon=1e-7, name=None):
        super().__init__(learning_rate)
        self.rho, self.momentum, self.epsilon = float(rho), float(momentum), float(epsilon)

    def _update(self, i, v, g):
        s = self._slot(("v", i), v)
        s[...] = self.rho * s + (1 - self.rho) * g * g
        step = self.learning_rate * g / np.sqrt(s + self.epsilon)
        if self.momentum:
            m = self._slot(("m", i), v)
            m[...] = self.momentum * m + step
            step = m
        v -= step


_OPTIMIZERS = {"sgd": SGD, "adam": Adam, "rmsprop": RMSprop}


def _get_optimizer(identifier):
    if isinstance(identifier, Optimizer):
        return identifier
    if isinstance(identifier, str) and identifier.lower() in _OPTIMIZERS:
        return _OPTIMIZERS[identifier.lower()]()
    raise ValueError(f"Could not interpret optimizer identifier: {identifier!r}")


# ---- callbacks ----

class Callback:
    """Base class for callbacks: model.fit calls these methods while it trains."""

    def __init__(self):
        self.model = None

    def set_model(self, model):
        self.model = model

    def on_train_begin(self, logs=None): pass
    def on_train_end(self, logs=None): pass
    def on_epoch_begin(self, epoch, logs=None): pass
    def on_epoch_end(self, epoch, logs=None): pass


class History(Callback):
    """What model.fit returns: history.history["loss"] etc. hold one value per epoch."""

    def __init__(self):
        super().__init__()
        self.history = {}
        self.epoch = []
        self.params = {}

    def on_epoch_end(self, epoch, logs=None):
        self.epoch.append(epoch)
        for k, v in (logs or {}).items():
            self.history.setdefault(k, []).append(v)


class EarlyStopping(Callback):
    """Stops training when `monitor` (default val_loss) hasn't improved for `patience` epochs."""

    def __init__(self, monitor="val_loss", min_delta=0, patience=0, verbose=0, mode="auto",
                 baseline=None, restore_best_weights=False, start_from_epoch=0):
        super().__init__()
        self.monitor, self.patience, self.verbose = monitor, int(patience), verbose
        self.baseline, self.restore_best_weights, self.start_from_epoch = baseline, restore_best_weights, start_from_epoch
        if mode == "auto":
            mode = "max" if any(w in monitor for w in ("acc", "accuracy", "auc")) else "min"
        if mode not in ("min", "max"):
            raise ValueError(f"EarlyStopping mode {mode} is unknown")
        self._better = (lambda a, b: a < b) if mode == "min" else (lambda a, b: a > b)
        self.min_delta = float(np.abs(min_delta)) * (-1 if mode == "min" else 1)

    def on_train_begin(self, logs=None):
        self.wait, self.stopped_epoch, self.best_epoch = 0, 0, 0
        self.best = np.inf if self._better(0, 1) else -np.inf
        self.best_weights = None

    def _improved(self, current, reference):
        return reference is None or self._better(current - self.min_delta, reference)

    def on_epoch_end(self, epoch, logs=None):
        current = (logs or {}).get(self.monitor)
        if current is None:
            print(f"Early stopping conditioned on metric `{self.monitor}` which is not available. "
                  f"Available metrics are: {','.join(logs or {})}")
            return
        if epoch < self.start_from_epoch:
            return
        if self.restore_best_weights and self.best_weights is None:
            self.best_weights = self.model.get_weights()
        self.wait += 1
        if self._improved(current, self.best):
            self.best, self.best_epoch = current, epoch
            if self.restore_best_weights:
                self.best_weights = self.model.get_weights()
            if self.baseline is None or self._improved(current, self.baseline):
                self.wait = 0
            return
        if self.wait >= self.patience and epoch > 0:
            self.stopped_epoch = epoch
            self.model.stop_training = True

    def on_train_end(self, logs=None):
        if self.stopped_epoch > 0 and self.verbose > 0:
            print(f"Epoch {self.stopped_epoch + 1}: early stopping")
        if self.restore_best_weights and self.best_weights is not None:
            if self.verbose > 0:
                print(f"Restoring model weights from the end of the best epoch: {self.best_epoch + 1}.")
            self.model.set_weights(self.best_weights)


class LambdaCallback(Callback):
    """A callback from plain functions, e.g. LambdaCallback(on_epoch_end=lambda epoch, logs: print(epoch))."""

    def __init__(self, on_epoch_begin=None, on_epoch_end=None, on_train_begin=None, on_train_end=None):
        super().__init__()
        for name, fn in (("on_epoch_begin", on_epoch_begin), ("on_epoch_end", on_epoch_end),
                         ("on_train_begin", on_train_begin), ("on_train_end", on_train_end)):
            if fn is not None:
                setattr(self, name, fn)


# ---- the model ----

def _fmt_value(v):
    return f"{v:.4f}" if np.abs(v) > 1e-3 else f"{v:.4e}"


def _progress(steps, seconds, logs, verbose):
    per_step = seconds / max(steps, 1) * 1000
    line = f"{steps}/{steps} " + ("━" * 20 + f" {seconds:.0f}s {per_step:.0f}ms/step" if verbose == 1 else f"- {seconds:.0f}s - {per_step:.0f}ms/step")
    return line + "".join(f" - {k}: {_fmt_value(v)}" for k, v in logs.items())


def _verbose(verbose):
    return 1 if verbose == "auto" else int(verbose)


class Sequential:
    """A model that is a plain stack of layers, each feeding the next."""

    def __init__(self, layers=None, name=None, trainable=True):
        self.name = name or _unique_name("sequential")
        self.layers = []
        self._input_shape = None
        self.built = False
        self.optimizer = None
        self.loss = None
        self._metrics = []
        self.stop_training = False
        self.history = None
        for layer in layers or []:
            self.add(layer)

    def add(self, layer):
        """Adds a layer on top of the stack."""
        if isinstance(layer, KerasTensor):
            if self.layers or self._input_shape is not None:
                raise ValueError("An Input can only be the first entry of a Sequential model.")
            self._input_shape = layer.shape
            return
        if isinstance(layer, Sequential):
            raise NotImplementedError("This TensorFlow-style model can't nest models; add the layers one by one.")
        if not isinstance(layer, Layer):
            raise ValueError(f"Only instances of `keras.Layer` can be added to a Sequential model. Received: {layer!r} (of type {type(layer)})")
        if not self.layers and self._input_shape is None and layer._input_shape_arg is not None:
            self._input_shape = (None,) + layer._input_shape_arg
        self.layers.append(layer)
        if self._input_shape is not None:
            self.build(self._input_shape)

    def pop(self):
        """Removes the top layer."""
        if not self.layers:
            raise TypeError("There are no layers in the model.")
        return self.layers.pop()

    def build(self, input_shape=None):
        """Creates the weights for inputs of input_shape (with None for the batch), e.g. (None, 16, 16)."""
        shape = tuple(input_shape if input_shape is not None else self._input_shape)
        self._input_shape = shape
        for layer in self.layers:
            if not layer.built:
                layer.build(shape)
            shape = layer.output_shape
        self.built = True

    @property
    def input_shape(self):
        return self._input_shape

    @property
    def output_shape(self):
        if not self.layers or not self.built:
            raise AttributeError(f"The model {self.name} has not been built yet.")
        return self.layers[-1].output_shape

    @property
    def weights(self):
        return [w for layer in self.layers for w in layer.weights]

    trainable_weights = weights

    def get_weights(self):
        return [w for layer in self.layers for w in layer.get_weights()]

    def set_weights(self, weights):
        weights = list(weights)
        expected = sum(len(layer._vars) for layer in self.layers)
        if len(weights) != expected:
            raise ValueError(f"You called `set_weights(weights)` on model {self.name} with a weight list of length {len(weights)}, but the model was expecting {expected} weights.")
        for layer in self.layers:
            n = len(layer._vars)
            layer.set_weights(weights[:n])
            weights = weights[n:]

    def count_params(self):
        if not self.built:
            raise ValueError(f"You tried to call `count_params` on model {self.name}, but the model has not been built. Build it first by calling `build()` or by fitting it on data.")
        return sum(layer.count_params() for layer in self.layers)

    def summary(self):
        """Prints the layers, their output shapes and their number of parameters."""
        widths = (33, 26, 15)
        def row(cells, left="│", mid="│", right="│"):
            texts = [f" {cells[0]:<{widths[0] - 2}} ", f" {cells[1]:<{widths[1] - 2}} ", f" {cells[2]:>{widths[2] - 2}} "]
            return left + mid.join(texts) + right
        def line(l, m, r, c="─"):
            return l + m.join(c * w for w in widths) + r
        out = [f'Model: "{self.name}"', line("┏", "┳", "┓", "━"), row(("Layer (type)", "Output Shape", "Param #"), "┃", "┃", "┃"), line("┡", "╇", "┩", "━")]
        for i, layer in enumerate(self.layers):
            shape = _shape(layer.output_shape) if layer.built else "?"
            params = f"{layer.count_params():,}" if layer.built else "0 (unbuilt)"
            out.append(row((f"{layer.name} ({type(layer).__name__})", shape, params)))
            if i < len(self.layers) - 1:
                out.append(line("├", "┼", "┤"))
        out.append(line("└", "┴", "┘"))
        total = sum(layer.count_params() for layer in self.layers if layer.built)
        size = lambda n: f"{n * 4 / 1024:.2f} KB" if n * 4 >= 1024 else f"{n * 4:.2f} B"
        out += [f" Total params: {total:,} ({size(total)})", f" Trainable params: {total:,} ({size(total)})", " Non-trainable params: 0 (0.00 B)"]
        print("\n".join(out))

    def compile(self, optimizer="rmsprop", loss=None, metrics=None, **kwargs):
        """Chooses the optimizer, the loss and the metrics to report while training."""
        self.optimizer = _get_optimizer(optimizer)
        self.loss = None if loss is None else _get_loss(loss)
        metrics = list(metrics or [])
        for m in metrics:
            if m not in _METRICS:
                raise ValueError(f"Could not interpret metric identifier: {m!r}")
        self._metrics = metrics
        self.compiled = True

    def _need_compile(self):
        if self.optimizer is None or self.loss is None:
            raise RuntimeError("You must call `compile()` before using the model." if self.optimizer is None
                               else "No loss to compute. Pass a `loss` to `compile()`.")

    def _x(self, x):
        if x is None:
            raise ValueError("Unrecognized data type: x=None")
        x = np.asarray(x, dtype=float32)
        if x.ndim == 0:
            raise ValueError(f"Expected the input to be an array of samples, got the single value {x!r}")
        if not self.built:
            self.build((None,) + x.shape[1:])
        expected = self._input_shape[1:]
        if len(x.shape) - 1 != len(expected) or any(e is not None and e != d for e, d in zip(expected, x.shape[1:])):
            raise ValueError(
                f'Input 0 of layer "{self.layers[0].name if self.layers else self.name}" is incompatible with the layer: '
                f"expected shape={_shape(self._input_shape)}, found shape={_shape(x.shape)}"
            )
        return x

    def _xy(self, x, y):
        x = self._x(x)
        if y is None:
            raise ValueError("Unrecognized data type: y=None. model.fit and model.evaluate need labels y.")
        y = np.asarray(y)
        if len(x) != len(y):
            raise ValueError(f"Data cardinality is ambiguous. Make sure all arrays contain the same number of samples.'x' sizes: {len(x)}\n'y' sizes: {len(y)}")
        return x, y

    def _forward(self, x, training):
        if not self.layers:
            raise ValueError(f"The model {self.name} has no layers yet.")
        for layer in self.layers:
            x = layer.forward(x, training)
        return x

    def _train_step(self, x, y):
        out = self._forward(x, True)
        loss, g = self.loss._compute(y, out)
        for layer in reversed(self.layers):
            g = layer.backward(g)
        variables = [v for layer in self.layers if layer.trainable for v in layer._vars]
        grads = [g for layer in self.layers if layer.trainable for g in layer._grads]
        self.optimizer._apply(variables, grads)
        return loss, out

    def _logs(self, y, out, loss, prefix=""):
        logs = {prefix + "loss": loss}
        for m in self._metrics:
            s, c = _metric_counts(m, self.loss, y, out)
            logs[prefix + m] = s / c
        return logs

    def __call__(self, inputs, training=False):
        return _tensor(self._forward(self._x(inputs), training))

    def fit(self, x=None, y=None, batch_size=None, epochs=1, verbose="auto", callbacks=None,
            validation_split=0.0, validation_data=None, shuffle=True, initial_epoch=0):
        """Trains the model on x and y for `epochs` passes; returns a History."""
        self._need_compile()
        x, y = self._xy(x, y)
        if validation_data is not None:
            vx, vy = self._xy(*validation_data[:2])
        elif validation_split:
            if not 0 < validation_split < 1:
                raise ValueError(f"`validation_split` must be between 0 and 1. Received: {validation_split}")
            split = int(np.floor(len(x) * (1 - validation_split)))
            x, vx, y, vy = x[:split], x[split:], y[:split], y[split:]
        else:
            vx = vy = None
        verbose = _verbose(verbose)
        batch_size = int(batch_size or 32)
        n, steps = len(x), -(-len(x) // batch_size)
        history = History()
        history.params = {"verbose": verbose, "epochs": epochs, "steps": steps}
        cbs = [history] + list(callbacks or [])
        for cb in cbs:
            cb.set_model(self)
        self.stop_training = False
        for cb in cbs:
            cb.on_train_begin()
        for epoch in range(initial_epoch, epochs):
            for cb in cbs:
                cb.on_epoch_begin(epoch)
            start = time.perf_counter()
            order = _rng().permutation(n) if shuffle else np.arange(n)
            total_loss, sums, counts = 0.0, {m: 0.0 for m in self._metrics}, {m: 0 for m in self._metrics}
            for i in range(0, n, batch_size):
                b = order[i:i + batch_size]
                loss, out = self._train_step(x[b], y[b])
                total_loss += loss * len(b)
                for m in self._metrics:
                    s, c = _metric_counts(m, self.loss, y[b], out)
                    sums[m] += s
                    counts[m] += c
            logs = {"loss": total_loss / n, **{m: sums[m] / counts[m] for m in self._metrics}}
            if vx is not None and len(vx):
                out = self._forward(vx, False)
                logs.update(self._logs(vy, out, self.loss._compute(vy, out)[0], "val_"))
            logs = {k: float(logs[k]) for k in sorted(logs)}
            if verbose:
                print(f"Epoch {epoch + 1}/{epochs}")
                print(_progress(steps, time.perf_counter() - start, logs, verbose))
            for cb in cbs:
                cb.on_epoch_end(epoch, logs)
            if self.stop_training:
                break
        for cb in cbs:
            cb.on_train_end()
        self.history = history
        return history

    def evaluate(self, x=None, y=None, batch_size=None, verbose="auto", return_dict=False):
        """Loss and metrics on x and y: a number, or [loss, metric, ...] when compiled with metrics."""
        self._need_compile()
        x, y = self._xy(x, y)
        start = time.perf_counter()
        out = self._forward(x, False)
        logs = {k: float(v) for k, v in self._logs(y, out, self.loss._compute(y, out)[0]).items()}
        if _verbose(verbose):
            print(_progress(-(-len(x) // int(batch_size or 32)), time.perf_counter() - start, dict(sorted(logs.items())), _verbose(verbose)))
        if return_dict:
            return logs
        return logs["loss"] if not self._metrics else [logs["loss"]] + [logs[m] for m in self._metrics]

    def predict(self, x, batch_size=None, verbose="auto"):
        """The model's outputs for x, as a numpy array with one row per sample."""
        x = self._x(x)
        start = time.perf_counter()
        out = self._forward(x, False)
        if _verbose(verbose):
            print(_progress(-(-len(x) // int(batch_size or 32)), time.perf_counter() - start, {}, _verbose(verbose)))
        return np.asarray(out)

    def save(self, *args, **kwargs):
        raise NotImplementedError("This TensorFlow-style model can't save models to files; keep the model in a variable.")

    def __repr__(self):
        return f"<Sequential name={self.name}, built={self.built}>"


def Model(*args, **kwargs):
    raise NotImplementedError("This TensorFlow-style model has no functional API; build your model with tf.keras.Sequential([...]).")


def _load_model(*args, **kwargs):
    raise NotImplementedError("This TensorFlow-style model can't load models from files.")


# ---- utils ----

def set_random_seed(seed):
    """Makes weights, shuffling and dropout repeatable (like tf.keras.utils.set_random_seed)."""
    import random
    random.seed(seed)
    np.random.seed(seed)
    _state["rng"] = np.random.default_rng(seed)


def to_categorical(x, num_classes=None):
    """One-hot encodes integer labels: 2 becomes [0, 0, 1, 0, ...]."""
    x = np.asarray(x, dtype=np.int64)
    if x.ndim > 1 and x.shape[-1] == 1:
        x = x[..., 0]
    num_classes = int(num_classes if num_classes is not None else x.max() + 1)
    out = np.zeros(x.shape + (num_classes,), dtype=float32)
    np.put_along_axis(out, x[..., None], 1, axis=-1)
    return out


def _clear_session():
    _state["names"].clear()


# ---- the module tree: tf.keras, tf.keras.layers, ... (also importable as `keras`) ----

def _submodule(name, doc, **attrs):
    m = types.ModuleType(f"tensorflow.{name}", doc)
    m.__dict__.update(attrs)
    m.__getattr__ = _module_getattr(f"tensorflow.{name}")
    sys.modules[m.__name__] = m
    return m


random = _submodule("random", "Random numbers.", set_seed=set_random_seed)
nn = _submodule("nn", "Activation functions on tensors.", relu=_public_activation("relu"), sigmoid=_public_activation("sigmoid"),
                softmax=_public_activation("softmax"), tanh=_public_activation("tanh"))
math = _submodule("math", "Elementwise maths.", exp=exp, log=_log, abs=_abs, square=_square, sqrt=_sqrt, argmax=argmax, argmin=argmin,
                  reduce_sum=reduce_sum, reduce_mean=reduce_mean, reduce_max=reduce_max, reduce_min=reduce_min,
                  sigmoid=nn.sigmoid, tanh=nn.tanh)
nn.__dict__.update(log_softmax=lambda x, axis=-1: _tensor(np.log(softmax(x, axis))))

layers = _submodule("keras.layers", "Layers.", Layer=Layer, Input=Input, InputLayer=InputLayer, Dense=Dense, Flatten=Flatten,
                    Activation=Activation, Dropout=Dropout, Rescaling=Rescaling)
activations = _submodule("keras.activations", "Activation functions.", relu=nn.relu, sigmoid=nn.sigmoid, softmax=nn.softmax,
                         tanh=nn.tanh, linear=_public_activation("linear"))
losses = _submodule("keras.losses", "Loss functions.", Loss=Loss, SparseCategoricalCrossentropy=SparseCategoricalCrossentropy,
                    CategoricalCrossentropy=CategoricalCrossentropy, BinaryCrossentropy=BinaryCrossentropy,
                    MeanSquaredError=MeanSquaredError, MeanAbsoluteError=MeanAbsoluteError,
                    **{name: _loss_function(name) for name in _LOSSES})
optimizers = _submodule("keras.optimizers", "Optimizers.", Optimizer=Optimizer, SGD=SGD, Adam=Adam, RMSprop=RMSprop)
callbacks = _submodule("keras.callbacks", "Callbacks for model.fit.", Callback=Callback, History=History,
                       EarlyStopping=EarlyStopping, LambdaCallback=LambdaCallback)
utils = _submodule("keras.utils", "Utilities.", set_random_seed=set_random_seed, to_categorical=to_categorical)
models = _submodule("keras.models", "Models.", Sequential=Sequential, Model=Model, load_model=_load_model)
backend = _submodule("keras.backend", "Backend utilities.", clear_session=_clear_session)
keras = _submodule("keras", "The Keras API of this TensorFlow-style model.", Sequential=Sequential, Model=Model, Input=Input,
                   layers=layers, activations=activations, losses=losses, optimizers=optimizers, callbacks=callbacks,
                   utils=utils, models=models, backend=backend)
keras.__version__ = "3.11.0-lite"

# `import keras` (Keras 3 on its own) gets the same modules.
for _name in [n for n in sys.modules if n.startswith("tensorflow.keras")]:
    sys.modules[_name[len("tensorflow."):]] = sys.modules[_name]
del _name

__getattr__ = _module_getattr("tensorflow")
