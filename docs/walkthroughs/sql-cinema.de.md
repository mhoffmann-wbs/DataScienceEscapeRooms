# Die letzte Vorstellung: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Kino Lumen, Kleebergs letztes altes Kino, Sonntag, 15. November, nach der letzten Vorstellung. Morgen um neun muss Edith Brandauer der Bank ihre Bücher zeigen. Nach denen verliert das Kino jede Woche Geld, dabei war das Studio an den Wochenenden voll. Jemand hat sich an der Kasse bedient.
>
> Edith hat die Türen hinter euch abgeschlossen und euch den Kinorechner geöffnet: jedes Ticket, das die beiden Kassen gedruckt haben, Bens Strichliste an der Tür, den Dienstplan, die Snackkasse und den neuen Zähler der Feuerwehr. Findet heraus, wer abgezweigt hat, und sagt es Edith, bevor in einer halben Stunde der letzte Bus fährt.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Bens Strichliste | `GROUP BY` über einen Join und `HAVING`, um die Gruppen nach einem Aggregat zu filtern | 🔎 Bens Klemmbrett |
| 2 | Die Ticketdrucker | Lücken in einer Folge finden: `NOT EXISTS` mit `ticket_no + 1` und korrelierte Unterabfragen mit `MIN` und `MAX` | von Anfang an offen |
| 3 | Der Zähler der Feuerwehr | Laufende Summen mit `SUM() OVER (ORDER BY …)`; eine Fensterfunktion über eine Unterabfrage in `FROM` filtern; eine skalare Unterabfrage | 🔎 Der Aushang der Feuerwehr |
| 4 | Der Dienstplan | Zeilen in Spalten verwandeln: `MAX(CASE WHEN … THEN … END)` mit `GROUP BY`; `IN` mit einer Liste von Werten | 1. Bens Strichliste (sein Ergebnis) |
| 5 | Die Snackkasse | `date()` und `time()` auf Zeitstempeln; `GROUP BY` über zwei Spalten | 1. Bens Strichliste (sein Ergebnis), 🔎 Ein Zettel an der Snackbar |
| 6 | Ediths Büro (Abschluss-Schloss) | Die Ergebnisse mehrerer Abfragen kombinieren | 2. Die Ticketdrucker (sein Ergebnis), 4. Der Dienstplan (sein Ergebnis), 5. Die Snackkasse (sein Ergebnis), 3. Der Zähler der Feuerwehr (sein Ergebnis), 🔒 3. Der Zähler der Feuerwehr, 🔎 Ein Zettel an der Bürotür, 🔎 Ediths Zettel am Dienstplan |

**Abschluss-Code:** `Tobias Rehm`

## Stationen

### 1. Bens Strichliste

**Übt:** `GROUP BY` über einen Join und `HAVING`, um die Gruppen nach einem Aggregat zu filtern  
**Braucht:** 🔎 Bens Klemmbrett  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Ben Adeyemi, der Platzanweiser, reißt an der Saaltür von jedem Ticket den Abschnitt ab und notiert, wie viele Leute er eingelassen hat: `tally` enthält seine Zählung für jede Vorstellung. `tickets` enthält jedes Ticket, das die Kassen verkauft haben.
>
> Bei welchen Vorstellungen kamen deutlich mehr Leute herein, als Tickets im System stehen? Bens Notiz auf dem Klemmbrett sagt, wie weit ihr seiner Zählung trauen könnt. Zeigt `starts`, `hall`, die Zahl der verkauften Tickets und Bens Zählung, die früheste zuerst.

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

1. Zählt zuerst die Tickets pro Vorstellung: Verbindet `tally` und `tickets` über `screening_id` und gruppiert mit `GROUP BY` nach der Vorstellung. Eine Bedingung auf `COUNT(…)` kann nicht in `WHERE` stehen, das vor dem Gruppieren läuft. Sie gehört in `HAVING`, das danach läuft.
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
[[2,20920,20925],[2,20929,20935],[2,20942,20946],[2,20951,20957],[2,21212,21219],[2,21225,21230],[2,21239,21245],[2,21249,21254],[2,22705,22711],[2,22732,22739],[2,22740,22745],[2,22751,22758]]
```

**Zeigt nach dem Lösen:**

> Zwölf Lücken, alle auf der Rolle von **Kasse 2**, insgesamt 57 fehlende Nummern: je vier Lücken am 6., 7. und 14. November, zwischen 21:03 und 21:29, kurz vor der Spätvorstellung im Studio. Jemand an Kasse 2 hat Tickets verkauft, das Geld behalten und die Verkäufe gelöscht.

**Hinweise:**

1. Ein Ticket steht direkt vor einer Lücke, wenn kein Ticket seine Nummer plus eins hat: `WHERE NOT EXISTS (SELECT 1 FROM tickets AS u WHERE u.ticket_no = t.ticket_no + 1)`.
2. Das findet auch das letzte Ticket jeder Rolle, nach dem noch nichts kommt. Behaltet nur Tickets unter der höchsten Nummer ihrer Kasse: `AND t.ticket_no < (SELECT MAX(u.ticket_no) FROM tickets AS u WHERE u.till = t.till)`. Die erste Nummer nach einer Lücke ist die kleinste Nummer darüber: `(SELECT MIN(u.ticket_no) FROM tickets AS u WHERE u.ticket_no > t.ticket_no)`.
3. `SELECT t.till, t.ticket_no, (SELECT MIN(u.ticket_no) FROM tickets AS u WHERE u.ticket_no > t.ticket_no) AS first_after FROM tickets AS t WHERE NOT EXISTS (SELECT 1 FROM tickets AS u WHERE u.ticket_no = t.ticket_no + 1) AND t.ticket_no < (SELECT MAX(u.ticket_no) FROM tickets AS u WHERE u.till = t.till) ORDER BY t.ticket_no;`

### 3. Der Zähler der Feuerwehr

**Übt:** Laufende Summen mit `SUM() OVER (ORDER BY …)`; eine Fensterfunktion über eine Unterabfrage in `FROM` filtern; eine skalare Unterabfrage  
**Braucht:** 🔎 Der Aushang der Feuerwehr  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Nach Beschwerden über ein überfülltes Studio hat die Feuerwehr an seiner Tür einen Zähler einbauen lassen. Seit Samstag, dem 14. November, drückt der Platzanweiser +1 für jeden, der hereinkommt, und −1 für jeden, der hinausgeht. `clicks` enthält jeden Druck aus der Spätvorstellung an diesem Abend.
>
> Wann waren im Studio mehr Leute, als es Sitzplätze hat? Zeigt die Zeit (`time`) jedes Drucks und wie viele Leute danach drin waren, nur die Momente über der Zahl der Sitzplätze, den frühesten zuerst.

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
[["2026-11-14 21:40:33",121],["2026-11-14 21:41:11",122],["2026-11-14 21:41:32",123],["2026-11-14 21:41:59",124],["2026-11-14 21:42:21",125],["2026-11-14 21:42:22",126],["2026-11-14 21:42:34",127],["2026-11-14 21:42:41",128],["2026-11-14 21:43:16",129],["2026-11-14 21:44:11",130],["2026-11-14 21:44:30",131],["2026-11-14 21:44:31",132],["2026-11-14 21:50:51",131],["2026-11-14 21:51:25",130],["2026-11-14 21:56:41",131],["2026-11-14 22:00:35",132],["2026-11-14 22:10:42",131],["2026-11-14 22:13:17",130],["2026-11-14 22:16:35",131],["2026-11-14 22:19:21",132],["2026-11-14 22:37:22",131],["2026-11-14 22:42:46",130],["2026-11-14 22:43:18",129],["2026-11-14 22:43:48",130],["2026-11-14 22:45:38",129],["2026-11-14 22:48:46",130],["2026-11-14 22:50:34",131],["2026-11-14 22:50:47",132],["2026-11-14 23:38:01",131],["2026-11-14 23:38:15",130],["2026-11-14 23:38:18",129],["2026-11-14 23:38:19",128],["2026-11-14 23:38:51",127],["2026-11-14 23:38:55",126],["2026-11-14 23:39:00",125],["2026-11-14 23:39:08",124],["2026-11-14 23:39:12",123],["2026-11-14 23:39:14",122],["2026-11-14 23:39:16",121]]
```

**Zeigt nach dem Lösen:**

> Das Studio hat 120 Sitzplätze. In der Spätvorstellung am 14. November lag es zwei Stunden darüber, von 21:40 bis 23:39, mit bis zu **132** Leuten gleichzeitig. Laut Bens Strichliste kamen 134 herein: Zwei Leute sind um 21:50 gegangen, bevor die letzten beiden Nachzügler kamen.

**Hinweise:**

1. Wie viele Leute in einem Moment drin sind, ist die Summe aller Drücke bis dahin: eine laufende Summe. `SUM(delta) OVER (ORDER BY time)` addiert `delta` über alle Zeilen bis zur aktuellen und behält dabei alle Zeilen.
2. Eine Fensterfunktion kann nicht in `WHERE` stehen. Berechnet sie zuerst in einer Unterabfrage, `FROM (SELECT time, SUM(delta) OVER (ORDER BY time) AS inside FROM clicks)`, und filtert dann diese: `WHERE inside > (SELECT seats FROM halls WHERE hall = 2)`.
3. `SELECT time, inside FROM (SELECT time, SUM(delta) OVER (ORDER BY time) AS inside FROM clicks) WHERE inside > (SELECT seats FROM halls WHERE hall = 2) ORDER BY time;`

### 4. Der Dienstplan

**Übt:** Zeilen in Spalten verwandeln: `MAX(CASE WHEN … THEN … END)` mit `GROUP BY`; `IN` mit einer Liste von Werten  
**Braucht:** 1. Bens Strichliste (sein Ergebnis)  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Edith plant jede Schicht am Rechner hinter der Kasse. `rota` hat eine Zeile pro Tag, Schicht (`afternoon` oder `evening`) und Posten (`till 1`, `till 2`, `snack bar` oder `door`); `staff` enthält die Namen.
>
> Wer war an jedem Abend, an dem Ben viel zu viele Leute eingelassen hat, in der Abendschicht wo eingeplant? Zeigt eine Zeile pro Tag: den Tag (`day`), dann die Namen an Kasse 1, Kasse 2, der Snackbar und der Tür, den frühesten zuerst.

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
[["2026-11-06","Jonas Pfeiffer","Lukas Feld","Tobias Rehm","Ben Adeyemi"],["2026-11-07","Jonas Pfeiffer","Lukas Feld","Tobias Rehm","Ben Adeyemi"],["2026-11-14","Ida Sommer","Selin Aydın","Tobias Rehm","Ben Adeyemi"]]
```

**Zeigt nach dem Lösen:**

> Der Abenddienstplan für die drei Abende:
> 6. Nov.: Kasse 1 Jonas Pfeiffer, Kasse 2 **Lukas Feld**, Snackbar Tobias Rehm, Tür Ben Adeyemi
> 7. Nov.: Kasse 1 Jonas Pfeiffer, Kasse 2 **Lukas Feld**, Snackbar Tobias Rehm, Tür Ben Adeyemi
> 14. Nov.: Kasse 1 Ida Sommer, Kasse 2 **Selin Aydın**, Snackbar Tobias Rehm, Tür Ben Adeyemi
> Auf dem Papier stand an Kasse 2 zweimal Lukas und einmal Selin.

**Hinweise:**

1. Beginnt mit den Zeilen für diese Tage: Verbindet `rota` und `staff`, dann `WHERE r.shift = 'evening' AND r.day IN ('…', '…', '…')` mit den Daten aus Bens Strichliste. Ihr bekommt vier Zeilen pro Tag, eine pro Posten.
2. Für eine Zeile pro Tag gruppiert ihr mit `GROUP BY r.day` und macht eine Spalte pro Posten: `MAX(CASE WHEN r.post = 'till 2' THEN s.name END) AS till_2`. `CASE` liefert in der Zeile von Kasse 2 den Namen und in den anderen Zeilen `NULL`; `MAX` überspringt die `NULL`s und behält den Namen.
3. `SELECT r.day, MAX(CASE WHEN r.post = 'till 1' THEN s.name END), MAX(CASE WHEN r.post = 'till 2' THEN s.name END), MAX(CASE WHEN r.post = 'snack bar' THEN s.name END), MAX(CASE WHEN r.post = 'door' THEN s.name END) FROM rota AS r JOIN staff AS s ON s.staff_id = r.staff_id WHERE r.shift = 'evening' AND r.day IN ('2026-11-06', '2026-11-07', '2026-11-14') GROUP BY r.day ORDER BY r.day;`

### 5. Die Snackkasse

**Übt:** `date()` und `time()` auf Zeitstempeln; `GROUP BY` über zwei Spalten  
**Braucht:** 1. Bens Strichliste (sein Ergebnis), 🔎 Ein Zettel an der Snackbar  
**Daten:** [cinema.sql](../../content/rooms/sql-cinema/data/cinema.sql)

**Aufgabe:**

> Die Kasse der Snackbar protokolliert jeden Verkauf zusammen mit dem, der gerade angemeldet ist: `snack_sales`. Die Nachmittagsschicht geht bis 18:15, dann übernimmt die Abendschicht.
>
> Wer hat an den Abenden, an denen Ben viel zu viele Leute eingelassen hat, in der Abendschicht tatsächlich Snacks verkauft? Zeigt den Tag (als `YYYY-MM-DD`), den Namen und die Zahl der Verkäufe, sortiert nach Tag und Name.

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
SELECT date(x.sold_at) AS day, s.name, COUNT(*) AS sales
FROM snack_sales AS x
JOIN staff AS s ON s.staff_id = x.staff_id
WHERE date(x.sold_at) IN ('2026-11-06', '2026-11-07', '2026-11-14')
  AND time(x.sold_at) >= '18:15'
GROUP BY day, s.name
ORDER BY day, s.name;
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["2026-11-06","Lukas Feld",102],["2026-11-07","Lukas Feld",95],["2026-11-14","Selin Aydın",100]]
```

**Zeigt nach dem Lösen:**

> In der Abendschicht war an der Snackkasse am 6. und 7. November **Lukas Feld** angemeldet und am 14. November **Selin Aydın**, mit 95 bis 102 Verkäufen pro Abend. Tobias Rehm hat an diesen Tagen auch Snacks verkauft, aber nur nachmittags: Nach 18:15 hat er keinen einzigen verkauft.

**Hinweise:**

1. `date(sold_at)` liefert den Tag eines Zeitstempels, `time(sold_at)` seine Uhrzeit. Beides ist Text in festem Format, also könnt ihr vergleichen: `time(sold_at) >= '18:15'`.
2. Verbindet `staff` für die Namen, behaltet die drei Tage mit `date(x.sold_at) IN (…)` und den Abend mit `time(x.sold_at) >= '18:15'`, gruppiert dann mit `GROUP BY` nach Tag und Name und zählt mit `COUNT(*)`.
3. `SELECT date(x.sold_at) AS day, s.name, COUNT(*) FROM snack_sales AS x JOIN staff AS s ON s.staff_id = x.staff_id WHERE date(x.sold_at) IN ('2026-11-06', '2026-11-07', '2026-11-14') AND time(x.sold_at) >= '18:15' GROUP BY day, s.name ORDER BY day, s.name;`

### 6. Ediths Büro (Abschluss-Schloss)

**Übt:** Die Ergebnisse mehrerer Abfragen kombinieren  
**Braucht:** 2. Die Ticketdrucker (sein Ergebnis), 4. Der Dienstplan (sein Ergebnis), 5. Die Snackkasse (sein Ergebnis), 3. Der Zähler der Feuerwehr (sein Ergebnis), 🔒 3. Der Zähler der Feuerwehr, 🔎 Ein Zettel an der Bürotür, 🔎 Ediths Zettel am Dienstplan  
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
-- Planned at the snack bar on all three evenings, but sold no snacks after 18:15:
SELECT s.name, r.day,
       (SELECT COUNT(*)
        FROM snack_sales AS x
        WHERE x.staff_id = r.staff_id
          AND date(x.sold_at) = r.day
          AND time(x.sold_at) >= '18:15') AS evening_sales
FROM rota AS r
JOIN staff AS s ON s.staff_id = r.staff_id
WHERE r.shift = 'evening'
  AND r.post = 'snack bar'
  AND r.day IN ('2026-11-06', '2026-11-07', '2026-11-14')
ORDER BY r.day;
```

**Antwort:** `Tobias Rehm`

**Hinweise:**

1. Alle fehlenden Tickets kamen von Kasse 2 (Ticketdrucker). Auf dem Papier war Kasse 2 an diesen Abenden Lukas Feld oder Selin Aydın (Dienstplan). Aber Ediths Zettel am Dienstplan sagt, der Plan ist nur ein Plan.
2. Die Snackkasse zeigt, dass, wer an Kasse 2 eingeplant war, den ganzen Abend Snacks verkauft hat. Also hat diese Person mit der getauscht, die an der Snackbar eingeplant war und nach 18:15 keine Snacks verkauft hat.
3. Tobias Rehm war an allen drei Abenden an der Snackbar eingeplant, hat aber nach 18:15 keine Snacks verkauft. Er hat an Kasse 2 getauscht, wo die Tickets verschwanden, während im Dienstplan noch jemand anderes stand.

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
> Ab Samstag, dem 14. November, zählt der Platzanweiser alle mit einem Zähler hinein und hinaus. Die Zählungen werden geprüft.

### 🔎 Ein Zettel an der Bürotür

*Gebraucht von: 6. Ediths Büro*

> Neuer Code seit dem Besuch der Feuerwehr, damit keiner von uns vergisst, warum wir zahlen mussten: die meisten Leute, die laut Zähler je gleichzeitig im Studio waren. — E.

### 🔎 Ediths Zettel am Dienstplan

*Gebraucht von: 6. Ediths Büro*

> An alle: Posten tauschen ist in Ordnung, aber SAGT ES MIR. Der Dienstplan ist ein Plan, kein Protokoll, wer wo stand. Die Snackkasse weiß wenigstens immer, wer angemeldet ist. — Edith

### 🔎 Ein Zettel an der Snackbar

*Gebraucht von: 5. Die Snackkasse*

> Edith, bevor du fragst: Am 6., 7. und 14. habe ich an der Snackbar gearbeitet, nicht mal in der Nähe der Kasse. Schau in die Snackkasse, wenn du mir nicht glaubst. — Tobias

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
