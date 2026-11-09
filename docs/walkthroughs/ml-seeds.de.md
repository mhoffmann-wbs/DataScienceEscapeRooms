# Die Saatgutbank: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Die Kleeberger Saatgutbank liegt 80 Meter tief im alten Salzbergwerk, sicher vor allem außer, wie sich zeigt, Wasser. Letzte Nacht ist auf Sohle −2 ein Rohr geplatzt, und bis zum Morgen haben sich die Etiketten von 1.500 Umschlägen mit altem Saatgut abgelöst.
>
> Die Sortiermaschine hat jeden Umschlag gemessen, bevor das Wasser ihn erreichte: Länge, Breite, Gewicht und wie hell der Samen für ihre Kamera aussieht. Niemand weiß, was was ist. Am Montag säen sechs Höfe der Genossenschaft das Saatgut, das sie bestellt haben, und die Bestellzettel liegen im verschlossenen Kühllager.
>
> Keine Etiketten und keine Antworten zum Lernen: Lasst die Samen sich selbst gruppieren. Dieser Raum lädt Python mit pandas und scikit-learn, das erste Rätsel, das ihr öffnet, braucht also einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Das Testtablett | Warum KMeans skalierte Features braucht: Abstände, Einheiten und StandardScaler | 🔎 Etiketten neben dem Tablett |
| 2 | Das Terminal der Kuratorin | Die Zahl der Cluster wählen: Inertia und Ellbogen, der Silhouette-Score | 🔎 Das Whiteboard der Kuratorin |
| 3 | Die alte Sortiermaschine | Wie KMeans startet: init, lokale Minima, k-means++ und n_init | 🔎 Das Wartungsblatt der alten Sortiermaschine |
| 4 | Der Karteikasten | Cluster deuten: Zentren in den ursprünglichen Einheiten mit inverse_transform; Clusternummern sind beliebig | 2. Das Terminal der Kuratorin (sein Ergebnis), 🔒 1. Das Testtablett, 🔎 Die Artenkarten der Kuratorin |
| 5 | Das Stereomikroskop | Ausreißer beim Clustering: Abstände zu den Zentren mit transform und ein Schwellenwert | 2. Das Terminal der Kuratorin (sein Ergebnis), 🔎 Aushang der Pflanzengesundheitsprüfung |
| 6 | Das Kühllager (Abschluss-Schloss) | Alles zusammen: neue Proben mit dem trainierten Scaler und Modell zuordnen, Katalognummern statt Clusternummern, Ausreißer zurückweisen | 4. Der Karteikasten (sein Ergebnis), 5. Das Stereomikroskop (sein Ergebnis), 🔒 3. Die alte Sortiermaschine, 🔎 Die Feldkarte der Genossenschaft, 🔎 Die Artenkarten der Kuratorin, 🔎 Aushang der Pflanzengesundheitsprüfung |

## Stationen

### 1. Das Testtablett

**Übt:** Warum KMeans skalierte Features braucht: Abstände, Einheiten und StandardScaler  
**Braucht:** 🔎 Etiketten neben dem Tablett  
**Daten:** [tray.py](../../content/rooms/ml-seeds/data/tray.py)

**Aufgabe:**

> Vor dem Hochwasser hat die Kuratorin die Sortiermaschine an einem Regal getestet: 200 Umschläge, die laut Regaletikett drei Arten enthalten. Welche Umschläge enthalten dieselbe Art?
>
> Sie sind als `tray` geladen: Länge und Breite in mm, Gewicht in mg und Helligkeit von 0 (schwarz) bis 255 (weiß).
>
> 1. Teilt die Umschläge mit `KMeans` in drei Cluster und speichert den Cluster jedes Umschlags als `labels` (einer pro Zeile von `tray`, in dieser Reihenfolge). Jeder Cluster soll eine Art sein.

<details><summary>Startcode</summary>

```python
from sklearn.cluster import KMeans
from helpers import show_scatter

# tray ist geladen: 200 Umschläge, mit der Umschlagnummer als Index.
print(tray.describe().round(1))

km = KMeans(n_clusters=3, n_init=10, random_state=0)
labels = km.fit_predict(tray)

print(tray.assign(group=labels).head(12))
show_scatter(tray.length_mm, tray.width_mm, c=labels, title="Das Tablett")
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from helpers import show_scatter

X = StandardScaler().fit_transform(tray)
labels = KMeans(n_clusters=3, n_init=10, random_state=0).fit_predict(X)
print(tray.assign(group=labels).loc[[3, 5, 9, 12, 2, 4, 6, 7, 1, 10, 13, 17]])
print(pd.Series(labels).value_counts())
show_scatter(tray.length_mm, tray.width_mm, c=labels, title="The tray, scaled")
```

**Geprüftes Ergebnis** (`_tray_check(labels)`):

```json
"sorted"
```

**Zeigt nach dem Lösen:**

> Sobald jede Spalte skaliert ist, sortiert sich das Tablett sauber: **86** Roggen, **72** Linsen und **42** Ackerbohnen, jede Gruppe passend zu ihren Etiketten. Ohne Skalierung hat das Gewicht (Hunderte Milligramm) alles andere übertönt: KMeans hat die Bohnen nach Gewicht geteilt und Roggen und Linsen zusammengeworfen.
>
> Die Regel für das ganze Archiv: **erst skalieren**.

**Hinweise:**

1. Ein paar Umschläge haben ihr Etikett behalten; sie hängen am Schreibtisch neben dem Tablett. Führt den Startcode aus und vergleicht seine Gruppen mit den Etiketten. KMeans vergleicht Abstände zwischen Zeilen: `tray.describe()` zeigt, wie verschieden die Wertebereiche der Spalten sind.
2. Das Gewicht reicht bis zu mehreren hundert Milligramm, die Breite nur bis etwa 12 mm, also sind die Abstände fast nur Gewicht. `StandardScaler` bringt jede Spalte auf dieselbe Skala (Mittelwert 0, Standardabweichung 1).
3. `X = StandardScaler().fit_transform(tray)` (importiert aus `sklearn.preprocessing`), dann `labels = KMeans(n_clusters=3, n_init=10, random_state=0).fit_predict(X)`.

### 2. Das Terminal der Kuratorin

**Übt:** Die Zahl der Cluster wählen: Inertia und Ellbogen, der Silhouette-Score  
**Braucht:** 🔎 Das Whiteboard der Kuratorin  
**Daten:** [archive.py](../../content/rooms/ml-seeds/data/archive.py)

**Aufgabe:**

> Das überflutete Archiv ist als `archive` geladen: alle 1.507 Umschläge, die die Maschine gemessen hat, mit denselben vier Spalten wie das Tablett. Wie viele Arten stecken darin? Niemand hat es irgendwo aufgeschrieben, wo es trocken geblieben ist.
>
> 1. Skaliert das Archiv und trainiert `KMeans` für jedes k von 1 bis 10. Speichert die `inertia_` jedes Modells in der Liste `inertias` (k = 1 zuerst).
> 2. Speichert außerdem den Silhouette-Score für k = 2 bis 10 in `silhouettes`.
> 3. Zeichnet beides und speichert die Zahl der Arten, auf die sie zeigen, als `k`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from helpers import show_plot

# archive ist geladen: 1.507 Umschläge, mit der Umschlagnummer als Index.
X = archive          # die Merkmale, die KMeans vergleicht

inertias = []        # k = 1 bis 10
silhouettes = []     # k = 2 bis 10
for k in range(1, 11):
    km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(X)
    # ...

show_plot(pd.Series(inertias, index=range(1, len(inertias) + 1)), title="Inertia")
k = None             # eure Wahl
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from helpers import show_plot

X = StandardScaler().fit_transform(archive)
inertias = []
silhouettes = []
for k in range(1, 11):
    km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(X)
    inertias.append(km.inertia_)
    if k > 1:
        silhouettes.append(silhouette_score(X, km.labels_))
show_plot(pd.Series(inertias, index=range(1, 11)), title="Inertia")
show_plot(pd.Series(silhouettes, index=range(2, 11)), title="Silhouette")
k = 6
```

**Geprüftes Ergebnis** (`_elbow_check(inertias, silhouettes, k)`):

```json
"six"
```

**Zeigt nach dem Lösen:**

> **Sechs** Arten. Die Inertia fällt bis k = 6 steil und danach kaum noch, und die Silhouette ist bei k = 6 am höchsten: Dort sind die Cluster eng und weit voneinander entfernt.
>
> Der Karteikasten der Kuratorin sollte für jede davon eine Karte haben.

**Hinweise:**

1. Skaliert das Archiv wie beim Tablett: `X = StandardScaler().fit_transform(archive)`. Hängt in der Schleife `km.inertia_` an `inertias` an. Das Whiteboard der Kuratorin sagt, wie sie die beiden Kurven liest.
2. Die Silhouette braucht mindestens zwei Cluster: `if k > 1: silhouettes.append(silhouette_score(X, km.labels_))`. Zeichnet sie wie die Inertia, mit `index=range(2, 11)`.
3. Inertia: Der Ellbogen ist da, wo der steile Fall abflacht. Silhouette: der höchste Punkt. Beide zeigen auf dasselbe k; speichert es.

### 3. Die alte Sortiermaschine

**Übt:** Wie KMeans startet: init, lokale Minima, k-means++ und n_init  
**Braucht:** 🔎 Das Wartungsblatt der alten Sortiermaschine  
**Daten:** [archive.py](../../content/rooms/ml-seeds/data/archive.py)

**Aufgabe:**

> Die Saatgutbank hat schon immer mit dieser Maschine sortiert, und ihre Schubladen haben nie ganz zu den Karten der Kuratorin gepasst. Sie rechnet auch mit KMeans. Warum stimmen ihre Schubladen nicht?
>
> 1. Lasst KMeans auf dem skalierten Archiv so laufen wie die alte Maschine, als `old`. Übergebt die Startzentren mit `init=`: eine Zeile pro Cluster, skaliert wie das Archiv.
> 2. Lasst es auf die moderne Art laufen, als `best`: mit gleich vielen Clustern, k-means++-Starts und `n_init=10`.
> 3. Zählt die Umschläge in jeder Schublade der alten Maschine und speichert, wie viele in der vollsten landen, als `biggest`.
> 4. Vergleicht `old.inertia_` mit `best.inertia_`. Sind die Cluster der alten Maschine so gut wie die modernen? Speichert `as_good` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

scaler = StandardScaler()
X = scaler.fit_transform(archive)

start = None   # die Startumschläge der alten Maschine, skaliert
old = None     # KMeans so, wie die alte Maschine es laufen lässt
best = None    # KMeans mit k-means++ und n_init=10

biggest = None # Umschläge in der vollsten Schublade der alten Maschine
as_good = None # True oder False
```

</details>

**Musterlösung:**

```python
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

scaler = StandardScaler()
X = scaler.fit_transform(archive)
start = scaler.transform(archive.loc[[2, 3, 4, 8, 1, 7]])
old = KMeans(n_clusters=6, init=start, n_init=1).fit(X)
best = KMeans(n_clusters=6, n_init=10, random_state=0).fit(X)
print(round(old.inertia_, 1), round(best.inertia_, 1))
print("old drawers:", np.bincount(old.labels_))
biggest = np.bincount(old.labels_).max()
as_good = bool(old.inertia_ <= best.inertia_ * 1.01)
print("best drawers:", np.bincount(best.labels_))
```

**Geprüftes Ergebnis** (`_sorter_check(old, best, biggest, as_good)`):

```json
"explained"
```

**Zeigt nach dem Lösen:**

> Derselbe Algorithmus, dieselben Daten, ganz andere Schubladen. Die alte Maschine startet bei zwei Bohnen, zwei Erbsen, einem Roggen und einem Hafer und erholt sich nie davon: Sie bleibt in einem **lokalen Minimum** hängen, teilt die Bohnen auf zwei Schubladen auf und schüttet Roggen und Buchweizen in eine große. Ihre Inertia ist dreimal so hoch wie die beste.
>
> KMeans verbessert nur die Cluster, mit denen es startet. k-means++ verteilt die Starts, und `n_init=10` probiert zehn Starts und behält den besten.

**Hinweise:**

1. Das Wartungsblatt der alten Sortiermaschine sagt, wie sie startet: Es nennt sechs Umschlagnummern. `archive.loc[[2, 3, 4, 8, 1, 7]]` wählt diese Zeilen über die Umschlagnummer aus, und `scaler.transform(...)` skaliert sie wie den Rest.
2. `old = KMeans(n_clusters=6, init=start, n_init=1).fit(X)`. Mit festen Startpunkten ist an diesem Lauf nichts zufällig.
3. `best = KMeans(n_clusters=6, n_init=10, random_state=0).fit(X)`. `np.bincount(old.labels_)` zählt die Umschläge in jeder Schublade, also `biggest = np.bincount(old.labels_).max()`. Die alte Inertia ist etwa dreimal so hoch wie die beste, also `as_good = False`.

### 4. Der Karteikasten

**Übt:** Cluster deuten: Zentren in den ursprünglichen Einheiten mit inverse_transform; Clusternummern sind beliebig  
**Braucht:** 2. Das Terminal der Kuratorin (sein Ergebnis), 🔒 1. Das Testtablett, 🔎 Die Artenkarten der Kuratorin  
**Daten:** [archive.py](../../content/rooms/ml-seeds/data/archive.py)

**Zahlenschloss** (öffnet mit `427286`):

> Der Stahlschrank mit dem Arbeitskarteikasten der Kuratorin hat ein sechsstelliges Zahlenschloss. Ein Klebezettel: „Kombination = wie viele Ackerbohnen, Linsen und Roggen auf dem Testtablett liegen, je zwei Ziffern.“

**Aufgabe:**

> Die Cluster sind da, aber welcher ist welcher? KMeans nummeriert seine Cluster in keiner bestimmten Reihenfolge, und die Nummern können sich von einem Training zum nächsten ändern. Die Bauern bestellen nach **Katalognummer**.
>
> 1. Trainiert `KMeans` auf dem skalierten Archiv mit so vielen Clustern, wie es Arten gibt, als `km`, und behaltet seinen `scaler`.
> 2. Rechnet die Clusterzentren mit `scaler.inverse_transform` in Millimeter, Milligramm und Helligkeit zurück und findet heraus, welche Art jedes Zentrum ist.
> 3. Speichert das Ergebnis als `catalogue`: ein Dict von jeder Clusternummer zu ihrer Katalognummer, etwa `{0: 3, 1: 5, ...}`.

<details><summary>Startcode</summary>

```python
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

scaler = StandardScaler()
X = scaler.fit_transform(archive)
km = KMeans(n_clusters=2, n_init=10, random_state=0).fit(X)   # wie viele Arten?

centres = pd.DataFrame(km.cluster_centers_, columns=archive.columns)   # noch skaliert
centres["envelopes"] = np.bincount(km.labels_)
print(centres.round(2))

catalogue = {}   # Clusternummer -> Katalognummer
```

</details>

**Musterlösung:**

```python
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

scaler = StandardScaler()
X = scaler.fit_transform(archive)
km = KMeans(n_clusters=6, n_init=10, random_state=0).fit(X)
centres = pd.DataFrame(scaler.inverse_transform(km.cluster_centers_), columns=archive.columns)
centres["envelopes"] = np.bincount(km.labels_)
print(centres.round(1))

cards = pd.DataFrame(
    {"length_mm": [5.5, 7.5, 7.0, 15.0, 10.5, 5.0], "width_mm": [4.0, 7.0, 2.3, 10.0, 2.8, 5.2],
     "weight_mg": [25, 240, 30, 600, 33, 55], "brightness": [45, 175, 140, 85, 205, 125]},
    index=[1, 2, 3, 4, 5, 6])   # catalogue numbers, typical values from the species cards
# Each cluster gets the card closest to its centre (compared on the scaled axes).
catalogue = {}
for cluster, centre in enumerate(km.cluster_centers_):
    distances = ((scaler.transform(cards) - centre) ** 2).sum(axis=1)
    catalogue[cluster] = int(cards.index[distances.argmin()])
print(catalogue)
```

**Geprüftes Ergebnis** (`_card_check(km, scaler, catalogue)`):

```json
"matched"
```

**Zeigt nach dem Lösen:**

> Jeder Cluster hat seine Karte: **302** Umschläge Roggen, 282 Hafer, 260 Buchweizen, 240 Linsen, 232 Erbsen und 183 Ackerbohnen. Ein paar Cluster enthalten ein, zwei Umschläge mehr, als ihre Art wirklich hat.
>
> Behaltet eure Zuordnung bei eurem Code: Die Clusternummern gehören zu einem Training, die Katalognummern ändern sich nie.

**Hinweise:**

1. Setzt `n_clusters` auf die Zahl der Arten, die das Terminal gefunden hat. Die Zentren in `km.cluster_centers_` sind in skalierten Einheiten, die auf den Artenkarten der Kuratorin neben dem Karteikasten nichts bedeuten.
2. `scaler.inverse_transform(km.cluster_centers_)` rechnet sie in mm, mg und Helligkeit zurück. Steckt sie in einen DataFrame mit den Spalten des Archivs und sucht dann zu jedem Zentrum seine Karte.
3. Wählt für jedes Zentrum die Karte mit der nächsten Länge, Breite, Gewicht und Helligkeit: Ein Zentrum mit etwa 15 mm und 600 mg ist die Ackerbohne, Katalognummer 4. Schreibt dann `catalogue = {0: ..., 1: ..., ...}` mit euren eigenen Clusternummern.

### 5. Das Stereomikroskop

**Übt:** Ausreißer beim Clustering: Abstände zu den Zentren mit transform und ein Schwellenwert  
**Braucht:** 2. Das Terminal der Kuratorin (sein Ergebnis), 🔎 Aushang der Pflanzengesundheitsprüfung  
**Daten:** [archive.py](../../content/rooms/ml-seeds/data/archive.py)

**Aufgabe:**

> Das Hochwasser hat nicht nur Etiketten abgelöst, es hat auch etwas hereingespült. KMeans steckt jeden Umschlag in irgendeinen Cluster, aber ein Samen kann dem Roggen am nächsten liegen, ohne Roggen zu sein. Welche Umschläge enthalten fremde Samen?
>
> 1. Trainiert `KMeans` auf dem skalierten Archiv, mit einem Cluster pro Art.
> 2. `km.transform(X)` gibt den Abstand jedes Umschlags zu jedem Zentrum. Bestimmt für jeden Umschlag den Abstand zu seinem **nächsten** Zentrum.
> 3. Speichert die Umschlagnummern der fremden Samen als Liste `foreign`.

<details><summary>Startcode</summary>

```python
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from helpers import show_hist

scaler = StandardScaler()
X = scaler.fit_transform(archive)
km = None        # ein Cluster pro Art, auf dem skalierten Archiv

distance = None  # Abstand jedes Umschlags zu seinem nächsten Zentrum
# show_hist(distance, bins=40, title="Abstand zum nächsten Zentrum")

foreign = []     # Umschlagnummern (der Index des Archivs) der fremden Samen
```

</details>

**Musterlösung:**

```python
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from helpers import show_hist

scaler = StandardScaler()
X = scaler.fit_transform(archive)
km = KMeans(n_clusters=6, n_init=10, random_state=0).fit(X)
distance = km.transform(X).min(axis=1)
show_hist(distance, bins=40, title="Distance to the nearest centre")
foreign = archive.index[distance > 2].tolist()
print(foreign)
print(archive.loc[foreign])
```

**Geprüftes Ergebnis** (`_foreign_check(foreign)`):

```json
"quarantined"
```

**Zeigt nach dem Lösen:**

> Sieben fremde Umschläge: Kletten, Flughafer, Ampfer und andere Unkrautsamen, die das Wasser hereingetragen hat. Sie sind wie alles andere in Cluster geraten; nur ihr Abstand hat sie verraten. Jetzt sind sie in Quarantäne.
>
> Die Regel gilt auch für neue Samen: Prüft den Abstand, bevor ihr einem Cluster traut.

**Hinweise:**

1. `km.transform(X)` hat eine Zeile pro Umschlag und eine Spalte pro Zentrum. Das nächste Zentrum ist die kleinste Zahl in jeder Zeile: `.min(axis=1)`. Der Aushang der Pflanzengesundheitsprüfung am Schwarzen Brett sagt, wann ein Samen als fremd gilt.
2. Das Histogramm zeigt einen großen Haufen kleiner Abstände und ein paar weit draußen.
3. `foreign = archive.index[distance > 2].tolist()`: Der Index enthält die Umschlagnummern, nicht die Zeilenpositionen.

### 6. Das Kühllager (Abschluss-Schloss)

**Übt:** Alles zusammen: neue Proben mit dem trainierten Scaler und Modell zuordnen, Katalognummern statt Clusternummern, Ausreißer zurückweisen  
**Braucht:** 4. Der Karteikasten (sein Ergebnis), 5. Das Stereomikroskop (sein Ergebnis), 🔒 3. Die alte Sortiermaschine, 🔎 Die Feldkarte der Genossenschaft, 🔎 Die Artenkarten der Kuratorin, 🔎 Aushang der Pflanzengesundheitsprüfung  
**Daten:** [archive.py](../../content/rooms/ml-seeds/data/archive.py)

**Zahlenschloss** (öffnet mit `556302`):

> Die Stahltür des Kühllagers hat ein sechsstelliges Tastenfeld. Daneben klebt: „PIN = wie viele Umschläge die alte Sortiermaschine in ihre größte Schublade steckt, dann wie viele Umschläge Roggen der Karteikasten zählt.“

**Aufgabe:**

> Hinter der Tür warten die sechs Bestellzettel der Genossenschaft, geladen als `orders`, einer pro Feld. Jeder Hof hat mit seiner Bestellung den Probensamen vom letzten Jahr geschickt, und die Maschine hat jeden gemessen: dieselben vier Spalten wie im Archiv. Besät jedes Feld mit seiner Art, nach Katalognummer.
>
> 1. Ordnet jede Probe mit dem Scaler und dem KMeans-Modell des Archivs einer Art zu.
> 2. Speichert `fields`: sechs Katalognummern, Feld 1 zuerst.

<details><summary>Startcode</summary>

```python
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

print(orders)   # ein Probensamen pro Feld, gemessen wie das Archiv

# Der Scaler und das KMeans-Modell des Archivs, und der catalogue für dieses Modell:
scaler = None
km = None
catalogue = {}

fields = []     # eine Katalognummer pro Feld, Feld 1 zuerst
```

</details>

**Musterlösung:**

```python
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

scaler = StandardScaler()
X = scaler.fit_transform(archive)
km = KMeans(n_clusters=6, n_init=10, random_state=0).fit(X)
cards = pd.DataFrame(
    {"length_mm": [5.5, 7.5, 7.0, 15.0, 10.5, 5.0], "width_mm": [4.0, 7.0, 2.3, 10.0, 2.8, 5.2],
     "weight_mg": [25, 240, 30, 600, 33, 55], "brightness": [45, 175, 140, 85, 205, 125]},
    index=[1, 2, 3, 4, 5, 6])   # catalogue numbers, typical values from the species cards
catalogue = {}
for cluster, centre in enumerate(km.cluster_centers_):
    catalogue[cluster] = int(cards.index[((scaler.transform(cards) - centre) ** 2).sum(axis=1).argmin()])

d = km.transform(scaler.transform(orders))
fields = [0 if d[i].min() > 2 else catalogue[int(d[i].argmin())] for i in range(len(orders))]
print(orders.assign(nearest=d.min(axis=1).round(2), catalogue=fields))
```

**Geprüftes Ergebnis** (`_sowing_check(fields)`):

```json
"sown"
```

**Zeigt nach dem Lösen:**

> Sechs Felder, fünf Arten und ein Fremdling: Die Probe von Feld 3 war Flughafer, also bleibt dieses Feld dieses Jahr brach. Am Montag rollen die Traktoren der Genossenschaft, und die Saatgutbank hat ihre Schubladen zurück, jede an ihrer Karte geprüft.

**Hinweise:**

1. Trainiert den Scaler und das KMeans-Modell auf dem Archiv, wie zuvor. Neue Proben werden nur skaliert, mit `scaler.transform(orders)`: Trainiert den Scaler nie auf ihnen. Die Feldkarte der Genossenschaft sagt, was mit einer Probe geschieht, die keine von unseren ist.
2. `km.transform(scaler.transform(orders))` gibt den Abstand jeder Probe zu jedem Zentrum: Der kleinste ist ihr Cluster (`argmin`), und seine Größe sagt, ob man ihm trauen kann.
3. Für jedes Feld: Ist der nächste Abstand größer als 2, tragt 0 ein; sonst `catalogue[nächster Cluster]`. Clusternummern gehören zu einem Training, also baut `catalogue` für dieses `km` (der Code vom Karteikasten mit demselben `random_state` ergibt dieselben Nummern).

## Hinweise im Raum

### 🔎 Etiketten neben dem Tablett

*Gebraucht von: 1. Das Testtablett*

> Umschläge auf dem Testtablett, die ihr Etikett behalten haben:
>
> Roggen: 3, 5, 9, 12
> Linse: 2, 4, 6, 7
> Ackerbohne: 1, 10, 13, 17

### 🔎 Das Whiteboard der Kuratorin

*Gebraucht von: 2. Das Terminal der Kuratorin*

> **k wählen** (Dr. Ilse Brandt)
>
> Die Inertia fällt immer, wenn k wächst, bis auf 0, wenn jeder Samen sein eigener Cluster ist. Sucht den **Ellbogen**: das k, nach dem mehr Cluster kaum noch helfen.
>
> Ellbogen können weich sein, deshalb prüfe ich auch die **Silhouette** (von −1 bis 1, höher ist besser): Liegt jeder Samen nah an seinem eigenen Cluster und weit weg vom nächsten? Ich traue einem k, wenn beide übereinstimmen.

### 🔎 Die Artenkarten der Kuratorin

*Gebraucht von: 4. Der Karteikasten, 6. Das Kühllager*

> Ein typischer Samen jeder Art, wie die Sortiermaschine ihn misst (Länge × Breite, Gewicht, Helligkeit von 0 bis 255):
>
> **1 Buchweizen**: 5,5 × 4,0 mm, 25 mg, sehr dunkel (45)
> **2 Erbse**: 7,5 × 7,0 mm, 240 mg, hell (175)
> **3 Roggen**: 7,0 × 2,3 mm, 30 mg, mittelbraun (140)
> **4 Ackerbohne**: 15 × 10 mm, 600 mg, dunkel (85)
> **5 Hafer**: 10,5 × 2,8 mm, 33 mg, sehr hell (205)
> **6 Linse**: 5,0 × 5,2 mm, 55 mg, braun (125)

### 🔎 Das Wartungsblatt der alten Sortiermaschine

*Gebraucht von: 3. Die alte Sortiermaschine*

> SORTER 2000 · Wartungsblatt
>
> Cluster: 6
> Startzentren: Umschläge 2, 3, 4, 8, 1, 7 (in dieser Reihenfolge)
> Neustarts: keine, spart Zeit! (n_init = 1)
>
> Letzte Wartung: 2009

### 🔎 Aushang der Pflanzengesundheitsprüfung

*Gebraucht von: 5. Das Stereomikroskop, 6. Das Kühllager*

> PFLANZENGESUNDHEITSPRÜFUNG · Regel 4
>
> Ein Samen, dessen Abstand zum nächsten Clusterzentrum größer als **2** ist (in skalierten Einheiten: alle vier Messwerte auf dem ganzen Archiv standardisiert), ist der Sammlung fremd. In Quarantäne stellen.

### 🔎 Die Feldkarte der Genossenschaft

*Gebraucht von: 6. Das Kühllager*

> Sechs Felder, nummeriert von 1 bis 6 wie auf den Bestellzetteln.
>
> Eine Probe, die der Sammlung fremd ist, bekommt kein Saatgut: Das Feld bleibt brach. Tragt **0** dafür ein.

## Handbuch im Raum: 📖 Der Clustering-Ordner der Saatgutbank

**Skalieren:** [`StandardScaler()  scaler.fit_transform(X)`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html), [`scaler.transform(X)`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html#sklearn.preprocessing.StandardScaler.transform), [`scaler.inverse_transform(Xs)`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html#sklearn.preprocessing.StandardScaler.inverse_transform)

**KMeans:** [`KMeans(n_clusters=k, n_init=10, random_state=0)`](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html), [`km.fit(X)  km.fit_predict(X)  km.labels_`](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html#sklearn.cluster.KMeans.fit_predict), [`km.cluster_centers_`](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html), [`km.inertia_`](https://scikit-learn.org/stable/modules/clustering.html#k-means), [`init=  n_init=`](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html), [`km.predict(X)  km.transform(X)`](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html#sklearn.cluster.KMeans.transform)

**Wie viele Cluster?:** [`the elbow`](https://scikit-learn.org/stable/modules/clustering.html#k-means), [`silhouette_score(X, labels)`](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.silhouette_score.html)

**pandas und NumPy:** [`df.loc[[2, 3, 4]]`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.loc.html), [`df.index[mask].tolist()`](https://pandas.pydata.org/docs/reference/api/pandas.Index.html), [`df.assign(group=labels)`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.assign.html), [`a.min(axis=1)  a.argmin(axis=1)`](https://numpy.org/doc/stable/reference/generated/numpy.ndarray.min.html), [`np.bincount(labels)`](https://numpy.org/doc/stable/reference/generated/numpy.bincount.html)

**Diagramme:** `show_scatter(x, y, c=labels, centers=...)`, `show_plot(series)  show_hist(values, bins=40)`
