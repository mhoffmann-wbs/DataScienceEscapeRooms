# Zum Ersten: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Freitagnacht bei Vossberg & Töchter, Auktionatoren seit 1896. Um 06:00 beginnt die Druckerei mit dem Katalog für die Auktion alter Uhren am Samstag, und acht Lose haben noch keinen Schätzpreis.
>
> Konrad Albers, der 31 Jahre lang jede Uhr in diesem Haus bewertet hat, ist letzten Monat in Rente gegangen, und seine Preistabelle ist mit seinem Laptop gestorben. Was das Haus noch hat: die Aufzeichnungen über 1.200 Uhren, die in den letzten vier Jahren verkauft wurden, seine Notizen an den Wänden und ein Gerücht, dass einer dieser Verkäufe eine Fälschung war.
>
> Bringt einem Modell bei, was eine Uhr wert ist. Dieser Raum lädt Python mit pandas und scikit-learn, das erste Rätsel, das ihr öffnet, braucht also einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Die Faustregel | Einfache lineare Regression: X als Tabelle mit einer Spalte, fit, coef_ und intercept_ | 🔎 Albers' Millimeterpapier |
| 2 | Die Schätzungen vom letzten Jahr | Regressionsmetriken: MAE, RMSE und R² mit sklearn.metrics, warum sich Fehler nicht aufheben dürfen, eine Mittelwert-Baseline | 🔎 Ilse Vossbergs Notiz |
| 3 | Der lange Schwanz | Eine rechtsschiefe Zielvariable: auf np.log trainieren, mit np.exp zurückrechnen, MAE auf einem Testsplit, Log-Koeffizienten als Prozent lesen | 🔎 Das Histogramm an der Wand, 🔎 Die Hausregel für Bewertungen |
| 4 | Das Uhrwerk | Multiple Regression: One-Hot-Encoding mit pd.get_dummies, Koeffizienten bei sonst gleichen Merkmalen lesen, Verzerrung durch fehlende Variablen | 3. Der lange Schwanz (sein Ergebnis), 🔒 1. Die Faustregel, 🔎 Die Karte in der Vitrine |
| 5 | Das verdächtige Los | Residuen: den Fall finden, den ein Modell am schlechtesten erklärt, warum Residuen in Euro teure Stücke hervorheben und Log-Residuen nicht | 3. Der lange Schwanz (sein Ergebnis), 🔒 2. Die Schätzungen vom letzten Jahr, 🔎 Die Abendzeitung |
| 6 | Der Katalog (Abschluss-Schloss) | Alles zusammen: eine Log-Zielvariable, One-Hot-Encoding, ein quadriertes Feature mit PolynomialFeatures, gefunden über Residuen, dieselben Spalten für neue Daten, Vorhersagen zurück in Euro | 5. Das verdächtige Los (sein Ergebnis), 4. Das Uhrwerk (sein Ergebnis), 3. Der lange Schwanz (sein Ergebnis), 🔒 5. Das verdächtige Los, 🔎 Der Brief des Versicherers, 🔎 Die Notiz des Uhrmachers |

## Stationen

### 1. Die Faustregel

**Übt:** Einfache lineare Regression: X als Tabelle mit einer Spalte, fit, coef_ und intercept_  
**Braucht:** 🔎 Albers' Millimeterpapier  
**Daten:** [sales.py](../../content/rooms/ml-auction/data/sales.py)

**Aufgabe:**

> Albers' erste Faustregel hängt noch über seinem Schreibtisch, ihre Zahl verwischt. Wie viele Euro hat er für einen Zustandsgrad aufgeschlagen?
>
> Die Verkäufe der letzten vier Jahre sind als `sales` geladen, eine Zeile pro verkaufter Uhr, indiziert nach Losnummer: ihr Alter in Jahren, die Klasse des Herstellers (1 = namenlos, 5 = die großen Häuser), der Gehäusedurchmesser in mm, der Zustandsgrad (1 = abgenutzt, 5 = wie neu), ob Box und Papiere dabei waren (`box_papers`), das Uhrwerk und der Zuschlagspreis in Euro (`price`).
>
> 1. Legt eine Gerade durch alle Verkäufe: `price` gegen `condition`.
> 2. Gebt ein, wie viele Euro ein Zustandsgrad hinzufügt, auf ganze Euro gerundet.

<details><summary>Startcode</summary>

```python
from sklearn.linear_model import LinearRegression

# sales ist geladen: 1.200 Uhren, verkauft in den letzten vier Jahren, indiziert nach Losnummer.
print(sales.head())

model = LinearRegression().fit(sales["condition"], sales["price"])
print(model.coef_, model.intercept_)
```

</details>

**Musterlösung:**

```python
from sklearn.linear_model import LinearRegression

model = LinearRegression().fit(sales[["condition"]], sales["price"])
print(model.coef_[0], model.intercept_)
print(round(model.coef_[0]))
```

**Antwort:** `274`

**Zeigt nach dem Lösen:**

> **274 € pro Grad.** Albers' Gerade beginnt bei 800 € (bei einem Grad 0, den keine Uhr hat) und steigt mit jedem Grad um 274 €.
>
> scikit-learn will immer eine Tabelle von Features, auch mit nur einer Spalte: `sales[["condition"]]` (ein DataFrame) statt `sales["condition"]` (eine Series). Die trainierte Gerade ist dann `intercept_ + coef_ × Grad`.
>
> Eine Gerade für jede Uhr allerdings: 274 € sind ein Vermögen für eine Quarzuhr für 300 € und nichts für eine Antiquität für 20.000 €.

**Hinweise:**

1. Führt den Startcode aus und lest den Fehler: scikit-learn hat ein 2D-Array erwartet. Welche Form hat `sales["condition"]`?
2. Doppelte Klammern wählen einen DataFrame mit einer Spalte: `sales[["condition"]]`. Die Zielvariable bleibt eine Series.
3. `model = LinearRegression().fit(sales[["condition"]], sales["price"])`; `model.coef_[0]` sind die Euro pro Grad.

### 2. Die Schätzungen vom letzten Jahr

**Übt:** Regressionsmetriken: MAE, RMSE und R² mit sklearn.metrics, warum sich Fehler nicht aufheben dürfen, eine Mittelwert-Baseline  
**Braucht:** 🔎 Ilse Vossbergs Notiz  
**Daten:** [sales.py](../../content/rooms/ml-auction/data/sales.py)

**Aufgabe:**

> Bevor das Haus Albers' Methoden übernimmt, will Ilse Vossberg wissen, ob sie etwas taugten: Haben seine Schätzungen ein billiges Raten geschlagen? Auf dem Tisch mit dem Kassenbuch liegt der Auktionsbogen vom letzten Herbst: für jedes seiner 120 Lose Albers' gedruckte Schätzung und der Zuschlagspreis, geladen als `last_sale`.
>
> 1. Messt, wie weit seine Schätzungen von den Zuschlagspreisen entfernt waren: Speichert `mae`, `rmse` und `r2`.
> 2. Speichert als `baseline_mae`, wie weit der billigste Gutachter der Stadt danebengelegen hätte.
> 3. Euer Urteil: Taugten Albers' Schätzungen etwas? Speichert `good` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

print(last_sale.head())   # die 120 Lose vom letzten Herbst
hammer = last_sale["hammer"]       # wofür die Uhr verkauft wurde
estimate = last_sale["estimate"]   # was Albers im Katalog gedruckt hat

mae = (hammer - estimate).mean()
print(f"Albers lag im Schnitt {mae:.0f} € pro Los daneben")

rmse = None
r2 = None
baseline_mae = None   # der billigste Gutachter der Stadt
good = None           # True oder False
```

</details>

**Musterlösung:**

```python
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

hammer = last_sale["hammer"]
estimate = last_sale["estimate"]

mae = mean_absolute_error(hammer, estimate)
rmse = mean_squared_error(hammer, estimate) ** 0.5
r2 = r2_score(hammer, estimate)
baseline_mae = mean_absolute_error(hammer, [hammer.mean()] * len(hammer))
good = bool(mae < baseline_mae)
print(round(mae, 1), round(rmse, 1), round(r2, 3), round(baseline_mae, 1))
```

**Geprüftes Ergebnis** (`_estimates_check(mae, rmse, r2, baseline_mae, good)`):

```json
"appraised"
```

**Zeigt nach dem Lösen:**

> Albers lag im Schnitt **256 €** pro Los daneben (MAE), nicht 34 €: Im Startcode haben sich Fehler nach oben und unten aufgehoben. Sein RMSE ist 436 €: Erst zu quadrieren lässt einige große Fehler schwerer wiegen, also liegt der RMSE nie unter dem MAE. Sein R² ist 0,90.
>
> Für jedes Los den mittleren Zuschlagspreis vom letzten Herbst (1.459 €) zu raten, liegt um 952 € daneben. Diese Schätzung ist die Baseline, die jedes Modell schlagen muss, und ihr R² ist per Definition 0: R² sagt, welchen Anteil der quadrierten Fehler der Baseline ein Modell beseitigt. Albers hat sein Honorar verdient.

**Hinweise:**

1. Ilses Notiz sagt, wie sie einen Gutachter misst und wer der billigste der Stadt ist. Positive und negative Fehler heben sich in `(hammer - estimate).mean()` auf. Der MAE mittelt ihre Beträge: `mean_absolute_error(hammer, estimate)`.
2. Der RMSE ist die Wurzel aus `mean_squared_error(hammer, estimate)`. `r2_score` nimmt die Wahrheit zuerst: `r2_score(hammer, estimate)`.
3. Der billigste Gutachter rät für jedes Los `hammer.mean()`: `baseline_mae = mean_absolute_error(hammer, [hammer.mean()] * len(hammer))` (952 €). Albers lag weit weniger daneben, also ist `good = mae < baseline_mae` gleich `True`.

### 3. Der lange Schwanz

**Übt:** Eine rechtsschiefe Zielvariable: auf np.log trainieren, mit np.exp zurückrechnen, MAE auf einem Testsplit, Log-Koeffizienten als Prozent lesen  
**Braucht:** 🔎 Das Histogramm an der Wand, 🔎 Die Hausregel für Bewertungen  
**Daten:** [sales.py](../../content/rooms/ml-auction/data/sales.py)

**Aufgabe:**

> An der Wand des Auktionssaals hängt ein Balkendiagramm aller Zuschlagspreise. Soll das Modell des Hauses den Preis vorhersagen oder den Log des Preises?
>
> 1. Teilt die Verkäufe in einen Trainings- und einen Testteil.
> 2. Trainiert `LinearRegression` zweimal auf den Zahlenspalten: einmal auf den Preis, einmal auf den Log des Preises. Bewertet beide auf dem Testteil, in Euro, als `mae_linear` und `mae_log`.
> 3. Wie viel fügt im Log-Modell ein Zustandsgrad zum Preis hinzu? Speichert es in Prozent als `percent`.
> 4. Liegt das Log-Modell bei den Testlosen weniger daneben? Speichert `log_better` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from helpers import show_hist

show_hist(sales["price"], bins=40, title="Zuschlagspreise")

X = sales[["age", "maker_tier", "case_mm", "condition", "box_papers"]]   # die Zahlenspalten
y = sales["price"]
X_train, X_test, y_train, y_test = train_test_split(X, y)   # Trainings- und Testteil

linear = LinearRegression().fit(X_train, y_train)
mae_linear = mean_absolute_error(y_test, linear.predict(X_test))
print("linear:", round(mae_linear), "€")

mae_log = None   # dasselbe Modell, trainiert auf np.log(y_train), bewertet in Euro
percent = None   # was ein Zustandsgrad im Log-Modell hinzufügt, in Prozent
log_better = None   # True oder False
```

</details>

**Musterlösung:**

```python
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from helpers import show_hist

show_hist(sales["price"], bins=40, title="Hammer prices")
X = sales[["age", "maker_tier", "case_mm", "condition", "box_papers"]]
y = sales["price"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=6)

linear = LinearRegression().fit(X_train, y_train)
mae_linear = mean_absolute_error(y_test, linear.predict(X_test))

log_model = LinearRegression().fit(X_train, np.log(y_train))
mae_log = mean_absolute_error(y_test, np.exp(log_model.predict(X_test)))
percent = (np.exp(log_model.coef_[3]) - 1) * 100
log_better = bool(mae_log < mae_linear)
print(round(mae_linear), round(mae_log), round(percent, 1))
```

**Geprüftes Ergebnis** (`_tail_check(mae_linear, mae_log, percent, log_better)`):

```json
"tamed"
```

**Zeigt nach dem Lösen:**

> Auf dem Log des Preises liegt das Modell bei den Testlosen um **717 €** daneben statt um 971 €. In Euro ziehen die wenigen teuren Uhren jeden Koeffizienten zu sich, und die Gerade sagt für 23 billige Testlose sogar negative Preise voraus.
>
> Auf der Log-Skala vervielfacht jedes Feature den Preis, statt Euro zu addieren: **Ein Zustandsgrad fügt 16 % hinzu**, einer Quarzuhr für 300 € genauso wie einer Antiquität für 20.000 €. Ein Log-Koeffizient `b` liest sich als `np.exp(b) - 1`; für kleine `b` liegt das nahe bei `b` selbst. Vorhersagen kommen mit `np.exp` zurück in Euro.

**Hinweise:**

1. Die Notiz unter dem Diagramm sagt, wie Bieter für einen besseren Grad zahlen. Die Hausregel für Bewertungen nennt den Split: `train_test_split(X, y, test_size=0.2, random_state=6)`. Dann `log_model = LinearRegression().fit(X_train, np.log(y_train))`.
2. Das Log-Modell sagt Log-Euro vorher. `np.exp(log_model.predict(X_test))` macht wieder Euro daraus; vergleicht diese mit `y_test`.
3. `condition` ist die vierte Spalte, ihr Koeffizient also `log_model.coef_[3]`; `percent = (np.exp(log_model.coef_[3]) - 1) * 100`. Das Log-Modell liegt um 717 € statt 971 € daneben: `log_better = mae_log < mae_linear` ist `True`.

### 4. Das Uhrwerk

**Übt:** Multiple Regression: One-Hot-Encoding mit pd.get_dummies, Koeffizienten bei sonst gleichen Merkmalen lesen, Verzerrung durch fehlende Variablen  
**Braucht:** 3. Der lange Schwanz (sein Ergebnis), 🔒 1. Die Faustregel, 🔎 Die Karte in der Vitrine  
**Daten:** [sales.py](../../content/rooms/ml-auction/data/sales.py)

**Zahlenschloss** (öffnet mit `274`):

> Die Vitrine hat ein dreistelliges Zahlenschloss. Daran hängt ein Messingschild: „Kombination = Albers' Faustregel, in Euro pro Zustandsgrad.“

**Aufgabe:**

> Die Vitrine am Fenster enthält die Lehrsammlung des Hauses: eine Automatikuhr, eine mit Handaufzug und eine Quarzuhr, jede mit Box und Papieren. Albers hat den Einlieferern immer gesagt, Box und Papiere bringen ein Drittel mehr. Ilse bezweifelt das. Was bringen Box und Papiere wirklich?
>
> 1. Trainiert das Log-Modell auf allen Verkäufen mit jeder Spalte, das Uhrwerk eingeschlossen. `LinearRegression` kann keine Wörter lesen: Kodiert das Uhrwerk.
> 2. Speichert, was Box und Papiere zum Preis hinzufügen, in Prozent, als `box_percent`.
> 3. Trainiert dasselbe Modell ohne das Uhrwerk und speichert, was Box und Papiere dort scheinbar hinzufügen, in Prozent, als `without_percent`.

<details><summary>Startcode</summary>

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

X = sales.drop(columns="price")   # jede Spalte, das Uhrwerk eingeschlossen
y = sales["price"]                # die Zielvariable

model = LinearRegression().fit(X, y)
print(pd.Series(model.coef_, index=X.columns).round(3))

box_percent = None   # was Box und Papiere zum Preis hinzufügen, in Prozent
without_percent = None   # dasselbe in einem Modell ohne das Uhrwerk
```

</details>

**Musterlösung:**

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

X = pd.get_dummies(sales.drop(columns="price"), dtype=int)
y = np.log(sales["price"])
model = LinearRegression().fit(X, y)
coefs = pd.Series(model.coef_, index=X.columns)
print(((np.exp(coefs) - 1) * 100).round(1))
box_percent = (np.exp(coefs["box_papers"]) - 1) * 100

numeric = X.drop(columns=["movement_automatic", "movement_manual", "movement_quartz"])
without = LinearRegression().fit(numeric, y)
without_percent = (np.exp(pd.Series(without.coef_, index=numeric.columns)["box_papers"]) - 1) * 100
print("without the movement:", round(without_percent, 1))
```

**Geprüftes Ergebnis** (`_movement_check(box_percent, without_percent)`):

```json
"wound"
```

**Zeigt nach dem Lösen:**

> Mit dem Uhrwerk im Modell fügen Box und Papiere **14 %** hinzu, nicht die 37 %, die ein Modell ohne Uhrwerk behauptet, und nicht Albers' Drittel. Papiere überleben öfter bei Automatikuhren, und Automatikuhren bringen weit mehr als Quarzuhren: Ohne das Uhrwerk im Modell wurde seine Wirkung den Papieren zugeschrieben. Das ist ein Omitted-Variable-Bias, eine Verzerrung durch eine fehlende Variable.
>
> `pd.get_dummies` macht aus der Wortspalte eine 0/1-Spalte pro Wort. Mit einem Achsenabschnitt ist eine davon überflüssig, und `drop_first=True` lässt sie weg; die übrigen Koeffizienten bleiben in beiden Fällen gleich. Quarz kostet bei sonst gleichen Merkmalen 45 % weniger als eine Automatikuhr.

**Hinweise:**

1. Die Karte in der Vitrine sagt, wie sich die drei Uhrwerke unterscheiden. Der Fehler sagt, dass er `'automatic'` nicht in eine Zahl umwandeln kann. `pd.get_dummies(X, dtype=int)` ersetzt die Spalte movement durch eine 0/1-Spalte pro Art. Und die Zielvariable sollte `np.log(y)` sein, wie beim langen Schwanz.
2. `coefs = pd.Series(model.coef_, index=X.columns)` benennt die Koeffizienten. Ein Log-Koeffizient `b` fügt `(np.exp(b) - 1) * 100` Prozent hinzu.
3. `X = pd.get_dummies(sales.drop(columns="price"), dtype=int)`, `model = LinearRegression().fit(X, np.log(y))`, dann `box_percent = (np.exp(coefs["box_papers"]) - 1) * 100`. Für `without_percent` trainiert ohne die drei Uhrwerk-Spalten und rechnet genauso.

### 5. Das verdächtige Los

**Übt:** Residuen: den Fall finden, den ein Modell am schlechtesten erklärt, warum Residuen in Euro teure Stücke hervorheben und Log-Residuen nicht  
**Braucht:** 3. Der lange Schwanz (sein Ergebnis), 🔒 2. Die Schätzungen vom letzten Jahr, 🔎 Die Abendzeitung  
**Daten:** [sales.py](../../content/rooms/ml-auction/data/sales.py)

**Zahlenschloss** (öffnet mit `256`):

> Die Schublade der Uhrmacherbank, in der die Prüfakten liegen, hat ein dreistelliges Schloss. Eine Notiz mit dem Bleistift der Werkstatt: „Code = um wie viele Euro Albers im letzten Herbst pro Los danebenlag, im Mittel (MAE), in ganzen Euro.“

**Aufgabe:**

> Welcher der Verkäufe war die gefälschte Uhr? Die Werkstatt hat jede Uhr nachgeprüft, die das Haus verkauft hat, also hält `sales` fest, was jede Uhr wirklich ist, nicht was die Bieter glaubten. Irgendwo darin steckt ein Verkauf, den seine Merkmale nicht erklären können.
>
> 1. Trainiert ein Modell des Preises auf den Merkmalen der Uhren und berechnet das Residuum jedes Verkaufs.
> 2. Findet den Verkauf, der am weitesten über dem liegt, was seine Merkmale rechtfertigen. Speichert seine Losnummer als `lot`.

<details><summary>Startcode</summary>

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from helpers import show_scatter

X = sales[["age", "maker_tier", "case_mm", "condition", "box_papers"]]
y = sales["price"]
model = LinearRegression().fit(X, y)

residuals = y - model.predict(X)   # wie weit jeder Verkauf über seiner Vorhersage liegt
print(residuals.sort_values(ascending=False).head(3))
show_scatter(model.predict(X), residuals, xlabel="vorhergesagt", ylabel="Residuum", title="Residuen")

lot = None   # die Losnummer der Fälschung
```

</details>

**Musterlösung:**

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from helpers import show_scatter

X = pd.get_dummies(sales.drop(columns="price"), dtype=int)
y = np.log(sales["price"])
model = LinearRegression().fit(X, y)

residuals = y - model.predict(X)
print(residuals.sort_values(ascending=False).head(3).round(2))
show_scatter(model.predict(X), residuals, xlabel="predicted (log)", ylabel="residual (log)", title="Residuals")
lot = residuals.idxmax()
print(sales.loc[lot])
```

**Geprüftes Ergebnis** (`_forgery_check(lot)`):

```json
"forged"
```

**Zeigt nach dem Lösen:**

> **Los 1964**: eine 14 Jahre alte Quarzuhr eines namenlosen Herstellers, Grad 2, ohne Papiere. Ihre Merkmale sagen etwa 170 €; sie ging für 8.400 € weg, das 50-Fache. In Log-Werten ist ihr Residuum 3,9; kein anderer Verkauf liegt um mehr als 1,1 daneben, einen Faktor 3.
>
> In Euro waren die größten Residuen echte Uhren: die Lose 1467, 2066 und 1913, Antiquitäten der großen Häuser, bei denen 10 % Abweichung Tausende Euro sind. Auf der Log-Skala ist jedes Residuum ein Verhältnis, also fällt die billige Fälschung auf. Das Haus erstattet dem Käufer den Preis, und Los 1964 hat im Modell für den Katalog nichts verloren.

**Hinweise:**

1. Die Abendzeitung auf dem Couchtisch beschreibt die Fälschung. Die drei Spitzenreiter des Startcodes sind teure Antiquitäten der großen Häuser: In Euro ist ein kleiner Anteil eines großen Preises ein großes Residuum. Welche Zielvariable hat der lange Schwanz empfohlen?
2. Trainiert auf `np.log(y)` und nehmt `residuals = np.log(y) - model.predict(X)`. Das Uhrwerk hilft auch: `pd.get_dummies(sales.drop(columns="price"), dtype=int)`.
3. `lot = residuals.idxmax()` ist das Index-Label, die Losnummer, des größten Residuums.

### 6. Der Katalog (Abschluss-Schloss)

**Übt:** Alles zusammen: eine Log-Zielvariable, One-Hot-Encoding, ein quadriertes Feature mit PolynomialFeatures, gefunden über Residuen, dieselben Spalten für neue Daten, Vorhersagen zurück in Euro  
**Braucht:** 5. Das verdächtige Los (sein Ergebnis), 4. Das Uhrwerk (sein Ergebnis), 3. Der lange Schwanz (sein Ergebnis), 🔒 5. Das verdächtige Los, 🔎 Der Brief des Versicherers, 🔎 Die Notiz des Uhrmachers  
**Daten:** [sales.py](../../content/rooms/ml-auction/data/sales.py)

**Zahlenschloss** (öffnet mit `196414`):

> Die Druckmaschine ist mit einer sechsstelligen PIN gesperrt. Ilses Notiz auf der Abdeckung: „PIN = die Nummer des gefälschten Loses, dann was Box und Papiere wirklich hinzufügen, in ganzen Prozent.“

**Aufgabe:**

> Der Probedruck des Katalogs für Samstag liegt auf der Druckmaschine, mit acht leeren Feldern für Schätzpreise. `catalogue` enthält die acht Lose, indiziert nach Losnummer, mit denselben Spalten wie `sales`, in der Reihenfolge der Druckerei. Die Maschine läuft um 06:00 an. Was ist jedes Los wert?
>
> 1. Baut das Bewertungsmodell des Hauses aus allem, was ihr heute Nacht gelernt habt. Bevor ihr ihm traut, zeichnet seine Residuen gegen das Alter.
> 2. Speichert für jedes Los eine Schätzung in Euro als `estimates`: eine Liste in der Reihenfolge des Katalogs oder eine Series, indiziert nach Losnummer.

<details><summary>Startcode</summary>

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from helpers import show_scatter

print(catalogue)   # die acht Lose vom Samstag, indiziert nach Losnummer

X = pd.get_dummies(sales.drop(columns="price"), dtype=int)
y = np.log(sales["price"])
model = LinearRegression().fit(X, y)

# show_scatter(sales["age"], y - model.predict(X), xlabel="Alter", ylabel="Residuum (log)", title="Residuen nach Alter")

estimates = None   # eine Schätzung in Euro pro Katalog-Los
```

</details>

**Musterlösung:**

```python
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from helpers import show_scatter


def features(df):
    X = pd.get_dummies(df, dtype=int)
    X["age2"] = X["age"] ** 2
    return X


genuine = sales.drop(1964)
X = features(genuine.drop(columns="price"))
y = np.log(genuine["price"])
model = LinearRegression().fit(X, y)
show_scatter(genuine["age"], y - model.predict(X), xlabel="age", ylabel="residual (log)", title="Residuals by age")

C = features(catalogue)[X.columns]
estimates = pd.Series(np.exp(model.predict(C)), index=catalogue.index).round(-1)
print(estimates)
```

**Geprüftes Ergebnis** (`_catalogue_check(estimates)`):

```json
"printed"
```

**Zeigt nach dem Lösen:**

> Das Fax des Versicherers kommt um 05:41 zurück: alle acht Schätzungen angenommen. Das fast neue Los 2201 steht mit etwa 4.600 € im Katalog, das 88 Jahre alte Los 2202 mit etwa 4.000 € und das Quarz-Los 2203 mit etwa 400 €.
>
> Die Residuen haben gezeigt, was die Gerade im Alter verpasst hat: Junge Uhren und Antiquitäten bringen beide mehr als die 30- bis 40-jährigen dazwischen. Ein quadriertes Alter lässt ein lineares Modell sich biegen, und es bleibt lineare Regression, linear in seinen Koeffizienten. Die Maschine läuft um sechs an. Albers' Millimeterpapier kommt in einen Rahmen neben der Standuhr: eine Gerade für jede Uhr, 31 Jahre lang.

**Hinweise:**

1. Die Notiz des Uhrmachers an der Standuhr und der Brief des Versicherers sind hier beide wichtig. Nehmt den Plot wieder rein: Die Residuen bilden über dem Alter ein U, zu niedrig für junge und alte Uhren. Nehmt das Alter zum Quadrat als Spalte dazu: `X["age2"] = X["age"] ** 2` oder `PolynomialFeatures(2)` auf `X[["age"]]`. Lasst das gefälschte Los weg: `sales.drop(1964)`.
2. Der Katalog braucht dieselben Spalten in derselben Reihenfolge: `C = pd.get_dummies(catalogue, dtype=int)`, `age2` genauso dazunehmen, dann `C = C[X.columns]`.
3. Das Modell sagt Log-Euro vorher: `estimates = pd.Series(np.exp(model.predict(C)), index=catalogue.index)`.

## Hinweise im Raum

### 🔎 Albers' Millimeterpapier

*Gebraucht von: 1. Die Faustregel*

> Ein vergilbtes Blatt Millimeterpapier in einem Klemmrahmen. Unten entlang: **Zustandsgrad 1 2 3 4 5**. An der Seite hoch: **Zuschlagspreis, €**. Ein Dutzend Bleistiftkreuze und eine Gerade, mit dem Lineal hindurchgezogen.
>
> Neben der Geraden: „+ ▒▒▒ € pro Grad“. Die Zahl ist von einem Daumen verwischt.
>
> Unten, mit Tinte: „Eine Gerade für jede Uhr. — K. A., 1995“

### 🔎 Ilse Vossbergs Notiz

*Gebraucht von: 2. Die Schätzungen vom letzten Jahr*

> Auf dem Briefpapier des Hauses, mit grüner Tinte:
>
> „Ein Gutachter verdient sein Honorar nur, wenn er den billigsten Gutachter der Stadt schlägt: den, der **den mittleren Zuschlagspreis der Auktion** unter jedes Los schreibt und nach Hause geht. Messt beide daran, wie weit sie danebenliegen, in Euro, und lasst keinen Fehler nach oben einen Fehler nach unten aufheben.
>
> Und schaut euch die großen Fehler gesondert an. Eine schlechte Schätzung kostet uns einen Einlieferer. — I. V.“

### 🔎 Das Histogramm an der Wand

*Gebraucht von: 3. Der lange Schwanz*

> Ein Balkendiagramm an der Wand: die Zuschlagspreise von vier Jahren. Drei Viertel der Uhren gingen unter 2.000 € weg, in einem hohen Buckel von Balken links. Nach rechts läuft ein dünner Schwanz bis über 25.000 € aus, hier und da ein einzelner Balken.
>
> Darunter, in der Handschrift von Albers' Assistentin: „Niemand zahlt für einen besseren Grad einen festen Betrag. Man zahlt **einen Anteil mehr**, bei einer billigen Uhr wie bei einer teuren. — F.“

### 🔎 Die Hausregel für Bewertungen

*Gebraucht von: 3. Der lange Schwanz*

> VOSSBERG & TÖCHTER · Regel 4, Bewertungen
>
> Ein Bewertungsmodell wird an Losen gemessen, die es nicht gesehen hat. Haltet ein Fünftel der Verkäufe als Testteil zurück (**test_size=0.2**), mit **random_state=6**, der Stunde, zu der die Druckerei anfängt, damit alle denselben Split bekommen.

### 🔎 Die Karte in der Vitrine

*Gebraucht von: 4. Das Uhrwerk*

> DIE LEHRSAMMLUNG DES HAUSES · drei Uhrwerke
>
> **automatic**: aufgezogen vom Schwung des Handgelenks. Liebling der Sammler.
> **manual**: jeden Morgen von Hand aufgezogen. Die älteste Art; bei sonst gleichen Merkmalen etwas teurer als eine Automatikuhr.
> **quartz**: eine Batterie und ein Kristall, seit 1969 gebaut. Genau, billig und bei Auktionen am wenigsten gefragt.
>
> Werkstattnotiz unten: „Die meisten Automatikuhren kommen mit Box und Papieren zu uns. Die meisten Quarzuhren kommen in einer Plastiktüte.“

### 🔎 Die Abendzeitung

*Gebraucht von: 5. Das verdächtige Los*

> KLEEBERGER ABENDBLATT
>
> **Gefälschte Uhr bei Vossbergs Frühjahrsauktion verkauft**
>
> Ein Bieter zahlte Tausende für eine Uhr, die sich als billiges Quarzwerk in falschem Gehäuse und Zifferblatt herausstellte. „Auf dem Papier sah sie nach nichts Besonderem aus“, sagte ein Händler. „Ihr Preis war das Einzige an ihr, das keinen Sinn ergab.“

### 🔎 Der Brief des Versicherers

*Gebraucht von: 6. Der Katalog*

> HALLBERG KUNSTVERSICHERUNG
>
> Sehr geehrte Frau Vossberg, wie jede Saison prüfen wir die Schätzungen in Ihrem Katalog vor der Auktion gegen unser eigenes Bewertungsmodell. Wir akzeptieren eine Schätzung, die **innerhalb von 10 %** unserer Bewertung liegt. Weiter entfernte Schätzungen können wir nicht versichern, und das Los wird zurückgezogen.
>
> Unser Modell beruht auf den Zuschlagspreisen Ihrer früheren Verkäufe, wie Ihre Werkstatt sie festgehalten hat, **Fälschungen ausgenommen**.

### 🔎 Die Notiz des Uhrmachers

*Gebraucht von: 6. Der Katalog*

> An die Standuhr geklebt, mit dem Bleistift der Werkstatt:
>
> „Ilse, für den Katalog: Bewerte das Alter nicht als Gerade. Die **jungen** verkaufen sich über die Mode, die **Antiquitäten** über die Seltenheit. Die dazwischen will keiner, die Dreißig- und Vierzigjährigen. — Tomasz“

## Handbuch im Raum: 📖 Der Bewertungsordner des Hauses

**Eine Gerade anpassen:** [`LinearRegression()`](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LinearRegression.html), [`model.fit(X, y)  model.predict(X)`](https://scikit-learn.org/stable/getting_started.html#fitting-and-predicting-estimator-basics), [`pd.Series(model.coef_, index=X.columns)`](https://pandas.pydata.org/docs/reference/api/pandas.Series.html), [`train_test_split(X, y, test_size=, random_state=)`](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.train_test_split.html)

**Fehler messen:** [`mean_absolute_error(y_true, y_pred)`](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.mean_absolute_error.html), [`mean_squared_error(y_true, y_pred) ** 0.5`](https://scikit-learn.org/stable/modules/model_evaluation.html#mean-squared-error), [`r2_score(y_true, y_pred)`](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.r2_score.html), [`baseline`](https://scikit-learn.org/stable/modules/generated/sklearn.dummy.DummyRegressor.html)

**Lange Schwänze und Logarithmen:** [`show_hist(series, bins=, title=)`](https://numpy.org/doc/stable/reference/generated/numpy.histogram.html), [`np.log(y)  np.exp(pred)`](https://numpy.org/doc/stable/reference/generated/numpy.log.html), [`np.exp(b) - 1`](https://numpy.org/doc/stable/reference/generated/numpy.exp.html)

**Wörter als Features:** [`pd.get_dummies(df, dtype=int, drop_first=False)`](https://pandas.pydata.org/docs/reference/api/pandas.get_dummies.html), [`all else equal`](https://scikit-learn.org/stable/auto_examples/inspection/plot_linear_model_coefficient_interpretation.html), [`new_df[X.columns]`](https://pandas.pydata.org/docs/user_guide/indexing.html#basics)

**Residuen und Kurven:** [`y - model.predict(X)`](https://scikit-learn.org/stable/modules/linear_model.html#ordinary-least-squares), [`s.idxmax()  s.sort_values(ascending=False)`](https://pandas.pydata.org/docs/reference/api/pandas.Series.idxmax.html), [`show_scatter(x, y, xlabel=, ylabel=, title=)`](https://matplotlib.org/stable/api/_as_gen/matplotlib.pyplot.scatter.html), [`PolynomialFeatures(2).fit_transform(df[["x"]])`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.PolynomialFeatures.html)
