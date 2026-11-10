# Generates data/cinema.sql for The Last Show. Not bundled with the site.
# Standard library only. Run from this folder:  python3 generate_data.py
# After changing anything, rerun `npm run hash-answer -- sql-cinema --write` and
# `npm run walkthrough -- sql-cinema`, and update the numbers in the manifest's reveals.
import datetime
import random
import sqlite3

rng = random.Random(1957)
DAYS = [datetime.date(2026, 11, 2) + datetime.timedelta(days=i) for i in range(14)]  # Mon 2 to Sun 15 November
SHIFT_CHANGE = 18 * 60 + 15  # the evening shift starts at 18:15

HALLS = [(1, "Lumen", 200), (2, "Studio", 120)]
SLOTS = [  # hall, start, film
    (1, "15:00", "Paper Moons"),
    (1, "18:00", "Salt and Silver"),
    (1, "21:00", "The Long Winter"),
    (2, "16:30", "Nine Lives"),
    (2, "19:00", "Kleeberg Blues"),
    (2, "21:30", "Midnight Garden"),
]

STAFF = [
    (1, "Edith Brandauer", "owner"),
    (2, "Ben Adeyemi", "usher"),
    (3, "Lukas Feld", "front of house"),
    (4, "Selin Aydın", "front of house"),
    (5, "Tobias Rehm", "front of house"),
    (6, "Ida Sommer", "front of house"),
    (7, "Jonas Pfeiffer", "front of house"),
    (8, "Marta Kowalski", "front of house"),
]
ID = {name.split()[0]: sid for sid, name, _ in STAFF}
POSTS = ["till 1", "till 2", "snack bar", "drinks bar", "door"]
COUNTERS = ["snack bar", "drinks bar"]

# The skimming: on these late shows in the Studio, Tobias sold tickets at till 2, took the cash
# and deleted the sales. Each burst is one group at the counter, so it leaves one gap in till 2's roll.
SKIMS = {
    "2026-11-06": {"sold": 96, "bursts": [4, 5, 3, 5]},
    "2026-11-07": {"sold": 101, "bursts": [6, 4, 5, 4]},
    "2026-11-14": {"sold": 113, "bursts": [5, 6, 4, 6]},
}
# On those evenings Tobias was planned at the snack bar and took till 2; the one planned at till 2 sold snacks.
SKIM_ROTA = {"2026-11-06": "Lukas", "2026-11-07": "Lukas", "2026-11-14": "Selin"}
# The decoy, the same shape on the same evenings: Marta was planned at the drinks bar and took till 1,
# the one planned at till 1 served drinks. Only the printers (all gaps on till 2) tell the two swaps apart.
DECOY_ROTA = {"2026-11-06": "Jonas", "2026-11-07": "Jonas", "2026-11-14": "Ida"}
# One harmless swap on another evening, so swapping posts looks normal: Jonas takes the snack bar from Marta.
OTHER_SWAP = ("2026-11-12", "Marta", "Jonas")


def sql_value(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, columns, rows):
    body = ",\n".join("  (" + ", ".join(sql_value(v) for v in row) + ")" for row in rows)
    return f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n{body};\n"


def minutes(hhmm):
    return int(hhmm[:2]) * 60 + int(hhmm[3:])


def stamp(day, total, seconds=None):
    t = f"{day} {total // 60:02d}:{total % 60:02d}"
    return t if seconds is None else f"{t}:{seconds:02d}"


# --- Screenings
def screenings():
    rows = []
    for day in DAYS:
        for hall, start, film in SLOTS:
            rows.append((len(rows) + 1, f"{day} {start}", hall, film))
    return rows


SCREENINGS = screenings()


def attendance(day, hall, start):
    weekend = day.weekday() >= 4
    evening = minutes(start) >= 18 * 60
    seats = dict((h, s) for h, _, s in HALLS)[hall]
    base = (0.45 if evening else 0.2) + (0.2 if weekend else 0)
    return max(8, min(seats - 5, round(seats * rng.uniform(base - 0.12, base + 0.12))))


# --- Rota: planned posts per day and shift. `worked` is who really stood where.
# Its own random stream, so the tickets, the tally and the clicker don't depend on it.
def rota():
    rr = random.Random(1958)
    planned, worked = {}, {}
    pool = ["Lukas", "Selin", "Tobias", "Ida", "Jonas", "Marta"]
    for day in DAYS:
        d = str(day)
        for shift in ["afternoon", "evening"]:
            fixed = {}
            if d in SKIM_ROTA:
                fixed = {"snack bar": "Tobias", "drinks bar": "Marta"}
                if shift == "evening":
                    fixed |= {"till 2": SKIM_ROTA[d], "till 1": DECOY_ROTA[d]}
            elif d == OTHER_SWAP[0] and shift == "evening":
                fixed = {"snack bar": OTHER_SWAP[1], "till 1": OTHER_SWAP[2]}
            if shift == "evening":
                fixed["door"] = "Ben"
            while True:
                rest = rr.sample([p for p in pool if p not in fixed.values()], len(POSTS) - len(fixed))
                post = dict(fixed)
                post |= dict(zip([p for p in POSTS if p not in fixed], rest))
                # Tobias and Marta are only planned at the evening counters on the skimming nights.
                if d not in SKIM_ROTA and shift == "evening" and (post["snack bar"] == "Tobias" or post["drinks bar"] == "Marta"):
                    continue
                break
            planned[(d, shift)] = post
            real = dict(post)
            if d in SKIM_ROTA and shift == "evening":
                real["till 2"], real["snack bar"] = "Tobias", SKIM_ROTA[d]
                real["till 1"], real["drinks bar"] = "Marta", DECOY_ROTA[d]
            if d == OTHER_SWAP[0] and shift == "evening":
                real["till 1"], real["snack bar"] = OTHER_SWAP[1], OTHER_SWAP[2]
            worked[(d, shift)] = real
    return planned, worked


PLANNED, WORKED = rota()


def rota_rows():
    return [(d, shift, post, ID[name]) for (d, shift), posts in PLANNED.items() for post, name in posts.items()]


# --- Tickets: every till prints on its own roll, till 1 from 10001, till 2 from 20001.
def tickets_and_tally():
    sales = []  # (till, sold_at minutes, day, seq, screening_id, price, skimmed)
    seq = 0
    tally = []

    def group(day, total, till, sid, price, size, skimmed=False):
        nonlocal seq
        for _ in range(size):
            seq += 1
            p = price if skimmed or rng.random() > 0.2 else 6.5  # reduced: students and pensioners
            sales.append((till, total, day, seq, sid, p, skimmed))

    for sid, starts, hall, _ in SCREENINGS:
        day, start = starts[:10], starts[11:]
        date = datetime.date.fromisoformat(day)
        skim = SKIMS.get(day) if (hall, start) == (2, "21:30") else None
        sold = skim["sold"] if skim else attendance(date, hall, start)
        price = 9.5 if minutes(start) >= 18 * 60 else 7.5
        left = sold
        if skim:
            # A real sale at till 2 just before every burst, so no two bursts merge into one gap.
            bursts = [minutes(start) - 28 + i * 8 + rng.randint(1, 4) for i in range(len(skim["bursts"]))]
            for t in bursts:
                group(day, t - 1, 2, sid, price, 2)
            left -= 2 * len(bursts)
        while left > 0:
            size = min(left, rng.choice([1, 2, 2, 2, 3, 4]))
            group(day, minutes(start) - rng.randint(-5, 60), rng.choice([1, 2]), sid, price, size)
            left -= size
        if skim:
            for t, size in zip(bursts, skim["bursts"]):
                group(day, t, 2, sid, price, size, skimmed=True)
        noise = 0 if skim else rng.choice([-2, -1, 0, 0, 0, 0, 1, 1, 2])
        tally.append((sid, sold + (sum(skim["bursts"]) if skim else 0) + noise))

    rows = []
    for till in (1, 2):
        roll = sorted((s for s in sales if s[0] == till), key=lambda s: (s[2], s[1], s[3]))
        for n, (_, total, day, _, sid, price, skimmed) in enumerate(roll):
            if not skimmed:
                rows.append((till * 10000 + 1 + n, stamp(day, total), sid, till, price))
    rows.sort()
    return rows, tally


TICKETS, TALLY = tickets_and_tally()


# --- Foyer: the snack bar and the drinks bar ring up on one till system, which logs whoever is
# signed in at that counter, so whoever really stood there.
ITEMS = {
    "snack bar": [("popcorn small", 4.5), ("popcorn large", 6.5), ("nachos", 5.5), ("ice cream", 3.0)],
    "drinks bar": [("cola", 3.5), ("lemonade", 3.5), ("beer", 4.0), ("wine", 5.0)],
}


def snack_rows():
    sold = {}
    for _, _, sid, _, _ in TICKETS:
        sold[sid] = sold.get(sid, 0) + 1
    rows = []
    for sid, starts, _, _ in SCREENINGS:
        day, start = starts[:10], minutes(starts[11:])
        for _ in range(round(sold.get(sid, 0) * rng.uniform(0.35, 0.55))):
            total = start + rng.randint(-30, 10)
            shift = "afternoon" if total < SHIFT_CHANGE else "evening"
            counter = rng.choice(COUNTERS)
            item, price = rng.choice(ITEMS[counter])
            rows.append((stamp(day, total), counter, item, price, ID[WORKED[(day, shift)][counter]]))
    rows.sort()
    return [(i + 1, *r) for i, r in enumerate(rows)]


# --- The fire marshal's clicker, only on Saturday 14 November in the Studio: +1 in, -1 out.
def click_rows():
    day = "2026-11-14"
    admitted = next(n for sid, n in TALLY if SCREENINGS[sid - 1][1] == f"{day} 21:30")
    events = []  # (seconds since midnight, delta)
    hms = lambda h, m, s=0: h * 3600 + m * 60 + s
    for _ in range(admitted - 2):
        events.append((rng.randint(hms(21, 5), hms(21, 44, 59)), 1))
    for _ in range(2):  # walked out of the film for good
        events.append((rng.randint(hms(21, 48), hms(21, 53)), -1))
    for _ in range(2):  # latecomers, after the walk-outs
        events.append((rng.randint(hms(21, 56), hms(22, 2)), 1))
    for _ in range(6):  # out to the toilet and back
        t = rng.randint(hms(22, 10), hms(23, 0))
        events += [(t, -1), (t + rng.randint(180, 480), 1)]
    inside = sum(d for _, d in events)
    for _ in range(inside):
        events.append((rng.randint(hms(23, 38), hms(23, 50, 59)), -1))
    events.sort()
    seen = set()
    rows = []
    for t, delta in events:
        while t in seen:  # one click per second at most, so the running total has no ties
            t += 1
        seen.add(t)
        rows.append((t, delta))
    rows.sort()
    return [(i + 1, f"{day} {t // 3600:02d}:{t // 60 % 60:02d}:{t % 60:02d}", d) for i, (t, d) in enumerate(rows)]


def main():
    out = [
        "-- Kino Lumen, Kleeberg: the two weeks from Monday 2 to Sunday 15 November 2026.",
        "-- Generated by generate_data.py; built fresh for every query.",
        "-- Times are text in the form 'YYYY-MM-DD HH:MM', so they compare and sort correctly.",
        "",
        "CREATE TABLE halls (\n  hall INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  seats INTEGER NOT NULL\n);\n",
        insert("halls", ["hall", "name", "seats"], HALLS),
        "CREATE TABLE screenings (\n  screening_id INTEGER PRIMARY KEY,\n  starts TEXT NOT NULL,\n"
        "  hall INTEGER NOT NULL REFERENCES halls (hall),\n  film TEXT NOT NULL\n);\n",
        insert("screenings", ["screening_id", "starts", "hall", "film"], SCREENINGS),
        "CREATE TABLE tickets (\n  ticket_no INTEGER PRIMARY KEY,  -- printed on the ticket; each till has its own roll\n"
        "  sold_at TEXT NOT NULL,\n  screening_id INTEGER NOT NULL REFERENCES screenings (screening_id),\n"
        "  till INTEGER NOT NULL,\n  price REAL NOT NULL\n);\n",
        insert("tickets", ["ticket_no", "sold_at", "screening_id", "till", "price"], TICKETS),
        "CREATE TABLE tally (\n  screening_id INTEGER PRIMARY KEY REFERENCES screenings (screening_id),\n"
        "  admitted INTEGER NOT NULL  -- stubs Ben tore at the door\n);\n",
        insert("tally", ["screening_id", "admitted"], TALLY),
        "CREATE TABLE staff (\n  staff_id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  role TEXT NOT NULL\n);\n",
        insert("staff", ["staff_id", "name", "role"], STAFF),
        "CREATE TABLE rota (\n  day TEXT NOT NULL,  -- 'YYYY-MM-DD'\n  shift TEXT NOT NULL,  -- 'afternoon' or 'evening'\n"
        "  post TEXT NOT NULL,  -- 'till 1', 'till 2', 'snack bar', 'drinks bar' or 'door'\n"
        "  staff_id INTEGER NOT NULL REFERENCES staff (staff_id),\n  PRIMARY KEY (day, shift, post)\n);\n",
        insert("rota", ["day", "shift", "post", "staff_id"], rota_rows()),
        "CREATE TABLE snack_sales (\n  sale_id INTEGER PRIMARY KEY,\n  sold_at TEXT NOT NULL,\n"
        "  counter TEXT NOT NULL,  -- 'snack bar' or 'drinks bar'\n  item TEXT NOT NULL,\n"
        "  price REAL NOT NULL,\n  staff_id INTEGER NOT NULL REFERENCES staff (staff_id)  -- signed in at that counter\n);\n",
        insert("snack_sales", ["sale_id", "sold_at", "counter", "item", "price", "staff_id"], snack_rows()),
        "CREATE TABLE clicks (\n  click_id INTEGER PRIMARY KEY,\n  time TEXT NOT NULL,  -- 'YYYY-MM-DD HH:MM:SS'\n"
        "  delta INTEGER NOT NULL  -- +1 someone came in, -1 someone went out\n);\n",
        insert("clicks", ["click_id", "time", "delta"], click_rows()),
    ]
    sql = "\n".join(out)
    check(sql)
    with open("data/cinema.sql", "w", encoding="utf-8") as f:
        f.write(sql)


def check(sql):
    """The room's results, so a change to the generator can't quietly break a station."""
    db = sqlite3.connect(":memory:")
    db.executescript(sql)
    q = lambda s: db.execute(s).fetchall()
    over = q("""SELECT s.starts, COUNT(t.ticket_no), y.admitted FROM screenings s JOIN tally y USING (screening_id)
                LEFT JOIN tickets t USING (screening_id) GROUP BY s.screening_id HAVING y.admitted - COUNT(t.ticket_no) > 2""")
    assert [r[0] for r in over] == [f"{d} 21:30" for d in SKIMS], over
    gaps = q("""SELECT till, ticket_no FROM tickets t WHERE NOT EXISTS (SELECT 1 FROM tickets u WHERE u.ticket_no = t.ticket_no + 1)
                AND t.ticket_no < (SELECT MAX(ticket_no) FROM tickets u WHERE u.till = t.till)""")
    assert len(gaps) == sum(len(s["bursts"]) for s in SKIMS.values()) and {g[0] for g in gaps} == {2}, gaps
    peak = q("SELECT MAX(n) FROM (SELECT SUM(delta) OVER (ORDER BY time) AS n FROM clicks)")[0][0]
    assert peak == admitted_14th() - 2 and peak > 120, peak
    nights = "('2026-11-06', '2026-11-07', '2026-11-14')"
    late = q(f"""SELECT date(sold_at), counter, name FROM snack_sales JOIN staff USING (staff_id)
                WHERE date(sold_at) IN {nights} AND time(sold_at) >= '18:15' GROUP BY 1, 2, 3""")
    full = {"Jonas": "Jonas Pfeiffer", "Ida": "Ida Sommer", "Lukas": "Lukas Feld", "Selin": "Selin Aydın"}
    assert late == [(d, c, full[n]) for d in SKIM_ROTA for c, n in [("drinks bar", DECOY_ROTA[d]), ("snack bar", SKIM_ROTA[d])]], late
    for who in (5, 8):  # Tobias and Marta sold in the afternoons of those days, which looks like an alibi
        days = {r[0] for r in q(f"SELECT DISTINCT date(sold_at) FROM snack_sales WHERE staff_id = {who}")}
        assert set(SKIM_ROTA) <= days, (who, days)
    # Planned at a counter on all three evenings but sold nothing there: Tobias and Marta, the decoy.
    absent = q(f"""SELECT r.day, r.post, s.name FROM rota r JOIN staff s USING (staff_id)
                   WHERE r.shift = 'evening' AND r.post IN ('snack bar', 'drinks bar') AND r.day IN {nights}
                   AND NOT EXISTS (SELECT 1 FROM snack_sales x WHERE x.staff_id = r.staff_id AND x.counter = r.post
                                   AND date(x.sold_at) = r.day AND time(x.sold_at) >= '18:15')""")
    assert sorted({r[2] for r in absent}) == ["Marta Kowalski", "Tobias Rehm"] and len(absent) == 6, absent
    print("ok: overfull", [r[1:] for r in over], "gaps", len(gaps), "peak", peak)


def admitted_14th():
    return next(n for sid, n in TALLY if SCREENINGS[sid - 1][1] == "2026-11-14 21:30")


if __name__ == "__main__":
    main()
