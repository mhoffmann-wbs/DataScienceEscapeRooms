# Generates data/train.sql for Night Train. Not bundled with the site.
# Standard library only. Run from this folder:  python3 generate_data.py
# After changing anything, rerun `npm run hash-answer -- sql-train --write` and
# `npm run walkthrough -- sql-train`, and update the numbers in the manifest's reveals.
import random

rng = random.Random(471)
DAY1, DAY2 = "2026-11-13", "2026-11-14"


def ts(hhmm):
    """'21:40' -> '2026-11-13 21:40'; times before noon belong to the morning after."""
    return f"{DAY1 if int(hhmm[:2]) >= 12 else DAY2} {hhmm}"


def minutes(hhmm):
    h, m = int(hhmm[:2]), int(hhmm[3:])
    return (h if h >= 12 else h + 24) * 60 + m


def hhmm(total):
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def sql_value(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, columns, rows):
    body = ",\n".join("  (" + ", ".join(sql_value(v) for v in row) + ")" for row in rows)
    return f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n{body};\n"


# --- Timetable: arrival and departure are actual times so far, planned times after that.
# Kleeberg's arrival is when the doors opened for boarding.
STATIONS = [
    (1, "Kleeberg", 0.0, "21:10", "21:40"),
    (2, "Brunnstadt", 88.0, "23:05", "23:09"),
    (3, "Felsach", 176.2, "00:50", "00:55"),
    (4, "Marienhall", 263.5, "03:10", "03:14"),
    (5, "Lindholm", 402.0, "06:05", None),
]

# --- Speed recorder: one row every 2 minutes, km and kmh.
# Halts as [start, end) in minutes; a row inside one reads 0 km/h.
HALTS = [
    ("21:30", "21:40", 0.0),  # Kleeberg
    ("23:05", "23:09", 88.0),  # Brunnstadt
    ("23:58", "00:03", 131.4),  # red signal before Ostheim
    ("00:50", "00:55", 176.2),  # Felsach
    ("01:52", "01:57", 214.3),  # the emergency brake
]
LOG_END = "02:40"
SLOW_ZONE = range(minutes("01:16"), minutes("01:24"))  # building site after Felsach


def halt_km(t):
    """The km of the halt the train stands in at minute t, or None while moving."""
    for i, (a, b, km) in enumerate(HALTS):
        # The first halt includes its end: the row at 21:40 is the departure itself.
        if minutes(a) <= t < minutes(b) or (i == 0 and t == minutes(b)):
            return km
    return None


def speed_rows():
    grid = list(range(minutes("21:30"), minutes(LOG_END) + 1, 2))
    kmh = {}
    # Each moving stretch is scaled so it covers the distance to the next halt. A row's speed
    # carries the train on for the 2 minutes until the next row.
    for (_, a_end, a_km), (b_start, _, b_km) in zip(HALTS, HALTS[1:] + [(LOG_END, None, None)]):
        stretch = [t for t in grid if minutes(a_end) <= t <= minutes(b_start) and halt_km(t) is None]
        if b_km is None:
            for i, t in enumerate(stretch):
                kmh[t] = 18 if i == 0 else 42 * rng.uniform(0.9, 1.1)
            continue
        n = len(stretch)
        profile = [0.12 if t in SLOW_ZONE else rng.uniform(0.9, 1.1) * min(1.0, (i + 1) / 3, (n - i) / 2.5)
                   for i, t in enumerate(stretch)]
        scale = (b_km - a_km) * 30 / sum(profile)
        for t, p in zip(stretch, profile):
            kmh[t] = p * scale
    pos = 0.0
    rows = []
    for t in grid:
        km = halt_km(t)
        if km is not None:
            pos = km
            rows.append((ts(hhmm(t)), round(pos, 1), 0))
        else:
            rows.append((ts(hhmm(t)), round(pos, 1), max(1, round(kmh[t]))))
            pos += kmh[t] * 2 / 60
    return rows


# --- Passengers. Compartment n of car c is c*10 + n; the card opens that compartment.
# board/alight are station names. Brenner and Vogt booked but never boarded.
PASSENGERS = [
    ("NJ-4711", "Amir Haddad", 1, 11, "Kleeberg", "Lindholm"),
    ("NJ-4712", "Sofie Lund", 1, 12, "Kleeberg", "Marienhall"),
    ("NJ-4714", "Mateo García", 1, 14, "Kleeberg", "Lindholm"),
    ("NJ-4715", "Ben Okoro", 1, 15, "Kleeberg", "Lindholm"),
    ("NJ-4721", "Johanna Beck", 2, 21, "Kleeberg", "Lindholm"),
    ("NJ-4722", "Kwame Mensah", 2, 22, "Kleeberg", "Lindholm"),
    ("NJ-4723", "Hanna Vogt", 2, 23, "Kleeberg", "Lindholm"),
    ("NJ-4725", "Elif Yıldız", 2, 25, "Kleeberg", "Marienhall"),
    ("NJ-4731", "Tobias Rehm", 3, 31, "Kleeberg", "Lindholm"),
    ("NJ-4732", "Marta Nowak", 3, 32, "Kleeberg", "Lindholm"),
    ("NJ-4733", "Henri Dubois", 3, 33, "Kleeberg", "Lindholm"),
    ("NJ-4734", "Konstantin Weber", 3, 34, "Kleeberg", "Lindholm"),
    ("NJ-4735", "Freya Olsen", 3, 35, "Brunnstadt", "Lindholm"),
    ("NJ-4741", "Daniel Cho", 4, 41, "Brunnstadt", "Lindholm"),
    ("NJ-4742", "Greta Albers", 4, 42, "Kleeberg", "Marienhall"),
    ("NJ-4744", "Ruth Abebe", 4, 44, "Brunnstadt", "Lindholm"),
    ("NJ-4745", "Lotte Krämer", 4, 45, "Kleeberg", "Lindholm"),
    ("NJ-4746", "Oskar Lind", 4, 46, "Felsach", "Lindholm"),
    ("NJ-4751", "Nina Petrović", 5, 51, "Felsach", "Lindholm"),
    ("NJ-4752", "Paul Brenner", 5, 52, "Kleeberg", "Lindholm"),
    ("NJ-4753", "Felix Arendt", 5, 53, "Brunnstadt", "Lindholm"),
    ("NJ-4755", "Leonie Sauer", 5, 55, "Kleeberg", "Lindholm"),
]
NO_SHOWS = {"Hanna Vogt", "Paul Brenner"}


def card(car, comp):
    return f"C{car}-{comp}"


def passenger_rows():
    return [(t, n, c, comp, card(c, comp), b, a) for t, n, c, comp, b, a in PASSENGERS]


# --- Conductor's handheld: every ticket once after each station, a few twice, one self-test.
def scan_rows():
    rows = []
    windows = {"Kleeberg": ("21:44", "22:20"), "Brunnstadt": ("23:12", "23:24"), "Felsach": ("00:58", "01:06")}
    for station, (a, b) in windows.items():
        group = [p for p in PASSENGERS if p[4] == station and p[1] not in NO_SHOWS]
        group.sort(key=lambda p: (p[2], p[3]))  # walking through the train
        span = minutes(b) - minutes(a)
        for i, p in enumerate(group):
            rows.append((ts(hhmm(minutes(a) + i * span // max(1, len(group) - 1))), p[0]))
    rows.append((ts("21:20"), "TEST-0000"))  # the handheld's self-test before departure
    rows.append((ts("23:20"), "NJ-4711"))  # a second look at Amir's ticket
    rows.append((ts("23:22"), "NJ-4722"))
    rows.sort()
    return [(i + 1, t, ticket) for i, (t, ticket) in enumerate(rows)]


# --- Card readers on compartment doors, gangway doors (locked at night) and washrooms.
def gangway_path(car_from, car_to):
    step = 1 if car_to > car_from else -1
    return [f"gangway {min(c, c + step)}|{max(c, c + step)}" for c in range(car_from, car_to, step)]


def walk(taps, cardid, start, car_from, car_to, spacing=1):
    """Taps for walking from one car to another, one gangway per `spacing` minutes."""
    t = minutes(start)
    for g in gangway_path(car_from, car_to):
        a, b = map(int, g.split()[1].split("|"))
        taps.append((t, cardid, a if car_to > car_from else b, g))
        t += spacing
    return t


BOARD_TIME = {"Kleeberg": ("21:14", "21:38"), "Brunnstadt": ("23:06", "23:09"), "Felsach": ("00:51", "00:55")}


def tap_rows():
    taps = []  # (minute, card, car, reader)
    special = {"C3-34", "C5-52", "C4-45", "C2-23"}
    for t, name, c, comp, b, a in PASSENGERS:
        if name in NO_SHOWS:
            continue
        cid = card(c, comp)
        if cid in special:
            continue
        lo, hi = BOARD_TIME[b]
        board = rng.randint(minutes(lo), minutes(hi))
        taps.append((board, cid, c, f"door {comp}"))
        t0 = board + rng.randint(8, 25)
        # A trip to the dining car (open until 00:30) for some, the washroom for most.
        if t0 < minutes("00:00") and rng.random() < 0.6:
            back = walk(taps, cid, hhmm(t0), c, 6) + rng.randint(20, 45)
            back = walk(taps, cid, hhmm(back), 6, c)
            taps.append((back + 1, cid, c, f"door {comp}"))
            t0 = back + rng.randint(10, 30)
        # Everyone in bed by 01:08: nobody else falls silent near the brake stop.
        if rng.random() < 0.7 and t0 + 8 <= minutes("01:08"):
            taps.append((t0, cid, c, f"washroom {c}"))
            t0 += rng.randint(3, 8)
        bed = min(max(t0, board + 5), minutes("01:08"))
        taps.append((bed, cid, c, f"door {comp}"))
    # Night owls: still about after the brake stop, with taps inside the half hour before it too.
    taps += [
        (minutes("01:38"), "C3-35", 3, "washroom 3"),
        (minutes("02:20"), "C3-35", 3, "door 35"),
        (minutes("01:50"), "C3-33", 3, "washroom 3"),
        (minutes("02:05"), "C3-33", 3, "door 33"),
        (minutes("01:27"), "C1-14", 1, "washroom 1"),
        (minutes("02:31"), "C1-14", 1, "washroom 1"),
    ]
    # Konstantin Weber, compartment 34.
    taps.append((minutes("21:22"), "C3-34", 3, "door 34"))
    t = walk(taps, "C3-34", "22:12", 3, 6)
    t = walk(taps, "C3-34", "23:16", 6, 3)
    taps.append((t, "C3-34", 3, "door 34"))
    taps.append((minutes("00:32"), "C3-34", 3, "washroom 3"))
    taps.append((minutes("00:36"), "C3-34", 3, "door 34"))
    taps.append((minutes("01:49"), "C3-34", 3, "door 34"))
    # Compartment 52: booked for Paul Brenner, used by someone else.
    taps.append((minutes("21:31"), "C5-52", 5, "door 52"))
    walk(taps, "C5-52", "22:20", 5, 6)
    walk(taps, "C5-52", "23:25", 6, 5)
    taps.append((minutes("23:27"), "C5-52", 5, "door 52"))
    taps.append((minutes("01:44"), "C5-52", 5, "gangway 4|5"))
    taps.append((minutes("01:46"), "C5-52", 4, "gangway 3|4"))
    # Lotte Krämer, compartment 45: goes to bed late, and stays there.
    taps.append((minutes("21:26"), "C4-45", 4, "door 45"))
    t = walk(taps, "C4-45", "23:40", 4, 6)
    t = walk(taps, "C4-45", "00:24", 6, 4)
    taps.append((t, "C4-45", 4, "door 45"))
    taps.append((minutes("01:24"), "C4-45", 4, "washroom 4"))
    taps.append((minutes("01:31"), "C4-45", 4, "door 45"))
    # Compartment 23: booked for Hanna Vogt; a fare dodger found the card in the door.
    taps.append((minutes("23:12"), "C2-23", 2, "door 23"))
    t = walk(taps, "C2-23", "23:36", 2, 6)
    t = walk(taps, "C2-23", "00:21", 6, 2)
    taps.append((t, "C2-23", 2, "door 23"))
    taps.append((minutes("02:12"), "C2-23", 2, "washroom 2"))
    taps.append((minutes("02:14"), "C2-23", 2, "door 23"))
    # Staff: S-01 the sleeping-car attendant, S-02 the conductor.
    taps += [
        (minutes("21:12"), "S-01", 3, "door 31"),
        (minutes("22:40"), "S-01", 4, "door 44"),
        (minutes("23:30"), "S-01", 5, "door 53"),
        (minutes("01:02"), "S-01", 5, "door 51"),
        (minutes("02:38"), "S-01", 3, "gangway 3|4"),
        (minutes("02:41"), "S-01", 3, "door 34"),
        (minutes("22:21"), "S-02", 5, "gangway 5|6"),
        (minutes("23:26"), "S-02", 3, "gangway 3|4"),
        (minutes("01:07"), "S-02", 5, "gangway 5|6"),
        (minutes("02:16"), "S-02", 2, "gangway 2|3"),
    ]
    # Nobody else may fall silent in the hour around the brake stop.
    last = {}
    for t, cid, _, _ in taps:
        last[cid] = max(last.get(cid, 0), t)
    quiet = [cid for cid, t in last.items() if minutes("01:10") <= t <= minutes("02:00")]
    assert sorted(quiet) == ["C3-34", "C4-45", "C5-52"], quiet
    taps.sort()
    return [(i + 1, ts(hhmm(t)), cid, car, reader) for i, (t, cid, car, reader) in enumerate(taps)]


# --- Dining car till: orders go on a compartment card's tab, paid with a bank card (payer).
MENU = [("coffee", 3.20), ("tea", 2.80), ("hot chocolate", 3.60), ("beer", 4.50), ("red wine", 6.20),
        ("goulash soup", 7.90), ("pretzel", 2.40), ("cheese plate", 8.50), ("water", 2.60)]


def order_rows():
    rows = []
    for t, name, c, comp, b, a in PASSENGERS:
        if name in NO_SHOWS or b != "Kleeberg" or rng.random() < 0.35:
            continue
        for _ in range(rng.randint(1, 3)):
            item, price = rng.choice(MENU)
            rows.append((ts(hhmm(rng.randint(minutes("21:50"), minutes("00:25")))), card(c, comp), item, price, name))
    # Johanna pays for Kwame's beer.
    rows.append((ts("22:47"), "C2-22", "beer", 4.50, "Johanna Beck"))
    # Compartment 52.
    rows += [
        (ts("22:24"), "C5-52", "goulash soup", 7.90, "Ines Hartmann"),
        (ts("22:31"), "C5-52", "red wine", 6.20, "Ines Hartmann"),
        (ts("23:02"), "C5-52", "hot chocolate", 3.60, "Konstantin Weber"),
        (ts("23:02"), "C5-52", "hot chocolate", 3.60, "Konstantin Weber"),
    ]
    # Compartment 23.
    rows += [
        (ts("23:41"), "C2-23", "beer", 4.50, "Bernd Kessler"),
        (ts("23:58"), "C2-23", "pretzel", 2.40, "Bernd Kessler"),
        (ts("00:12"), "C2-23", "beer", 4.50, "Bernd Kessler"),
    ]
    rows.sort(key=lambda r: minutes(r[0][-5:]))
    return [(i + 1, *r) for i, r in enumerate(rows)]


# --- Outside doors: A on the left, B on the right. Released only at a platform.
def door_rows():
    rows = []
    def ev(t, car, door, event):
        rows.append((ts(t), car, door, event))
    for car in range(1, 7):
        ev(hhmm(minutes("21:12") + car), car, "A", "open")
        ev(hhmm(minutes("21:37") + car // 4), car, "A", "close")
    for car in (2, 4, 5):
        ev("23:05", car, "B", "open")
        ev("23:08", car, "B", "close")
    for car in (3, 4, 5, 6):
        ev("00:51" if car != 6 else "00:50", car, "A", "open")
        ev("00:54", car, "A", "close")
    ev("01:53", 3, "B", "open")
    ev("01:55", 3, "B", "close")
    rows.sort(key=lambda r: (minutes(r[0][-5:]), r[1]))
    return [(i + 1, *r) for i, r in enumerate(rows)]


def main():
    out = [
        "-- Night train EN 471 \"Aurora\", Kleeberg to Lindholm, the night of 13 to 14 November 2026.",
        "-- Generated by generate_data.py; built fresh for every query.",
        "-- Times are text in the form 'YYYY-MM-DD HH:MM', so they compare and sort correctly.",
        "",
        "CREATE TABLE stations (\n  seq INTEGER PRIMARY KEY,\n  station TEXT NOT NULL,\n  km REAL NOT NULL,\n"
        "  arrival TEXT,   -- actual so far, planned after that; at Kleeberg: doors open for boarding\n"
        "  departure TEXT\n);\n",
        insert("stations", ["seq", "station", "km", "arrival", "departure"],
               [(s, n, k, ts(a), ts(d) if d else None) for s, n, k, a, d in STATIONS]),
        "CREATE TABLE passengers (\n  ticket_id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  car INTEGER NOT NULL,\n"
        "  compartment INTEGER NOT NULL,\n  card TEXT NOT NULL UNIQUE,  -- the card that opens the compartment\n"
        "  board TEXT NOT NULL,\n  alight TEXT NOT NULL\n);\n",
        insert("passengers", ["ticket_id", "name", "car", "compartment", "card", "board", "alight"], passenger_rows()),
        "CREATE TABLE scans (\n  scan_id INTEGER PRIMARY KEY,\n  time TEXT NOT NULL,\n  ticket_id TEXT NOT NULL REFERENCES passengers (ticket_id)\n);\n",
        insert("scans", ["scan_id", "time", "ticket_id"], scan_rows()),
        "CREATE TABLE speed (\n  time TEXT PRIMARY KEY,\n  km REAL NOT NULL,\n  kmh INTEGER NOT NULL\n);\n",
        insert("speed", ["time", "km", "kmh"], speed_rows()),
        "CREATE TABLE doors (\n  event_id INTEGER PRIMARY KEY,\n  time TEXT NOT NULL,\n  car INTEGER NOT NULL,\n"
        "  door TEXT NOT NULL,  -- 'A' left, 'B' right\n  event TEXT NOT NULL  -- 'open' or 'close'\n);\n",
        insert("doors", ["event_id", "time", "car", "door", "event"], door_rows()),
        "CREATE TABLE taps (\n  tap_id INTEGER PRIMARY KEY,\n  time TEXT NOT NULL,\n  card TEXT NOT NULL REFERENCES passengers (card),  -- compartment card, or S-.. for staff\n"
        "  car INTEGER NOT NULL,\n  reader TEXT NOT NULL\n);\n",
        insert("taps", ["tap_id", "time", "card", "car", "reader"], tap_rows()),
        "CREATE TABLE orders (\n  order_id INTEGER PRIMARY KEY,\n  time TEXT NOT NULL,\n  card TEXT NOT NULL REFERENCES passengers (card),  -- the tab it went on\n"
        "  item TEXT NOT NULL,\n  price REAL NOT NULL,\n  payer TEXT NOT NULL  -- name on the bank card that paid\n);\n",
        insert("orders", ["order_id", "time", "card", "item", "price", "payer"], order_rows()),
    ]
    with open("data/train.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(out))


if __name__ == "__main__":
    main()
