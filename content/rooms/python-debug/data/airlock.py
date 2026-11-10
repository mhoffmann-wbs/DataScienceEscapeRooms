# The airlock sensor log since 18:00: time;sensor;value
log = [
    "18:00;air;24.1",
    "18:05;door;closed",
    "18:10;air;23,8",
    "18:15;air;24.4",
    "18:20;air;--",
    "18:25;door;open",
    "18:30;air;22,9",
    "18:35;air;--",
    "18:40;door;closed",
    "18:45;air;23.6",
    "18:50;air;24,2",
    "18:55;air;--",
    "19:00;air;23.9",
]

# The log of the next night. The check runs air_readings() on it too.
_night_log = [
    "18:00;air;21,5",
    "18:05;door;open",
    "18:10;air;--",
    "18:15;air;29.0",
    "18:20;door;--",
    "18:25;air;26,25",
]
