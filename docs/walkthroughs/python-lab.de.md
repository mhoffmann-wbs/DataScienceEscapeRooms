# Quarantäne: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Dr. Ida Kranich erforscht Pilze, die im Dunkeln leuchten. Letzte Nacht hat ein defekter Sensor die Quarantäne des Labors ausgelöst, und die Türen haben sich verriegelt. Ida ist durch die Lüftung entkommen, und jetzt seid ihr eingeschlossen.
>
> Der Ausgang öffnet sich nur mit einem 4-stelligen Override-Code. Ida hat nie einen ganzen Code an einem Ort aufbewahrt, also sind die Ziffern in ihren Geräten versteckt. Teilt euch auf, seht euch um und erzählt einander, was ihr findet.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Idas Terminal | Variablen, String-Methoden (`.upper()`), Zahlen mit `str()` in Text umwandeln, `len()` | 🔎 Ein gerahmtes Foto, 🔎 Eine Urkunde |
| 2 | Der Inkubator | Listen, `for`-Schleifen mit `enumerate`, `if`/`elif`, Zählen, fehlende Werte (`None`) überspringen | 🔎 Inkubator-Anleitung |
| 3 | Das verschlüsselte Notizbuch | Strings: Umdrehen mit `[::-1]`, Schleifen über Zeichen, Strings zusammenbauen, eine Funktion schreiben | 🔎 Das Mikroskop |
| 4 | Der Probengefrierschrank | Dictionaries: verschachtelte Zugriffe, Schleifen über `.items()`, Filtern mit Bedingungen | 3. Das verschlüsselte Notizbuch |
| 5 | Die Lüftungssteuerung | Debugging: Fehlermeldungen lesen, Syntax- und Einrückungsfehler, Umwandlung mit `int()`, `+=` statt `=` | 🔎 Luftqualitäts-Poster |
| 6 | Das Tastenfeld am Ausgang (Abschluss-Schloss) | Ergebnisse aus dem ganzen Raum kombinieren | 1. Idas Terminal, 2. Der Inkubator, 3. Das verschlüsselte Notizbuch, 4. Der Probengefrierschrank, 5. Die Lüftungssteuerung, 🔎 Das Whiteboard |

**Abschluss-Code:** `6348`

## Stationen

### 1. Idas Terminal

**Übt:** Variablen, String-Methoden (`.upper()`), Zahlen mit `str()` in Text umwandeln, `len()`  
**Braucht:** 🔎 Ein gerahmtes Foto, 🔎 Eine Urkunde

**Aufgabe:**

> Idas Computer verlangt ein Passwort. Neben der Tastatur liegt ihr Login-Hilfsskript, das in der Nacht des Lockdowns abgestürzt ist.
>
> Füllt die fehlenden Werte mit Dingen aus, die ihr im Labor findet, repariert das Skript und speichert das Passwort in `password`.

<details><summary>Startcode</summary>

```python
# Idas Login-Helfer. Ist in der Nacht des Lockdowns abgestürzt.
# Passwort-Regel (mein Gedächtnis ist furchtbar):
#   Name meiner Katze in GROSSBUCHSTABEN + Jahr meiner Promotion + Anzahl der Buchstaben meines Nachnamens
cat = "???"         # der Name steht auf dem Foto auf meinem Schreibtisch
doctorate = "???"   # steht auf meiner Urkunde
last_name = "Kranich"

password = cat + doctorate + len(last_name)
print("Login mit:", password)
```

</details>

**Musterlösung:**

```python
cat = "Pixel"
doctorate = 2019
last_name = "Kranich"

password = cat.upper() + str(doctorate) + str(len(last_name))
print("Logging in with:", password)
```

**Geprüftes Ergebnis** (`password`):

```json
"PIXEL20197"
```

**Zeigt nach dem Lösen:**

> Der Bildschirm entsperrt sich: **Willkommen zurück, Ida.** Im Postausgang wartet ein nicht gesendeter Entwurf:
>
> "Notiz an mich: Nie wieder die Override-Reihenfolge an das Whiteboard schreiben! Sie lautet ☀ 🍄 ❄ 🌀."

**Hinweise:**

1. Der Name der Katze steht auf dem Foto auf Idas Schreibtisch, das Jahr auf der Urkunde an der Wand. Vorsicht: In diesem Raum gibt es mehr als eine Jahreszahl.
2. Python kann Text und Zahlen nicht mit `+` verbinden. `str(...)` macht aus einer Zahl Text, und `.upper()` macht Text zu Großbuchstaben.
3. `password = cat.upper() + str(doctorate) + str(len(last_name))`, mit `cat = "Pixel"` und `doctorate = 2019`.

### 2. Der Inkubator

**Übt:** Listen, `for`-Schleifen mit `enumerate`, `if`/`elif`, Zählen, fehlende Werte (`None`) überspringen  
**Braucht:** 🔎 Inkubator-Anleitung  
**Daten:** [incubator.py](../../content/rooms/python-lab/data/incubator.py)

**Aufgabe:**

> Der Inkubator hat die ganze Nacht Temperaturen aufgezeichnet, ein Wert pro Stunde, beginnend bei Stunde 0. Das Protokoll ist als Liste `temps` geladen.
>
> Die Bedienungsanleitung des Inkubators liegt irgendwo im Labor. Ermittelt damit drei Dinge:
>
> `missing`: wie viele Werte fehlen (der Sensor ist ausgefallen)
>
> `alarms`: wie viele Werte außerhalb des sicheren Bereichs lagen
>
> `first_alarm`: die Stunde des ersten Alarms

<details><summary>Startcode</summary>

```python
# temps ist schon geladen. Probiert zuerst print(temps).
missing = 0
alarms = 0
first_alarm = None
```

</details>

**Musterlösung:**

```python
missing = 0
alarms = 0
first_alarm = None

for hour, t in enumerate(temps):
    if t is None:
        missing += 1
    elif t < 20.0 or t > 26.0:
        alarms += 1
        if first_alarm is None:
            first_alarm = hour

print(missing, alarms, first_alarm)
```

**Geprüftes Ergebnis** (`[missing, alarms, first_alarm]`):

```json
[3, 6, 4]
```

**Zeigt nach dem Lösen:**

> Der Inkubator piept und sein Display leuchtet auf: **☀ 6**

**Hinweise:**

1. Die Anleitung an der Wand im unteren Labor nennt den sicheren Bereich und erklärt, was `None` bedeutet. `for hour, t in enumerate(temps):` liefert euch Stunde und Temperatur zugleich.
2. Prüft zuerst auf einen fehlenden Wert (`if t is None:`) und vergleicht nur echte Zahlen. Ein Wert ist ein Alarm, wenn `t < 20.0 or t > 26.0`: genau 20.0 und 26.0 sind noch sicher.
3. In der Schleife: `if t is None: missing += 1`, `elif t < 20.0 or t > 26.0: alarms += 1`, und `first_alarm = hour` nur setzen, solange `first_alarm is None` gilt.

### 3. Das verschlüsselte Notizbuch

**Übt:** Strings: Umdrehen mit `[::-1]`, Schleifen über Zeichen, Strings zusammenbauen, eine Funktion schreiben  
**Braucht:** 🔎 Das Mikroskop  
**Daten:** [notebook.py](../../content/rooms/python-lab/data/notebook.py)

**Aufgabe:**

> Idas Laptop steht aufgeklappt auf der Laborbank und zeigt ihre Forschungsnotizen. Sie sind Kauderwelsch: Ida hat sie verschlüsselt, damit die Praktikanten sie nicht lesen können.
>
> Auf einem Klebezettel am Bildschirm steht: "Jede Zeile ist umgedreht, und jeder Buchstabe ist um KEY Stellen im Alphabet nach vorne verschoben."
>
> Schreibt `decode(line)` so, dass es die lesbare Zeile zurückgibt, und lest dann die Notizen in `notes["de"]`. Die Hilfsfunktion `unshift(letter, n)` schiebt einen Buchstaben um n Stellen zurück.

<details><summary>Startcode</summary>

```python
# Probiert: print(unshift("d", 3))
KEY = 0  # der Schlüssel ist irgendwo im Labor


def decode(line):
    result = ""
    # euer Code hier
    return result


for line in notes["de"]:
    print(decode(line))
```

</details>

**Musterlösung:**

```python
KEY = 7

def decode(line):
    result = ""
    for letter in line[::-1]:
        result += unshift(letter, KEY)
    return result

for line in notes["en"]:
    print(decode(line))
```

**Geprüftes Ergebnis** (`[decode(line) for line in notes["en"] + notes["de"]]`):

```json
["Day 212: the caps only glow when it is cold.", "I moved all glowing samples into the freezer.", "Freezer lock: add up the spore counts of the samples listed on its door.", "The mushroom digit for the override is three.", "Tag 212: Die H\u00fcte leuchten nur, wenn es kalt ist.", "Ich habe alle leuchtenden Proben in den Gefrierschrank gelegt.", "Gefrierschloss: Addiert die Sporenzahlen der Proben, die auf seiner T\u00fcr stehen.", "Die Pilz-Ziffer f\u00fcr den Override ist drei."]
```

**Zeigt nach dem Lösen:**

> Die entschlüsselten Notizen:
>
> "Tag 212: Die Hüte leuchten nur, wenn es kalt ist.
>
> Ich habe alle leuchtenden Proben in den Gefrierschrank gelegt.
>
> Gefrierschloss: Addiert die Sporenzahlen der Proben, die auf seiner Tür stehen.
>
> Die Pilz-Ziffer für den Override ist drei."

**Hinweise:**

1. KEY ist eine Zahl, die ihr an einem Laborgerät findet. Schaut euch das Mikroskop an.
2. `line[::-1]` dreht einen String um. Geht dann Buchstabe für Buchstabe durch die umgedrehte Zeile (`for letter in ...:`) und hängt `unshift(letter, KEY)` an `result` an.
3. `KEY = 7`, und in `decode`: `for letter in line[::-1]:` gefolgt von `result += unshift(letter, KEY)`.

### 4. Der Probengefrierschrank

**Übt:** Dictionaries: verschachtelte Zugriffe, Schleifen über `.items()`, Filtern mit Bedingungen  
**Braucht:** 3. Das verschlüsselte Notizbuch  
**Daten:** [catalog.py](../../content/rooms/python-lab/data/catalog.py)

**Aufgabe:**

> Der Gefrierschrank ist mit einem Zahlenschloss gesichert. Auf einem Etikett an der Tür steht:
>
> `SAMPLES INSIDE: M-04 · M-09 · M-1▒`
>
> Die letzte Nummer ist verschmiert. Darunter steht in Idas Handschrift: "die einzige M-1…-Probe, die leuchtet".
>
> Idas Probenkatalog ist als Dictionary `catalog` geladen.

<details><summary>Startcode</summary>

```python
# catalog ordnet jeder Proben-ID ihre Details zu. Probiert:
print(catalog["M-01"])
```

</details>

**Antwort:** `7325`

**Zeigt nach dem Lösen:**

> Das Schloss springt auf, und kalter Nebel quillt heraus. Zwischen den vereisten Probenröhrchen steht ein Fläschchen mit einem Etikett: **❄ 4**

**Hinweise:**

1. Idas entschlüsselte Notizen verraten, wie der Code funktioniert. Das Etikett sagt euch, welche Proben ihr braucht.
2. `catalog["M-04"]["spores"]` schlägt einen Wert nach. Um die verschmierte Probe zu finden, geht mit `for sample_id, info in catalog.items():` durch den Katalog und prüft `sample_id.startswith("M-1")` und `info["glows"]`.
3. Die verschmierte Probe ist M-13. Der Code ist die Summe der Sporenzahlen von M-04, M-09 und M-13.

### 5. Die Lüftungssteuerung

**Übt:** Debugging: Fehlermeldungen lesen, Syntax- und Einrückungsfehler, Umwandlung mit `int()`, `+=` statt `=`  
**Braucht:** 🔎 Luftqualitäts-Poster  
**Daten:** [ventilation.py](../../content/rooms/python-lab/data/ventilation.py)

**Aufgabe:**

> Die Lüftung ist mit Beginn der Quarantäne stehen geblieben. Idas Neustart-Skript gibt jedem Lüfter eine Drehzahlstufe nach seinem CO₂-Wert, aber sie hat es um 3 Uhr nachts geschrieben, und es ist nie gelaufen.
>
> Die Schwellenwerte fehlen, und das Skript hat 4 Fehler. Repariert es, sodass `speeds` die Stufe jedes Lüfters enthält und `total` ihre Summe.

<details><summary>Startcode</summary>

```python
# Neustart der Lüftung. co2 ist schon geladen, z. B. {"north": "1250", ...}
HIGH = 0     # TODO: Schwellenwerte vom Luftqualitäts-Poster übernehmen
MEDIUM = 0

speeds = {}
for vent in co2
    level = co2[vent]
    if level > HIGH:
        speed = 3
    elif level > MEDIUM:
        speed = 2
    else:
    speed = 1
    speeds[vent] = speed

total = 0
for speed in speeds.values():
    total = speed

print("Lüfterstufen:", speeds)
print("Summe:", total)
```

</details>

**Musterlösung:**

```python
HIGH = 1000
MEDIUM = 600

speeds = {}
for vent in co2:
    level = int(co2[vent])
    if level > HIGH:
        speed = 3
    elif level > MEDIUM:
        speed = 2
    else:
        speed = 1
    speeds[vent] = speed

total = 0
for speed in speeds.values():
    total += speed

print("Fan speeds:", speeds)
print("Total:", total)
```

**Geprüftes Ergebnis** (`[speeds, total]`):

```json
[{"east": 1, "north": 3, "south": 2, "west": 2}, 8]
```

**Zeigt nach dem Lösen:**

> Die Lüftung springt rumpelnd wieder an. Ein Display an der Steuerung zeigt: **🌀 8**

**Hinweise:**

1. Lasst das Skript laufen und behebt einen Fehler nach dem anderen: Die Fehlermeldung nennt die Zeile. Die Schwellenwerte stehen auf dem Luftqualitäts-Poster.
2. Die vier Fehler: ein fehlender `:`, eine nicht eingerückte Zeile, Text wird mit einer Zahl verglichen (`int(...)` hilft), und eine Summe wird überschrieben statt erhöht.
3. `HIGH = 1000`, `MEDIUM = 600`, `for vent in co2:`, `level = int(co2[vent])`, `speed = 1` unter `else:` einrücken, und `total += speed`.

### 6. Das Tastenfeld am Ausgang (Abschluss-Schloss)

**Übt:** Ergebnisse aus dem ganzen Raum kombinieren  
**Braucht:** 1. Idas Terminal, 2. Der Inkubator, 3. Das verschlüsselte Notizbuch, 4. Der Probengefrierschrank, 5. Die Lüftungssteuerung, 🔎 Das Whiteboard

**Aufgabe:**

> Ein schweres Tastenfeld neben der versiegelten Tür. Auf dem Display steht:
>
> `QUARANTINE OVERRIDE: _ _ _ _`
>
> Ida hat den Code nie an einem einzigen Ort aufbewahrt.

**Antwort:** `6348`

**Hinweise:**

1. Jede gelöste Station liefert eine Ziffer neben einem Symbol. Öffnet eine gelöste Station noch einmal, um ihre Ziffer zu lesen.
2. Das Whiteboard zeigt, welches Symbol zu welcher Station gehört. Idas Entwurf auf ihrem Terminal verrät die Reihenfolge.
3. Die Reihenfolge ist ☀ 🍄 ❄ 🌀: Inkubator, Notizbuch, Gefrierschrank, Lüftung.

## Hinweise im Raum

### 🔎 Ein gerahmtes Foto

*Gebraucht von: 1. Idas Terminal*

> Eine grimmige graue Katze sitzt auf einem Stapel Laborbücher.
>
> Auf der Rückseite, mit Kuli: "Pixel, Sommer 2017"

### 🔎 Eine Urkunde

*Gebraucht von: 1. Idas Terminal*

> ALBERT-LUDWIGS-UNIVERSITÄT FREIBURG
>
> Doktor der Naturwissenschaften (Mykologie)
>
> verliehen an Ida Kranich
>
> 14. Juni 2019

### 🔎 Inkubator-Anleitung

*Gebraucht von: 2. Der Inkubator*

> INKUBATOR IN-200 · KURZANLEITUNG
>
> Sicherer Bereich: 20,0 °C bis 26,0 °C. Beide Grenzen gelten noch als sicher.
>
> Jeder Wert außerhalb des sicheren Bereichs löst einen Alarm aus.
>
> Fällt der Sensor aus, speichert das Protokoll None statt einer Zahl.

### 🔎 Das Mikroskop

*Gebraucht von: 3. Das verschlüsselte Notizbuch*

> Unter der Linse liegt noch ein Objektträger mit einem schwach leuchtenden Pilzhut.
>
> Das Rädchen an der Seite steht auf 7. Daneben hat jemand ein Wort ins Metall geritzt: KEY

### 🔎 Luftqualitäts-Poster

*Gebraucht von: 5. Die Lüftungssteuerung*

> LUFTQUALITÄT IM LABOR (CO₂ in ppm)
>
> über 1000: schlecht → Lüfterstufe 3
>
> über 600: stickig → Lüfterstufe 2
>
> sonst: frisch → Lüfterstufe 1

### 🔎 Das Whiteboard

*Gebraucht von: 6. Das Tastenfeld am Ausgang*

> Das Board wurde fast vollständig weggewischt. In einer Ecke kann man noch lesen:
>
> "OVERRIDE = eine Ziffer von jeder Station"
>
> Drumherum vier Symbole mit Pfeilen: ☀ → Inkubator, 🍄 → Notizbuch, ❄ → Gefrierschrank, 🌀 → Lüftung. Die Zeile mit ihrer Reihenfolge ist weggewischt.

### 🔎 Ein Regal mit Gläsern

*Gebraucht von: nur Atmosphäre*

> Dutzende Gläser mit sanft grün leuchtenden Pilzen. Auf einem Etikett steht: "NICHT essen. Im Ernst, Tobias."
