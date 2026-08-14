import { useCallback, useEffect, useRef, useState } from 'react';
import AccessLogPage from './components/AccessLogPage.jsx';
import CheckpointFeed from './components/CheckpointFeed.jsx';
import ForgotPasswordPage from './components/ForgotPasswordPage.jsx';
import LoginPage from './components/LoginPage.jsx';
import MyAccountPage from './components/MyAccountPage.jsx';
import PlacementToast from './components/PlacementToast.jsx';
import ResetPasswordPage from './components/ResetPasswordPage.jsx';
import ScanOverlay from './components/ScanOverlay.jsx';
import ShelfGrid from './components/ShelfGrid.jsx';
import SignupPage from './components/SignupPage.jsx';
import StatBar from './components/StatBar.jsx';
import StudentsPage from './components/StudentsPage.jsx';
import TransactionHistoryPage from './components/TransactionHistoryPage.jsx';
import WrongPlacementHistory from './components/WrongPlacementHistory.jsx';
import { AlertIcon, BookIcon, ClockIcon, MoonIcon, SunIcon, UserIcon } from './components/Icons.jsx';
import { useAccessLogs } from './hooks/useAccessLogs.js';
import { useBooks } from './hooks/useBooks.js';
import { useMyAccount } from './hooks/useMyAccount.js';
import { usePlacementAlerts } from './hooks/usePlacementAlerts.js';
import { useScanEvents } from './hooks/useScanEvents.js';
import { useStudents } from './hooks/useStudents.js';
import { useTransactions } from './hooks/useTransactions.js';
import { startAlarm, stopAlarm } from './lib/buzzer.js';

/**
 * Screens are real URL hashes, so each one is a browser history entry and the
 * back button walks them: card overlay -> dashboard -> login.
 */
const ROUTE = {
  LOGIN: '#/login',
  SIGNUP: '#/signup',
  FORGOT_PASSWORD: '#/forgot-password',
  RESET_PASSWORD: '#/reset-password',
  MY_ACCOUNT: '#/my',
  DASHBOARD: '#/dashboard',
  CARD: '#/dashboard/card',
  HISTORY: '#/dashboard/history',
  STUDENTS: '#/dashboard/students',
  TRANSACTIONS: '#/dashboard/transactions',
  ACCESS_LOG: '#/dashboard/access-log',
};

/** Librarians get the full operational dashboard; students/faculty get a
 *  single self-service page (issued books + profile) regardless of hash. */
function homeRouteFor(role) {
  return role === 'librarian' ? ROUTE.DASHBOARD : ROUTE.MY_ACCOUNT;
}

const USER_STORAGE_KEY = 'bf-user';

/** The signed-in account — persisted so a page refresh doesn't sign you out. */
function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const signIn = useCallback((account) => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(account));
    setUser(account);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  }, []);

  return { user, signIn, signOut };
}

/** Sounds the buzzer for as long as at least one misplacement alert is open. */
function useAlarm(activeCount) {
  useEffect(() => {
    if (activeCount > 0) startAlarm();
    else stopAlarm();
    return stopAlarm;
  }, [activeCount]);
}

const readHash = () => window.location.hash || ROUTE.LOGIN;

/** Dark by default — a projector in a lit room shows less glare. */
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('bf-theme') ?? 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bf-theme', theme);
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

/** Re-renders on every history navigation, including the back button. */
function useHashRoute() {
  const [hash, setHash] = useState(readHash);

  useEffect(() => {
    // Give the first screen a hash of its own, without adding a history entry,
    // so pressing back from the dashboard lands on the login page rather than
    // leaving the site.
    if (!window.location.hash) {
      window.history.replaceState(null, '', ROUTE.LOGIN);
      setHash(ROUTE.LOGIN);
    }

    const onChange = () => setHash(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return hash;
}

function Dashboard({
  user,
  theme,
  toggleTheme,
  onLogout,
  hash,
  activeAlertCount,
  onOpenHistory,
  onOpenStudents,
  onOpenTransactions,
  onOpenAccessLog,
}) {
  const books = useBooks();
  const scans = useScanEvents();

  const live = books.connected && scans.connected;
  const { latestScan, clearLatestScan } = scans;

  // Shelf reads get their own lightweight toast (correct/wrong placement);
  // the full "Card Inserted" overlay stays reserved for checkpoint traffic.
  const isShelfScan = latestScan?.event_type === 'shelf_scan';
  const overlayScan = latestScan && !isShelfScan ? latestScan : null;
  const shelfToast = isShelfScan ? latestScan : null;

  // A new card pushes the overlay route, so back closes it. A second card
  // arriving while the overlay is already open must not stack another entry.
  useEffect(() => {
    if (overlayScan && window.location.hash !== ROUTE.CARD) {
      window.location.hash = ROUTE.CARD;
    }
  }, [overlayScan]);

  // Dismiss only on an actual transition AWAY from the card route. Comparing
  // hash !== CARD directly would fire in the same render that sets the scan —
  // the hashchange event has not landed yet — and close the overlay instantly.
  const previousHash = useRef(hash);
  useEffect(() => {
    if (previousHash.current === ROUTE.CARD && hash !== ROUTE.CARD) clearLatestScan();
    previousHash.current = hash;
  }, [hash, clearLatestScan]);

  const closeOverlay = useCallback(() => {
    if (window.location.hash === ROUTE.CARD) window.history.back();
    else clearLatestScan();
  }, [clearLatestScan]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <BookIcon size={17} />
          </span>
          <div>
            <h1>BookFinder</h1>
            <p className="brand-sub">RFID shelf tracking</p>
          </div>
        </div>

        <div className="header-tools">
          <span className={`conn${live ? ' is-live' : ''}`}>
            <span className="conn-dot" />
            {live ? 'Live' : 'Connecting'}
          </span>

          <button
            type="button"
            className={`pill alert-count-pill${activeAlertCount > 0 ? ' is-critical' : ' is-muted'}`}
            style={{ border: 0, cursor: 'pointer' }}
            onClick={onOpenHistory}
          >
            <AlertIcon size={12} />
            Active Alerts: {activeAlertCount}
          </button>

          <button type="button" className="text-btn" onClick={onOpenStudents}>
            <UserIcon size={12} /> Students
          </button>

          <button type="button" className="text-btn" onClick={onOpenTransactions}>
            <ClockIcon size={12} /> Transactions
          </button>

          <button type="button" className="text-btn" onClick={onOpenAccessLog}>
            <UserIcon size={12} /> Access Log
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>

          {user && (
            <span className="user-chip" title={user.role}>
              <UserIcon size={12} />
              {user.name} · {user.role}
            </span>
          )}

          <button type="button" className="text-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        {books.error && (
          <div className="banner" role="alert">
            <AlertIcon size={15} />
            <span>
              Cannot reach the backend ({books.error}). Start it with <code>npm start</code> in the{' '}
              <code>backend</code> folder — the dashboard needs it for the first load.
            </span>
          </div>
        )}

        <StatBar books={books.books} />

        <div className="layout">
          <ShelfGrid books={books.books} loading={books.loading} flashed={books.flashed} />
          <CheckpointFeed events={scans.events} loading={scans.loading} liveIds={scans.liveIds} />
        </div>
      </main>

      {/* Driven by the scan itself, not the hash, so the card shows the instant
          it is read rather than waiting for the history entry to land. */}
      <ScanOverlay scan={overlayScan} onClose={closeOverlay} />

      {/* Wrong/correct shelf placement — a lightweight toast, separate from the
          full checkpoint overlay above. The alarm itself keeps sounding via
          useAlarm even after this auto-dismisses. */}
      <PlacementToast scan={shelfToast} onDismiss={clearLatestScan} />
    </div>
  );
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const hash = useHashRoute();
  const { user, signIn, signOut } = useAuth();
  const alerts = usePlacementAlerts();
  useAlarm(alerts.activeAlerts.length);
  // Called unconditionally (before the auth check below) — see the hook's
  // own note on why it has to tolerate a null user.
  const myAccount = useMyAccount(user);

  const onSignup = hash.startsWith(ROUTE.SIGNUP);
  const onForgotPassword = hash.startsWith(ROUTE.FORGOT_PASSWORD);
  const onResetPassword = hash.startsWith(ROUTE.RESET_PASSWORD);
  const onHistory = hash.startsWith(ROUTE.HISTORY);
  const onStudents = hash.startsWith(ROUTE.STUDENTS);
  const onTransactions = hash.startsWith(ROUTE.TRANSACTIONS);
  const onAccessLog = hash.startsWith(ROUTE.ACCESS_LOG);

  const students = useStudents();
  const transactions = useTransactions();
  const accessLogs = useAccessLogs();

  // Assigning the hash (rather than replaceState) is what creates the history
  // entry the back button needs.
  const login = useCallback(
    (account) => {
      signIn(account);
      window.location.hash = homeRouteFor(account.role);
    },
    [signIn]
  );

  const signedUp = useCallback(
    (account) => {
      signIn(account);
      window.location.hash = homeRouteFor(account.role);
    },
    [signIn]
  );

  const logout = useCallback(() => {
    signOut();
    window.location.hash = ROUTE.LOGIN;
  }, [signOut]);

  const goToSignup = useCallback(() => {
    window.location.hash = ROUTE.SIGNUP;
  }, []);

  const goToLogin = useCallback(() => {
    window.location.hash = ROUTE.LOGIN;
  }, []);

  const goToForgotPassword = useCallback(() => {
    window.location.hash = ROUTE.FORGOT_PASSWORD;
  }, []);

  const openHistory = useCallback(() => {
    window.location.hash = ROUTE.HISTORY;
  }, []);

  const openStudents = useCallback(() => {
    window.location.hash = ROUTE.STUDENTS;
  }, []);

  const openTransactions = useCallback(() => {
    window.location.hash = ROUTE.TRANSACTIONS;
  }, []);

  const openAccessLog = useCallback(() => {
    window.location.hash = ROUTE.ACCESS_LOG;
  }, []);

  const backToDashboard = useCallback(() => {
    window.location.hash = ROUTE.DASHBOARD;
  }, []);

  if (!user) {
    if (onSignup) return <SignupPage onSignedUp={signedUp} onGoToLogin={goToLogin} />;
    if (onForgotPassword) return <ForgotPasswordPage onGoToLogin={goToLogin} />;
    if (onResetPassword) return <ResetPasswordPage hash={hash} onGoToLogin={goToLogin} />;
    return <LoginPage onLogin={login} onGoToSignup={goToSignup} onGoToForgotPassword={goToForgotPassword} />;
  }

  // Students and faculty only ever see their own self-service page, no
  // matter what the hash says — the operational dashboard below is
  // librarian-only.
  if (user.role !== 'librarian') {
    return (
      <MyAccountPage myAccount={myAccount} account={user} onLogout={logout} onUpdateAccount={signIn} />
    );
  }

  if (onHistory) {
    return (
      <WrongPlacementHistory
        alerts={alerts.alerts}
        activeCount={alerts.activeAlerts.length}
        loading={alerts.loading}
        onResolve={alerts.resolve}
        onBack={backToDashboard}
      />
    );
  }

  if (onStudents) {
    return (
      <StudentsPage
        students={students.students}
        loading={students.loading}
        error={students.error}
        fetchIssuedBooks={students.fetchIssuedBooks}
        onBack={backToDashboard}
      />
    );
  }

  if (onTransactions) {
    return (
      <TransactionHistoryPage
        transactions={transactions.transactions}
        loading={transactions.loading}
        error={transactions.error}
        onBack={backToDashboard}
      />
    );
  }

  if (onAccessLog) {
    return (
      <AccessLogPage
        logs={accessLogs.logs}
        loading={accessLogs.loading}
        error={accessLogs.error}
        onBack={backToDashboard}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      theme={theme}
      toggleTheme={toggleTheme}
      onLogout={logout}
      hash={hash}
      activeAlertCount={alerts.activeAlerts.length}
      onOpenHistory={openHistory}
      onOpenStudents={openStudents}
      onOpenTransactions={openTransactions}
      onOpenAccessLog={openAccessLog}
    />
  );
}
