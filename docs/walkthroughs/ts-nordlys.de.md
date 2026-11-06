# Station Nordlys: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Ein Polarsturm hat die Station Nordlys in den Notbetrieb geschickt. Die Heizung ist aus, die Türen sind versiegelt, und der Stationscomputer bestellt erst wieder Heizöl, wenn jemand seine Prognose-Pipeline neu aufbaut.
>
> Repariert das Heizöl-Logbuch, zeigt, dass ein Modell die Faustregel der Leiterin schlägt, und schickt die Januar-Bestellung ab, bevor die Station einfriert. Dieser Raum lädt Python mit pandas und statsmodels: Das erste Rätsel, das ihr öffnet, braucht einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Das erfrorene Logbuch | Fehlende Werte finden (`isna`), zeitbasierte Interpolation, warum Lücken keine Nullen werden dürfen | 🔎 Eine Seite aus dem Logbuch |
| 2 | Der driftende Gefriersensor | Deterministischer vs. stochastischer Trend: Trendbereinigung mit einer Geraden, dann ein AR(2)-Modell mit statsmodels | 🔎 Notiz des Technikers |
| 3 | Die Methode der Leiterin | Zeitliche Aufteilung in Training und Test, naive und saisonal naive Baselines, mittlerer absoluter Fehler | 🔎 Das Notizbuch der Leiterin |
| 4 | Die Stationaritätsanzeige | Log-Transformation bei wachsenden saisonalen Ausschlägen, saisonale und erste Differenzen, der ADF-Test | 1. Das erfrorene Logbuch (sein Ergebnis), 🔎 Die Anzeigetafel |
| 5 | Die Echokammer | ACF und PACF lesen, MA- vs. AR-Signaturen, ARIMA/SARIMA-Kandidaten per AIC vergleichen, Differenzieren im Modell (d, D) | 1. Das erfrorene Logbuch (sein Ergebnis), 4. Die Stationaritätsanzeige (sein Ergebnis), 🔎 Das Handbuch zum Echolot |
| 6 | Das Versorgungsterminal (Abschluss-Schloss) | SARIMA auf der Log-Skala anpassen, prognostizieren, mit `exp` zurücktransformieren, ein Modell gegen eine Baseline prüfen | 1. Das erfrorene Logbuch (sein Ergebnis), 3. Die Methode der Leiterin (sein Ergebnis), 5. Die Echokammer (sein Ergebnis), 🔒 2. Der driftende Gefriersensor, 🔎 Das Bestellformular |

## Stationen

### 1. Das erfrorene Logbuch

**Übt:** Fehlende Werte finden (`isna`), zeitbasierte Interpolation, warum Lücken keine Nullen werden dürfen  
**Braucht:** 🔎 Eine Seite aus dem Logbuch  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Aufgabe:**

> Das Heizöl-Logbuch der Station ist die Grundlage jeder Prognose hier, aber der Zähler ist ein paarmal eingefroren und hat leere Monate hinterlassen.
>
> Findet heraus, wie viele Monate fehlen (`n_missing`), und füllt die Lücken so, wie es auf der Logbuchseite steht. Speichert das Ergebnis in `fuel_filled`. Kein Monat darf leer bleiben.

<details><summary>Startcode</summary>

```python
from helpers import show_plot

# fuel ist geladen: Liter pro Monat, Januar 2010 bis Dezember 2025.
print(fuel.head(12))
show_plot(fuel, title="Heizöl pro Monat")

n_missing = 0          # wie viele Monate haben keinen Messwert?
fuel_filled = fuel     # die Reihe mit gefüllten Lücken (siehe Logbuchseite)
```

</details>

**Musterlösung:**

```python
from helpers import show_plot

print(fuel[fuel.isna()])
n_missing = int(fuel.isna().sum())
fuel_filled = fuel.interpolate(method="time")
show_plot(fuel, fuel_filled, labels=["with gaps", "filled"], title="Fuel per month")
```

**Geprüftes Ergebnis** (`[n_missing, int(fuel_filled.isna().sum()), [round(float(fuel_filled[d])) for d in ["2013-07-01", "2017-02-01", "2017-03-01", "2021-11-01"]]]`):

```json
[4, 0, [2378, 4140, 3744, 4403]]
```

**Zeigt nach dem Lösen:**

> Das Logbuch ist wieder vollständig: vier eingefrorene Monate mit `fuel.interpolate(method="time")` gefüllt, im Verhältnis zur Zeit zwischen den Messungen.
>
> Jede Station, die mit dem Heizöl-Logbuch arbeitet, braucht es genau so repariert.

**Hinweise:**

1. `fuel.isna()` markiert die leeren Monate; `.sum()` zählt sie, und `fuel[fuel.isna()]` zeigt, welche es sind.
2. pandas kann Lücken zwischen bekannten Werten füllen: `Series.interpolate`. Die Logbuchseite verlangt eine Füllung im Verhältnis zur Zeit, also `method="time"`.
3. `n_missing = int(fuel.isna().sum())` und `fuel_filled = fuel.interpolate(method="time")`.

### 2. Der driftende Gefriersensor

**Übt:** Deterministischer vs. stochastischer Trend: Trendbereinigung mit einer Geraden, dann ein AR(2)-Modell mit statsmodels  
**Braucht:** 🔎 Notiz des Technikers  
**Daten:** [freezer.py](../../content/rooms/ts-nordlys/data/freezer.py)

**Aufgabe:**

> Der Probengefrierschrank ist mit einem zweistelligen Tastenfeld gesichert. Sein Temperaturprotokoll ist als `freezer` geladen.
>
> Der Code steckt darin, wie die Temperatur von Stunde zu Stunde schwankt: Die Notiz des Technikers erklärt, wie man ihn abliest. Gebt die zwei Ziffern ein.

<details><summary>Startcode</summary>

```python
import statsmodels.api as sm
from helpers import show_plot

# freezer ist geladen: ein Temperaturwert pro Stunde.
show_plot(freezer, title="Temperatur im Gefrierschrank")

# 1. Entfernt die Drift des Sensors (siehe Notiz des Technikers).
# 2. Passt ein AR(2)-Modell an das an, was übrig bleibt, zum Beispiel:
#    sm.tsa.ARIMA(werte, order=(2, 0, 0), trend="n").fit().params
```

</details>

**Musterlösung:**

```python
import statsmodels.api as sm
from helpers import show_plot
hours = np.arange(len(freezer))
slope, intercept = np.polyfit(hours, freezer.values, 1)
residuals = freezer.values - (slope * hours + intercept)
show_plot(pd.Series(residuals, index=freezer.index), title="Freezer without the drift")
ar1, ar2, sigma2 = sm.tsa.ARIMA(residuals, order=(2, 0, 0), trend="n").fit().params
print(ar1, ar2)
print(f"{abs(round(ar1 * 10))}{abs(round(ar2 * 10))}")
```

**Antwort:** `63`

**Zeigt nach dem Lösen:**

> Der Gefrierschrank springt auf. Innen an der Tür klebt: **PIN Versorgungsterminal: 4711**

**Hinweise:**

1. Plottet `freezer`: Die Kurve kriecht in einer Geraden nach oben. Diese Gerade ist der Sensor, nicht der Gefrierschrank. Passt sie mit `np.polyfit(stunden, freezer.values, 1)` an und zieht sie ab.
2. Differenziert keine gerade Drift: Das verzerrt die Schwankungen und ergibt den falschen Code. Passt `sm.tsa.ARIMA(residuen, order=(2, 0, 0), trend="n").fit()` auf die trendbereinigten Werte an und seht euch `.params` an.
3. Die beiden AR-Koeffizienten sind etwa 0,59 und −0,29. Mal zehn, gerundet, ohne Vorzeichen: Der Code ist 63.

### 3. Die Methode der Leiterin

**Übt:** Zeitliche Aufteilung in Training und Test, naive und saisonal naive Baselines, mittlerer absoluter Fehler  
**Braucht:** 🔎 Das Notizbuch der Leiterin  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Aufgabe:**

> Bevor man einem Modell traut, muss es die Faustregeln schlagen, die schon benutzt werden. Testet zwei davon auf dem Testzeitraum, den das Notizbuch der Leiterin nennt, und trainiert auf allem davor:
>
> `naive`: jeder Testmonat gleich dem letzten Trainingsmonat.
> `seasonal_naive`: die Regel der Leiterin selbst, so wie sie sie in ihrem Notizbuch beschreibt.
>
> Berechnet ihre mittleren absoluten Fehler in Litern als `mae_naive` und `mae_snaive`.

<details><summary>Startcode</summary>

```python
# fuel ist geladen: Liter pro Monat, 2010 bis 2025. Seine eingefrorenen Monate
# liegen lange vor dem Testzeitraum und spielen hier keine Rolle.
train = None   # alles vor dem Testzeitraum (siehe Notizbuch der Leiterin)
test = None    # der Testzeitraum, z. B. fuel["2019-01":"2019-12"]

# Prognostiziert den Testzeitraum auf zwei Arten, nur mit train:
naive = None            # jeder Monat = der letzte Monat von train
seasonal_naive = None   # die Regel der Leiterin

mae_naive = None        # mittlerer absoluter Fehler gegenüber test, in Litern
mae_snaive = None
```

</details>

**Musterlösung:**

```python
from helpers import show_plot

train = fuel[:"2023-12"]
test = fuel["2024-01":]
naive = pd.Series(train.iloc[-1], index=test.index)
seasonal_naive = pd.Series(np.tile(train.iloc[-12:].values, 2), index=test.index)
mae_naive = (naive - test).abs().mean()
mae_snaive = (seasonal_naive - test).abs().mean()
print(round(mae_naive), round(mae_snaive))
show_plot(train["2021":], test, seasonal_naive, labels=["train", "test", "seasonal naive"])
```

**Geprüftes Ergebnis** (`[round(float(mae_naive)), round(float(mae_snaive))]`):

```json
[1519, 602]
```

**Zeigt nach dem Lösen:**

> Die Faustregel der Leiterin (saisonal naiv) liegt im Schnitt **602 Liter** pro Monat daneben, die naive Prognose 1519.
>
> Das Versorgungsterminal wird nach den 602 der Leiterin fragen, und nach einem Modell, das sie auf demselben Testzeitraum schlägt, 2024–2025.

**Hinweise:**

1. Lest das Notizbuch der Leiterin: Es sagt, was ihre Regel vorhersagt, und die Notiz darunter nennt den Testzeitraum. Schneidet nach Datum mit `fuel[:"JJJJ-MM"]` und `fuel["JJJJ-MM":]`.
2. `train.iloc[-1]` ist der letzte Trainingsmonat; `np.tile(train.iloc[-12:].values, 2)` wiederholt das letzte Trainingsjahr zweimal. Beide Prognosen brauchen die Testmonate als Index: `pd.Series(..., index=test.index)`. Der MAE ist `(prognose - test).abs().mean()`.
3. Getestet wird auf 2024–2025: `train = fuel[:"2023-12"]`, `test = fuel["2024-01":]`, `naive = pd.Series(train.iloc[-1], index=test.index)`, `seasonal_naive = pd.Series(np.tile(train.iloc[-12:].values, 2), index=test.index)`, dann `mae_naive = (naive - test).abs().mean()` und dasselbe für `mae_snaive`.

### 4. Die Stationaritätsanzeige

**Übt:** Log-Transformation bei wachsenden saisonalen Ausschlägen, saisonale und erste Differenzen, der ADF-Test  
**Braucht:** 1. Das erfrorene Logbuch (sein Ergebnis), 🔎 Die Anzeigetafel  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Aufgabe:**

> SARIMA-Modelle müssen wissen, wie weit die Reihe von stationär entfernt ist. Die Anzeige an der Wand führt einen ADF-Test aus und wird erst unter p = 0,05 grün.
>
> Das Heizöl-Logbuch hat noch seine eingefrorenen Monate: Repariert sie genau so, wie es die Logbuch-Station tut. Transformiert die Reihe dann Schritt für Schritt, wie es die Anzeigetafel beschreibt, bis sie stationär ist. Speichert das Ergebnis in `stationary` (ohne die leeren Zeilen, die beim Differenzieren entstehen) und seinen ADF-p-Wert in `adf_p`.

<details><summary>Startcode</summary>

```python
from statsmodels.tsa.stattools import adfuller
from helpers import show_plot

fuel_filled = fuel   # hat noch die eingefrorenen Monate: repariert sie wie die Logbuch-Station
print("ADF-p-Wert, unverändert:", adfuller(fuel_filled.dropna())[1])

stationary = fuel_filled   # Schritt für Schritt transformieren (siehe Anzeigetafel)
adf_p = adfuller(stationary.dropna())[1]
print("ADF-p-Wert:", adf_p)
show_plot(stationary, title="Was die Anzeige sieht")
```

</details>

**Musterlösung:**

```python
from statsmodels.tsa.stattools import adfuller
from helpers import show_plot
fuel_filled = fuel.interpolate(method="time")
log_fuel = np.log(fuel_filled)
stationary = log_fuel.diff(12).diff(1).dropna()
adf_p = adfuller(stationary)[1]
print("ADF p-value:", adf_p)
show_plot(stationary, title="log, diff(12), diff(1)")
```

**Geprüftes Ergebnis** (`[len(stationary), round(float(stationary.mean()), 4), round(float(stationary.std()), 4), bool(adf_p < 0.05)]`):

```json
[179, 0.0002, 0.0365, true]
```

**Zeigt nach dem Lösen:**

> Die Nadel schwingt ins Grüne: **log → diff(12) → diff(1)**. Für ein Modell auf der Log-Skala heißt das d = 1 und D = 1: Die Echokammer muss das wissen.

**Hinweise:**

1. Fragt das Logbuch-Team, wie es die Lücken gefüllt hat, und füllt sie genauso: Eine andere Füllung ergibt eine leicht andere Reihe, und die Anzeige nimmt sie nicht an. Plottet dann die Reihe: Die Winterspitzen wachsen mit der Station. Das verlangt zuerst `np.log`, vor jedem Differenzieren.
2. Entfernt dann das Jahresmuster mit `.diff(12)` und den restlichen Trend mit `.diff(1)`. Prüft den p-Wert nach jedem Schritt; ein Schritt allein reicht nicht.
3. `fuel_filled = fuel.interpolate(method="time")`, `stationary = np.log(fuel_filled).diff(12).diff(1).dropna()` und `adf_p = adfuller(stationary)[1]`.

### 5. Die Echokammer

**Übt:** ACF und PACF lesen, MA- vs. AR-Signaturen, ARIMA/SARIMA-Kandidaten per AIC vergleichen, Differenzieren im Modell (d, D)  
**Braucht:** 1. Das erfrorene Logbuch (sein Ergebnis), 4. Die Stationaritätsanzeige (sein Ergebnis), 🔎 Das Handbuch zum Echolot  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Aufgabe:**

> Das Echolot zeigt, wie stark jeder Monat noch frühere Monate widerspiegelt: ACF und PACF der Reihe, mit der die Anzeige grün wurde. Lest die Echos mit dem Handbuch an der Wand und lasst dann die Daten zwischen den Kandidaten des Echolots entscheiden, so wie es das Handbuch sagt.
>
> Die Kandidaten nennen nur ihre AR- und MA-Terme. Ergänzt die Differenzen, die die Anzeige gebraucht hat, passt jeden Kandidaten auf die logarithmierten Trainingsdaten (bis 2023) an und speichert die Ordnungen des Gewinners in `order` und `seasonal_order`.

<details><summary>Startcode</summary>

```python
import statsmodels.api as sm
from helpers import plot_acf, plot_pacf

fuel_filled = fuel           # die eingefrorenen Monate reparieren wie die Logbuch-Station
log_fuel = np.log(fuel_filled)
stationary = None            # die Reihe, mit der die Anzeige grün wurde
plot_acf(stationary)
plot_pacf(stationary)

train = log_fuel[:"2023-12"]
# Die Kandidaten des Echolots als (p, q) und (P, Q): nur die AR- und MA-Terme.
candidates = [
    ((1, 0), (1, 0)),
    ((0, 1), (0, 1)),
    ((1, 1), (0, 1)),
    ((2, 0), (0, 1)),
    ((0, 1), (1, 0)),
]
# d und D: die Differenzen, die die Anzeige gebraucht hat, im Modell. Passt jeden auf train an:
#   sm.tsa.SARIMAX(train, order=(p, d, q), seasonal_order=(P, D, Q, 12)).fit(disp=False)
order = None            # der Gewinner als (p, d, q)
seasonal_order = None   # und als (P, D, Q, 12)
```

</details>

**Musterlösung:**

```python
import statsmodels.api as sm
from helpers import plot_acf, plot_pacf
fuel_filled = fuel.interpolate(method="time")
log_fuel = np.log(fuel_filled)
stationary = log_fuel.diff(12).diff(1).dropna()
plot_acf(stationary)
plot_pacf(stationary)
train = log_fuel[:"2023-12"]
candidates = [((1, 0), (1, 0)), ((0, 1), (0, 1)), ((1, 1), (0, 1)), ((2, 0), (0, 1)), ((0, 1), (1, 0))]
d, D = 1, 1   # from the gauge
best = None
for (p, q), (P, Q) in candidates:
    o, so = (p, d, q), (P, D, Q, 12)
    aic = sm.tsa.SARIMAX(train, order=o, seasonal_order=so).fit(disp=False).aic
    print(o, so, round(aic, 1))
    if best is None or aic < best[0]:
        best = (aic, o, so)
order, seasonal_order = best[1], best[2]
```

**Geprüftes Ergebnis** (`[list(order), list(seasonal_order)]`):

```json
[[0, 1, 1], [0, 1, 1, 12]]
```

**Zeigt nach dem Lösen:**

> Die Echos legen sich: **(0,1,1)(0,1,1,12)**, das klassische Airline-Modell. Ein kurzes Echo bei Lag 1 und eines bei Lag 12, sonst nichts. Das Versorgungsterminal nimmt nur die Zahlen dieses Modells an.

**Hinweise:**

1. Holt euch zuerst das Ergebnis der Anzeige: Es sagt, wie die Reihe stationär wird und welche d und D das bedeutet. Dann hat die ACF zwei deutliche Ausschläge, bei Lag 1 und Lag 12, während die PACF ausklingt; einzelne Balken, die das gestrichelte Band gerade berühren, sind Rauschen. Laut Handbuch heißt das MA-Terme: q = 1 und Q = 1.
2. Passt auf `train` an (die Log-Reihe), nicht auf `stationary`: Mit d = 1 und D = 1 differenziert das Modell selbst. Die letzte Zeile des Handbuchs sagt, wie die Daten entscheiden: Geht in einer Schleife durch `candidates`, lest `.fit(disp=False).aic` und behaltet den kleinsten.
3. `stationary = log_fuel.diff(12).diff(1).dropna()`; mit d = D = 1 hat den kleinsten AIC (etwa −635) `order = (0, 1, 1)` mit `seasonal_order = (0, 1, 1, 12)`.

### 6. Das Versorgungsterminal (Abschluss-Schloss)

**Übt:** SARIMA auf der Log-Skala anpassen, prognostizieren, mit `exp` zurücktransformieren, ein Modell gegen eine Baseline prüfen  
**Braucht:** 1. Das erfrorene Logbuch (sein Ergebnis), 3. Die Methode der Leiterin (sein Ergebnis), 5. Die Echokammer (sein Ergebnis), 🔒 2. Der driftende Gefriersensor, 🔎 Das Bestellformular  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Zahlenschloss** (öffnet mit `4711`):

> Das Versorgungsterminal ist gesperrt. Der Bildschirm verlangt eine vierstellige PIN.

**Aufgabe:**

> Die Heizung läuft wieder, sobald die Station das Heizöl für Januar bestellt. Das Terminal nimmt nur eine Bestellung vom Modell der Station an, und nur, wenn dieses Modell die Leiterin auf ihrem eigenen Testzeitraum schlägt.
>
> Setzt `mae_chief` (den Fehler der Leiterin, in Litern), `mae_sarima` (den Fehler eures Modells auf demselben Testzeitraum, in Litern) und `jan_2026` (die Bestellung für Januar 2026, so geschrieben, wie es das Bestellformular verlangt). Das Terminal sagt euch, was ihm nicht passt.

<details><summary>Startcode</summary>

```python
import statsmodels.api as sm

fuel_filled = fuel   # die eingefrorenen Monate reparieren wie die Logbuch-Station
log_fuel = np.log(fuel_filled)
order, seasonal_order = None, None   # der Gewinner aus der Echokammer

mae_chief = None     # der Fehler der Leiterin auf ihrem Testzeitraum, in Litern

# 1. Zeigt, dass das Modell die Leiterin schlägt: auf log_fuel bis zum Beginn ihres Testzeitraums
#    anpassen, diesen Zeitraum prognostizieren und den MAE gegen die echten Liter berechnen.
mae_sarima = None

# 2. Auf ganz log_fuel anpassen und Januar 2026 prognostizieren (siehe Bestellformular).
jan_2026 = None
```

</details>

**Musterlösung:**

```python
import statsmodels.api as sm
from helpers import show_plot
fuel_filled = fuel.interpolate(method="time")
log_fuel = np.log(fuel_filled)
order, seasonal_order = (0, 1, 1), (0, 1, 1, 12)
holdout = sm.tsa.SARIMAX(log_fuel[:"2023-12"], order=order, seasonal_order=seasonal_order).fit(disp=False)
forecast = np.exp(holdout.forecast(24))
mae_chief = 602   # from the chief's method
mae_sarima = (forecast - fuel_filled["2024-01":]).abs().mean()
model = sm.tsa.SARIMAX(log_fuel, order=order, seasonal_order=seasonal_order).fit(disp=False)
jan_2026 = float(np.exp(model.forecast(1).iloc[0]))
print(round(mae_sarima), round(jan_2026))
show_plot(fuel_filled["2022":], forecast, labels=["actual", "forecast"])
```

**Geprüftes Ergebnis** (`_supply_check(mae_chief, mae_sarima, jan_2026)`):

```json
"approved"
```

**Hinweise:**

1. Bringt drei Dinge mit: `mae_chief` und ihren Testzeitraum aus der Methode der Leiterin, dazu `order` und `seasonal_order` aus der Echokammer. Passt `sm.tsa.SARIMAX(log_fuel[:letzter_trainingsmonat], order=order, seasonal_order=seasonal_order).fit(disp=False)` an und prognostiziert mit `.forecast()` so viele Monate, wie der Testzeitraum hat.
2. Das Modell prognostiziert Log-Liter; das Bestellformular will echte Liter, also nehmt `np.exp`, bevor ihr vergleicht oder bestellt. Für Januar 2026 passt dasselbe Modell auf ganz `log_fuel` an und nutzt `.forecast(1)`.
3. `fuel_filled = fuel.interpolate(method="time")`, das Modell ist (0,1,1)(0,1,1,12), das Training endet 2023-12 und der Testzeitraum hat 24 Monate. `mae_chief = 602`, `mae_sarima` liegt bei etwa 269 Litern und `jan_2026` bei etwa 7220 Litern.

## Hinweise im Raum

### 🔎 Eine Seite aus dem Logbuch

*Gebraucht von: 1. Das erfrorene Logbuch*

> HEIZÖL-LOGBUCH · Notizen von Sigrid (Technik)
>
> Wenn der Zähler einfriert, zeichnet er gar nichts auf. Diese Monate sind also leer, nicht null.
>
> Füllt eine Lücke aus den Werten davor und danach, im Verhältnis zur Zeit dazwischen. Tragt nie eine 0 ein: Die Station hat nie aufgehört zu heizen.

### 🔎 Notiz des Technikers

*Gebraucht von: 2. Der driftende Gefriersensor*

> GEFRIERSENSOR, vor der Wartung lesen!
>
> Der Sensor driftet jede Stunde um denselben kleinen Betrag nach oben, eine Gerade. Entfernt diese Gerade, bevor ihr irgendetwas analysiert. Sie NICHT wegdifferenzieren.
>
> Übrig bleibt ein AR(2)-Prozess. Tastencode = beide AR-Koeffizienten × 10, gerundet, ohne Vorzeichen, erst der erste, dann der zweite.

### 🔎 Das Notizbuch der Leiterin

*Gebraucht von: 3. Die Methode der Leiterin*

> Ingrid Solberg, Stationsleiterin:
>
> "Modelle, schmodelle. Ich bestelle genau das, was wir im selben Monat letztes Jahr verbraucht haben. Klappt seit Jahren."
>
> Darunter, in einer anderen Handschrift: "Wirklich? Testet es auf 2024–2025."

### 🔎 Die Anzeigetafel

*Gebraucht von: 4. Die Stationaritätsanzeige*

> STATIONARITÄTSANZEIGE · ADF-Test, grün unter p = 0,05
>
> 1. Wachsen die Ausschläge mit dem Niveau? Zuerst logarithmieren.
>
> 2. Ein Muster, das sich jedes Jahr wiederholt? Um ein Jahr differenzieren.
>
> 3. Driftet es immer noch? Um einen Monat differenzieren.

### 🔎 Das Handbuch zum Echolot

*Gebraucht von: 5. Die Echokammer*

> ECHOS LESEN (ACF und PACF einer stationären Reihe)
>
> ACF bricht nach Lag k ab, PACF klingt aus → MA(k).
>
> PACF bricht nach Lag k ab, ACF klingt aus → AR(k).
>
> Dasselbe bei Lag 12, 24, … ergibt den saisonalen Teil (P oder Q).
>
> Balken innerhalb des gestrichelten Bands sind Rauschen. Im Zweifel entscheidet der AIC: kleiner ist besser.

### 🔎 Das Bestellformular

*Gebraucht von: 6. Das Versorgungsterminal*

> HEIZÖLBESTELLUNG · Januar 2026
>
> Liter: die Prognose des Stationsmodells, zurück auf der ursprünglichen Skala (nicht in Log-Einheiten!).
>
> Angenommen werden nur Bestellungen von einem Modell, das die Methode der Leiterin auf ihrem eigenen Testzeitraum schlägt. Gebt auch ihren Fehler an, damit das Terminal vergleichen kann.
>
> Das Terminal ist mit einer PIN gesperrt. Sigrid bewahrt die PIN irgendwo im Kalten auf.

### 🔎 Ein vereistes Fenster

*Gebraucht von: nur Atmosphäre*

> Grüne und violette Lichter wogen über die Polarnacht. Nordlys: Nordlicht. Jemand hat eine Sinuskurve ins Eis gemalt und "Saisonalität!" daneben geschrieben.
