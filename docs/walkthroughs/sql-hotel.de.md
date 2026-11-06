# Der Blaue Index: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Eine Sturmnacht im Hotel Tabula, hoch oben in den Bergen. Heute Morgen hat der Juwelier Victor Hale den Safe in Zimmer 404 offen vorgefunden, und sein Diamant, der Blaue Index, ist verschwunden. Die Straße ist gesperrt, und die Polizei kommt erst in etwa einer halben Stunde mit dem Hubschrauber.
>
> Der Manager hat euch ins Hinterzimmer gelassen: Rezeptionscomputer, Türschloss-Server, Sicherheits-PC. Jede Tür, jede Schlüsselkarte und jeder Beleg hinterlässt eine Spur in der Hoteldatenbank. Findet den Dieb, bevor der Hubschrauber landet.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Der Rezeptionscomputer | `SELECT` und `WHERE` mit mehreren Bedingungen (`AND`, `BETWEEN`), Datumsvergleiche, `ORDER BY` | 🔎 Eine Zeitung, 🔎 Der Grundriss |
| 2 | Der Türschloss-Server | `WHERE` mit einem Zeitraum über Mitternacht, Textvergleich von Zeitstempeln, `ORDER BY` | 🔎 Victor Hales Aussage |
| 3 | Das Kartencodiergerät | Zwei Tabellen über eine gemeinsame Spalte verbinden (`JOIN`), Tabellen-Aliasse | 2. Der Türschloss-Server, 🔎 Victor Hales Aussage |
| 4 | Der Sicherheits-PC | `GROUP BY` mit `COUNT(*)`, vor dem Gruppieren filtern, nach einer Anzahl sortieren | 2. Der Türschloss-Server, 🔎 Das Logbuch der Rezeption |
| 5 | Die Barkasse | `JOIN` kombiniert mit `WHERE` und `ORDER BY` | von Anfang an offen |
| 6 | Das Telefon des Managers (Abschluss-Schloss) | Hinweise aus mehreren Abfragen kombinieren | 1. Der Rezeptionscomputer, 2. Der Türschloss-Server, 3. Das Kartencodiergerät, 4. Der Sicherheits-PC, 5. Die Barkasse, 🔎 Notizen des Nachtwächters |

**Abschluss-Code:** `Nora Quill`

## Stationen

### 1. Der Rezeptionscomputer

**Übt:** `SELECT` und `WHERE` mit mehreren Bedingungen (`AND`, `BETWEEN`), Datumsvergleiche, `ORDER BY`  
**Braucht:** 🔎 Eine Zeitung, 🔎 Der Grundriss  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Der Rezeptionscomputer ist mit der Hoteldatenbank verbunden. Beginnt mit der naheliegenden Frage: Wer hat in der Nacht des Diebstahls im 4. Stock geschlafen?
>
> Listet Gastname und Zimmer aller Gäste, die in dieser Nacht im 4. Stock wohnten, sortiert nach Zimmer.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM bookings
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT guest_name, room
FROM bookings
WHERE room BETWEEN 401 AND 412
  AND check_in <= '2026-03-14'
  AND check_out > '2026-03-14'
ORDER BY room;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["Henrik Sol",401],["Victor Hale",404],["Nora Quill",406],["Priya Nand",409],["Ada Okafor",411]]
```

**Zeigt nach dem Lösen:**

> Der Drucker rattert die Liste heraus, und ihr pinnt sie an die Wand. Fünf Gäste haben in dieser Nacht im 4. Stock geschlafen: **Henrik Sol, Victor Hale, Nora Quill, Priya Nand und Ada Okafor.**

**Hinweise:**

1. Das Datum des Diebstahls steht auf der Zeitung in der Lounge. Der Grundriss neben der Tür zeigt, welche Zimmer im 4. Stock liegen.
2. Ein Gast hat in dieser Nacht hier geschlafen, wenn er am 14. oder früher angekommen ist (`check_in <= '2026-03-14'`) und am 15. oder später abgereist ist (`check_out > '2026-03-14'`).
3. `SELECT guest_name, room FROM bookings WHERE room BETWEEN 401 AND 412 AND check_in <= '2026-03-14' AND check_out > '2026-03-14' ORDER BY room;`

### 2. Der Türschloss-Server

**Übt:** `WHERE` mit einem Zeitraum über Mitternacht, Textvergleich von Zeitstempeln, `ORDER BY`  
**Braucht:** 🔎 Victor Hales Aussage  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Jede Zimmertür mit Kartenschloss meldet sich bei diesem Server: welche Karte, welches Zimmer, wann, und ob die Tür aufging.
>
> Zeigt `time`, `card_id` und `event` aller Ereignisse an Zimmer 404, während Victor weg war, die früheste zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM door_log
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT time, card_id, event
FROM door_log
WHERE room = 404
  AND time BETWEEN '2026-03-14 22:00' AND '2026-03-15 07:00'
ORDER BY time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-03-14 23:12","H-03","open"],["2026-03-15 00:18","C-409","denied"],["2026-03-15 02:47","M-02","open"],["2026-03-15 06:52","C-404","open"]]
```

**Zeigt nach dem Lösen:**

> Vier Ereignisse, während Victor weg war. Eines fällt auf: Um **02:47** hat die Karte **M-02** Zimmer 404 geöffnet.

**Hinweise:**

1. Victors Aussage auf dem Schreibtisch des Managers verrät, wann er sein Zimmer verlassen hat und wann er zurückkam.
2. Zeiten sind Text wie `'2026-03-14 22:00'`, also funktioniert `time BETWEEN '…' AND '…'`. Die Nacht geht über Mitternacht, die Endzeit liegt also am 15.
3. `SELECT time, card_id, event FROM door_log WHERE room = 404 AND time BETWEEN '2026-03-14 22:00' AND '2026-03-15 07:00' ORDER BY time;`

### 3. Das Kartencodiergerät

**Übt:** Zwei Tabellen über eine gemeinsame Spalte verbinden (`JOIN`), Tabellen-Aliasse  
**Braucht:** 2. Der Türschloss-Server, 🔎 Victor Hales Aussage  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Dieses Gerät beschreibt die Schlüsselkarten des Hotels und weiß, wem jede Karte gehört.
>
> Nehmt die Ereignisse an Zimmer 404, während Victor weg war, und zeigt `time`, den Namen des Karteninhabers und `event`, das früheste zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM keycards
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT d.time, k.holder, d.event
FROM door_log AS d
JOIN keycards AS k ON d.card_id = k.card_id
WHERE d.room = 404
  AND d.time BETWEEN '2026-03-14 22:00' AND '2026-03-15 07:00'
ORDER BY d.time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-03-14 23:12","Mia Lund","open"],["2026-03-15 00:18","Priya Nand","denied"],["2026-03-15 02:47","Otto Brandt","open"],["2026-03-15 06:52","Victor Hale","open"]]
```

**Zeigt nach dem Lösen:**

> **M-02** ist die Generalkarte des Nachtmanagers, registriert auf **Otto Brandt**. Aber hatte Otto sie in dieser Nacht überhaupt noch?

**Hinweise:**

1. `door_log` enthält die Karten-IDs, `keycards` die Inhaber. Verbindet sie mit `JOIN keycards ON door_log.card_id = keycards.card_id`.
2. Geht von eurer Abfrage am Türschloss-Server aus und ergänzt den `JOIN`. Aliasse wie `door_log AS d` halten sie kurz, und beide Tabellen haben eine Spalte `card_id`, also schreibt `d.card_id`.
3. `SELECT d.time, k.holder, d.event FROM door_log AS d JOIN keycards AS k ON d.card_id = k.card_id WHERE d.room = 404 AND d.time BETWEEN '2026-03-14 22:00' AND '2026-03-15 07:00' ORDER BY d.time;`

### 4. Der Sicherheits-PC

**Übt:** `GROUP BY` mit `COUNT(*)`, vor dem Gruppieren filtern, nach einer Anzahl sortieren  
**Braucht:** 2. Der Türschloss-Server, 🔎 Das Logbuch der Rezeption  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Der Sicherheits-PC kann Berichte zu jeder einzelnen Karte erstellen. Seht euch die Karte an, die in der Nacht Zimmer 404 geöffnet hat.
>
> Zählt für die Zeit, seit diese Karte verschwunden ist, wie oft sie jedes Zimmer **geöffnet** hat. Zeigt `room` und die Anzahl, das Zimmer mit den meisten Öffnungen zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM door_log
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT room, COUNT(*) AS openings
FROM door_log
WHERE card_id = 'M-02'
  AND event = 'open'
  AND time >= '2026-03-14 21:00'
GROUP BY room
ORDER BY openings DESC;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in beliebiger Reihenfolge):

```json
[[404,1],[406,2]]
```

**Zeigt nach dem Lösen:**

> Seit 21:00 hat die Generalkarte Zimmer 404 einmal geöffnet, und Zimmer **406** zweimal.

**Hinweise:**

1. Das Logbuch an der Rezeption verrät, seit wann `M-02` verschwunden ist.
2. Behaltet nur Zeilen mit `card_id = 'M-02'`, `event = 'open'` und einer Zeit nach dem Verschwinden. Dann `GROUP BY room` und mit `COUNT(*)` zählen.
3. `SELECT room, COUNT(*) AS openings FROM door_log WHERE card_id = 'M-02' AND event = 'open' AND time >= '2026-03-14 21:00' GROUP BY room ORDER BY openings DESC;`

### 5. Die Barkasse

**Übt:** `JOIN` kombiniert mit `WHERE` und `ORDER BY`  
**Braucht:** von Anfang an offen  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Gäste und Personal unterschreiben jeden Beleg mit ihrer Schlüsselkarte: an der Bar, im Kartenzimmer, beim Zimmerservice, sogar an der Rezeption.
>
> Jemand hat Zimmer 404 um 02:47 geöffnet. Wer hat in dieser Nacht zwischen 02:40 und 02:55 einen Beleg unterschrieben? Zeigt `time`, den Namen der Person und `place`, den frühesten zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM receipts
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT r.time, k.holder, r.place
FROM receipts AS r
JOIN keycards AS k ON r.card_id = k.card_id
WHERE r.time BETWEEN '2026-03-15 02:40' AND '2026-03-15 02:55'
ORDER BY r.time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-03-15 02:41","Victor Hale","card room"],["2026-03-15 02:44","Mia Lund","room service"],["2026-03-15 02:45","Otto Brandt","reception"],["2026-03-15 02:50","Priya Nand","room service"]]
```

**Zeigt nach dem Lösen:**

> Zur Zeit des Diebstahls haben **Victor Hale, Mia Lund, Otto Brandt und Priya Nand** anderswo im Hotel Belege unterschrieben. Keiner von ihnen hat um 02:47 Zimmer 404 geöffnet.

**Hinweise:**

1. `receipts` enthält die `card_id` der Person, die unterschrieben hat. Ein `JOIN` mit `keycards` macht daraus einen Namen.
2. Die Nacht ist schon über Mitternacht: Filtert mit `r.time BETWEEN '2026-03-15 02:40' AND '2026-03-15 02:55'` und sortiert nach Zeit.
3. `SELECT r.time, k.holder, r.place FROM receipts AS r JOIN keycards AS k ON r.card_id = k.card_id WHERE r.time BETWEEN '2026-03-15 02:40' AND '2026-03-15 02:55' ORDER BY r.time;`

### 6. Das Telefon des Managers (Abschluss-Schloss)

**Übt:** Hinweise aus mehreren Abfragen kombinieren  
**Braucht:** 1. Der Rezeptionscomputer, 2. Der Türschloss-Server, 3. Das Kartencodiergerät, 4. Der Sicherheits-PC, 5. Die Barkasse, 🔎 Notizen des Nachtwächters  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Das Telefon klingelt. Der Polizeihubschrauber landet gleich, und die Inspektorin will einen Namen.
>
> Wer hat den Blauen Index gestohlen?
>
> Ihr könnt die Datenbank hier weiter abfragen.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM bookings
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT b.guest_name, d.room, COUNT(*) AS openings
FROM door_log AS d
JOIN bookings AS b ON b.room = d.room
WHERE d.card_id = 'M-02'
  AND d.event = 'open'
  AND d.time >= '2026-03-14 21:00'
  AND b.check_in <= '2026-03-14'
  AND b.check_out > '2026-03-14'
GROUP BY b.guest_name, d.room
ORDER BY openings DESC;
```

**Antwort:** `Nora Quill`

**Hinweise:**

1. Der Dieb hat die gestohlene Generalkarte benutzt. Wer kann sie um 02:47 nicht benutzt haben, und zu welchem Zimmer ist die Karte immer wieder zurückgekehrt?
2. Die Alibis schließen Victor, Mia, Otto und Priya aus. Die Generalkarte hat ein Gästezimmer zweimal geöffnet, und der Nachtwächter hat Schritte in diese Richtung gehört.
3. Die Generalkarte hat Zimmer 406 zweimal geöffnet. Die Gästeliste von der Rezeption verrät, wer in 406 geschlafen hat.

## Hinweise im Raum

### 🔎 Eine Zeitung

*Gebraucht von: 1. Der Rezeptionscomputer*

> ALPENKURIER · Samstag, 14. März 2026
>
> STURM SPERRT PASSSTRASSE: Gäste im Hotel Tabula übers Wochenende eingeschneit

### 🔎 Der Grundriss

*Gebraucht von: 1. Der Rezeptionscomputer*

> HOTEL TABULA · GRUNDRISS
>
> 1. Stock: Zimmer 101–112
>
> 2. Stock: Zimmer 201–212
>
> 3. Stock: Zimmer 301–312
>
> 4. Stock: Zimmer 401–412 (Suiten)
>
> Auf jedem Stockwerk liegen die Zimmer 01–04 im Westflügel und die Zimmer 05–12 im Ostflügel.

### 🔎 Victor Hales Aussage

*Gebraucht von: 2. Der Türschloss-Server, 3. Das Kartencodiergerät*

> Aussage von Victor Hale, Juwelier, Zimmer 404. Aufgenommen um 07:20.
>
> "Ich habe den Blauen Index um 22:00 in meinem Zimmersafe eingeschlossen und bin ins Kartenzimmer gegangen. Ich habe die ganze Nacht Poker gespielt. Als ich um 07:00 zurückkam, war der Safe offen und der Diamant weg."

### 🔎 Das Logbuch der Rezeption

*Gebraucht von: 4. Der Sicherheits-PC*

> REZEPTION · 14. März
>
> 18:00 Beginn Nachtschicht: O. Brandt
>
> 21:00 Gepäckträger Leo meldet, dass meine Generalkarte M-02, die ich ihm fürs Gepäck geliehen habe, von seinem Wagen verschwunden ist. Lasse sie morgen früh sperren. – O.B.
>
> 02:45 Später Check-in: Herr Ruiz, Zimmer 312, zu Fuß durch den Sturm gekommen.

### 🔎 Notizen des Nachtwächters

*Gebraucht von: 6. Das Telefon des Managers*

> 02:30 Runde im 4. Stock. Alles ruhig.
>
> 02:50 Oben eine Tür zufallen hören, dann schnelle Schritte in Richtung Ostflügel. Als ich oben war, war der Flur leer.

### 🔎 Ein Porträt

*Gebraucht von: nur Atmosphäre*

> Edwina Tabula, die das Hotel 1898 gegründet hat. Auf einem Messingschild darunter steht: "Jeder Gast ist eine Zeile in meinem Buch."
