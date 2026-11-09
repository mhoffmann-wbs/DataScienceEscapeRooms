# Festivalsaison: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Das Festivalbüro an der Lindenwiese hat seinen Prognose-Server genau in der Woche verloren, in der die Bühnen für das Sommerfestival 2026 bestellt werden müssen. Das Bestellsystem hat das Büro verriegelt, bis jemand eine Prognose schickt, der es trauen kann.
>
> Bereinigt das Einlass-Log, findet heraus, was sich mit der Straßenbahn geändert hat, schlagt die Faustregeln der Planung und bringt einem Modell die großen Tage des Festivals bei. Dieser Raum lädt Python mit pandas, scipy und einem Prophet-artigen Modell (ein kleiner Nachbau mit der API von Prophet; die echte Bibliothek läuft nicht im Browser). Das erste Rätsel, das ihr öffnet, braucht einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Das Einlass-Log | Das `ds`/`y`-Format von Prophet, echte Werte von Aufzeichnungsfehlern unterscheiden, Lücken leer lassen statt interpolieren | 🔎 Eine Notiz von der IT |
| 2 | Der Straßenbahnzähler | Trend-Changepoints: automatische Kandidaten und ihre Steigungsänderungen (`delta`), einen bekannten Changepoint von Hand setzen, die Trendkomponente ablesen | 🔎 Der Stadtkurier, 🔎 Das Whiteboard |
| 3 | Martas Faustregel | Zeitliche Aufteilung in Training und Test, naive und saisonal naive Baselines (wöchentlich und jährlich), mittlerer absoluter Fehler mit Lücken | 1. Das Einlass-Log (sein Ergebnis), 🔎 Das Planungsheft |
| 4 | Das Lichtpult | Additive vs. multiplikative Saisonalität, die Log-Transformation als Alternative und das Zurücktransformieren mit `exp`, Modelle auf einem Holdout vergleichen | 1. Das Einlass-Log (sein Ergebnis), 🔎 Das Whiteboard |
| 5 | Der Veranstaltungstisch | Feiertagseffekte: eine Feiertagstabelle mit Fenstern bauen, zukünftige Termine aufnehmen, die Komponente eines Feiertags im multiplikativen Modus ablesen | 1. Das Einlass-Log (sein Ergebnis), 4. Das Lichtpult (sein Ergebnis), 🔎 Der Veranstaltungskalender, 🔎 Das Whiteboard |
| 6 | Die Bühnenbestellung (Abschluss-Schloss) | Trend-Changepoints, multiplikative Saisonalität und Feiertage kombinieren, ein Modell gegen eine Baseline prüfen, zukünftige Ereignisse prognostizieren | 1. Das Einlass-Log (sein Ergebnis), 2. Der Straßenbahnzähler (sein Ergebnis), 3. Martas Faustregel (sein Ergebnis), 4. Das Lichtpult (sein Ergebnis), 5. Der Veranstaltungstisch (sein Ergebnis), 🔎 Das Bestellformular für Bühnen, 🔎 Das Whiteboard |

## Stationen

### 1. Das Einlass-Log

**Übt:** Das `ds`/`y`-Format von Prophet, echte Werte von Aufzeichnungsfehlern unterscheiden, Lücken leer lassen statt interpolieren  
**Braucht:** 🔎 Eine Notiz von der IT  
**Daten:** [scans.py](../../content/rooms/ts-festival/data/scans.py)

**Aufgabe:**

> Jede Prognose hier beginnt mit den Einlass-Scans: wie viele Besucher jeden Tag durch die Tore kamen. Aber das Log enthält Tage, die gar keine Besucher sind.
>
> Bringt das Log in das Format, das ein Prophet-artiges Modell erwartet: ein DataFrame `df` mit den Spalten `ds` (Datum) und `y` (Besucher), eine Zeile pro Tag. Jeder Tag, der nicht wirklich gezählt wurde, behält seine Zeile, muss aber leer sein.

<details><summary>Startcode</summary>

```python
from helpers import show_plot

# scans ist geladen: Einlass-Scans pro Tag, Januar 2021 bis September 2025.
print(scans.head(10))
show_plot(scans, title="Einlass-Scans pro Tag")

# Ein Prophet-artiges Modell will ein DataFrame mit zwei Spalten: ds (das Datum) und y (der Wert).
df = None
```

</details>

**Musterlösung:**

```python
from helpers import show_plot

df = scans.reset_index()
df.columns = ["ds", "y"]
df.loc[df["y"] == 9999, "y"] = None
df.loc[(df["ds"] >= "2024-03-04") & (df["ds"] <= "2024-03-17"), "y"] = None
print(int(df["y"].isna().sum()), "days without a real count")
show_plot(df.set_index("ds")["y"], title="Visitors per day")
```

**Geprüftes Ergebnis** (`[sorted(df.columns.tolist()), len(df), int(df["y"].notna().sum()), round(float(df["y"].sum()))]`):

```json
[["ds", "y"], 1734, 1714, 1836733]
```

**Zeigt nach dem Lösen:**

> Das Log ist sauber: 1734 Tage, davon 1714 gezählt. Die 14 Ausfalltage und 6 Testbuchungen bleiben leer; das Modell überspringt sie einfach.

**Hinweise:**

1. Tomasz von der IT hat eine Notiz zu den Tagen hinterlassen, die nicht gezählt wurden. `scans.reset_index()` macht aus den Daten eine Spalte. Dann benennt ihr die zwei Spalten: `df.columns = ["ds", "y"]`.
2. Die IT-Notiz nennt zwei Arten falscher Tage: den Ausfall (als 0 erfasst) und die Testbuchungen (genau 9999). Nehmt keine Schwelle wie `y > 5000`: Echte Festivaltage sind genauso voll.
3. `df.loc[df["y"] == 9999, "y"] = None`, und dasselbe für die Ausfalltage 4. bis 17. März 2024. Behaltet die Zeilen (die anderen Tische brauchen eine Zeile pro Tag), aber füllt keine Zahlen ein.

### 2. Der Straßenbahnzähler

**Übt:** Trend-Changepoints: automatische Kandidaten und ihre Steigungsänderungen (`delta`), einen bekannten Changepoint von Hand setzen, die Trendkomponente ablesen  
**Braucht:** 🔎 Der Stadtkurier, 🔎 Das Whiteboard  
**Daten:** [tram.py](../../content/rooms/ts-festival/data/tram.py)

**Aufgabe:**

> Die Verkehrsbetriebe zählen die Fahrgäste an der Haltestelle Festwiese, geladen als `tram` (schon mit `ds` und `y`). Ihr Diagramm zeigt einen Knick im Trend, und das Festivalgelände knickt vielleicht mit.
>
> Lasst das Modell zuerst seine Changepoints selbst setzen und findet das Datum, an dem sich die Steigung des Trends am stärksten ändert: `biggest_change`. Passt es dann neu an, mit dem Eröffnungstag der Linie als einzigem Changepoint, und lest am Trend des Modells ab, wie viele Fahrgäste pro Tag die Haltestelle im Jahr vor diesem Datum gewonnen hat (`growth_before`) und im Jahr danach (`growth_after`).

<details><summary>Startcode</summary>

```python
from prophet import Prophet
from helpers import show_plot

# tram ist geladen, schon im Prophet-Format (Spalten ds und y).
show_plot(tram.set_index("ds")["y"], title="Fahrgäste pro Tag an der Festwiese")

# 1. Lasst das Modell seine Changepoints selbst setzen.
m = Prophet()
m.fit(tram)
# m.changepoints: die Kandidaten-Daten; m.params["delta"][0]: wie stark sich die Steigung dort jeweils ändert
biggest_change = None   # das Datum, an dem sich die Steigung am stärksten ändert

# 2. Neu anpassen, mit dem Eröffnungstag der Linie als einzigem Changepoint: Prophet(changepoints=[...])
growth_before = None    # Zuwachs des Trends im Jahr vor diesem Datum, Fahrgäste pro Tag
growth_after = None     # ... und im Jahr danach
```

</details>

**Musterlösung:**

```python
from prophet import Prophet
from helpers import show_plot

m = Prophet().fit(tram)
changes = pd.Series(m.params["delta"][0], index=m.changepoints)
print(changes.abs().sort_values(ascending=False).head())
biggest_change = changes.abs().idxmax()

m7 = Prophet(changepoints=["2023-04-01"]).fit(tram)
trend = m7.predict(tram).set_index("ds")["trend"]
growth_before = trend["2023-04-01"] - trend["2022-04-01"]
growth_after = trend["2024-04-01"] - trend["2023-04-01"]
print(biggest_change, round(growth_before), round(growth_after))
show_plot(tram.set_index("ds")["y"], trend, labels=["passengers", "trend"])
```

**Geprüftes Ergebnis** (`_tram_check(biggest_change, growth_before, growth_after)`):

```json
"ok"
```

**Zeigt nach dem Lösen:**

> Seit die Straßenbahn fährt, gewinnt die Haltestelle jedes Jahr etwa 580 Fahrgäste pro Tag dazu, vorher etwa 70. Der Trend des Festivalgeländes knickt am selben Tag.

**Hinweise:**

1. Der Stadtkurier beim Straßenbahnzähler sagt, wann die Linie eröffnet wurde. `m.changepoints` und `m.params["delta"][0]` gehören paarweise zusammen. Packt sie in eine Series, `pd.Series(m.params["delta"][0], index=m.changepoints)`, und nehmt das Datum mit dem größten Betrag: `.abs().idxmax()`.
2. Das zweite Modell ist `Prophet(changepoints=["2023-04-01"])` (ein Modell lässt sich nur einmal anpassen, also legt ein neues an). `predict(tram)` liefert eine Spalte `trend`; indiziert sie mit `ds`.
3. `trend = m7.predict(tram).set_index("ds")["trend"]`, dann `growth_before = trend["2023-04-01"] - trend["2022-04-01"]` und `growth_after = trend["2024-04-01"] - trend["2023-04-01"]`.

### 3. Martas Faustregel

**Übt:** Zeitliche Aufteilung in Training und Test, naive und saisonal naive Baselines (wöchentlich und jährlich), mittlerer absoluter Fehler mit Lücken  
**Braucht:** 1. Das Einlass-Log (sein Ergebnis), 🔎 Das Planungsheft  
**Daten:** [scans.py](../../content/rooms/ts-festival/data/scans.py)

**Aufgabe:**

> Bevor man einem Modell traut, muss es die einfachen Regeln schlagen, die schon benutzt werden. Welche einfache Regel sagt den Sommer 2025 am besten voraus? Trainiert bis Ende Mai 2025 und testet auf Juni bis September 2025.
>
> `scans` hat noch seine nicht gezählten Tage: Bereinigt sie zuerst zu `df`. Prognostiziert die Testtage auf drei Arten, nur mit den Trainingsdaten, und berechnet jeweils den mittleren absoluten Fehler in Besuchern pro Tag: `mae_naive` (jeder Tag gleich dem letzten Trainingstag), `mae_last_week` (die letzte Trainingswoche, wiederholt) und `mae_last_year` (Martas Regel).

<details><summary>Startcode</summary>

```python
from helpers import show_plot

# df: das bereinigte Einlass-Log (ds und y, eine Zeile pro Tag).
df = None

y = df.set_index("ds")["y"]
train = y[:"2025-05-31"]
test = y["2025-06-01":]

# Drei Prognosen für die Testtage, jeweils eine Series mit test.index:
naive = None        # jeder Tag = der letzte Trainingstag
last_week = None    # die letzten 7 Trainingstage, wiederholt
last_year = None    # Martas Regel

mae_naive = None    # mittlere absolute Fehler gegenüber test, in Besuchern pro Tag
mae_last_week = None
mae_last_year = None
```

</details>

**Musterlösung:**

```python
from helpers import show_plot

df = scans.reset_index()
df.columns = ["ds", "y"]
df.loc[df["y"] == 9999, "y"] = None
df.loc[(df["ds"] >= "2024-03-04") & (df["ds"] <= "2024-03-17"), "y"] = None
y = df.set_index("ds")["y"]
train = y[:"2025-05-31"]
test = y["2025-06-01":]
naive = pd.Series(train.iloc[-1], index=test.index)
last_week = pd.Series(np.tile(train.iloc[-7:].values, 18)[:len(test)], index=test.index)
last_year = y.shift(364)["2025-06-01":]
mae_naive = (naive - test).abs().mean()
mae_last_week = (last_week - test).abs().mean()
mae_last_year = (last_year - test).abs().mean()
print(round(mae_naive), round(mae_last_week), round(mae_last_year))
show_plot(test, last_week, last_year, labels=["actual", "last week", "last year"])
```

**Geprüftes Ergebnis** (`[_clean_df(df), round(float(mae_naive)), round(float(mae_last_week)), round(float(mae_last_year))]`):

```json
["clean", 753, 422, 614]
```

**Zeigt nach dem Lösen:**

> Die letzte Woche zu wiederholen liegt im Sommer 2025 im Schnitt **422 Besucher pro Tag** daneben, Martas Regel (gleicher Tag im Vorjahr) 614, die naive Prognose 753.

**Hinweise:**

1. `df` ist das Ergebnis vom Einlass-Log, und Martas Heft liegt am Planungstisch. `train.iloc[-1]` ist der letzte Trainingstag, `train.iloc[-7:]` die letzte Trainingswoche. Jede Prognose braucht die Testtage als Index: `pd.Series(..., index=test.index)`.
2. Die Woche wiederholt ihr mit `np.tile(train.iloc[-7:].values, 18)[:len(test)]`. Marta schaut 364 Tage zurück (52 Wochen, gleicher Wochentag): `y.shift(364)` funktioniert, weil `df` noch eine Zeile für jeden Tag hat.
3. `last_year = y.shift(364)["2025-06-01":]`. Der MAE ist `(prognose - test).abs().mean()`; pandas überspringt die leeren Testtage.

### 4. Das Lichtpult

**Übt:** Additive vs. multiplikative Saisonalität, die Log-Transformation als Alternative und das Zurücktransformieren mit `exp`, Modelle auf einem Holdout vergleichen  
**Braucht:** 1. Das Einlass-Log (sein Ergebnis), 🔎 Das Whiteboard  
**Daten:** [scans.py](../../content/rooms/ts-festival/data/scans.py)

**Aufgabe:**

> Wie wirken die Jahreszeiten auf die Besucher? Das Lichtpult hat drei Regler dafür: obendrauf addiert, multipliziert oder auf der Log-Skala. Seit die Straßenbahn fährt, schwanken die Sommerwochenenden viel stärker als früher.
>
> `scans` hat noch seine nicht gezählten Tage: Bereinigt sie zuerst zu `df`. Passt drei Modelle auf die Trainingsdaten (bis Mai 2025) an und berechnet ihre mittleren absoluten Fehler auf Juni bis September 2025, in Besuchern: `mae_additive` (die Voreinstellung), `mae_multiplicative` (multiplikative Saisonalität) und `mae_log` (additiv, angepasst auf den Logarithmus der Besucher).

<details><summary>Startcode</summary>

```python
from prophet import Prophet
from helpers import show_plot

# df: das bereinigte Einlass-Log (ds und y, eine Zeile pro Tag).
df = None
train = df[df["ds"] <= "2025-05-31"]
test = df[df["ds"] >= "2025-06-01"]   # Sommer 2025: Juni bis September


def holdout_mae(yhat):
    """Mittlerer absoluter Fehler einer Prognose für die Testtage, in Besuchern pro Tag."""
    return (pd.Series(np.asarray(yhat), index=test.index) - test["y"]).abs().mean()


additive = Prophet()
additive.fit(train)
forecast = additive.predict(test)
mae_additive = holdout_mae(forecast["yhat"])
show_plot(test.set_index("ds")["y"], forecast.set_index("ds")["yhat"], labels=["echt", "additiv"])

mae_multiplicative = None
mae_log = None   # in Besuchern vergleichen, nicht in Log-Einheiten
```

</details>

**Musterlösung:**

```python
from prophet import Prophet
from helpers import show_plot

df = scans.reset_index()
df.columns = ["ds", "y"]
df.loc[df["y"] == 9999, "y"] = None
df.loc[(df["ds"] >= "2024-03-04") & (df["ds"] <= "2024-03-17"), "y"] = None
train = df[df["ds"] <= "2025-05-31"]
test = df[df["ds"] >= "2025-06-01"]


def holdout_mae(yhat):
    return (pd.Series(np.asarray(yhat), index=test.index) - test["y"]).abs().mean()


additive = Prophet().fit(train)
mae_additive = holdout_mae(additive.predict(test)["yhat"])
multiplicative = Prophet(seasonality_mode="multiplicative").fit(train)
forecast = multiplicative.predict(test)
mae_multiplicative = holdout_mae(forecast["yhat"])
logged = Prophet().fit(train.assign(y=np.log(train["y"])))
mae_log = holdout_mae(np.exp(logged.predict(test)["yhat"]))
print(round(mae_additive), round(mae_multiplicative), round(mae_log))
show_plot(test.set_index("ds")["y"], forecast.set_index("ds")["yhat"], labels=["actual", "multiplicative"])
```

**Geprüftes Ergebnis** (`_mode_check(df, mae_additive, mae_multiplicative, mae_log)`):

```json
"ok"
```

**Zeigt nach dem Lösen:**

> Multiplikativ gewinnt: etwa **293** Besucher pro Tag daneben, gegenüber 516 additiv und 433 auf der Log-Skala. Sommer und Wochenenden wachsen mit der Menge, also `seasonality_mode="multiplicative"`.

**Hinweise:**

1. Startet mit dem `df` vom Einlass-Log; das Whiteboard nennt die Optionen des Modells. Ein multiplikatives Modell ist `Prophet(seasonality_mode="multiplicative")`. Passt es auf `train` an und bewertet `predict(test)["yhat"]` mit `holdout_mae`, wie das additive.
2. Für das Log-Modell passt ihr ein normales `Prophet()` auf `train.assign(y=np.log(train["y"]))` an. Sein `yhat` ist in Log-Einheiten: Nehmt `np.exp`, bevor ihr mit echten Besuchern vergleicht.
3. `mae_log = holdout_mae(np.exp(logged.predict(test)["yhat"]))`, wobei `logged` das auf die Log-Werte angepasste Modell ist.

### 5. Der Veranstaltungstisch

**Übt:** Feiertagseffekte: eine Feiertagstabelle mit Fenstern bauen, zukünftige Termine aufnehmen, die Komponente eines Feiertags im multiplikativen Modus ablesen  
**Braucht:** 1. Das Einlass-Log (sein Ergebnis), 4. Das Lichtpult (sein Ergebnis), 🔎 Der Veranstaltungskalender, 🔎 Das Whiteboard  
**Daten:** [scans.py](../../content/rooms/ts-festival/data/scans.py)

**Aufgabe:**

> Zwei Ereignisse durchbrechen jedes Muster: das Eröffnungswochenende des Sommerfestivals und die Laternennacht. Ein Prophet-artiges Modell lernt sie aus einer Feiertagstabelle.
>
> Baut `events`: eine Zeile pro Termin, mit den Spalten `holiday`, `ds`, `lower_window` und `upper_window`, einschließlich der Termine im nächsten Jahr. Passt damit ein Modell auf das ganze bereinigte Einlass-Log `df` an, mit der Saisonalität, die am besten zu den Besuchern passt, und speichert den Effekt des Eröffnungswochenendes am Samstag, 22. Juni 2024, in `saturday_effect` (so, wie das Modell ihn in der Spalte des Ereignisses angibt).

<details><summary>Startcode</summary>

```python
from prophet import Prophet
from helpers import show_plot

# df: das bereinigte Einlass-Log (ds und y, eine Zeile pro Tag).
df = None

# Eine Zeile pro Termin. Das Fenster sagt, welche Tage um ds zum Ereignis gehören:
# lower_window=-1 nimmt den Tag davor dazu, upper_window=1 den Tag danach.
events = pd.DataFrame({
    "holiday": [],
    "ds": [],
    "lower_window": [],
    "upper_window": [],
})

m = Prophet(holidays=events)   # dazu die am besten passende Saisonalität
m.fit(df)
forecast = m.predict(df).set_index("ds")
print(forecast.columns.tolist())   # eine Spalte pro Feiertagsname

saturday_effect = None   # die Spalte des Eröffnungswochenendes am 2024-06-22
```

</details>

**Musterlösung:**

```python
from prophet import Prophet
from helpers import show_plot

df = scans.reset_index()
df.columns = ["ds", "y"]
df.loc[df["y"] == 9999, "y"] = None
df.loc[(df["ds"] >= "2024-03-04") & (df["ds"] <= "2024-03-17"), "y"] = None
opening = pd.DataFrame({
    "holiday": "opening_weekend",
    "ds": pd.to_datetime(["2021-06-18", "2022-06-17", "2023-06-16", "2024-06-21", "2025-06-20", "2026-06-19"]),
    "lower_window": 0,
    "upper_window": 2,
})
lantern = pd.DataFrame({
    "holiday": "lantern_night",
    "ds": pd.to_datetime(["2021-09-11", "2022-09-10", "2023-09-09", "2024-09-14", "2025-09-13", "2026-09-12"]),
    "lower_window": -1,
    "upper_window": 0,
})
events = pd.concat([opening, lantern], ignore_index=True)
m = Prophet(seasonality_mode="multiplicative", holidays=events).fit(df)
forecast = m.predict(df).set_index("ds")
saturday_effect = forecast.loc["2024-06-22", "opening_weekend"]
print(round(saturday_effect, 2))
show_plot(forecast.loc["2024-05":"2024-09", "opening_weekend"], forecast.loc["2024-05":"2024-09", "lantern_night"], labels=["opening weekend", "Lantern Night"])
```

**Geprüftes Ergebnis** (`_events_check(df, events, saturday_effect)`):

```json
"ok"
```

**Zeigt nach dem Lösen:**

> Am Eröffnungssamstag legt das Festival etwa **204 % des Trends** auf einen gewöhnlichen Sommersamstag drauf, die Laternennacht sogar noch mehr.

**Hinweise:**

1. Der Veranstaltungskalender hängt am Schwarzen Brett, `df` kommt vom Einlass-Log und die Saisonalität vom Lichtpult. Baut ein DataFrame pro Ereignis und verbindet sie mit `pd.concat([...], ignore_index=True)`. Das Eröffnungswochenende steht mit seinem Freitag im Kalender und dauert bis Sonntag: `lower_window=0`, `upper_window=2`.
2. Die Laternennacht zählt die Generalprobe am Vorabend mit: `lower_window=-1`, `upper_window=0`. Nehmt alle sechs Jahre beider Ereignisse, 2021 bis 2026.
3. Der Gewinner vom Lichtpult: `Prophet(seasonality_mode="multiplicative", holidays=events)`. Mit dem Feiertagsnamen `"opening_weekend"`: `saturday_effect = forecast.loc["2024-06-22", "opening_weekend"]`. Es sollte etwa 2 herauskommen, also +200 % des Trends.

### 6. Die Bühnenbestellung (Abschluss-Schloss)

**Übt:** Trend-Changepoints, multiplikative Saisonalität und Feiertage kombinieren, ein Modell gegen eine Baseline prüfen, zukünftige Ereignisse prognostizieren  
**Braucht:** 1. Das Einlass-Log (sein Ergebnis), 2. Der Straßenbahnzähler (sein Ergebnis), 3. Martas Faustregel (sein Ergebnis), 4. Das Lichtpult (sein Ergebnis), 5. Der Veranstaltungstisch (sein Ergebnis), 🔎 Das Bestellformular für Bühnen, 🔎 Das Whiteboard  
**Daten:** [scans.py](../../content/rooms/ts-festival/data/scans.py)

**Aufgabe:**

> Die Bürotür öffnet sich, sobald die Bühnenbestellung für das Sommerfestival 2026 abgeschickt ist. Das Bestellsystem nimmt nur eine Prognose von einem Modell an, das die beste einfache Regel auf Sommer 2025 schlägt.
>
> Baut das vollständige Modell aus allem, was der Raum euch gezeigt hat, auf dem bereinigten Einlass-Log `df`. Setzt `best_baseline` (den Fehler der besten einfachen Regel), `mae_model` (den Fehler eures Modells auf Juni bis September 2025, trainiert bis Mai 2025) und `opening_2026` (die Zahl für die Bühnenbestellung, aus einem Modell, das auf ganz `df` angepasst wurde). Das Bestellsystem sagt euch, was ihm nicht passt.

<details><summary>Startcode</summary>

```python
from prophet import Prophet
from helpers import show_plot

# df: das bereinigte Einlass-Log (ds und y, eine Zeile pro Tag).
df = None

events = None          # die Feiertagstabelle
best_baseline = None   # der Fehler der besten einfachen Regel auf Juni bis September 2025, Besucher pro Tag

train = df[df["ds"] <= "2025-05-31"]
test = df[df["ds"] >= "2025-06-01"]   # Sommer 2025: Juni bis September


def model():
    """Ein frisches, noch nicht angepasstes Modell mit allen Einstellungen, die der Raum euch gezeigt hat."""
    return Prophet()


# 1. Das Modell auf Sommer 2025 prüfen: auf train anpassen, test prognostizieren, mittlerer absoluter Fehler in Besuchern.
mae_model = None

# 2. model() auf ganz df anpassen, weit genug vorausprognostizieren und die Zahl für die Bühnenbestellung ausrechnen.
opening_2026 = None
```

</details>

**Musterlösung:**

```python
from prophet import Prophet
from helpers import show_plot

df = scans.reset_index()
df.columns = ["ds", "y"]
df.loc[df["y"] == 9999, "y"] = None
df.loc[(df["ds"] >= "2024-03-04") & (df["ds"] <= "2024-03-17"), "y"] = None
opening = pd.DataFrame({
    "holiday": "opening_weekend",
    "ds": pd.to_datetime(["2021-06-18", "2022-06-17", "2023-06-16", "2024-06-21", "2025-06-20", "2026-06-19"]),
    "lower_window": 0,
    "upper_window": 2,
})
lantern = pd.DataFrame({
    "holiday": "lantern_night",
    "ds": pd.to_datetime(["2021-09-11", "2022-09-10", "2023-09-09", "2024-09-14", "2025-09-13", "2026-09-12"]),
    "lower_window": -1,
    "upper_window": 0,
})
events = pd.concat([opening, lantern], ignore_index=True)
best_baseline = 422   # the planner's rule: repeating the last week
train = df[df["ds"] <= "2025-05-31"]
test = df[df["ds"] >= "2025-06-01"]


def model():
    return Prophet(seasonality_mode="multiplicative", holidays=events, changepoints=["2023-04-01"])


holdout = model().fit(train)
mae_model = (pd.Series(holdout.predict(test)["yhat"].values, index=test.index) - test["y"]).abs().mean()
full = model().fit(df)
forecast = full.predict(full.make_future_dataframe(periods=270)).set_index("ds")
opening_2026 = forecast.loc["2026-06-19":"2026-06-21", "yhat"].sum()
print(round(mae_model), round(opening_2026))
show_plot(df.set_index("ds")["y"]["2025"], forecast["yhat"]["2025":], labels=["visitors", "forecast"])
```

**Geprüftes Ergebnis** (`_order_check(df, best_baseline, mae_model, opening_2026)`):

```json
"ok"
```

**Hinweise:**

1. Jeder Hinweis eines Tisches fügt `model()` eine Einstellung hinzu: den Changepoint vom Straßenbahnzähler, die Saisonalität vom Lichtpult und `events` vom Veranstaltungstisch, inklusive der Termine 2026. `best_baseline` kommt aus Martas Faustregel, das Bestellformular neben dem Bestellsystem sagt, was ihr addiert, und der Veranstaltungskalender, welche Tage das sind.
2. Ein Modell lässt sich nur einmal anpassen, also ruft `model()` zweimal auf: einmal für `train` (dann `predict(test)` und mit `test["y"]` vergleichen), einmal für ganz `df`. Für die Zukunft nehmt ihr `make_future_dataframe(periods=...)` vom Whiteboard: 270 Tage reichen über das Eröffnungswochenende 2026 hinaus.
3. `model()` gibt `Prophet(seasonality_mode="multiplicative", holidays=events, changepoints=["2023-04-01"])` zurück, `best_baseline = 422`, und `opening_2026 = forecast.set_index("ds").loc["2026-06-19":"2026-06-21", "yhat"].sum()`, wobei `forecast` die Vorhersage des vollständigen Modells für diese Zukunft ist.

## Hinweise im Raum

### 🔎 Eine Notiz von der IT

*Gebraucht von: 1. Das Einlass-Log*

> EINLASS-SCANNER · Tomasz, IT
>
> **4. bis 17. März 2024:** Nach dem Hochwasser waren die Scanner offline. Das System hat für diese Tage 0 eingetragen, aber gezählt wurde niemand.
>
> **Testbuchungen:** Am ersten Montag mancher Monate prüfe ich das System mit einer Buchung über genau **9999** Tickets. Das sind keine Besucher.

### 🔎 Der Stadtkurier

*Gebraucht von: 2. Der Straßenbahnzähler*

> STADTKURIER · Montag, 3. April 2023
>
> **Linie 7 fährt endlich zur Lindenwiese**
>
> Seit Samstag, dem 1. April, fahren Straßenbahnen alle zehn Minuten vom Hauptbahnhof direkt zur Haltestelle Festwiese. Das Festivalbüro rechnet mit "deutlich mehr Besuchern, und nicht nur im Sommer".

### 🔎 Das Planungsheft

*Gebraucht von: 3. Martas Faustregel*

> Marta Lindqvist, Leiterin der Planung:
>
> "Ich plane jeden Tag wie denselben Tag im Vorjahr: gleicher Wochentag, 52 Wochen zurück, also 364 Tage. Hat noch nie versagt."
>
> Auf der nächsten Seite, in einer anderen Handschrift: "Wirklich? Testet sie wie jedes Modell."

### 🔎 Das Whiteboard

*Gebraucht von: 2. Der Straßenbahnzähler, 4. Das Lichtpult, 5. Der Veranstaltungstisch, 6. Die Bühnenbestellung*

> PROPHET-ARTIGES MODELL · Kurzreferenz
>
> Das Modell in diesem Raum hat die API der Prophet-Bibliothek, ist aber ein kleiner Nachbau für den Browser, nicht Prophet selbst.
>
> `m = Prophet(...)`, `m.fit(df)` mit den Spalten `ds` und `y`, `future = m.make_future_dataframe(periods=...)`, `forecast = m.predict(future)`.
>
> `forecast` hat `yhat` (mit `yhat_lower` und `yhat_upper`), `trend` und eine Spalte pro Saisonalität (`weekly`, `yearly`) und pro Feiertag.
>
> Ausschläge, die mit dem Niveau wachsen: `seasonality_mode="multiplicative"`. Dann sind die Komponenten Anteile am Trend: 0,5 heißt +50 %. Oder auf `np.log(y)` anpassen und von `yhat` `np.exp` nehmen.

### 🔎 Der Veranstaltungskalender

*Gebraucht von: 5. Der Veranstaltungstisch*

> LINDENWIESE · VERANSTALTUNGSKALENDER
>
> **Sommerfestival, Eröffnungswochenende** (Freitag bis Sonntag), ab Freitag:
> 2021-06-18 · 2022-06-17 · 2023-06-16 · 2024-06-21 · 2025-06-20 · 2026-06-19
>
> **Laternennacht** (ein Samstag). Die Generalprobe am Vorabend zieht auch viele Leute an:
> 2021-09-11 · 2022-09-10 · 2023-09-09 · 2024-09-14 · 2025-09-13 · 2026-09-12

### 🔎 Das Bestellformular für Bühnen

*Gebraucht von: 6. Die Bühnenbestellung*

> BÜHNENBESTELLUNG · Sommerfestival 2026
>
> Erwartete Besucher am **Eröffnungswochenende 2026**: die Summe aller seiner Tage.

## Handbuch im Raum: 📖 Handbuch des Prognosebüros

**Daten vorbereiten:** [`df = s.reset_index()`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.reset_index.html), [`df.loc[condition, "y"] = None`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.loc.html), [`Gaps: empty, not filled`](https://pandas.pydata.org/docs/reference/api/pandas.Series.isna.html), [`pd.to_datetime([...])  pd.concat([a, b], ignore_index=True)`](https://pandas.pydata.org/docs/reference/api/pandas.concat.html)

**Baselines und Fehler:** [`y[:"2022-05-31"]  y["2022-06-01":]`](https://pandas.pydata.org/docs/user_guide/timeseries.html), [`Naive forecasts`](https://numpy.org/doc/stable/reference/generated/numpy.tile.html), [`y.shift(k)`](https://pandas.pydata.org/docs/reference/api/pandas.Series.shift.html), [`(forecast - actual).abs().mean()`](https://pandas.pydata.org/docs/reference/api/pandas.Series.abs.html), [`np.log(y)  np.exp(yhat)`](https://numpy.org/doc/stable/reference/generated/numpy.log.html)

**Das Prophet-artige Modell:** [`from prophet import Prophet`](https://facebook.github.io/prophet/docs/quick_start.html), `Prophet(seasonality_mode="additive", holidays=None, changepoints=None, ...)`, `m.fit(df)`, `m.make_future_dataframe(periods, freq="D", include_history=True)`, `forecast = m.predict(df)`, `forecast columns`

**Trend und Changepoints:** `m.changepoints`, `m.params["delta"][0]`, `Reading growth from the trend`

**Saisonalität und Feiertage:** `seasonality_mode="multiplicative"`, `holidays: holiday, ds, lower_window, upper_window`

**Diagramme:** `from helpers import show_plot`
