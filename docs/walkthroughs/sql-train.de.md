# Nachtzug: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Nachtzug EN 471 „Aurora“, Kleeberg nach Lindholm, die Nacht auf Samstag, den 14. November. Um 02:41 fand die Schlafwagenbetreuerin Abteil 34 leer vor: Der Reporter Konstantin Weber ist verschwunden, seine Tasche liegt noch auf der Liege. Der Zug rollt weiter durch die Dunkelheit, und in einer halben Stunde steigt in Marienhall die Bundespolizei zu.
>
> Die Zugchefin hat euch in den Dienstwagen gelassen. Sein Bordrechner protokolliert jeden Ticketscan, jeden Karteneinsatz, jede Tür und jeden Kilometer. Findet heraus, wo Weber den Zug verlassen hat und mit wem, und funkt es der Polizei, bevor der Zug Marienhall erreicht.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Das Handgerät des Zugbegleiters | `LEFT JOIN` mit `IS NULL`: Zeilen ohne Treffer | 🔎 Der Zettel des Zugbegleiters |
| 2 | Der Fahrtenschreiber | `LAG() OVER (ORDER BY …)`: eine Zeile mit der vorigen vergleichen; eine Fensterfunktion über eine CTE filtern | 🔎 Die Streckenkarte |
| 3 | Die Türsteuerung | `NOT EXISTS` und eine korrelierte skalare Unterabfrage | 🔎 Ein Schild an der Türsteuerung |
| 4 | Der Kartenleser-Server | `ROW_NUMBER() OVER (PARTITION BY … ORDER BY …)`: die neueste Zeile jeder Gruppe | 3. Die Türsteuerung (sein Ergebnis), 🔎 Der Bericht der Schlafwagenbetreuerin |
| 5 | Die Speisewagenkasse | Eine CTE in einer Unterabfrage wiederverwenden (`IN (SELECT …)`), `GROUP BY` über zwei Spalten mit `SUM` | 1. Das Handgerät des Zugbegleiters (sein Ergebnis) |
| 6 | Der Zugfunk (Abschluss-Schloss) | Die Ergebnisse mehrerer Abfragen kombinieren | 2. Der Fahrtenschreiber (sein Ergebnis), 4. Der Kartenleser-Server (sein Ergebnis), 5. Die Speisewagenkasse (sein Ergebnis), 🔒 2. Der Fahrtenschreiber, 🔎 Das Fahrtenbuch des Lokführers |

**Abschluss-Code:** `Ines Hartmann`

## Stationen

### 1. Das Handgerät des Zugbegleiters

**Übt:** `LEFT JOIN` mit `IS NULL`: Zeilen ohne Treffer  
**Braucht:** 🔎 Der Zettel des Zugbegleiters  
**Daten:** [train.sql](../../content/rooms/sql-train/data/train.sql)

**Aufgabe:**

> Jakob Horn, der Zugbegleiter, hat seinen Ticketscanner auf dem Tresen im Speisewagen liegen lassen. `passengers` enthält die Buchungen, `scans` jedes Ticket, das sein Handgerät heute Nacht gescannt hat.
>
> Wer hat ein Abteil gebucht, aber sein Ticket nie scannen lassen? Zeigt `name` und `card`.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM passengers
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT p.name, p.card
FROM passengers AS p
LEFT JOIN scans AS s ON s.ticket_id = p.ticket_id
WHERE s.scan_id IS NULL;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in beliebiger Reihenfolge):

```json
[["Hanna Vogt","C2-23"],["Paul Brenner","C5-52"]]
```

**Zeigt nach dem Lösen:**

> Zwei Tickets wurden nie gescannt: **Hanna Vogt** (Karte `C2-23`) und **Paul Brenner** (Karte `C5-52`) sind nie eingestiegen. Die Abteile 23 und 52 hätten die ganze Nacht leer bleiben müssen.

**Hinweise:**

1. Ein einfaches `JOIN` behält nur Fahrgäste mit passendem Scan, also verschwinden genau die, die ihr sucht. Ein `LEFT JOIN` behält jeden Fahrgast und füllt die Spalten von `scans` mit `NULL`, wo nichts passt.
2. `FROM passengers AS p LEFT JOIN scans AS s ON s.ticket_id = p.ticket_id`, dann die Zeilen ohne Scan behalten: `WHERE s.scan_id IS NULL`. (`= NULL` ist nie wahr.)
3. `SELECT p.name, p.card FROM passengers AS p LEFT JOIN scans AS s ON s.ticket_id = p.ticket_id WHERE s.scan_id IS NULL;`

### 2. Der Fahrtenschreiber

**Übt:** `LAG() OVER (ORDER BY …)`: eine Zeile mit der vorigen vergleichen; eine Fensterfunktion über eine CTE filtern  
**Braucht:** 🔎 Die Streckenkarte  
**Daten:** [train.sql](../../content/rooms/sql-train/data/train.sql)

**Aufgabe:**

> Der Schreiber der Lok notiert alle zwei Minuten die Position (`km`) und die Geschwindigkeit (`kmh`).
>
> Findet jeden Halt, seit der Zug Kleeberg verlassen hat: die Zeilen, in denen der Zug steht, in der Zeile davor aber noch fuhr. Zeigt `time` und `km`, den frühesten zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM speed
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
WITH s AS (
  SELECT time, km, kmh,
         LAG(kmh) OVER (ORDER BY time) AS prev_kmh
  FROM speed
)
SELECT time, km
FROM s
WHERE kmh = 0 AND prev_kmh > 0
ORDER BY time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-11-13 23:06",88],["2026-11-13 23:58",131.4],["2026-11-14 00:50",176.2],["2026-11-14 01:52",214.3]]
```

**Zeigt nach dem Lösen:**

> Seit Kleeberg hat der Zug viermal gehalten: bei km 88,0 (23:06), km 131,4 (23:58), km 176,2 (00:50) und km 214,3 (01:52). Nur zwei davon sind Bahnhöfe.

**Hinweise:**

1. `WHERE kmh = 0` findet jede Zeile im Stand, mehrere pro Halt, und an der Baustelle kriecht der Zug, ohne zu halten. Ihr müsst jede Zeile mit der davor vergleichen: `LAG(kmh) OVER (ORDER BY time)` liefert die Geschwindigkeit der vorigen Zeile.
2. Eine Fensterfunktion darf nicht ins `WHERE`. Berechnet sie zuerst in einer CTE, `WITH s AS (SELECT time, km, kmh, LAG(kmh) OVER (ORDER BY time) AS prev_kmh FROM speed)`, und filtert dann die CTE: `kmh = 0 AND prev_kmh > 0`.
3. `WITH s AS (SELECT time, km, kmh, LAG(kmh) OVER (ORDER BY time) AS prev_kmh FROM speed) SELECT time, km FROM s WHERE kmh = 0 AND prev_kmh > 0 ORDER BY time;`

### 3. Die Türsteuerung

**Übt:** `NOT EXISTS` und eine korrelierte skalare Unterabfrage  
**Braucht:** 🔎 Ein Schild an der Türsteuerung  
**Daten:** [train.sql](../../content/rooms/sql-train/data/train.sql)

**Aufgabe:**

> Jede Außentür meldet dieser Steuerung, wann sie sich öffnet und wann sie schließt (`doors`). Der Fahrplan mit den bisherigen tatsächlichen Zeiten steht in `stations`.
>
> Welche Türereignisse fanden zu einer Zeit statt, in der sich die Türen gar nicht hätten öffnen dürfen? Zeigt `time`, `car`, `door`, `event` und den Namen des letzten Bahnhofs, den der Zug vor dem Ereignis verlassen hatte, das früheste zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM doors
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT d.time, d.car, d.door, d.event,
       (SELECT st.station
        FROM stations AS st
        WHERE st.departure < d.time
        ORDER BY st.departure DESC
        LIMIT 1) AS last_station
FROM doors AS d
WHERE NOT EXISTS (
  SELECT 1
  FROM stations AS s
  WHERE d.time BETWEEN s.arrival AND s.departure
)
ORDER BY d.time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-11-14 01:53",3,"B","open","Felsach"],["2026-11-14 01:55",3,"B","close","Felsach"]]
```

**Zeigt nach dem Lösen:**

> Um **01:53**, nach Felsach, öffnete sich auf freier Strecke die rechte Tür B von **Wagen 3**, dem Wagen von Konstantin Weber. Um 01:55 schloss sie sich wieder.

**Hinweise:**

1. Das Schild neben der Steuerung sagt, wann die Türen freigegeben sind. Fragt für jedes Türereignis, ob es einen Bahnhof gibt, bei dem das Ereignis zwischen `arrival` und `departure` liegt: `NOT EXISTS (SELECT 1 FROM stations AS s WHERE d.time BETWEEN s.arrival AND s.departure)` behält die Ereignisse, bei denen es keinen gibt.
2. Der zuletzt verlassene Bahnhof ist eine korrelierte Unterabfrage in der Spaltenliste. Sie läuft einmal pro Türereignis und liefert einen Wert: `(SELECT station FROM stations WHERE departure < d.time ORDER BY departure DESC LIMIT 1)`.
3. `SELECT d.time, d.car, d.door, d.event, (SELECT st.station FROM stations AS st WHERE st.departure < d.time ORDER BY st.departure DESC LIMIT 1) AS last_station FROM doors AS d WHERE NOT EXISTS (SELECT 1 FROM stations AS s WHERE d.time BETWEEN s.arrival AND s.departure) ORDER BY d.time;`

### 4. Der Kartenleser-Server

**Übt:** `ROW_NUMBER() OVER (PARTITION BY … ORDER BY …)`: die neueste Zeile jeder Gruppe  
**Braucht:** 3. Die Türsteuerung (sein Ergebnis), 🔎 Der Bericht der Schlafwagenbetreuerin  
**Daten:** [train.sql](../../content/rooms/sql-train/data/train.sql)

**Aufgabe:**

> Jede Abteiltür, jeder Waschraum und jede Übergangstür zwischen den Schlafwagen hat einen Kartenleser. `taps` protokolliert jede Karte, die an einen gehalten wurde.
>
> Wessen Karte wurde in der halben Stunde, bevor sich auf freier Strecke die Tür öffnete, zum letzten Mal benutzt und danach nie wieder? Zeigt `card`, die `time` ihres letzten Einsatzes und den `reader`, den frühesten zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM taps
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
WITH ranked AS (
  SELECT card, time, reader,
         ROW_NUMBER() OVER (PARTITION BY card ORDER BY time DESC) AS rn
  FROM taps
)
SELECT card, time, reader
FROM ranked
WHERE rn = 1
  AND time BETWEEN '2026-11-14 01:23' AND '2026-11-14 01:53'
ORDER BY time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["C4-45","2026-11-14 01:31","door 45"],["C5-52","2026-11-14 01:46","gangway 3|4"],["C3-34","2026-11-14 01:49","door 34"]]
```

**Zeigt nach dem Lösen:**

> Drei Karten verstummen kurz bevor sich die Tür öffnete: `C4-45` an der eigenen Abteiltür um 01:31, `C5-52` am Übergang in Wagen 3 um 01:46 und Webers `C3-34` an seiner Abteiltür um 01:49.

**Hinweise:**

1. Ihr braucht zuerst den letzten Einsatz jeder Karte. `ROW_NUMBER() OVER (PARTITION BY card ORDER BY time DESC)` nummeriert die Einsätze jeder Karte vom neuesten an, sodass der letzte Einsatz jeder Karte die Nummer 1 bekommt. Die Uhrzeit der Tür kommt von der Türsteuerung.
2. Die Tür öffnete sich am 14. November um 01:53. Nummeriert die Einsätze in einer CTE und behaltet außerhalb `rn = 1 AND time BETWEEN '2026-11-14 01:23' AND '2026-11-14 01:53'`.
3. `WITH ranked AS (SELECT card, time, reader, ROW_NUMBER() OVER (PARTITION BY card ORDER BY time DESC) AS rn FROM taps) SELECT card, time, reader FROM ranked WHERE rn = 1 AND time BETWEEN '2026-11-14 01:23' AND '2026-11-14 01:53' ORDER BY time;`

### 5. Die Speisewagenkasse

**Übt:** Eine CTE in einer Unterabfrage wiederverwenden (`IN (SELECT …)`), `GROUP BY` über zwei Spalten mit `SUM`  
**Braucht:** 1. Das Handgerät des Zugbegleiters (sein Ergebnis)  
**Daten:** [train.sql](../../content/rooms/sql-train/data/train.sql)

**Aufgabe:**

> Im Speisewagen geht jede Bestellung auf die Rechnung einer Abteilkarte (`orders.card`). Wer die Rechnung begleicht, zahlt mit Bankkarte, und die Kasse speichert den Namen darauf als `payer`.
>
> Ein Abteil, dessen Fahrgast nie eingestiegen ist, sollte keine Rechnung haben. Zeigt für die Karten dieser Abteile, wer bezahlt hat und wie viel insgesamt: `card`, `payer` und die Summe von `price`.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM orders
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
WITH no_shows AS (
  SELECT p.card
  FROM passengers AS p
  LEFT JOIN scans AS s ON s.ticket_id = p.ticket_id
  WHERE s.scan_id IS NULL
)
SELECT card, payer, SUM(price) AS total
FROM orders
WHERE card IN (SELECT card FROM no_shows)
GROUP BY card, payer;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in beliebiger Reihenfolge):

```json
[["C2-23","Bernd Kessler",11.4],["C5-52","Ines Hartmann",14.1],["C5-52","Konstantin Weber",7.2]]
```

**Zeigt nach dem Lösen:**

> Die Rechnung von Abteil 23 hat **Bernd Kessler** bezahlt, die von Abteil 52 **Ines Hartmann**, und zwei heiße Schokoladen auf der Rechnung von 52 **Konstantin Weber** selbst. Weder Kessler noch Hartmann haben eine Buchung.

**Hinweise:**

1. Welche Fahrgäste nie eingestiegen sind, hat das Handgerät des Zugbegleiters ergeben. Steckt diese Abfrage in eine CTE, `WITH no_shows AS (…)`, damit ihr ihr Ergebnis hier verwenden könnt.
2. Filtert `orders` mit `WHERE card IN (SELECT card FROM no_shows)`, gruppiert mit `GROUP BY card, payer` und summiert mit `SUM(price)`.
3. `WITH no_shows AS (SELECT p.card FROM passengers AS p LEFT JOIN scans AS s ON s.ticket_id = p.ticket_id WHERE s.scan_id IS NULL) SELECT card, payer, SUM(price) AS total FROM orders WHERE card IN (SELECT card FROM no_shows) GROUP BY card, payer;`

### 6. Der Zugfunk (Abschluss-Schloss)

**Übt:** Die Ergebnisse mehrerer Abfragen kombinieren  
**Braucht:** 2. Der Fahrtenschreiber (sein Ergebnis), 4. Der Kartenleser-Server (sein Ergebnis), 5. Die Speisewagenkasse (sein Ergebnis), 🔒 2. Der Fahrtenschreiber, 🔎 Das Fahrtenbuch des Lokführers  
**Daten:** [train.sql](../../content/rooms/sql-train/data/train.sql)

**Zahlenschloss** (öffnet mit `214`):

> Der Funk zur Polizei verbindet erst, wenn ihr ihm sagt, wohin sie fahren soll. Er fragt nach dem Kilometerstein, in ganzen Kilometern, an dem die Notbremse den Zug angehalten hat.

**Aufgabe:**

> Die Bundespolizei in Marienhall meldet sich. Sie schickt sofort eine Streife zum Bahnübergang bei Kilometer 214.
>
> Noch eine Frage, bevor der Zug ankommt: Konstantin Weber hat den Zug nicht allein verlassen. Wer ist mit ihm ausgestiegen? Nennt den vollständigen Namen.
>
> Ihr könnt die Datenbank hier weiter abfragen.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM passengers
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
WITH ranked AS (
  SELECT card, time,
         ROW_NUMBER() OVER (PARTITION BY card ORDER BY time DESC) AS rn
  FROM taps
),
gone AS (
  SELECT card
  FROM ranked
  WHERE rn = 1
    AND time BETWEEN '2026-11-14 01:23' AND '2026-11-14 01:53'
)
SELECT DISTINCT o.card, o.payer
FROM orders AS o
JOIN gone AS g ON g.card = o.card
WHERE o.payer NOT IN (SELECT name FROM passengers);
```

**Antwort:** `Ines Hartmann`

**Hinweise:**

1. Außer Webers eigener Karte sind kurz vor dem Öffnen der Tür in Wagen 3 zwei Karten verstummt (Kartenleser-Server). Eine ging an der eigenen Abteiltür schlafen, die andere lief in Wagen 3.
2. Die Karte, die in Wagen 3 hinüberging, ist `C5-52`. Sie gehört zur Buchung von Paul Brenner, aber Brenner ist nie eingestiegen (Handgerät des Zugbegleiters). Die Speisewagenkasse verrät, wer Abteil 52 wirklich genutzt hat.
3. Die Rechnung von Abteil 52 hat Ines Hartmann bezahlt, die keine Buchung hat, und Weber hat darauf heiße Schokolade gekauft. Ihre Karte ging um 01:46 in Wagen 3 hinüber, und sie ist mit ihm durch Tür 3B ausgestiegen.

## Hinweise im Raum

### 🔎 Das Fahrtenbuch des Lokführers

*Gebraucht von: 6. Der Zugfunk*

> EN 471 AURORA · Lokführer: P. Lanz
>
> 21:40 ab Kleeberg, pünktlich.
> Gegen Mitternacht: rotes Signal vor Ostheim, fünf Minuten auf einen Güterzug gewartet.
> 00:55 ab Felsach.
> Zwischen Felsach und Marienhall: Notbremsalarm aus Wagen 3. Vorschriftsmäßig gehalten. Schlafwagenbetreuerin hat nachgesehen: Griff schon zurückgestellt, niemand da. Nach fünf Minuten weitergefahren.

### 🔎 Die Streckenkarte

*Gebraucht von: 2. Der Fahrtenschreiber*

> EN 471 AURORA · KLEEBERG – LINDHOLM
>
> km 0 Kleeberg
> km 88 **Brunnstadt**
> km 131 Stellwerk Ostheim (kein Halt)
> km 152 Viadukt Lindenau
> km 176 **Felsach**
> km 192 Baustelle, 10 km/h
> km 203 Rotmoor
> km 214 Bahnübergang Hasselbach (Feldweg zur B 81)
> km 229 Weiler Tunnel
> km 247 Grünau
> km 263 **Marienhall**
> km 402 **Lindholm**

### 🔎 Der Zettel des Zugbegleiters

*Gebraucht von: 1. Das Handgerät des Zugbegleiters*

> Ein Zettel unter dem Handgerät, in Jakob Horns Handschrift:
>
> Nach jedem Bahnhof gehe ich durch den ganzen Zug und scanne jedes Ticket einmal. Wen mein Handgerät nie gescannt hat, der ist nie eingestiegen. Sein Abteil bleibt verschlossen und leer, und die Karte bleibt bei der Schlafwagenbetreuerin.

### 🔎 Ein Schild an der Türsteuerung

*Gebraucht von: 3. Die Türsteuerung*

> AUSSENTÜREN
>
> Die Türen werden nur freigegeben, während der Zug an einem Bahnsteig steht: von seiner Ankunft bis zu seiner Abfahrt. Zwischen den Bahnhöfen öffnet eine Tür nur mit dem Vierkantschlüssel oder der Notentriegelung, und die Steuerung protokolliert das wie jedes andere Öffnen.

### 🔎 Der Bericht der Schlafwagenbetreuerin

*Gebraucht von: 4. Der Kartenleser-Server*

> An der Tür von Abteil 34 befestigt. Mira Szabo, Schlafwagenbetreuerin, 02:41:
>
> Abteil 34 leer. Bett unbenutzt, Tasche auf der Liege, Mantel und Schuhe weg. Herrn Webers Karte ist nicht im Abteil.
>
> Nachts sind die Übergangstüren zwischen den Schlafwagen verschlossen. Sie öffnen mit jeder Abteilkarte oder einer Personalkarte (`S-…`), und der Leser protokolliert, wer durchgegangen ist.

### 🔎 Eine Zeitung

*Gebraucht von: nur Atmosphäre*

> KLEEBERGER TAGBLATT · Freitag, 13. November 2026
>
> DIE VERSCHWUNDENEN MILLIONEN DER NEUEN BRÜCKE: Reporter Konstantin Weber sagt am Montag in Lindholm aus. Weber berichtet von Drohungen und will „nicht so reisen, wie man es erwartet“.

## Handbuch im Raum: 📖 Der Ordner zum Bordrechner

**Zeilen ohne Treffer:** [`a LEFT JOIN b ON …`](https://www.sqlite.org/lang_select.html#fromclause), [`x IS NULL / x IS NOT NULL`](https://www.sqlite.org/lang_expr.html#isisnot)

**Unterabfragen:** [`x IN (SELECT …)`](https://www.sqlite.org/lang_expr.html#in_op), [`EXISTS (SELECT …)`](https://www.sqlite.org/lang_expr.html#exists_op), [`(SELECT … LIMIT 1)`](https://www.sqlite.org/lang_expr.html#subq), [`correlated subquery`](https://www.sqlite.org/lang_expr.html#cosub)

**Common Table Expressions:** [`WITH name AS (SELECT …) SELECT … FROM name`](https://www.sqlite.org/lang_with.html#ordinarycte)

**Fensterfunktionen:** [`f(…) OVER (ORDER BY col)`](https://www.sqlite.org/windowfunctions.html), [`OVER (PARTITION BY col ORDER BY …)`](https://www.sqlite.org/windowfunctions.html#ptxn), [`LAG(col) / LEAD(col)`](https://www.sqlite.org/windowfunctions.html#biwinfunc), [`ROW_NUMBER()`](https://www.sqlite.org/windowfunctions.html#biwinfunc), [`filtering by a window function`](https://www.sqlite.org/windowfunctions.html)

**Summen und Zeiten:** [`SUM(col)`](https://www.sqlite.org/lang_aggfunc.html#sumunc), [`'YYYY-MM-DD HH:MM'`](https://www.sqlite.org/lang_datefunc.html)
