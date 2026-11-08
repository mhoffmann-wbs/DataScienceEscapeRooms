# Das stille Archiv: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Kleebergs Stadtbibliothek nach Feierabend. Eure Abendführung durchs Archiv hatte gerade begonnen, als die Brandschutzanlage die Tür hinter euch verriegelt hat.
>
> Die Skripte des Archivs gehören Margarete Holm, der Archivarin, die letzte Woche in Rente gegangen ist und die meisten davon halb fertig hinterlassen hat. Über ihrem Schreibtisch hängt ihre Regel: **„Ich schreibe nie auf, was schon in der Dokumentation steht.“** Ihre Notizen sagen nur, wo ihr nachsehen müsst.
>
> Also seht nach: Die offizielle Python-Dokumentation öffnet ihr in einem anderen Tab eures Browsers, und das Handbuch auf dem Lesepult verlinkt ihre wichtigsten Seiten. Nehmt die Doku für Python 3.14, die Version, mit der dieses Archiv läuft.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Rückgabewagen | Ein HOWTO lesen: Pythons Sortierung ist stabil, also wird eine Sortierung nach zwei Schlüsseln in entgegengesetzten Richtungen zu zwei Sortierungen, der zweite Schlüssel zuerst. | 🔎 Zettel am Rückgabewagen |
| 2 | Packtisch | Eine Funktion nach ihrer Beschreibung finden: der Modulindex, die Übersicht oben auf der Seite eines Moduls, die Parameter einer Signatur. | 🔎 Etikett auf einem Archivkarton |
| 3 | Mahngebühren-Buch | Die Hinweise unter einer Funktion lesen (`round()` rundet Gleichstände zur geraden Zahl, Floats sind nicht exakt) und der Doku zu einem anderen Modul folgen (`decimal`, `quantize`, Rundungsarten). | 🔎 Gebührenordnung |
| 4 | Das alte Terminal | Versionshinweise: Jeder Eintrag in der Doku sagt, wann er hinzukam oder sich geändert hat („Added in version 3.x“), damit du weißt, ob Code auf einem älteren Python läuft. | 🔎 Margaretes Skriptliste |
| 5 | Datumsstempel-Maschine | Eine Tabelle in der Doku lesen, samt der Hinweise darunter: die Formatcodes von `strftime`, und warum ISO-Wochendaten `%G` mit `%V` und `%u` brauchen. | 🔒 4. Das alte Terminal, 🔎 Anleitung der Stempelmaschine |
| 6 | Archivtür (Abschluss-Schloss) | Die Ergebnisse des Raums zusammensetzen. | 1. Rückgabewagen (sein Ergebnis), 2. Packtisch (sein Ergebnis), 3. Mahngebühren-Buch (sein Ergebnis), 5. Datumsstempel-Maschine (sein Ergebnis), 🔎 Karte im Zettelkatalog |

**Abschluss-Code:** `8714`

## Stationen

### 1. Rückgabewagen

**Übt:** Ein HOWTO lesen: Pythons Sortierung ist stabil, also wird eine Sortierung nach zwei Schlüsseln in entgegengesetzten Richtungen zu zwei Sortierungen, der zweite Schlüssel zuerst.  
**Braucht:** 🔎 Zettel am Rückgabewagen  
**Daten:** [cart.py](../../content/rooms/python-docs/data/cart.py)

**Aufgabe:**

> Ein Wagen voller zurückgegebener Bücher steht bei den Regalen, seine Bremse bleibt fest, bis die Bücher in Margaretes Einräumreihenfolge liegen. Ihr Zettel am Wagen sagt, wie sie es haben will.
>
> Die Bücher sind als `returns` geladen, eine Liste von Dictionaries mit `"title"` und `"shelf"`. Speichere die Titel in Einräumreihenfolge in `cart`, einer Liste von Strings.

<details><summary>Startcode</summary>

```python
# returns ist geladen: eine Liste von Dicts mit "title" und "shelf".
print(returns[0])

cart = []  # die Titel, in Einräumreihenfolge
```

</details>

**Musterlösung:**

```python
by_title = sorted(returns, key=lambda b: b["title"], reverse=True)
by_shelf = sorted(by_title, key=lambda b: b["shelf"])
cart = [b["title"] for b in by_shelf]
print(cart)
```

**Geprüftes Ergebnis** (`cart`):

```json
["Winter Birds", "Apples of the Valley", "A Short History of Rain", "Kleeberg in Old Photographs", "Bridges", "Salt Roads", "Moss and Lichen", "Field Notes", "Paper Boats", "Northern Lights", "The Lantern Keeper", "The Clockmaker"]
```

**Zeigt nach dem Lösen:**

> Die Bremse löst sich mit einem Klick. Unter den Griff ist ein Anhänger geklebt: **Rückgabe → 7**

**Hinweise:**

1. Die HOWTOs sind auf der Startseite der Doku und im Handbuch verlinkt. Lies in „Sorting Techniques“ den Abschnitt „Sort Stability and Complex Sorts“.
2. Sortierungen sind stabil: Einträge mit gleichem Schlüssel behalten ihre Reihenfolge. Sortiere also zuerst nach dem zweiten Schlüssel (Titel, `reverse=True`), dann nach dem ersten (Regal).
3. `by_title = sorted(returns, key=lambda b: b["title"], reverse=True)`, dann `sorted(by_title, key=lambda b: b["shelf"])`, dann die Titel herausziehen.

### 2. Packtisch

**Übt:** Eine Funktion nach ihrer Beschreibung finden: der Modulindex, die Übersicht oben auf der Seite eines Moduls, die Parameter einer Signatur.  
**Braucht:** 🔎 Etikett auf einem Archivkarton  
**Daten:** [boxes.py](../../content/rooms/python-docs/data/boxes.py)

**Aufgabe:**

> Auf dem Packtisch wartet ein Stapel Bücher darauf, in den Keller zu kommen, daneben ein Stapel leerer Archivkartons. Der Kelleraufzug nimmt nur vollständige Anweisungen: welche Bücher in welchen Karton kommen.
>
> Die Signaturen sind als `book_ids` geladen. Packe sie so, wie es auf dem Kartonetikett steht, und speichere die Kartons in `boxes`, einer Liste mit einem Tupel oder einer Liste von Signaturen pro Karton.

<details><summary>Startcode</summary>

```python
# book_ids ist geladen: Signaturen wie "K-0412".
print(len(book_ids), book_ids[:3])

boxes = []
```

</details>

**Musterlösung:**

```python
from itertools import batched

boxes = list(batched(sorted(book_ids), 7))
print(len(boxes), boxes[-1])
```

**Geprüftes Ergebnis** (`[len(boxes), list(boxes[-1])]`):

```json
[4, ["K-0904", "K-0938"]]
```

**Zeigt nach dem Lösen:**

> Der Aufzug summt und bringt die Kartons nach unten. Auf den Deckel des letzten Kartons ist eine Zahl gestempelt: **Packen → 4**

**Hinweise:**

1. Öffne `itertools` über den Modulindex. Die Tabellen oben auf der Seite nennen jede Funktion mit einer Beschreibung in einer Zeile; eine davon bildet Gruppen fester Größe.
2. `itertools.batched(iterable, n)` liefert Tupel mit `n` Elementen; das letzte darf kürzer sein. Es gibt einen Iterator zurück, also pack es in `list(...)`. Und das Etikett will zuerst die Reihenfolge der Signaturen.
3. `from itertools import batched` und `boxes = list(batched(sorted(book_ids), 7))`

### 3. Mahngebühren-Buch

**Übt:** Die Hinweise unter einer Funktion lesen (`round()` rundet Gleichstände zur geraden Zahl, Floats sind nicht exakt) und der Doku zu einem anderen Modul folgen (`decimal`, `quantize`, Rundungsarten).  
**Braucht:** 🔎 Gebührenordnung  
**Daten:** [fees.py](../../content/rooms/python-docs/data/fees.py)

**Aufgabe:**

> Das Mahngebühren-Buch ging nie auf: Margaretes Gebührenskript lag immer ein paar Cent daneben. Eine Bleistiftnotiz am Rand: „Warum mein Skript falsch ist, steht unter `round()` bei den eingebauten Funktionen. Folgt der Doku von dort aus.“
>
> Das Buch ist als `ledger` geladen, eine Liste von Paaren `(Titel, Tage überfällig)`. Berechne jede Gebühr so, wie es die Gebührenordnung sagt, und speichere die Summe in `total`.

<details><summary>Startcode</summary>

```python
# Margaretes Gebührenskript. ledger ist geladen: Paare (Titel, Tage überfällig).
RATE = 0.0  # Euro pro Tag: siehe Gebührenordnung

total = 0
for title, days in ledger:
    fee = round(days * RATE, 2)
    total += fee
print(total)
```

</details>

**Musterlösung:**

```python
from decimal import Decimal, ROUND_HALF_UP

RATE = Decimal("0.045")  # 4.5 cents per day

total = 0
for title, days in ledger:
    fee = (days * RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total += fee
print(total)
```

**Geprüftes Ergebnis** (`str(total)`):

```json
"6.30"
```

**Zeigt nach dem Lösen:**

> Das Buch geht auf den Cent genau auf. Am Rand, in roter Tinte: **Gebühren → 1**

**Hinweise:**

1. Unter `round()` sagt die Doku zwei Dinge: Gleichstände werden zur geraden Zahl gerundet, und ein Float wie `2.675` lässt sich nicht exakt speichern. Der Hinweis dort nennt das Modul für exaktes Rechnen mit Dezimalzahlen.
2. Auf der Seite zu `decimal`: Zahlen aus Strings bauen, `Decimal("0.045")`, nicht aus Floats; jede Gebühr mit `.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` runden.
3. `from decimal import Decimal, ROUND_HALF_UP`, dann in der Schleife `fee = (days * Decimal("0.045")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`.

### 4. Das alte Terminal

**Übt:** Versionshinweise: Jeder Eintrag in der Doku sagt, wann er hinzukam oder sich geändert hat („Added in version 3.x“), damit du weißt, ob Code auf einem älteren Python läuft.  
**Braucht:** 🔎 Margaretes Skriptliste

**Aufgabe:**

> Das Terminal im Lesesaal ist uralt. Sein Startbildschirm zeigt `Python 3.8.10`. Margarete wollte ihre Skripte darauf laufen lassen und hat die Liste der Funktionen, die sie benutzen, daneben gepinnt.
>
> Das Terminal fragt nach seinem Admin-Code: für jede Funktion auf ihrer Liste, die es in Python 3.8 noch nicht gibt, die Unterversion der Python-Version, die sie eingeführt hat, in der Reihenfolge der Liste, ohne Leerzeichen. (Eine Funktion aus Python 3.11 ergäbe `11`.)

**Antwort:** `91012`

**Zeigt nach dem Lösen:**

> Das Terminal piept und druckt einen Zettel: „Stempelmaschine, Service-PIN: **5318**“

**Hinweise:**

1. Schlag jede Funktion nach (der allgemeine Index oder die Suche findet sie). Am Ende ihres Eintrags steht ein Hinweis wie „Added in version 3.x“.
2. Funktionen aus 3.8 oder früher laufen auf dem Terminal. Zwei der fünf auf der Liste tun das.
3. `str.removeprefix` 3.9, `math.dist` 3.8, `itertools.pairwise` 3.10, `statistics.fmean` 3.8, `itertools.batched` 3.12.

### 5. Datumsstempel-Maschine

**Übt:** Eine Tabelle in der Doku lesen, samt der Hinweise darunter: die Formatcodes von `strftime`, und warum ISO-Wochendaten `%G` mit `%V` und `%u` brauchen.  
**Braucht:** 🔒 4. Das alte Terminal, 🔎 Anleitung der Stempelmaschine  
**Daten:** [stamps.py](../../content/rooms/python-docs/data/stamps.py)

**Zahlenschloss** (öffnet mit `5318`):

> Die Abdeckung der Stempelmaschine ist verriegelt. Ein kleines Display fragt nach einer vierstelligen Service-PIN.

**Aufgabe:**

> Die Stempelmaschine druckt in jedes Buch einen Rückgabestempel. Ihr Fach ist voll, aber Margaretes Stempelskript druckt um Neujahr herum Unsinn.
>
> Die Rückgabedaten sind als `returned` geladen, ISO-Datumsstrings. Repariere das Skript, sodass `stamps` einen Stempel pro Buch enthält, im Format aus der Anleitung der Maschine.

<details><summary>Startcode</summary>

```python
from datetime import date

# Margaretes Stempelskript. returned ist geladen: ISO-Datumsstrings wie "2026-06-10".
stamps = []
for text in returned:
    day = date.fromisoformat(text)
    stamps.append(day.strftime("%Y-W%W-%w"))
print(stamps)
```

</details>

**Musterlösung:**

```python
from datetime import date

stamps = []
for text in returned:
    day = date.fromisoformat(text)
    stamps.append(day.strftime("%G-W%V-%u"))
print(stamps)
```

**Geprüftes Ergebnis** (`stamps`):

```json
["2026-W01-1", "2026-W01-7", "2026-W11-7", "2026-W24-3", "2026-W53-4", "2026-W53-5", "2027-W01-1"]
```

**Zeigt nach dem Lösen:**

> Die Maschine stempelt das letzte Buch und wirft eine Messingmarke aus: **Stempel → 8**

**Hinweise:**

1. Auf der Seite zu `datetime` hat der Abschnitt „strftime() and strptime() Format Codes“ eine Tabelle mit Codes. Drei davon erwähnen ISO 8601.
2. `%V` ist die ISO-Woche, `%u` der ISO-Wochentag (Montag ist 1). Die Doku sagt, dass sich die ISO-Direktiven für Jahr und Woche nicht mit `%Y` und `%W` austauschen lassen: Um Neujahr herum ist das ISO-Jahr `%G`.
3. `day.strftime("%G-W%V-%u")`

### 6. Archivtür (Abschluss-Schloss)

**Übt:** Die Ergebnisse des Raums zusammensetzen.  
**Braucht:** 1. Rückgabewagen (sein Ergebnis), 2. Packtisch (sein Ergebnis), 3. Mahngebühren-Buch (sein Ergebnis), 5. Datumsstempel-Maschine (sein Ergebnis), 🔎 Karte im Zettelkatalog

**Aufgabe:**

> Die schwere Archivtür ist verriegelt. Ihr Tastenfeld will vier Ziffern.

**Antwort:** `8714`

**Hinweise:**

1. Vier Stationen haben euch je eine Zahl gegeben. Der Zettelkatalog sagt, in welcher Reihenfolge sie gehören.
2. Die Reihenfolge ist: Stempel, Rückgabe, Gebühren, Packen.
3. 8714

## Hinweise im Raum

### 🔎 Zettel am Rückgabewagen

*Gebraucht von: 1. Rückgabewagen*

> Einräumreihenfolge:
> Regale von A bis Z,
> innerhalb eines Regals Titel von Z bis A. (Fragt nicht.)
>
> Das Sortier-HOWTO in der Python-Doku zeigt, wie das mit zwei Sortierungen geht. Lest den Teil über Stabilität. Welche Sortierung zuerst kommt, steht dort auch. — M. H.

### 🔎 Etikett auf einem Archivkarton

*Gebraucht von: 2. Packtisch*

> ARCHIVKARTON
> max. **7** Bände
> nach Signatur geordnet packen
>
> Mit Bleistift: „itertools hat eine Funktion, die genau das macht. Diese Schleife schreibe ich nie selbst.“

### 🔎 Gebührenordnung

*Gebraucht von: 3. Mahngebühren-Buch*

> STADTBIBLIOTHEK KLEEBERG · MAHNGEBÜHREN
>
> Pro Buch: **4,5 Cent** pro Tag Überziehung.
> Jede Gebühr wird auf ganze Cent gerundet; ein halber Cent wird immer **aufgerundet**.
> Dann werden die Gebühren addiert.

### 🔎 Margaretes Skriptliste

*Gebraucht von: 4. Das alte Terminal*

> Funktionen, die meine Skripte benutzen:
> 1. `str.removeprefix`
> 2. `math.dist`
> 3. `itertools.pairwise`
> 4. `statistics.fmean`
> 5. `itertools.batched`
>
> Laufen sie auf dem alten Terminal? Die Doku sagt, seit wann es jede gibt.

### 🔎 Anleitung der Stempelmaschine

*Gebraucht von: 5. Datumsstempel-Maschine*

> FORMAT DES RÜCKGABESTEMPELS
> ISO-Jahr, `W`, ISO-Woche, ISO-Wochentag (Montag = 1 … Sonntag = 7)
> Beispiel: Mittwoch der ISO-Woche 45 im Jahr 2026 → `2026-W45-3`
>
> Die Formatcodes stehen in einer Tabelle auf der Seite zu `datetime`. Lest auch die Hinweise unter der Tabelle.

### 🔎 Karte im Zettelkatalog

*Gebraucht von: 6. Archivtür*

> ARCHIVTÜR
> abgelegt unter: Zahlen, in dieser Reihenfolge
>
> 1. Stempel
> 2. Rückgabe
> 3. Gebühren
> 4. Packen

## Handbuch im Raum: 📖 Wie man die Python-Doku liest

**Den Weg finden:** [`Library Reference`](https://docs.python.org/3.14/library/index.html), [`Module index`](https://docs.python.org/3.14/py-modindex.html), [`General index`](https://docs.python.org/3.14/genindex.html), [`Search`](https://docs.python.org/3.14/search.html), [`HOWTOs`](https://docs.python.org/3.14/howto/index.html), [`Glossary`](https://docs.python.org/3.14/glossary.html)

**Einen Eintrag lesen:** [`name(a, b=1, *, c=None)`](https://docs.python.org/3.14/glossary.html#term-parameter), [`Added in version 3.x`](https://docs.python.org/3.14/whatsnew/index.html), `Note  Warning  See also`, `Tables`, [`>>> examples`](https://docs.python.org/3.14/tutorial/interpreter.html#interactive-mode)

**Im Editor:** [`help(obj)`](https://docs.python.org/3.14/library/functions.html#help), [`dir(obj)`](https://docs.python.org/3.14/library/functions.html#dir), [`sys.version`](https://docs.python.org/3.14/library/sys.html#sys.version)
