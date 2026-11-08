import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadModules } from '../rooms';
import { nodePyodide } from './nodePython';
import { moduleSetup, runPython } from './pythonCore';

// The TensorFlow-style model in content/python/tensorflow.py (scope: docs/tensorflow-lite.md).
describe('tensorflow module', () => {
  let py: PyodideAPI;
  let setup: string;
  beforeAll(async () => {
    py = await nodePyodide(['numpy']);
    setup = moduleSetup(await loadModules(['tensorflow']));
  }, 180_000);

  const run = async (code: string, expr: string) => {
    const out = await runPython(py, `import numpy as np\nimport tensorflow as tf\nfrom tensorflow.keras import layers\n${code}`, setup, expr);
    if (!out.ok) throw new Error(out.error);
    return JSON.parse(out.check!) as unknown;
  };

  it('computes the same gradients as finite differences', async () => {
    // For each loss: backpropagated gradients of every weight against central differences of the loss.
    const result = await run(
      `
def grad_error(model, loss, x, y):
    model.compile(optimizer="sgd", loss=loss)
    out = model._forward(x, True)
    _, g = model.loss._compute(y, out)
    for layer in reversed(model.layers):
        g = layer.backward(g)
    worst = 0.0
    for layer in model.layers:
        for v, grad in zip(layer._vars, layer._grads):
            for idx in list(np.ndindex(v.shape))[:12]:
                old = v[idx]
                v[idx] = old + 1e-2
                up = model.loss._compute(y, model._forward(x, False))[0]
                v[idx] = old - 1e-2
                down = model.loss._compute(y, model._forward(x, False))[0]
                v[idx] = old
                worst = max(worst, abs((up - down) / 2e-2 - grad[idx]) / max(1.0, abs(grad[idx])))
    return worst

tf.keras.utils.set_random_seed(3)
rng = np.random.default_rng(0)
x = rng.normal(size=(8, 2, 3))
def net(last, hidden="relu"):
    return tf.keras.Sequential([tf.keras.Input((2, 3)), layers.Flatten(), layers.Dense(5, activation=hidden), layers.Dense(4, activation=last)])
errors = [
    grad_error(net("softmax", "tanh"), "sparse_categorical_crossentropy", x, rng.integers(0, 4, 8)),
    grad_error(net(None, "tanh"), tf.keras.losses.CategoricalCrossentropy(from_logits=True), x, tf.keras.utils.to_categorical(rng.integers(0, 4, 8), 4)),
    grad_error(net("sigmoid", "tanh"), "binary_crossentropy", x, rng.integers(0, 2, (8, 4))),
    grad_error(net(None, "sigmoid"), "mse", x, rng.normal(size=(8, 4))),
]`,
      `[bool(e < 1e-3) for e in errors]`,
    );
    expect(result).toEqual([true, true, true, true]);
  });

  it('takes Adam steps like Keras', async () => {
    const result = await run(
      `
opt = tf.keras.optimizers.Adam(learning_rate=0.1)
w = np.array([1.0, -2.0], dtype=np.float32)
for g in ([0.5, -1.0], [0.2, 0.3]):
    opt._apply([w], [np.array(g, dtype=np.float32)])
# By hand: m and v are running averages, the step is lr * sqrt(1 - b2^t) / (1 - b1^t) * m / (sqrt(v) + eps).
m = 0.1 * np.array([0.5, -1.0]); v = 0.001 * np.array([0.25, 1.0])
w1 = np.array([1.0, -2.0]) - 0.1 * np.sqrt(1 - 0.999) / (1 - 0.9) * m / (np.sqrt(v) + 1e-7)
m = 0.9 * m + 0.1 * np.array([0.2, 0.3]); v = 0.999 * v + 0.001 * np.array([0.04, 0.09])
w2 = w1 - 0.1 * np.sqrt(1 - 0.999 ** 2) / (1 - 0.9 ** 2) * m / (np.sqrt(v) + 1e-7)`,
      `bool(np.allclose(w, w2, atol=1e-5))`,
    );
    expect(result).toBe(true);
  });

  it('learns a small classification problem and reports like Keras', async () => {
    const result = await run(
      `
tf.keras.utils.set_random_seed(1)
rng = np.random.default_rng(1)
centres = np.array([[0, 0], [3, 3], [0, 3]])
y = rng.integers(0, 3, 600)
x = (centres[y] + rng.normal(0, 0.6, (600, 2))).astype("float32")
model = tf.keras.Sequential([tf.keras.Input((2,)), layers.Dense(16, activation="relu"), layers.Dense(3, activation="softmax")])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
history = model.fit(x[:500], y[:500], epochs=80, validation_split=0.2, verbose=0)
loss, acc = model.evaluate(x[500:], y[500:], verbose=0)
probs = model.predict(x[500:], verbose=0)`,
      `[sorted(history.history), len(history.history["loss"]), bool(acc > 0.95), model.count_params(), probs.shape[1], bool(np.allclose(probs.sum(axis=1), 1, atol=1e-5)), bool(history.history["loss"][-1] < history.history["loss"][0])]`,
    );
    expect(result).toEqual([['accuracy', 'loss', 'val_accuracy', 'val_loss'], 80, true, 2 * 16 + 16 + 16 * 3 + 3, 3, true, true]);
  });

  it('gives the same weights for the same seed', async () => {
    const result = await run(
      `
def weights():
    tf.keras.utils.set_random_seed(7)
    m = tf.keras.Sequential([layers.Dense(4, activation="relu", input_shape=(3,)), layers.Dense(2)])
    m.compile(optimizer="sgd", loss="mse")
    m.fit(np.ones((10, 3)), np.zeros((10, 2)), epochs=2, verbose=0)
    return m.get_weights()
a, b = weights(), weights()`,
      `all(np.array_equal(u, v) for u, v in zip(a, b))`,
    );
    expect(result).toBe(true);
  });

  it('stops early and restores the best weights', async () => {
    // A fixed sequence of validation losses: the best is epoch 3 (index 2); patience 2 stops after epoch 5.
    const result = await run(
      `
val = iter([0.9, 0.7, 0.5, 0.6, 0.55, 0.4])
class Fake:
    stop_training = False
    weights = 0
    def get_weights(self): return self.weights
    def set_weights(self, w): self.weights = w
model = Fake()
cb = tf.keras.callbacks.EarlyStopping(patience=2, restore_best_weights=True)
cb.set_model(model)
cb.on_train_begin()
for epoch in range(6):
    model.weights = epoch
    cb.on_epoch_end(epoch, {"val_loss": next(val)})
    if model.stop_training:
        break
cb.on_train_end()`,
      `[epoch, cb.best_epoch, model.weights]`,
    );
    expect(result).toEqual([4, 2, 2]);
  });

  it('prints a summary with output shapes and parameter counts', async () => {
    const out = await runPython(
      py,
      `import tensorflow as tf
model = tf.keras.Sequential([tf.keras.Input(shape=(16, 16)), tf.keras.layers.Flatten(), tf.keras.layers.Dense(64, activation="relu"), tf.keras.layers.Dense(10, activation="softmax")])
model.summary()`,
      setup,
    );
    expect(out.ok).toBe(true);
    expect(out.stdout).toContain('flatten (Flatten)');
    expect(out.stdout).toContain('(None, 256)');
    expect(out.stdout).toContain('dense_1 (Dense)');
    expect(out.stdout).toContain('16,448');
    expect(out.stdout).toContain('Total params: 17,098 (66.79 KB)');
  });

  it('can be imported the ways TensorFlow code does', async () => {
    const result = await run(
      `from tensorflow import keras
from tensorflow.keras.layers import Dense
import keras as k3
t = tf.constant([[1.0, 2.0]])`,
      `[keras is tf.keras, Dense is layers.Dense, k3.layers is layers, str(t.dtype), t.numpy().tolist(), int(tf.argmax(tf.nn.softmax(t), axis=1)[0])]`,
    );
    expect(result).toEqual([true, true, true, 'float32', [[1, 2]], 1]);
  });

  it('fails the way TensorFlow does on common mistakes', async () => {
    const model = `model = tf.keras.Sequential([tf.keras.Input((4,)), layers.Dense(3, activation="softmax")])\nx = np.zeros((6, 4)); y = np.array([0, 1, 2, 0, 1, 2])\n`;
    for (const [code, message] of [
      [`${model}model.fit(x, y)`, 'You must call `compile()`'],
      [`${model}model.compile(loss="categorical_crossentropy")\nmodel.fit(x, y, verbose=0)`, 'target.shape=(None, 1), output.shape=(None, 3)'],
      [`${model}model.compile(loss="sparse_categorical_crossentropy")\nmodel.fit(x, y + 1, verbose=0)`, 'label value of 3 which is outside the valid range of [0, 3)'],
      [`${model}model.predict(np.zeros((6, 5)))`, 'expected shape=(None, 4), found shape=(6, 5)'],
      [`${model}model.compile(optimizer="adma", loss="mse")`, 'Could not interpret optimizer identifier'],
      ['layers.Dense(3, activation="relux")', 'Could not interpret activation function identifier'],
      ['tf.keras.datasets.mnist.load_data()', "has no attribute 'datasets'"],
      ['inputs = tf.keras.Input((4,))\nlayers.Dense(3)(inputs)', 'no functional API'],
    ] as const) {
      const out = await runPython(py, `import numpy as np\nimport tensorflow as tf\nfrom tensorflow.keras import layers\n${code}`, setup);
      expect(out.ok, code).toBe(false);
      if (!out.ok) expect(out.error).toContain(message);
    }
  });
});
