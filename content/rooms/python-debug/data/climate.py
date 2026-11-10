# Tonight's sensor readings per zone of the butterfly house.
zones = {
    "rainforest": {"temp": 23.4, "humidity": 71},
    "cloud_forest": {"temp": 19.8, "humidity": 82},
    "meadow": {"temp": 25.8, "humidity": 64},
    "nursery": {"temp": 22.9, "humidity": 66},
}

# The readings of a later hour. The check runs levels() on them too.
_later_zones = {
    "rainforest": {"temp": 27.6, "humidity": 88},
    "cloud_forest": {"temp": 20.2, "humidity": 85},
    "meadow": {"temp": 24.1, "humidity": 55},
    "nursery": {"temp": 25.5, "humidity": 80},
}
