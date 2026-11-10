-- Hotel Tabula, the night of 14 to 15 March 2026. Built fresh for every query.
-- Times are text in the form 'YYYY-MM-DD HH:MM', so they compare and sort correctly.

CREATE TABLE bookings (
  booking_id INTEGER PRIMARY KEY,
  guest_name TEXT NOT NULL,
  room INTEGER NOT NULL,
  check_in TEXT NOT NULL,  -- 'YYYY-MM-DD', arrival day
  check_out TEXT NOT NULL  -- 'YYYY-MM-DD', departure morning
);

INSERT INTO bookings (booking_id, guest_name, room, check_in, check_out) VALUES
  (1, 'Tom Berger', 402, '2026-03-11', '2026-03-14'),
  (2, 'Nora Quill', 406, '2026-03-12', '2026-03-15'),
  (3, 'Ada Okafor', 411, '2026-03-10', '2026-03-17'),
  (4, 'Henrik Sol', 401, '2026-03-13', '2026-03-16'),
  (5, 'Victor Hale', 404, '2026-03-14', '2026-03-16'),
  (6, 'Priya Nand', 409, '2026-03-14', '2026-03-15'),
  (7, 'Lena Fischer', 407, '2026-03-15', '2026-03-18'),
  (8, 'Jonas Wirth', 207, '2026-03-13', '2026-03-15'),
  (9, 'Clara Moss', 211, '2026-03-14', '2026-03-17'),
  (10, 'Marco Ruiz', 312, '2026-03-15', '2026-03-16'),
  (11, 'Eva Lindqvist', 305, '2026-03-12', '2026-03-14'),
  (12, 'Samuel Adeyemi', 408, '2026-03-01', '2026-03-03'),
  (13, 'Yuki Tanaka', 103, '2026-03-14', '2026-03-15'),
  (14, 'Bruno Costa', 412, '2026-03-16', '2026-03-19'),
  (15, 'Ingrid Holm', 204, '2026-03-13', '2026-03-16'),
  (16, 'Felix Grau', 310, '2026-03-14', '2026-03-15'),
  (17, 'Rosa Martín', 403, '2026-03-09', '2026-03-14'),
  (18, 'Theo Lambert', 406, '2026-03-12', '2026-03-15');

CREATE TABLE keycards (
  card_id TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  role TEXT NOT NULL,
  issued TEXT NOT NULL  -- 'YYYY-MM-DD HH:MM', when the encoder wrote the card
);

INSERT INTO keycards (card_id, holder, role, issued) VALUES
  ('M-01', 'Sabine Kohl', 'day manager', '2025-04-01 08:00'),
  ('M-02', 'Otto Brandt', 'night manager', '2025-10-01 18:00'),
  ('M-03', 'Otto Brandt', 'night manager', '2026-03-14 21:05'),
  ('H-01', 'Jan Petrov', 'housekeeping', '2025-06-15 07:00'),
  ('H-03', 'Mia Lund', 'housekeeping', '2026-01-12 07:00'),
  ('P-01', 'Leo Marek', 'porter', '2025-12-01 07:30'),
  ('C-402', 'Tom Berger', 'guest', '2026-03-11 15:10'),
  ('C-406', 'Nora Quill', 'guest', '2026-03-12 16:40'),
  ('C-406B', 'Theo Lambert', 'guest', '2026-03-12 16:40'),
  ('C-411', 'Ada Okafor', 'guest', '2026-03-10 14:20'),
  ('C-401', 'Henrik Sol', 'guest', '2026-03-13 17:55'),
  ('C-404', 'Victor Hale', 'guest', '2026-03-14 15:25'),
  ('C-409', 'Priya Nand', 'guest', '2026-03-14 16:00'),
  ('C-407', 'Lena Fischer', 'guest', '2026-03-15 14:30'),
  ('C-207', 'Jonas Wirth', 'guest', '2026-03-13 18:45'),
  ('C-211', 'Clara Moss', 'guest', '2026-03-14 16:40'),
  ('C-312', 'Marco Ruiz', 'guest', '2026-03-15 02:46'),
  ('C-305', 'Eva Lindqvist', 'guest', '2026-03-12 13:15'),
  ('C-408', 'Samuel Adeyemi', 'guest', '2026-03-01 15:00'),
  ('C-103', 'Yuki Tanaka', 'guest', '2026-03-14 17:35'),
  ('C-412', 'Bruno Costa', 'guest', '2026-03-16 15:00'),
  ('C-204', 'Ingrid Holm', 'guest', '2026-03-13 12:50'),
  ('C-310', 'Felix Grau', 'guest', '2026-03-14 18:20'),
  ('C-403', 'Rosa Martín', 'guest', '2026-03-09 16:05');

CREATE TABLE door_log (
  log_id INTEGER PRIMARY KEY,
  time TEXT NOT NULL,
  card_id TEXT NOT NULL REFERENCES keycards (card_id),
  room INTEGER NOT NULL,
  event TEXT NOT NULL  -- 'open' or 'denied'
);

INSERT INTO door_log (log_id, time, card_id, room, event) VALUES
  (1, '2026-03-13 09:40', 'H-03', 406, 'open'),
  (2, '2026-03-13 10:05', 'H-03', 404, 'open'),
  (3, '2026-03-13 11:20', 'M-02', 203, 'open'),
  (4, '2026-03-13 18:02', 'C-401', 401, 'open'),
  (5, '2026-03-13 21:44', 'C-406', 406, 'open'),
  (6, '2026-03-13 22:30', 'M-02', 305, 'open'),
  (7, '2026-03-13 23:15', 'C-207', 207, 'open'),
  (8, '2026-03-14 07:55', 'C-402', 402, 'open'),
  (9, '2026-03-14 08:10', 'C-403', 403, 'open'),
  (10, '2026-03-14 09:30', 'H-03', 402, 'open'),
  (11, '2026-03-14 09:50', 'H-03', 403, 'open'),
  (12, '2026-03-14 10:15', 'H-01', 211, 'open'),
  (13, '2026-03-14 12:40', 'C-411', 411, 'open'),
  (14, '2026-03-14 15:30', 'C-404', 404, 'open'),
  (15, '2026-03-14 16:05', 'C-409', 409, 'open'),
  (16, '2026-03-14 16:45', 'C-211', 211, 'open'),
  (17, '2026-03-14 17:20', 'M-02', 412, 'open'),
  (18, '2026-03-14 18:30', 'M-02', 310, 'open'),
  (19, '2026-03-14 19:05', 'M-02', 404, 'open'),
  (20, '2026-03-14 19:40', 'C-401', 401, 'open'),
  (21, '2026-03-14 20:10', 'M-02', 408, 'open'),
  (22, '2026-03-14 20:35', 'P-01', 406, 'open'),
  (23, '2026-03-14 21:15', 'C-406', 406, 'denied'),
  (24, '2026-03-14 21:20', 'M-02', 406, 'open'),
  (25, '2026-03-14 21:40', 'C-404', 404, 'open'),
  (26, '2026-03-14 21:48', 'M-02', 406, 'open'),
  (27, '2026-03-14 21:55', 'C-411', 411, 'open'),
  (28, '2026-03-14 22:20', 'C-310', 310, 'open'),
  (29, '2026-03-14 23:12', 'H-03', 404, 'open'),
  (30, '2026-03-14 23:30', 'C-207', 207, 'open'),
  (31, '2026-03-14 23:58', 'C-401', 401, 'open'),
  (32, '2026-03-15 00:18', 'C-409', 404, 'denied'),
  (33, '2026-03-15 00:19', 'C-409', 409, 'open'),
  (34, '2026-03-15 01:05', 'C-211', 211, 'open'),
  (35, '2026-03-15 02:40', 'M-02', 402, 'denied'),
  (36, '2026-03-15 02:47', 'M-02', 404, 'open'),
  (37, '2026-03-15 02:55', 'H-03', 207, 'open'),
  (38, '2026-03-15 03:10', 'C-312', 312, 'open'),
  (39, '2026-03-15 06:52', 'C-404', 404, 'open'),
  (40, '2026-03-15 07:15', 'H-03', 404, 'open'),
  (41, '2026-03-15 08:05', 'C-409', 409, 'open');

CREATE TABLE receipts (
  receipt_id INTEGER PRIMARY KEY,
  time TEXT NOT NULL,
  place TEXT NOT NULL,
  card_id TEXT NOT NULL REFERENCES keycards (card_id),  -- the card that signed it
  amount REAL NOT NULL
);

INSERT INTO receipts (receipt_id, time, place, card_id, amount) VALUES
  (1, '2026-03-14 19:30', 'restaurant', 'C-404', 86.50),
  (2, '2026-03-14 20:15', 'restaurant', 'C-406', 42.00),
  (3, '2026-03-14 21:10', 'night bar', 'C-401', 14.00),
  (4, '2026-03-14 22:05', 'card room', 'C-404', 200.00),
  (5, '2026-03-14 22:40', 'night bar', 'C-411', 9.50),
  (6, '2026-03-14 23:50', 'room service', 'H-03', 18.00),
  (7, '2026-03-15 00:30', 'night bar', 'C-401', 21.00),
  (8, '2026-03-15 01:15', 'card room', 'C-404', 350.00),
  (9, '2026-03-15 02:20', 'night bar', 'C-406', 7.50),
  (10, '2026-03-15 02:41', 'card room', 'C-404', 120.00),
  (11, '2026-03-15 02:44', 'room service', 'H-03', 24.50),
  (12, '2026-03-15 02:45', 'reception', 'M-03', 0.00),
  (13, '2026-03-15 02:50', 'room service', 'C-409', 12.00),
  (14, '2026-03-15 03:02', 'night bar', 'C-401', 11.00),
  (15, '2026-03-15 03:05', 'card room', 'C-404', 90.00),
  (16, '2026-03-15 06:30', 'breakfast', 'C-207', 19.00),
  (17, '2026-03-15 02:48', 'night bar', 'C-406B', 8.00);
