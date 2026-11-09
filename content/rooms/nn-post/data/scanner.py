# The envelope scanner's output: one test envelope's postcode. Loaded before your code runs.

import base64 as _base64
import zlib as _zlib
import numpy as np


def _levels(data, shape):
    return np.frombuffer(_zlib.decompress(_base64.b64decode(data)), np.uint8).reshape(shape) * np.uint8(17)


def _digits(text):
    return np.array([int(c) for c in text], dtype=np.int64)


def _floats(data, shape):
    return np.frombuffer(_base64.b64decode(data), "<f4").reshape(shape).copy()


def _problems_or(problems, ok):
    for p in problems:
        print(p)
    return ok if not problems else "rejected"


def _array(a, shape):
    try:
        a = np.asarray(a, dtype=float)
    except (TypeError, ValueError):
        return None
    return a if a.shape == shape else None


stream = 255 - _levels((
    "eNq1U0mSxDAIi7Hxxvb/306SqtjQmanqy3DEIISQj+OLSCkXrHB8G9CIqf71WonvaL7jEzz5BhYmlhYYwapAGr3VwXk/dzMKiFVW"
    "eSLhmg5gfjKNRVVbJEDkuo2GqQNswpsKjftlyFPQuWRIEa64dZOcbND6psuVXjJ1eRZCeYvYedNBO7UetgRPE3B+yFmG8EMJFFLU"
    "G5C5bK7GpVtAqD3CkYjMJbgMUa/3vM5bnFx63iPSj2oXuWIRZEEY+2JH68RBz2om3a8wPtyWzwM0wUegq5ncCsAjVKs0NnUGmviW"
    "HIMDT0t5h/r6JBdUM8eJytvcQ8IQcAabYd0bKau6HEPw1sR0CkZPQbo30TUzc4/qzYKqxTP282De55hrRtFZsW1+xf+1axMz83AH"
    "SLR/bjMomgcz4e+//e6vNaRSP/4pfgAEjwq8"
), (1280,))
_DIGITS = 1 - stream.reshape(16, 5, 16).transpose(1, 0, 2) / 255


def _scanner_check(digits, postcode):
    """The scanner: five digit images in Iris's format, and the postcode read from them."""
    problems = []
    d = _array(digits, (5, 16, 16))
    if d is None:
        problems.append("digits should be an array of shape (5, 16, 16): five digits of 16 x 16 pixels. / digits soll ein Array der Form (5, 16, 16) sein: fünf Ziffern mit 16 x 16 Pixeln.")
    elif np.allclose(d, _DIGITS, atol=1e-6):
        pass
    elif np.allclose(d, 1 - _DIGITS, atol=1e-6) or np.allclose(d, 255 * (1 - _DIGITS), atol=1e-3):
        problems.append("digits are the right shape, but still in the scanner's format, not in Iris's. / digits haben die richtige Form, sind aber noch im Format des Scanners, nicht in dem von Iris.")
    elif np.allclose(d, 255 * _DIGITS, atol=1e-3):
        problems.append("digits are the right way round, but not on Iris's scale yet. / digits sind richtig herum, aber noch nicht auf Iris' Skala.")
    else:
        problems.append("digits don't show the five digits yet. Look at them with show_images. / digits zeigen die fünf Ziffern noch nicht. Schaut sie mit show_images an.")
    if str(postcode).strip() != '35781':
        problems.append("postcode isn't what the envelope says. Write it as a string of five digits, e.g. \"12345\". / postcode ist nicht, was auf dem Umschlag steht. Schreibt sie als Text aus fünf Ziffern, z. B. \"12345\".")
    return _problems_or(problems, "read")
