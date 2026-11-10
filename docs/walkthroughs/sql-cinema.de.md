# Die letzte Vorstellung: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Kino Lumen, Kleebergs letztes altes Kino, Sonntag, 15. November, nach der letzten Vorstellung. Morgen um neun muss Edith Brandauer der Bank ihre Bücher zeigen. Nach denen verliert das Kino jede Woche Geld, dabei war das Studio an den Wochenenden voll. Jemand hat sich an der Kasse bedient.
>
> Edith hat die Türen hinter euch abgeschlossen und euch den Kinorechner geöffnet: jedes Ticket, das die beiden Kassen gedruckt haben, Bens Strichliste an der Tür, den Dienstplan, die Foyerkassen (Snackbar und Getränkebar) und den neuen Zähler der Feuerwehr. Findet heraus, wer abgezweigt hat, und sagt es Edith, bevor in einer halben Stunde der letzte Bus fährt.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Bens Strichliste | `GROUP BY` über einen Join und `HAVING`, um die Gruppen nach einem Aggregat zu filtern | 🔎 Bens Klemmbrett |
| 2 | Die Ticketdrucker | Lücken in einer Folge finden: `NOT EXISTS` mit `ticket_no + 1` und korrelierte Unterabfragen mit `MIN` und `MAX` | von Anfang an offen |
| 3 | Der Zähler der Feuerwehr | Laufende Summen mit `SUM() OVER (ORDER BY …)`; eine Fensterfunktion über eine Unterabfrage in `FROM` filtern; eine skalare Unterabfrage | 🔎 Der Aushang der Feuerwehr |
| 4 | Der Dienstplan | Zeilen in Spalten verwandeln: `MAX(CASE WHEN … THEN … END)` mit `GROUP BY`; `IN` mit einer Liste von Werten | 1. Bens Strichliste (sein Ergebnis) |
| 5 | Die Foyerkassen | `date()` und `time()` auf Zeitstempeln; `GROUP BY` über drei Spalten | 1. Bens Strichliste (sein Ergebnis), 🔎 Ein Zettel an der Snackbar |
| 6 | Ediths Büro (Abschluss-Schloss) | Die Ergebnisse mehrerer Abfragen kombinieren | 2. Die Ticketdrucker (sein Ergebnis), 4. Der Dienstplan (sein Ergebnis), 5. Die Foyerkassen (sein Ergebnis), 3. Der Zähler der Feuerwehr (sein Ergebnis), 🔒 3. Der Zähler der Feuerwehr, 🔎 Ein Zettel an der Bürotür, 🔎 Ediths Zettel am Dienstplan |

**Abschluss-Code:** `Tobias Rehm`

## Stationen

### 1. Bens Strichliste

**Übt:** `GROUP BY` über einen Join und `HAVING`, um die Gruppen nach einem Aggregat zu filtern  
**Braucht:** 🔎 Bens Klemmbrett  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Ben Adeyemi, der Platzanweiser, reißt an der Saaltür von jedem Ticket den Abschnitt ab und notiert, wie viele Leute er eingelassen hat: `tally` enthält seine Zählung für jede Vorstellung. `tickets` enthält jedes Ticket, das die Kassen verkauft haben.
>
> Bei welchen Vorstellungen kamen deutlich mehr Leute herein, als Tickets im System stehen? Zeigt `starts`, `hall`, die Zahl der verkauften Tickets und Bens Zählung, die früheste zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM tally
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT s.starts, s.hall, COUNT(t.ticket_no) AS sold, y.admitted
FROM screenings AS s
JOIN tally AS y ON y.screening_id = s.screening_id
LEFT JOIN tickets AS t ON t.screening_id = s.screening_id
GROUP BY s.screening_id, s.starts, s.hall, y.admitted
HAVING y.admitted - COUNT(t.ticket_no) > 2
ORDER BY s.starts;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-11-06 21:30",2,96,113],["2026-11-07 21:30",2,101,120],["2026-11-14 21:30",2,113,134]]
```

**Zeigt nach dem Lösen:**

> Drei Spätvorstellungen im Studio (Saal 2) haben weit mehr Leute eingelassen, als das System Tickets verkauft hat:
> Freitag, 6. November: 96 verkauft, 113 eingelassen
> Samstag, 7. November: 101 verkauft, 120 eingelassen
> Samstag, 14. November: 113 verkauft, 134 eingelassen
> Das sind 57 Leute mit abgerissenem Abschnitt, aber ohne Ticket im System.

**Hinweise:**

1. Bens Klemmbrett an der Studiotür sagt, wie weit ihr seiner Zählung trauen könnt. Zählt zuerst die Tickets pro Vorstellung: Verbindet `tally` und `tickets` über `screening_id` und gruppiert mit `GROUP BY` nach der Vorstellung. Eine Bedingung auf `COUNT(…)` kann nicht in `WHERE` stehen, das vor dem Gruppieren läuft. Sie gehört in `HAVING`, das danach läuft.
2. Ben kann sich um bis zu zwei in beide Richtungen verzählen, ein Unterschied von 1 oder 2 bedeutet also nichts. Behaltet die Gruppen mit `y.admitted - COUNT(t.ticket_no) > 2`. Jede Spalte, die ihr zeigt und die nicht gezählt wird, gehört auch ins `GROUP BY`.
3. `SELECT s.starts, s.hall, COUNT(t.ticket_no) AS sold, y.admitted FROM screenings AS s JOIN tally AS y ON y.screening_id = s.screening_id LEFT JOIN tickets AS t ON t.screening_id = s.screening_id GROUP BY s.screening_id, s.starts, s.hall, y.admitted HAVING y.admitted - COUNT(t.ticket_no) > 2 ORDER BY s.starts;`

### 2. Die Ticketdrucker

**Übt:** Lücken in einer Folge finden: `NOT EXISTS` mit `ticket_no + 1` und korrelierte Unterabfragen mit `MIN` und `MAX`  
**Braucht:** von Anfang an offen  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Jedes Ticket trägt eine aufgedruckte Nummer. Kasse 1 druckt auf einer Rolle, die bei 10001 beginnt, Kasse 2 auf einer, die bei 20001 beginnt, und jedes gedruckte Ticket landet in `tickets`. Wird ein Verkauf storniert, wird seine Zeile gelöscht, und seine Nummer fehlt in der Tabelle.
>
> Findet die Lücken: jedes Ticket, dessen nächste Nummer fehlt, obwohl seine Kasse später höhere Nummern gedruckt hat. Zeigt `till`, die Nummer vor der Lücke und die erste Nummer danach, in der Reihenfolge der Nummern.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM tickets
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT t.till,
       t.ticket_no AS last_before,
       (SELECT MIN(u.ticket_no)
        FROM tickets AS u
        WHERE u.ticket_no > t.ticket_no) AS first_after
FROM tickets AS t
WHERE NOT EXISTS (
  SELECT 1 FROM tickets AS u WHERE u.ticket_no = t.ticket_no + 1
)
  AND t.ticket_no < (SELECT MAX(u.ticket_no) FROM tickets AS u WHERE u.till = t.till)
ORDER BY t.ticket_no;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[[2,20969,20974],[2,20979,20985],[2,20998,21002],[2,21005,21011],[2,21240,21247],[2,21251,21256],[2,21263,21269],[2,21272,21277],[2,22769,22775],[2,22784,22791],[2,22802,22807],[2,22808,22815]]
```

**Zeigt nach dem Lösen:**

> Zwölf Lücken, alle auf der Rolle von **Kasse 2**, insgesamt 57 fehlende Nummern: je vier Lücken an drei Abenden, zwischen 21:04 und 21:30, kurz vor der Spätvorstellung im Studio. Jemand an Kasse 2 hat Tickets verkauft, das Geld behalten und die Verkäufe gelöscht.

**Hinweise:**

1. Ein Ticket steht direkt vor einer Lücke, wenn kein Ticket seine Nummer plus eins hat: `WHERE NOT EXISTS (SELECT 1 FROM tickets AS u WHERE u.ticket_no = t.ticket_no + 1)`.
2. Das findet auch das letzte Ticket jeder Rolle, nach dem noch nichts kommt. Behaltet nur Tickets unter der höchsten Nummer ihrer Kasse: `AND t.ticket_no < (SELECT MAX(u.ticket_no) FROM tickets AS u WHERE u.till = t.till)`. Die erste Nummer nach einer Lücke ist die kleinste Nummer darüber: `(SELECT MIN(u.ticket_no) FROM tickets AS u WHERE u.ticket_no > t.ticket_no)`.
3. `SELECT t.till, t.ticket_no, (SELECT MIN(u.ticket_no) FROM tickets AS u WHERE u.ticket_no > t.ticket_no) AS first_after FROM tickets AS t WHERE NOT EXISTS (SELECT 1 FROM tickets AS u WHERE u.ticket_no = t.ticket_no + 1) AND t.ticket_no < (SELECT MAX(u.ticket_no) FROM tickets AS u WHERE u.till = t.till) ORDER BY t.ticket_no;`

### 3. Der Zähler der Feuerwehr

**Übt:** Laufende Summen mit `SUM() OVER (ORDER BY …)`; eine Fensterfunktion über eine Unterabfrage in `FROM` filtern; eine skalare Unterabfrage  
**Braucht:** 🔎 Der Aushang der Feuerwehr  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Ein Zähler an der Studiotür zählt das Publikum: Der Platzanweiser drückt +1 für jeden, der hereinkommt, und −1 für jeden, der hinausgeht. `clicks` enthält jeden Druck aus der Spätvorstellung am Samstag, dem 14. November.
>
> Wann war das Studio voller, als die Feuerwehr erlaubt? Zeigt die Zeit (`time`) jedes Drucks und wie viele Leute danach drin waren, nur die Momente über der Grenze, den frühesten zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM clicks
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT time, inside
FROM (
  SELECT time, SUM(delta) OVER (ORDER BY time) AS inside
  FROM clicks
)
WHERE inside > (SELECT seats FROM halls WHERE hall = 2)
ORDER BY time;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-11-14 21:40:42",121],["2026-11-14 21:40:45",122],["2026-11-14 21:41:20",123],["2026-11-14 21:41:34",124],["2026-11-14 21:41:54",125],["2026-11-14 21:42:35",126],["2026-11-14 21:42:38",127],["2026-11-14 21:42:54",128],["2026-11-14 21:43:15",129],["2026-11-14 21:43:42",130],["2026-11-14 21:43:49",131],["2026-11-14 21:44:25",132],["2026-11-14 21:48:38",131],["2026-11-14 21:48:44",130],["2026-11-14 21:56:54",131],["2026-11-14 22:01:16",132],["2026-11-14 22:39:58",131],["2026-11-14 22:40:01",130],["2026-11-14 22:43:28",131],["2026-11-14 22:47:45",132],["2026-11-14 22:48:11",131],["2026-11-14 22:49:40",130],["2026-11-14 22:50:11",129],["2026-11-14 22:51:09",128],["2026-11-14 22:54:39",129],["2026-11-14 22:55:19",130],["2026-11-14 22:56:41",131],["2026-11-14 22:57:06",132],["2026-11-14 23:38:15",131],["2026-11-14 23:38:19",130],["2026-11-14 23:38:38",129],["2026-11-14 23:38:53",128],["2026-11-14 23:38:55",127],["2026-11-14 23:38:56",126],["2026-11-14 23:38:57",125],["2026-11-14 23:39:08",124],["2026-11-14 23:39:13",123],["2026-11-14 23:39:15",122],["2026-11-14 23:39:16",121]]
```

**Zeigt nach dem Lösen:**

> Das Studio hat 120 Sitzplätze. In der Spätvorstellung am 14. November lag es zwei Stunden darüber, von 21:40 bis 23:39, mit bis zu **132** Leuten gleichzeitig. Laut Bens Strichliste kamen 134 herein: Zwei Leute sind um 21:48 gegangen, bevor die letzten beiden Nachzügler kamen.

**Hinweise:**

1. Der Aushang der Feuerwehr an der Studiotür sagt, wo die Grenze liegt. Wie viele Leute in einem Moment drin sind, ist die Summe aller Drücke bis dahin: eine laufende Summe. `SUM(delta) OVER (ORDER BY time)` addiert `delta` über alle Zeilen bis zur aktuellen und behält dabei alle Zeilen.
2. Eine Fensterfunktion kann nicht in `WHERE` stehen. Berechnet sie zuerst in einer Unterabfrage, `FROM (SELECT time, SUM(delta) OVER (ORDER BY time) AS inside FROM clicks)`, und filtert dann diese: `WHERE inside > (SELECT seats FROM halls WHERE hall = 2)`.
3. `SELECT time, inside FROM (SELECT time, SUM(delta) OVER (ORDER BY time) AS inside FROM clicks) WHERE inside > (SELECT seats FROM halls WHERE hall = 2) ORDER BY time;`

### 4. Der Dienstplan

**Übt:** Zeilen in Spalten verwandeln: `MAX(CASE WHEN … THEN … END)` mit `GROUP BY`; `IN` mit einer Liste von Werten  
**Braucht:** 1. Bens Strichliste (sein Ergebnis)  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Edith plant jede Schicht am Rechner hinter der Kasse. `rota` hat eine Zeile pro Tag, Schicht (`afternoon` oder `evening`) und Posten (`till 1`, `till 2`, `snack bar`, `drinks bar` oder `door`); `staff` enthält die Namen.
>
> Wer war an jedem Abend, an dem Ben viel zu viele Leute eingelassen hat, in der Abendschicht wo eingeplant? Zeigt eine Zeile pro Tag: den Tag (`day`), dann die Namen an Kasse 1, Kasse 2, der Snackbar, der Getränkebar und der Tür, den frühesten zuerst.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM rota
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT r.day,
       MAX(CASE WHEN r.post = 'till 1' THEN s.name END) AS till_1,
       MAX(CASE WHEN r.post = 'till 2' THEN s.name END) AS till_2,
       MAX(CASE WHEN r.post = 'snack bar' THEN s.name END) AS snack_bar,
       MAX(CASE WHEN r.post = 'drinks bar' THEN s.name END) AS drinks_bar,
       MAX(CASE WHEN r.post = 'door' THEN s.name END) AS door
FROM rota AS r
JOIN staff AS s ON s.staff_id = r.staff_id
WHERE r.shift = 'evening'
  AND r.day IN ('2026-11-06', '2026-11-07', '2026-11-14')
GROUP BY r.day
ORDER BY r.day;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-11-06","Jonas Pfeiffer","Lukas Feld","Tobias Rehm","Marta Kowalski","Ben Adeyemi"],["2026-11-07","Jonas Pfeiffer","Lukas Feld","Tobias Rehm","Marta Kowalski","Ben Adeyemi"],["2026-11-14","Ida Sommer","Selin Aydın","Tobias Rehm","Marta Kowalski","Ben Adeyemi"]]
```

**Zeigt nach dem Lösen:**

> Der Abenddienstplan für die drei Abende:
> 6. Nov.: Kasse 1 Jonas Pfeiffer, Kasse 2 Lukas Feld, Snackbar Tobias Rehm, Getränkebar Marta Kowalski, Tür Ben Adeyemi
> 7. Nov.: Kasse 1 Jonas Pfeiffer, Kasse 2 Lukas Feld, Snackbar Tobias Rehm, Getränkebar Marta Kowalski, Tür Ben Adeyemi
> 14. Nov.: Kasse 1 Ida Sommer, Kasse 2 Selin Aydın, Snackbar Tobias Rehm, Getränkebar Marta Kowalski, Tür Ben Adeyemi
> Auf dem Papier stand an Kasse 2 zweimal Lukas und einmal Selin.

**Hinweise:**

1. Beginnt mit den Zeilen für diese Tage: Verbindet `rota` und `staff`, dann `WHERE r.shift = 'evening' AND r.day IN ('…', '…', '…')` mit den Daten aus Bens Strichliste. Ihr bekommt fünf Zeilen pro Tag, eine pro Posten.
2. Für eine Zeile pro Tag gruppiert ihr mit `GROUP BY r.day` und macht eine Spalte pro Posten: `MAX(CASE WHEN r.post = 'till 2' THEN s.name END) AS till_2`. `CASE` liefert in der Zeile von Kasse 2 den Namen und in den anderen Zeilen `NULL`; `MAX` überspringt die `NULL`s und behält den Namen.
3. `SELECT r.day, MAX(CASE WHEN r.post = 'till 1' THEN s.name END), MAX(CASE WHEN r.post = 'till 2' THEN s.name END), MAX(CASE WHEN r.post = 'snack bar' THEN s.name END), MAX(CASE WHEN r.post = 'drinks bar' THEN s.name END), MAX(CASE WHEN r.post = 'door' THEN s.name END) FROM rota AS r JOIN staff AS s ON s.staff_id = r.staff_id WHERE r.shift = 'evening' AND r.day IN ('2026-11-06', '2026-11-07', '2026-11-14') GROUP BY r.day ORDER BY r.day;`

### 5. Die Foyerkassen

**Übt:** `date()` und `time()` auf Zeitstempeln; `GROUP BY` über drei Spalten  
**Braucht:** 1. Bens Strichliste (sein Ergebnis), 🔎 Ein Zettel an der Snackbar  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Das Foyer hat zwei Theken, die Snackbar und die Getränkebar, und beide kassieren über ein gemeinsames Kassensystem. Es protokolliert jeden Verkauf zusammen mit der Theke und dem, der dort gerade angemeldet ist: `snack_sales`. Die Nachmittagsschicht geht bis 18:15, dann übernimmt die Abendschicht.
>
> Wer hat an den Abenden, an denen Ben viel zu viele Leute eingelassen hat, in der Abendschicht an welcher Theke tatsächlich bedient? Zeigt den Tag (als `YYYY-MM-DD`), die Theke, den Namen und die Zahl der Verkäufe, sortiert nach Tag, Theke und Name.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM snack_sales
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
SELECT date(x.sold_at) AS day, x.counter, s.name, COUNT(*) AS sales
FROM snack_sales AS x
JOIN staff AS s ON s.staff_id = x.staff_id
WHERE date(x.sold_at) IN ('2026-11-06', '2026-11-07', '2026-11-14')
  AND time(x.sold_at) >= '18:15'
GROUP BY day, x.counter, s.name
ORDER BY day, x.counter, s.name;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-11-06","drinks bar","Jonas Pfeiffer",84],["2026-11-06","snack bar","Lukas Feld",61],["2026-11-07","drinks bar","Jonas Pfeiffer",62],["2026-11-07","snack bar","Lukas Feld",71],["2026-11-14","drinks bar","Ida Sommer",73],["2026-11-14","snack bar","Selin Aydın",67]]
```

**Zeigt nach dem Lösen:**

> In der Abendschicht war an der Snackbar am 6. und 7. November **Lukas Feld** angemeldet und am 14. November **Selin Aydın**. An der Getränkebar waren es **Jonas Pfeiffer** am 6. und 7. November und **Ida Sommer** am 14. November.

**Hinweise:**

1. `date(sold_at)` liefert den Tag eines Zeitstempels, `time(sold_at)` seine Uhrzeit. Beides ist Text in festem Format, also könnt ihr vergleichen: `time(sold_at) >= '18:15'`.
2. Verbindet `staff` für die Namen, behaltet die drei Tage mit `date(x.sold_at) IN (…)` und den Abend mit `time(x.sold_at) >= '18:15'`, gruppiert dann mit `GROUP BY` nach Tag, Theke und Name und zählt mit `COUNT(*)`.
3. `SELECT date(x.sold_at) AS day, x.counter, s.name, COUNT(*) FROM snack_sales AS x JOIN staff AS s ON s.staff_id = x.staff_id WHERE date(x.sold_at) IN ('2026-11-06', '2026-11-07', '2026-11-14') AND time(x.sold_at) >= '18:15' GROUP BY day, x.counter, s.name ORDER BY day, x.counter, s.name;`

### 6. Ediths Büro (Abschluss-Schloss)

**Übt:** Die Ergebnisse mehrerer Abfragen kombinieren  
**Braucht:** 2. Die Ticketdrucker (sein Ergebnis), 4. Der Dienstplan (sein Ergebnis), 5. Die Foyerkassen (sein Ergebnis), 3. Der Zähler der Feuerwehr (sein Ergebnis), 🔒 3. Der Zähler der Feuerwehr, 🔎 Ein Zettel an der Bürotür, 🔎 Ediths Zettel am Dienstplan  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Zahlenschloss** (öffnet mit `132`):

> Ediths Bürotür hat ein Tastenfeld. Es will einen dreistelligen Code, und daneben klebt ein Zettel.

**Aufgabe:**

> Edith wartet in ihrem Büro, das Telefon in der Hand.
>
> Wer hat an der Kasse abgezweigt? Nennt den vollständigen Namen.
>
> Ihr könnt die Datenbank hier weiter abfragen.

<details><summary>Startcode</summary>

```sql
-- Die Tabellen und ihre Spalten stehen links. Probiert:
SELECT *
FROM rota
LIMIT 5;
```

</details>

**Musterlösung:**

```sql
-- Planned at a foyer counter on all three evenings, but sold nothing there after 18:15:
SELECT s.name, r.day, r.post,
       (SELECT COUNT(*)
        FROM snack_sales AS x
        WHERE x.staff_id = r.staff_id
          AND x.counter = r.post
          AND date(x.sold_at) = r.day
          AND time(x.sold_at) >= '18:15') AS evening_sales
FROM rota AS r
JOIN staff AS s ON s.staff_id = r.staff_id
WHERE r.shift = 'evening'
  AND r.post IN ('snack bar', 'drinks bar')
  AND r.day IN ('2026-11-06', '2026-11-07', '2026-11-14')
ORDER BY r.day, r.post;
-- Tobias (snack bar) and Marta (drinks bar) both swapped onto a ticket till. The people planned at
-- till 2 sold snacks, so Tobias took till 2; the people planned at till 1 served drinks, so Marta took
-- till 1. All the gaps are on till 2's roll (ticket printers), so it was Tobias.
```

**Antwort:** `Tobias Rehm`

**Hinweise:**

1. Alle fehlenden Tickets kamen von Kasse 2 (Ticketdrucker). Auf dem Papier war Kasse 2 an diesen Abenden Lukas Feld oder Selin Aydın (Dienstplan). Aber Ediths Zettel am Dienstplan sagt, der Plan ist nur ein Plan und kein Protokoll, wer wo stand.
2. Vergleicht den Plan mit den Foyerkassen. Zwei Personen, die an einer Theke eingeplant waren, haben dort am Abend nichts verkauft: Tobias Rehm (Snackbar) und Marta Kowalski (Getränkebar). Die an den Kassen Eingeplanten haben stattdessen an den Theken bedient, also sind Tobias und Marta jeweils an eine Ticketkasse gewechselt. Wer von beiden stand an der Kasse, an der die Tickets verschwanden? Welche Kasse zählt, sagen die Ticketdrucker.
3. Wer an Kasse 2 eingeplant war, hat Snacks verkauft, also hat Tobias Kasse 2 übernommen; wer an Kasse 1 eingeplant war, hat Getränke ausgeschenkt, also hat Marta Kasse 1 übernommen. Alle Lücken liegen auf der Rolle von Kasse 2, also war es Tobias Rehm, während im Dienstplan noch jemand anderes stand.

## Hinweise im Raum

### 🔎 Bens Klemmbrett

*Gebraucht von: 1. Bens Strichliste*

> Ein Klemmbrett neben der Studiotür, mit einer Strichliste für jede Vorstellung und einem Zettel obendrauf:
>
> Ich reiße jeden Abschnitt ab und mache einen Strich. An vollen Abenden kann ich mich um einen oder zwei verzählen, in beide Richtungen. Nie um mehr als zwei. — Ben

### 🔎 Der Aushang der Feuerwehr

*Gebraucht von: 3. Der Zähler der Feuerwehr*

> FEUERWEHR KLEEBERG · AUSHANG
>
> Studio (Saal 2): Nie mehr Personen im Saal, als es Sitzplätze gibt. Stehen in den Gängen oder auf den Stufen ist verboten.
>
> Die Zählungen des Platzanweisers werden geprüft.

### 🔎 Ein Zettel an der Bürotür

*Gebraucht von: 6. Ediths Büro*

> Neuer Code seit dem Besuch der Feuerwehr, damit keiner von uns vergisst, warum wir zahlen mussten: die meisten Leute, die laut Zähler je gleichzeitig im Studio waren. — E.

### 🔎 Ediths Zettel am Dienstplan

*Gebraucht von: 6. Ediths Büro*

> An alle: Posten tauschen ist in Ordnung, aber SAGT ES MIR. Der Dienstplan ist ein Plan, kein Protokoll, wer wo stand. Die Foyerkassen wissen wenigstens immer, wer angemeldet ist, an der Snackbar und an der Getränkebar. — Edith

### 🔎 Ein Zettel an der Snackbar

*Gebraucht von: 5. Die Foyerkassen*

> Erinnerung für alle, die die Snackbar übernehmen: Die Kasse bucht jeden Verkauf auf den Namen, der angemeldet ist. Meldet euch mit eurem eigenen an. — Tobias

### 🔎 Eine Zeitung

*Gebraucht von: nur Atmosphäre*

> KLEEBERGER TAGBLATT · Samstag, 14. November 2026
>
> PARKHAUS STATT KINO? Die Bank entscheidet am Montag über den Kredit für das Kino Lumen. „Die Zahlen sprechen für sich“, sagt der Investor, der das Grundstück will. Inhaberin Edith Brandauer: „Unsere Säle sind voll. Ich verstehe diese Zahlen nicht.“

## Handbuch im Raum: 📖 Der Kassenordner

**Gruppen filtern:** [`GROUP BY … HAVING condition`](https://www.sqlite.org/lang_select.html#resultset), [`COUNT(*) / COUNT(x)`](https://www.sqlite.org/lang_aggfunc.html#count), [`a LEFT JOIN b ON …`](https://www.sqlite.org/lang_select.html#fromclause)

**Zeilen in Spalten:** [`CASE WHEN condition THEN value ELSE other END`](https://www.sqlite.org/lang_expr.html#case), [`MAX(x) / MIN(x)`](https://www.sqlite.org/lang_aggfunc.html#max_agg)

**Unterabfragen:** [`x IN (a, b, c)`](https://www.sqlite.org/lang_expr.html#in_op), [`EXISTS (SELECT …)`](https://www.sqlite.org/lang_expr.html#exists_op), [`(SELECT MAX(…) FROM …)`](https://www.sqlite.org/lang_expr.html#subq), [`correlated subquery`](https://www.sqlite.org/lang_expr.html#cosub), [`SELECT … FROM (SELECT …)`](https://www.sqlite.org/lang_select.html#fromclause)

**Datum und Uhrzeit:** [`date(t) / time(t)`](https://www.sqlite.org/lang_datefunc.html)

**Laufende Summen:** [`SUM(x) OVER (ORDER BY y)`](https://www.sqlite.org/windowfunctions.html#aggwinfunc), [`the frame`](https://www.sqlite.org/windowfunctions.html#framespec)
