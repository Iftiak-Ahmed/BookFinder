/**
 * Registers one student's RFID card, so that once the ESP32 scans that card
 * for real, the backend already knows who it belongs to. Run once per
 * student while issuing physical cards.
 *
 * Usage:
 *   node scripts/registerStudent.js --uid=A1B2C3D4 --studentId=202114202 \
 *     --name="Lt Iftiak" --dept=CSE
 */
import '../src/db/firebaseAdmin.js';
import { db } from '../src/db/firebaseAdmin.js';

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([\w-]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const { uid, studentId, name, dept } = parseArgs();

if (!uid || !studentId || !name || !dept) {
  console.error(
    'Usage: node scripts/registerStudent.js --uid=HEXUID --studentId=202114202 --name="..." --dept=CSE'
  );
  process.exit(1);
}

const normalisedUid = uid.trim().toUpperCase().replace(/[\s:-]/g, '');
if (!/^[0-9A-F]+$/.test(normalisedUid)) {
  console.error(`"${uid}" is not a valid hex RFID UID.`);
  process.exit(1);
}

await db.collection('students').doc(normalisedUid).set({
  studentId,
  name,
  dept,
  status: 'Outside',
});

console.log(`Registered ${normalisedUid} -> ${studentId} - ${name} (${dept})`);
process.exit(0);
