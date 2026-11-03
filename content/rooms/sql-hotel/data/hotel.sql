-- Placeholder data for the room engine; the real hotel case arrives in plan step 6.
CREATE TABLE guests (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  room INTEGER NOT NULL
);

INSERT INTO guests (id, name, room) VALUES
  (1, 'Ada Lovelace', 404),
  (2, 'Grace Hopper', 412),
  (3, 'Alan Turing', 101),
  (4, 'Edgar Codd', 405),
  (5, 'Hedy Lamarr', 230),
  (6, 'Katherine Johnson', 418);

CREATE TABLE keycard_log (
  guest_id INTEGER NOT NULL REFERENCES guests (id),
  room INTEGER NOT NULL,
  time TEXT NOT NULL -- 'HH:MM', 24-hour clock
);

INSERT INTO keycard_log (guest_id, room, time) VALUES
  (1, 404, '22:10'),
  (4, 405, '23:30'),
  (4, 404, '00:40'),
  (2, 412, '21:05'),
  (6, 418, '00:15'),
  (3, 101, '01:20');
