# Ida's notebook, encrypted. Loaded before your code runs.
ALPHABET = "abcdefghijklmnopqrstuvwxyz"


def unshift(letter, n):
    """Moves a letter n places back in the alphabet, wrapping around: unshift("b", 3) == "y".
    Anything that isn't a letter from a to z comes back unchanged."""
    lower = letter.lower()
    if lower not in ALPHABET:
        return letter
    moved = ALPHABET[(ALPHABET.index(lower) - n) % 26]
    return moved.upper() if letter.isupper() else moved


notes = {
    "en": [
        ".ksvj zp ap ulod dvsn fsuv zwhj loa :212 fhK",
        ".ylgllym loa vaup zlswthz nupdvsn ssh klcvt P",
        ".yvvk zap uv klazps zlswthz loa mv zaubvj lyvwz loa wb kkh :rjvs ylgllyM",
        ".llyoa zp lkpyylcv loa yvm apnpk tvvyozbt loA",
    ],
    "de": [
        ".azp ashr zl uuld ,ybu ulaojbls laüO lpK :212 nhA",
        ".anlsln ruhyojzylpymlN ulk up ulivyW ulkulaojbls lssh liho ojP",
        ".ulolaz yüA yluplz mbh lpk ,ulivyW ylk ulsohgulyvwZ lpk aylpkkH :zzvsojzylpymlN",
        ".plyk azp lkpyylcV ulk yüm ylmmpG-gspW lpK",
    ],
}
