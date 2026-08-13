/**
 * Single source of truth for the 6 physical racks. shelfMap seeding and book
 * registration both read from here, so a rack's dept/position/subject can
 * never drift between the two.
 */
export const RACKS = {
  CSE_UPPER: { dept: 'CSE', position: 'Upper', subject: 'Operating System' },
  CSE_LOWER: { dept: 'CSE', position: 'Lower', subject: 'Artificial Intelligence' },
  EEE_UPPER: { dept: 'EEE', position: 'Upper', subject: 'Electric Machinery' },
  EEE_LOWER: { dept: 'EEE', position: 'Lower', subject: 'Microelectronic Circuits' },
  SNH_UPPER: { dept: 'Science & Humanities', position: 'Upper', subject: 'Mathematics' },
  SNH_LOWER: { dept: 'Science & Humanities', position: 'Lower', subject: 'Physics' },
};

export function rackLabel(rackId) {
  const rack = RACKS[rackId];
  if (!rack) return null;
  return `${rack.dept} · ${rack.position} Rack · ${rack.subject}`;
}

export function getRack(rackId) {
  return RACKS[rackId] ?? null;
}
