# Hotel-Mysterium: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Jemand hat letzte Nacht Zimmer 404 betreten, und die Managerin will wissen, wer. Die Datenbank des Hotels hat alles, was ihr braucht.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Die Gästeliste | `SELECT`, `WHERE` mit `BETWEEN`, `ORDER BY` | von Anfang an offen |
| 2 | Der Safe der Managerin (Abschluss-Schloss) | Abfrageergebnisse lesen | 1. Die Gästeliste |

**Abschluss-Code:** `Edgar Codd`

## Stationen

### 1. Die Gästeliste

**Übt:** `SELECT`, `WHERE` mit `BETWEEN`, `ORDER BY`  
**Braucht:** von Anfang an offen  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Das Rezeptionsterminal ist mit der Hoteldatenbank verbunden.
>
> Liste die Namen aller Gäste im 4. Stock (Zimmer 400–499) alphabetisch sortiert auf.

<details><summary>Startcode</summary>

```sql
SELECT *
FROM guests;
```

</details>

**Musterlösung:**

```sql
SELECT name FROM guests WHERE room BETWEEN 400 AND 499 ORDER BY name
```

**Geprüftes Ergebnis** (Zeilen, Spaltennamen egal, in dieser Reihenfolge):

```json
[["Ada Lovelace"],["Edgar Codd"],["Grace Hopper"],["Katherine Johnson"]]
```

**Hinweise:**

1. Filtere Zeilen mit `WHERE`. `BETWEEN 400 AND 499` ist praktisch.
2. Sortiere mit `ORDER BY name` und wähle nur die Spalte `name`.

### 2. Der Safe der Managerin (Abschluss-Schloss)

**Übt:** Abfrageergebnisse lesen  
**Braucht:** 1. Die Gästeliste  
**Daten:** [hotel.sql](../../content/rooms/sql-hotel/data/hotel.sql)

**Aufgabe:**

> Der Safe öffnet sich mit dem Namen des Eindringlings: dem Gast, dessen Schlüsselkarte Zimmer 404 geöffnet hat, obwohl er dort nicht gebucht ist.

<details><summary>Startcode</summary>

```sql
SELECT *
FROM keycard_log
WHERE room = 404;
```

</details>

**Antwort:** `Edgar Codd`

**Hinweise:**

1. Die Tabelle `keycard_log` zeigt, wer welches Zimmer geöffnet hat. Vergleiche das mit dem gebuchten Zimmer jedes Gastes.
2. `JOIN guests ON guests.id = keycard_log.guest_id`, dann behalte Zeilen, in denen das Zimmer im Log 404 ist, das Zimmer des Gastes aber nicht.
