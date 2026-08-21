import { RACKS, rackLabel } from './rackCatalog.js';

/**
 * All 7 physical RFID readers — the checkpoint plus the 6 shelf readers
 * already defined in rackCatalog.js. Single source of truth for seeding the
 * `rfidReaders` status collection and the Settings page's reader table.
 */
export const READERS = {
  CHECKPOINT: {
    name: 'Main Entry Reader',
    type: 'entry',
    location: 'Library Entrance / Checkpoint Desk',
  },
  ...Object.fromEntries(
    Object.entries(RACKS).map(([readerId, rack]) => [
      readerId,
      {
        name: `${rack.dept} ${rack.position} Shelf Reader`,
        type: 'shelf',
        location: rackLabel(readerId),
      },
    ])
  ),
};
