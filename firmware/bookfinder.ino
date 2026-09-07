/**
 * BookFinder firmware — 7-reader sketch (checkpoint + 6 rack readers).
 *
 * NOT verified against real hardware from this environment. Flash it,
 * confirm wiring against firmware/README.md, and check each reader's
 * boot-time "connected"/"not connected" line in the Serial Monitor before
 * trusting it.
 *
 * Outbound (ESP32 -> backend), one line per scan:
 *   "READER_ID,UID"        e.g. "CSE_UPPER,09FF22B0"
 *   Reader ids match backend/src/rackCatalog.js and the shelfMap rows
 *   seeded by backend/scripts/seedShelfMap.js — do not rename them here
 *   without updating both.
 *
 * Inbound (backend -> ESP32):
 *   "ALERT:MISPLACED"      a shelf scan found a book on the wrong rack —
 *                          turn the buzzer + LED on
 *   "ALERT:CLEAR"          the most recent shelf scan was correct —
 *                          turn the buzzer + LED off
 *
 * Boot-time auto-detect: each reader is version-checked once at startup.
 * A reader that doesn't respond is marked inactive and silently skipped in
 * the loop, so the sketch runs fine with anywhere from 1 to 7 readers
 * physically connected — no code change needed while wiring up the rest.
 *
 * Each reader is its own named global MFRC522 object (not built inside an
 * array) — an earlier array-of-MFRC522 version of this sketch produced a
 * completely blank Serial Monitor on boot; this structure is the one that
 * was confirmed working on real hardware.
 */

#include <SPI.h>
#include <MFRC522.h>

// Shared SPI bus (all 7 readers)
#define SCK_PIN  18
#define MOSI_PIN 23
#define MISO_PIN 19
#define RST_PIN  22   // shared reset line

// Per-reader SS (SDA) pins — from the physical wiring
#define SS_CHECKPOINT 26   // main scanning & issue point
#define SS_CSE_UPPER  33
#define SS_CSE_LOWER  4
#define SS_EEE_UPPER  16
#define SS_EEE_LOWER  5
#define SS_SNH_UPPER  17
#define SS_SNH_LOWER  25

// Alert output — placeholder pins, not yet confirmed against physical
// wiring. Change these two if the buzzer/LED are wired elsewhere.
#define BUZZER_PIN 27
#define LED_PIN    14

MFRC522 checkpoint(SS_CHECKPOINT, RST_PIN);
MFRC522 cseUpper(SS_CSE_UPPER, RST_PIN);
MFRC522 cseLower(SS_CSE_LOWER, RST_PIN);
MFRC522 eeeUpper(SS_EEE_UPPER, RST_PIN);
MFRC522 eeeLower(SS_EEE_LOWER, RST_PIN);
MFRC522 snhUpper(SS_SNH_UPPER, RST_PIN);
MFRC522 snhLower(SS_SNH_LOWER, RST_PIN);

struct ReaderRef {
  const char* id;
  MFRC522* rfid;
  bool active;
};

// Pointers into the named objects above — the array itself never
// constructs an MFRC522, it only iterates over ones that already exist.
ReaderRef readers[] = {
  { "CHECKPOINT", &checkpoint, false },
  { "CSE_UPPER",  &cseUpper,   false },
  { "CSE_LOWER",  &cseLower,   false },
  { "EEE_UPPER",  &eeeUpper,   false },
  { "EEE_LOWER",  &eeeLower,   false },
  { "SNH_UPPER",  &snhUpper,   false },
  { "SNH_LOWER",  &snhLower,   false },
};
const uint8_t READER_COUNT = sizeof(readers) / sizeof(readers[0]);

bool alertActive = false;

void setup() {
  Serial.begin(115200);
  SPI.begin();

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  Serial.println("Checking readers...");
  for (uint8_t i = 0; i < READER_COUNT; i++) {
    readers[i].rfid->PCD_Init();
    byte version = readers[i].rfid->PCD_ReadRegister(MFRC522::VersionReg);

    readers[i].active = (version != 0x00 && version != 0xFF);

    Serial.print(readers[i].id);
    if (readers[i].active) {
      Serial.print(": connected (version 0x");
      Serial.print(version, HEX);
      Serial.println(")");
    } else {
      Serial.println(": not connected");
    }
  }
  Serial.println("Ready. Scan a card...");
}

void loop() {
  readCommandFromBackend();

  for (uint8_t i = 0; i < READER_COUNT; i++) {
    if (readers[i].active) pollReader(readers[i]);
  }
}

void pollReader(ReaderRef& r) {
  if (!r.rfid->PICC_IsNewCardPresent() || !r.rfid->PICC_ReadCardSerial()) return;

  Serial.print(r.id);
  Serial.print(",");
  for (byte i = 0; i < r.rfid->uid.size; i++) {
    if (r.rfid->uid.uidByte[i] < 0x10) Serial.print("0");
    Serial.print(r.rfid->uid.uidByte[i], HEX);
  }
  Serial.println();

  r.rfid->PICC_HaltA();
  r.rfid->PCD_StopCrypto1();
}

/** Listen for ALERT:MISPLACED / ALERT:CLEAR lines from the backend. */
void readCommandFromBackend() {
  if (!Serial.available()) return;

  String line = Serial.readStringUntil('\n');
  line.trim();

  if (line == "ALERT:MISPLACED") {
    setAlert(true);
  } else if (line == "ALERT:CLEAR") {
    setAlert(false);
  }
  // Unknown commands are ignored — future-proofs against new backend commands.
}

void setAlert(bool on) {
  alertActive = on;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}
