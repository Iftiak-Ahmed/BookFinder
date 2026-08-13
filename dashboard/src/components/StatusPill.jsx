import { STATE, STATE_LABEL, STATE_TONE, TONE_VAR } from '../lib/format.js';
import { AlertIcon, CheckIcon, ClockIcon, OutIcon } from './Icons.jsx';

const STATE_ICON = {
  [STATE.SHELVED]: CheckIcon,
  [STATE.MISPLACED]: AlertIcon,
  [STATE.OUT]: OutIcon,
  [STATE.UNSEEN]: ClockIcon,
};

/**
 * Status is icon + word, never colour alone — which is also what keeps the
 * low-contrast warning hue readable: the label is ink, only the icon is tinted.
 */
export default function StatusPill({ state }) {
  const Icon = STATE_ICON[state];
  const tone = TONE_VAR[STATE_TONE[state]];

  return (
    <span
      className={`pill${state === STATE.UNSEEN ? ' is-muted' : ''}`}
      style={{ '--pill-tone': tone.tone, '--pill-wash': tone.wash }}
    >
      <Icon size={12} />
      {STATE_LABEL[state]}
    </span>
  );
}
