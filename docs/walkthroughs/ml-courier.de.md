# Stoßzeit: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Sonntag, 15. November, 16:40, das Depot von Blitzkurier. Der Stadtmarathon hat den ganzen Tag die Straßen gesperrt, und heute Abend bestellen alle, die gelaufen sind, zugeschaut haben oder festsaßen, ihr Abendessen. Ein Sturm zieht auf.
>
> Seit letzte Woche die neue App live ging, kann das Modell für Lieferzeiten für einen neuen Auftrag nichts mehr versprechen, und Jonas, der es gebaut hat, sitzt auf einem Boot ohne Empfang. Jeder Auftrag braucht ein Versprechen, bevor er angenommen wird, und die ersten kommen um 17:00. Was die Zentrale hat: zwei Monate rohe Aufträge, Jonas' Notizen und Ilse, die Nachtdisponentin, die die Stadt kennt.
>
> Baut ein Modell, das heute Nacht versprechen kann. Dieser Raum lädt Python mit pandas und scikit-learn, das erste Rätsel, das ihr öffnet, braucht also einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Das rohe Protokoll | Datumsmerkmale: pd.to_datetime, .dt.hour und .dt.dayofweek, ein Stoßzeit-Flag aus Fachwissen statt der rohen Stunde | 🔎 Der Schichtplan, 🔎 Der Zettel am Server |
| 2 | Kuriere können nicht fliegen | Ein konstruiertes Merkmal: euklidische vs. Manhattan-Distanz aus Koordinaten, einen Koeffizienten in anderen Einheiten lesen | 🔎 Der Stadtplan, 🔎 Der Zettel am Server |
| 3 | Wetter und Fahrzeuge | Kategorien kodieren: OneHotEncoder für ungeordnete, OrdinalEncoder mit vorgegebener Reihenfolge, ein ColumnTransformer in einer Pipeline, eine Kategorie, die die Trainingsdaten nie gesehen haben | 🔎 Das Plakat des Wetterdiensts |
| 4 | Zu gut, um wahr zu sein | Data Leakage: Spalten, die erst nach dem Ziel bekannt sind, ein verdächtig guter Wert, ein ehrlicher Test-MAE, eine Geschäftskennzahl aus den Vorhersagen | 1. Das rohe Protokoll (sein Ergebnis), 3. Wetter und Fahrzeuge (sein Ergebnis), 🔒 1. Das rohe Protokoll, 🔎 Das Datenwörterbuch, 🔎 Das Blitzkurier-Plakat, 🔎 Der Zettel am Server |
| 5 | Vierzig Sensoren | Feature-Auswahl: ein univariater Filter (SelectKBest, f_regression) vs. ein Merkmal im Modell testen, redundante Merkmale, Vorwärtsauswahl | 2. Kuriere können nicht fliegen (sein Ergebnis), 🔒 2. Kuriere können nicht fliegen, 🔎 Das Fax vom Netzbetreiber, 🔎 Das Handbuch der Kurierbox, 🔎 Der Zettel am Server |
| 6 | Die Versprechen für heute Nacht (Abschluss-Schloss) | Alles zusammen: eine Pipeline mit FunctionTransformer und ColumnTransformer, die rohe Zeilen nimmt, bewertet auf ungesehenen Daten, ohne undichte Spalten, mit begrenzter Auswahl an Merkmalen | 1. Das rohe Protokoll (sein Ergebnis), 2. Kuriere können nicht fliegen (sein Ergebnis), 3. Wetter und Fahrzeuge (sein Ergebnis), 4. Zu gut, um wahr zu sein (sein Ergebnis), 5. Vierzig Sensoren (sein Ergebnis), 🔒 5. Vierzig Sensoren, 🔎 Das Fax vom Netzbetreiber |

## Stationen

### 1. Das rohe Protokoll

**Übt:** Datumsmerkmale: pd.to_datetime, .dt.hour und .dt.dayofweek, ein Stoßzeit-Flag aus Fachwissen statt der rohen Stunde  
**Braucht:** 🔎 Der Schichtplan, 🔎 Der Zettel am Server  
**Daten:** [orders.py](../../content/rooms/ml-courier/data/orders.py)

**Aufgabe:**

> Das Terminal der Zentrale zeigt das Auftragsprotokoll so, wie es exportiert wurde: `orders` hat eine Zeile pro Auftrag aus September und Oktober, indiziert nach Auftragsnummer, mit den Minuten von der Bestellung bis zur Tür in `minutes`. Die Spalte `ordered_at` ist reiner Text, und Jonas' Modell hat immer nur Zahlen gelesen. Kostet die Tageszeit Minuten, und wie viele?
>
> 1. Macht aus `ordered_at` Zeitstempel und nehmt daraus die Stunde und den Wochentag.
> 2. Trainiert eine `LinearRegression` auf den Artikeln und der Stunde als Zahl, und eine auf den Artikeln und einer 0/1-Spalte `rush`, die die Stoßzeiten der Zentrale markiert. Trainiert jede auf dem Trainingsteil der Zentrale und speichert ihren Test-MAE in Minuten als `mae_hour` und `mae_rush`.
> 3. Speichert, was das Rush-Flag dazurechnet, in Minuten, als `rush_minutes`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

print(orders[["ordered_at", "items", "minutes"]].head())
print(orders["ordered_at"].dtype)   # Text, keine Zeit

y = orders["minutes"]

mae_hour = None       # Test-MAE: die Artikel und die Stunde als Zahl
mae_rush = None       # Test-MAE: die Artikel und das Rush-Flag
rush_minutes = None   # was das Rush-Flag dazurechnet, in Minuten
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

y = orders["minutes"]
t = pd.to_datetime(orders["ordered_at"])
hour, weekday = t.dt.hour, t.dt.dayofweek
rush = ((hour.between(12, 13) & (weekday < 5)) | hour.between(17, 19)).astype(int)


def test_mae(X):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=4)
    model = LinearRegression().fit(X_train, y_train)
    return mean_absolute_error(y_test, model.predict(X_test)), model


mae_hour, _ = test_mae(pd.DataFrame({"items": orders["items"], "hour": hour}))
mae_rush, model = test_mae(pd.DataFrame({"items": orders["items"], "rush": rush}))
rush_minutes = model.coef_[1]
print(round(mae_hour, 2), round(mae_rush, 2), round(rush_minutes, 1))
```

**Geprüftes Ergebnis** (`_raw_log_check(mae_hour, mae_rush, rush_minutes)`):

```json
"parsed"
```

**Zeigt nach dem Lösen:**

> Die Stoßzeit rechnet **9 Minuten** (8,9) auf einen Auftrag. Die Stunde als Zahl kann das nicht zeigen: Eine Gerade in der Stunde kann den ganzen Tag nur steigen oder fallen, aber die Minuten gehen mittags hoch, nachmittags runter und abends wieder hoch. Ein Flag aus dem, was die Zentrale über ihre eigene Stadt weiß, schlägt die rohe Zahl, und an einem Sonntag fällt die Mittagsspitze einfach aus.

**Hinweise:**

1. Der Schichtplan an der Wand sagt, wann die Zentrale alle Kuriere auf der Straße hat, und der Zettel am Server sagt, wie die Zentrale ihre Modelle testet. `pd.to_datetime(orders["ordered_at"])` gibt Zeitstempel; `.dt.hour` und `.dt.dayofweek` (Montag = 0) nehmen sie auseinander.
2. `rush = ((hour.between(12, 13) & (weekday < 5)) \| hour.between(17, 19)).astype(int)`. Teilt einmal nach der Regel der Zentrale und trainiert dann beide Modelle auf denselben Trainingszeilen.
3. `X = pd.DataFrame({"items": orders["items"], "rush": rush})`, `X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=4)`, `m = LinearRegression().fit(X_train, y_train)`, `mae_rush = mean_absolute_error(y_test, m.predict(X_test))`, `rush_minutes = m.coef_[1]`. Dasselbe mit `hour` statt `rush` gibt `mae_hour`.

### 2. Kuriere können nicht fliegen

**Übt:** Ein konstruiertes Merkmal: euklidische vs. Manhattan-Distanz aus Koordinaten, einen Koeffizienten in anderen Einheiten lesen  
**Braucht:** 🔎 Der Stadtplan, 🔎 Der Zettel am Server  
**Daten:** [orders.py](../../content/rooms/ml-courier/data/orders.py)

**Aufgabe:**

> Am Terminal im Kartenraum ist noch Jonas' halb fertige Routentabelle offen. `orders` hat jede Abholung und Abgabe als Gitterkoordinaten (`pickup_x`, `pickup_y`, `drop_x`, `drop_y`). Wie lange braucht ein Kurier pro Block?
>
> 1. Berechnet die Luftlinie zwischen Abholung und Abgabe und die Strecke, die ein Kurier wirklich fährt.
> 2. Trainiert eine `LinearRegression` auf jeder Distanz allein, auf dem Trainingsteil der Zentrale, und speichert ihren Test-MAE in Minuten als `mae_straight` und `mae_street`.
> 3. Speichert, was ein Block mehr im Modell auf der gefahrenen Strecke dazurechnet, in Sekunden, als `seconds_per_block`.

<details><summary>Startcode</summary>

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

print(orders[["pickup_x", "pickup_y", "drop_x", "drop_y", "minutes"]].head())

dx = orders["drop_x"] - orders["pickup_x"]
dy = orders["drop_y"] - orders["pickup_y"]

mae_straight = None        # Test-MAE: nur die Luftlinie
mae_street = None          # Test-MAE: nur die Strecke, die ein Kurier fährt
seconds_per_block = None   # was ein Block mehr dazurechnet, in Sekunden
```

</details>

**Musterlösung:**

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

dx = orders["drop_x"] - orders["pickup_x"]
dy = orders["drop_y"] - orders["pickup_y"]
y = orders["minutes"]


def test_mae(X):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=4)
    model = LinearRegression().fit(X_train, y_train)
    return mean_absolute_error(y_test, model.predict(X_test)), model


mae_straight, _ = test_mae(pd.DataFrame({"distance": np.hypot(dx, dy)}))
mae_street, model = test_mae(pd.DataFrame({"blocks": dx.abs() + dy.abs()}))
seconds_per_block = model.coef_[0] * 60
print(round(mae_straight, 2), round(mae_street, 2), round(seconds_per_block))
```

**Geprüftes Ergebnis** (`_street_check(mae_straight, mae_street, seconds_per_block)`):

```json
"routed"
```

**Zeigt nach dem Lösen:**

> Ein Kurier braucht **85 Sekunden pro Block**. Die Luftlinie ist kürzer als jede echte Route, und um wie viel, hängt von der Richtung ab: Eine Fahrt eine Straße entlang ist so lang wie die Luftlinie, eine schräge bis zu 41 % länger. Die Straßenstrecke, `abs(dx) + abs(dy)`, ist das, was das Rad wirklich fährt, und schon allein schlägt sie die Luftlinie. Ein Merkmal, das zeigt, wie die Welt funktioniert, ist mehr wert als jedes Feintuning am Modell.

**Hinweise:**

1. Schaut euch den Stadtplan an der Wand an: Wie verlaufen die Straßen? Der Split folgt dem Zettel am Server. `np.hypot(dx, dy)` ist die Luftlinie.
2. Ohne schräge Straßen fährt ein Kurier das ganze `dx` eine Straße entlang und das ganze `dy` eine andere: `dx.abs() + dy.abs()` Blöcke. Trainiert jede Distanz als Tabelle mit einer Spalte, z. B. `pd.DataFrame({"blocks": blocks})`.
3. `X_train, X_test, y_train, y_test = train_test_split(pd.DataFrame({"blocks": blocks}), orders["minutes"], test_size=0.25, random_state=4)`, `m = LinearRegression().fit(X_train, y_train)`, `mae_street = mean_absolute_error(y_test, m.predict(X_test))`, `seconds_per_block = m.coef_[0] * 60`. Dasselbe mit `np.hypot(dx, dy)` gibt `mae_straight`.

### 3. Wetter und Fahrzeuge

**Übt:** Kategorien kodieren: OneHotEncoder für ungeordnete, OrdinalEncoder mit vorgegebener Reihenfolge, ein ColumnTransformer in einer Pipeline, eine Kategorie, die die Trainingsdaten nie gesehen haben  
**Braucht:** 🔎 Das Plakat des Wetterdiensts  
**Daten:** [orders.py](../../content/rooms/ml-courier/data/orders.py)

**Aufgabe:**

> Am Funktisch hat der Azubi ein Modell angefangen, das das Fahrzeug (`bike`, `scooter`, `cargo`) und das Wetter als Wörter liest. Heute Nacht kommt ein Sturm. Wie viele Minuten rechnet ein Sturm gegenüber einem trockenen Abend dazu?
>
> 1. Repariert die Pipeline des Azubis: das Fahrzeug one-hot-kodiert, das Wetter in seine Stufe verwandelt, die Artikel behalten, dann eine `LinearRegression`, trainiert auf allen Aufträgen. Behaltet sie als `model`.
> 2. Speichert, wie viele Minuten euer Modell bei sonst Gleichem für einen Sturm statt trockenem Wetter dazurechnet, als `storm_minutes`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder

print(orders["weather"].value_counts())
print(orders["vehicle"].value_counts())

# Das Modell des Azubis
encode = ColumnTransformer([
    ("vehicle", OneHotEncoder(), ["vehicle"]),
    ("weather", OrdinalEncoder(), ["weather"]),
], remainder="passthrough")
model = make_pipeline(encode, LinearRegression())
model.fit(orders[["vehicle", "weather", "items"]], orders["minutes"])

evening = pd.DataFrame({"vehicle": ["bike", "bike"], "weather": ["dry", "storm"], "items": [3, 3]})
print(model.predict(evening))

storm_minutes = None   # was ein Sturm gegenüber einem trockenen Abend dazurechnet, in Minuten
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder

encode = ColumnTransformer([
    ("vehicle", OneHotEncoder(), ["vehicle"]),
    ("weather", OrdinalEncoder(categories=[["dry", "drizzle", "rain", "storm"]]), ["weather"]),
], remainder="passthrough")
model = make_pipeline(encode, LinearRegression())
model.fit(orders[["vehicle", "weather", "items"]], orders["minutes"])

evening = pd.DataFrame({"vehicle": ["bike", "bike"], "weather": ["dry", "storm"], "items": [3, 3]})
p = model.predict(evening)
storm_minutes = p[1] - p[0]
print(p.round(1), round(storm_minutes, 1))
```

**Geprüftes Ergebnis** (`_weather_check(model, storm_minutes)`):

```json
"forecast"
```

**Zeigt nach dem Lösen:**

> Ein Sturm rechnet **12 Minuten** (11,9) gegenüber einem trockenen Abend dazu: etwa 4 Minuten pro Stufe. Das Protokoll hat noch nie einen Sturm gesehen, also kann kein Encoder ihn daraus lernen. One-Hot-Encoding lehnt das unbekannte Wort entweder ab oder bewertet einen Sturm mit `handle_unknown="ignore"` stillschweigend wie eine trockene Nacht. Die Skala des Wetterdiensts bringt das Wetter in eine Reihenfolge, und eine Stufe auf dieser Skala lässt ein lineares Modell über die letzte gesehene Stufe hinaus weiterrechnen. Der `OrdinalEncoder` sortiert Wörter von sich aus alphabetisch, und dann kommt Nieselregen vor trocken.

**Hinweise:**

1. Das Plakat des Wetterdiensts am Funkgerät zeigt seine Skala. Lasst den Starter laufen: Was sagt der Encoder zu `'storm'`? Und gebt `encode.named_transformers_["weather"].categories_` aus, um die Reihenfolge zu sehen, die er gewählt hat.
2. `OrdinalEncoder(categories=[["dry", "drizzle", "rain", "storm"]])` macht aus den Wörtern 0 bis 3, in dieser Reihenfolge, und kennt einen Sturm, obwohl das Protokoll keinen hat.
3. Mit diesem Encoder im `ColumnTransformer` trainiert neu, dann `p = model.predict(evening)` und `storm_minutes = p[1] - p[0]`.

### 4. Zu gut, um wahr zu sein

**Übt:** Data Leakage: Spalten, die erst nach dem Ziel bekannt sind, ein verdächtig guter Wert, ein ehrlicher Test-MAE, eine Geschäftskennzahl aus den Vorhersagen  
**Braucht:** 1. Das rohe Protokoll (sein Ergebnis), 3. Wetter und Fahrzeuge (sein Ergebnis), 🔒 1. Das rohe Protokoll, 🔎 Das Datenwörterbuch, 🔎 Das Blitzkurier-Plakat, 🔎 Der Zettel am Server  
**Daten:** [orders.py](../../content/rooms/ml-courier/data/orders.py)

**Zahlenschloss** (öffnet mit `912`):

> Jonas' Laptop ist gesperrt. Auf einem Klebezettel unter der Tastatur: „PIN = was die Stoßzeit dazurechnet, dann was ein Sturm dazurechnet, beides in ganzen Minuten.“

**Aufgabe:**

> Auf Jonas' Laptop liegt das Modell, das jede Lieferung versprochen hat, bis letzte Woche die neue App live ging. Auf seinem Testteil erreicht es ein R² von fast 1. Seit der Umstellung kann es für einen neuen Auftrag nichts mehr versprechen. Ist es so gut, wie es aussieht?
>
> 1. Lasst Jonas' Code laufen. Findet jede Spalte, die die Zentrale noch nicht kennt, wenn ein Auftrag eingeht, und speichert ihre Namen als `leaks`.
> 2. Trainiert dasselbe Modell auf den übrigen Zahlenspalten, mit dem Split der Zentrale, und speichert seinen Test-MAE in Minuten als `honest_mae`.
> 3. Speichert, wie viele der Testaufträge das ehrliche Modell hätte erstatten müssen, als `refunds`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

# Jonas' Modell: jede Zahlenspalte des Protokolls
y = orders["minutes"]
numbers = orders.select_dtypes("number").drop(columns="minutes")
X_train, X_test, y_train, y_test = train_test_split(numbers, y)
jonas = LinearRegression().fit(X_train, y_train)
print("R²", r2_score(y_test, jonas.predict(X_test)))
print("MAE", mean_absolute_error(y_test, jonas.predict(X_test)))

leaks = []           # die Spalten, die die Zentrale noch nicht kennt, wenn ein Auftrag eingeht
honest_mae = None    # Test-MAE desselben Modells ohne sie
refunds = None       # Testaufträge, die das ehrliche Modell hätte erstatten müssen
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

y = orders["minutes"]
numbers = orders.select_dtypes("number").drop(columns="minutes")
leaks = ["kitchen_wait", "gps_pings", "rating"]
honest = numbers.drop(columns=leaks)

X_train, X_test, y_train, y_test = train_test_split(honest, y, test_size=0.25, random_state=4)
model = LinearRegression().fit(X_train, y_train)
p = model.predict(X_test)
honest_mae = mean_absolute_error(y_test, p)
refunds = int(((y_test - p) > 10).sum())
print(round(honest_mae, 2), refunds)
```

**Geprüftes Ergebnis** (`_leak_check(leaks, honest_mae, refunds)`):

```json
"sealed"
```

**Zeigt nach dem Lösen:**

> Ohne `kitchen_wait`, `gps_pings` und `rating` liegt Jonas' Modell 5,8 Minuten daneben, nicht 0,6, und **48** der 500 Testaufträge wären gratis gewesen. Die GPS-Pings zählen die Minuten auf der Straße, die Wartezeit in der Küche kennt man erst bei der Abholung, und die Sterne kommen nach der Tür: Jede war erst bekannt, als die Antwort schon feststand. Das ist Data Leakage. Ein Testwert ist nur ehrlich, wenn das Modell genau das sieht, was es beim Einsatz sehen wird, und für einen neuen Auftrag hat die App nichts davon.

**Hinweise:**

1. Das Datenwörterbuch neben dem Laptop sagt, wann jede Spalte ausgefüllt wird. Das Plakat an der Wand sagt, wann eine Lieferung gratis ist. Und Jonas' Split folgt noch nicht dem Zettel am Server.
2. Alles, was nach der Bestellung ausgefüllt wird (bei der Abholung, unterwegs, nach der Tür), ist ein Leck. `numbers.drop(columns=leaks)`, dann der Split mit `test_size=0.25, random_state=4`. Eine Erstattung ist ein Testauftrag, der mehr als 10 Minuten länger gedauert hat, als das Modell versprochen hat: `(y_test - prediction) > 10`.
3. `leaks = ["kitchen_wait", "gps_pings", "rating"]`, `honest = numbers.drop(columns=leaks)`, Split, trainieren, `p = model.predict(X_test)`, `honest_mae = mean_absolute_error(y_test, p)`, `refunds = int(((y_test - p) > 10).sum())`.

### 5. Vierzig Sensoren

**Übt:** Feature-Auswahl: ein univariater Filter (SelectKBest, f_regression) vs. ein Merkmal im Modell testen, redundante Merkmale, Vorwärtsauswahl  
**Braucht:** 2. Kuriere können nicht fliegen (sein Ergebnis), 🔒 2. Kuriere können nicht fliegen, 🔎 Das Fax vom Netzbetreiber, 🔎 Das Handbuch der Kurierbox, 🔎 Der Zettel am Server  
**Daten:** [orders.py](../../content/rooms/ml-courier/data/orders.py)

**Zahlenschloss** (öffnet mit `85`):

> Das Telemetrie-Rack steht hinter einem Gitter mit einem zweistelligen Schloss. In den Rahmen geritzt: „Code = wie viele Sekunden ein Kurier pro Block braucht.“

**Aufgabe:**

> Jede Kurierbox sendet 40 Telemetriekanäle, wenn ein Auftrag vergeben wird, `s01` bis `s40` in `orders`. Ilse hat am Telemetrie-Rack schon einen Filter darüber laufen lassen. Welche Kanäle soll die Zentrale heute Nacht empfangen?
>
> 1. Lasst Ilses Filter laufen und schaut euch die Kanäle an, die er am höchsten einstuft.
> 2. Geht von einer `LinearRegression` auf der gefahrenen Strecke und den Artikeln aus, und findet die Kanäle, die ihren Test-MAE mit dem Split der Zentrale am meisten senken. Speichert ihre Nummern als Liste, `channels`.
> 3. Speichert den Test-MAE von Strecke, Artikeln und euren Kanälen als `mae_best`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.feature_selection import SelectKBest, f_regression
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

telemetry = orders[[f"s{i:02d}" for i in range(1, 41)]]
y = orders["minutes"]

# Ilses Filter: die Kanäle, die für sich allein am besten zu den Minuten passen
selector = SelectKBest(f_regression, k=5).fit(telemetry, y)
print(telemetry.columns[selector.get_support()].tolist())

channels = []     # die Nummern der Kanäle, die die Zentrale heute Nacht empfängt
mae_best = None   # Test-MAE: Straßenstrecke, Artikel und diese Kanäle
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

telemetry = orders[[f"s{i:02d}" for i in range(1, 41)]]
y = orders["minutes"]
blocks = (orders["drop_x"] - orders["pickup_x"]).abs() + (orders["drop_y"] - orders["pickup_y"]).abs()
base = pd.DataFrame({"blocks": blocks, "items": orders["items"]})


def test_mae(X):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=4)
    model = LinearRegression().fit(X_train, y_train)
    return mean_absolute_error(y_test, model.predict(X_test))


maes = {c: test_mae(base.assign(**{c: orders[c]})) for c in telemetry.columns}
best = sorted(maes, key=maes.get)[:2]
print(best, [round(maes[c], 2) for c in best], "channel 9:", round(maes["s09"], 2))
channels = sorted(int(c[1:]) for c in best)
mae_best = test_mae(base.assign(**{c: orders[c] for c in best}))
print(channels, round(mae_best, 2))
```

**Geprüftes Ergebnis** (`_channels_check(channels, mae_best)`):

```json
"tuned"
```

**Zeigt nach dem Lösen:**

> Die Zentrale empfängt die Kanäle **14** (der Akku) und **31** (die Ladung). Ilses Filter stuft Kanal 9 weit oben ein, weil er gut zu den Minuten passt, aber er ist die geplante Routenlänge des Navis: noch einmal die Straßenstrecke, mit Rauschen. Neben der Strecke bringt er nichts, und er würde einen der zwei Plätze belegen. Ein Filter bewertet jede Spalte allein; um zu wissen, was eine Spalte zu den vorhandenen beiträgt, testet sie im Modell, indem ihr sie hinzufügt (Vorwärtsauswahl), wegnehmt oder mit `permutation_importance`.

**Hinweise:**

1. Das Fax an der Konsole der Zentrale sagt, wie viele Kanäle heute Nacht durchkommen, und das Handbuch am Rack sagt, was einige Kanäle messen. Schlagt dort Kanal 9 nach.
2. Geht in einer Schleife durch die 40 Kanäle: Fügt jeden zur Tabelle aus Straßenstrecke und Artikeln hinzu, trainiert und notiert den Test-MAE. Die zwei niedrigsten gewinnen. `SequentialFeatureSelector` macht dasselbe, kann aber auch die Strecke rauswerfen.
3. `base = pd.DataFrame({"blocks": blocks, "items": orders["items"]})`; für jedes `c` in `telemetry.columns` teilt `base.assign(**{c: orders[c]})` mit `test_size=0.25, random_state=4`, trainiert und speichert den MAE in einem Dict; `sorted(maes, key=maes.get)[:2]` gibt `s14` und `s31`. Dann dasselbe mit beiden für `mae_best`.

### 6. Die Versprechen für heute Nacht (Abschluss-Schloss)

**Übt:** Alles zusammen: eine Pipeline mit FunctionTransformer und ColumnTransformer, die rohe Zeilen nimmt, bewertet auf ungesehenen Daten, ohne undichte Spalten, mit begrenzter Auswahl an Merkmalen  
**Braucht:** 1. Das rohe Protokoll (sein Ergebnis), 2. Kuriere können nicht fliegen (sein Ergebnis), 3. Wetter und Fahrzeuge (sein Ergebnis), 4. Zu gut, um wahr zu sein (sein Ergebnis), 5. Vierzig Sensoren (sein Ergebnis), 🔒 5. Vierzig Sensoren, 🔎 Das Fax vom Netzbetreiber  
**Daten:** [orders.py](../../content/rooms/ml-courier/data/orders.py)

**Zahlenschloss** (öffnet mit `143148`):

> Die Konsole der Zentrale verlangt eine sechsstellige PIN. Der Klebezettel der Leitung: „PIN = die Kanäle, die wir heute Nacht empfangen, die kleinere Nummer zuerst, dann wie viele Erstattungen Jonas' Modell gekostet hätte, wenn es ehrlich gewesen wäre.“

**Aufgabe:**

> Die Aufträge gehen ein. `tonight` enthält die ersten acht, mit denselben Spalten wie `orders`, aber ohne `minutes`; was erst die Lieferung verrät, ist noch leer. Die Leitung schaltet ein Modell nur ein, wenn die Zentrale es mit rohen Aufträgen füttern kann, so wie sie eingehen, und wenn es bei alten Aufträgen, die es nie gesehen hat, im Schnitt weniger als 2,4 Minuten danebenliegt. Was verspricht Blitzkurier heute Nacht?
>
> 1. Baut eine Pipeline, die rohe Auftragszeilen nimmt, die Spalten von `tonight`, daraus alles macht, was ihr heute Nacht gelernt habt, und in einem Regressor endet. Ein `FunctionTransformer` führt eure eigene Funktion als Schritt aus. Trainiert sie auf dem Protokoll und behaltet sie als `model`.
> 2. Speichert ihre Versprechen für die acht Aufträge von heute Nacht, in ganzen Minuten, als `promises`.

<details><summary>Startcode</summary>

```python
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, OrdinalEncoder

print(tonight)   # die ersten acht Aufträge von heute Nacht, so wie sie eingehen


def features(df):
    """Rohe Auftragszeilen rein, Merkmale fürs Modell raus."""
    out = pd.DataFrame(index=df.index)
    out["items"] = df["items"]
    return out


model = make_pipeline(FunctionTransformer(features), LinearRegression())
model.fit(orders.drop(columns="minutes"), orders["minutes"])

promises = None   # ein Versprechen pro Auftrag von heute Nacht, in ganzen Minuten
```

</details>

**Musterlösung:**

```python
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, OrdinalEncoder


def features(df):
    """Raw order rows in, model features out."""
    t = pd.to_datetime(df["ordered_at"])
    hour, weekday = t.dt.hour, t.dt.dayofweek
    out = pd.DataFrame(index=df.index)
    out["rush"] = ((hour.between(12, 13) & (weekday < 5)) | hour.between(17, 19)).astype(int)
    out["blocks"] = (df["drop_x"] - df["pickup_x"]).abs() + (df["drop_y"] - df["pickup_y"]).abs()
    for c in ["items", "vehicle", "weather", "s14", "s31"]:
        out[c] = df[c]
    return out


encode = ColumnTransformer([
    ("vehicle", OneHotEncoder(), ["vehicle"]),
    ("weather", OrdinalEncoder(categories=[["dry", "drizzle", "rain", "storm"]]), ["weather"]),
], remainder="passthrough")
model = make_pipeline(FunctionTransformer(features), encode, LinearRegression())
model.fit(orders.drop(columns="minutes"), orders["minutes"])

promises = model.predict(tonight).round()
print(pd.Series(promises, index=tonight.index))
```

**Geprüftes Ergebnis** (`_promises_check(model, promises)`):

```json
"promised"
```

**Zeigt nach dem Lösen:**

> Die Konsole wird um 17:02 grün. Das erste Versprechen geht raus: 40 Minuten für Auftrag 52001, ein Fahrrad im Sturm zur Abendspitze. Bei Aufträgen, die sie nie gesehen hat, liegt eure Pipeline etwa 2,2 Minuten daneben, und sie liest nichts, was die App noch nicht hat.
>
> Jeder Schritt steckt darin: das Rush-Flag aus einer Textspalte, die Straßenstrecke aus vier Koordinaten, der Sturm auf der Skala des Wetterdiensts, die Lecks weggelassen und zwei Kanäle, im Modell ausgewählt. Das Modell selbst ist eine schlichte lineare Regression. Die Arbeit machen seine Merkmale.

**Hinweise:**

1. Geht die anderen Stationen des Raums durch: Jede hat ein Merkmal, eine Kodierung oder eine wegzulassende Spalte gefunden. Das Fax an dieser Konsole sagt, wie viele Kanäle heute Nacht durchkommen.
2. Baut in `features(df)` `rush` aus `ordered_at`, `blocks` aus den Koordinaten und behaltet `items`, `vehicle`, `weather`, `s14` und `s31`. Dann einen `ColumnTransformer` mit `OneHotEncoder()` auf `vehicle`, `OrdinalEncoder` mit der Skala des Diensts auf `weather` und `remainder="passthrough"`.
3. `model = make_pipeline(FunctionTransformer(features), encode, LinearRegression())`, `model.fit(orders.drop(columns="minutes"), orders["minutes"])`, `promises = model.predict(tonight).round()`.

## Hinweise im Raum

### 🔎 Der Schichtplan

*Gebraucht von: 1. Das rohe Protokoll*

> Ein laminiertes Blatt an der Wand der Zentrale, mit Kaffeerändern.
>
> **SCHICHTPLAN, HERBST**
> **Mittagsspitze**, Montag bis Freitag, 12:00 bis 13:59: alle Kuriere auf der Straße.
> **Abendspitze**, jeden Tag, 17:00 bis 19:59: alle Kuriere auf der Straße.
> Alle anderen Stunden: die halbe Flotte, der Rest in Bereitschaft.
>
> Darunter gekritzelt: „Am Wochenende sind die Büros zu, da bestellt keiner Mittagessen an den Schreibtisch. — Ilse“

### 🔎 Der Zettel am Server

*Gebraucht von: 1. Das rohe Protokoll, 2. Kuriere können nicht fliegen, 4. Zu gut, um wahr zu sein, 5. Vierzig Sensoren*

> An den Serverschrank geklebt, in Jonas' Handschrift:
>
> „Jedes Modell wird gleich getestet, damit wir vergleichen können: ein Viertel der Aufträge zurückgehalten, `test_size=0.25`, und `random_state=4`, unsere Depotnummer. Werte auf den Trainingszeilen zählen nicht.“

### 🔎 Der Stadtplan

*Gebraucht von: 2. Kuriere können nicht fliegen*

> Ein riesiger Stadtplan bedeckt die Wand, als Gitter gezeichnet: 31 Straßen laufen von Nord nach Süd, entlang der Unterkante von 0 bis 30 nummeriert (x), und 31 von West nach Ost, an der Seite hoch von 0 bis 30 nummeriert (y). Dazwischen Block um Block aus Häusern, Höfen und Parks. Keine einzige Straße verläuft schräg.
>
> Ein Kurier-Aufkleber in der Ecke: „Kuriere können nicht fliegen.“

### 🔎 Das Plakat des Wetterdiensts

*Gebraucht von: 3. Wetter und Fahrzeuge*

> Ein Plakat des städtischen Wetterdiensts über dem Funkgerät:
>
> **WETTERWARNSTUFEN FÜR DEN STRASSENVERKEHR**
> 0 dry (trocken)
> 1 drizzle (Nieselregen)
> 2 rain (Regen)
> 3 storm (Sturm)
>
> Mit rotem Marker quer darunter: „Sonntag, 15. Nov., ab 16:00: Stufe 3.“

### 🔎 Das Datenwörterbuch

*Gebraucht von: 4. Zu gut, um wahr zu sein*

> Ein zusammengehefteter Ausdruck neben Jonas' Laptop: was jede Spalte des Auftragsprotokolls bedeutet und wann die App sie ausfüllt.
>
> `ordered_at`: wann bestellt wurde. Ausgefüllt bei der Bestellung.
> `pickup_x`, `pickup_y`, `drop_x`, `drop_y`: Restaurant und Haustür im Stadtgitter. Bei der Bestellung.
> `weather`: die Stufe des Wetterdiensts. Bei der Bestellung.
> `vehicle`: der Kurier, den die Zentrale zuteilt. Bei der Bestellung.
> `items`: Gerichte in der Tasche. Bei der Bestellung.
> `kitchen_wait`: Minuten, die der Kurier im Restaurant gewartet hat. Bei der Abholung.
> `gps_pings`: ein Ping pro Minute auf der Straße. Während der Fahrt.
> `rating`: die Sterne der Kundschaft. Nach der Lieferung.
> `s01` bis `s40`: die Telemetrie der Kurierbox. Bei der Bestellung, wenn die Zentrale den Kurier zuteilt.
> `minutes`: von der Bestellung bis zur Tür. An der Tür.

### 🔎 Das Blitzkurier-Plakat

*Gebraucht von: 4. Zu gut, um wahr zu sein*

> Ein knallorangefarbenes Plakat, dasselbe, das in jeder Straßenbahn der Stadt hängt:
>
> **BLITZKURIER. VERSPROCHEN IST VERSPROCHEN.**
> Mehr als 10 Minuten später als versprochen? Dann geht eure Bestellung auf uns.

### 🔎 Das Fax vom Netzbetreiber

*Gebraucht von: 5. Vierzig Sensoren, 6. Die Versprechen für heute Nacht*

> Ein Fax, noch eingerollt, im Fach neben der Konsole der Zentrale:
>
> „An alle Flottenkunden. Marathontag: Das Mobilfunknetz entlang der Strecke ist von 16:00 bis Mitternacht überlastet. Jede Fahrzeugbox kann in dieser Zeit **zwei** Telemetriekanäle an euren Server senden. Bitte teilt uns vor 17:00 mit, welche zwei. — CityNet Betrieb“

### 🔎 Das Handbuch der Kurierbox

*Gebraucht von: 5. Vierzig Sensoren*

> Ein schmieriges Handbuch an einer Kette am Rack, aufgeschlagen bei „Telemetriekanäle“:
>
> `s02` Innentemperatur
> `s09` Navi: geplante Routenlänge
> `s14` Akkuladung
> `s17` Reifendruck
> `s22` Signalstärke
> `s31` Lastsensor
> `s38` sichtbare GPS-Satelliten
> Alle anderen Kanäle: interne Diagnose.

## Handbuch im Raum: 📖 Das Wiki der Zentrale

**Datum und Uhrzeit:** [`pd.to_datetime(s)`](https://pandas.pydata.org/docs/reference/api/pandas.to_datetime.html), [`s.dt.hour  s.dt.dayofweek`](https://pandas.pydata.org/docs/reference/api/pandas.Series.dt.dayofweek.html), [`s.between(a, b)  s.isin([...])`](https://pandas.pydata.org/docs/reference/api/pandas.Series.between.html)

**Distanzen:** [`np.hypot(dx, dy)`](https://numpy.org/doc/stable/reference/generated/numpy.hypot.html), [`s.abs()`](https://pandas.pydata.org/docs/reference/api/pandas.Series.abs.html)

**Kategorien kodieren:** [`OneHotEncoder(handle_unknown=…)`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.OneHotEncoder.html), [`OrdinalEncoder(categories=[[…]])`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.OrdinalEncoder.html), [`ColumnTransformer([(name, transformer, columns), …], remainder=…)`](https://scikit-learn.org/stable/modules/generated/sklearn.compose.ColumnTransformer.html)

**Pipelines:** [`make_pipeline(step, …, model)`](https://scikit-learn.org/stable/modules/generated/sklearn.pipeline.make_pipeline.html), [`FunctionTransformer(func)`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.FunctionTransformer.html)

**Leakage:** [`Data leakage`](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage), [`df.select_dtypes("number")`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.select_dtypes.html)

**Merkmale auswählen:** [`SelectKBest(f_regression, k=…)`](https://scikit-learn.org/stable/modules/generated/sklearn.feature_selection.SelectKBest.html), [`SequentialFeatureSelector(model, n_features_to_select=…)`](https://scikit-learn.org/stable/modules/generated/sklearn.feature_selection.SequentialFeatureSelector.html), [`permutation_importance(model, X, y)`](https://scikit-learn.org/stable/modules/generated/sklearn.inspection.permutation_importance.html), [`df.assign(name=values)`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.assign.html)
