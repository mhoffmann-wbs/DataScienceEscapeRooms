# Pier 9: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Nachtschicht im Zollamt an Pier 9, Hafen Kleeberg. Um 04:30 legt die MV Kestrel mit 40 Containern an, um 07:00 legt sie wieder ab.
>
> Der XR-90-Scanner, der sie früher ausgesucht hat, ist um Mitternacht abgestürzt und startet nicht mehr. Was das Amt noch hat: das Protokoll von 3.000 Kontrollen aus den letzten zwei Jahren, jede mit ihren Messwerten und dem, was drin war, und die Notizen der Leute, die diesen Job vorher gemacht haben.
>
> Bringt einem Modell bei, die Schmuggler vom Rest zu unterscheiden. Dieser Raum lädt Python mit pandas und scikit-learn, das erste Rätsel, das ihr öffnet, braucht also einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Die Regelkarte der Inspektorin | Entscheidungsbäume: Features und Zielvariable, max_depth, Schwellen mit export_text lesen, warum die Zielvariable kein Feature sein darf | 🔎 Hannes Regelkarte |
| 2 | Das stolze Dashboard | Das Genauigkeitsparadox bei einer seltenen Klasse: Konfusionsmatrix, Precision und Recall, classification_report | 🔎 Das XR-90-Poster |
| 3 | Die Nachbarn | k-nächste Nachbarn: Skalieren in einer Pipeline, GridSearchCV über n_neighbors mit Kreuzvalidierung, eine Metrik (F1) für eine seltene Klasse wählen | 🔎 Jonas' Zettel am Terminal, 🔎 Die Prüfregel der Hafenmeisterin |
| 4 | Der wuchernde Baum | Overfitting: Train/Test-Split mit stratify, Trainings- gegen Testgenauigkeit über max_depth, eine Tiefe wählen | 1. Die Regelkarte der Inspektorin (sein Ergebnis), 🔒 1. Die Regelkarte der Inspektorin, 🔎 Die Prüfregel der Hafenmeisterin |
| 5 | Die Quotentafel | Logistische Regression: Koeffizienten auf standardisierten Features, predict_proba, die Entscheidungsschwelle verschieben, um Precision gegen Recall zu tauschen | 🔒 2. Das stolze Dashboard, 🔎 Die Anordnung des Chefs, 🔎 Die Prüfregel der Hafenmeisterin |
| 6 | Das Kranpult (Abschluss-Schloss) | Alles zusammen: einen Klassifikator wählen und trainieren, dieselben Spalten in derselben Reihenfolge für neue Daten, Fälle nach vorhergesagter Wahrscheinlichkeit ordnen | 4. Der wuchernde Baum (sein Ergebnis), 3. Die Nachbarn (sein Ergebnis), 5. Die Quotentafel (sein Ergebnis), 🔒 5. Die Quotentafel, 🔎 Der Kranplan für heute Nacht |

## Stationen

### 1. Die Regelkarte der Inspektorin

**Übt:** Entscheidungsbäume: Features und Zielvariable, max_depth, Schwellen mit export_text lesen, warum die Zielvariable kein Feature sein darf  
**Braucht:** 🔎 Hannes Regelkarte  
**Daten:** [inspections.py](../../content/rooms/ml-customs/data/inspections.py)

**Aufgabe:**

> Hanne Lindqvist hat dreißig Jahre lang Container an Pier 9 kontrolliert und nach einer selbst gezeichneten Regelkarte entschieden: drei Fragen, eine nach der anderen. Die Karte hängt noch über ihrem alten Schreibtisch, aber jemand hat die Zahlen weggerieben.
>
> Die Kontrollen der letzten zwei Jahre sind als `inspections` geladen, eine Zeile pro geöffnetem Container: wie viel schwerer er war als angemeldet (`weight_gap_pct`), der angemeldete Wert pro kg in Euro, die Tage unterwegs, die Risikoklasse der Route (1 bis 5), die Dichte im Röntgenbild, der Alarm des alten Scanners (`old_flag`) und was drin war (`contraband`, 1 = Schmuggelware).
>
> 1. Lasst einen Entscheidungsbaum wachsen, der drei Fragen tief ist und aus den Messwerten `contraband` vorhersagt.
> 2. Gebt ihn mit `export_text` aus und vergleicht ihn mit Hannes Karte.
> 3. Gebt die Zahl ein, die aus der **ersten** Frage weggerieben wurde: die Gewichtsabweichung in Prozent.

<details><summary>Startcode</summary>

```python
from sklearn.tree import DecisionTreeClassifier, export_text

# inspections ist geladen: 3.000 frühere Kontrollen, indiziert nach Kontrollnummer.
print(inspections.head())

X = inspections                  # was der Baum ansehen darf
y = inspections["contraband"]    # was er vorhersagen soll

tree = DecisionTreeClassifier(max_depth=3, random_state=0).fit(X, y)
print(export_text(tree, feature_names=list(X.columns)))
```

</details>

**Musterlösung:**

```python
from sklearn.tree import DecisionTreeClassifier, export_text

X = inspections.drop(columns=["old_flag", "contraband"])
y = inspections["contraband"]
tree = DecisionTreeClassifier(max_depth=3, random_state=0).fit(X, y)
print(export_text(tree, feature_names=list(X.columns)))
```

**Antwort:** `8.5`

**Zeigt nach dem Lösen:**

> Hannes erste Frage ist wieder da: **Ist der Container mehr als 8,5 % schwerer als angemeldet?** Beide Antworten führen zu einer Frage nach der Röntgendichte (über 1,21 auf der leichten Seite, über 0,94 auf der schweren) und erst dann zu einem Urteil.
>
> Ein Entscheidungsbaum ist genau so eine Karte: Fragen zu jeweils einem Feature, jede mit einer Schwelle, die der Baum aus den Daten gewählt hat. Der Baum aus dem Startcode hat nur eine Frage gestellt, nach `contraband` selbst: Ein Baum, der die Antwort sehen darf, lernt nichts anderes.

**Hinweise:**

1. Führt den Startcode aus. Der Baum stellt eine einzige Frage, und zwar nach `contraband`. Was steckt in `X`?
2. `X` darf nur enthalten, was eine Inspektorin vor dem Öffnen des Containers weiß. Hannes Karte sagt auch, dass sie nie auf den Alarm des Scanners geschaut hat. `inspections.drop(columns=[...])` entfernt Spalten.
3. `X = inspections.drop(columns=["old_flag", "contraband"])`. Die erste Zeile von `export_text` ist die erste Frage: `weight_gap_pct <= ...`.

### 2. Das stolze Dashboard

**Übt:** Das Genauigkeitsparadox bei einer seltenen Klasse: Konfusionsmatrix, Precision und Recall, classification_report  
**Braucht:** 🔎 Das XR-90-Poster  
**Daten:** [inspections.py](../../content/rooms/ml-customs/data/inspections.py)

**Aufgabe:**

> Der Bildschirm über dem Nachtschalter zeigt noch die Bilanz des XR-90. Der Scanner hat jeden Container der letzten zwei Jahre angesehen, und `old_flag` in `inspections` sagt, wo er Alarm geschlagen hat (1) und wo er still blieb (0). Wie gut hat er Schmuggler gefunden?
>
> 1. Vergleicht `old_flag` mit `contraband`: die Konfusionsmatrix und den Klassifikationsbericht.
> 2. Speichert `accuracy` (den Anteil der Container, die der Scanner richtig beurteilt hat), `missed` (Schmuggel-Container, die er durchgelassen hat) und `recall` (den Anteil des Schmuggelguts, den er markiert hat).
> 3. Euer Urteil: Würdet ihr dem XR-90 die Wahl der Container anvertrauen? Speichert `trust` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
from sklearn.metrics import confusion_matrix, classification_report

y = inspections["contraband"]    # 1 = beim Öffnen Schmuggelware gefunden
flag = inspections["old_flag"]   # 1 = der XR-90 hat Alarm geschlagen

accuracy = None  # Anteil der Container, die der Scanner richtig beurteilt hat
missed = None    # Schmuggel-Container, die der Scanner durchgelassen hat
recall = None    # Anteil des Schmuggelguts, den er markiert hat
trust = None     # True oder False
```

</details>

**Musterlösung:**

```python
from sklearn.metrics import confusion_matrix, classification_report, accuracy_score, recall_score

y = inspections["contraband"]
flag = inspections["old_flag"]
print(confusion_matrix(y, flag))
print(classification_report(y, flag))

accuracy = accuracy_score(y, flag)
tn, fp, fn, tp = confusion_matrix(y, flag).ravel()
missed = int(fn)
recall = recall_score(y, flag)
trust = bool(recall > 0.5)
print(accuracy, missed, recall, trust)
```

**Geprüftes Ergebnis** (`_dashboard_check(accuracy, missed, recall, trust)`):

```json
"exposed"
```

**Zeigt nach dem Lösen:**

> 93,5 % richtig und fast nutzlos. Von 207 Schmuggel-Containern hat der XR-90 **25** markiert und **182** durchgelassen: ein Recall von 12 %. Er lag so oft richtig, weil 93 % aller Container sauber sind und er fast alles für sauber erklärt hat.
>
> Wenn eine Klasse selten ist, sagt die Genauigkeit wenig. Fragt, was die Konfusionsmatrix fragt: Wie viele der Fälle, um die es geht, hat das Modell erwischt (Recall), und wie viele seiner Alarme waren echt (Precision)?

**Hinweise:**

1. Das Poster neben dem Bildschirm behauptet etwas über den XR-90; prüft es nach. `print(confusion_matrix(y, flag))`: Die Zeilen sind, was wirklich drin war (0, 1), die Spalten, was der Scanner gesagt hat (0, 1).
2. Der Scanner hat einen Container verpasst, wenn er Schmuggelware enthielt (Zeile 1) und der Scanner sauber sagte (Spalte 0). `tn, fp, fn, tp = confusion_matrix(y, flag).ravel()` packt die vier Felder aus.
3. `missed = fn` und `recall = tp / (tp + fn)`, oder `recall_score(y, flag)` aus `sklearn.metrics`. `print(classification_report(y, flag))` zeigt Precision und Recall für beide Klassen. `accuracy_score(y, flag)` ist 93,5 %, aber ein Recall von 12 % heißt `trust = False`.

### 3. Die Nachbarn

**Übt:** k-nächste Nachbarn: Skalieren in einer Pipeline, GridSearchCV über n_neighbors mit Kreuzvalidierung, eine Metrik (F1) für eine seltene Klasse wählen  
**Braucht:** 🔎 Jonas' Zettel am Terminal, 🔎 Die Prüfregel der Hafenmeisterin  
**Daten:** [inspections.py](../../content/rooms/ml-customs/data/inspections.py)

**Aufgabe:**

> Jonas von der Tagschicht hatte eine Idee, bevor er nach Hause ging: jeden neuen Container nach den früheren Kontrollen beurteilen, die ihm am ähnlichsten sind, seinen nächsten Nachbarn. Sein Terminal zeigt noch den Versuch. Wie viele Nachbarn beurteilen einen Container am besten?
>
> 1. Teilt die Kontrollen in einen Trainings- und einen Testteil.
> 2. Sucht mit `GridSearchCV` auf dem Trainingsteil die beste Zahl von Nachbarn. Speichert die trainierte Suche als `search`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.neighbors import KNeighborsClassifier
from helpers import show_plot

X = inspections.drop(columns=["old_flag", "contraband"])   # die fünf Messwerte
y = inspections["contraband"]
X_train, X_test, y_train, y_test = train_test_split(X, y)   # Trainings- und Testteil

model = KNeighborsClassifier()
search = GridSearchCV(model, {"n_neighbors": [5]}, scoring="accuracy", cv=5)
search.fit(X_train, y_train)
print(search.best_params_, round(search.best_score_, 3))

# Wer sind die fünf nächsten Nachbarn des ersten Trainingscontainers?
dist, idx = model.fit(X_train, y_train).kneighbors(X_train.iloc[:1])
print(X_train.iloc[idx[0]])
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from helpers import show_plot

X = inspections.drop(columns=["old_flag", "contraband"])
y = inspections["contraband"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, stratify=y, random_state=9)

pipe = make_pipeline(StandardScaler(), KNeighborsClassifier())
search = GridSearchCV(pipe, {"kneighborsclassifier__n_neighbors": list(range(1, 32, 2))}, scoring="f1", cv=5)
search.fit(X_train, y_train)
print(search.best_params_, round(search.best_score_, 3))
show_plot(pd.Series(search.cv_results_["mean_test_score"], index=range(1, 32, 2)), title="F1 by k")
```

**Geprüftes Ergebnis** (`_neighbours_check(search)`):

```json
"neighbourly"
```

**Zeigt nach dem Lösen:**

> **k = 5.** Mit allen Features skaliert geben fünf Nachbarn den besten F1-Wert auf den Trainings-Folds (0,62, also 62 %); weniger kopieren das Rauschen einzelner Kontrollen, mehr ertränken die seltenen Schmuggler in sauberen Nachbarn.
>
> Ohne Skalierung waren die Nachbarn einfach die Container mit dem ähnlichsten Preis pro kg: Ein Unterschied von 100 € wog mehr als jede Gewichtsabweichung oder jedes Röntgenbild, und der beste F1-Wert lag bei etwa 0,34. KNN misst Abstände, braucht also den Scaler, und in einer Pipeline wird der Scaler nur auf dem jeweiligen Trainings-Fold trainiert.

**Hinweise:**

1. Nehmt den Split aus der Regel der Hafenmeisterin: `train_test_split(X, y, test_size=0.25, stratify=y, random_state=9)`. Jonas' Zettel am Bildschirm sagt, wie er suchen wollte. Schaut dann auf die Nachbarn, die der Startcode ausgibt: In welcher Spalte stimmen sie überein?
2. `value_per_kg` reicht bis in die Tausende, bestimmt also jeden Abstand. `make_pipeline(StandardScaler(), KNeighborsClassifier())` skaliert zuerst. In einer Pipeline bekommt der Schlüssel im Raster den Namen des Schritts: `kneighborsclassifier__n_neighbors`.
3. `search = GridSearchCV(pipe, {"kneighborsclassifier__n_neighbors": list(range(1, 32, 2))}, scoring="f1", cv=5)`, dann `search.fit(X_train, y_train)` und `search.best_params_`.

### 4. Der wuchernde Baum

**Übt:** Overfitting: Train/Test-Split mit stratify, Trainings- gegen Testgenauigkeit über max_depth, eine Tiefe wählen  
**Braucht:** 1. Die Regelkarte der Inspektorin (sein Ergebnis), 🔒 1. Die Regelkarte der Inspektorin, 🔎 Die Prüfregel der Hafenmeisterin  
**Daten:** [inspections.py](../../content/rooms/ml-customs/data/inspections.py)

**Zahlenschloss** (öffnet mit `85`):

> Der Aktenschrank hat ein zweistelliges Zahlenschloss. Darauf ein Klebezettel in Hannes Handschrift: „Code = die Gewichtsabweichung in meiner ersten Frage, in Zehntelprozent.“

**Aufgabe:**

> Letztes Jahr hat ein Berater dem Zollamt einen Baum verkauft, der auf seinen Trainingsdaten 100 % richtig lag und bei den neuen Ankünften schlechter war als Hannes drei Fragen. Wie tief soll ein Baum wachsen? Der Ordner mit den Experimenten liegt im Aktenschrank.
>
> 1. Teilt die Kontrollen in einen Trainings- und einen Testteil.
> 2. Trainiert für jede `max_depth` von 1 bis 15 einen Baum auf dem Trainingsteil und speichert seine Genauigkeit auf dem Trainingsteil in `train_scores` und auf dem Testteil in `test_scores` (Tiefe 1 zuerst).
> 3. Zeichnet beide und speichert die Tiefe, die ungesehene Container am besten beurteilt, als `depth`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from helpers import show_plot

X = inspections.drop(columns=["old_flag", "contraband"])   # die fünf Messwerte
y = inspections["contraband"]
X_train, X_test, y_train, y_test = train_test_split(X, y)   # Trainings- und Testteil

train_scores = []   # Genauigkeit auf dem Trainingsteil, Tiefe 1 bis 15
test_scores = []    # Genauigkeit auf dem Testteil
for d in range(1, 16):
    tree = DecisionTreeClassifier(random_state=0)
    # ...

# show_plot(pd.Series(train_scores, index=range(1, 16)), pd.Series(test_scores, index=range(1, 16)), labels=["train", "test"])
depth = None
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from helpers import show_plot

X = inspections.drop(columns=["old_flag", "contraband"])
y = inspections["contraband"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, stratify=y, random_state=9)

train_scores = []
test_scores = []
for depth in range(1, 16):
    tree = DecisionTreeClassifier(max_depth=depth, random_state=0).fit(X_train, y_train)
    train_scores.append(tree.score(X_train, y_train))
    test_scores.append(tree.score(X_test, y_test))

depths = range(1, 16)
show_plot(pd.Series(train_scores, index=depths), pd.Series(test_scores, index=depths), labels=["train", "test"], title="Accuracy by depth")
print(pd.Series(test_scores, index=depths).round(4))
depth = 3
```

**Geprüftes Ergebnis** (`_depth_check(train_scores, test_scores, depth)`):

```json
"pruned"
```

**Zeigt nach dem Lösen:**

> **Tiefe 3.** Der Trainingswert steigt mit jeder Ebene, bis 99,6 % bei Tiefe 15, aber der Testwert ist bei Tiefe 3 am höchsten (96,5 %) und fällt danach: Der tiefere Baum lernt die Eigenheiten einzelner Trainingscontainer, die kein neuer Container teilt. Das ist Overfitting, und Hannes Karte war genau so tief, wie sie sein sollte.
>
> Ein Wert auf den Trainingsdaten sagt, wie gut sich ein Modell erinnert; nur der Testteil sagt, wie gut es urteilt.

**Hinweise:**

1. Die Regel der Hafenmeisterin nennt jedes Argument des Splits: `train_test_split(X, y, test_size=0.25, stratify=y, random_state=9)`.
2. In der Schleife: `tree = DecisionTreeClassifier(max_depth=d, random_state=0).fit(X_train, y_train)`, dann `tree.score(X_train, y_train)` und `tree.score(X_test, y_test)` anhängen.
3. Die Trainingskurve steigt immer, kann also nicht wählen. Die beste Tiefe ist dort, wo die Testkurve am höchsten ist: `pd.Series(test_scores, index=range(1, 16)).idxmax()`.

### 5. Die Quotentafel

**Übt:** Logistische Regression: Koeffizienten auf standardisierten Features, predict_proba, die Entscheidungsschwelle verschieben, um Precision gegen Recall zu tauschen  
**Braucht:** 🔒 2. Das stolze Dashboard, 🔎 Die Anordnung des Chefs, 🔎 Die Prüfregel der Hafenmeisterin  
**Daten:** [inspections.py](../../content/rooms/ml-customs/data/inspections.py)

**Zahlenschloss** (öffnet mit `182`):

> Das Bedienfeld der Tafel steckt unter einer Abdeckung mit einem dreistelligen Vorhängeschloss. In den Rahmen geritzt: „Kombination = wie viele Schmuggler der XR-90 in zwei Jahren durchgelassen hat.“

**Aufgabe:**

> Die große Tafel an der Wand zeigt für jeden Container die Wahrscheinlichkeit für Schmuggelware, aus einer logistischen Regression, und ein Regler legt fest, ab welcher Wahrscheinlichkeit ein Container geöffnet wird. Bei 0,5 öffnet die Tafel wenige Container und lässt viele Schmuggler durch. Wo soll der Regler stehen?
>
> 1. Trainiert `LogisticRegression` auf dem standardisierten Trainingsteil, als `model`.
> 2. Seine Koeffizienten sagen, wie stark jedes Feature die Chancen erhöht. Speichert den Spaltennamen des riskantesten Features als `riskiest`.
> 3. Stellt den Regler ein: Speichert seine Stufe als `threshold` und wie viele Container des Testteils sie öffnet als `opened`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import recall_score

X = inspections.drop(columns=["old_flag", "contraband"])   # die fünf Messwerte
y = inspections["contraband"]
X_train, X_test, y_train, y_test = train_test_split(X, y)   # Trainings- und Testteil

model = make_pipeline(StandardScaler(), LogisticRegression()).fit(X_train, y_train)
print(model[-1].coef_)   # ein Koeffizient pro Spalte von X, in Reihenfolge
riskiest = None          # der Spaltenname mit dem größten Koeffizienten

p = model.predict_proba(X_test)[:, 1]   # Wahrscheinlichkeit für Schmuggelware je Testcontainer
print((p >= 0.5).sum(), "geöffnet, Recall", recall_score(y_test, p >= 0.5))

threshold = None   # die Stufe des Reglers
opened = None      # Testcontainer, die bei dieser Stufe geöffnet werden
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import recall_score

X = inspections.drop(columns=["old_flag", "contraband"])
y = inspections["contraband"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, stratify=y, random_state=9)

model = make_pipeline(StandardScaler(), LogisticRegression()).fit(X_train, y_train)
coefs = pd.Series(model[-1].coef_[0], index=X.columns).sort_values()
print(coefs.round(2))
riskiest = coefs.idxmax()

p = model.predict_proba(X_test)[:, 1]
for t in [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05]:
    print(t, round(recall_score(y_test, p >= t), 3), (p >= t).sum())
threshold = 0.15
opened = int((p >= threshold).sum())
```

**Geprüftes Ergebnis** (`_odds_check(model, riskiest, threshold, opened)`):

```json
"calibrated"
```

**Zeigt nach dem Lösen:**

> Die Gewichtsabweichung wiegt am meisten (Koeffizient 1,49 pro Standardabweichung), dann die Röntgendichte (1,21); der Preis pro kg spielt kaum eine Rolle. Bei 0,5 hat die Tafel nur die Hälfte der Schmuggler erwischt. Heruntergedreht auf **0,15** fängt sie 83 % von ihnen und öffnet **76** der 750 Testcontainer.
>
> Ein Klassifikator liefert Wahrscheinlichkeiten; die Schwelle ist eine Entscheidung, die ihr trefft, indem ihr verpasste Schmuggler gegen geöffnete Kisten abwägt. Wer sie senkt, kauft Recall mit Precision.

**Hinweise:**

1. Teilt, wie es die Regel der Hafenmeisterin sagt, und stellt den Regler so ein, wie es die Anordnung des Chefs an der Wand sagt. `model[-1]` ist der letzte Schritt der Pipeline, die logistische Regression; `pd.Series(model[-1].coef_[0], index=X.columns)` benennt jeden Koeffizienten.
2. `p >= t` öffnet jeden Container mit einer Wahrscheinlichkeit von mindestens `t`. Gebt für jede Stufe des Reglers (0,5, 0,45, … 0,05) `recall_score(y_test, p >= t)` und `(p >= t).sum()` aus.
3. Geht den Regler hinunter und haltet bei der ersten Stufe an, deren Recall mindestens 0,8 ist: Das ist `threshold`. `opened = int((p >= threshold).sum())`.

### 6. Das Kranpult (Abschluss-Schloss)

**Übt:** Alles zusammen: einen Klassifikator wählen und trainieren, dieselben Spalten in derselben Reihenfolge für neue Daten, Fälle nach vorhergesagter Wahrscheinlichkeit ordnen  
**Braucht:** 4. Der wuchernde Baum (sein Ergebnis), 3. Die Nachbarn (sein Ergebnis), 5. Die Quotentafel (sein Ergebnis), 🔒 5. Die Quotentafel, 🔎 Der Kranplan für heute Nacht  
**Daten:** [inspections.py](../../content/rooms/ml-customs/data/inspections.py)

**Zahlenschloss** (öffnet mit `36276`):

> Das Kranpult ist mit einer fünfstelligen PIN gesperrt. Daneben die Notiz des Chefs: „PIN = die beste Tiefe des wuchernden Baums, dann der beste F1-Wert der Nachbarn in ganzen Prozent, dann wie viele Testcontainer die Quotentafel öffnet.“

**Aufgabe:**

> Die MV Kestrel liegt am Kai. Ihr Manifest listet die 40 Container von heute Nacht, geladen als `arrivals` und indiziert nach Containernummer, mit denselben Messwerten wie die Kontrollen: Der Alarm des Scanners fehlt, denn der Scanner ist kaputt. Der Kran kann vier Container absetzen, bevor das Schiff ablegt: welche vier?
>
> 1. Trainiert das Modell, dem ihr am meisten traut, auf den Kontrollen, als `model`.
> 2. Bewertet alle 40 Ankünfte mit `predict_proba`.
> 3. Speichert die Containernummern der vier riskantesten als `opened`.

<details><summary>Startcode</summary>

```python
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import LogisticRegression

print(arrivals.head())   # die 40 Container von heute Nacht, indiziert nach Containernummer

X = inspections.drop(columns=["old_flag", "contraband"])   # die fünf Messwerte
y = inspections["contraband"]
model = None   # euer bestes Modell, trainiert auf den Kontrollen

risk = None    # die Wahrscheinlichkeit für Schmuggelware je Ankunft
opened = []    # die vier Containernummern zum Öffnen
```

</details>

**Musterlösung:**

```python
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

X = inspections.drop(columns=["old_flag", "contraband"])
y = inspections["contraband"]
model = make_pipeline(StandardScaler(), LogisticRegression()).fit(X, y)

risk = pd.Series(model.predict_proba(arrivals[X.columns])[:, 1], index=arrivals.index)
risk = risk.sort_values(ascending=False)
print(risk.head(8).round(3))
opened = risk.index[:4].tolist()
```

**Geprüftes Ergebnis** (`_arrivals_check(model, opened)`):

```json
"opened"
```

**Zeigt nach dem Lösen:**

> Der Kran setzt die Container 4365, 4537, 4643 und 4761 ab, und in jedem findet die Crew eine falsche Wand voller Zigaretten. Jedes Modell, dem man trauen konnte, hatte dieselben vier oben: schwerer als ihre Papiere, dicht im Röntgenbild, auf riskanten Routen. Die Lockvögel blieben an Bord: die dichte Kiste Maschinenteile, die der alte Scanner geöffnet hätte, die riskante Route mit ehrlicher Fracht, die schwere Ladung Fliesen, die einfach falsch angemeldet war.
>
> Die Kestrel legt um sieben ab. Der XR-90 bekommt eine neue Aufgabe: die Tür des Nachtbüros offen halten.

**Hinweise:**

1. Der Kranplan sagt, welchem Test der Chef jedes Modell unterzieht. Jedes Modell von heute Nacht reicht, wenn es gut trainiert ist: ein Baum mit der Tiefe, die am Aktenschrank gewonnen hat, ein skaliertes KNN mit dem k der Nachbarn oder die logistische Regression der Quotentafel. Trainiert es auf `X` und `y` (alle Kontrollen, ohne `old_flag`).
2. `model.predict_proba(arrivals)` schlägt fehl: Das Manifest listet die Spalten in einer anderen Reihenfolge. `arrivals[X.columns]` bringt sie in die Reihenfolge, die das Modell gelernt hat.
3. `risk = pd.Series(model.predict_proba(arrivals[X.columns])[:, 1], index=arrivals.index).sort_values(ascending=False)`, dann `opened = risk.index[:4].tolist()`.

## Hinweise im Raum

### 🔎 Hannes Regelkarte

*Gebraucht von: 1. Die Regelkarte der Inspektorin*

> Eine Karte im Postkartenformat, mit Bleistift gezeichnet, die Zahlen weggerieben:
>
> **1.** Schwerer als angemeldet um mehr als ▒▒ %?
> · nein → **2a.** Röntgendichte über ▒▒? Dann noch eine Frage zum Gewicht.
> · ja → **2b.** Röntgendichte über ▒▒? Dann noch eine Frage.
>
> Am Rand notiert: „Drei Fragen, nie mehr. Dem Piepen des Scanners habe ich nie getraut, und was drin ist, weiß man erst, wenn er offen ist.“

### 🔎 Das XR-90-Poster

*Gebraucht von: 2. Das stolze Dashboard*

> Ein Hochglanzposter des Herstellers:
>
> **XR-90 · 93,5 % richtig!**
> Zwei Jahre an Pier 9 und kaum ein Fehlalarm.

### 🔎 Die Prüfregel der Hafenmeisterin

*Gebraucht von: 3. Die Nachbarn, 4. Der wuchernde Baum, 5. Die Quotentafel*

> HAFEN KLEEBERG · Prüfregel 7
>
> Ein Modell wird an Containern gemessen, die es nie gesehen hat. Haltet ein Viertel der Kontrollen als Testteil zurück (**test_size=0.25**), mit demselben Anteil Schmuggelware in beiden Teilen (**stratify=y**), und nehmt **random_state=9** (Pier 9), damit jede Schicht denselben Split bekommt.

### 🔎 Jonas' Zettel am Terminal

*Gebraucht von: 3. Die Nachbarn*

> „KNN für die Nachtschicht, mein Plan:
>
> · jedes **ungerade** k von **1 bis 31** probieren (ungerade, damit die Nachbarn nicht unentschieden stehen)
> · nicht nach Genauigkeit: Nichts öffnen bringt schon 93 %. Nach **F1**, das erwischte Schmuggler *und* wenige vergeudete Öffnungen braucht: **scoring="f1"**
> · **5 Folds** auf dem Trainingsteil
>
> Die Nachbarn, die es aussucht, kommen mir aber seltsam vor: immer etwa derselbe Preis pro kg? — J.“

### 🔎 Die Anordnung des Chefs

*Gebraucht von: 5. Die Quotentafel*

> Von Oberinspektor Mirković, für die Nachtschicht:
>
> Der Regler der Quotentafel geht von **0,50** in Schritten von **0,05** nach unten. Stellt ihn auf die **höchste** Stufe, die auf dem Testteil noch mindestens **4 von 5** Schmugglern fängt (Recall ≥ 0,8). Jede Stufe tiefer öffnet mehr Kisten, und dafür haben wir nicht die Leute.

### 🔎 Der Kranplan für heute Nacht

*Gebraucht von: 6. Das Kranpult*

> MV Kestrel · Liegeplatz Pier 9 · 40 Container · am Kai 04:30, legt ab 07:00
>
> Der Test des Chefs für jedes Modell: Die Akademie hat 1.000 versiegelte frühere Kontrollen mit 70 Schmuggelfällen. Unter den **100**, die euer Modell am riskantesten bewertet, müssen mindestens **40** dieser Fälle sein.

## Handbuch im Raum: 📖 Der Klassifikationsordner der Nachtschicht

**Features, Zielvariable und der Split:** [`X = df.drop(columns=["a", "b"])  y = df["c"]`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.drop.html), [`train_test_split(X, y, test_size=, stratify=, random_state=)`](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.train_test_split.html), [`model.fit(X, y)  model.predict(X)  model.score(X, y)`](https://scikit-learn.org/stable/getting_started.html#fitting-and-predicting-estimator-basics)

**Entscheidungsbäume:** [`DecisionTreeClassifier(max_depth=, random_state=)`](https://scikit-learn.org/stable/modules/generated/sklearn.tree.DecisionTreeClassifier.html), [`export_text(tree, feature_names=list(X.columns))`](https://scikit-learn.org/stable/modules/generated/sklearn.tree.export_text.html), [`overfitting`](https://scikit-learn.org/stable/auto_examples/model_selection/plot_underfitting_overfitting.html)

**Einen Klassifikator beurteilen:** [`confusion_matrix(y_true, y_pred)`](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.confusion_matrix.html), [`accuracy, precision, recall, F1`](https://scikit-learn.org/stable/modules/model_evaluation.html#precision-recall-f-measure-metrics), [`accuracy_score  precision_score  recall_score  f1_score`](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.recall_score.html), [`classification_report(y_true, y_pred)`](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.classification_report.html)

**Nächste Nachbarn und Einstellungen suchen:** [`KNeighborsClassifier(n_neighbors=5)`](https://scikit-learn.org/stable/modules/generated/sklearn.neighbors.KNeighborsClassifier.html), [`StandardScaler()`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html), [`make_pipeline(StandardScaler(), model)`](https://scikit-learn.org/stable/modules/generated/sklearn.pipeline.make_pipeline.html), [`GridSearchCV(model, param_grid, scoring=, cv=)`](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GridSearchCV.html)

**Logistische Regression und Schwellen:** [`LogisticRegression()`](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html), [`model.predict_proba(X)[:, 1]`](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html#sklearn.linear_model.LogisticRegression.predict_proba), [`p >= threshold`](https://scikit-learn.org/stable/modules/classification_threshold.html)

**Neue Daten:** [`df[X.columns]`](https://pandas.pydata.org/docs/user_guide/indexing.html#basics), [`pd.Series(values, index=df.index).sort_values(ascending=False)`](https://pandas.pydata.org/docs/reference/api/pandas.Series.sort_values.html)
