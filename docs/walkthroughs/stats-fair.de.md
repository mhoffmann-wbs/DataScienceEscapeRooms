# Der gezinkte Jahrmarkt: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Kleeberger Herbstmarkt, Viertel nach Mitternacht. Besucher haben sich beschwert, dass ein Spiel gezinkt ist, also hat euch die Marktkommission als Prüfteam nach Feierabend geschickt. Dann ist hinter euch das Tor zugefallen.
>
> Der Nachtwächter hat eine Notiz am Tor hinterlassen: Jeder Stand, den ihr fertig geprüft habt, bekommt ein Siegel mit einer Ziffer, und die Siegel öffnen das Tor. Prüft die Protokolle der Stände mit Python und findet heraus, welche Zahlen Zufall sind und welche nicht. Dieser Raum lädt Python mit pandas und scipy: Das erste Rätsel, das ihr öffnet, braucht einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Das Becherprotokoll am Limonadenstand | Mittelwert vs. Median, Ausreißer und Datenfehler, die Stichproben-Standardabweichung, Histogramme | 🔎 Kais Notiz an der Kasse |
| 2 | Glückssieben | Ergebnisraum und klassische Wahrscheinlichkeit, relative Häufigkeiten, die Binomialverteilung (cdf), wann ein Ergebnis zu unwahrscheinlich für Zufall ist | 🔎 Das Schild der Glückssieben, 🔎 Das Prüfhandbuch |
| 3 | Der Ententeich | Die Binomialverteilung (pmf, cdf, sf), Erwartungswert, Theorie mit beobachteten Häufigkeiten vergleichen | 🔎 Das Schild am Ententeich |
| 4 | Die Abfüllmaschine | Die Normalverteilung, z-Werte, die Verteilungsfunktion und ihre Umkehrung (ppf), von der Stichprobe zum Modell | 1. Das Becherprotokoll am Limonadenstand (sein Ergebnis), 🔎 Die Füllmengenverordnung |
| 5 | Das Kassenhäuschen | Grundgesamtheit vs. Stichprobe, Parameter vs. Kennzahl, zufällige vs. verzerrte Stichproben, wie stark ein Stichprobenmittel schwankt | 🔒 3. Der Ententeich, 🔎 Brunos Flyer für Sponsoren |
| 6 | Das Tor des Festplatzes (Abschluss-Schloss) | Die Prüfung zusammenführen: Welche Befunde sind Zufall und welche nicht | 2. Glückssieben (sein Ergebnis), 3. Der Ententeich (sein Ergebnis), 4. Die Abfüllmaschine (sein Ergebnis), 5. Das Kassenhäuschen (sein Ergebnis), 🔎 Der Festplatzplan |

**Abschluss-Code:** `1836`

## Stationen

### 1. Das Becherprotokoll am Limonadenstand

**Übt:** Mittelwert vs. Median, Ausreißer und Datenfehler, die Stichproben-Standardabweichung, Histogramme  
**Braucht:** 🔎 Kais Notiz an der Kasse  
**Daten:** [lemonade.py](../../content/rooms/stats-fair/data/lemonade.py)

**Aufgabe:**

> Kai verkauft Limonade in 300-ml-Bechern. Das Becherprotokoll von heute Abend ist als `cups` geladen: die Milliliter jedes Bechers, wie sie an der Kasse eingetippt wurden. Bevor jemand den Stand beurteilt, beschreibt das Protokoll und bereinigt es: Kais Notiz sagt, wie Fehler hineingeraten.
>
> 1. Beschreibt das Protokoll, wie es ist: `mean_raw` und `median_raw`.
> 2. Behaltet nur die echten Becher, als `clean`.
> 3. Beschreibt die bereinigten Becher: `mean`, `median` und ihre Standardabweichung `sd` (sie sind eine Stichprobe der Becher der Maschine).
>
> Welcher von Mittelwert und Median hat sich beim Bereinigen bewegt?

<details><summary>Startcode</summary>

```python
from helpers import show_hist

# cups ist geladen: ml pro Becher, wie an der Kasse eingetippt.
print(cups.describe())
show_hist(cups, title="Becher wie eingetippt")

mean_raw = None     # Mittelwert des Protokolls, wie es ist
median_raw = None   # Median des Protokolls, wie es ist

clean = cups        # nur die echten Becher (siehe Kais Notiz)
mean = None
median = None
sd = None           # Standardabweichung der bereinigten Becher
```

</details>

**Musterlösung:**

```python
from helpers import show_hist

mean_raw = cups.mean()
median_raw = cups.median()
print(cups.sort_values().head(4).tolist(), cups.sort_values().tail(2).tolist())
clean = cups[(cups > 0) & (cups <= 400)]
mean = clean.mean()
median = clean.median()
sd = clean.std()
print(round(mean_raw, 1), median_raw, "->", round(mean, 1), median, round(sd, 1))
show_hist(clean, title="Clean cups")
```

**Geprüftes Ergebnis** (`_cup_check(mean_raw, median_raw, clean, mean, median, sd)`):

```json
"sealed"
```

**Zeigt nach dem Lösen:**

> Kalibrierwerte für die Abfüllmaschine: Die Becher von heute Abend enthalten im Mittel **296,4 ml**, mit einer Standardabweichung von **7,9 ml**.
>
> Der Median blieb beim Bereinigen bei 296 ml; der Mittelwert fiel um 15 ml. Ein einziger Tippfehler hat ihn verschoben.
>
> Das Prüfsiegel des Stands gibt es an der Abfüllmaschine, sobald sie kalibriert ist.

**Hinweise:**

1. `cups.mean()` und `cups.median()` beschreiben das Rohprotokoll. `cups.sort_values()` zeigt die seltsamen Einträge an beiden Enden.
2. Kais Notiz: Verschüttete Becher wurden als 0 eingetippt, und kein Becher fasst mehr als 400 ml. Ein Filter behält den Rest: `cups[(cups > 0) & (cups <= 400)]`.
3. `clean = cups[(cups > 0) & (cups <= 400)]`, dann `clean.mean()`, `clean.median()` und `clean.std()`. pandas' `.std()` teilt durch n − 1, die Stichproben-Standardabweichung.

### 2. Glückssieben

**Übt:** Ergebnisraum und klassische Wahrscheinlichkeit, relative Häufigkeiten, die Binomialverteilung (cdf), wann ein Ergebnis zu unwahrscheinlich für Zufall ist  
**Braucht:** 🔎 Das Schild der Glückssieben, 🔎 Das Prüfhandbuch  
**Daten:** [dice.py](../../content/rooms/stats-fair/data/dice.py)

**Aufgabe:**

> Bei der Glückssieben würfelt man mit zwei Würfeln und gewinnt mit bestimmten Summen: Das Schild am Stand sagt, mit welchen, und welche Chance es verspricht. Das Protokoll der 900 Spiele von heute Abend ist als `games` geladen (Spalten `die1` und `die2`).
>
> 1. Bestimmt die theoretische Gewinnchance `p_theory` aus allen 36 gleich wahrscheinlichen Ergebnissen zweier fairer Würfel.
> 2. Zählt die heutigen Gewinne: `wins`.
> 3. Wie wahrscheinlich ist mit fairen Würfeln ein Abend mit höchstens so vielen Gewinnen? Die Zahl der Gewinne in 900 Spielen folgt einer Binomialverteilung. Speichert diese Wahrscheinlichkeit als `p_value`.
> 4. Das Prüfhandbuch sagt, wann ein Ergebnis als verdächtig gilt. Speichert seine Grenze als Wahrscheinlichkeit, `threshold`, und euer Urteil als `rigged` (`True` oder `False`).

<details><summary>Startcode</summary>

```python
from itertools import product
from scipy import stats

# games ist geladen: eine Zeile pro Spiel, Spalten die1 und die2.
print(games.head())

outcomes = list(product(range(1, 7), repeat=2))   # alle 36 Paare (die1, die2)
p_theory = None    # Anteil der Ergebnisse, die gewinnen (siehe Schild)

wins = None        # heute gewonnene Spiele
p_value = None     # P(höchstens `wins` Gewinne in 900 Spielen) mit fairen Würfeln

threshold = None   # die Grenze des Prüfhandbuchs, als Wahrscheinlichkeit
rigged = None      # True oder False
```

</details>

**Musterlösung:**

```python
from itertools import product
from scipy import stats

outcomes = list(product(range(1, 7), repeat=2))
p_theory = sum(1 for a, b in outcomes if a + b in (7, 11)) / len(outcomes)
wins = int((games.die1 + games.die2).isin([7, 11]).sum())
p_value = stats.binom.cdf(wins, len(games), p_theory)
threshold = 0.01
rigged = p_value < threshold
print(round(p_theory, 4), wins, round(len(games) * p_theory), round(p_value, 4), rigged)
print(games.stack().value_counts().sort_index())
```

**Geprüftes Ergebnis** (`_dice_check(p_theory, wins, p_value, threshold, rigged)`):

```json
"sealed"
```

**Zeigt nach dem Lösen:**

> Nur **163 Gewinne** in 900 Spielen, wo faire Würfel etwa 200 ergeben. Mit fairen Würfeln kommt ein so schlechter Abend etwa einmal in 700 Abenden vor: weit unter den 1 zu 100 des Handbuchs. Die Würfel sind gezinkt; 5 und 6 fallen zu selten.
>
> Prüfsiegel für die Glückssieben: **3**

**Hinweise:**

1. Das Schild am Stand sagt, welche Summen gewinnen. `sum(1 for a, b in outcomes if a + b in (...))` zählt die Gewinn-Ergebnisse; teilt durch 36. Im Protokoll markiert `(games.die1 + games.die2).isin([...])` die Gewinne.
2. Mit fairen Würfeln sind die Gewinne in 900 Spielen binomialverteilt mit n = 900 und p = `p_theory`. Die Wahrscheinlichkeit für höchstens k Erfolge ist die Verteilungsfunktion: `stats.binom.cdf(k, n, p)`. Das Prüfhandbuch nennt die Grenze; dann `rigged = p_value < threshold`.
3. Eine 7 oder eine 11 gewinnt: `p_theory = 8 / 36`, `wins = int((games.die1 + games.die2).isin([7, 11]).sum())` (163) und `p_value = stats.binom.cdf(wins, 900, p_theory)` (etwa 0,0014). Das Handbuch sagt 1 von 100: `threshold = 0.01`, also ist `rigged = p_value < threshold` gleich `True`. `games.stack().value_counts()` zeigt, welche Augenzahlen fehlen.

### 3. Der Ententeich

**Übt:** Die Binomialverteilung (pmf, cdf, sf), Erwartungswert, Theorie mit beobachteten Häufigkeiten vergleichen  
**Braucht:** 🔎 Das Schild am Ententeich  
**Daten:** [ducks.py](../../content/rooms/stats-fair/data/ducks.py)

**Aufgabe:**

> Am Ententeich angelt man 6 Enten; das Schild sagt, wie viele einen Stern haben und was gewinnt. Das Protokoll von heute Abend ist als `stars` geladen: die geangelten Sterne in jedem von 400 Spielen.
>
> 1. Die Zahl der Sterne in einem Spiel ist binomialverteilt. Berechnet die Chance auf einen Teddy, `p_win`, mit scipy.
> 2. Bruno bezahlt die Teddys. Was verdient er im Schnitt pro Spiel? Speichert den erwarteten Gewinn pro Spiel in Euro als `profit`.
> 3. Vergleicht mit heute Abend: der Anteil der Spiele, die einen Teddy gewonnen haben, `observed`.

<details><summary>Startcode</summary>

```python
from scipy import stats
from helpers import show_bars

# stars ist geladen: geangelte Sterne in jedem der 400 Spiele von heute Abend.
print(stars.value_counts().sort_index())

n, p = None, None   # Enten pro Spiel, Chance auf einen Stern pro Ente (siehe Schild)
p_win = None        # P(genug Sterne für einen Teddy)
profit = None       # Brunos erwarteter Gewinn pro Spiel, in Euro
observed = None     # Anteil der heutigen Spiele, die gewonnen haben

# Um Theorie und heute Abend zu vergleichen, zum Beispiel:
# theorie = stats.binom.pmf(range(7), n, p)
# heute = stars.value_counts(normalize=True).reindex(range(7), fill_value=0)
# show_bars(theorie, heute, x=range(7), labels=["binomial", "heute"])
```

</details>

**Musterlösung:**

```python
from scipy import stats
from helpers import show_bars

n, p = 6, 0.25
p_win = stats.binom.sf(2, n, p)
profit = 2 - 5 * p_win
observed = (stars >= 3).mean()
theory = stats.binom.pmf(range(7), n, p)
tonight = stars.value_counts(normalize=True).reindex(range(7), fill_value=0)
show_bars(theory, tonight, x=range(7), labels=["binomial", "tonight"], title="Stars per game")
print(round(p_win, 4), round(profit, 2), observed)
```

**Geprüftes Ergebnis** (`_duck_check(p_win, profit, observed)`):

```json
"sealed"
```

**Zeigt nach dem Lösen:**

> Der Teich ist ehrlich: Heute Abend haben 17 % der Spiele einen Teddy gewonnen, genau wie die Binomialverteilung sagt, und Bruno verdient trotzdem 1,15 € pro Spiel.
>
> Prüfsiegel für den Ententeich: **8**
>
> Unter die Theke geklebt, in Brunos Handschrift: „PIN Büro-Laptop = meine Entenchance, die ersten vier Ziffern nach der 0.“

**Hinweise:**

1. n = 6 Enten und p = 1/4. P(3 oder mehr) = 1 − P(höchstens 2): `1 - stats.binom.cdf(2, n, p)`, oder direkt `stats.binom.sf(2, n, p)`.
2. Erwarteter Gewinn = was ein Spiel einbringt minus was es im Schnitt kostet: das Los für 2 € minus Teddypreis mal `p_win`. Der Preis steht auf dem Schild.
3. `p_win = stats.binom.sf(2, 6, 0.25)` (0,1694), `profit = 2 - 5 * p_win` (1,15 €) und `observed = (stars >= 3).mean()`.

### 4. Die Abfüllmaschine

**Übt:** Die Normalverteilung, z-Werte, die Verteilungsfunktion und ihre Umkehrung (ppf), von der Stichprobe zum Modell  
**Braucht:** 1. Das Becherprotokoll am Limonadenstand (sein Ergebnis), 🔎 Die Füllmengenverordnung  
**Daten:** [filler.py](../../content/rooms/stats-fair/data/filler.py)

**Aufgabe:**

> Kais Limonadenmaschine füllt die Becher normalverteilt um die eingestellte Menge. Ihr Kalibrieraufkleber ist noch leer: Er braucht Mittelwert und Standardabweichung der echten Becher von heute Abend, aus dem Becherprotokoll.
>
> Das Gesetz erlaubt nur wenige zu knapp gefüllte Becher: Die Füllmengenverordnung sagt, ab wie viel unter 300 ml ein Becher zu knapp ist und welcher Anteil der Becher das sein darf. Mit einer Normalverteilung und diesen Werten:
>
> 1. Wie viele Standardabweichungen vom Mittelwert liegt die Grenze der Verordnung? Speichert es als `z`.
> 2. Welcher Anteil der Becher enthält weniger als die Grenze? Speichert ihn als `share_below` (zwischen 0 und 1).
> 3. Auf welchen Mittelwert (`target`, in ml) muss Kai die Maschine bei gleicher Streuung einstellen, damit genau der erlaubte Anteil der Becher unter der Grenze liegt?

<details><summary>Startcode</summary>

```python
from scipy import stats

mu = None       # Mittelwert der echten Becher von heute (Becherprotokoll)
sigma = None    # ihre Standardabweichung

limit = None    # ml: darunter ist ein 300-ml-Becher zu knapp (Füllmengenverordnung)
allowed = None  # der Anteil der Becher, der zu knapp sein darf (zwischen 0 und 1)

z = None             # wie viele Standardabweichungen limit von mu entfernt liegt
share_below = None   # P(Becher < limit)
target = None        # der Mittelwert, bei dem genau der erlaubte Anteil unter limit liegt
```

</details>

**Musterlösung:**

```python
from scipy import stats

mu, sigma = 296.4, 7.9
limit, allowed = 285, 0.02
z = (limit - mu) / sigma
share_below = stats.norm.cdf(limit, mu, sigma)
target = limit - stats.norm.ppf(allowed) * sigma
print(round(z, 2), round(share_below, 4), round(target, 1))
```

**Geprüftes Ergebnis** (`_filler_check(z, share_below, target)`):

```json
"sealed"
```

**Zeigt nach dem Lösen:**

> Bei 296,4 ml enthalten 7,5 % der Becher weniger als 285 ml: fast das Vierfache dessen, was das Gesetz erlaubt. Kai betrügt nicht absichtlich; die Maschine ist zu niedrig eingestellt. Auf 301,2 ml eingestellt, besteht sie.
>
> Prüfsiegel für den Limonadenstand: **6**

**Hinweise:**

1. mu und sigma sind der bereinigte Mittelwert und die Standardabweichung aus dem Becherprotokoll am Limonadenstand. Grenze und erlaubter Anteil stehen in der Füllmengenverordnung, die die Kommission ausgehängt hat.
2. `z = (limit - mu) / sigma`. `stats.norm.cdf(limit, mu, sigma)` ist der Anteil unter der Grenze (dasselbe wie `stats.norm.cdf(z)`). Für den Zielwert ist der z-Wert mit dem erlaubten Anteil darunter `stats.norm.ppf(allowed)`.
3. Mit mu = 296,4, sigma = 7,9, limit = 285 (15 ml zu wenig) und allowed = 0,02: z ≈ −1,44, share_below ≈ 0,075 und `target = limit - stats.norm.ppf(allowed) * sigma` ≈ 301,2 ml.

### 5. Das Kassenhäuschen

**Übt:** Grundgesamtheit vs. Stichprobe, Parameter vs. Kennzahl, zufällige vs. verzerrte Stichproben, wie stark ein Stichprobenmittel schwankt  
**Braucht:** 🔒 3. Der Ententeich, 🔎 Brunos Flyer für Sponsoren  
**Daten:** [tickets.py](../../content/rooms/stats-fair/data/tickets.py)

**Zahlenschloss** (öffnet mit `1694`):

> Brunos Laptop verlangt eine vierstellige PIN.

**Aufgabe:**

> Brunos Laptop weiß, was jeder Besucher heute Abend mit seinem bargeldlosen Armband ausgegeben hat: `wristbands`, alle 6.000 Besucher. Außerdem liegen dort seine Umfragen, `surveys`: eine Zeile pro befragtem Gast, mit `place` (Ort), `day` (Tag) und `spent`. Eine davon ist die Quelle seines Flyers für Sponsoren.
>
> 1. Der Mittelwert aller Besucher ist ein Parameter der Grundgesamtheit: `mu`.
> 2. Eine Zufallsstichprobe von 40 Besuchern, `wristbands.sample(40, random_state=7)`, liefert eine Schätzung dafür: `sample_mean`.
> 3. Der Mittelwert der Umfrage hinter dem Flyer: `flyer_mean`.
> 4. Kann die Zahl des Flyers Pech sein? Zieht 1.000 Zufallsstichproben von 40 Besuchern und speichert ihre Mittelwerte in `means`. Kommt irgendeine davon an den Flyer heran?

<details><summary>Startcode</summary>

```python
from helpers import show_hist

# wristbands: Euro, die jeder der 6.000 Besucher heute ausgegeben hat (die ganze Grundgesamtheit)
# surveys: Brunos Umfragen, eine Zeile pro befragtem Gast (place = Ort, day = Wochentag, spent)
print(surveys.groupby(["place", "day"]).size())

mu = None
sample_mean = None   # Mittelwert von wristbands.sample(40, random_state=7)
flyer_mean = None    # Mittelwert der einen Umfrage hinter dem Flyer

means = []           # Mittelwerte von 1.000 Zufallsstichproben von 40 Besuchern

# show_hist(means, title="Mittelwerte von Zufallsstichproben von 40")
```

</details>

**Musterlösung:**

```python
from helpers import show_hist

mu = wristbands.mean()
sample_mean = wristbands.sample(40, random_state=7).mean()
flyer = surveys[(surveys.place == "VIP tent") & (surveys.day == "Saturday")]
flyer_mean = flyer.spent.mean()
means = [wristbands.sample(40).mean() for i in range(1000)]
print(len(flyer), round(mu, 2), round(sample_mean, 2), round(flyer_mean, 2), round(min(means), 2), round(max(means), 2))
show_hist(means, title="Means of 1,000 random samples of 40")
```

**Geprüftes Ergebnis** (`_ticket_check(mu, sample_mean, flyer_mean, means)`):

```json
"sealed"
```

**Zeigt nach dem Lösen:**

> Die Besucher von heute Abend haben im Schnitt **33,51 €** ausgegeben. Eine Zufallsstichprobe von 40 landet nah dran (34,23 €), und 1.000 Zufallsstichproben bleiben zwischen etwa 25 € und 45 €. Die Umfrage des Flyers im VIP-Zelt sagt 65,18 €: Das ist kein Pech, sondern eine verzerrte Stichprobe. Gefragt wurden nur Vielausgeber. Der Flyer täuscht die Sponsoren.
>
> Prüfsiegel für das Kassenhäuschen: **1**

**Hinweise:**

1. `wristbands.mean()` ist der Mittelwert der Grundgesamtheit, `wristbands.sample(40, random_state=7).mean()` der Mittelwert einer Zufallsstichprobe. Der Flyer nennt seine Quelle im Kleingedruckten: Filtert `surveys` nach Ort und Tag, etwa `surveys[(surveys.place == ...) & (surveys.day == ...)]`.
2. In einer Schleife zieht `wristbands.sample(40).mean()` jedes Mal eine neue Zufallsstichprobe; hängt jeden Mittelwert an `means` an. `show_hist(means)` zeigt, wie stark ein Stichprobenmittel von 40 zufällig schwanken kann.
3. `flyer_mean = surveys[(surveys.place == "VIP tent") & (surveys.day == "Saturday")].spent.mean()` (65,18 €) und `means = [wristbands.sample(40).mean() for i in range(1000)]`. Sie bleiben zwischen etwa 25 € und 45 €, weit weg von 65 €: Die Umfrage hatte kein Pech, sie hat nur VIP-Gäste gefragt.

### 6. Das Tor des Festplatzes (Abschluss-Schloss)

**Übt:** Die Prüfung zusammenführen: Welche Befunde sind Zufall und welche nicht  
**Braucht:** 2. Glückssieben (sein Ergebnis), 3. Der Ententeich (sein Ergebnis), 4. Die Abfüllmaschine (sein Ergebnis), 5. Das Kassenhäuschen (sein Ergebnis), 🔎 Der Festplatzplan

**Aufgabe:**

> Das Tor hat ein vierstelliges Tastenfeld und die Notiz des Nachtwächters: „Jeder Stand, den ihr fertig geprüft habt, bekommt ein Siegel mit einer Ziffer. Gebt die Siegel in der Reihenfolge der Standnummern ein.“
>
> Der Festplatzplan sagt, welcher Stand welche Nummer hat.

**Antwort:** `1836`

**Zeigt nach dem Lösen:**

> Das Tor schwingt auf. Euer Bericht: Die Würfel der Glückssieben sind gezinkt, die Limonadenmaschine ist zu niedrig eingestellt, Brunos Flyer beruht auf einer verzerrten Umfrage, und der Ententeich ist fair.

**Hinweise:**

1. Jede fertige Prüfung zeigt beim Lösen eine Siegelziffer: Kassenhäuschen, Ententeich, Glückssieben und Abfüllmaschine. Heftet sie an eure Notizen.
2. Der Festplatzplan nummeriert die Stände: 1 Kassenhäuschen, 2 Ententeich, 3 Glückssieben, 4 Limonadenstand.
3. Kassenhäuschen 1, Ententeich 8, Glückssieben 3, Limonadenstand 6: 1836.

## Hinweise im Raum

### 🔎 Kais Notiz an der Kasse

*Gebraucht von: 1. Das Becherprotokoll am Limonadenstand*

> LIMONADE · Notizen für die Kasse (Kai)
>
> Becher verschüttet? 0 ml eintippen, dann wird er erstattet.
>
> Unsere Becher fassen höchstens 400 ml. Alles darüber ist ein Tippfehler.

### 🔎 Das Schild der Glückssieben

*Gebraucht von: 2. Glückssieben*

> GLÜCKSSIEBEN!
>
> Zwei Würfel: Eine **7** oder eine **11** gewinnt!
>
> Eure Chance: **2 zu 9**! Nur 3 € pro Spiel.

### 🔎 Das Schild am Ententeich

*Gebraucht von: 3. Der Ententeich*

> ENTENTEICH
>
> Jede 4. Ente hat einen goldenen Stern unten drauf! Angelt 6 Enten: **3 oder mehr Sterne** gewinnen einen Teddy. Nur 2 € pro Spiel!
>
> Auf der Rückseite ein Preisschild vom Großhandel: Teddybär, 30 cm, **5,00 €** pro Stück.

### 🔎 Die Füllmengenverordnung

*Gebraucht von: 4. Die Abfüllmaschine*

> FÜLLMENGENVERORDNUNG (Auszug, von der Kommission ausgehängt)
>
> Nach Volumen verkaufte Getränke: Höchstens **2 %** der Portionen dürfen mehr als **15 ml** unter der angegebenen Menge liegen.
>
> Für einen 300-ml-Becher heißt das: höchstens 2 % der Becher unter 285 ml.

### 🔎 Das Prüfhandbuch

*Gebraucht von: 2. Glückssieben*

> MARKTKOMMISSION · Prüfhandbuch, Seite 4
>
> Ein Spiel wirkt gezinkt, wenn seine Ergebnisse bei einem fairen Spiel sehr unwahrscheinlich wären. Unsere Regel: Wenn ein faires Spiel seltener als **1 von 100 Mal** so schlecht (oder schlechter) abschneidet, ist das Spiel verdächtig.

### 🔎 Brunos Flyer für Sponsoren

*Gebraucht von: 5. Das Kassenhäuschen*

> KLEEBERGER HERBSTMARKT · Werdet Sponsor!
>
> Unsere Besucher geben im Schnitt **65 €** aus!
>
> Kleingedrucktes: Umfrage unter 40 Gästen, VIP-Zelt, Samstag.

### 🔎 Der Festplatzplan

*Gebraucht von: 6. Das Tor des Festplatzes*

> KLEEBERGER HERBSTMARKT · Plan
>
> Stand 1: Kassenhäuschen
> Stand 2: Ententeich
> Stand 3: Glückssieben
> Stand 4: Limonadenstand
>
> Ausgang: das Tor an der Ostseite (schließt um Mitternacht).
