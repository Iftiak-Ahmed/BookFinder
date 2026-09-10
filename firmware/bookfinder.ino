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
#define SS_SCIENCE_UPPER  17
#define SS_SCIENCE_LOWER  25

// Alert output — placeholder pins, not yet confirmed against physical
// wiring. Change these two if the buzzer/LED are wired elsewhere.
#define BUZZER_PIN 27
#define LED_PIN    14

// Separate "card scanned" confirmation LED — independent of the ALERT LED
// above, so a normal scan blink never gets mixed up with a misplaced-book
// alert. Placeholder pin, confirm against physical wiring.
#define SCAN_LED_PIN 13

MFRC522 checkpoint(SS_CHECKPOINT, RST_PIN);
MFRC522 cseUpper(SS_CSE_UPPER, RST_PIN);
MFRC522 cseLower(SS_CSE_LOWER, RST_PIN);
MFRC522 eeeUpper(SS_EEE_UPPER, RST_PIN);
MFRC522 eeeLower(SS_EEE_LOWER, RST_PIN);
MFRC522 scienceUpper(SS_SCIENCE_UPPER, RST_PIN);
MFRC522 scienceLower(SS_SCIENCE_LOWER, RST_PIN);

struct ReaderRef {
  const char* id;
  MFRC522* rfid;
  bool active;
};

// Shelf readers ONLY — checkpoint is handled separately below so it never
// competes for loop time with the "no gap" continuous shelf scanning.
ReaderRef shelfReaders[] = {
  { "CSE_UPPER",      &cseUpper,      false },
  { "CSE_LOWER",      &cseLower,      false },
  { "EEE_UPPER",      &eeeUpper,      false },
  { "EEE_LOWER",      &eeeLower,      false },
  { "SCIENCE_UPPER",  &scienceUpper,  false },
  { "SCIENCE_LOWER",  &scienceLower,  false },
};
const uint8_t SHELF_COUNT = sizeof(shelfReaders) / sizeof(shelfReaders[0]);

bool checkpointActive = false;

// Checkpoint debounce state — prevents one held book from spamming the
// backend with repeat "issue" events every loop pass.
const unsigned long CHECKPOINT_COOLDOWN_MS = 2000;
String lastCheckpointUID = "";
unsigned long checkpointCooldownUntil = 0;

bool alertActive = false;

// Scan confirmation LED — non-blocking blink (no delay()) so it never
// slows down the continuous shelf polling loop.
const unsigned long SCAN_LED_BLINK_MS = 100;
unsigned long scanLedOffAt = 0;

void setup() {
  Serial.begin(115200);
  SPI.begin();

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(SCAN_LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(SCAN_LED_PIN, LOW);

  Serial.println("Checking readers...");

  checkpoint.PCD_Init();
  {
    byte version = checkpoint.PCD_ReadRegister(MFRC522::VersionReg);
    checkpointActive = (version != 0x00 && version != 0xFF);

    // Same reasoning as the shelf antennas below: stay OFF by default and
    // only switch on for the brief moment pollCheckpoint() is actually
    // polling it, instead of radiating continuously alongside whichever
    // shelf reader currently has its own field on.
    if (checkpointActive) checkpoint.PCD_AntennaOff();

    Serial.print("CHECKPOINT");
    if (checkpointActive) {
      Serial.print(": connected (version 0x");
      Serial.print(version, HEX);
      Serial.println(")");
    } else {
      Serial.println(": not connected");
    }
  }

  for (uint8_t i = 0; i < SHELF_COUNT; i++) {
    shelfReaders[i].rfid->PCD_Init();
    byte version = shelfReaders[i].rfid->PCD_ReadRegister(MFRC522::VersionReg);

    shelfReaders[i].active = (version != 0x00 && version != 0xFF);

    // Shelf antennas stay OFF by default and only switch on for the brief
    // moment pollReader() is actually polling that one reader (see below) —
    // with 6 antennas this close together, leaving them all radiating at
    // once lets a tag on one shelf desensitize its neighbors' fields.
    if (shelfReaders[i].active) shelfReaders[i].rfid->PCD_AntennaOff();

    Serial.print(shelfReaders[i].id);
    if (shelfReaders[i].active) {
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

  // Shelf readers: every single pass, no delay, no skipping — this is
  // the continuous "no gap" scanning the shelves need.
  for (uint8_t i = 0; i < SHELF_COUNT; i++) {
    if (shelfReaders[i].active) pollReader(shelfReaders[i]);
  }

  // Checkpoint: also checked every pass, but debounced internally so a
  // book left sitting on it doesn't flood the backend with repeat events.
  if (checkpointActive) pollCheckpoint();

  updateScanLed(); // non-blocking: turns SCAN_LED_PIN off once its blink window passes
}

/**
 * The library's own PICC_IsNewCardPresent() sends REQA, which per ISO14443-3
 * only wakes a card sitting in IDLE state. Once a tag has been through
 * PICC_ReadCardSerial() it is in ACTIVE state (and, after PICC_HaltA() below,
 * HALT state) — either way REQA no longer reaches it. WUPA (wake-up type A)
 * reaches a card in IDLE *or* HALT state, so this is PICC_IsNewCardPresent()
 * with WUPA swapped in for REQA — it's what lets a tag that never leaves the
 * antenna keep being re-detected on every loop pass instead of just once.
 */
bool pollForCard(MFRC522* rfid) {
  byte bufferATQA[2];
  byte bufferSize = sizeof(bufferATQA);

  rfid->PCD_WriteRegister(MFRC522::TxModeReg, 0x00);
  rfid->PCD_WriteRegister(MFRC522::RxModeReg, 0x00);
  rfid->PCD_WriteRegister(MFRC522::ModWidthReg, 0x26);

  MFRC522::StatusCode result = rfid->PICC_WakeupA(bufferATQA, &bufferSize);
  return (result == MFRC522::STATUS_OK || result == MFRC522::STATUS_COLLISION);
}

// Shelf reader poll — reports on every successful read, every loop pass,
// for as long as the book stays on the antenna. No debounce: the backend
// relies on this steady stream to know a book is still "on shelf".
//
// The antenna is switched on only for this reader's own turn and back off
// immediately after, win or lose — with 6 shelf antennas physically close
// together, only ever having one field live at a time keeps a book sitting
// on one shelf from desensitizing its neighbors' reads.
void pollReader(ReaderRef& r) {
  r.rfid->PCD_AntennaOn();

  bool found = pollForCard(r.rfid) && r.rfid->PICC_ReadCardSerial();

  if (!found) {
    r.rfid->PCD_AntennaOff();
    return;
  }

  triggerScanLed();

  Serial.print(r.id);
  Serial.print(",");
  for (byte i = 0; i < r.rfid->uid.size; i++) {
    if (r.rfid->uid.uidByte[i] < 0x10) Serial.print("0");
    Serial.print(r.rfid->uid.uidByte[i], HEX);
  }
  Serial.println();

  // Halt it back to sleep — harmless, since pollForCard() above uses WUPA
  // (not REQA) and will wake it right back up on the next loop pass as long
  // as it's still sitting on the antenna.
  r.rfid->PICC_HaltA();
  r.rfid->PCD_StopCrypto1();
  r.rfid->PCD_AntennaOff();
}

// Checkpoint poll — same WUPA-based detection as the shelves, but debounced:
// the same UID is only reported once per CHECKPOINT_COOLDOWN_MS, so holding
// a book there for a librarian to process doesn't spam repeat "issue" events.
//
// Antenna gated the same way as pollReader() above: on only for this poll,
// off immediately after — it no longer sits there radiating continuously.
void pollCheckpoint() {
  checkpoint.PCD_AntennaOn();

  bool found = pollForCard(&checkpoint) && checkpoint.PICC_ReadCardSerial();

  if (!found) {
    checkpoint.PCD_AntennaOff();
    return;
  }

  triggerScanLed();

  String uid = "";
  for (byte i = 0; i < checkpoint.uid.size; i++) {
    if (checkpoint.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(checkpoint.uid.uidByte[i], HEX);
  }

  unsigned long now = millis();
  bool sameCardStillCoolingDown = (uid == lastCheckpointUID && now < checkpointCooldownUntil);

  if (!sameCardStillCoolingDown) {
    Serial.print("CHECKPOINT,");
    Serial.println(uid);
    lastCheckpointUID = uid;
    checkpointCooldownUntil = now + CHECKPOINT_COOLDOWN_MS;
  }

  checkpoint.PICC_HaltA();
  checkpoint.PCD_StopCrypto1();
  checkpoint.PCD_AntennaOff();
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

// Non-blocking "card scanned" blink — call on every successful read.
void triggerScanLed() {
  digitalWrite(SCAN_LED_PIN, HIGH);
  scanLedOffAt = millis() + SCAN_LED_BLINK_MS;
}

// Call every loop() pass. Turns SCAN_LED_PIN back off once the blink
// window has passed — no delay(), so it never blocks reader polling.
void updateScanLed() {
  if (scanLedOffAt != 0 && millis() >= scanLedOffAt) {
    digitalWrite(SCAN_LED_PIN, LOW);
    scanLedOffAt = 0;
  }
}
