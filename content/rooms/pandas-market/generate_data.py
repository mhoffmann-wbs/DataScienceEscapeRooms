# Generates data/market.py for Market Day. Not bundled with the site.
# Standard library only. Run from this folder:  python3 generate_data.py
# After changing anything, rerun `npm run hash-answer -- pandas-market --write` and
# `npm run walkthrough -- pandas-market`, and update the numbers in the manifest's reveals.
import csv
import io
import random

rng = random.Random(1207)

# stall_id, stall, owner, product, pitch
STALLS = [
    ("S01", "Hof Linde", "Jonas Linde", "vegetables", 1),
    ("S02", "Bäckerei Krume", "Ayşe Kaya", "bread", 2),
    ("S03", "Käserei Alpweide", "Marco Bianchi", "cheese", 3),
    ("S04", "Imkerei Sommer", "Lena Sommer", "honey", 4),
    ("S05", "Obstgarten Petersen", "Hanne Petersen", "fruit", 5),
    ("S06", "Blumen Wild", "Emil Wild", "flowers", 6),
    ("S07", "Bienenhaus Okafor", "Grace Okafor", "honey", 9),
    ("S08", "Eierhof Brandt", "Paul Brandt", "eggs", 7),
    ("S09", "Kräuter & Co", "Sofia Lindqvist", "herbs", 8),
    ("S10", "Mosterei Apfelgrün", "Tim Berger", "juice", 10),
    ("S11", "Räucherei Hansen", "Nils Hansen", "fish", 11),
    ("S12", "Biohof Mertens", "Rosa Mertens", "vegetables", 12),
]

ITEMS = {
    "vegetables": [("carrots", 1.80), ("potatoes 1 kg", 2.50), ("lettuce", 1.20), ("tomatoes 500 g", 3.40)],
    "bread": [("sourdough loaf", 4.50), ("bread roll", 0.60), ("pretzel", 1.10)],
    "cheese": [("mountain cheese 200 g", 5.90), ("goat cheese", 4.20)],
    "honey": [("blossom honey", 7.50), ("forest honey", 8.90), ("beeswax candle", 5.00)],
    "fruit": [("apples 1 kg", 2.80), ("plums 500 g", 3.20), ("pears 1 kg", 3.00)],
    "flowers": [("bouquet", 12.00), ("sunflowers", 2.50)],
    "eggs": [("eggs, 6", 2.40), ("eggs, 10", 3.90)],
    "herbs": [("basil pot", 2.20), ("herb bundle", 1.50)],
    "juice": [("apple juice 1 l", 3.50), ("cider", 4.80)],
    "fish": [("smoked trout", 6.50), ("smoked salmon", 5.90)],
}

# Every stall writes prices its own way (see the price board clue).
def price_text(price, style):
    euros = f"{price:.2f}"
    if style == 0:
        return euros.replace(".", ",") + " €"
    if style == 1:
        return "€" + euros
    if style == 2:
        return euros
    return f"{price:g}".replace(".", ",")

CASH = ["cash", "cash", "cash", "Cash", "CASH", "cash "]
CARD = ["card", "card", "Card", "EC", "EC", "card "]

rows = []
for i, (sid, _name, _owner, product, _pitch) in enumerate(STALLS):
    style = i % 4
    n = rng.randint(14, 24)
    for _ in range(n):
        minute = rng.randint(8 * 60, 14 * 60 - 1)
        item, price = rng.choice(ITEMS[product])
        qty = rng.choice([1, 1, 1, 2, 2, 3, 4])
        cash = rng.random() < 0.62
        payment = rng.choice(CASH if cash else CARD)
        r = rng.random()
        stall_id = sid.lower() if r < 0.08 else f" {sid}" if r < 0.14 else f"{sid} " if r < 0.18 else sid
        rows.append({
            "time": f"{minute // 60:02d}:{minute % 60:02d}",
            "stall_id": stall_id,
            "item": item,
            "qty": qty,
            "price": price_text(price, style),
            "payment": payment,
            "_cash": cash,
            "_sid": sid,
            "_price": price,
        })
rows.sort(key=lambda r: r["time"])

cash_by_stall = {sid: 0.0 for sid, *_ in STALLS}
for r in rows:
    if r["_cash"]:
        cash_by_stall[r["_sid"]] += r["qty"] * r["_price"]
cash_by_stall = {k: round(v, 2) for k, v in cash_by_stall.items()}

# Who carried each stall's envelope to the office. Badge 7 (Tobi) took €80 from Bienenhaus Okafor's
# envelope, the honey stall at pitch 9. Imkerei Sommer, the honey stall next to the fountain, gave a
# customer €80 too much change, and the customer brought it back to the office (the complaint clue),
# so its envelope, carried by badge 9 (Ben), is €80 short too, honestly. Two honey envelopes, both €80
# short: only the market register's stall next to the fountain says which shortfall is explained.
# Badges 7 and 9 carry four envelopes each, so counting envelopes doesn't name the skimmer either.
# A dropped coin at badge 12 and a stall that didn't take its change at badge 3 are honest noise.
BADGE = {"S02": 3, "S10": 5, "S01": 9, "S05": 9, "S04": 9, "S09": 9, "S11": 12, "S12": 12,
         "S03": 7, "S06": 7, "S07": 7, "S08": 7}
SKIM = {"S07": 80.0, "S04": 80.0, "S12": 0.50, "S02": -0.50}
handover = []
for sid, name, *_ in STALLS:
    handover.append({"stall": name, "envelope_eur": round(cash_by_stall[sid] - SKIM.get(sid, 0.0), 2), "badge": BADGE[sid]})
rng.shuffle(handover)

def to_csv(records, fields):
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    w.writerows(records)
    return out.getvalue()

stalls_csv = to_csv([dict(zip(["stall_id", "stall", "owner", "product", "pitch"], s)) for s in STALLS], ["stall_id", "stall", "owner", "product", "pitch"])
sales_csv = to_csv(rows, ["time", "stall_id", "item", "qty", "price", "payment"])
handover_csv = to_csv(handover, ["stall", "envelope_eur", "badge"])

with open("data/market.py", "w", encoding="utf-8") as f:
    f.write("# Kleeberg farmers' market, Saturday. Writes the market's three CSV files, so your\n")
    f.write("# code can read them with pd.read_csv(...). Loaded before your code runs.\n")
    for fname, text in [("stalls.csv", stalls_csv), ("sales.csv", sales_csv), ("handover.csv", handover_csv)]:
        f.write(f'\nwith open("{fname}", "w", encoding="utf-8") as _f:\n    _f.write("""\\\n{text}""")\n')
    f.write("\nimport pandas as pd\n")

total = round(sum(r["qty"] * r["_price"] for r in rows), 2)
n_cash = sum(r["_cash"] for r in rows)
print("rows", len(rows), "total", total, "cash", n_cash, "card", len(rows) - n_cash)
print("cash total", round(sum(cash_by_stall.values()), 2), "top", max(cash_by_stall, key=cash_by_stall.get))
print("cash by stall", cash_by_stall)
