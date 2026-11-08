# Der Blaue Index: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Eine Sturmnacht im Hotel Tabula, hoch oben in den Bergen. Heute Morgen hat der Juwelier Victor Hale den Safe in Zimmer 404 offen vorgefunden, und sein Diamant, der Blaue Index, ist verschwunden. Die Straße ist gesperrt, und die Polizei kommt erst in etwa einer halben Stunde mit dem Hubschrauber.
>
> Der Manager hat euch ins Hinterzimmer gelassen: Rezeptionscomputer, Türschloss-Server, Sicherheits-PC. Jede Tür, jede Schlüsselkarte und jeder Beleg hinterlässt eine Spur in der Hoteldatenbank. Findet den Dieb, bevor der Hubschrauber landet.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Der Rezeptionscomputer | `SELECT` und `WHERE` mit mehreren Bedingungen (`AND`, `BETWEEN`), Datumsvergleiche, `ORDER BY` | 🔎 Notizen des Nachtwächters, 🔎 Der Grundriss, 🔎 Eine Zeitung |
| 2 | Der Türschloss-Server | `WHERE` mit einem Zeitraum über Mitternacht, Textvergleich von Zeitstempeln, `ORDER BY` | 🔎 Victor Hales Aussage, 🔎 Eine Zeitung |
| 3 | Das Kartencodiergerät | Zwei Tabellen über eine gemeinsame Spalte verbinden (`JOIN`), Tabellen-Aliasse | 2. Der Türschloss-Server (sein Ergebnis), 🔎 Victor Hales Aussage, 🔎 Eine Zeitung |
| 4 | Der Sicherheits-PC | `GROUP BY` mit `COUNT(*)`, vor dem Gruppieren filtern, nach einer Anzahl sortieren | 2. Der Türschloss-Server (sein Ergebnis), 3. Das Kartencodiergerät (sein Ergebnis), 🔎 Das Logbuch der Rezeption |
| 5 | Die Barkasse | `JOIN` kombiniert mit `WHERE` und `ORDER BY` | 🔎 Notizen des Nachtwächters, 🔎 Eine Zeitung |
| 6 | Das Telefon des Managers (Abschluss-Schloss) | Hinweise aus mehreren Abfragen kombinieren | 4. Der Sicherheits-PC (sein Ergebnis), 1. Der Rezeptionscomputer (sein Ergebnis), 🔒 4. Der Sicherheits-PC |

**Abschluss-Code:** `Nora Quill`

## Stationen

### 1. Der Rezeptionscomputer

**Übt:** `SELECT` und `WHERE` mit mehreren Bedingungen (`AND`, `BETWEEN`), Datumsvergleiche, `ORDER BY`  
**Braucht:** 🔎 Notizen des Nachtwächters, 🔎 Der Grundriss, 🔎 Eine Zeitung  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Der Rezeptionscomputer ist mit der Hoteldatenbank verbunden. Der Nachtwächter hat den Dieb in einen Flügel des 4. Stocks davonlaufen hören. Fangt dort an: Wer hat in der Nacht des Diebstahls in diesem Flügel geschlafen?
>
> Listet Gastname und Zimmer aller Gäste, die in dieser Nacht in diesem Flügel wohnten, sortiert nach Zimmer.

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
WHERE room BETWEEN 405 AND 412
  AND check_in <= '2026-03-14'
  AND check_out > '2026-03-14'
ORDER BY room;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["Nora Quill",406],["Priya Nand",409],["Ada Okafor",411]]
```

**Zeigt nach dem Lösen:**

> Der Drucker rattert die Liste heraus, und ihr pinnt sie an die Wand. Drei Gäste haben in dieser Nacht im Ostflügel des 4. Stocks geschlafen: **Nora Quill (406), Priya Nand (409) und Ada Okafor (411).**

**Hinweise:**

1. Die Notizen des Nachtwächters beim Schreibtisch des Managers verraten, welcher Flügel. Der Grundriss neben der Tür zeigt, welche Zimmer dazugehören, und die Zeitung in der Lounge nennt das Datum des Diebstahls.
2. Der Ostflügel des 4. Stocks sind die Zimmer 405–412 (`room BETWEEN 405 AND 412`). Ein Gast hat in dieser Nacht hier geschlafen, wenn er am 14. oder früher angekommen ist (`check_in <= '2026-03-14'`) und am 15. oder später abgereist ist (`check_out > '2026-03-14'`).
3. `SELECT guest_name, room FROM bookings WHERE room BETWEEN 405 AND 412 AND check_in <= '2026-03-14' AND check_out > '2026-03-14' ORDER BY room;`

### 2. Der Türschloss-Server

**Übt:** `WHERE` mit einem Zeitraum über Mitternacht, Textvergleich von Zeitstempeln, `ORDER BY`  
**Braucht:** 🔎 Victor Hales Aussage, 🔎 Eine Zeitung  
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

> Vier Ereignisse, während Victor weg war. Eines fällt auf: Am 15. um **02:47** hat die Karte **M-02** Zimmer 404 geöffnet.

**Hinweise:**

1. Victors Aussage auf dem Schreibtisch des Managers verrät, wann er sein Zimmer verlassen hat und wann er zurückkam. Das Datum des Diebstahls steht auf der Zeitung in der Lounge.
2. Zeiten sind Text wie `'2026-03-14 22:00'`, also funktioniert `time BETWEEN '…' AND '…'`. Die Nacht geht über Mitternacht, die Endzeit liegt also am 15.
3. `SELECT time, card_id, event FROM door_log WHERE room = 404 AND time BETWEEN '2026-03-14 22:00' AND '2026-03-15 07:00' ORDER BY time;`

### 3. Das Kartencodiergerät

**Übt:** Zwei Tabellen über eine gemeinsame Spalte verbinden (`JOIN`), Tabellen-Aliasse  
**Braucht:** 2. Der Türschloss-Server (sein Ergebnis), 🔎 Victor Hales Aussage, 🔎 Eine Zeitung  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Dieses Gerät beschreibt die Schlüsselkarten des Hotels und weiß, wem jede Karte gehört.
>
> Nehmt die Karte, die mitten in der Nacht Zimmer 404 geöffnet hat. Zeigt `time`, `room`, den Namen des Karteninhabers und `event` für alles, was diese Karte getan hat, während Victor weg war, das Früheste zuerst.

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
SELECT d.time, d.room, k.holder, d.event
FROM door_log AS d
JOIN keycards AS k ON d.card_id = k.card_id
WHERE d.card_id = 'M-02'
  AND d.time BETWEEN '2026-03-14 22:00' AND '2026-03-15 07:00'
ORDER BY d.time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-03-15 02:40",402,"Otto Brandt","denied"],["2026-03-15 02:47",404,"Otto Brandt","open"],["2026-03-15 02:52",406,"Otto Brandt","open"]]
```

**Zeigt nach dem Lösen:**

> **M-02** ist die Generalkarte des Nachtmanagers, registriert auf **Otto Brandt**. Aber hatte Otto sie in dieser Nacht überhaupt noch?

**Hinweise:**

1. Das Ergebnis am Türschloss-Server nennt die Karte. Victors Aussage verrät, wann er weg war, und die Zeitung nennt das Datum.
2. `door_log` enthält die Karten-IDs, `keycards` die Inhaber: `FROM door_log AS d JOIN keycards AS k ON d.card_id = k.card_id`. Beide Tabellen haben eine Spalte `card_id`, also schreibt `d.card_id`, und filtert nach der Karte statt nach dem Zimmer.
3. `SELECT d.time, d.room, k.holder, d.event FROM door_log AS d JOIN keycards AS k ON d.card_id = k.card_id WHERE d.card_id = 'M-02' AND d.time BETWEEN '2026-03-14 22:00' AND '2026-03-15 07:00' ORDER BY d.time;`

### 4. Der Sicherheits-PC

**Übt:** `GROUP BY` mit `COUNT(*)`, vor dem Gruppieren filtern, nach einer Anzahl sortieren  
**Braucht:** 2. Der Türschloss-Server (sein Ergebnis), 3. Das Kartencodiergerät (sein Ergebnis), 🔎 Das Logbuch der Rezeption  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Der Sicherheits-PC kann Berichte zu jeder einzelnen Karte erstellen. Seht euch die Karte an, die mitten in der Nacht Zimmer 404 geöffnet hat.
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
>
> Der Sicherheits-PC piept: "Zimmer 406 markiert. Code ans Telefon des Managers gesendet."

**Hinweise:**

1. Der Türschloss-Server hat die Karte gefunden, und das Kartencodiergerät verrät, wem sie gehört. Das Logbuch an der Rezeption verrät, seit wann die Generalkarte dieser Person verschwunden ist.
2. Behaltet nur Zeilen mit `card_id = 'M-02'`, `event = 'open'` und einer Zeit nach dem Verschwinden (21:00 am 14.). Dann `GROUP BY room` und mit `COUNT(*)` zählen.
3. `SELECT room, COUNT(*) AS openings FROM door_log WHERE card_id = 'M-02' AND event = 'open' AND time >= '2026-03-14 21:00' GROUP BY room ORDER BY openings DESC;`

### 5. Die Barkasse

**Übt:** `JOIN` kombiniert mit `WHERE` und `ORDER BY`  
**Braucht:** 🔎 Notizen des Nachtwächters, 🔎 Eine Zeitung  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Gäste und Personal unterschreiben jeden Beleg mit ihrer Schlüsselkarte: an der Bar, im Kartenzimmer, beim Zimmerservice, sogar an der Rezeption.
>
> Der Nachtwächter hat notiert, wann er oben eine Tür zufallen hörte. Wer hat in den zehn Minuten davor oder danach einen Beleg unterschrieben? Zeigt `time`, den Namen der Person und `place`, den frühesten zuerst.

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
WHERE r.time BETWEEN '2026-03-15 02:40' AND '2026-03-15 03:00'
ORDER BY r.time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-03-15 02:41","Victor Hale","card room"],["2026-03-15 02:44","Mia Lund","room service"],["2026-03-15 02:45","Otto Brandt","reception"],["2026-03-15 02:50","Priya Nand","room service"]]
```

**Zeigt nach dem Lösen:**

> Zur Zeit des Diebstahls haben **Victor Hale, Mia Lund, Otto Brandt und Priya Nand** anderswo im Hotel Belege unterschrieben. Keiner von ihnen hat um 02:47 Zimmer 404 geöffnet.

**Hinweise:**

1. Die Notizen des Nachtwächters beim Schreibtisch des Managers verraten, wann er die Tür hörte. Die Nacht war da schon über Mitternacht, es ist also der Tag nach dem Datum der Zeitung. `receipts` enthält die `card_id` der Person, die unterschrieben hat, und ein `JOIN` mit `keycards` macht daraus einen Namen.
2. Die Tür fiel am 15. um 02:50 zu: Filtert mit `r.time BETWEEN '2026-03-15 02:40' AND '2026-03-15 03:00'` und sortiert nach Zeit.
3. `SELECT r.time, k.holder, r.place FROM receipts AS r JOIN keycards AS k ON r.card_id = k.card_id WHERE r.time BETWEEN '2026-03-15 02:40' AND '2026-03-15 03:00' ORDER BY r.time;`

### 6. Das Telefon des Managers (Abschluss-Schloss)

**Übt:** Hinweise aus mehreren Abfragen kombinieren  
**Braucht:** 4. Der Sicherheits-PC (sein Ergebnis), 1. Der Rezeptionscomputer (sein Ergebnis), 🔒 4. Der Sicherheits-PC  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Zahlenschloss** (öffnet mit `406`):

> Das Telefon des Managers ist gesperrt. Es verlangt einen dreistelligen Code.

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

1. Der Dieb hat die gestohlene Generalkarte benutzt. Zu welchem Gästezimmer ist sie immer wieder zurückgekehrt, und wer hat dort geschlafen?
2. Das Zimmer ist der Code, mit dem ihr dieses Telefon entsperrt habt. Die Gästeliste von der Rezeption verrät, wer darin geschlafen hat. Die Barkasse schließt den Karteninhaber Otto aus.
3. Die Generalkarte hat Zimmer 406 zweimal geöffnet. Die Gästeliste von der Rezeption verrät, wer in 406 geschlafen hat.

## Hinweise im Raum

### 🔎 Eine Zeitung

*Gebraucht von: 1. Der Rezeptionscomputer, 2. Der Türschloss-Server, 3. Das Kartencodiergerät, 5. Die Barkasse*

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
> 21:00 Gepäckträger Leo meldet, dass meine Generalkarte, die ich ihm fürs Gepäck geliehen habe, von seinem Wagen verschwunden ist. Lasse sie morgen früh sperren, bis dahin nehme ich meine Ersatzkarte. – O.B.
>
> 02:45 Später Check-in: Herr Ruiz, Zimmer 312, zu Fuß durch den Sturm gekommen.

### 🔎 Notizen des Nachtwächters

*Gebraucht von: 1. Der Rezeptionscomputer, 5. Die Barkasse*

> 02:30 Runde im 4. Stock. Alles ruhig.
>
> 02:50 Oben im 4. Stock eine Tür zufallen hören, dann schnelle Schritte in Richtung Ostflügel. Als ich oben war, war der Flur leer.

### 🔎 Ein Porträt

*Gebraucht von: nur Atmosphäre*

> Edwina Tabula, die das Hotel 1898 gegründet hat. Auf einem Messingschild darunter steht: "Jeder Gast ist eine Zeile in meinem Buch."

## Handbuch im Raum: 📖 Die SQL-Mappe des Nachtmanagers

**Eine Tabelle lesen:** [`SELECT columns FROM table`](https://www.sqlite.org/lang_select.html), [`LIMIT n`](https://www.sqlite.org/lang_select.html#the_limit_clause), [`expression AS name`](https://www.sqlite.org/lang_select.html#resultset), [`statement;`](https://www.sqlite.org/lang.html)

**Zeilen filtern:** [`WHERE condition`](https://www.sqlite.org/lang_select.html#whereclause), [`=  <>  <  <=  >  >=`](https://www.sqlite.org/lang_expr.html#binaryops), [`AND  OR  NOT`](https://www.sqlite.org/lang_expr.html#binaryops), [`x BETWEEN low AND high`](https://www.sqlite.org/lang_expr.html#between), [`'YYYY-MM-DD HH:MM'`](https://www.sqlite.org/lang_datefunc.html)

**Sortieren und Zählen:** [`ORDER BY column [DESC]`](https://www.sqlite.org/lang_select.html#the_order_by_clause), [`COUNT(*)`](https://www.sqlite.org/lang_aggfunc.html#count), [`GROUP BY column`](https://www.sqlite.org/lang_select.html#resultset)

**Tabellen verbinden:** [`JOIN other ON a.col = b.col`](https://www.sqlite.org/lang_select.html#fromclause), [`FROM table AS t`](https://www.sqlite.org/lang_select.html#fromclause)
