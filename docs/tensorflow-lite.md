# TensorFlow-lite: what the neural network rooms' "TensorFlow" covers

**Status: built as `content/python/tensorflow.py` (tests: `src/runners/tensorflow.test.ts`), for the neural network rooms `nn-post` and `nn-tablets` (plan step 20). Keep this page in sync with it.**

Real [TensorFlow](https://www.tensorflow.org/) can't run in the browser: Pyodide doesn't ship it, and TensorFlow has no WebAssembly build. The neural network rooms therefore ship a small replacement, written with numpy only, that keeps TensorFlow's API names. Students write the same code they would write with the real library, for the parts it covers. Rooms and the debrief must call it "a TensorFlow-style model", never TensorFlow itself.

## Same as TensorFlow

| Area | What students use |
|---|---|
| Imports | `import tensorflow as tf`, `from tensorflow import keras`, `from tensorflow.keras import layers`; also `import keras` (Keras 3 on its own) |
| Seeds | `tf.random.set_seed(...)`, `tf.keras.utils.set_random_seed(...)` |
| Model | `tf.keras.Sequential([...])`, `model.add(...)`, `model.summary()`, `model.layers`, `get_weights()` / `set_weights()` |
| Layers | `Input(shape)` (or `input_shape=` on the first layer), `Flatten`, `Dense(units, activation, kernel_initializer)`, `Dropout(rate)`, `Activation`, `Rescaling(scale, offset)`, `Reshape(target_shape)` |
| Images | `Conv2D(filters, kernel_size, strides, padding="valid"/"same", activation, use_bias)` with Keras's kernel layout `(rows, columns, channels in, filters)`, `MaxPooling2D` / `AveragePooling2D(pool_size, strides, padding)`, `GlobalMaxPooling2D`, `GlobalAveragePooling2D` (also under Keras's short names such as `MaxPool2D`); images as `(samples, rows, columns, channels)`, channels last |
| Activations | `"relu"`, `"sigmoid"`, `"softmax"`, `"tanh"`, `"linear"` / `None`, or `tf.nn.relu` etc. |
| Training | `model.compile(optimizer, loss, metrics=["accuracy"])` with `"sgd"` / `"adam"` or `tf.keras.optimizers.SGD/Adam(learning_rate=…)`, `"rmsprop"` (the default), losses `sparse_categorical_crossentropy`, `categorical_crossentropy`, `binary_crossentropy` (also as classes with `from_logits=True`), `mse`, `mae`; metrics `accuracy` (chosen by the loss, as in Keras), the specific accuracies, `mae`, `mse` |
| Fit | `history = model.fit(x, y, epochs, batch_size, validation_split / validation_data, callbacks, verbose)`, `history.history["loss" / "val_loss" / "accuracy" / "val_accuracy"]` |
| Callbacks | `EarlyStopping(monitor, min_delta, patience, restore_best_weights, ...)`, `LambdaCallback`, subclasses of `Callback` |
| Use | `model.evaluate(x, y)`, `model.predict(x)` (numpy arrays), `model(x)` (a tensor), `summary()`, `count_params()`, `get_weights()` / `set_weights()`, `layer.kernel` / `layer.bias`, `tf.keras.utils.to_categorical` |
| Tensors | `tf.constant`, `tf.cast`, `tf.matmul`, `tf.argmax`, `tf.reduce_sum/mean/max/min`, `tf.nn.relu/sigmoid/softmax`, `tf.math.exp/log/...` |
| Output | `fit` prints one Keras-style line per epoch (`verbose=0` silences it, `2` drops the bar); `summary()` prints Keras 3's table |
| Errors | The same mistakes fail with Keras's messages: `categorical_crossentropy` with integer labels, labels outside `[0, units)`, the wrong input shape, `fit` before `compile`, images without a channel axis (`expected ndim=4`), layers that shrink an image to nothing (`Computed output size would be negative`) |

## Different from TensorFlow

- Same maths (Glorot uniform init, Keras's default optimizer settings), but different random numbers and float rounding, so trained weights and metrics won't match the real library's to the decimal.
- Runs on the CPU in numpy; no GPU, no graph compilation.
- Tensors are numpy arrays; `model(x)` and the tf functions return an array that also has `.numpy()` and prints like a tensor.
- `fit` prints a finished bar per epoch instead of a live one; `summary()` has no optimizer line.
- Training runs inside the 10 s run limit: keep rooms to small images (16 × 16), a few thousand samples and about 20 epochs. Convolutions cost far more: Pyodide's numpy has no BLAS, so it runs at roughly scalar speed. `nn-tablets` trains 1,920 images of 24 × 24 through Conv2D(8) → pool → Conv2D(16) for 6 epochs in about 4 s in Node, most of it in the second Conv2D.
- Conv2D uses im2col (each window becomes a row, then one matrix product); max pooling sends each window's gradient to its first largest value, as TensorFlow does. No dilation, no `channels_first`.
- Anything outside this page raises an `AttributeError` that says this is not the full TensorFlow.

## Not covered (for now)

- `Conv1D`, `Conv2DTranspose`, `SeparableConv2D`, dilated convolutions
- The functional API (`tf.keras.Model(inputs, outputs)`), model subclassing, custom layers and training loops (`GradientTape`), nested models
- `sample_weight`, `class_weight`, regularizers, batch normalisation, learning-rate schedules
- `tf.keras.datasets` (rooms bring their own data)
- `tf.data`, saving and loading models, TensorBoard
