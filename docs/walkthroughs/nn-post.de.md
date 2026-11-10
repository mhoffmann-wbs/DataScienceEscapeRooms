# Die Nachtpost: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Bahnhofspostamt Kleeberg, Freitagnacht, zehn nach elf. Ein Stromausfall hat Iris gelöscht, die Maschine, die die handgeschriebenen Postleitzahlen auf Briefen liest, und der Nachtpostzug fährt um 00:40 ab. Ferdinand Kowalski, der Iris gebaut hat, ist im Urlaub; sein Azubi Jonas hat versucht, sie neu anzulernen, und aufgegeben.
>
> Baut Iris' Netz neu auf, trainiert es mit ihrem Archiv aus Ziffernkarten und sortiert die Eilbriefe, bevor der Zug abfährt. Python läuft hier mit einem TensorFlow-artigen Modell: einer kleinen Bibliothek mit den Namen von TensorFlow (`import tensorflow as tf`), für diesen Raum geschrieben, weil das echte TensorFlow nicht im Browser läuft. Das erste Rätsel, das ihr öffnet, braucht einen Moment zum Laden.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Der Umschlagscanner | NumPy-Arrays als Bilder: Formen, Umformen in der richtigen Reihenfolge, Teilen und Stapeln, Pixelwerte skalieren und umkehren | 🔎 Das Handbuch des Scanners, 🔎 Iris' Typenschild |
| 2 | Iris' letztes Backup | Was eine Dense-Schicht berechnet: Matrixprodukt, Bias, ReLU, Softmax; argmax als Vorhersage; dasselbe Netz als Keras-Schichten mit set_weights | von Anfang an offen |
| 3 | Der Bauplan | Sequential, Input, Flatten, Dense; Parameter zählen (Eingaben × Neuronen + ein Bias pro Neuron); summary() | 🔎 Bauplan: Iris 2, 🔎 Iris' Typenschild |
| 4 | Jonas' Laptop | compile, fit, evaluate; sparse vs. categorical Cross-Entropy; eine Softmax-Ausgabeschicht; Eingaben skalieren; Keras-Fehler und Trainingsausgaben lesen | 🔒 3. Der Bauplan, 🔎 Ein Zettel von Jonas, 🔎 Das Etikett der Archivkisten, 🔎 Iris' Typenschild |
| 5 | Ferdinands Schrank | Trainings- vs. Validierungs-Loss, Overfitting, die beste Epoche, EarlyStopping mit monitor, patience und restore_best_weights | 🔒 2. Iris' letztes Backup, 🔎 Ferdinands Regeln |
| 6 | Iris (Abschluss-Schloss) | Der ganze Ablauf: Architektur, Skalierung, compile, fit mit Validierung und Early Stopping, evaluate, neue Daten genauso vorbereiten wie die Trainingsdaten, predict | 1. Der Umschlagscanner (sein Ergebnis), 3. Der Bauplan (sein Ergebnis), 4. Jonas' Laptop (sein Ergebnis), 5. Ferdinands Schrank (sein Ergebnis), 🔒 5. Ferdinands Schrank, 🔎 Die Abfahrtstafel, 🔎 Ferdinands Regeln |

## Stationen

### 1. Der Umschlagscanner

**Übt:** NumPy-Arrays als Bilder: Formen, Umformen in der richtigen Reihenfolge, Teilen und Stapeln, Pixelwerte skalieren und umkehren  
**Braucht:** 🔎 Das Handbuch des Scanners, 🔎 Iris' Typenschild  
**Daten:** [scanner.py](../../content/rooms/nn-post/data/scanner.py)

**Aufgabe:**

> Zuerst muss Iris sehen können. Der Scanner an der Tür funktioniert noch: Ein Testumschlag liegt darin, und seine Ausgabe ist als `stream` geladen, eine lange Reihe von Zahlen. Welche Postleitzahl steht auf dem Umschlag?
>
> 1. Macht aus `stream` die fünf Ziffernbilder der Postleitzahl: `digits`, mit der Form `(5, 16, 16)`.
> 2. Rechnet `digits` auf die Pixelwerte um, die Iris erwartet.
> 3. Schaut euch die Ziffern mit `show_images` an und speichert die Postleitzahl als `postcode`, als Text wie `"12345"`.

<details><summary>Startcode</summary>

```python
import numpy as np
from helpers import show_images

print(stream.shape, stream.min(), stream.max())

digits = None     # Form (5, 16, 16), in Iris' Format
postcode = None   # z. B. "12345"

# show_images(digits, labels=[1, 2, 3, 4, 5])
```

</details>

**Musterlösung:**

```python
import numpy as np
from helpers import show_images

strip = stream.reshape(16, 80)              # the scanner reads 16 lines of 80 pixels
show_images(strip, title="Scanner strip")
digits = np.stack(np.hsplit(strip, 5))      # five boxes of 16 x 16
digits = 1 - digits / 255                   # Iris: ink 1.0, paper 0.0
show_images(digits, labels=[1, 2, 3, 4, 5])
postcode = "35781"
```

**Geprüftes Ergebnis** (`_scanner_check(digits, postcode)`):

```json
"read"
```

**Zeigt nach dem Lösen:**

> Der Testumschlag geht an **35781**, Kleeberg selbst.

**Hinweise:**

1. Das Handbuch des Scanners sagt, wie er einen Umschlag liest, und Iris' Typenschild, welche Pixel sie will. `stream.reshape(5, 16, 16)` ergibt Streifen, keine Ziffern: Der Scanner speichert nicht eine Ziffer nach der anderen. Formt es zuerst so um, wie er wirklich liest, und schaut euch das mit `show_images` an.
2. Der Scanner liest 16 Zeilen mit 80 Pixeln: `strip = stream.reshape(16, 80)`. `np.hsplit(strip, 5)` schneidet das in fünf Stücke von 16 × 16, und `np.stack(...)` macht daraus ein Array. Die 0 des Scanners ist schwarze Tinte; Iris' Tinte ist 1.0.
3. `digits = 1 - np.stack(np.hsplit(stream.reshape(16, 80), 5)) / 255`. Die Postleitzahl ist `"35781"`.

### 2. Iris' letztes Backup

**Übt:** Was eine Dense-Schicht berechnet: Matrixprodukt, Bias, ReLU, Softmax; argmax als Vorhersage; dasselbe Netz als Keras-Schichten mit set_weights  
**Braucht:** von Anfang an offen  
**Daten:** [wiring.py](../../content/rooms/nn-post/data/wiring.py)

**Aufgabe:**

> Ferdinands altes Terminal enthält noch das Netz der alten Iris: `W1`, `b1`, `W2`, `b2`, und ihre sechs Selbsttestkarten, `cards`, schon in ihrem Format. Jeden Morgen hat sie diese Karten gelesen und ihr Ergebnis auf einen Zettel gedruckt. Was hat sie gelesen?
>
> 1. Rechnet mit NumPy von Hand, was ihr Netz tut. Jede Karte als Zeile aus 256 Pixeln, mal `W1`, plus `b1`, dann ReLU: `hidden`. Dann mal `W2`, plus `b2`, dann Softmax: `probs`, eine Zeile mit 10 Wahrscheinlichkeiten pro Karte.
> 2. Ihr Ergebnis, `reading`: für jede Karte die Ziffer mit der höchsten Wahrscheinlichkeit, als ein Text aus sechs Ziffern.
> 3. Baut die alte Iris als Keras-Modell nach, `old_iris`, mit denselben Schichten. Ladet ihre Gewichte mit `set_weights` und prüft, dass `old_iris.predict(cards)` eure `probs` ergibt.

<details><summary>Startcode</summary>

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

show_images(cards, title="Selbsttestkarten")
print(W1.shape, b1.shape, W2.shape, b2.shape)

hidden = None    # (6, 16): ReLU(Karten als Zeilen @ W1 + b1)
probs = None     # (6, 10): Softmax(hidden @ W2 + b2)
reading = None   # z. B. "123456"

old_iris = None  # tf.keras.Sequential([...]) mit den Schichten der alten Iris, dann set_weights
```

</details>

**Musterlösung:**

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

show_images(cards, title="Self-test cards")
hidden = np.maximum(cards.reshape(6, 256) @ W1 + b1, 0)
scores = hidden @ W2 + b2
probs = np.exp(scores) / np.exp(scores).sum(axis=1, keepdims=True)
reading = "".join(str(d) for d in probs.argmax(axis=1))
print(reading, probs.max(axis=1).round(2))

old_iris = tf.keras.Sequential([
    tf.keras.Input(shape=(16, 16)),
    layers.Flatten(),
    layers.Dense(16, activation="relu"),
    layers.Dense(10, activation="softmax"),
])
old_iris.set_weights([W1, b1, W2, b2])
print(np.abs(old_iris.predict(cards) - probs).max())
```

**Geprüftes Ergebnis** (`_wiring_check(hidden, probs, reading, old_iris)`):

```json
"self-test passed"
```

**Zeigt nach dem Lösen:**

> Die alte Iris liest **305118**. Schaut euch die vierte Karte an: Sie ist eine durchgestrichene 7, und Iris war sich sicher, dass es eine 1 ist. Mit nur 16 versteckten Neuronen hat sie zu wenig gelernt.
>
> Eure Handrechnung und Keras stimmen überein: Eine Dense-Schicht ist ein Matrixprodukt, ein Bias und eine Aktivierung, mehr nicht.

**Hinweise:**

1. `cards.reshape(6, 256)` legt jede Karte in eine Zeile. `@` multipliziert Matrizen, und `np.maximum(x, 0)` ist ReLU. Softmax: `np.exp(s)` geteilt durch seine Summe in jeder Zeile, `np.exp(s).sum(axis=1, keepdims=True)`.
2. `probs.argmax(axis=1)` gibt die Ziffer für jede Karte; `"".join(...)` macht einen Text daraus. Die alte Iris in Keras: `Input(shape=(16, 16))`, `Flatten()`, `Dense(16, activation="relu")`, `Dense(10, activation="softmax")`; dann `old_iris.set_weights([W1, b1, W2, b2])`.
3. `hidden = np.maximum(cards.reshape(6, 256) @ W1 + b1, 0)`, `scores = hidden @ W2 + b2`, `probs = np.exp(scores) / np.exp(scores).sum(axis=1, keepdims=True)`. Sie liest `"305118"`, obwohl die vierte Karte eine 7 ist.

### 3. Der Bauplan

**Übt:** Sequential, Input, Flatten, Dense; Parameter zählen (Eingaben × Neuronen + ein Bias pro Neuron); summary()  
**Braucht:** 🔎 Bauplan: Iris 2, 🔎 Iris' Typenschild  
**Daten:** [blueprint.py](../../content/rooms/nn-post/data/blueprint.py)

**Aufgabe:**

> Ferdinand hat drei Entwürfe für eine neue Iris gezeichnet. Welcher passt auf ihren Speicherchip?
>
> 1. Baut die Entwürfe als Keras-Modelle und lasst Keras ihre Parameter zählen, mit `summary()` oder `count_params()`.
> 2. Speichert den Entwurf, der passt, als `model`.

<details><summary>Startcode</summary>

```python
import tensorflow as tf
from tensorflow.keras import layers

model = tf.keras.Sequential([
    tf.keras.Input(shape=(16, 16)),
    # ... die Schichten eines Entwurfs
])
model.summary()
```

</details>

**Musterlösung:**

```python
import tensorflow as tf
from tensorflow.keras import layers

for first, second in [(128, 32), (64, 64), (64, 32)]:
    draft = tf.keras.Sequential([
        tf.keras.Input(shape=(16, 16)),
        layers.Flatten(),
        layers.Dense(first, activation="relu"),
        layers.Dense(second, activation="relu"),
        layers.Dense(10, activation="softmax"),
    ])
    print(first, second, draft.count_params())

model = tf.keras.Sequential([
    tf.keras.Input(shape=(16, 16)),
    layers.Flatten(),
    layers.Dense(64, activation="relu"),
    layers.Dense(32, activation="relu"),
    layers.Dense(10, activation="softmax"),
])
model.summary()
```

**Geprüftes Ergebnis** (`_blueprint_check(model)`):

```json
"fits"
```

**Zeigt nach dem Lösen:**

> Entwurf C passt: **18.858** Parameter. Seine erste Schicht allein hat 256 × 64 + 64 = 16.448: In einem dichten Netz sitzen die meisten Parameter dort, wo die Pixel hereinkommen.

**Hinweise:**

1. Ferdinands Entwürfe hängen an der Wand. Jeder Entwurf beginnt mit `layers.Flatten()`, das eine 16 × 16-Karte in 256 Zahlen verwandelt. Eine `Dense`-Schicht hat ein Gewicht pro Eingabe und Neuron, plus einen Bias pro Neuron. Das Typenschild sagt, wie viel der Chip fasst.
2. Entwurf A hat 37.354 Parameter und Entwurf B 21.258. Der Chip fasst 20.000.
3. Entwurf C: `tf.keras.Sequential([tf.keras.Input(shape=(16, 16)), layers.Flatten(), layers.Dense(64, activation="relu"), layers.Dense(32, activation="relu"), layers.Dense(10, activation="softmax")])`.

### 4. Jonas' Laptop

**Übt:** compile, fit, evaluate; sparse vs. categorical Cross-Entropy; eine Softmax-Ausgabeschicht; Eingaben skalieren; Keras-Fehler und Trainingsausgaben lesen  
**Braucht:** 🔒 3. Der Bauplan, 🔎 Ein Zettel von Jonas, 🔎 Das Etikett der Archivkisten, 🔎 Iris' Typenschild  
**Daten:** [archive.py](../../content/rooms/nn-post/data/archive.py)

**Zahlenschloss** (öffnet mit `18858`):

> Jonas' Laptop ist gesperrt. Ein Zettel auf dem Deckel: „Passwort: wie viele Parameter Iris 2 hat. (Der Entwurf, der passt!)“

**Aufgabe:**

> Jonas' Skript trainiert Iris 2 mit ihrem Archiv: `x_train` und `y_train` zum Lernen, `x_test` und `y_test` zum Testen. Zuerst ist es abgestürzt, und Jonas hat aufgegeben.
>
> Findet seine Fehler. Iris darf wieder in Betrieb, wenn sie mindestens 85 % der Testkarten richtig liest.

<details><summary>Startcode</summary>

```python
import tensorflow as tf
from tensorflow.keras import layers

# Jonas: Iris 2. Warum geht das nicht?!
tf.keras.utils.set_random_seed(1)

model = tf.keras.Sequential([
    tf.keras.Input(shape=(16, 16)),
    layers.Flatten(),
    layers.Dense(64, activation="relu"),
    layers.Dense(32, activation="relu"),
    layers.Dense(10, activation="relu"),
])
model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
history = model.fit(x_train, y_train, epochs=10, validation_split=0.2)

test_loss, test_accuracy = model.evaluate(x_test, y_test)
print("Test accuracy:", test_accuracy)
```

</details>

**Musterlösung:**

```python
import tensorflow as tf
from tensorflow.keras import layers

tf.keras.utils.set_random_seed(1)

model = tf.keras.Sequential([
    tf.keras.Input(shape=(16, 16)),
    layers.Flatten(),
    layers.Dense(64, activation="relu"),
    layers.Dense(32, activation="relu"),
    layers.Dense(10, activation="softmax"),
])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
history = model.fit(x_train / 255, y_train, epochs=10, validation_split=0.2)

test_loss, test_accuracy = model.evaluate(x_test / 255, y_test)
print("Test accuracy:", test_accuracy)
```

**Geprüftes Ergebnis** (`_apprentice_check(model)`):

```json
"in service"
```

**Zeigt nach dem Lösen:**

> Iris 2 liest etwa **95 %** der Testkarten richtig. Jonas hat drei Fehler gemacht: einen Loss für One-Hot-Labels bei Labels, die einfache Ziffern sind, ReLU in der Ausgabe (alle zehn Ausgaben können 0 werden, und der Loss `nan`), und Pixel von 0 bis 255 statt 0.0 bis 1.0, womit das Netz schlecht lernt.

**Hinweise:**

1. Lest den Fehler von unten: `target.shape=(None, 1), output.shape=(None, 10)`. Die Labels sind einzelne Ziffern, keine Zeilen aus zehn Nullen und Einsen. Welcher Loss nimmt solche Labels? Das Handbuch vergleicht die beiden.
2. Wenn der Loss zu `nan` wird, schaut auf die letzte Schicht: Iris' Ausgabe müssen 10 Wahrscheinlichkeiten sein, die zusammen 1 ergeben. Vergleicht dann das Archivetikett (wie die Karten gespeichert sind) mit dem Typenschild (was Iris erwartet).
3. `loss="sparse_categorical_crossentropy"`, `activation="softmax"` in der letzten Schicht, und `x_train / 255` in `fit` und `x_test / 255` in `evaluate`.

### 5. Ferdinands Schrank

**Übt:** Trainings- vs. Validierungs-Loss, Overfitting, die beste Epoche, EarlyStopping mit monitor, patience und restore_best_weights  
**Braucht:** 🔒 2. Iris' letztes Backup, 🔎 Ferdinands Regeln  
**Daten:** [logbook.py](../../content/rooms/nn-post/data/logbook.py)

**Zahlenschloss** (öffnet mit `305118`):

> Ferdinands Schrank hat ein sechsstelliges Zahlenschloss. Darauf eingraviert: „Iris' Selbsttest-Ergebnis.“

**Aufgabe:**

> Im Schrank: Ferdinands Trainingslogbuch, `log`, von einem langen Trainingslauf von Iris 2. Nach jeder der 30 Epochen hat es Loss und Accuracy auf den Trainingskarten und den Validierungskarten festgehalten, wie `history.history` nach `model.fit`. Wann soll so ein Training aufhören, und welche Gewichte soll Iris behalten?
>
> 1. `best_epoch`: die Epoche mit dem niedrigsten Validierungs-Loss, ab 1 gezählt, wie Keras zählt.
> 2. Richtet Early Stopping für Iris ein: `stopper`, ein `tf.keras.callbacks.EarlyStopping`.
> 3. `replay(stopper, log)` lässt das Logbuch durch euren `stopper` laufen, als liefe das Training noch einmal. In welcher Epoche hört es auf (`stop_epoch`), und aus welcher Epoche stammen die Gewichte, die das Modell behält (`kept_epoch`)?

<details><summary>Startcode</summary>

```python
import numpy as np
import tensorflow as tf
from helpers import show_plot, replay

print(log.keys())
show_plot(log["loss"], log["val_loss"], labels=["loss", "val_loss"], title="Ferdinands Trainingslauf")

best_epoch = None   # ab 1 gezählt
stopper = None      # tf.keras.callbacks.EarlyStopping(...)
stop_epoch = None
kept_epoch = None
```

</details>

**Musterlösung:**

```python
import numpy as np
import tensorflow as tf
from helpers import show_plot, replay

show_plot(log["loss"], log["val_loss"], labels=["loss", "val_loss"], title="Ferdinand's training run")
best_epoch = int(np.argmin(log["val_loss"])) + 1
stopper = tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True)
stop_epoch = replay(stopper, log)
kept_epoch = stopper.model.weights_from
print(best_epoch, stop_epoch, kept_epoch)
```

**Geprüftes Ergebnis** (`_logbook_check(best_epoch, stopper, stop_epoch, kept_epoch)`):

```json
"logged"
```

**Zeigt nach dem Lösen:**

> Die beste Epoche ist **17**. Danach lernt das Netz die Trainingskarten auswendig, und der Validierungs-Loss steigt. Das Training übersteht das Wackeln in den Epochen 9 und 10, hört in Epoche **20** auf und kehrt zu den Gewichten aus Epoche 17 zurück. Mit einer Geduld von 1 hätte es schon in Epoche 9 aufgehört.

**Hinweise:**

1. Der Trainings-Loss fällt immer weiter; der Validierungs-Loss fällt, wackelt und steigt dann wieder. `np.argmin(log["val_loss"])` ist die Position seines niedrigsten Werts, ab 0 gezählt. Auch die x-Achse von `show_plot` zählt ab 0. Ferdinand hat seine Regeln fürs Training von Iris aufgeschrieben.
2. Ferdinands Regeln in Keras: `monitor="val_loss"`, `patience=3`, `restore_best_weights=True`. Dann `stop_epoch = replay(stopper, log)`; es gibt auch aus, aus welcher Epoche das Modell die Gewichte behält.
3. `best_epoch = 17`, `stopper = tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True)`, `stop_epoch = 20`, `kept_epoch = 17`.

### 6. Iris (Abschluss-Schloss)

**Übt:** Der ganze Ablauf: Architektur, Skalierung, compile, fit mit Validierung und Early Stopping, evaluate, neue Daten genauso vorbereiten wie die Trainingsdaten, predict  
**Braucht:** 1. Der Umschlagscanner (sein Ergebnis), 3. Der Bauplan (sein Ergebnis), 4. Jonas' Laptop (sein Ergebnis), 5. Ferdinands Schrank (sein Ergebnis), 🔒 5. Ferdinands Schrank, 🔎 Die Abfahrtstafel, 🔎 Ferdinands Regeln  
**Daten:** [archive.py](../../content/rooms/nn-post/data/archive.py)

**Zahlenschloss** (öffnet mit `2017`):

> Iris' Startfeld verlangt einen vierstelligen Startcode.

**Aufgabe:**

> Zeit für die Nachtsortierung. In welche Fächer gehören die sechs Eilbriefe? Sie warten in Iris' Fach, `urgent`: für jeden Brief das eine Postleitzahl-Kästchen, nach dem Iris sortiert, direkt vom Scanner, eine Zeile mit 256 Werten pro Brief.
>
> 1. Baut und trainiert Iris 2 mit dem Archiv, nach Ferdinands Regeln. Sie braucht mindestens 90 % auf den Testkarten.
> 2. Bereitet die Eilbriefe für sie als `letters` auf, mit der Form `(6, 16, 16)`.
> 3. Lasst sie sie lesen, und speichert ihre Fächer der Reihe nach als `bins`, eine Liste aus sechs Zahlen.

<details><summary>Startcode</summary>

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

tf.keras.utils.set_random_seed(1)

model = None      # Iris 2
# model.compile(...), model.fit(...), model.evaluate(...)

letters = None    # die Eilbriefe, bereit für Iris
bins = None       # z. B. [0, 1, 2, 3, 4, 5]
```

</details>

**Musterlösung:**

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

tf.keras.utils.set_random_seed(1)

model = tf.keras.Sequential([
    tf.keras.Input(shape=(16, 16)),
    layers.Flatten(),
    layers.Dense(64, activation="relu"),
    layers.Dense(32, activation="relu"),
    layers.Dense(10, activation="softmax"),
])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
stopper = tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True)
model.fit(x_train / 255, y_train, epochs=30, validation_split=0.2, callbacks=[stopper], verbose=2)
print(model.evaluate(x_test / 255, y_test))

letters = 1 - urgent.reshape(6, 16, 16) / 255
show_images(letters, title="Urgent letters")
bins = model.predict(letters).argmax(axis=1).tolist()
print(bins)
```

**Geprüftes Ergebnis** (`_sort_check(model, letters, bins)`):

```json
"sorted"
```

**Zeigt nach dem Lösen:**

> Iris' Linse leuchtet, das Band läuft an, und sechs Briefe fallen in die Fächer **4, 7, 1, 9, 2, 6**. Um 00:39 schließt sich die Tür des Postwagens.
>
> Ein Brief kommt am nächsten Morgen zurück: Sein Absender hat die Ziffer in die Ecke des Kästchens geschrieben, nicht in die Mitte, und Iris hat sie falsch gelesen. Ein dichtes Netz lernt, welche Pixel wo aufleuchten; verschiebt man die Ziffer, ist es verloren. Netze, die Formen finden, wo immer sie sind, kommen als Nächstes: Faltungsnetze.

**Hinweise:**

1. Die Abfahrtstafel sagt, in welches Fach ein Brief gehört. Iris 2 ist Entwurf C, kompiliert und skaliert wie in Jonas' repariertem Skript. Trainiert mit `validation_split=0.2` und Ferdinands `EarlyStopping` in `callbacks=[...]`; `epochs=30` ist in Ordnung, der Stopper beendet es rechtzeitig.
2. Die Eilbriefe kommen direkt vom Scanner, wo 0 Tinte ist. Formt sie in `(6, 16, 16)` um und rechnet sie um wie am Scanner; schaut sie mit `show_images` an. Dann `model.predict(letters).argmax(axis=1)`.
3. `letters = 1 - urgent.reshape(6, 16, 16) / 255`. Die Fächer sind `[4, 7, 1, 9, 2, 6]`.

## Hinweise im Raum

### 🔎 Das Handbuch des Scanners

*Gebraucht von: 1. Der Umschlagscanner*

> SCANNY 80 · Postleitzahl-Scanner
>
> Liest den Postleitzahl-Streifen eines Umschlags: fünf Kästchen mit 16 × 16 Pixeln nebeneinander, der Streifen ist also 16 Pixel hoch und 80 breit.
>
> Der Scanner liest den Streifen wie eine Textseite: Zeile für Zeile von oben, jede Zeile von links nach rechts. Er gibt eine lange Reihe von Zahlen aus.
>
> Helligkeit: 0 = schwarz, 255 = weiß.

### 🔎 Iris' Typenschild

*Gebraucht von: 1. Der Umschlagscanner, 3. Der Bauplan, 4. Jonas' Laptop*

> IRIS · automatischer Briefleser · Bahnhofspostamt Kleeberg
>
> Eingabe: ein Ziffernkästchen mit 16 × 16 Pixeln. Jedes Pixel ist eine Zahl von **0.0 (Papier)** bis **1.0 (Tinte)**.
>
> Ausgabe: 10 Wahrscheinlichkeiten, eine für jede Ziffer von 0 bis 9. Die höchste gewinnt.
>
> Speicherchip: **20.000 Zahlen** (Gewichte und Biases).

### 🔎 Bauplan: Iris 2

*Gebraucht von: 3. Der Bauplan*

> IRIS 2 · Entwürfe · F. Kowalski
>
> Jeder Entwurf: Eingabe 16 × 16, dann Flatten.
>
> Entwurf A: Dense 128 (ReLU) → Dense 32 (ReLU) → Dense 10 (Softmax)
> Entwurf B: Dense 64 (ReLU) → Dense 64 (ReLU) → Dense 10 (Softmax)
> Entwurf C: Dense 64 (ReLU) → Dense 32 (ReLU) → Dense 10 (Softmax)

### 🔎 Ein Zettel von Jonas

*Gebraucht von: 4. Jonas' Laptop*

> Ferdinand, ich habe versucht, Iris 2 neu anzulernen, aber das Training stürzt ab! Die Labels sind Ziffern, also muss categorical crossentropy doch stimmen, oder? Ich bin nach Hause gegangen, sorry.
>
> Jonas

### 🔎 Das Etikett der Archivkisten

*Gebraucht von: 4. Jonas' Laptop*

> IRIS-ARCHIV · Ziffernkarten, von Hand sortiert
>
> 3.000 Karten zum Lernen (`x_train`, `y_train`) und 600 zum Testen (`x_test`, `y_test`).
>
> Jede Karte hat 16 × 16 Pixel, gespeichert als Bytes: **0 = Papier, 255 = Tinte**. Labels: die Ziffer auf der Karte, 0 bis 9.

### 🔎 Ferdinands Regeln

*Gebraucht von: 5. Ferdinands Schrank, 6. Iris*

> Regeln fürs Training von Iris (F. K.)
>
> 1. 20 % der Karten für die Validierung beiseitelegen.
> 2. Auf den Validierungs-Loss achten, nicht auf den Trainings-Loss.
> 3. Geduld: ihr 3 Epochen Zeit geben, besser zu werden, bevor man aufhört.
> 4. Immer zu ihren besten Gewichten zurückkehren.
>
> Startcode für Iris: die Epoche, in der das Training aufhört, dann die Epoche, deren Gewichte sie behält.

### 🔎 Die Abfahrtstafel

*Gebraucht von: 6. Iris*

> NACHTPOST
>
> 00:40 · Post 2871 · Kleeberg → Hamburg · Gleis 1
>
> Eilbriefe: Iris liest die erste Ziffer der Postleitzahl (die Leitzone, 0 bis 9) und wirft jeden Brief in das Fach mit dieser Nummer.

## Handbuch im Raum: 📖 Iris' Wartungshandbuch

**Bilder als Arrays:** [`a.shape`](https://numpy.org/doc/stable/reference/generated/numpy.ndarray.shape.html), [`a.reshape(rows, cols)`](https://numpy.org/doc/stable/reference/generated/numpy.reshape.html), [`np.hsplit(a, n)  np.stack(arrays)`](https://numpy.org/doc/stable/reference/generated/numpy.hsplit.html), [`1 - a / 255`](https://numpy.org/doc/stable/user/basics.broadcasting.html), `show_images(images, labels=None, title=None)`

**Was eine Schicht rechnet:** [`x @ W + b`](https://numpy.org/doc/stable/reference/generated/numpy.matmul.html), [`ReLU: np.maximum(x, 0)`](https://www.tensorflow.org/api_docs/python/tf/keras/activations/relu), [`softmax`](https://www.tensorflow.org/api_docs/python/tf/keras/activations/softmax), [`a.sum(axis=1, keepdims=True)  a.argmax(axis=1)`](https://numpy.org/doc/stable/reference/generated/numpy.argmax.html)

**Ein Modell bauen:** [`tf.keras.Sequential([...])`](https://www.tensorflow.org/api_docs/python/tf/keras/Sequential), [`layers.Flatten()`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/Flatten), [`layers.Dense(units, activation=None)`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/Dense), [`model.summary()  model.count_params()`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#summary), [`model.set_weights([W1, b1, ...])`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#set_weights)

**Training:** [`model.compile(optimizer, loss, metrics)`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#compile), [`"sparse_categorical_crossentropy"`](https://www.tensorflow.org/api_docs/python/tf/keras/losses/SparseCategoricalCrossentropy), [`"categorical_crossentropy"`](https://www.tensorflow.org/api_docs/python/tf/keras/losses/CategoricalCrossentropy), [`model.fit(x, y, epochs, validation_split, callbacks)`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#fit), [`history.history`](https://www.tensorflow.org/api_docs/python/tf/keras/callbacks/History), [`model.evaluate(x, y)  model.predict(x)`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#predict), [`tf.keras.utils.set_random_seed(n)`](https://www.tensorflow.org/api_docs/python/tf/keras/utils/set_random_seed)

**Rechtzeitig aufhören:** [`overfitting`](https://www.tensorflow.org/tutorials/keras/overfit_and_underfit), [`tf.keras.callbacks.EarlyStopping(monitor, patience, restore_best_weights)`](https://www.tensorflow.org/api_docs/python/tf/keras/callbacks/EarlyStopping), `replay(callback, history)`, `show_plot(*series, labels=None, title=None)`
