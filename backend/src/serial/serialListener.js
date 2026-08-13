import { SerialPort, ReadlineParser } from 'serialport';
import { processScanLine } from '../services/scanProcessor.js';

const RECONNECT_DELAY_MS = 3_000;

let port = null;

/**
 * Print the available ports — useful when SERIAL_PORT is wrong, which during a
 * demo is the single most likely thing to go sideways.
 */
async function listPorts() {
  try {
    const ports = await SerialPort.list();
    if (!ports.length) {
      console.log('[serial] No serial ports detected. Is the ESP32 plugged in?');
      return;
    }
    console.log('[serial] Available ports:');
    for (const p of ports) {
      console.log(`         ${p.path}  ${p.manufacturer ?? ''}`);
    }
  } catch {
    /* listing is best-effort */
  }
}

export function startSerialListener({ path, baudRate }) {
  console.log(`[serial] Opening ${path} at ${baudRate} baud...`);

  port = new SerialPort({ path, baudRate, autoOpen: false });

  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  parser.on('data', (line) => {
    // Fire and forget: the serial stream must not block on Firestore latency.
    processScanLine(line).catch((err) => console.error('[serial] processing error:', err));
  });

  port.on('open', () => console.log(`[serial] Connected to ${path}. Listening for scans.`));

  port.on('close', () => {
    console.warn('[serial] Port closed. Retrying...');
    scheduleReconnect({ path, baudRate });
  });

  port.on('error', (err) => {
    console.error(`[serial] ${err.message}`);
  });

  port.open(async (err) => {
    if (err) {
      console.error(`[serial] Could not open ${path}: ${err.message}`);
      await listPorts();
      console.log(
        '[serial] Close the Arduino IDE Serial Monitor if it is open — it holds the port.'
      );
      scheduleReconnect({ path, baudRate });
    }
  });

  return port;
}

let reconnectTimer = null;

function scheduleReconnect(config) {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startSerialListener(config);
  }, RECONNECT_DELAY_MS);
}

export function stopSerialListener() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (port?.isOpen) port.close();
}

/**
 * Send a command line to the ESP32 (e.g. to drive the misplacement buzzer).
 * A no-op when the port isn't open — the dashboard/backend must keep working
 * during demos where the ESP32 is unplugged.
 */
export function sendCommand(line) {
  if (!port?.isOpen) return;
  port.write(`${line}\n`, (err) => {
    if (err) console.error(`[serial] Failed to write "${line}":`, err.message);
  });
}
