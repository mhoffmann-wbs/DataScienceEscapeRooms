# Das Schmetterlingshaus: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Kleebergs Botanischer Garten an einem Novemberabend. Eure späte Führung durchs tropische Schmetterlingshaus hatte gerade begonnen, als das Licht flackerte: Die Klimasteuerung war abgestürzt. Ihre Sicherheitsregel ist streng. Wenn das Klima ausfällt, verriegeln sich beide Schleusentüren, damit kein Schmetterling in die Kälte entkommt.
>
> Ole Brandt, der Techniker des Gartens, hat die Skripte geschrieben, die das Haus steuern. Heute Nachmittag hat sein Praktikant Finn sie vor seinem Urlaub „aufgeräumt“, und jetzt funktioniert keins mehr. Ole ruft aus einem Stau an: **„Der Code ist ja noch da. Behebt Finns Fehler, dann zeigt jedes System beim Neustart eine Zahl.“**
>
> Lasst die Skripte laufen und lest, was Python euch sagt: Die Fehlermeldungen verraten mehr, als man denkt. Oles Debugging-Leitfaden liegt auf dem Lesepult.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Klimasteuerung | Fehlermeldungen lesen: ein `SyntaxError` und sein Zeiger `^`, einen Fehler nach dem anderen beheben, `KeyError`, und `NameError` mit seinem „Did you mean“. | 🔎 Klebezettel an der Pinnwand |
| 2 | Futterstation | Einen Traceback durch mehrere Funktionen lesen: Der Absturz passiert in `portion()`, die Ursache steckt in den Daten, die dort ankommen. `repr()` zeigt Leerzeichen und Zahlen, die als Text gespeichert sind; `strip()`, `lower()`, `int()`. | 🔎 Whiteboard: Fütterung |
| 3 | Schlupfkasten | Tests mit `assert`: Wenn ein Test fehlschlägt, gebt aus, was die Funktion wirklich zurückgibt, und rechnet von Hand nach, was sie zurückgeben sollte. Ein Vorzeichenfehler, ein `return` in einer Schleife, eine fehlende untere Grenze. | 🔎 Notiz neben dem Schlupfkasten |
| 4 | Zähl-Tablet | Fehler ohne Fehlermeldung: die Ausgabe mit einem bekannten Wert vergleichen; `b = a` kopiert kein Dictionary; Elemente aus einer Liste entfernen, während man über sie läuft, überspringt Elemente. | 🔎 Strichliste der Freiwilligen |
| 5 | Sensorzentrale der Schleuse | Warum `except: pass` Fehler versteckt: es herausnehmen, um den echten Fehler zu sehen, und ihn dann beheben: `split()` mit dem richtigen Trennzeichen, Dezimalkommas, fehlende Messungen weglassen statt sie als 0 zu zählen. | 🔒 1. Klimasteuerung, 🔎 Handbuch der Sensorzentrale, Seite 3 |
| 6 | Schleusentür (Abschluss-Schloss) | Die Ergebnisse des Raums zusammensetzen. | 5. Sensorzentrale der Schleuse (sein Ergebnis), 2. Futterstation (sein Ergebnis), 3. Schlupfkasten (sein Ergebnis), 4. Zähl-Tablet (sein Ergebnis), 🔎 Klemmbrett neben der Schleuse |

**Abschluss-Code:** `7683`

## Stationen

### 1. Klimasteuerung

**Übt:** Fehlermeldungen lesen: ein `SyntaxError` und sein Zeiger `^`, einen Fehler nach dem anderen beheben, `KeyError`, und `NameError` mit seinem „Did you mean“.  
**Braucht:** 🔎 Klebezettel an der Pinnwand  
**Daten:** [climate.py](../../content/rooms/python-debug/data/climate.py)

**Aufgabe:**

> Die Klimasteuerung ist abgestürzt, als Finns Aufräumaktion live ging, und jede Zone des Hauses kühlt aus. Oles Skript stellt für jede Zone eine Heizstufe und eine Sprühstufe ein, aber es startet nicht einmal.
>
> Lasst es laufen, lest den Fehler, behebt ihn, lasst es wieder laufen. Wenn es funktioniert, enthalten `heater` und `misters` eine Stufe pro Zone, und das Skript gibt die PIN der Sensorzentrale aus. Die Prüfung ruft `levels` außerdem mit den Messwerten einer späteren Stunde auf, behaltet die Funktion also.

<details><summary>Startcode</summary>

```python
# Oles Klimasteuerung: eine Heizstufe und eine Sprühstufe für jede Zone.
# zones ist geladen: {"rainforest": {"temp": 23.4, "humidity": 71}, ...}
TARGETS = {
    "rainforest": (27.0, 85),
    "cloud forest": (21.0, 90),
    "meadow": (25.0, 70),
    "nursery": (26.0, 80),
}


def levels(zones):
    """Heiz- und Sprühstufe für jede Zone."""
    heater = {}
    misters = {}
    for name, reading in zones.items():
        target_temp, target_humidity = TARGETS[name]
        heat = round((target_temp - reading["temp"]) * 10)
        if heat < 0
            heat = 0
        heater[name] = heat
        misters[name] = max(target_humidty - reading["humidity"], 0)
    return heater, misters


heater, misters = levels(zones)
print("Heizstufen:", heater)
print("Sprühstufen:" misters)
pin = sum(heater.values()) * 100 + sum(misters.values())
print("PIN der Sensorzentrale:", pin)
```

</details>

**Musterlösung:**

```python
TARGETS = {
    "rainforest": (27.0, 85),
    "cloud_forest": (21.0, 90),
    "meadow": (25.0, 70),
    "nursery": (26.0, 80),
}


def levels(zones):
    """Heater and mister level for every zone."""
    heater = {}
    misters = {}
    for name, reading in zones.items():
        target_temp, target_humidity = TARGETS[name]
        heat = round((target_temp - reading["temp"]) * 10)
        if heat < 0:
            heat = 0
        heater[name] = heat
        misters[name] = max(target_humidity - reading["humidity"], 0)
    return heater, misters


heater, misters = levels(zones)
print("Heater levels:", heater)
print("Mister levels:", misters)
pin = sum(heater.values()) * 100 + sum(misters.values())
print("Sensor hub PIN:", pin)
```

**Geprüftes Ergebnis** (`[heater, misters, levels(_later_zones)]`):

```json
[{"cloud_forest": 12, "meadow": 0, "nursery": 31, "rainforest": 36}, {"cloud_forest": 8, "meadow": 6, "nursery": 14, "rainforest": 14}, [{"cloud_forest": 8, "meadow": 9, "nursery": 5, "rainforest": 0}, {"cloud_forest": 5, "meadow": 15, "nursery": 0, "rainforest": 0}]]
```

**Zeigt nach dem Lösen:**

> Die Heizungen klicken an, und die Sprüher zischen. Die letzte Zeile des Skripts ist die PIN der Sensorzentrale: **7942**

**Hinweise:**

1. Lest zuerst die letzte Zeile der Fehlermeldung, dann die Zeile, die sie nennt. Python meldet einen Fehler nach dem anderen, also behebt ihn und lasst das Skript wieder laufen. Finns Zettel an der Pinnwand erklärt einen davon.
2. Vier Fehler: ein fehlender `:`, ein fehlendes `,` in einem `print`, ein Zonenname, der nicht mehr zu den Namen der Sensoren passt (`cloud_forest`), und eine falsch geschriebene Variable.
3. `if heat < 0:`, `print("Sprühstufen:", misters)`, der Schlüssel `"cloud_forest"` in `TARGETS`, und `target_humidity`.

### 2. Futterstation

**Übt:** Einen Traceback durch mehrere Funktionen lesen: Der Absturz passiert in `portion()`, die Ursache steckt in den Daten, die dort ankommen. `repr()` zeigt Leerzeichen und Zahlen, die als Text gespeichert sind; `strip()`, `lower()`, `int()`.  
**Braucht:** 🔎 Whiteboard: Fütterung  
**Daten:** [feeding.py](../../content/rooms/python-debug/data/feeding.py)

**Aufgabe:**

> Die Nektarschalen sind leer, und das Futterskript stürzt ab, bevor es einen einzigen Tropfen anrührt. Es berechnet aus der heutigen Morgenzählung, `census`, die die Freiwilligen in ihr Tablet getippt haben, wie viel Nektar jede Futterstelle braucht.
>
> Jeder Fehler tritt in derselben Funktion auf. Das heißt nicht, dass dort auch jeder Fehler steckt. Repariert das Skript, sodass `refill` die ml Nektar für jede Futterstelle enthält. Die Prüfung übergibt `feeder_total` außerdem eine Futterstelle der Abendschicht.

<details><summary>Startcode</summary>

```python
# Nektar pro Schmetterling und Tag, in ml.
NECTAR = {
    "blue morpho": 0.8,
    "owl butterfly": 1.2,
    "postman": 0.5,
    "zebra longwing": 0.4,
}


def portion(species, count):
    """Nektar für count Schmetterlinge einer Art."""
    return count * NECTAR[species]


def feeder_total(visitors):
    """Nektar für eine Futterstelle: visitors ordnet jeder Art zu, wie viele gezählt wurden."""
    total = 0
    for species, count in visitors.items():
        total += portion(species, count)
    return round(total, 1)


# census ist geladen: {"feeder 1": {"Blue Morpho": "14", ...}, ...}
refill = {}
for feeder, visitors in census.items():
    refill[feeder] = feeder_total(visitors)

print("Nachfüllen (ml):", refill)
print("Nektar insgesamt anzurühren:", round(sum(refill.values()), 1), "ml")
```

</details>

**Musterlösung:**

```python
NECTAR = {
    "blue morpho": 0.8,
    "owl butterfly": 1.2,
    "postman": 0.5,
    "zebra longwing": 0.4,
    "glasswing": 0.3,
}


def portion(species, count):
    """Nectar for count butterflies of one species."""
    return int(count) * NECTAR[species.strip().lower()]


def feeder_total(visitors):
    total = 0
    for species, count in visitors.items():
        total += portion(species, count)
    return round(total, 1)


refill = {}
for feeder, visitors in census.items():
    refill[feeder] = feeder_total(visitors)

print("Refill (ml):", refill)
print("Total nectar to mix:", round(sum(refill.values()), 1), "ml")
```

**Geprüftes Ergebnis** (`[refill, feeder_total(_late_feeder)]`):

```json
[{"feeder 1": 22.0, "feeder 2": 17.8, "feeder 3": 18.1, "feeder 4": 16.4}, 8.8]
```

**Zeigt nach dem Lösen:**

> Die Pumpe summt und füllt die vier Schalen. Ihr Display zeigt: **Nektar → 6**

**Hinweise:**

1. Lest den Traceback von unten nach oben: Der letzte Eintrag ist die Stelle des Absturzes (`portion`), die darüber zeigen, wer sie aufgerufen hat. Gebt am Anfang von `portion` `repr(species)` und `repr(count)` aus, um zu sehen, was wirklich ankommt.
2. Die Werte aus dem Tablet sind nicht das, was `NECTAR` erwartet: Namen mit Großbuchstaben, ein Name mit einem Leerzeichen am Ende, eine Art, die `NECTAR` noch nicht kennt (siehe Whiteboard), und Anzahlen, die als Text gespeichert sind. `strip()`, `lower()` und `int()` helfen.
3. Ergänzt `"glasswing": 0.3` in `NECTAR`, und schreibt in `portion` `return int(count) * NECTAR[species.strip().lower()]`.

### 3. Schlupfkasten

**Übt:** Tests mit `assert`: Wenn ein Test fehlschlägt, gebt aus, was die Funktion wirklich zurückgibt, und rechnet von Hand nach, was sie zurückgeben sollte. Ein Vorzeichenfehler, ein `return` in einer Schleife, eine fehlende untere Grenze.  
**Braucht:** 🔎 Notiz neben dem Schlupfkasten  
**Daten:** [hatchery.py](../../content/rooms/python-debug/data/hatchery.py)

**Aufgabe:**

> Schmetterlinge kurz vor dem Schlüpfen brauchen mehr Feuchtigkeit, und der Schlupfkasten erfährt vom Schlupf-Skript, welche das sind. Finn hat die beiden Funktionen „verbessert“, und jetzt schlagen Oles Tests fehl.
>
> Bringt die Tests zum Laufen. Dann listet `tonight` die Puppen, die heute schlüpfen, und `this_week` die, die in den nächsten 7 Tagen schlüpfen, heute eingeschlossen. Die Prüfung fragt `due` außerdem nach anderen Tagen.

<details><summary>Startcode</summary>

```python
# Wie viele Tage jede Art als Puppe verbringt.
DAYS_AS_CHRYSALIS = {
    "blue morpho": 14,
    "owl butterfly": 12,
    "zebra longwing": 11,
    "postman": 10,
    "glasswing": 9,
}


def days_left(chrysalis, today):
    """Tage, bis der Schmetterling schlüpft: 0 heißt heute, unter 0 heißt, er ist schon geschlüpft."""
    age = chrysalis["hung_on"] - today
    return DAYS_AS_CHRYSALIS[chrysalis["species"]] - age


def due(chrysalises, today, within):
    """Ids der Puppen, die in den nächsten `within` Tagen schlüpfen, ab heute."""
    ids = []
    for c in chrysalises:
        if days_left(c, today) < within:
            ids.append(c["id"])
        return ids


# Oles Tests. Vor dem Aufräumen liefen sie alle durch.
sample = [
    {"id": "T1", "species": "postman", "hung_on": 10},
    {"id": "T2", "species": "glasswing", "hung_on": 12},
    {"id": "T3", "species": "blue morpho", "hung_on": 1},
    {"id": "T4", "species": "owl butterfly", "hung_on": 12},
]
assert days_left(sample[0], 20) == 0
assert days_left(sample[1], 20) == 1
assert due(sample, 20, 1) == ["T1"]
assert due(sample, 20, 3) == ["T1", "T2"]
print("Alle Tests bestanden.")

# chrysalises und today sind geladen.
tonight = due(chrysalises, today, 1)
this_week = due(chrysalises, today, 7)
print("Schlüpfen heute Nacht:", tonight)
print("Schlüpfen diese Woche:", this_week)
```

</details>

**Musterlösung:**

```python
# How many days each species spends as a chrysalis.
DAYS_AS_CHRYSALIS = {
    "blue morpho": 14,
    "owl butterfly": 12,
    "zebra longwing": 11,
    "postman": 10,
    "glasswing": 9,
}


def days_left(chrysalis, today):
    """Days until the butterfly hatches: 0 means today, below 0 means it has already hatched."""
    age = today - chrysalis["hung_on"]
    return DAYS_AS_CHRYSALIS[chrysalis["species"]] - age


def due(chrysalises, today, within):
    """Ids of the chrysalises that hatch within the next `within` days, starting today."""
    ids = []
    for c in chrysalises:
        if 0 <= days_left(c, today) < within:
            ids.append(c["id"])
    return ids


# Ole's tests. They all passed before the clean-up.
sample = [
    {"id": "T1", "species": "postman", "hung_on": 10},
    {"id": "T2", "species": "glasswing", "hung_on": 12},
    {"id": "T3", "species": "blue morpho", "hung_on": 1},
    {"id": "T4", "species": "owl butterfly", "hung_on": 12},
]
assert days_left(sample[0], 20) == 0
assert days_left(sample[1], 20) == 1
assert due(sample, 20, 1) == ["T1"]
assert due(sample, 20, 3) == ["T1", "T2"]
print("All tests passed.")

# chrysalises and today are loaded.
tonight = due(chrysalises, today, 1)
this_week = due(chrysalises, today, 7)
print("Hatching tonight:", tonight)
print("Hatching this week:", this_week)
```

**Geprüftes Ergebnis** (`[tonight, this_week, due(chrysalises, today + 4, 3), due(chrysalises, today - 3, 5)]`):

```json
[["C12"], ["C02", "C03", "C05", "C06", "C08", "C09", "C10", "C12"], ["C02", "C08", "C09", "C10"], ["C04", "C06", "C07", "C11", "C12"]]
```

**Zeigt nach dem Lösen:**

> Die Sprüher im Kasten springen an, und sein Display zählt die Schmetterlinge, die diese Woche schlüpfen: **Puppen → 8**

**Hinweise:**

1. Ein `AssertionError` sagt nur, dass ein Test fehlgeschlagen ist. Gebt aus, was die Funktion wirklich zurückgibt, z. B. `print(days_left(sample[0], 20))`, und rechnet von Hand nach, was herauskommen sollte.
2. Drei Fehler: Das Alter einer Puppe wird verkehrt herum berechnet; `due` hört nach der ersten Puppe auf (seht euch an, wie weit `return` eingerückt ist); und `due` zählt auch Schmetterlinge mit, die schon geschlüpft sind (weniger als 0 Tage übrig).
3. `age = today - chrysalis["hung_on"]`, `if 0 <= days_left(c, today) < within:`, und `return ids` so eingerückt wie das `for`, nicht darin.

### 4. Zähl-Tablet

**Übt:** Fehler ohne Fehlermeldung: die Ausgabe mit einem bekannten Wert vergleichen; `b = a` kopiert kein Dictionary; Elemente aus einer Liste entfernen, während man über sie läuft, überspringt Elemente.  
**Braucht:** 🔎 Strichliste der Freiwilligen  
**Daten:** [census.py](../../content/rooms/python-debug/data/census.py)

**Aufgabe:**

> Jeden Abend zählen die Freiwilligen die Schmetterlinge. Ihr Tablet vergleicht die Zählung mit der von gestern und bestellt bei der Zucht neue Schmetterlinge für jede Art, von der keiner mehr da ist. Finn hat das Skript gekürzt. Es läuft ohne einen einzigen Fehler. Seht euch an, was es ausgibt.
>
> Repariert es, sodass `changes` die Veränderung pro Art seit gestern enthält und `order` die Arten, von denen keine Schmetterlinge mehr da sind. Die Prüfung lässt `evening` außerdem mit dem Protokoll eines anderen Abends laufen.

<details><summary>Startcode</summary>

```python
# counts (gestrige Zählung pro Art) und events (das heutige Protokoll) sind geladen.


def evening(counts, events):
    """Wendet die heutigen Ereignisse auf counts an. Gibt die gestrige Zählung, die Veränderung pro Art und die Arten zum Bestellen zurück."""
    yesterday = counts

    for event, species in events:
        if event == "hatched":
            counts[species] += 1
        else:  # gestorben oder freigelassen
            counts[species] -= 1

    changes = {}
    for species in counts:
        changes[species] = counts[species] - yesterday[species]

    # Arten ohne Schmetterlinge kommen auf die Bestellliste für die Zucht.
    order = list(counts)
    for species in order:
        if counts[species] > 0:
            order.remove(species)

    return yesterday, changes, order


yesterday, changes, order = evening(counts, events)
print("Gestern:", sum(yesterday.values()), "Schmetterlinge")
print("Heute:  ", sum(counts.values()), "Schmetterlinge")
print("Veränderungen:", changes)
print("Bei der Zucht bestellen:", order)
```

</details>

**Musterlösung:**

```python
# counts (yesterday's count per species) and events (today's log) are loaded.


def evening(counts, events):
    """Applies today's events to counts. Returns yesterday's counts, the change per species and the species to order."""
    yesterday = counts.copy()

    for event, species in events:
        if event == "hatched":
            counts[species] += 1
        else:  # died or released
            counts[species] -= 1

    changes = {}
    for species in counts:
        changes[species] = counts[species] - yesterday[species]

    # Species with no butterflies left go on the order list for the breeder.
    order = []
    for species in counts:
        if counts[species] == 0:
            order.append(species)

    return yesterday, changes, order


yesterday, changes, order = evening(counts, events)
print("Yesterday:", sum(yesterday.values()), "butterflies")
print("Tonight:  ", sum(counts.values()), "butterflies")
print("Changes:", changes)
print("Order from the breeder:", order)
```

**Geprüftes Ergebnis** (`[changes, order, evening(dict(_counts2), list(_events2))[1:]]`):

```json
[{"blue morpho": 3, "glasswing": -1, "monarch": -1, "owl butterfly": 1, "paper kite": -1, "postman": -2, "zebra longwing": 2}, ["postman", "glasswing", "paper kite"], [{"blue morpho": -1, "glasswing": 1, "monarch": -1, "paper kite": 0, "postman": -1}, ["postman", "monarch", "paper kite"]]]
```

**Zeigt nach dem Lösen:**

> Das Tablet schickt die Bestellung für morgen an die Zucht und zeigt, wie viele Arten darauf stehen: **Zählung → 3**

**Hinweise:**

1. Vergleicht die Ausgabe mit der Strichliste der Freiwilligen: War die Summe gestern wirklich 48? Und ist vom Bananenfalter (`owl butterfly`) wirklich keiner mehr da? Gebt `counts` und `yesterday` direkt nach der ersten Schleife aus.
2. `yesterday = counts` kopiert nichts: Beide Namen zeigen auf dasselbe Dictionary, also verändert die Schleife „beide“. Und wer Elemente aus der Liste entfernt, über die er gerade läuft, lässt die Schleife nach jedem entfernten Element eins überspringen.
3. `yesterday = counts.copy()`, und `order = [species for species in counts if counts[species] == 0]`.

### 5. Sensorzentrale der Schleuse

**Übt:** Warum `except: pass` Fehler versteckt: es herausnehmen, um den echten Fehler zu sehen, und ihn dann beheben: `split()` mit dem richtigen Trennzeichen, Dezimalkommas, fehlende Messungen weglassen statt sie als 0 zu zählen.  
**Braucht:** 🔒 1. Klimasteuerung, 🔎 Handbuch der Sensorzentrale, Seite 3  
**Daten:** [airlock.py](../../content/rooms/python-debug/data/airlock.py)

**Zahlenschloss** (öffnet mit `7942`):

> Der Bildschirm der Sensorzentrale ist gesperrt. Er fragt nach einer vierstelligen PIN.

**Aufgabe:**

> Bevor sich die innere Schleusentür öffnen darf, prüft die Sensorzentrale die Lufttemperatur in der Schleuse: Darf die Tür aufgehen? Finn hat ihr Skript „absturzsicher“ gemacht. Jetzt stürzt es nie mehr ab, und es findet auch nie eine einzige Messung.
>
> Repariert es, sodass `readings` jede gültige Lufttemperatur aus dem Protokoll als float enthält, `average` ihren Mittelwert und `door_opens` (`True` oder `False`), ob sich die innere Tür öffnen darf. Die Prüfung lässt `air_readings` außerdem mit dem Protokoll der nächsten Nacht laufen.

<details><summary>Startcode</summary>

```python
# log ist geladen: eine Zeile pro Sensormessung.
# Finn: jetzt absturzsicher, keine Fehler mehr! :)
def air_readings(log):
    """Jede Lufttemperatur aus dem Protokoll, als float."""
    readings = []
    for line in log:
        try:
            time, sensor, value = line.split(",")
            if sensor == "air":
                readings.append(float(value))
        except:
            pass
    return readings


readings = air_readings(log)
average = sum(readings) / len(readings) if readings else 0
print("Gültige Messungen:", len(readings))
print("Durchschnittstemperatur:", round(average, 2))
```

</details>

**Musterlösung:**

```python
def air_readings(log):
    readings = []
    for line in log:
        time, sensor, value = line.split(";")
        if sensor == "air" and value != "--":
            readings.append(float(value.replace(",", ".")))
    return readings


readings = air_readings(log)
average = sum(readings) / len(readings)
print("Valid readings:", len(readings))
print("Average temperature:", round(average, 2))
door_opens = 22 <= average <= 28
print("Door opens:", door_opens)
```

**Geprüftes Ergebnis** (`[len(readings), round(average, 2), door_opens, air_readings(_night_log)]`):

```json
[7, 23.84, true, [21.5, 29.0, 26.25]]
```

**Zeigt nach dem Lösen:**

> Die Zentrale akzeptiert die Messungen: 23,8 °C, sicher für die Schmetterlinge. Ihr Bildschirm zeigt die Zahl der gültigen Messungen: **Luft → 7**

**Hinweise:**

1. Das `try` mit `except: pass` verschluckt jeden Fehler, also seht ihr nicht, was schiefgeht. Nehmt es heraus (oder gebt den Fehler im `except` aus), lasst das Skript laufen und lest den echten Fehler.
2. Drei Dinge gehen schief: Die Zeilen werden am falschen Zeichen getrennt, manche Messungen haben ein Dezimalkomma (`23,8`), und das Handbuch sagt, was `--` bedeutet. Es sagt auch, wann sich die Tür öffnen darf.
3. `time, sensor, value = line.split(";")`, eine Messung mit dem Wert `"--"` überspringen, und `readings.append(float(value.replace(",", ".")))`, dann `door_opens = 22 <= average <= 28`.

### 6. Schleusentür (Abschluss-Schloss)

**Übt:** Die Ergebnisse des Raums zusammensetzen.  
**Braucht:** 5. Sensorzentrale der Schleuse (sein Ergebnis), 2. Futterstation (sein Ergebnis), 3. Schlupfkasten (sein Ergebnis), 4. Zähl-Tablet (sein Ergebnis), 🔎 Klemmbrett neben der Schleuse

**Aufgabe:**

> Die innere Schleusentür. Ihr Tastenfeld will vier Ziffern.

**Antwort:** `7683`

**Hinweise:**

1. Vier Systeme haben beim Neustart eine Zahl gezeigt. Die Checkliste neben der Tür sagt, in welcher Reihenfolge sie gehören.
2. Die Reihenfolge ist: Luft, Nektar, Puppen, Zählung.
3. 7683

## Hinweise im Raum

### 🔎 Klebezettel an der Pinnwand

*Gebraucht von: 1. Klimasteuerung*

> Ole! Ich hab vor meinem Urlaub alle deine Skripte aufgeräumt 🌴
> - die Zonen in snake_case umbenannt, damit alles einheitlich ist
> - die Schlupf-Funktionen „verbessert“
> - das Zähl-Skript gekürzt
> - das Sensorskript der Schleuse absturzsicher gemacht
> Gern geschehen! — Finn
>
> Darunter, in Oles Handschrift: **Finn. Was hast du getan.**

### 🔎 Whiteboard: Fütterung

*Gebraucht von: 2. Futterstation*

> NEKTAR pro Schmetterling und Tag
>
> NEU seit Montag: **glasswing (Glasflügler), 0,3 ml**. Noch nicht im Futterskript!

### 🔎 Notiz neben dem Schlupfkasten

*Gebraucht von: 3. Schlupfkasten*

> Die Tests am Ende des Schlupf-Skripts sagen, was die Funktionen tun müssen, von Hand an vier Testpuppen nachgerechnet.
>
> Wenn ein Test fehlschlägt, repariert die Funktion, nicht den Test. — O. B.

### 🔎 Strichliste der Freiwilligen

*Gebraucht von: 4. Zähl-Tablet*

> Abendzählung gestern: insgesamt **47 Schmetterlinge**. ✔

### 🔎 Handbuch der Sensorzentrale, Seite 3

*Gebraucht von: 5. Sensorzentrale der Schleuse*

> **Das Protokoll.** Eine Zeile pro Messung: Uhrzeit, Sensor und Wert, durch Semikolons getrennt.
>
> **`--`** heißt, dass der Sensor bei dieser Messung offline war. Lasst sie weg: Eine fehlende Messung ist nicht 0 °C.
>
> Die innere Tür öffnet sich, wenn die mittlere Lufttemperatur zwischen 22 und 28 °C liegt.

### 🔎 Klemmbrett neben der Schleuse

*Gebraucht von: 6. Schleusentür*

> NEUSTART-CHECKLISTE (Schleusen-Override)
>
> Tippt die Neustart-Zahlen in dieser Reihenfolge ins Tastenfeld der Schleuse:
> 1. Luft (Sensorzentrale)
> 2. Nektar (Futterstation)
> 3. Puppen (Schlupfkasten)
> 4. Zählung (Zähl-Tablet)
>
> — O. B.

## Handbuch im Raum: 📖 Debugging-Leitfaden

**Eine Fehlermeldung lesen:** [`Traceback`](https://docs.python.org/3.14/tutorial/errors.html), [`SyntaxError`](https://docs.python.org/3.14/library/exceptions.html#SyntaxError), [`NameError`](https://docs.python.org/3.14/library/exceptions.html#NameError), [`KeyError`](https://docs.python.org/3.14/library/exceptions.html#KeyError), [`TypeError`](https://docs.python.org/3.14/library/exceptions.html#TypeError), [`ValueError`](https://docs.python.org/3.14/library/exceptions.html#ValueError), [`AssertionError`](https://docs.python.org/3.14/library/exceptions.html#AssertionError)

**Hineinschauen:** [`print(f"{x=}")`](https://docs.python.org/3.14/reference/lexical_analysis.html#f-strings), [`repr(x)`](https://docs.python.org/3.14/library/functions.html#repr), [`type(x)`](https://docs.python.org/3.14/library/functions.html#type), [`assert condition`](https://docs.python.org/3.14/reference/simple_stmts.html#the-assert-statement), [`Indentation`](https://docs.python.org/3.14/reference/lexical_analysis.html#indentation)

**Fehler ohne Fehlermeldung:** [`b = a`](https://docs.python.org/3.14/faq/programming.html#why-did-changing-list-y-also-change-list-x), [`for item in items: items.remove(…)`](https://docs.python.org/3.14/tutorial/controlflow.html#for-statements), [`try: … except: pass`](https://docs.python.org/3.14/tutorial/errors.html#handling-exceptions)

**Praktisch für die Reparaturen:** [`s.strip(), s.lower()`](https://docs.python.org/3.14/library/stdtypes.html#str.strip), [`s.split(sep), s.replace(old, new)`](https://docs.python.org/3.14/library/stdtypes.html#str.split), [`int(x), float(x)`](https://docs.python.org/3.14/library/functions.html#float)
