# Markttag: Lösungsweg

<!-- Erzeugt mit `npm run walkthrough` aus dem Raum-Manifest und seinen Referenzlösungen. Nicht von Hand bearbeiten. -->

## Geschichte

> Samstag auf dem Kleeberger Bauernmarkt. Um 14:00 Uhr haben die Markthilfen die Umschläge aller Stände ins Marktbüro gebracht, und Greta, die Marktleiterin, hat nachgezählt. Es fehlt Geld. Sie hat die Markthalle abgeschlossen: Niemand geht, bevor die Zahlen stimmen.
>
> Die Verkaufslisten der Stände liegen als CSV-Dateien auf dem Bürocomputer. Bereinigt sie mit pandas und findet heraus, wohin das Geld verschwunden ist. Dieser Raum lädt Python mit pandas: Das erste Rätsel, das ihr öffnet, braucht einen Moment.

## Überblick

| # | Station | Übt | Braucht |
|---|---|---|---|
| 1 | Das Marktregister | Eine CSV-Datei mit `read_csv` laden, einen DataFrame ansehen (`head`, `columns`), Zeilen mit einer Bedingung filtern, Spalten auswählen | 🔎 Ein Zettel im Marktbüro, 🔎 Marktplan |
| 2 | Preisschilder | Eine Textspalte mit `.str.replace` und `.str.strip` bereinigen, mit `astype(float)` umwandeln, eine neue Spalte berechnen, `sum` | 🔎 Preistafel |
| 3 | Das Kartenterminal | Uneinheitliche Bezeichnungen mit `value_counts` und `nunique` finden, Text vereinheitlichen (`.str.strip`, `.str.lower`, `.str.upper`), Werte mit `replace` umbenennen, mit einer Bedingung zählen | 🔎 Marktordnung |
| 4 | Das Kassenbuch | Vor dem Aggregieren filtern, `groupby` mit `sum`, `idxmax` | 2. Preisschilder (sein Ergebnis), 3. Das Kartenterminal (sein Ergebnis), 🔎 Marktordnung |
| 5 | Der Umschlagtisch | Tabellen mit `merge` über einen gemeinsamen Schlüssel verbinden, eine Series mit `reset_index` zur Tabelle machen, Spalten vergleichen, mit `groupby` ein Muster finden | 4. Das Kassenbuch (sein Ergebnis) |
| 6 | Gretas Bericht (Abschluss-Schloss) | Ergebnisse aus mehreren Analysen kombinieren und einen Fehlbetrag mit Belegen aus einer anderen Tabelle ausschließen | 1. Das Marktregister (sein Ergebnis), 5. Der Umschlagtisch (sein Ergebnis), 🔒 5. Der Umschlagtisch, 🔎 Helferplan |

**Abschluss-Code:** `Tobi`

## Stationen

### 1. Das Marktregister

**Übt:** Eine CSV-Datei mit `read_csv` laden, einen DataFrame ansehen (`head`, `columns`), Zeilen mit einer Bedingung filtern, Spalten auswählen  
**Braucht:** 🔎 Ein Zettel im Marktbüro, 🔎 Marktplan  
**Daten:** [market.py](../../content/rooms/pandas-market/data/market.py)

**Aufgabe:**

> Gretas Register der heutigen Stände steht in `stalls.csv`. Ladet es mit pandas und schaut es euch an.
>
> Wie viele Stände verkaufen Gemüse? Speichert die Zahl in `n_veg`.
>
> Ein Stand hat einer Kundin viel zu viel Wechselgeld herausgegeben, und die Kundin hat das Geld zurückgebracht. Findet diesen Stand und speichert seine `stall_id` in `change_stall`.

<details><summary>Startcode</summary>

```python
import pandas as pd

stalls = pd.read_csv("stalls.csv")
print(stalls.head())

n_veg = None     # wie viele Stände verkaufen Gemüse?
change_stall = None   # stall_id des Stands, der zu viel Wechselgeld gab, z. B. "S01"
```

</details>

**Musterlösung:**

```python
import pandas as pd

stalls = pd.read_csv("stalls.csv")
n_veg = len(stalls[stalls["product"] == "vegetables"])

honey = stalls[stalls["product"] == "honey"]
print(honey[["stall_id", "stall", "pitch"]])
# The fountain stands between pitches 4 and 5 (market plan).
change_stall = honey[honey["pitch"].isin([4, 5])]["stall_id"].iloc[0]
print(n_veg, change_stall)
```

**Geprüftes Ergebnis** (`[int(n_veg), str(change_stall).strip().upper()]`):

```json
[2, "S04"]
```

**Zeigt nach dem Lösen:**

> Der Stand ist **S04**, die Imkerei Sommer von Lena Sommer. In ihrem Umschlag werden 80 € fehlen, aber die Kundin hat das Geld ins Büro zurückgebracht: Dieser Fehlbetrag ist kein Diebstahl.

**Hinweise:**

1. Am Tischchen beim Brunnen liegt ein Zettel, und an der Wand hängt der Marktplan. Für das Gemüse: `stalls[stalls["product"] == "vegetables"]` behält nur die passenden Zeilen, und `len(...)` zählt sie.
2. Zwei Stände verkaufen Honig. Welcher von beiden hat einen Platz direkt neben dem Brunnen? Filtert nach `product` und schaut dann auf `pitch`.
3. `stalls[stalls["product"] == "honey"]` zeigt S04 auf Platz 4 und S07 auf Platz 9. Der Brunnen steht zwischen Platz 4 und 5, also ist es `"S04"`.

### 2. Preisschilder

**Übt:** Eine Textspalte mit `.str.replace` und `.str.strip` bereinigen, mit `astype(float)` umwandeln, eine neue Spalte berechnen, `sum`  
**Braucht:** 🔎 Preistafel  
**Daten:** [market.py](../../content/rooms/pandas-market/data/market.py)

**Aufgabe:**

> Alle Stände haben ihre Verkäufe in eine Liste getippt, `sales.csv`: eine Zeile pro Verkauf, mit der Menge `qty` und dem Stückpreis `price`. Aber `price` ist Text, also kann pandas damit nicht rechnen.
>
> Macht aus `price` Zahlen, fügt eine Spalte `revenue` hinzu (Menge × Preis) und speichert den Gesamtumsatz des Tages, bar und Karte zusammen, in `total`.

<details><summary>Startcode</summary>

```python
import pandas as pd

sales = pd.read_csv("sales.csv")
print(sales.head(10))
print(sales["price"].unique()[:12])

# macht aus sales["price"] eine Spalte mit Zahlen
# sales["revenue"] = ...

total = None   # alle Verkäufe des Tages, in Euro
```

</details>

**Musterlösung:**

```python
import pandas as pd

sales = pd.read_csv("sales.csv")
sales["price"] = sales["price"].str.replace("€", "").str.replace(",", ".").str.strip().astype(float)
sales["revenue"] = sales["qty"] * sales["price"]
total = sales["revenue"].sum()
print(round(total, 2))
```

**Geprüftes Ergebnis** (`round(float(total), 2)`):

```json
1889.0
```

**Zeigt nach dem Lösen:**

> Der Markt hat heute Waren für **1.889,00 €** verkauft, bar und mit Karte zusammen.

**Hinweise:**

1. Die Preistafel an der Wand zeigt, wie die Stände ihre Preise schreiben. `sales["price"].unique()` zeigt alle Schreibweisen. Textspalten haben `.str`-Methoden, zum Beispiel `.str.replace("€", "")` und `.str.strip()`.
2. Entfernt das Euro-Zeichen, macht aus dem Dezimalkomma einen Punkt, entfernt die Leerzeichen und wandelt dann mit `.astype(float)` um.
3. `sales["price"] = sales["price"].str.replace("€", "").str.replace(",", ".").str.strip().astype(float)`, dann `sales["revenue"] = sales["qty"] * sales["price"]` und `total = sales["revenue"].sum()`.

### 3. Das Kartenterminal

**Übt:** Uneinheitliche Bezeichnungen mit `value_counts` und `nunique` finden, Text vereinheitlichen (`.str.strip`, `.str.lower`, `.str.upper`), Werte mit `replace` umbenennen, mit einer Bedingung zählen  
**Braucht:** 🔎 Marktordnung  
**Daten:** [market.py](../../content/rooms/pandas-market/data/market.py)

**Aufgabe:**

> Bar oder Karte? In der Spalte `payment` von `sales.csv` sollte nur `cash` oder `card` stehen, aber die Standbetreiber haben getippt, was sie wollten. Die Spalte `stall_id` ist genauso unordentlich, also taucht derselbe Stand unter mehreren Schreibweisen auf.
>
> Bereinigt beide Spalten direkt in `sales`. Zählt dann die Barverkäufe als `n_cash` und die Kartenverkäufe als `n_card`.

<details><summary>Startcode</summary>

```python
import pandas as pd

sales = pd.read_csv("sales.csv")
print(sales["payment"].value_counts())
print(sales["stall_id"].nunique(), "verschiedene stall_ids")

# bereinigt sales["payment"] und sales["stall_id"]

n_cash = None
n_card = None
```

</details>

**Musterlösung:**

```python
import pandas as pd

sales = pd.read_csv("sales.csv")
sales["payment"] = sales["payment"].str.strip().str.lower().replace({"ec": "card"})
sales["stall_id"] = sales["stall_id"].str.strip().str.upper()

n_cash = (sales["payment"] == "cash").sum()
n_card = (sales["payment"] == "card").sum()
print(n_cash, n_card, sales["stall_id"].nunique())
```

**Geprüftes Ergebnis** (`[int(n_cash), int(n_card), int(sales["stall_id"].nunique())]`):

```json
[128, 90, 12]
```

**Zeigt nach dem Lösen:**

> **128** Barverkäufe und **90** Kartenverkäufe von **12** Ständen.

**Hinweise:**

1. Die Marktordnung an der Wand sagt, was als Kartenzahlung zählt. `sales["payment"].value_counts()` zeigt jede Schreibweise mit ihrer Anzahl. Es gibt 12 Stände, aber `sales["stall_id"].nunique()` sagt mehr: Gebt `sales["stall_id"].unique()` aus, um zu sehen, warum.
2. `.str.strip()` entfernt Leerzeichen, `.str.lower()` und `.str.upper()` vereinheitlichen die Groß- und Kleinschreibung. `EC` ist eine Kartenzahlung; `.replace({"ec": "card"})` benennt einen Wert um.
3. `sales["payment"] = sales["payment"].str.strip().str.lower().replace({"ec": "card"})`, `sales["stall_id"] = sales["stall_id"].str.strip().str.upper()`, dann `n_cash = (sales["payment"] == "cash").sum()` und dasselbe für `"card"`.

### 4. Das Kassenbuch

**Übt:** Vor dem Aggregieren filtern, `groupby` mit `sum`, `idxmax`  
**Braucht:** 2. Preisschilder (sein Ergebnis), 3. Das Kartenterminal (sein Ergebnis), 🔎 Marktordnung  
**Daten:** [market.py](../../content/rooms/pandas-market/data/market.py)

**Aufgabe:**

> Greta will wissen, wie viel Geld jeder Stand um 14:00 Uhr in seinen Umschlag hätte stecken müssen.
>
> `sales.csv` ist hier noch roh: Preise, Zahlungsarten und Stand-IDs müssen bereinigt werden, bevor die Summen stimmen.
>
> Addiert `revenue` pro Stand mit `groupby` und behaltet dabei nur die Verkäufe, die in die Umschläge gehören. Speichert das Ergebnis in `expected` (eine Series mit einer Summe pro `stall_id`) und den Stand mit der größten Summe in `top_stall`.

<details><summary>Startcode</summary>

```python
import pandas as pd

sales = pd.read_csv("sales.csv")

# bereinigt zuerst:
# sales["price"], sales["revenue"], sales["payment"], sales["stall_id"]

expected = None    # was in jeden Umschlag gehört, pro stall_id
top_stall = None   # stall_id mit der größten Summe
```

</details>

**Musterlösung:**

```python
import pandas as pd

sales = pd.read_csv("sales.csv")
sales["price"] = sales["price"].str.replace("€", "").str.replace(",", ".").str.strip().astype(float)
sales["revenue"] = sales["qty"] * sales["price"]
sales["payment"] = sales["payment"].str.strip().str.lower().replace({"ec": "card"})
sales["stall_id"] = sales["stall_id"].str.strip().str.upper()

expected = sales[sales["payment"] == "cash"].groupby("stall_id")["revenue"].sum()
top_stall = expected.idxmax()
print(expected.round(2))
print(top_stall)
```

**Geprüftes Ergebnis** (`[round(float(expected.sum()), 2), str(top_stall).strip().upper()]`):

```json
[1110.0, "S04"]
```

**Zeigt nach dem Lösen:**

> In den Umschlägen müssten **1.110,00 €** Bargeld sein. Das meiste Bargeld hat **S04** eingenommen, die Imkerei Sommer: 161,20 €.

**Hinweise:**

1. Fangt mit dem Bereinigungscode von den Preisschildern (`price`, `revenue`) und vom Kartenterminal (`payment`, `stall_id`) an. Dann: Welche Verkäufe kommen in die Umschläge? Das steht in der Marktordnung an der Wand.
2. Marktordnung §5: Kartenzahlungen gehen direkt an die Bank, nur das **Bargeld** kommt in die Umschläge. Erst filtern, dann `df.groupby("stall_id")["revenue"].sum()`. `.idxmax()` liefert das Index-Label (hier die stall_id) des größten Werts.
3. Nach der Bereinigung: `expected = sales[sales["payment"] == "cash"].groupby("stall_id")["revenue"].sum()` und `top_stall = expected.idxmax()`.

### 5. Der Umschlagtisch

**Übt:** Tabellen mit `merge` über einen gemeinsamen Schlüssel verbinden, eine Series mit `reset_index` zur Tabelle machen, Spalten vergleichen, mit `groupby` ein Muster finden  
**Braucht:** 4. Das Kassenbuch (sein Ergebnis)  
**Daten:** [market.py](../../content/rooms/pandas-market/data/market.py)

**Aufgabe:**

> Das Büro hat jeden Umschlag gezählt. `handover.csv` nennt den Stand, die Euro im Umschlag (`envelope_eur`) und die Ausweisnummer (`badge`) der Hilfskraft, die ihn getragen hat. Dort stehen die Stände mit Namen, nicht mit ID; `stalls.csv` hat beides.
>
> Verbindet die Tabellen mit `merge` und berechnet, wie viel in jedem Umschlag fehlt (Soll minus Inhalt). Addiert die Fehlbeträge pro Ausweis und speichert sie in `by_badge` (eine Series mit einer Summe pro `badge`). Speichert den fehlenden Gesamtbetrag über alle Umschläge in `missing`.

<details><summary>Startcode</summary>

```python
import pandas as pd

# zuerst: was in jedem Umschlag sein müsste, eine Summe pro stall_id

stalls = pd.read_csv("stalls.csv")
handover = pd.read_csv("handover.csv")
print(handover.head())

# verbindet handover, stalls und das Soll jedes Umschlags und vergleicht dann

by_badge = None   # Fehlbetrag pro Ausweisnummer
missing = None    # Fehlbetrag über alle Umschläge, in Euro
```

</details>

**Musterlösung:**

```python
import pandas as pd

sales = pd.read_csv("sales.csv")
sales["price"] = sales["price"].str.replace("€", "").str.replace(",", ".").str.strip().astype(float)
sales["revenue"] = sales["qty"] * sales["price"]
sales["payment"] = sales["payment"].str.strip().str.lower().replace({"ec": "card"})
sales["stall_id"] = sales["stall_id"].str.strip().str.upper()
expected = sales[sales["payment"] == "cash"].groupby("stall_id")["revenue"].sum()

stalls = pd.read_csv("stalls.csv")
handover = pd.read_csv("handover.csv")

df = pd.merge(handover, stalls, on="stall")
df = pd.merge(df, expected.reset_index(name="expected"), on="stall_id")
df["short"] = df["expected"] - df["envelope_eur"]
print(df[["stall_id", "badge", "expected", "envelope_eur", "short"]].round(2))

by_badge = df.groupby("badge")["short"].sum()
missing = df["short"].sum()
print(by_badge.round(2))
print(round(missing, 2))
```

**Geprüftes Ergebnis** (`[round(float(missing), 2)] + [round(float(by_badge[b]), 2) for b in sorted(by_badge.index)]`):

```json
[160.0, -0.5, 0.0, 80.0, 80.0, 0.5]
```

**Zeigt nach dem Lösen:**

> Insgesamt fehlen **160,00 €**. Bei den Ausweisen **7** und **9** fehlen jeweils **80,00 €**, jeweils aus einem einzigen Umschlag. Bei Ausweis 12 fehlen 50 Cent, bei Ausweis 3 sind 50 Cent zu viel: Münzen, kein Diebstahl.

**Hinweise:**

1. Was in jedem Umschlag sein müsste, ist `expected` vom Kassenbuch: Fügt dessen ganzen Code (mit der Bereinigung) oben ein. `pd.merge(handover, stalls, on="stall")` ergänzt jeden Umschlag um die `stall_id`, und `expected.reset_index(name="expected")` macht aus `expected` eine Tabelle, die ihr `on="stall_id"` verbinden könnt.
2. Dann `df["short"] = df["expected"] - df["envelope_eur"]` und `df.groupby("badge")["short"].sum()`. Ein paar Cent hin oder her sind Münzen; sucht die Ausweise, bei denen wirklich etwas zusammenkommt.
3. `by_badge = df.groupby("badge")["short"].sum()`, dann `missing = df["short"].sum()`.

### 6. Gretas Bericht (Abschluss-Schloss)

**Übt:** Ergebnisse aus mehreren Analysen kombinieren und einen Fehlbetrag mit Belegen aus einer anderen Tabelle ausschließen  
**Braucht:** 1. Das Marktregister (sein Ergebnis), 5. Der Umschlagtisch (sein Ergebnis), 🔒 5. Der Umschlagtisch, 🔎 Helferplan

**Zahlenschloss** (öffnet mit `160`):

> Gretas Berichtsmappe hat ein dreistelliges Zahlenschloss. Ihr Zettel darauf: „Code = die fehlenden Euro insgesamt.“

**Aufgabe:**

> Greta will die Halle aufschließen, aber in ihren Bericht gehört erst ein Name.
>
> Wer hat das Geld genommen? Gebt den Vornamen ein.

**Antwort:** `Tobi`

**Hinweise:**

1. Bei zwei Ausweisen fehlen 80 €, jeweils aus einem Umschlag. Um welche Umschläge geht es?
2. Einer davon gehört zum Honigstand neben dem Brunnen, dessen 80 € die Kundin zurückgebracht hat (siehe Marktregister).
3. Ausweis 9 hat den Umschlag der Imkerei Sommer getragen: Dieser Fehlbetrag ist erklärt. Ausweis 7 hat den Umschlag vom Bienenhaus Okafor getragen, 80 € zu wenig und ohne Erklärung. Der Helferplan an der Wand sagt, wer Ausweis 7 trägt.

## Hinweise im Raum

### 🔎 Marktplan

*Gebraucht von: 1. Das Marktregister*

> KLEEBERGER SAMSTAGSMARKT · Platzplan
>
> Nordreihe: Plätze 1 bis 6. Südreihe: Plätze 7 bis 12.
>
> Der Brunnen steht mitten in der Nordreihe, **zwischen Platz 4 und Platz 5**.
>
> Marktbüro: Südostecke.

### 🔎 Ein Zettel im Marktbüro

*Gebraucht von: 1. Das Marktregister*

> An das Marktbüro!
>
> Die Frau am **Honigstand direkt neben dem Brunnen** hat mir Wechselgeld auf einen Hunderter herausgegeben, dabei hatte ich nur mit einem Zwanziger bezahlt! Die 80 Euro habe ich euch zurückgebracht.
>
> H. Albers

### 🔎 Preistafel

*Gebraucht von: 2. Preisschilder*

> PREISE
>
> Jeder Stand schreibt seine Preise anders: `2,50 €`, `€2.50`, `2.50` und `2,5` heißen alle zwei Euro fünfzig.
>
> Der Bürocomputer versteht nur `2.50`: ein Dezimal**punkt**, kein Euro-Zeichen, keine Leerzeichen.

### 🔎 Marktordnung

*Gebraucht von: 3. Das Kartenterminal, 4. Das Kassenbuch*

> MARKTORDNUNG (Auszug)
>
> §4 Kundinnen und Kunden zahlen bar oder mit Karte. Die Kartenterminals drucken `EC` für eine Girocard: Auch das ist eine **Kartenzahlung**.
>
> §5 Kartenzahlungen gehen direkt an die Bank. Um 14:00 Uhr holt eine Markthilfe das **Bargeld** jedes Stands in einem versiegelten Umschlag ab, schreibt ihre Ausweisnummer darauf und bringt ihn ins Büro.
>
> §6 Die Standbetreiber tragen jeden Verkauf, bar und mit Karte, in die Verkaufsliste ein.

### 🔎 Helferplan

*Gebraucht von: 6. Gretas Bericht*

> MARKTHILFEN · Samstag
>
> Ausweis 3: Greta Vogel (Marktleitung)
>
> Ausweis 5: Jule Arslan
>
> Ausweis 7: Tobi Wendt
>
> Ausweis 9: Ben Schuster
>
> Ausweis 12: Mia Roth

## Handbuch im Raum: 📖 Der pandas-Ordner des Marktbüros

**Laden und ansehen:** [`pd.read_csv("file.csv")`](https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html), [`df.head(n)  df.dtypes  len(df)`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.head.html), [`s.unique()  s.nunique()  s.value_counts()`](https://pandas.pydata.org/docs/reference/api/pandas.Series.value_counts.html)

**Auswählen und filtern:** [`df["col"]  df[["a", "b"]]`](https://pandas.pydata.org/docs/user_guide/indexing.html#basics), [`df[df["col"] == value]`](https://pandas.pydata.org/docs/user_guide/indexing.html#boolean-indexing), [`s.isin([a, b])`](https://pandas.pydata.org/docs/reference/api/pandas.Series.isin.html), [`s.iloc[0]`](https://pandas.pydata.org/docs/reference/api/pandas.Series.iloc.html)

**Textspalten bereinigen:** [`s.str.strip()`](https://pandas.pydata.org/docs/reference/api/pandas.Series.str.strip.html), [`s.str.lower()  s.str.upper()`](https://pandas.pydata.org/docs/reference/api/pandas.Series.str.lower.html), [`s.str.replace(old, new)`](https://pandas.pydata.org/docs/reference/api/pandas.Series.str.replace.html), [`s.replace({old: new})`](https://pandas.pydata.org/docs/reference/api/pandas.Series.replace.html), [`df["col"] = ...`](https://pandas.pydata.org/docs/getting_started/intro_tutorials/05_add_columns.html)

**Zahlen:** [`s.astype(float)`](https://pandas.pydata.org/docs/reference/api/pandas.Series.astype.html), [`df["a"] * df["b"]`](https://pandas.pydata.org/docs/getting_started/intro_tutorials/05_add_columns.html), [`s.sum()  s.max()  round(x, 2)`](https://pandas.pydata.org/docs/reference/api/pandas.Series.sum.html)

**Gruppieren und verbinden:** [`df.groupby("key")["col"].sum()`](https://pandas.pydata.org/docs/user_guide/groupby.html), [`s.idxmax()`](https://pandas.pydata.org/docs/reference/api/pandas.Series.idxmax.html), [`s.reset_index(name="col")`](https://pandas.pydata.org/docs/reference/api/pandas.Series.reset_index.html), [`pd.merge(left, right, on="key")`](https://pandas.pydata.org/docs/reference/api/pandas.merge.html)
