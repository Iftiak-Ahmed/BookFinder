import { BookIcon, CheckIcon, ClockIcon, GearIcon, ShelfIcon, UserIcon } from './Icons.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: ShelfIcon },
  { id: 'students', label: 'Students', Icon: UserIcon },
  { id: 'transactions', label: 'Transactions', Icon: ClockIcon },
  { id: 'settings', label: 'Settings', Icon: GearIcon },
  { id: 'clearance', label: 'Clearance', Icon: CheckIcon },
];

/**
 * A permanent icon-only rail — the librarian's five destinations live here
 * instead of crowding the Dashboard header. Each icon reveals its name in a
 * small floating label on hover, so the rail itself stays uncluttered.
 */
export default function Sidebar({ active, onNavigate, pendingClearanceCount = 0 }) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <span className="sidebar-mark">
        <BookIcon size={16} />
      </span>

      <ul className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <li key={id}>
            <button
              type="button"
              className={`sidebar-btn${active === id ? ' is-active' : ''}`}
              onClick={() => onNavigate(id)}
              aria-current={active === id ? 'page' : undefined}
            >
              <Icon size={18} />
              {id === 'clearance' && pendingClearanceCount > 0 && (
                <span className="sidebar-badge">{pendingClearanceCount}</span>
              )}
              <span className="sidebar-tooltip">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
