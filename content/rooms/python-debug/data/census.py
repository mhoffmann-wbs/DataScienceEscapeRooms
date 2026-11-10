# Butterflies per species after yesterday evening's count.
counts = {
    "blue morpho": 18,
    "owl butterfly": 12,
    "postman": 2,
    "glasswing": 1,
    "zebra longwing": 9,
    "monarch": 4,
    "paper kite": 1,
}

# Today's log: what happened to which species.
events = [
    ("hatched", "blue morpho"),
    ("died", "postman"),
    ("hatched", "zebra longwing"),
    ("died", "glasswing"),
    ("hatched", "owl butterfly"),
    ("died", "postman"),
    ("released", "monarch"),
    ("hatched", "blue morpho"),
    ("died", "paper kite"),
    ("hatched", "zebra longwing"),
    ("hatched", "blue morpho"),
]

# Another evening. The check runs evening() on it too.
_counts2 = {"postman": 1, "monarch": 1, "glasswing": 4, "paper kite": 0, "blue morpho": 6}
_events2 = [
    ("died", "postman"),
    ("died", "monarch"),
    ("hatched", "paper kite"),
    ("died", "paper kite"),
    ("hatched", "glasswing"),
    ("released", "blue morpho"),
]
