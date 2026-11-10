# Call numbers of the books that go into the cellar, in the order they were scanned.
book_ids = [
    "K-0874", "K-0152", "K-0696", "K-0220", "K-0105", "K-0490", "K-0095", "K-0892",
    "K-0773", "K-0867", "K-0247", "K-0466", "K-0782", "K-0900", "K-0930", "K-0381",
    "K-0366", "K-0499", "K-0075", "K-0777", "K-0388", "K-0013", "K-0827", "K-0132",
    "K-0699", "K-0582", "K-0277", "K-0045",
]

# Tomorrow's pile, for the lift's self-test: 23 books, so its last box can't be full.
_short_pile = [
    "K-0018", "K-0393", "K-0645", "K-0858", "K-0320", "K-0795", "K-0386", "K-0298",
    "K-0500", "K-0979", "K-0010", "K-0214", "K-0684", "K-0144", "K-0614", "K-0403",
    "K-0879", "K-0644", "K-0212", "K-0923", "K-0259", "K-0094", "K-0102",
]


def _pack_check(pack, boxes):
    """The lift: today's boxes, and a pack function that refuses a pile whose last box isn't full,
    the way itertools.batched does with strict=True."""
    try:
        packed = [list(b) for b in boxes]
    except TypeError:
        print("boxes should be a list of boxes, each a tuple or list of call numbers. / boxes soll eine Liste von Kisten sein, jede ein Tupel oder eine Liste von Signaturen.")
        return "rejected"
    try:
        list(pack(list(_short_pile)))
    except ValueError as err:
        if "incomplete batch" not in str(err):
            print("pack refuses the short pile, but the lift doesn't recognise that error. Margarete never writes that loop herself. / pack lehnt den kurzen Stapel ab, aber der Aufzug erkennt diesen Fehler nicht. Margarete schreibt diese Schleife nie selbst.")
            return "rejected"
    except Exception as err:
        print(f"pack crashed on a pile of 23 books: {type(err).__name__}: {err} / pack ist bei einem Stapel von 23 Büchern abgestürzt: {type(err).__name__}: {err}")
        return "rejected"
    else:
        print("The lift's self-test: pack sent a pile of 23 books with a short last box. It has to refuse it with an error. / Selbsttest des Aufzugs: pack hat einen Stapel von 23 Büchern mit einer nicht vollen letzten Kiste geschickt. Es muss ihn mit einem Fehler ablehnen.")
        return "rejected"
    return packed
