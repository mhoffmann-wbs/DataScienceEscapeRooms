# Die Tafeln von Varda: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Stadtmuseum Hallberg, Sonntagnacht, zehn nach elf, im Restaurierungslabor im Keller. Auf den Tischen liegen 2.400 Tonscherben von der Grabung in Tell Varda, jede mit einem Zeichen der Varda-Schrift, einer Schrift, die noch niemand gelesen hat. Um 06:00 werden die Kisten versiegelt und zurück zur Grabung geflogen, und mit ihnen der Krug von Varda, dessen Deckel sechs Zeichen trägt.
>
> Prof. Amara Okafor, die die Schrift am besten kennt, sitzt am Flughafen fest. Ihre Notizen, der halbfertige Code ihrer studentischen Hilfskraft und ein Laserscanner sind alles, was ihr habt: Bringt einem Faltungsnetz bei, die Zeichen zu lesen, und lest den Deckel, bevor die Kisten abfahren. Python läuft hier mit einem TensorFlow-artigen Modell: einer kleinen Bibliothek mit den Namen von TensorFlow (`import tensorflow as tf`), für diesen Raum geschrieben, weil das echte TensorFlow nicht im Browser läuft. Das erste Rätsel, das ihr öffnet, braucht einen Moment zum Laden.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Das Streiflicht | Was eine Faltung rechnet: ein gleitendes 3 × 3-Fenster, punktweises Produkt und Summe; wie viel kleiner das Ergebnis ist; derselbe Filter als Keras-Conv2D mit set_weights; Bilder mit einer Kanal-Achse | 🔎 Theos Notiz, 🔎 Schautafel: Varda-Zahlzeichen |
| 2 | Das Rollsiegel | Eine Faltung als Suche nach einem Muster; der Kernel-Aufbau von Conv2D (Zeilen, Spalten, Kanäle rein, Filter); GlobalMaxPooling2D: die beste Übereinstimmung irgendwo; Werte und argmax | 🔎 Amaras Zeichenliste, 🔎 Das Schild in der Vitrine |
| 3 | Der fleckige Bauplan | Ausgabeformen von Conv2D und MaxPooling2D, Padding valid vs. same, die Parameter einer Faltung zählen (Kernel × Kernel × Kanäle rein × Filter + ein Bias pro Filter), GlobalMaxPooling2D vs. Flatten, summary() | 🔎 Bauplan: der Leser |
| 4 | Mikas Notebook | Keras-Fehler lesen: Bilder, die auf nichts schrumpfen, die fehlende Kanal-Achse (x[..., None]); Epochen und wann ein Netz fertig gelernt hat; fit und evaluate für ein CNN; ein trainiertes Modell zum Prüfen von Hand-Labels nutzen (Label-Rauschen) | 3. Der fleckige Bauplan (sein Ergebnis), 🔒 3. Der fleckige Bauplan, 🔎 Ein Zettel von Mika, 🔎 Das Etikett der Kisten, 🔎 Bauplan: der Leser |
| 5 | Amaras Laptop | Modelle mit predict, argmax und Zählen bewerten; warum ein dichtes Netz an Pixelpositionen gebunden ist; Verschiebungsinvarianz durch Faltung und globales Pooling; np.roll | 🔒 1. Das Streiflicht, 🔎 Amaras Mail, ausgedruckt |
| 6 | Der Krug von Varda (Abschluss-Schloss) | Der ganze Ablauf für ein CNN: Architektur, Kanal-Achse und Skalierung, compile, fit, evaluate; ein Bild in Felder schneiden; neue Daten vorhersagen, die wie die Trainingsdaten vorbereitet sind | 2. Das Rollsiegel (sein Ergebnis), 3. Der fleckige Bauplan (sein Ergebnis), 4. Mikas Notebook (sein Ergebnis), 🔒 5. Amaras Laptop, 🔎 Das Etikett der Kisten, 🔎 Amaras Mail, ausgedruckt |

## Stationen

### 1. Das Streiflicht

**Übt:** Was eine Faltung rechnet: ein gleitendes 3 × 3-Fenster, punktweises Produkt und Summe; wie viel kleiner das Ergebnis ist; derselbe Filter als Keras-Conv2D mit set_weights; Bilder mit einer Kanal-Achse  
**Braucht:** 🔎 Theos Notiz, 🔎 Schautafel: Varda-Zahlzeichen  
**Daten:** [tally.py](../../content/rooms/nn-tablets/data/tally.py)

**Aufgabe:**

> Auf Theos Leuchttisch liegt Tafel V-17, eine Strichliste, so abgegriffen, dass niemand sie mehr lesen kann. Der Laserscanner hat ihre Oberfläche trotzdem vermessen: `scan`, die Höhe jedes Punkts in Millimetern. Welche Zahl hält sie fest?
>
> 1. Filtert den Scan von Hand mit einem 3 × 3-Kernel, der abgenutzte Zeichen sichtbar macht: Nehmt für jede Position das 3 × 3-Fenster von `scan`, multipliziert es Punkt für Punkt mit dem Kernel und addiert alles. Speichert das Ergebnis als `edges`.
> 2. Dasselbe mit Keras: `raking`, ein Modell mit einer `Conv2D`-Schicht (ein 3 × 3-Filter, kein Bias) und demselben Kernel, mit `set_weights` geladen. Prüft, dass `raking(scan[None, :, :, None])` eure `edges` ergibt.
> 3. Schaut euch `edges` mit `show_images` an und speichert die Zahl auf der Tafel als `number`.

<details><summary>Startcode</summary>

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

show_images(scan, title="Tafel V-17")
print(scan.shape)

kernel = None   # der 3 x 3-Kernel, als NumPy-Array
edges = None    # der Scan, von Hand gefiltert: eine Zahl pro 3 x 3-Fenster
raking = None   # tf.keras.Sequential([...]) mit einer Conv2D-Schicht, dann set_weights
number = None   # die Zahl auf der Tafel
```

</details>

**Musterlösung:**

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]])
edges = np.array([[(scan[i:i + 3, j:j + 3] * kernel).sum() for j in range(94)] for i in range(28)])
show_images(edges, title="Tablet V-17 in raking light")

raking = tf.keras.Sequential([tf.keras.Input(shape=(30, 96, 1)), layers.Conv2D(1, 3, use_bias=False)])
raking.set_weights([kernel.reshape(3, 3, 1, 1)])
print(np.abs(raking(scan[None, :, :, None])[0, :, :, 0] - edges).max())
number = 246    # two bars, four circles, six wedges
```

**Geprüftes Ergebnis** (`_tally_check(edges, raking, number)`):

```json
"read"
```

**Zeigt nach dem Lösen:**

> Tafel V-17 zählt **246**: zwei Hunderter, vier Zehner und sechs Einer.
>
> Theos Kernel vergleicht jeden Punkt mit seinen vier Nachbarn, also wird die sanfte Wölbung der Tafel fast 0 und nur die scharfen Kerben leuchten auf. Eine `Conv2D`-Schicht tut genau das: Sie schiebt einen kleinen Kernel über das Bild und addiert Produkte. Ein trainiertes Netz lernt seine Kernel selbst.

**Hinweise:**

1. Theo, der Restaurator, hat eine Notiz mit dem Kernel hinterlassen. Zwei Schleifen über die Zeilen und Spalten des Ergebnisses: `scan[i:i + 3, j:j + 3]` ist das Fenster in Zeile `i`, Spalte `j`. Ein 3 × 3-Fenster passt 28 × 94 Mal in den 30 × 96 großen Scan, also hat `edges` die Form `(28, 94)`.
2. `(scan[i:i + 3, j:j + 3] * kernel).sum()` ist ein Wert. In Keras: `raking = tf.keras.Sequential([tf.keras.Input(shape=(30, 96, 1)), layers.Conv2D(1, 3, use_bias=False)])`. Sein Kernel hat die Form `(3, 3, 1, 1)`: Zeilen, Spalten, Kanäle rein, Filter.
3. `edges = np.array([[(scan[i:i + 3, j:j + 3] * kernel).sum() for j in range(94)] for i in range(28)])`, dann `raking.set_weights([kernel.reshape(3, 3, 1, 1)])`. Zwei hohe Striche, vier Kreise, sechs Keile: `number = 246`.

### 2. Das Rollsiegel

**Übt:** Eine Faltung als Suche nach einem Muster; der Kernel-Aufbau von Conv2D (Zeilen, Spalten, Kanäle rein, Filter); GlobalMaxPooling2D: die beste Übereinstimmung irgendwo; Werte und argmax  
**Braucht:** 🔎 Amaras Zeichenliste, 🔎 Das Schild in der Vitrine  
**Daten:** [seal.py](../../content/rooms/nn-tablets/data/seal.py)

**Aufgabe:**

> In der Vitrine liegt der einzige zweisprachige Fund aus Tell Varda: ein Rollsiegel, auf frischem Ton abgerollt. Sein Abdruck zeigt acht Varda-Zeichen nebeneinander, `impressions`, je ein 24 × 24-Tiefenscan, und jemand hat ihre Laute darunter geritzt. Für welchen Laut steht jedes Varda-Zeichen? Amara hat für jedes der acht Zeichen einen Stempel geschnitten: `templates`, acht Filter von 11 × 11.
>
> 1. Baut `finder`, ein Keras-Modell, das jeden Stempel irgendwo in einem Abdruck sucht: eine `Conv2D`-Schicht mit 8 Filtern von 11 × 11 und ohne Bias, dann `GlobalMaxPooling2D`. Ladet die Stempel als seine Filter: Filter Nummer `i` ist `templates[i]`.
> 2. `finder.predict` gibt 8 Werte pro Abdruck, einen je Stempel. Speichert die Zeichennummer jedes Abdrucks, von links nach rechts, als `order`.
> 3. Bringt die Zeichen mit den Lauten darunter zusammen: `values`, ein Dict von jeder Zeichennummer (0 bis 7) zu ihrem Laut, z. B. `{0: "ba", ...}`.

<details><summary>Startcode</summary>

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

show_images(impressions, labels=[1, 2, 3, 4, 5, 6, 7, 8], title="Der Abdruck des Siegels")
show_images(templates, labels=list(range(8)), title="Amaras Stempel")
print(impressions.shape, templates.shape)

finder = None   # Conv2D mit den 8 Stempeln als Filter, dann GlobalMaxPooling2D
order = None    # die Zeichennummer jedes Abdrucks, von links nach rechts
values = None   # {Zeichennummer: Laut}
```

</details>

**Musterlösung:**

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

show_images(impressions, labels=[1, 2, 3, 4, 5, 6, 7, 8], title="The seal's impression")
finder = tf.keras.Sequential([
    tf.keras.Input(shape=(24, 24, 1)),
    layers.Conv2D(8, 11, use_bias=False),
    layers.GlobalMaxPooling2D(),
])
finder.set_weights([templates.transpose(1, 2, 0)[:, :, None, :]])   # filter i = templates[i]
scores = finder.predict(impressions[..., None] / 255)
order = scores.argmax(axis=1).tolist()
print(order)

caption = ["lu", "ra", "sa", "ko", "ne", "re", "mi", "ta"]
values = dict(zip(order, caption))
print(values)
```

**Geprüftes Ergebnis** (`_seal_check(finder, order, values)`):

```json
"deciphered"
```

**Zeigt nach dem Lösen:**

> Die Zeichen des Siegels sind 5, 0, 7, 2, 6, 4, 1, 3, also klingen die acht Zeichen so: 0 **ra** (Sonne), 1 **mi** (Wasser), 2 **ko** (Berg), 3 **ta** (Baum), 4 **re** (Haus), 5 **lu** (Stern), 6 **ne** (Kamm), 7 **sa** (Auge).
>
> Euer finder ist ein kleines Faltungsnetz, von Hand gebaut: Jeder Filter ist ein Bild dessen, was er sucht, die Faltung bewertet jede Position, und Global Max Pooling behält den besten Wert, wo auch immer er war. Ein trainiertes Netz arbeitet genauso, lernt seine Filter aber selbst, und sie sind kleiner und in Schichten gestapelt.

**Hinweise:**

1. Ein Sequential-Modell: `tf.keras.Input(shape=(24, 24, 1))`, `layers.Conv2D(8, 11, use_bias=False)`, `layers.GlobalMaxPooling2D()`. Der Kernel der Conv2D-Schicht hat die Form `(11, 11, 1, 8)`: Zeilen, Spalten, Kanäle rein, Filter. `templates` hat die Form `(8, 11, 11)`: Dort kommen die Filter zuerst. Das Schild in der Vitrine gibt die eingeritzten Laute wieder.
2. `templates.reshape(11, 11, 1, 8)` hat die richtige Form, wirbelt die Stempel aber durcheinander. Verschiebt stattdessen die Achse: `templates.transpose(1, 2, 0)` hat die Form `(11, 11, 8)`, und `[:, :, None, :]` fügt die Kanal-Achse ein. Auch die Abdrücke brauchen eine Kanal-Achse: `impressions[..., None]`.
3. `finder.set_weights([templates.transpose(1, 2, 0)[:, :, None, :]])`, dann ergibt `order = finder.predict(impressions[..., None]).argmax(axis=1)` die Liste `[5, 0, 7, 2, 6, 4, 1, 3]`. Mit der Beischrift: `values = {5: "lu", 0: "ra", 7: "sa", 2: "ko", 6: "ne", 4: "re", 1: "mi", 3: "ta"}`.

### 3. Der fleckige Bauplan

**Übt:** Ausgabeformen von Conv2D und MaxPooling2D, Padding valid vs. same, die Parameter einer Faltung zählen (Kernel × Kernel × Kanäle rein × Filter + ein Bias pro Filter), GlobalMaxPooling2D vs. Flatten, summary()  
**Braucht:** 🔎 Bauplan: der Leser  
**Daten:** [blueprint.py](../../content/rooms/nn-tablets/data/blueprint.py)

**Aufgabe:**

> Amaras Bauplan für den Leser hängt über dem Computer: Entwurf 3, ein kleines Faltungsnetz. Jemand hat eine Kaffeetasse daraufgestellt, und einige Zahlen sind weg.
>
> 1. Erschließt die fehlenden Teile aus dem, was noch lesbar ist: den Ausgabeformen und den Parameterzahlen.
> 2. Baut Entwurf 3 als Keras-Modell, `model`, sodass `model.summary()` zu jeder Zahl auf dem Bauplan passt.

<details><summary>Startcode</summary>

```python
import tensorflow as tf
from tensorflow.keras import layers

model = tf.keras.Sequential([
    tf.keras.Input(shape=(24, 24, 1)),
    # ... die Schichten von Entwurf 3
])
model.summary()
```

</details>

**Musterlösung:**

```python
import tensorflow as tf
from tensorflow.keras import layers

model = tf.keras.Sequential([
    tf.keras.Input(shape=(24, 24, 1)),
    layers.Conv2D(8, 3, padding="same", activation="relu"),   # 24 x 24 stays 24 x 24
    layers.MaxPooling2D(),                                     # 12 x 12
    layers.Conv2D(16, 3, activation="relu"),                   # (3 * 3 * 8 + 1) * 16 = 1,168
    layers.GlobalMaxPooling2D(),                               # (None, 16), no parameters
    layers.Dense(8, activation="softmax"),
])
model.summary()
```

**Geprüftes Ergebnis** (`_blueprint_check(model)`):

```json
"matches"
```

**Zeigt nach dem Lösen:**

> Entwurf 3 hat **1.384** Parameter. Die erste Conv2D-Schicht behält mit `padding="same"` die Größe, die zweite hat 16 Filter von 3 × 3 (3 · 3 · 8 · 16 + 16 = 1.168) und kein Padding, und der Fleck hat ein `GlobalMaxPooling2D` verdeckt: Es behält die stärkste Antwort jedes Filters, wo auch immer sie war.
>
> Ein dichtes Netz mit 64 Neuronen bräuchte für dieselben 24 × 24-Fragmente 37.448 Parameter. Eine Faltung benutzt an jeder Position denselben kleinen Kernel.

**Hinweise:**

1. Eine Conv2D-Schicht hat Kernel × Kernel × Kanäle rein × Filter Gewichte, plus einen Bias pro Filter. Ein 3 × 3-Kernel ohne Padding macht das Bild 2 Pixel kleiner; `padding="same"` behält seine Größe. `MaxPooling2D()` halbiert sie.
2. Die erste Conv2D-Schicht bleibt bei 24 × 24, also hat sie `padding="same"`. Für die zweite ergibt (k · k · 8 + 1) · 16 = 1.168 k = 3, und 12 → 10 heißt kein Padding. Die verschmierte Schicht macht aus `(None, 10, 10, 16)` ohne Parameter `(None, 16)`; Amaras Randnotiz sagt, welche.
3. `layers.Conv2D(8, 3, padding="same", activation="relu")`, `layers.MaxPooling2D()`, `layers.Conv2D(16, 3, activation="relu")`, `layers.GlobalMaxPooling2D()`, `layers.Dense(8, activation="softmax")`: 1.384 Parameter.

### 4. Mikas Notebook

**Übt:** Keras-Fehler lesen: Bilder, die auf nichts schrumpfen, die fehlende Kanal-Achse (x[..., None]); Epochen und wann ein Netz fertig gelernt hat; fit und evaluate für ein CNN; ein trainiertes Modell zum Prüfen von Hand-Labels nutzen (Label-Rauschen)  
**Braucht:** 3. Der fleckige Bauplan (sein Ergebnis), 🔒 3. Der fleckige Bauplan, 🔎 Ein Zettel von Mika, 🔎 Das Etikett der Kisten, 🔎 Bauplan: der Leser  
**Daten:** [archive.py](../../content/rooms/nn-tablets/data/archive.py)

**Zahlenschloss** (öffnet mit `1384`):

> Mikas Laptop ist gesperrt. Ein Zettel auf dem Deckel: „Passwort: die Zahl der Parameter des Lesers (Entwurf 3).“

**Aufgabe:**

> Mika, Amaras studentische Hilfskraft, hat versucht, den Leser mit dem Archiv zu trainieren: `x_train` und `y_train` zum Lernen, `x_test` und `y_test` zum Testen. Das Skript ist immer wieder abgestürzt, und Mika ist nach Hause gegangen.
>
> 1. Repariert das Skript. Der Leser ist bereit, wenn er mindestens 85 % der Testfragmente richtig liest.
> 2. Mika hat auch Kiste 7 von Hand sortiert: `x_crate` enthält die 60 Fragmente (roh, wie `x_train`), `y_mika` die Zeichennummern, die Mika ihnen gegeben hat. Lasst den trainierten Leser Kiste 7 lesen und zählt, bei wie vielen der 60 er anderer Meinung ist als Mika: `mika_wrong`.

<details><summary>Startcode</summary>

```python
import tensorflow as tf
from tensorflow.keras import layers

# Mika: der Leser, Entwurf 3. Warum stürzt das jedes Mal ab?!
tf.keras.utils.set_random_seed(1)

model = tf.keras.Sequential([
    tf.keras.Input(shape=(24, 24, 1)),
    layers.Conv2D(8, 3, activation="relu"),
    layers.MaxPooling2D(4),
    layers.Conv2D(16, 3, activation="relu"),
    layers.MaxPooling2D(4),
    layers.Dense(8, activation="softmax"),
])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
# nur 2 Epochen, sonst dauert es ewig
history = model.fit(x_train / 255, y_train, epochs=2, validation_split=0.2)

test_loss, test_accuracy = model.evaluate(x_test / 255, y_test)
print("Test accuracy:", test_accuracy)

mika_wrong = None   # wie viele aus Kiste 7 hat Mika falsch sortiert?
```

</details>

**Musterlösung:**

```python
import tensorflow as tf
from tensorflow.keras import layers

tf.keras.utils.set_random_seed(1)

model = tf.keras.Sequential([
    tf.keras.Input(shape=(24, 24, 1)),
    layers.Conv2D(8, 3, padding="same", activation="relu"),
    layers.MaxPooling2D(),
    layers.Conv2D(16, 3, activation="relu"),
    layers.GlobalMaxPooling2D(),
    layers.Dense(8, activation="softmax"),
])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
history = model.fit(x_train[..., None] / 255, y_train, epochs=6, validation_split=0.2)

test_loss, test_accuracy = model.evaluate(x_test[..., None] / 255, y_test)
print("Test accuracy:", test_accuracy)

# Crate 7: where does the reader disagree with Mika's hand labels?
read = model.predict(x_crate[..., None] / 255).argmax(axis=1)
mika_wrong = int((read != y_mika).sum())
print("Mika got", mika_wrong, "wrong")
```

**Geprüftes Ergebnis** (`_notebook_check(model, mika_wrong)`):

```json
"trained"
```

**Zeigt nach dem Lösen:**

> Der Leser liest etwa **95 %** der Testfragmente richtig. Mika hat drei Fehler gemacht: Zwei Poolings von 4 × 4 haben die Fragmente auf nichts geschrumpft (Keras sagt, die Ausgabegröße würde negativ), die Fragmente hatten keine Kanal-Achse (Conv2D will `(24, 24, 1)`, nicht `(24, 24)`), und nach 2 Epochen lernte der Leser noch. Hier dauert eine Epoche deutlich unter einer Sekunde, also sind 6 bis 8 in Ordnung.
>
> Bei Kiste 7 ist der Leser bei **13** der 60 Fragmente anderer Meinung als Mika. Ein trainiertes Modell kann von Hand vergebene Labels prüfen: Ein von Hand sortiertes Archiv hat immer etwas Label-Rauschen.

**Hinweise:**

1. Lest den ersten Fehler: Für das zweite `MaxPooling2D` ist nichts mehr zum Poolen übrig. Verfolgt die Formen durch die Schichten und vergleicht sie mit dem Bauplan; `model.summary()` zeigt sie, sobald das Modell sich bauen lässt.
2. Conv2D will jedes Fragment mit einer Kanal-Achse: `(24, 24, 1)`, nicht `(24, 24)`. `x_train[..., None]` fügt sie ein, und `x_test` braucht sie auch. Schaut dann auf die accuracy nach der letzten Epoche: Steigt sie noch? Für Kiste 7 bereitet `x_crate` genauso vor, lasst den Leser vorhersagen und vergleicht mit `y_mika`.
3. Die Schichten aus dem Bauplan, dann `model.fit(x_train[..., None] / 255, y_train, epochs=6, validation_split=0.2)` und `model.evaluate(x_test[..., None] / 255, y_test)`. Für Kiste 7: `read = model.predict(x_crate[..., None] / 255).argmax(axis=1)` und `mika_wrong = int((read != y_mika).sum())`.

### 5. Amaras Laptop

**Übt:** Modelle mit predict, argmax und Zählen bewerten; warum ein dichtes Netz an Pixelpositionen gebunden ist; Verschiebungsinvarianz durch Faltung und globales Pooling; np.roll  
**Braucht:** 🔒 1. Das Streiflicht, 🔎 Amaras Mail, ausgedruckt  
**Daten:** [laptop.py](../../content/rooms/nn-tablets/data/laptop.py)

**Zahlenschloss** (öffnet mit `246`):

> Amaras Laptop verlangt ein Passwort. Auf dem Deckel, in ihrer Handschrift: „Die erste Tafel, die ich je gelesen habe: die Zahl auf V-17.“

**Aufgabe:**

> Auf Amaras Laptop sind ihr alter Leser, `old_reader`, ein dichtes Netz, und `prototype`, ein erster Versuch von Entwurf 3. Beide haben mit dem Fotosatz der Grabung gelernt, in dem jedes Zeichen in der Mitte seines Fragments sitzt. Bei den 100 Fragmenten, die letzte Woche kamen, `x_new` mit ihren Zeichennummern `y_new`, sitzen die Zeichen irgendwo. Welcher Leser kommt damit zurecht, und warum scheitert der andere?
>
> 1. Wie viele der 100 neuen Fragmente liest jeder Leser richtig? Speichert die Anzahlen als `old_right` und `proto_right`. Bereitet die Fragmente so vor, wie die Leser sie erwarten.
> 2. Testet beide Leser mit `probe`, einem Fragment mit einem Stern (5) in der Mitte: Verschiebt es um 0, 1, 2, ... Pixel nach rechts mit `np.roll(probe, shift, axis=1)` und zeichnet die Wahrscheinlichkeit jedes Lesers für den Stern. `first_miss`: die kleinste Verschiebung, bei der der alte Leser keinen Stern mehr liest.

<details><summary>Startcode</summary>

```python
import numpy as np
from helpers import show_images, show_plot

old_reader.summary()
prototype.summary()
show_images(x_new[:10], labels=list(y_new[:10]), title="Neue Fragmente")

old_right = None     # wie viele der 100 neuen Fragmente der alte Leser richtig liest
proto_right = None   # ... und der Prototyp
first_miss = None    # die kleinste Verschiebung, bei der der alte Leser den Stern verfehlt
```

</details>

**Musterlösung:**

```python
import numpy as np
from helpers import show_images, show_plot

x = x_new[..., None] / 255
old_right = int((old_reader.predict(x).argmax(axis=1) == y_new).sum())
proto_right = int((prototype.predict(x).argmax(axis=1) == y_new).sum())
print(old_right, proto_right)

shifted = np.stack([np.roll(probe, s, axis=1) for s in range(9)])[..., None] / 255
old_probs, proto_probs = old_reader.predict(shifted), prototype.predict(shifted)
show_plot(old_probs[:, 5], proto_probs[:, 5], labels=["old reader", "prototype"], title="Probability of a star, shifted to the right")
first_miss = int(np.flatnonzero(old_probs.argmax(axis=1) != 5)[0])
print(first_miss)
```

**Geprüftes Ergebnis** (`_laptop_check(old_right, proto_right, first_miss)`):

```json
"compared"
```

**Zeigt nach dem Lösen:**

> Der alte Leser liest **18** der 100 neuen Fragmente richtig, kaum besser als Raten; der Prototyp **98**. Verschiebt den Stern um 3 Pixel, und der alte Leser verliert ihn: Eine Dense-Schicht hat ein Gewicht pro Pixel, also hat er gelernt, wo die Striche eines Sterns liegen, nicht wie ein Stern aussieht. Die Filter des Prototyps gleiten über das ganze Fragment, und Global Max Pooling behält ihre beste Übereinstimmung, wo auch immer sie ist.

**Hinweise:**

1. Beide Leser erwarten `(n, 24, 24, 1)` mit Werten von 0.0 bis 1.0: `x_new[..., None] / 255`. `predict` gibt 8 Wahrscheinlichkeiten pro Fragment, `.argmax(axis=1)` das Zeichen; vergleicht mit `y_new` und zählt mit `.sum()`.
2. `shifted = np.stack([np.roll(probe, s, axis=1) for s in range(9)])`, genauso vorbereitet. Spalte 5 von `old_reader.predict(...)` ist die Wahrscheinlichkeit des alten Lesers für den Stern bei jeder Verschiebung; `show_plot` zeichnet die Linien beider Leser.
3. `old_right = 18`, `proto_right = 98`, `first_miss = 3`.

### 6. Der Krug von Varda (Abschluss-Schloss)

**Übt:** Der ganze Ablauf für ein CNN: Architektur, Kanal-Achse und Skalierung, compile, fit, evaluate; ein Bild in Felder schneiden; neue Daten vorhersagen, die wie die Trainingsdaten vorbereitet sind  
**Braucht:** 2. Das Rollsiegel (sein Ergebnis), 3. Der fleckige Bauplan (sein Ergebnis), 4. Mikas Notebook (sein Ergebnis), 🔒 5. Amaras Laptop, 🔎 Das Etikett der Kisten, 🔎 Amaras Mail, ausgedruckt  
**Daten:** [archive.py](../../content/rooms/nn-tablets/data/archive.py)

**Zahlenschloss** (öffnet mit `189813`):

> Der Krug steht in einer verschlossenen Vitrine mit einem sechsstelligen Schloss.

**Aufgabe:**

> Der Deckel des Krugs von Varda trägt sechs Zeichen in der Hand eines Schreibers: `jar`, ein Tiefenscan aus 24 Zeilen × 144 Spalten, ein Zeichen in jedem 24 × 24-Feld. Die Kisten gehen um 06:00. Was steht auf dem Deckel?
>
> 1. Trainiert den Leser mit dem Archiv. Er braucht mindestens 85 % auf den Testfragmenten.
> 2. Schneidet den Deckel in seine sechs Felder und bereitet sie für den Leser vor: `fragments`. Lasst den Leser sie lesen: `signs`, die sechs Zeichennummern von links nach rechts.
> 3. `word`: wie der Deckel klingt, eine Silbe pro Zeichen, z. B. `"ba-de-fo-gu-hi-jo"`.

<details><summary>Startcode</summary>

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

tf.keras.utils.set_random_seed(1)
show_images(jar, title="Der Deckel des Krugs")

model = None       # der Leser, mit dem Archiv trainiert
# model.compile(...), model.fit(...), model.evaluate(...)

fragments = None   # die sechs Felder des Deckels, bereit für den Leser
signs = None       # z. B. [0, 1, 2, 3, 4, 5]
word = None        # z. B. "ba-de-fo-gu-hi-jo"
```

</details>

**Musterlösung:**

```python
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from helpers import show_images

tf.keras.utils.set_random_seed(1)
show_images(jar, title="The jar's lid")

model = tf.keras.Sequential([
    tf.keras.Input(shape=(24, 24, 1)),
    layers.Conv2D(8, 3, padding="same", activation="relu"),
    layers.MaxPooling2D(),
    layers.Conv2D(16, 3, activation="relu"),
    layers.GlobalMaxPooling2D(),
    layers.Dense(8, activation="softmax"),
])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
history = model.fit(x_train[..., None] / 255, y_train, epochs=6, validation_split=0.2)
print(model.evaluate(x_test[..., None] / 255, y_test))

fragments = np.stack(np.hsplit(jar, 6))[..., None] / 255
signs = model.predict(fragments).argmax(axis=1).tolist()
values = {0: "ra", 1: "mi", 2: "ko", 3: "ta", 4: "re", 5: "lu", 6: "ne", 7: "sa"}   # from the seal
word = "-".join(values[s] for s in signs)
print(signs, word)
```

**Geprüftes Ergebnis** (`_jar_check(model, fragments, signs, word)`):

```json
"read"
```

**Zeigt nach dem Lösen:**

> Der Leser liest den Deckel: **ta-lu-mi-ra-ko-ne**. Um 05:52 schickt ihr es Amara, und ihre Antwort kommt vom Flughafen: „Talumi Rakone. Ein Name, der Töpfer, der den Krug gemacht hat, oder wem er gehörte. Es ist das erste Wort, das seit dreitausend Jahren jemand in der Varda-Schrift gelesen hat.“
>
> Euer Leser hat acht Zeichen aus 2.400 Fragmenten mit 1.384 Parametern gelernt, weil eine Faltung überall nach denselben kleinen Formen sucht und globales Pooling sich nicht dafür interessiert, wo sie sie gefunden hat.

**Hinweise:**

1. Der Leser ist das Modell aus dem reparierten Notebook, genauso trainiert. Der Deckel besteht aus sechs 24 × 24-Feldern nebeneinander: `np.hsplit(jar, 6)` schneidet ihn, und `np.stack(...)` macht daraus ein Array der Form `(6, 24, 24)`.
2. Bereitet die Felder genau wie `x_train` vor: Kanal-Achse und `/ 255`. `model.predict(fragments).argmax(axis=1)` ergibt die Zeichennummern; die Auflösung des Siegels nennt den Laut jeder Nummer.
3. `fragments = np.stack(np.hsplit(jar, 6))[..., None] / 255`. Die Zeichen sind `[3, 5, 1, 0, 2, 6]`, das Wort ist `"ta-lu-mi-ra-ko-ne"`.

## Hinweise im Raum

### 🔎 Theos Notiz

*Gebraucht von: 1. Das Streiflicht*

> Streiflicht, digital (T. Brandt, Restaurator)
>
> Abgenutzte Zeichen sind Kerben von wenigen hundertstel Millimetern, auf einer Tafel, die sich um mehrere Millimeter wölbt. Um sie zu sehen, vergleicht man jeden Punkt mit seinen vier Nachbarn, mit diesem 3 × 3-Kernel:
>
> `0   1   0`
> `1  -4   1`
> `0   1   0`
>
> Sanfte Wölbungen ergeben fast 0; scharfe Kerben leuchten auf.

### 🔎 Schautafel: Varda-Zahlzeichen

*Gebraucht von: 1. Das Streiflicht*

> WIE DIE SCHREIBER VON VARDA ZÄHLTEN
>
> Ein hoher Strich: hundert
> Ein Kreis: zehn
> Ein Keil (ein kleines Dreieck): eins
>
> Die Schreiber drückten von jedem so viele ein, wie sie brauchten, die Hunderter zuerst. Zählt sie zusammen.

### 🔎 Amaras Zeichenliste

*Gebraucht von: 2. Das Rollsiegel*

> DIE VARDA-SCHRIFT · 8 Zeichen · A. Okafor
>
> 0 Sonne: ein Kreis mit einem Punkt
> 1 Wasser: zwei Zickzacklinien
> 2 Berg: zwei Gipfel
> 3 Baum: ein Stamm mit zwei Paar Ästen
> 4 Haus: ein Kasten unter einem Dach
> 5 Stern: drei gekreuzte Linien
> 6 Kamm: ein Balken mit vier Zinken
> 7 Auge: eine Mandel mit einer Pupille
>
> Die Nummern sind die Labels im Archiv und die Reihenfolge meiner Stempel. Wie die Zeichen klingen: unbekannt.

### 🔎 Das Schild in der Vitrine

*Gebraucht von: 2. Das Rollsiegel*

> Rollsiegel, Tell Varda, um 1200 v. Chr. Der einzige zweisprachige Fund der Grabung.
>
> Unter die acht Varda-Zeichen des Abdrucks hat eine spätere Hand ihre Laute in der Küstenschrift geritzt, die man lesen kann: eine Silbe unter jedem Zeichen, von links nach rechts:
>
> **LU · RA · SA · KO · NE · RE · MI · TA**
>
> „Lurasa Konere, aus Mita“

### 🔎 Bauplan: der Leser

*Gebraucht von: 3. Der fleckige Bauplan, 4. Mikas Notebook*

> LESER · Entwurf 3 · A. Okafor
>
> Eingabe: ein Fragment, 24 × 24, 1 Kanal
>
> Conv2D: 8 Filter, 3 × 3, ReLU → (None, 24, 24, 8) · 80 Parameter
> MaxPooling2D: 2 × 2 → (None, 12, 12, ▒▒) · 0
> Conv2D: ▒▒ Filter, ▒ × ▒, ReLU → (None, 10, 10, 16) · 1.168
> ▒▒▒▒▒▒▒▒▒▒ → (None, 16) · 0
> Dense: 8, Softmax → (None, 8) · ▒▒▒
>
> Summe: ▒▒▒▒▒ (ein Kaffeefleck)
>
> Am Rand: „Kein Flatten! Flatten merkt sich, wo jedes Pixel war. Nur die stärkste Antwort jedes Filters behalten, egal wo sie ist.“

### 🔎 Ein Zettel von Mika

*Gebraucht von: 4. Mikas Notebook*

> Amara, ich habe versucht, den Leser mit dem Archiv zu trainieren, aber Keras stürzt immer wieder ab: erst irgendwas mit einer negativen Größe, dann irgendwas mit der Form?! Ich bin nach Hause gegangen, sorry.
>
> Mika

### 🔎 Das Etikett der Kisten

*Gebraucht von: 4. Mikas Notebook, 6. Der Krug von Varda*

> VARDA-ARCHIV · Fragmente, Zeichen von Hand sortiert
>
> 2.400 Fragmente zum Lernen (`x_train`, `y_train`) und 600 zum Testen (`x_test`, `y_test`).
>
> Jedes Fragment ist ein Tiefenscan aus 24 × 24 Punkten, gespeichert als Bytes: **0 = Oberfläche des Tons, 255 = am tiefsten**. Auf jedem ein Zeichen, irgendwo. Labels: die Nummer des Zeichens aus der Zeichenliste, 0 bis 7.
>
> Der Leser will jeden Punkt von 0.0 bis 1.0.

### 🔎 Amaras Mail, ausgedruckt

*Gebraucht von: 5. Amaras Laptop, 6. Der Krug von Varda*

> Von: Amara Okafor · Sonntag, 19:48
>
> Festgesteckt am Flughafen, Nebel. Mein alter Leser hat den Fotosatz perfekt gelesen, aber die neuen Fragmente von letzter Woche sehen für ihn aus wie Rauschen. Auf meinem Laptop findet ihr ihn und einen Prototyp von Entwurf 3. Bitte vergleicht sie an den 100 neuen Fragmenten. Wenn Entwurf 3 gewinnt, trainiert ihn mit dem ganzen Archiv und lest den Krug!
>
> Die Vitrine des Krugs: Der Code ist, wie viele der 100 der alte Leser richtig liest, dann wie viele der Prototyp richtig liest, dann bei wie vielen Fragmenten aus Kiste 7 Mika falsch sortiert hat. Die Kiste wurde am Freitag von Hand sortiert, und ich traue dem nicht ganz.
>
> A.

## Handbuch im Raum: 📖 Der Laborordner

**Bilder als Arrays:** [`a[i:i + 3, j:j + 3]`](https://numpy.org/doc/stable/user/basics.indexing.html), [`x[..., None]`](https://numpy.org/doc/stable/user/basics.indexing.html#dimensional-indexing-tools), [`a.transpose(axes)`](https://numpy.org/doc/stable/reference/generated/numpy.transpose.html), [`np.hsplit(a, n)  np.stack(arrays)`](https://numpy.org/doc/stable/reference/generated/numpy.hsplit.html), [`np.roll(a, shift, axis)`](https://numpy.org/doc/stable/reference/generated/numpy.roll.html), `show_images(images, labels=None, title=None)`, `show_plot(*series, labels=None, title=None)`

**Faltung:** [`layers.Conv2D(filters, kernel_size, padding="valid", activation=None, use_bias=True)`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/Conv2D), [`images: (samples, rows, columns, channels)`](https://www.tensorflow.org/tutorials/images/cnn), [`padding="valid"  padding="same"`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/Conv2D), [`Conv2D parameters`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/Conv2D), [`set_weights([kernel])`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#set_weights)

**Pooling:** [`layers.MaxPooling2D(pool_size=2)`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/MaxPool2D), [`layers.GlobalMaxPooling2D()`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/GlobalMaxPool2D), [`layers.Flatten()`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/Flatten)

**Bauen und trainieren:** [`tf.keras.Sequential([...])  model.summary()`](https://www.tensorflow.org/api_docs/python/tf/keras/Sequential), [`layers.Dense(units, activation="softmax")`](https://www.tensorflow.org/api_docs/python/tf/keras/layers/Dense), [`model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#compile), [`model.fit(x, y, epochs, validation_split)`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#fit), [`model.evaluate(x, y)  model.predict(x)`](https://www.tensorflow.org/api_docs/python/tf/keras/Model#predict), [`tf.keras.utils.set_random_seed(n)`](https://www.tensorflow.org/api_docs/python/tf/keras/utils/set_random_seed)
