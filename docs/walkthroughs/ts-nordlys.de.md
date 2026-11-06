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
| 3 | Die Methode der Leiterin | Zeitliche Aufteilung in Training und Test, naive und saisonal naive Baselines, mittlerer absoluter Fehler | 1. Das erfrorene Logbuch, 🔎 Das Notizbuch der Leiterin |
| 4 | Die Stationaritätsanzeige | Log-Transformation bei wachsenden saisonalen Ausschlägen, saisonale und erste Differenzen, der ADF-Test | 1. Das erfrorene Logbuch, 🔎 Die Anzeigetafel |
| 5 | Die Echokammer | ACF und PACF lesen, MA- vs. AR-Signaturen, ARIMA/SARIMA-Kandidaten per AIC vergleichen, Differenzieren im Modell (d, D) | 4. Die Stationaritätsanzeige, 🔎 Das Handbuch zum Echolot |
| 6 | Das Versorgungsterminal (Abschluss-Schloss) | SARIMA auf der Log-Skala anpassen, prognostizieren, mit `exp` zurücktransformieren, ein Modell gegen eine Baseline prüfen | 2. Der driftende Gefriersensor, 3. Die Methode der Leiterin, 5. Die Echokammer, 🔎 Das Bestellformular |

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

> Das Logbuch ist wieder vollständig: vier eingefrorene Monate, im Verhältnis zur Zeit zwischen den Messungen gefüllt.

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
**Braucht:** 1. Das erfrorene Logbuch, 🔎 Das Notizbuch der Leiterin  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Aufgabe:**

> Bevor man einem Modell traut, muss es die einfachen Regeln schlagen, die schon benutzt werden. Haltet 2024–2025 als Testzeitraum zurück und trainiert auf allem davor.
>
> Prognostiziert den Testzeitraum mit zwei Baselines: `naive` (jeder Monat gleich dem letzten Trainingsmonat) und `seasonal_naive` (jeder Monat gleich demselben Monat ein Jahr vorher). Berechnet ihre mittleren absoluten Fehler in Litern als `mae_naive` und `mae_snaive`.

<details><summary>Startcode</summary>

```python
fuel_filled = fuel.interpolate(method="time")   # das reparierte Logbuch
train = fuel_filled[:"2023-12"]
test = fuel_filled["2024-01":]

# Prognostiziert 2024-2025 auf zwei Arten, nur mit train:
naive = None            # jeder Monat = der letzte Monat von train
seasonal_naive = None   # jeder Monat = derselbe Monat ein Jahr vorher

mae_naive = None        # mittlerer absoluter Fehler gegenüber test, in Litern
mae_snaive = None
```

</details>

**Musterlösung:**

```python
from helpers import show_plot

fuel_filled = fuel.interpolate(method="time")
train = fuel_filled[:"2023-12"]
test = fuel_filled["2024-01":]
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

> Die Faustregel der Leiterin (saisonal naiv) liegt im Schnitt **602 Liter** pro Monat daneben, die naive Prognose 1519. Jedes Modell, das ihr baut, muss 602 schlagen.

**Hinweise:**

1. `train.iloc[-1]` ist der letzte Trainingsmonat, `train.iloc[-12:]` das letzte Trainingsjahr. Beide Prognosen brauchen die 24 Testmonate als Index: `pd.Series(..., index=test.index)`.
2. Die saisonal naive Prognose wiederholt das letzte Trainingsjahr zweimal: `np.tile(train.iloc[-12:].values, 2)`. Der MAE ist `(prognose - test).abs().mean()`.
3. `naive = pd.Series(train.iloc[-1], index=test.index)`, `seasonal_naive = pd.Series(np.tile(train.iloc[-12:].values, 2), index=test.index)`, dann `mae_naive = (naive - test).abs().mean()` und dasselbe für `mae_snaive`.

### 4. Die Stationaritätsanzeige

**Übt:** Log-Transformation bei wachsenden saisonalen Ausschlägen, saisonale und erste Differenzen, der ADF-Test  
**Braucht:** 1. Das erfrorene Logbuch, 🔎 Die Anzeigetafel  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Aufgabe:**

> SARIMA-Modelle müssen wissen, wie weit die Reihe von stationär entfernt ist. Die Anzeige an der Wand führt einen ADF-Test aus und wird erst unter p = 0,05 grün.
>
> Transformiert die gefüllte Heizölreihe Schritt für Schritt, wie es die Anzeigetafel beschreibt, bis sie stationär ist. Speichert das Ergebnis in `stationary` (ohne die leeren Zeilen, die beim Differenzieren entstehen) und seinen ADF-p-Wert in `adf_p`.

<details><summary>Startcode</summary>

```python
from statsmodels.tsa.stattools import adfuller
from helpers import show_plot

fuel_filled = fuel.interpolate(method="time")
print("ADF-p-Wert, unverändert:", adfuller(fuel_filled)[1])

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

> Die Nadel schwingt ins Grüne: **log → diff(12) → diff(1)**. Merkt es euch als d = 1 und D = 1 auf der Log-Skala.

**Hinweise:**

1. Plottet die Reihe: Die Winterspitzen wachsen mit der Station. Das verlangt zuerst `np.log`, vor jedem Differenzieren.
2. Entfernt dann das Jahresmuster mit `.diff(12)` und den restlichen Trend mit `.diff(1)`. Prüft den p-Wert nach jedem Schritt; ein Schritt allein reicht nicht.
3. `stationary = np.log(fuel_filled).diff(12).diff(1).dropna()` und `adf_p = adfuller(stationary)[1]`.

### 5. Die Echokammer

**Übt:** ACF und PACF lesen, MA- vs. AR-Signaturen, ARIMA/SARIMA-Kandidaten per AIC vergleichen, Differenzieren im Modell (d, D)  
**Braucht:** 4. Die Stationaritätsanzeige, 🔎 Das Handbuch zum Echolot  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Aufgabe:**

> Das Echolot zeigt, wie stark jeder Monat noch frühere Monate widerspiegelt: ACF und PACF der stationären Reihe. Lest die Echos mit dem Handbuch an der Wand und lasst dann die Daten zwischen den Kandidatenmodellen entscheiden.
>
> Passt jeden Kandidaten auf die logarithmierten Trainingsdaten (bis 2023) an und behaltet den mit dem kleinsten AIC. Speichert seine Ordnungen in `order` und `seasonal_order`.

<details><summary>Startcode</summary>

```python
import statsmodels.api as sm
from helpers import plot_acf, plot_pacf

log_fuel = np.log(fuel.interpolate(method="time"))
stationary = log_fuel.diff(12).diff(1).dropna()   # von der Anzeigetafel
plot_acf(stationary)
plot_pacf(stationary)

train = log_fuel[:"2023-12"]
candidates = [
    ((1, 1, 0), (1, 1, 0, 12)),
    ((0, 1, 1), (0, 1, 1, 12)),
    ((1, 1, 1), (0, 1, 1, 12)),
    ((2, 1, 0), (0, 1, 1, 12)),
    ((0, 1, 1), (1, 1, 0, 12)),
]
# Passt jeden Kandidaten auf train an (d=1 und D=1 differenzieren im Modell):
#   sm.tsa.SARIMAX(train, order=..., seasonal_order=...).fit(disp=False).aic
order = None            # der Gewinner, z. B. (p, d, q)
seasonal_order = None   # z. B. (P, D, Q, 12)
```

</details>

**Musterlösung:**

```python
import statsmodels.api as sm
from helpers import plot_acf, plot_pacf
log_fuel = np.log(fuel.interpolate(method="time"))
stationary = log_fuel.diff(12).diff(1).dropna()
plot_acf(stationary)
plot_pacf(stationary)
train = log_fuel[:"2023-12"]
candidates = [((1, 1, 0), (1, 1, 0, 12)), ((0, 1, 1), (0, 1, 1, 12)), ((1, 1, 1), (0, 1, 1, 12)), ((2, 1, 0), (0, 1, 1, 12)), ((0, 1, 1), (1, 1, 0, 12))]
best = None
for o, so in candidates:
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

> Die Echos legen sich: **(0,1,1)(0,1,1,12)**, das klassische Airline-Modell. Ein kurzes Echo bei Lag 1 und eines bei Lag 12, sonst nichts.

**Hinweise:**

1. Die ACF hat zwei deutliche Ausschläge, bei Lag 1 und Lag 12, während die PACF ausklingt; einzelne Balken, die das gestrichelte Band gerade berühren, sind Rauschen. Laut Handbuch heißt das MA-Terme: q = 1 und Q = 1.
2. Passt auf `train` an (die Log-Reihe), nicht auf `stationary`: `d=1, D=1` differenzieren schon im Modell. Geht in einer Schleife durch `candidates`, lest `.fit(disp=False).aic` und merkt euch den kleinsten.
3. Den kleinsten AIC (etwa −635) hat `order = (0, 1, 1)` mit `seasonal_order = (0, 1, 1, 12)`.

### 6. Das Versorgungsterminal (Abschluss-Schloss)

**Übt:** SARIMA auf der Log-Skala anpassen, prognostizieren, mit `exp` zurücktransformieren, ein Modell gegen eine Baseline prüfen  
**Braucht:** 2. Der driftende Gefriersensor, 3. Die Methode der Leiterin, 5. Die Echokammer, 🔎 Das Bestellformular  
**Daten:** [fuel.py](../../content/rooms/ts-nordlys/data/fuel.py)

**Aufgabe:**

> Die Heizung läuft wieder, sobald die Station das Heizöl für Januar bestellt. Das Terminal nimmt nur eine Bestellung von einem Modell an, das die Leiterin auf 2024–2025 schlägt, und es braucht seine PIN.
>
> Setzt `mae_sarima` (Holdout-Fehler eures Modells in Litern), `jan_2026` (die Prognose für Januar 2026 in Litern) und `pin`. Das Terminal sagt euch, was ihm nicht passt.

<details><summary>Startcode</summary>

```python
import statsmodels.api as sm

fuel_filled = fuel.interpolate(method="time")
log_fuel = np.log(fuel_filled)
order, seasonal_order = (0, 0, 0), (0, 0, 0, 12)   # der Gewinner aus der Echokammer

# 1. Zeigt, dass das Modell die Leiterin schlägt: auf log_fuel bis 2023-12 anpassen, die 24 Monate
#    2024-2025 prognostizieren, zurücktransformieren und den MAE gegen die echten Liter berechnen.
mae_sarima = None

# 2. Auf ganz log_fuel anpassen, Januar 2026 prognostizieren, in Liter zurücktransformieren.
jan_2026 = None

pin = None   # die PIN des Versorgungsterminals
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
mae_sarima = (forecast - fuel_filled["2024-01":]).abs().mean()
model = sm.tsa.SARIMAX(log_fuel, order=order, seasonal_order=seasonal_order).fit(disp=False)
jan_2026 = float(np.exp(model.forecast(1).iloc[0]))
pin = 4711
print(round(mae_sarima), round(jan_2026))
show_plot(fuel_filled["2022":], forecast, labels=["actual", "forecast"])
```

**Geprüftes Ergebnis** (`_supply_check(pin, jan_2026, mae_sarima)`):

```json
"approved"
```

**Hinweise:**

1. Nehmt das Airline-Modell aus der Echokammer. Passt `sm.tsa.SARIMAX(log_fuel[:"2023-12"], order=order, seasonal_order=seasonal_order).fit(disp=False)` an, prognostiziert 24 Monate und nehmt `np.exp`, bevor ihr mit echten Litern vergleicht.
2. Für Januar 2026 passt dasselbe Modell auf ganz `log_fuel` an und nutzt `.forecast(1)`. Die PIN war im Gefrierschrank.
3. `mae_sarima` liegt bei etwa 269 Litern und `jan_2026` bei etwa 7220 Litern; die PIN ist 4711.

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
> Angenommen werden nur Bestellungen von einem Modell, das die Methode der Leiterin auf 2024–2025 schlägt.
>
> Freigabe mit der PIN des Versorgungsterminals.

### 🔎 Ein vereistes Fenster

*Gebraucht von: nur Atmosphäre*

> Grüne und violette Lichter wogen über die Polarnacht. Nordlys: Nordlicht. Jemand hat eine Sinuskurve ins Eis gemalt und "Saisonalität!" daneben geschrieben.
