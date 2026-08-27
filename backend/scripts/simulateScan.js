import '../src/db/firebaseAdmin.js';
import { loadShelfMap } from '../src/services/shelfLookup.js';
import { processScanLine } from '../src/services/scanProcessor.js';

await loadShelfMap();

const line = process.argv[2];
if (!line) {
  console.error('Usage: node scripts/simulateScan.js "READER_ID,UID"');
  process.exit(1);
}

await processScanLine(line);

// A few writes inside processScanLine (placement alerts, transactions) are
// deliberately fire-and-forget so a real scan isn't slowed down by them —
// but that means exiting immediately here would cut them off mid-write.
// Generous on purpose: this script's Firestore connection is cold (a fresh
// process every run), and a cold read+write pair can take a couple seconds.
await new Promise((resolve) => setTimeout(resolve, 3000));
process.exit(0);
