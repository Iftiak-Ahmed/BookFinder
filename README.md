# BookFinder

RFID-based library shelf tracking — CSE-406 Computer Interfacing Sessional, MIST.

One ESP32 Dev Board drives RC522 RFID readers over a shared SPI bus: one at the
library checkpoint and (eventually) six on shelves (two readers per shelf,
three shelves). The ESP32 streams every scan over USB serial to a Node.js
backend, which writes to Firebase Firestore. A React dashboard subscribes to
Firestore realtime listeners and updates live.

```
ESP32 (readers) --USB serial--> Node backend --> Firestore (+ realtime)
                     ^                                  |
                     |--ALERT:MISPLACED / ALERT:CLEAR    |
                                                    React dashboard
```

## What the system does

- **Checkpoint reader** — a student taps their card, then taps a book. If the
  book is not currently checked out, this issues it to that student; if it's
  already checked out to that same student, this returns it. A mismatched tap
  (book held by someone else, or no student identified) is logged, not blindly
  toggled.
- **Shelf readers** — a book scanned on a shelf records where it is now. If
  that shelf is not the book's `correctShelf`, it's flagged misplaced, the
  dashboard highlights it, and the backend sends `ALERT:MISPLACED` to the
  ESP32 to drive a buzzer/LED (see [firmware/README.md](firmware/README.md)).
- **Entry/exit logging** — every student card tap also toggles their
  Inside/Outside presence and appends to the `accessLogs` collection.
- **Transaction history** — every issue/return writes an append-only record to
  the `transactions` collection (student, book, action, remark, timestamp).
- **Unknown tags** are still written to `scanEvents`, so an unregistered UID
  shows up on screen instead of vanishing silently.

## Prerequisites

- Node.js 18 or newer
- A Firebase project with Firestore enabled, and a service account key
- The ESP32 flashed with `firmware/bookfinder.ino` (or your own compatible
  sketch — see [firmware/README.md](firmware/README.md) for the serial
  contract)

## Setup — do these in order

### 1. Configure and run the backend

```powershell
cd backend
npm install
copy .env.example .env
```

Fill in `.env`:

| Variable                        | Where to find it                                              |
| -------------------------------- | --------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | optional — defaults to `backend/serviceAccountKey.json`         |
| `SERIAL_PORT`                    | Windows Device Manager, e.g. `COM3`. Or run `npm run ports`.    |
| `BAUD_RATE`                      | `115200`                                                         |
| `DEFAULT_READER_ID`              | reader id attributed to bare `UID: ...` lines (default `CHECKPOINT`) |

Place your Firebase service account JSON at `backend/serviceAccountKey.json`
(never commit it).

Seed the shelf map (reader id → shelf label) once:

```powershell
node scripts/seedShelfMap.js
```

Register real books and student cards as you tag them:

```powershell
node scripts/registerBook.js --uid=A1B2C3D4 --title="Operating System" --author="A. Silberschatz" --copy=1 --rack=CSE_UPPER
node scripts/registerStudent.js --uid=B0AB4F5C --studentId=202314025 --name="..." --dept=CSE
```

Then:

```powershell
npm start
```

You should see the shelf map load, the REST API come up on port 4000, and the
serial port connect. Tap a tag — the scan is logged in the terminal.

> **Close the Arduino IDE Serial Monitor first.** It holds the COM port and
> the backend cannot open it at the same time.

### 2. Run the dashboard

In a second terminal:

```powershell
cd dashboard
npm install
copy .env.example .env
```

Fill in `.env` with your Firebase web app config (`VITE_FIREBASE_*` — the
public client config, safe to ship to the browser).

```powershell
npm run dev
```

Open http://localhost:5173.

**Running order matters:** backend before dashboard — the dashboard's first
paint comes from the backend's REST API.

## The dashboard

The app opens on a **login page** — the fields are not validated, clicking
**Login** goes straight in (demo gate, no real auth). Each screen is a real
browser history entry, so the **back button** walks back: card overlay →
dashboard → login.

A **Card Inserted** panel opens the instant a tag is read, showing the UID and
either the student (with their issued books) or the book (with its shelf and
status). Press Escape, click outside, or hit back to dismiss it.

- **Stat row** — books tracked, correctly shelved, checked out, misplaced.
  The misplaced tile turns red the moment the count goes above zero.
- **Shelves** — one panel per department, grouped by rack, with a search box
  and state filters (All / Misplaced / Checked out / On shelf).
- **Checkpoint** — the live scan feed, newest first, with the borrower's name.
- **Students** — roster, per-card registration form, and each student's
  currently issued books.
- **Transaction History** — the issue/return audit trail, filterable by
  action and searchable by student/book.
- **Access Log** — student entry/exit events.
- **Wrong Placement History** — misplacement alerts, active and resolved.
- **Theme toggle** — dark by default (less projector glare), light one click
  away.

## Project layout

```
backend/
  src/serial/serialListener.js   opens the COM port, one line at a time, sends ALERT:* commands
  src/services/scanProcessor.js  parses lines, applies issue/return + misplacement logic
  src/services/shelfLookup.js    reader_id -> shelf_label, cached at boot
  src/db/firebaseAdmin.js        Firebase Admin SDK client (Firestore)
  src/routes/api.js              REST endpoints for the dashboard's first load
  src/rackCatalog.js             the physical rack layout (dept/position/subject)
  src/server.js                  boots the API and the serial listener
  scripts/registerBook.js        register one book's RFID tag
  scripts/registerStudent.js     register one student's RFID card
  scripts/seedShelfMap.js        seed the shelfMap collection from rackCatalog.js
  scripts/simulateScan.js        feed one serial line into the processor without hardware
dashboard/
  src/App.jsx                          shell, hash router, theme toggle
  src/hooks/useBooks.js                books: REST first paint + realtime after
  src/hooks/useScanEvents.js           scan events, hydrated with student/book
  src/hooks/usePlacementAlerts.js      misplacement alerts, active + resolved
  src/hooks/useStudents.js             student roster, issued-books lookup, registration
  src/hooks/useTransactions.js         issue/return audit trail
  src/hooks/useAccessLogs.js           entry/exit log
  src/lib/format.js                    one source of truth for book state -> colour
  src/lib/firestoreMappers.js          Firestore doc -> dashboard row shapes
  src/components/                      StatBar, ShelfGrid, CheckpointFeed, StudentsPage, ...
  src/index.css                        design tokens, light + dark
firmware/
  bookfinder.ino                 reference sketch: reads tags, reacts to ALERT:* commands
  README.md                      wiring table and the full serial contract
```

## REST API

| Endpoint                          | Returns                                                |
| ---------------------------------- | ------------------------------------------------------- |
| `GET /api/books`                   | all books with status, current shelf, misplaced flag    |
| `GET /api/shelf-map`               | `reader_id` → `shelf_label`                              |
| `GET /api/students`                | all registered cards                                     |
| `POST /api/students`               | register a new card                                      |
| `GET /api/students/:id/issued`     | books currently checked out to that student              |
| `GET /api/events/recent`           | last 20 scans joined with student name and book title    |
| `GET /api/transactions`            | issue/return audit trail, filterable by student/book/action |
| `GET /api/access-logs`             | entry/exit events, filterable by student                 |
| `GET /api/alerts`                  | misplacement alert history                                |
| `PATCH /api/alerts/:id/resolve`    | mark a misplacement alert resolved                        |
| `GET /api/health`                  | `{ ok: true }`                                            |

These serve the first paint only. Everything after that arrives over
Firestore realtime listeners.

## Testing without hardware

```powershell
cd backend
node scripts/simulateScan.js "CHECKPOINT,04A3B2C1"
node scripts/simulateScan.js "CHECKPOINT,09FF22B0"
node scripts/simulateScan.js "SHELF2_A,09FF22B0"
```

That taps a student card, checks out a book, then shelves it on the wrong
shelf — the dashboard should show the checkout in the feed and the book turn
red.

## Troubleshooting

| Symptom                            | Fix                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `Could not open COM3`               | Close the Arduino Serial Monitor; check the port with `npm run ports`.    |
| Backend starts but no scans appear  | Baud rate mismatch, or the firmware line format doesn't match `scanProcessor.js`. |
| `Unknown reader "..."`              | The reader id is missing from `shelfMap` — re-run `seedShelfMap.js`.       |
| Dashboard is empty                  | Backend not running, or no books/students registered yet.                 |
| Scans logged as unknown UID         | The tag isn't registered — run `registerBook.js` / `registerStudent.js`.  |

## Notes

- Never commit `.env` or `serviceAccountKey.json`. Only `.env.example`
  belongs in the repo.
- The backend ignores a repeat of the same reader + UID within 3 seconds,
  because an RC522 re-reads a tag continuously while it sits on the antenna.
  Tune `DUPLICATE_SCAN_WINDOW_MS` in `scanProcessor.js` if a demo tap feels
  sluggish.
