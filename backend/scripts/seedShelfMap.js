import '../src/db/firebaseAdmin.js';
import { db } from '../src/db/firebaseAdmin.js';
import { RACKS, rackLabel } from '../src/rackCatalog.js';

for (const [readerId, rack] of Object.entries(RACKS)) {
  await db.collection('shelfMap').doc(readerId).set({
    dept: rack.dept,
    position: rack.position,
    subject: rack.subject,
    shelfLabel: rackLabel(readerId),
  });
  console.log(`Seeded ${readerId} -> ${rackLabel(readerId)}`);
}

process.exit(0);
