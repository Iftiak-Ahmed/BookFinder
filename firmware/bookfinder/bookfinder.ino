#include <SPI.h>
#include <MFRC522.h>

#define RST_PIN 22
#define LED_PIN 2
#define BUZZER_PIN 27

MFRC522 reader1(5, RST_PIN);
MFRC522 reader2(17, RST_PIN);
MFRC522 reader3(25, RST_PIN);
MFRC522 reader4(33, RST_PIN);
MFRC522 reader5(16, RST_PIN);
MFRC522 reader6(4, RST_PIN);
MFRC522 reader7(26, RST_PIN);

const unsigned long READER_ACTIVE_MS = 60;
const unsigned long LED_BLINK_MS = 120;
const unsigned long BUZZ_MS = 600;
const byte NUM_READERS = 7;

// koto bar consecutive miss holey "card sorano hoise" dhorbo
const byte MISS_LIMIT = 3;

struct ReaderSlot {
  MFRC522* reader;
  const char* label;
  const char* shelf;      // "" mane checkpoint

  // runtime state
  bool occupied;
  String lastUid;
  byte missCount;
};

ReaderSlot readers[NUM_READERS] = {
  { &reader1, "READER_1", "EEE_LOWER",     false, "", 0 },  // pin 5
  { &reader2, "READER_2", "SCIENCE_UPPER", false, "", 0 },  // pin 17
  { &reader3, "READER_3", "SCIENCE_LOWER", false, "", 0 },  // pin 25
  { &reader4, "READER_4", "CSE_UPPER",     false, "", 0 },  // pin 33
  { &reader5, "READER_5", "EEE_UPPER",     false, "", 0 },  // pin 16
  { &reader6, "READER_6", "CSE_LOWER",     false, "", 0 },  // pin 4
  { &reader7, "READER_7", "",              false, "", 0 }   // pin 26 - checkpoint
};

struct BookInfo {
  const char* uid;
  const char* title;
  const char* correctShelf;
};

BookInfo books[] = {
  { "60 0A 7A 5C", "Microelectronic Circuits - Adel S. Sedra", "EEE_LOWER" },
  { "A1 98 18 0A", "Electric Machinery - Stephen J. Chapman", "EEE_UPPER" },
  { "C0 08 06 5C", "Calculus - Michael Spivak", "SCIENCE_UPPER" },
  { "50 81 23 5C", "Artificial Intelligence - Elaine Rich", "CSE_LOWER" },
  { "B0 8E D2 5C", "Fundamentals of Physics - David Halliday", "SCIENCE_LOWER" },
  { "B0 E4 21 5C", "Operating Systems - William Stallings", "CSE_UPPER" }
};
const byte NUM_BOOKS = sizeof(books) / sizeof(books[0]);

// false = library te ache, true = issue kora hoise
bool issued[sizeof(books) / sizeof(books[0])];

struct PersonInfo {
  const char* uid;
  const char* info;
  const char* name;
};

PersonInfo people[] = {
  { "B0 AB 4F 5C", "ID: 202314025, Name: Isbat, Dept: CSE",       "Isbat" },
  { "C0 15 4B 5C", "ID: 202114202, Name: Lt Iftiak, Dept: CSE",   "Lt Iftiak" },
  { "C0 51 F7 5C", "ID: 202214085, Name: Maj Refa, Dept: CSE",    "Maj Refa" },
  { "B0 63 D9 5C", "ID: 202214163, Name: Maj Mustari, Dept: CSE", "Maj Mustari" }
};
const byte NUM_PEOPLE = sizeof(people) / sizeof(people[0]);

// checkpoint e person card dhorle porer 15s er moddhe je boi tap hobe
// tar shathe oi person attach hoye jabe
const unsigned long USER_HOLD_MS = 15000;
int activeUser = -1;
unsigned long activeUserTill = 0;

// non-blocking LED / buzzer
unsigned long ledOffAt = 0;
unsigned long buzzOffAt = 0;

void ledBlink() { digitalWrite(LED_PIN, HIGH); ledOffAt = millis() + LED_BLINK_MS; }
void buzzOn()   { digitalWrite(BUZZER_PIN, HIGH); buzzOffAt = millis() + BUZZ_MS; }

void serviceOutputs() {
  unsigned long now = millis();
  if (ledOffAt && now >= ledOffAt)   { digitalWrite(LED_PIN, LOW); ledOffAt = 0; }
  if (buzzOffAt && now >= buzzOffAt) { digitalWrite(BUZZER_PIN, LOW); buzzOffAt = 0; }
}

void setup() {
  Serial.begin(115200);
  SPI.begin();
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  for (byte i = 0; i < NUM_BOOKS; i++) issued[i] = false;

  for (byte i = 0; i < NUM_READERS; i++) {
    readers[i].reader->PCD_Init();
    readers[i].reader->PCD_SetAntennaGain(MFRC522::RxGain_max);
    readers[i].reader->PCD_AntennaOff();
    printReaderVersion(*readers[i].reader, readers[i].label);
  }

  Serial.println("7 readers ready, scan a card...");
}

void printReaderVersion(MFRC522 &reader, const char* label) {
  byte version = reader.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.print(label);
  Serial.print(" version reg: 0x");
  Serial.println(version, HEX);
  if (version == 0x00 || version == 0xFF) {
    Serial.print(label);
    Serial.println(" -> NOT RESPONDING (check wiring/power)");
  }
}

void loop() {
  for (byte i = 0; i < NUM_READERS; i++) {
    runReader(readers[i]);
    serviceOutputs();
  }
  if (activeUser >= 0 && millis() > activeUserTill) activeUser = -1;
}

void runReader(ReaderSlot &slot) {
  slot.reader->PCD_AntennaOn();
  delay(5);   // RF field settle

  bool isCheckpoint = strlen(slot.shelf) == 0;
  bool found = false;
  String uid = "";

  unsigned long start = millis();
  while (millis() - start < READER_ACTIVE_MS) {
    if (slot.reader->PICC_IsNewCardPresent() && slot.reader->PICC_ReadCardSerial()) {
      uid = readUid(*slot.reader);
      found = true;
      slot.reader->PICC_HaltA();
      slot.reader->PCD_StopCrypto1();
      break;
    }
  }

  slot.reader->PCD_AntennaOff();

  if (isCheckpoint) handleCheckpoint(slot, found, uid);
  else              handleShelf(slot, found, uid);
}

String readUid(MFRC522 &reader) {
  String uid = "";
  for (byte i = 0; i < reader.uid.size; i++) {
    if (reader.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(reader.uid.uidByte[i], HEX);
    if (i < reader.uid.size - 1) uid += " ";
  }
  uid.toUpperCase();
  return uid;
}

// ---------------- SHELF ----------------
void handleShelf(ReaderSlot &slot, bool found, String uid) {
  if (found) {
    slot.missCount = 0;

    // notun boi rakha hoise (ba boi bodle gese)
    if (!slot.occupied || slot.lastUid != uid) {
      slot.occupied = true;
      slot.lastUid = uid;
      ledBlink();
      reportPlaced(slot, uid);
    }
    // same boi ekhono ache -> kichu print korchi na, dashboard already ON_SHELF
    return;
  }

  if (!slot.occupied) return;

  if (++slot.missCount >= MISS_LIMIT) {
    reportRemoved(slot);
    slot.occupied = false;
    slot.lastUid = "";
    slot.missCount = 0;
    ledBlink();
  }
}

void reportPlaced(ReaderSlot &slot, String uid) {
  int b = findBook(uid);

  if (b < 0) {
    Serial.print(slot.label);
    Serial.print(" ("); Serial.print(slot.shelf); Serial.print(") UID: ");
    Serial.println(uid);
    Serial.println("Unknown card - not registered yet");
    Serial.print("REPORT,"); Serial.print(uid); Serial.print(",");
    Serial.print(slot.shelf); Serial.println(",,UNKNOWN");
    Serial.println("------------------------");
    return;
  }

  bool ok = (String(slot.shelf) == String(books[b].correctShelf));

  Serial.print(slot.label);
  Serial.print(" ("); Serial.print(slot.shelf); Serial.print(") UID: ");
  Serial.println(uid);
  Serial.print("Book: "); Serial.println(books[b].title);

  if (ok) {
    Serial.println("Status: OK");
  } else {
    Serial.print("Status: MISPLACED (should be on ");
    Serial.print(books[b].correctShelf);
    Serial.println(")");
    buzzOn();
  }

  Serial.print("REPORT,");
  Serial.print(uid); Serial.print(",");
  Serial.print(slot.shelf); Serial.print(",");
  Serial.print(books[b].correctShelf); Serial.print(",");
  Serial.println(ok ? "OK" : "MISPLACED");
  Serial.println("------------------------");
}

void reportRemoved(ReaderSlot &slot) {
  int b = findBook(slot.lastUid);

  Serial.print(slot.label);
  Serial.print(" ("); Serial.print(slot.shelf); Serial.println(") BOOK REMOVED");
  if (b >= 0) { Serial.print("Book: "); Serial.println(books[b].title); }

  Serial.print("REMOVE,");
  Serial.print(slot.lastUid); Serial.print(",");
  Serial.print(slot.shelf); Serial.println(",NOT_SCANNED");
  Serial.println("------------------------");
}

// ---------------- CHECKPOINT ----------------
void handleCheckpoint(ReaderSlot &slot, bool found, String uid) {
  if (!found) {
    // ek-dui bar miss holey reset korchi na, noile flaky read e double scan hoy
    if (slot.occupied && ++slot.missCount >= MISS_LIMIT) {
      slot.occupied = false;
      slot.lastUid = "";
      slot.missCount = 0;
    }
    return;
  }

  slot.missCount = 0;

  // same card ekhono boshe ache -> already handle kora hoise
  if (slot.occupied && slot.lastUid == uid) return;

  slot.occupied = true;
  slot.lastUid = uid;
  ledBlink();

  int p = findPerson(uid);
  if (p >= 0) {
    activeUser = p;
    activeUserTill = millis() + USER_HOLD_MS;
    Serial.print(slot.label); Serial.print(" (CHECKPOINT) UID: ");
    Serial.println(uid);
    Serial.println(people[p].info);
    Serial.print("PERSON,"); Serial.print(uid); Serial.print(",");
    Serial.println(people[p].name);
    Serial.println("------------------------");
    return;
  }

  int b = findBook(uid);
  if (b < 0) {
    Serial.print(slot.label); Serial.print(" (CHECKPOINT) UID: ");
    Serial.println(uid);
    Serial.println("Unknown card - not registered yet");
    Serial.print("CHECKPOINT,"); Serial.print(uid); Serial.println(",,UNKNOWN,");
    Serial.println("------------------------");
    return;
  }

  issued[b] = !issued[b];                 // toggle
  const char* action = issued[b] ? "ISSUED" : "DEPOSITED";

  Serial.print(slot.label); Serial.print(" (CHECKPOINT) UID: ");
  Serial.println(uid);
  Serial.print("Book: "); Serial.println(books[b].title);
  Serial.print("Action: "); Serial.println(action);
  if (activeUser >= 0) {
    Serial.print("By: "); Serial.println(people[activeUser].name);
  }

  Serial.print("CHECKPOINT,");
  Serial.print(uid); Serial.print(",");
  Serial.print(books[b].correctShelf); Serial.print(",");
  Serial.print(action); Serial.print(",");
  Serial.println(activeUser >= 0 ? people[activeUser].name : "");
  Serial.println("------------------------");
}

// ---------------- LOOKUP ----------------
int findBook(String uid) {
  for (byte i = 0; i < NUM_BOOKS; i++)
    if (uid == books[i].uid) return i;
  return -1;
}

int findPerson(String uid) {
  for (byte i = 0; i < NUM_PEOPLE; i++)
    if (uid == people[i].uid) return i;
  return -1;
}