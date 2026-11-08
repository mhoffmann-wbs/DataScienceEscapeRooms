# TensorFlow-lite: what the neural network rooms' "TensorFlow" covers

**Status: planned (plan step 20), to be built as `content/python/tensorflow.py`. Keep this page in sync with it.**

Real [TensorFlow](https://www.tensorflow.org/) can't run in the browser: Pyodide doesn't ship it, and TensorFlow has no WebAssembly build. The neural network rooms therefore ship a small replacement, written with numpy only, that keeps TensorFlow's API names. Students write the same code they would write with the real library, for the parts it covers. Rooms and the debrief must call it "a TensorFlow-style model", never TensorFlow itself.

## Same as TensorFlow (planned for NN1)

| Area | What students use |
|---|---|
| Imports | `import tensorflow as tf`, `from tensorflow import keras`, `from tensorflow.keras import layers` |
| Seeds | `tf.random.set_seed(...)`, `tf.keras.utils.set_random_seed(...)` |
| Model | `tf.keras.Sequential([...])`, `model.add(...)`, `model.summary()`, `model.layers`, `get_weights()` / `set_weights()` |
| Layers | `Input(shape)`, `Flatten`, `Dense(units, activation)`, `Dropout(rate)` |
| Activations | `"relu"`, `"sigmoid"`, `"softmax"`, `"linear"` / `None` |
| Training | `model.compile(optimizer, loss, metrics=["accuracy"])` with `"sgd"` / `"adam"` or `tf.keras.optimizers.SGD/Adam(learning_rate=…)`, losses `sparse_categorical_crossentropy`, `categorical_crossentropy`, `binary_crossentropy`, `mse` |
| Fit | `history = model.fit(x, y, epochs, batch_size, validation_split / validation_data, callbacks, verbose)`, `history.history["loss" / "val_loss" / "accuracy" / "val_accuracy"]` |
| Callbacks | `tf.keras.callbacks.EarlyStopping(monitor, patience, restore_best_weights)` |
| Use | `model.evaluate(x, y)`, `model.predict(x)` (numpy arrays), `tf.keras.utils.to_categorical` |
| Errors | The same mistakes fail the same way, e.g. `categorical_crossentropy` with integer labels |

## Different from TensorFlow

- Same maths (Glorot uniform init, Keras's default optimizer settings), but different random numbers and float rounding, so trained weights and metrics won't match the real library's to the decimal.
- Runs on the CPU in numpy; no GPU, no graph compilation.
- Tensors are numpy arrays; `model(x)` returns an array that also has `.numpy()`.

## Not covered (for now)

- `Conv2D`, `MaxPooling2D` (planned for NN2)
- The functional API and model subclassing, custom layers and training loops (`GradientTape`)
- `tf.data`, saving and loading models, TensorBoard
