# Das Schokoladen-Experiment: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Kakaowerk Kleeberg, die Nacht vor der Vorstandssitzung. Um 8 Uhr entscheidet der Vorstand über drei Änderungen, die diesen Herbst getestet wurden: ein neues Rezept, einen neuen Webshop-Checkout und die Verpackungslinie. Ana Berger, Leiterin der Datenanalyse, kam heute Nachmittag ins Krankenhaus, ihre Analysen nur halb fertig. Ihr seid geblieben, um sie abzuschließen, und um Mitternacht hat die Sicherheitsanlage alle Türen verriegelt.
>
> Plant sorgfältig, testet ehrlich, entscheidet nur, was die Daten hergeben, und findet einen Weg hinaus. Dieser Raum lädt Python mit pandas und scipy: Das erste Rätsel, das ihr öffnet, braucht einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Die Planungstafel | Versuchsplanung (Randomisierung, Kontrollgruppe, Verblindung, Störfaktoren), Signifikanzniveau und Teststärke, Stichprobenumfang für den Vergleich zweier Mittelwerte | von Anfang an offen |
| 2 | Die Waage an der Verpackungslinie | Konfidenzintervalle für einen Mittelwert (t-Verteilung, Standardfehler), der Einstichproben-t-Test, wie Intervalle und Tests zusammenpassen | 🔎 Das Qualitätshandbuch |
| 3 | Anas Laptop: Bestellwerte | Der zentrale Grenzwertsatz, Stichprobenverteilungen und der Standardfehler, Schiefe, Simulation mit numpy | 🔎 Eine Notiz von Ana |
| 4 | Der Verkostungsraum | Der Zweistichproben-t-Test (Welch), ein- vs. zweiseitige Tests, Entscheiden mit einem vorab registrierten Signifikanzniveau | 1. Die Planungstafel (sein Ergebnis), 🔒 1. Die Planungstafel, 🔎 Das Verkostungsprotokoll |
| 5 | Das Webshop-Dashboard | Chi-Quadrat-Tests: Anpassung (Sample Ratio Mismatch) und Unabhängigkeit (Konversion je Variante), Kontingenztafeln, Konversionsraten | 🔒 3. Anas Laptop: Bestellwerte |
| 6 | Die Freigabekonsole (Abschluss-Schloss) | Testergebnisse in Entscheidungen übersetzen | 2. Die Waage an der Verpackungslinie (sein Ergebnis), 3. Anas Laptop: Bestellwerte (sein Ergebnis), 4. Der Verkostungsraum (sein Ergebnis), 5. Das Webshop-Dashboard (sein Ergebnis), 🔎 Die Tagesordnung für morgen |

**Abschluss-Code:** `5294`

## Stationen

### 1. Die Planungstafel

**Übt:** Versuchsplanung (Randomisierung, Kontrollgruppe, Verblindung, Störfaktoren), Signifikanzniveau und Teststärke, Stichprobenumfang für den Vergleich zweier Mittelwerte  
**Braucht:** von Anfang an offen

**Aufgabe:**

> Wie soll der Rezepttest laufen, und wie viele Testpersonen braucht er? Ana hat vier Vorschläge an die Tafel gepinnt:
>
> **A.** Im November das neue Rezept verkaufen und seine Bewertungen mit denen vom Oktober (altes Rezept) vergleichen.
> **B.** Beide Rezepte hinstellen und jede Testperson das wählen lassen, das sie bewerten möchte.
> **C.** Für jede Testperson eine Münze werfen: Kopf, neues Rezept; Zahl, altes. Gleicher Raum, gleicher Nachmittag, identisches neutrales Papier.
> **D.** Unser Personal bewertet das neue Rezept, Kundschaft aus dem Laden das alte.
>
> Nur einer ist ein echtes randomisiertes Experiment: Speichert seinen Buchstaben als `design`.
>
> Dann bestimmt seine Größe mit den Anforderungen des Vorstands, die unter den Vorschlägen stehen: höchstens 1 % Chance auf einen Fehlalarm (einen Unterschied für echt halten, obwohl es keinen gibt), zweiseitig getestet, als `alpha`; und wenn das neue Rezept wirklich 1 Punkt besser ist, soll der Test das in 90 % der Fälle finden, als `power`.
>
> Testpersonen pro Rezept für den Vergleich zweier Mittelwerte: n = 2 · (z₁₋α/₂ + z_power)² · σ² / δ², aufgerundet. Die z-Werte sind Quantile der Standardnormalverteilung, σ ist die Streuung der Bewertungen und δ der Unterschied, den man finden will. Speichert es als `n_per_group`.

<details><summary>Startcode</summary>

```python
import math
from scipy import stats

design = None        # das echte randomisierte Experiment: "A", "B", "C" oder "D"
alpha = None         # Signifikanzniveau: die akzeptierte Chance auf einen Fehlalarm
power = None         # die Chance, einen echten Unterschied von delta zu finden

sigma = 1.6          # Streuung (Standardabweichung) der Bewertungen in früheren Verkostungen
delta = 1.0          # der Unterschied, der sich lohnt, in Bewertungspunkten

# stats.norm.ppf(q) ist der Wert, unter dem ein Anteil q der Standardnormalverteilung liegt.
n_per_group = None   # Testpersonen pro Rezept, aufgerundet
```

</details>

**Musterlösung:**

```python
import math
from scipy import stats

design = "C"
alpha = 0.01
power = 0.9
sigma, delta = 1.6, 1.0
z_alpha = stats.norm.ppf(1 - alpha / 2)
z_power = stats.norm.ppf(power)
n_per_group = math.ceil(2 * (z_alpha + z_power) ** 2 * sigma ** 2 / delta ** 2)
print(round(z_alpha, 3), round(z_power, 3), n_per_group)
```

**Geprüftes Ergebnis** (`[str(design).strip().upper(), float(alpha), float(power), int(n_per_group)]`):

```json
["C", 0.01, 0.9, 77]
```

**Zeigt nach dem Lösen:**

> Anas Präregistrierung ist eingereicht: Design C, **77 Testpersonen pro Rezept**, und für beide Experimente des Relaunchs, die Verkostung und den Checkout-Test, zweiseitige Tests mit **α = 0,01**. Sobald die Daten da sind, akzeptiert der Vorstand kein anderes Signifikanzniveau mehr.

**Hinweise:**

1. A und D vergleichen Gruppen, die sich in mehr als dem Rezept unterscheiden (der Monat; Personal vs. Kundschaft), und in B wählen die Testpersonen selbst. Nur in C entscheidet allein der Zufall, wer was probiert.
2. Ein Fehlalarm ist ein Fehler 1. Art, also `alpha = 0.01`; `power = 0.9`. Zweiseitig: z₁₋α/₂ = `stats.norm.ppf(1 - alpha / 2)` (2,576), und z_power = `stats.norm.ppf(power)` (1,282).
3. `n_per_group = math.ceil(2 * (stats.norm.ppf(0.995) + stats.norm.ppf(0.9)) ** 2 * sigma ** 2 / delta ** 2)`, also 77, mit `design = "C"`.

### 2. Die Waage an der Verpackungslinie

**Übt:** Konfidenzintervalle für einen Mittelwert (t-Verteilung, Standardfehler), der Einstichproben-t-Test, wie Intervalle und Tests zusammenpassen  
**Braucht:** 🔎 Das Qualitätshandbuch  
**Daten:** [scale.py](../../content/rooms/stats-ab/data/scale.py)

**Aufgabe:**

> Die Verpackungslinie füllt Tafeln, die als 100 g verkauft werden. Heute Abend wurden 30 Tafeln zufällig entnommen und gewogen: `weights`, in Gramm. Muss die Linie neu kalibriert werden?
>
> 1. Ein Konfidenzintervall für das mittlere Gewicht der Linie, auf dem vorgeschriebenen Niveau, mit der t-Verteilung: `ci_low` und `ci_high`.
> 2. Ein Einstichproben-t-Test der Gewichte gegen 100 g, zweiseitig: `p_value`.
> 3. Eure Entscheidung: `recalibrate` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
from scipy import stats

# weights ist geladen: 30 Tafeln, in Gramm.
print(weights.describe())

ci_low, ci_high = None, None   # Konfidenzintervall für das mittlere Gewicht
p_value = None                 # Einstichproben-t-Test gegen 100 g
recalibrate = None             # True oder False
```

</details>

**Musterlösung:**

```python
from scipy import stats

mean = weights.mean()
se = stats.sem(weights)
ci_low, ci_high = stats.t.interval(0.95, len(weights) - 1, loc=mean, scale=se)
p_value = stats.ttest_1samp(weights, 100).pvalue
recalibrate = not (ci_low <= 100 <= ci_high)
print(round(mean, 2), round(ci_low, 2), round(ci_high, 2), round(p_value, 4), recalibrate)
```

**Geprüftes Ergebnis** (`_scale_check(ci_low, ci_high, p_value, recalibrate)`):

```json
"approved"
```

**Zeigt nach dem Lösen:**

> Die Linie füllt im Schnitt 100,8 g ab. Das Intervall [100,33; 101,27] enthält 100 g nicht, und der t-Test sagt dasselbe (p = 0,002). Jede Tafel verschenkt fast ein Gramm: neu kalibrieren.
>
> Entscheidungskarte „Verpackungslinie“: **9**

**Hinweise:**

1. Das Qualitätshandbuch an der Wand legt das Niveau fest und sagt, wann neu kalibriert wird. Der Standardfehler des Mittelwerts ist `stats.sem(weights)`. `stats.t.interval(niveau, df, loc=mittelwert, scale=se)` liefert das Intervall, mit df = n − 1 = 29.
2. `stats.ttest_1samp(weights, 100)` testet, ob der Mittelwert von 100 g abweicht; sein `.pvalue` ist zweiseitig.
3. Das Handbuch verlangt ein 95-%-Intervall: `stats.t.interval(0.95, 29, loc=weights.mean(), scale=stats.sem(weights))`, etwa [100,33; 101,27], und p ≈ 0,0017. 100 g liegt außerhalb des Intervalls, also `recalibrate = True`.

### 3. Anas Laptop: Bestellwerte

**Übt:** Der zentrale Grenzwertsatz, Stichprobenverteilungen und der Standardfehler, Schiefe, Simulation mit numpy  
**Braucht:** 🔎 Eine Notiz von Ana  
**Daten:** [orders.py](../../content/rooms/stats-ab/data/orders.py)

**Aufgabe:**

> Der Vorstand will mittlere Bestellwerte mit t-Tests vergleichen, aber einzelne Bestellungen sind alles andere als normalverteilt: Ein paar Firmenkunden bestellen für Hunderte Euro. Darf er das? Der zentrale Grenzwertsatz sagt, dass Mittelwerte ausreichend großer Stichproben trotzdem fast normalverteilt sind. Prüft das an allen Bestellungen von 2025, `orders` (Euro), für Stichproben so groß wie in den Umsatzberichten des Vorstands.
>
> 1. Wie schief sind einzelne Bestellungen? `skew_orders`, mit `scipy.stats.skew`.
> 2. Zieht mindestens 1.000 Zufallsstichproben dieser Größe und speichert ihre Mittelwerte in `means`.
> 3. Die Theorie sagt, wie stark solche Mittelwerte schwanken: der Standardfehler, `se_theory`. Vergleicht ihn mit der Streuung eurer Mittelwerte.
> 4. Wie schief sind die Mittelwerte? `skew_means`.
> 5. Euer Urteil: Darf der Vorstand mittlere Bestellwerte mit t-Tests vergleichen? `t_tests_ok` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
import numpy as np
from scipy import stats
from helpers import show_hist

# orders ist geladen: der Wert jeder Bestellung 2025, in Euro.
show_hist(orders, bins=40, title="Einzelne Bestellungen")

skew_orders = None
rng = np.random.default_rng()
n = None            # Stichprobengröße der Vorstandsberichte
means = []          # Mittelwerte von Zufallsstichproben von n Bestellungen
se_theory = None    # wie stark solche Mittelwerte laut Theorie schwanken
skew_means = None
t_tests_ok = None   # True oder False

# show_hist(means, bins=40, title="Stichprobenmittel")
```

</details>

**Musterlösung:**

```python
from scipy import stats
from helpers import show_hist

skew_orders = stats.skew(orders)
rng = np.random.default_rng(1)
n = 50   # the board's reports average 50 orders (Ana's note)
means = [rng.choice(orders, n).mean() for i in range(2000)]
se_theory = orders.std() / np.sqrt(n)
skew_means = stats.skew(means)
t_tests_ok = abs(skew_means) < 1   # close to normal (Ana's note)
print(round(skew_orders, 2), round(se_theory, 2), round(np.std(means), 2), round(skew_means, 2))
show_hist(orders, bins=40, title="Single orders")
show_hist(means, bins=40, title="Means of 50 orders")
```

**Geprüftes Ergebnis** (`_clt_check(skew_orders, means, se_theory, skew_means, t_tests_ok)`):

```json
"approved"
```

**Zeigt nach dem Lösen:**

> Einzelne Bestellungen sind stark schief (Schiefe 3,3), aber Mittelwerte von 50 Bestellungen sind fast normalverteilt (Schiefe etwa 0,5), und sie streuen um **4,99 €**, genau wie σ/√50 vorhersagt. Der Vorstand darf mittlere Bestellwerte mit t-Tests vergleichen.
>
> Entscheidungskarte „Umsatzberichte“: **4**

**Hinweise:**

1. Ana hat eine Notiz an die Wand gepinnt, über die Vorstandsberichte und wie Mittelwerte streuen. `stats.skew(orders)` misst die Schiefe; `rng.choice(orders, n).mean()` ist der Mittelwert einer Zufallsstichprobe von n Bestellungen, also wiederholt das in einer Schleife.
2. Anas Notiz: Die Berichte mitteln jeweils 50 Bestellungen, und Mittelwerte aus n Werten streuen um σ/√n. `means = [rng.choice(orders, 50).mean() for i in range(2000)]`. Der Standardfehler ist `orders.std() / np.sqrt(50)`; vergleicht ihn mit `np.std(means)`.
3. skew_orders ≈ 3,35 und se_theory ≈ 4,99; `np.std(means)` landet nah daran, und `skew_means = stats.skew(means)` ist etwa 0,5: Die Mittelwerte sehen fast normalverteilt aus, also `t_tests_ok = True`.

### 4. Der Verkostungsraum

**Übt:** Der Zweistichproben-t-Test (Welch), ein- vs. zweiseitige Tests, Entscheiden mit einem vorab registrierten Signifikanzniveau  
**Braucht:** 1. Die Planungstafel (sein Ergebnis), 🔒 1. Die Planungstafel, 🔎 Das Verkostungsprotokoll  
**Daten:** [tasting.py](../../content/rooms/stats-ab/data/tasting.py)

**Zahlenschloss** (öffnet mit `77`):

> Der Kühlschrank mit den Bewertungsbögen hat ein Vorhängeschloss. Anas Aufkleber darauf: „Code = Testpersonen pro Rezept, wie geplant.“

**Aufgabe:**

> Die Blindverkostung ist vorbei. Soll das neue Rezept auf den Markt? Die Bewertungen sind als `ratings` geladen: Spalten `taster`, `recipe` ("old" oder "new") und `rating` (1 bis 10).
>
> 1. `diff`: die mittlere Bewertung des neuen Rezepts minus die des alten.
> 2. Der t-Test, der dazu passt, wie die Verkostung lief, ohne gleiche Streuungen anzunehmen: `p_value`.
> 3. Eure Entscheidung: `ship_recipe` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
from scipy import stats

# ratings ist geladen: eine Zeile pro Testperson.
print(ratings.groupby("recipe").rating.describe())

diff = None          # mittlere Bewertung neu minus alt
p_value = None       # der passende t-Test
ship_recipe = None   # True oder False
```

</details>

**Musterlösung:**

```python
from scipy import stats

new = ratings[ratings.recipe == "new"].rating
old = ratings[ratings.recipe == "old"].rating
diff = new.mean() - old.mean()
result = stats.ttest_ind(new, old, equal_var=False)
p_value = result.pvalue
alpha = 0.01   # from the pre-registration
ship_recipe = p_value < alpha
print(round(diff, 2), round(result.statistic, 2), round(p_value, 4), ship_recipe)
```

**Geprüftes Ergebnis** (`_tasting_check(diff, p_value, ship_recipe)`):

```json
"approved"
```

**Zeigt nach dem Lösen:**

> Das neue Rezept liegt 0,6 Punkte höher, mit p = 0,025. Beim üblichen 0,05 sähe das nach einem Sieg aus, aber der Vorstand hat α = 0,01 registriert: Die Belege reichen nicht. Das alte Rezept bleibt, und eine größere Verkostung wird geplant.
>
> Entscheidungskarte „Rezept“: **2**

**Hinweise:**

1. Das Verkostungsprotokoll an der Tür sagt, wie die Verkostung lief: Jede Testperson hat eine Tafel bewertet, die beiden Gruppen sind also unabhängig, nicht gepaart. `new = ratings[ratings.recipe == "new"].rating`, und dasselbe für `old`. Dann `diff = new.mean() - old.mean()`.
2. `stats.ttest_ind(new, old, equal_var=False)` ist der Welch-t-Test; sein `.pvalue` ist zweiseitig. Das Signifikanzniveau kommt aus der Präregistrierung an der Planungstafel.
3. diff ≈ 0,60 und p ≈ 0,025. Das liegt über α = 0,01, also `ship_recipe = False`.

### 5. Das Webshop-Dashboard

**Übt:** Chi-Quadrat-Tests: Anpassung (Sample Ratio Mismatch) und Unabhängigkeit (Konversion je Variante), Kontingenztafeln, Konversionsraten  
**Braucht:** 🔒 3. Anas Laptop: Bestellwerte  
**Daten:** [shop.py](../../content/rooms/stats-ab/data/shop.py)

**Zahlenschloss** (öffnet mit `499`):

> Der Dashboard-Bildschirm ist gesperrt. Anas Klebezettel am Monitor: „PIN = der Standardfehler eines mittleren Bestellwerts in den Vorstandsberichten, in Cent.“

**Aufgabe:**

> Der Checkout-Test hat Besucher zufällig auf drei Checkouts verteilt: A (der alte), B (ein grüner Button) und C (ein einseitiger Checkout). Welcher soll live gehen? Der Export des Dashboards ist als `daily` geladen: Sitzungen und Bestellungen pro Tag und Variante.
>
> 1. Zuerst eine Plausibilitätsprüfung: Die Aufteilung war 1 : 1 : 1 geplant. Macht einen Chi-Quadrat-Anpassungstest auf die Sitzungen pro Variante insgesamt: `srm_p`. Ein winziger p-Wert hieße, die Aufteilung ist kaputt und dem Test ist nicht zu trauen.
> 2. Konvertieren die Varianten unterschiedlich? Macht einen Chi-Quadrat-Unabhängigkeitstest auf eine Tabelle mit einer Zeile pro Variante, mit ihren Bestellungen und ihren Sitzungen ohne Bestellung. Speichert `chi2` und `p_value`.
> 3. `winner`: die Variante mit der höchsten Konversionsrate.
> 4. Ist der Unterschied zwischen den Varianten signifikant? Speichert `significant` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
import pandas as pd
from scipy import stats

# daily ist geladen: Datum, Variante, Sitzungen, Bestellungen.
print(daily.head())

totals = None                # Sitzungen und Bestellungen pro Variante, über die Tage summiert
srm_p = None                 # Anpassungstest: Sitzungen pro Variante vs. gleichmäßige Aufteilung
chi2, p_value = None, None   # Unabhängigkeit: Variante x (Bestellung, keine Bestellung)
winner = None                # "A", "B" oder "C"
significant = None           # True oder False
```

</details>

**Musterlösung:**

```python
import pandas as pd
from scipy import stats

totals = daily.groupby("variant")[["sessions", "orders"]].sum()
srm_p = stats.chisquare(totals.sessions).pvalue
table = pd.DataFrame({"orders": totals.orders, "no_order": totals.sessions - totals.orders})
chi2, p_value, dof, expected = stats.chi2_contingency(table)
rates = totals.orders / totals.sessions
winner = rates.idxmax()
significant = p_value < 0.01   # the registered α
print(totals)
print(rates.round(4))
print(round(srm_p, 3), round(chi2, 2), round(p_value, 5), winner)
```

**Geprüftes Ergebnis** (`_checkout_check(srm_p, chi2, p_value, winner, significant)`):

```json
"approved"
```

**Zeigt nach dem Lösen:**

> Die Aufteilung passt (p = 0,22). Konversion: A 3,0 %, B 3,2 %, C 4,0 %; χ² = 16,7 mit p = 0,0002, weit unter α = 0,01. Der einseitige Checkout geht live.
>
> Entscheidungskarte „Webshop-Checkout“: **5**

**Hinweise:**

1. `totals = daily.groupby("variant")[["sessions", "orders"]].sum()`. `stats.chisquare(totals.sessions)` vergleicht die Sitzungen mit einer gleichmäßigen Aufteilung.
2. Die Tabelle braucht Bestellungen und **Nicht**-Bestellungen pro Variante: `pd.DataFrame({"orders": totals.orders, "no_order": totals.sessions - totals.orders})`. `stats.chi2_contingency(table)` liefert chi2, den p-Wert, die Freiheitsgrade und die erwarteten Häufigkeiten. Das Signifikanzniveau ist das für die Relaunch-Experimente registrierte.
3. srm_p ≈ 0,22, chi2 ≈ 16,68 und p ≈ 0,00024, weit unter α = 0,01, also `significant = True`. `winner = (totals.orders / totals.sessions).idxmax()` ist C.

### 6. Die Freigabekonsole (Abschluss-Schloss)

**Übt:** Testergebnisse in Entscheidungen übersetzen  
**Braucht:** 2. Die Waage an der Verpackungslinie (sein Ergebnis), 3. Anas Laptop: Bestellwerte (sein Ergebnis), 4. Der Verkostungsraum (sein Ergebnis), 5. Das Webshop-Dashboard (sein Ergebnis), 🔎 Die Tagesordnung für morgen

**Aufgabe:**

> Die Konsole am Ausgang gibt die Entscheidungen für morgen frei und entriegelt die Türen. Sie will die vier Ziffern von Anas Entscheidungskarten (jede fertige Analyse druckt eine), in der Reihenfolge der Tagesordnung von morgen.

**Antwort:** `5294`

**Zeigt nach dem Lösen:**

> Die Türen entriegeln. Der Vorstand bekommt morgen eine klare Geschichte: einseitigen Checkout live schalten, Verpackungslinie neu kalibrieren, altes Rezept bis zu einer größeren Verkostung behalten und Bestellwerte mit t-Tests vergleichen.

**Hinweise:**

1. Jede fertige Analyse druckt eine Entscheidungskarte mit einer Ziffer: Verpackungslinie, Umsatzberichte, Rezept und Webshop-Checkout. Heftet sie an eure Notizen.
2. Die Tagesordnung: 1. Webshop-Checkout, 2. neues Rezept, 3. Verpackungslinie, 4. Umsatzberichte.
3. Checkout 5, Rezept 2, Verpackungslinie 9, Umsatzberichte 4: 5294.

## Hinweise im Raum

### 🔎 Das Qualitätshandbuch

*Gebraucht von: 2. Die Waage an der Verpackungslinie*

> QUALITÄTSHANDBUCH · Verpackungslinie, Abschnitt 3
>
> Wiegt 30 zufällig entnommene Tafeln. Berechnet ein 95-%-Konfidenzintervall für das mittlere Gewicht.
>
> Liegt 100 g **außerhalb** des Intervalls, kalibriert die Linie neu. (Das ist dieselbe Entscheidung wie ein zweiseitiger t-Test mit α = 0,05.)

### 🔎 Eine Notiz von Ana

*Gebraucht von: 3. Anas Laptop: Bestellwerte*

> Schiefe lesen (von Ana angepinnt):
>
> 0 heißt symmetrisch, wie eine Normalverteilung. Über 1 heißt stark schief: ein langer Ausläufer großer Werte.
>
> Die Umsatzberichte des Vorstands mitteln immer **50 Bestellungen** auf einmal.
>
> Der ZGWS in einer Zeile: Mittelwerte aus n Werten streuen um σ/√n, und ihre Schiefe schrumpft ungefähr um √n. t-Tests auf Mittelwerten sind also in Ordnung, sobald die Mittelwerte normal aussehen, auch wenn einzelne Werte es nicht tun.

### 🔎 Das Verkostungsprotokoll

*Gebraucht von: 4. Der Verkostungsraum*

> VERKOSTUNGSPROTOKOLL · Rezepttest KW-7
>
> Jede Testperson hat an der Tür eine Münze geworfen (Kopf: neues Rezept, Zahl: altes). Neutrales Papier, gleicher Raum, gleicher Nachmittag. Jede Testperson hat **eine** Tafel bewertet, von 1 (furchtbar) bis 10 (perfekt).

### 🔎 Die Tagesordnung für morgen

*Gebraucht von: 6. Die Freigabekonsole*

> VORSTANDSSITZUNG · Freitag, 8:00 · Tagesordnung
>
> 1. Webshop-Checkout
> 2. Neues Rezept
> 3. Verpackungslinie
> 4. Umsatzberichte

## Handbuch im Raum: 📖 Anas Test-Ordner

**Ein Experiment planen:** `Randomised controlled experiment`, [`alpha, power, two-sided`](https://docs.scipy.org/doc/scipy/tutorial/stats/hypothesis_tests.html), [`stats.norm.ppf(q)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.norm.html), [`Sample size and math.ceil(x)`](https://docs.python.org/3/library/math.html#math.ceil)

**Stichprobenmittel und der ZGS:** `Central limit theorem`, [`stats.skew(x)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.skew.html), [`rng = np.random.default_rng(seed)`](https://numpy.org/doc/stable/reference/random/generated/numpy.random.Generator.choice.html), [`np.sqrt(x)  np.std(x)`](https://numpy.org/doc/stable/reference/generated/numpy.std.html), `from helpers import show_hist`

**Konfidenzintervalle und t-Tests:** [`stats.sem(x)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.sem.html), [`stats.t.interval(confidence, df, loc=mean, scale=se)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.t.html), [`stats.ttest_1samp(x, popmean)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_1samp.html), [`stats.ttest_ind(a, b, equal_var=False)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_ind.html), [`p < alpha`](https://docs.scipy.org/doc/scipy/tutorial/stats/hypothesis_tests.html)

**Häufigkeiten: Chi-Quadrat-Tests:** [`stats.chisquare(observed, f_exp=None)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.chisquare.html), [`stats.chi2_contingency(table)`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.chi2_contingency.html), `Conversion rate`

**pandas für die Auswertung:** [`df[df.col == value].other`](https://pandas.pydata.org/docs/user_guide/indexing.html#boolean-indexing), [`df.groupby(key)[[a, b]].sum()`](https://pandas.pydata.org/docs/user_guide/groupby.html), [`pd.DataFrame({"x": s1, "y": s2})`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.html), [`s.idxmax()`](https://pandas.pydata.org/docs/reference/api/pandas.Series.idxmax.html)
