/**
 * Registers one physical book against its RFID tag UID, so that once the
 * ESP32 scans that tag for real, the backend already knows the title/author/
 * correct rack. Run once per book while tagging the physical collection.
 *
 * Usage:
 *   node scripts/registerBook.js --uid=A1B2C3D4 --title="Operating System" \
 *     --author="A. Silberschatz" --copy=1 --rack=CSE_UPPER
 *
 * --rack must be one of: CSE_UPPER, CSE_LOWER, EEE_UPPER, EEE_LOWER, SNH_UPPER, SNH_LOWER
 */
import '../src/db/firebaseAdmin.js';
import { db } from '../src/db/firebaseAdmin.js';
import { RACKS, rackLabel } from '../src/rackCatalog.js';

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([\w-]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const { uid, title, author = '', copy = '1', rack } = parseArgs();

if (!uid || !title || !rack) {
  console.error('Usage: node scripts/registerBook.js --uid=HEXUID --title="..." --author="..." --copy=1 --rack=CSE_UPPER');
  process.exit(1);
}

const normalisedUid = uid.trim().toUpperCase().replace(/[\s:-]/g, '');
if (!/^[0-9A-F]+$/.test(normalisedUid)) {
  console.error(`"${uid}" is not a valid hex RFID UID.`);
  process.exit(1);
}

if (!RACKS[rack]) {
  console.error(`Unknown rack "${rack}". Valid racks: ${Object.keys(RACKS).join(', ')}`);
  process.exit(1);
}

await db.collection('books').doc(normalisedUid).set({
  title,
  author,
  copyNo: Number(copy),
  dept: RACKS[rack].dept,
  correctShelf: rackLabel(rack),
  currentShelf: null,
  status: 'in_library',
  isMisplaced: false,
  issuedTo: null,
  lastSeenAt: null,
});

console.log(`Registered ${normalisedUid} -> "${title}" (${rackLabel(rack)})`);
process.exit(0);
