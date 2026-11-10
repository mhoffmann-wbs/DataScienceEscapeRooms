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
| 1 | Rückgabewagen | Ein HOWTO lesen: Pythons Sortierung ist stabil, also wird eine Sortierung nach mehreren Schlüsseln in verschiedenen Richtungen zu mehreren Sortierungen, der unwichtigste Schlüssel zuerst. | 🔎 Zettel am Rückgabewagen |
| 2 | Packtisch | Eine Funktion nach ihrer Beschreibung finden: der Modulindex, die Übersicht oben auf der Seite eines Moduls, die Parameter einer Signatur, und die Schlüsselwort-Parameter einer Signatur lesen und was sie ändern. | 🔎 Etikett auf einem Archivkarton |
| 3 | Mahngebühren-Buch | Die Hinweise unter einer Funktion lesen (`round()` rundet Gleichstände zur geraden Zahl, Floats sind nicht exakt) und der Doku zu einem anderen Modul folgen (`decimal`: Zahlen aus Strings bauen, `quantize`, Rundungsarten). | 🔎 Gebührenordnung |
| 4 | Das alte Terminal | Versionshinweise: Jeder Eintrag in der Doku sagt, wann er hinzukam oder sich geändert hat („Added in version 3.x“), damit ihr wisst, ob Code auf einem älteren Python läuft. | 🔎 Margaretes Skriptliste |
| 5 | Datumsstempel-Maschine | Eine Tabelle in der Doku lesen, samt der Hinweise darunter: die Formatcodes von `strftime`, und warum ISO-Wochendaten `%G` mit `%V` und `%u` brauchen. | 🔒 4. Das alte Terminal, 🔎 Anleitung der Stempelmaschine |
| 6 | Archivtür (Abschluss-Schloss) | Die Ergebnisse des Raums zusammensetzen. | 1. Rückgabewagen (sein Ergebnis), 2. Packtisch (sein Ergebnis), 3. Mahngebühren-Buch (sein Ergebnis), 5. Datumsstempel-Maschine (sein Ergebnis), 🔎 Karte im Zettelkatalog |

**Abschluss-Code:** `8714`

## Stationen

### 1. Rückgabewagen

**Übt:** Ein HOWTO lesen: Pythons Sortierung ist stabil, also wird eine Sortierung nach mehreren Schlüsseln in verschiedenen Richtungen zu mehreren Sortierungen, der unwichtigste Schlüssel zuerst.  
**Braucht:** 🔎 Zettel am Rückgabewagen  
**Daten:** [cart.py](../../content/rooms/python-docs/data/cart.py)

**Aufgabe:**

> Ein Wagen voller zurückgegebener Bücher steht bei den Regalen, seine Bremse bleibt fest, bis die Bücher in Margaretes Einräumreihenfolge liegen.
>
> Die Bücher sind als `returns` geladen, eine Liste von Dictionaries mit `"title"`, `"author"` und `"shelf"`. Speichert die Titel in Einräumreihenfolge in `cart`, einer Liste von Strings.

<details><summary>Startcode</summary>

```python
# returns ist geladen: eine Liste von Dicts mit "title", "author" und "shelf".
print(returns[0])

cart = []  # die Titel, in Einräumreihenfolge
```

</details>

**Musterlösung:**

```python
by_title = sorted(returns, key=lambda b: b["title"])
by_author = sorted(by_title, key=lambda b: b["author"], reverse=True)
by_shelf = sorted(by_author, key=lambda b: b["shelf"])
cart = [b["title"] for b in by_shelf]
print(cart)
```

**Geprüftes Ergebnis** (`cart`):

```json
["Salt Roads", "Moss and Lichen", "Northern Lights", "Paper Boats", "Field Notes", "Kleeberg in Old Photographs", "A Short History of Rain", "Apples of the Valley", "Bridges", "Orchard Year", "The Ferryman", "Glass and Ash", "Harbour Songs", "Winter Birds", "The Clockmaker", "The Lantern Keeper", "Owls", "The Weaver's Daughter", "Quiet Hours", "The Map Room", "Bees of Kleeberg", "Night Trains", "Stone Walls", "Copper Kettles", "River Atlas", "Chalk Hills", "Small Gardens", "The Long Road", "Old Mills", "The Tin Soldier", "Lighthouses", "Mushrooms of the North", "Tidewater", "Clouds", "Morning Market", "A Year of Bread", "The Glassblower", "Wild Herbs", "Feathers", "Ice Roads"]
```

**Zeigt nach dem Lösen:**

> Die Bremse löst sich mit einem Klick. Unter den Griff ist ein Anhänger geklebt: **Rückgabe → 7**

**Hinweise:**

1. Margaretes Zettel am Wagen nennt die Einräumreihenfolge. Die HOWTOs sind auf der Startseite der Doku und im Handbuch verlinkt. Lest in „Sorting Techniques“ den Abschnitt „Sort Stability and Complex Sorts“.
2. Sortierungen sind stabil: Einträge mit gleichem Schlüssel behalten ihre Reihenfolge. Sortiert also zuerst nach dem unwichtigsten Schlüssel (Titel), dann nach dem nächsten (Autor, `reverse=True`), dann nach dem wichtigsten (Regal). Ein einzelner Tupel-Schlüssel kann nicht nur einen von mehreren String-Schlüsseln umkehren.
3. `by_title = sorted(returns, key=lambda b: b["title"])`, dann `by_author = sorted(by_title, key=lambda b: b["author"], reverse=True)`, dann `sorted(by_author, key=lambda b: b["shelf"])`, dann die Titel herausziehen.

### 2. Packtisch

**Übt:** Eine Funktion nach ihrer Beschreibung finden: der Modulindex, die Übersicht oben auf der Seite eines Moduls, die Parameter einer Signatur, und die Schlüsselwort-Parameter einer Signatur lesen und was sie ändern.  
**Braucht:** 🔎 Etikett auf einem Archivkarton  
**Daten:** [boxes.py](../../content/rooms/python-docs/data/boxes.py)

**Aufgabe:**

> Auf dem Packtisch wartet ein Stapel Bücher darauf, in den Keller zu kommen, daneben ein Stapel leerer Archivkartons. Der Kelleraufzug nimmt nur vollständige Anweisungen: welche Bücher in welchen Karton kommen.
>
> Die Signaturen sind als `book_ids` geladen. Schreibt eine Funktion `pack(ids)`, die die Kartons zurückgibt, pro Karton ein Tupel oder eine Liste von Signaturen, und speichert `boxes = pack(book_ids)`.
>
> Der Aufzug ist alt: Er kippt um, wenn er einen nicht vollen Karton trägt. `pack` muss also einen Stapel, dessen letzter Karton nicht voll ist, mit einem Fehler ablehnen, statt einen kurzen Karton zu schicken. Der Aufzug testet `pack` am Stapel von morgen, bevor er losfährt.

<details><summary>Startcode</summary>

```python
# book_ids ist geladen: Signaturen wie "K-0412".
print(len(book_ids), book_ids[:3])


def pack(ids):
    ...  # gebt die Kartons zurück


boxes = pack(book_ids)
```

</details>

**Musterlösung:**

```python
from itertools import batched


def pack(ids):
    return list(batched(sorted(ids), 7, strict=True))


boxes = pack(book_ids)
print(len(boxes), boxes[-1])
```

**Geprüftes Ergebnis** (`_pack_check(pack, boxes)`):

```json
[["K-0013", "K-0045", "K-0075", "K-0095", "K-0105", "K-0132", "K-0152"], ["K-0220", "K-0247", "K-0277", "K-0366", "K-0381", "K-0388", "K-0466"], ["K-0490", "K-0499", "K-0582", "K-0696", "K-0699", "K-0773", "K-0777"], ["K-0782", "K-0827", "K-0867", "K-0874", "K-0892", "K-0900", "K-0930"]]
```

**Zeigt nach dem Lösen:**

> Der Aufzug summt und bringt die Kartons nach unten. Auf den Deckel des letzten Kartons ist eine Zahl gestempelt: **Packen → 4**

**Hinweise:**

1. Das Etikett auf den Archivkartons sagt, wie gepackt wird. Öffnet `itertools` über den Modulindex. Die Tabellen oben auf der Seite nennen jede Funktion mit einer Beschreibung in einer Zeile; eine davon bildet Gruppen fester Größe.
2. `itertools.batched(iterable, n, *, strict=False)`: Lest im Eintrag, was der Schlüsselwort-Parameter `strict` macht (neu in 3.13). `batched` arbeitet lazy, also packt es in `pack` in `list(...)`, sonst kommt der Fehler zu spät. Und das Etikett will zuerst die Reihenfolge der Signaturen.
3. `from itertools import batched`, dann `def pack(ids): return list(batched(sorted(ids), 7, strict=True))` und `boxes = pack(book_ids)`

### 3. Mahngebühren-Buch

**Übt:** Die Hinweise unter einer Funktion lesen (`round()` rundet Gleichstände zur geraden Zahl, Floats sind nicht exakt) und der Doku zu einem anderen Modul folgen (`decimal`: Zahlen aus Strings bauen, `quantize`, Rundungsarten).  
**Braucht:** 🔎 Gebührenordnung  
**Daten:** [fees.py](../../content/rooms/python-docs/data/fees.py)

**Aufgabe:**

> Das Mahngebühren-Buch ging nie auf: Margaretes Gebührenskript lag immer ein paar Cent daneben. Eine Bleistiftnotiz am Rand: „Warum mein Skript falsch ist, steht unter `round()` bei den eingebauten Funktionen. Folgt der Doku von dort aus.“
>
> Das Buch ist als `ledger` geladen, eine Liste von Paaren `(Titel, Tage überfällig)`. Berechnet jede Gebühr auf den Cent genau. Speichert die Gebühren in `fees`, eine pro Buch in der Reihenfolge des Buchs, und ihre Summe in `total`.
>
> Das Gebührenbuch nimmt nur exakte Dezimalzahlen auf den Cent genau, wie 0.50, niemals Floats.

<details><summary>Startcode</summary>

```python
# Margaretes Gebührenskript. ledger ist geladen: Paare (Titel, Tage überfällig).
RATE = 0.0  # Euro pro Tag

fees = []
for title, days in ledger:
    fee = round(days * RATE, 2)
    fees.append(fee)
total = sum(fees)
print(fees, total)
```

</details>

**Musterlösung:**

```python
from decimal import Decimal, ROUND_HALF_UP

RATE = Decimal("0.045")  # 4.5 cents per day

fees = []
for title, days in ledger:
    fees.append((days * RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
total = sum(fees)
print(fees, total)
```

**Geprüftes Ergebnis** (`[type(total).__name__, str(total), [(type(f).__name__, str(f)) for f in fees]]`):

```json
["Decimal", "6.30", [["Decimal", "0.05"], ["Decimal", "0.14"], ["Decimal", "0.32"], ["Decimal", "0.41"], ["Decimal", "0.50"], ["Decimal", "0.63"], ["Decimal", "0.68"], ["Decimal", "0.95"], ["Decimal", "1.13"], ["Decimal", "1.49"]]]
```

**Zeigt nach dem Lösen:**

> Das Buch geht auf den Cent genau auf. Am Rand, in roter Tinte: **Gebühren → 1**

**Hinweise:**

1. Die Gebührenordnung der Bibliothek nennt den Satz und wie gerundet wird. Unter `round()` sagt die Doku zwei Dinge: Gleichstände werden zur geraden Zahl gerundet, und ein Float wie `2.675` lässt sich nicht exakt speichern. Der Hinweis dort nennt das Modul für exaktes Rechnen mit Dezimalzahlen.
2. Auf der Seite zu `decimal`: Zahlen aus Strings bauen, `Decimal("0.045")`, nicht aus Floats; jede Gebühr mit `.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` runden.
3. `from decimal import Decimal, ROUND_HALF_UP`, dann `fees = []` und in der Schleife `fees.append((days * Decimal("0.045")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))`, und `total = sum(fees)`.

### 4. Das alte Terminal

**Übt:** Versionshinweise: Jeder Eintrag in der Doku sagt, wann er hinzukam oder sich geändert hat („Added in version 3.x“), damit ihr wisst, ob Code auf einem älteren Python läuft.  
**Braucht:** 🔎 Margaretes Skriptliste

**Aufgabe:**

> Das Terminal im Lesesaal ist uralt. Sein Startbildschirm zeigt `Python 3.8.10`. Margarete wollte ihre Skripte darauf laufen lassen.
>
> Das Terminal fragt nach seinem Admin-Code: für jede Funktion, die ihre Skripte benutzen und die es in Python 3.8 noch nicht gibt, die Unterversion der Python-Version, die sie eingeführt hat, in der Reihenfolge ihrer Liste, ohne Leerzeichen. (Eine Funktion aus Python 3.11 ergäbe `11`.)

**Antwort:** `91012`

**Zeigt nach dem Lösen:**

> Das Terminal piept und druckt einen Zettel: „Stempelmaschine, Service-PIN: **5318**“

**Hinweise:**

1. Margarete hat die Liste der Funktionen neben das Terminal gepinnt. Schlagt jede nach (der allgemeine Index oder die Suche findet sie). Am Ende ihres Eintrags steht ein Hinweis wie „Added in version 3.x“.
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
> Die Rückgabedaten sind als `returned` geladen, ISO-Datumsstrings. Repariert das Skript, sodass `stamps` für jedes Buch den richtigen Rückgabestempel enthält.

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

1. Die Anleitung der Maschine nennt das Stempelformat. Auf der Seite zu `datetime` hat der Abschnitt „strftime() and strptime() Format Codes“ eine Tabelle mit Codes. Drei davon erwähnen ISO 8601.
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
> Regale von A bis Z;
> innerhalb eines Regals Autoren von Z bis A;
> innerhalb eines Autors Titel von A bis Z. (Fragt nicht.)
>
> Das Sortier-HOWTO in der Python-Doku zeigt, wie das mit mehreren Sortierungen geht. Lest den Teil über Stabilität. Welche Sortierung zuerst kommt, steht dort auch. — M. H.

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
