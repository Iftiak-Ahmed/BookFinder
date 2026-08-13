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
process.exit(0);
