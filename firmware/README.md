# BookFinder Firmware Notes

The sketch lives in the Arduino IDE. This file documents the contract between
the ESP32 and the Node.js backend.

## Your current sketch works as-is

The backend accepts **two** serial formats, so the single-reader sketch you
already flashed needs no changes:

| Format | Example | Reader attributed |
| ------ | ------- | ----------------- |
| **A — multi-reader** | `SHELF1_A,09FF22B0` | the id in the line |
| **B — single-reader** | `UID: B0 E3 90 5C` | `DEFAULT_READER_ID` (default `CHECKPOINT`) |

Everything else your sketch prints is ignored safely:

```
Scan a book's RFID card...              -> ignored
UID: B0 E3 90 5C                        -> PARSED as B0E3905C
Book: Microelectronic Circuits ...      -> ignored
ID - 202114202 Name :Lt Iftiak Dept:CSE -> ignored
------------------------                -> ignored
Unknown card - not registered yet       -> ignored
```

Spaces, colons and dashes are stripped and the UID is upper-cased, so
`B0 E3 90 5C`, `b0:e3:90:5c` and `B0E3905C` all match the same book row.

The `Book:` and `ID -` lines in the sketch are now **redundant** — the database
holds those names. They do no harm, and they are useful in the Serial Monitor
when the backend is not running. Leave them.

## Testing shelf logic with one reader

With a single reader there is no way for the firmware to say *which* shelf a
scan came from, so every `UID:` line is treated as a checkpoint scan
(check-out / check-in). To exercise the misplaced-book logic before all seven
readers are wired, set this in `backend/.env`:

```
DEFAULT_READER_ID=SHELF2_A
```

Now every tap is treated as a read on Shelf 2. Tapping a book that belongs on
Shelf 1 will flag it misplaced on the dashboard. Set it back to `CHECKPOINT`
(or delete the line) for borrow/return behaviour.

## Wiring the full seven readers

One ESP32, seven MFRC522 readers on a **shared SPI bus**, individual SS pins.

| Signal | ESP32 pin | Notes |
| ------ | --------- | ----- |
| SCK | GPIO 18 | shared |
| MOSI | GPIO 23 | shared |
| MISO | GPIO 19 | shared |
| RST | GPIO 22 | shared (your current sketch already uses 22) |
| SS | one pin per reader | see below |

| Reader ID | Location | SS pin |
| --------- | -------- | ------ |
| `CHECKPOINT` | Entry/exit desk | GPIO 5 (your current reader) |
| `SHELF1_A` | Shelf 1, left | GPIO 4 |
| `SHELF1_B` | Shelf 1, right | GPIO 2 |
| `SHELF2_A` | Shelf 2, left | GPIO 15 |
| `SHELF2_B` | Shelf 2, right | GPIO 21 |
| `SHELF3_A` | Shelf 3, left | GPIO 13 |
| `SHELF3_B` | Shelf 3, right | GPIO 12 |

All readers run at **3.3 V**, not 5 V.

When you get there, the only change needed is to print the reader id with the
UID — replace `Serial.print("UID: ")` with the reader's name and a comma:

```cpp
// inside the per-reader loop
Serial.print(readerName);   // e.g. "SHELF1_A"
Serial.print(",");
Serial.println(uid);        // spaces are fine, the backend strips them
```

The six shelf ids must match the `shelfMap` rows seeded by
`backend/scripts/seedShelfMap.js` exactly.

## Registered tags

These are the UIDs from your sketch. Register them with
`backend/scripts/registerStudent.js` and `backend/scripts/registerBook.js`
(see the root [README.md](../README.md) for usage).

**Students**

| UID | ID | Name | Dept |
| --- | -- | ---- | ---- |
| `B0 AB 4F 5C` | 202314025 | Isbat | CSE |
| `C0 15 4B 5C` | 202114202 | Lt Iftiak | CSE |
| `C0 51 F7 5C` | 202214085 | Maj Refa | CSE |
| `B0 63 D9 5C` | 202214163 | Maj Mustari | CSE |

**Books**

| UID | Title | Copy | Shelf |
| --- | ----- | ---- | ----- |
| `60 0A 7A 5C` | Microelectronic Circuits — Sedra | 1 | Shelf 1 |
| `B0 E3 90 5C` | Microelectronic Circuits — Sedra | 2 | Shelf 1 |
| `A1 98 18 0A` | Electric Machinery — Chapman | 1 | Shelf 1 |
| `C0 6C FA 5C` | Electric Machinery — Chapman | 2 | Shelf 1 |
| `50 81 23 5C` | Artificial Intelligence — Rich | 1 | Shelf 2 |
| `50 F4 66 5C` | Artificial Intelligence — Rich | 2 | Shelf 2 |
| `B0 E4 21 5C` | Operating Systems — Stallings | 1 | Shelf 2 |
| `C0 35 4A 5C` | Operating Systems — Stallings | 2 | Shelf 2 |
| `B0 8E D2 5C` | Fundamentals of Physics — Halliday | 1 | Shelf 3 |
| `C0 6E 68 5C` | Fundamentals of Physics — Halliday | 2 | Shelf 3 |
| `C0 08 06 5C` | Calculus — Spivak | 1 | Shelf 3 |
| `50 C1 AB 5C` | Calculus — Spivak | 2 | Shelf 3 |

If you physically place them differently, edit `correct_shelf` in `seed.sql` —
that column is what decides whether a book is flagged misplaced.

## Outbound alert protocol (backend -> ESP32)

`backend/src/serial/serialListener.js` now exports `sendCommand(line)`, called
from `scanProcessor.js` whenever a shelf reader detects a book:

| Command | Sent when | ESP32 should |
| ------- | --------- | ------------ |
| `ALERT:MISPLACED` | a shelf scan found the book on the wrong rack | turn buzzer + LED **on** |
| `ALERT:CLEAR` | a shelf scan found the book on the correct rack | turn buzzer + LED **off** |

A reference implementation lives in `firmware/bookfinder.ino` — it keeps the
existing `UID: xx xx xx xx` inbound format and adds a `readCommandsFromBackend()`
loop that reacts to these two lines. It has **not** been tested on real
hardware from this environment; verify the pin assignments (`BUZZER_PIN`,
`LED_PIN`) against your actual wiring before trusting the alert behaviour.

If the ESP32 is unplugged or the serial port isn't open, `sendCommand` is a
no-op — the backend and dashboard keep working without hardware attached.

## Demo gotcha

The Arduino Serial Monitor and the Node.js backend **cannot hold COM12 at the
same time**. Close the Serial Monitor before running `npm start` in `backend/`,
or you will see `Access denied`.
