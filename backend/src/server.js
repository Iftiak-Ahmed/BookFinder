import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { api } from './routes/api.js';
import { loadShelfMap } from './services/shelfLookup.js';
import { startSerialListener, stopSerialListener } from './serial/serialListener.js';

const PORT = Number(process.env.PORT ?? 4000);
const SERIAL_PORT = process.env.SERIAL_PORT ?? 'COM3';
const BAUD_RATE = Number(process.env.BAUD_RATE ?? 115200);

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', api);

async function main() {
  // The shelf map has to be in memory before the first scan arrives.
  await loadShelfMap();

  app.listen(PORT, () => {
    console.log(`[api] REST API on http://localhost:${PORT}/api`);
  });

  startSerialListener({ path: SERIAL_PORT, baudRate: BAUD_RATE });
}

main().catch((err) => {
  console.error('[boot] Startup failed:', err.message);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n[boot] Shutting down...');
    stopSerialListener();
    process.exit(0);
  });
}
