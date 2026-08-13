/**
 * BookFinder firmware — single-reader checkpoint sketch + misplacement alert.
 *
 * NOT verified against real hardware from this environment. Flash it,
 * confirm wiring against firmware/README.md, and test the buzzer/LED
 * behaviour physically before relying on it.
 *
 * Inbound (ESP32 -> backend), unchanged from the existing sketch contract:
 *   "UID: B0 E3 90 5C"        every tag read, single-reader format
 *
 * Outbound (backend -> ESP32), new in this revision:
 *   "ALERT:MISPLACED"         a shelf scan found a book on the wrong rack —
 *                             turn the buzzer + LED on
 *   "ALERT:CLEAR"             the most recent shelf scan was correct —
 *                             turn the buzzer + LED off
 *
 * See firmware/README.md for the full wiring tables (SPI pins, per-reader
 * SS pins for the eventual 7-reader layout) and the multi-reader
 * "READER_ID,UID" format this same parsing approach extends to.
 */

#include <SPI.h>
#include <MFRC522.h>

#define RST_PIN   22
#define SS_PIN    5
#define BUZZER_PIN 25
#define LED_PIN    26

MFRC522 rfid(SS_PIN, RST_PIN);

bool alertActive = false;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  Serial.println("BookFinder reader ready. Scan a card...");
}

void loop() {
  readCommandsFromBackend();
  readCardIfPresent();
}

/** Listen for ALERT:MISPLACED / ALERT:CLEAR lines from the backend. */
void readCommandsFromBackend() {
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

void readCardIfPresent() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  Serial.print("UID: ");
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) Serial.print("0");
    Serial.print(rfid.uid.uidByte[i], HEX);
    if (i + 1 < rfid.uid.size) Serial.print(" ");
  }
  Serial.println();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
