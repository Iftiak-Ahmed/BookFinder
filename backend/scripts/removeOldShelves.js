import '../src/db/firebaseAdmin.js';
import { db } from '../src/db/firebaseAdmin.js';

for (const id of ['SHELF1_A', 'SHELF2_A']) {
  await db.collection('shelfMap').doc(id).delete();
  console.log(`Removed ${id}`);
}

process.exit(0);
