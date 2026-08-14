import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/firebaseAdmin.js';
import { hashPassword, verifyPassword } from '../services/passwordHash.js';
import { sendPasswordResetEmail } from '../services/mailer.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export const auth = Router();

const ROLES = ['librarian', 'student', 'faculty'];
const DESIGNATIONS = ['Professor', 'Assistant Professor', 'Lecturer', 'Research Assistant'];

function normaliseUsername(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

function toUserDto(doc) {
  const d = doc.data();
  return {
    username: doc.id,
    role: d.role,
    name: d.name,
    mobile: d.mobile ?? null,
    email: d.email ?? null,
    studentId: d.studentId ?? null,
    department: d.department ?? null,
    designation: d.designation ?? null,
  };
}

/** POST /api/auth/signup — create a librarian, student, or faculty account. */
auth.post('/signup', async (req, res) => {
  try {
    const body = req.body ?? {};
    const role = body.role;
    const name = String(body.name ?? '').trim();
    const username = normaliseUsername(body.username);
    const password = String(body.password ?? '');

    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
    }
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'name, username and password are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'password must be at least 4 characters' });
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return res.status(400).json({ error: 'username may only contain letters, numbers, dots, dashes and underscores' });
    }

    const record = { role, name, mobile: body.mobile ? String(body.mobile).trim() : null, email: null, studentId: null, department: null, designation: null };

    if (role === 'librarian') {
      if (!body.email) {
        return res.status(400).json({ error: 'email is required for a librarian account' });
      }
      record.email = String(body.email).trim();
    } else if (role === 'student') {
      const { studentId, department, email } = body;
      if (!studentId || !department || !email) {
        return res.status(400).json({ error: 'studentId, department and email are required for a student account' });
      }
      record.studentId = String(studentId).trim();
      record.department = String(department).trim();
      record.email = String(email).trim();
      if (!record.mobile) {
        return res.status(400).json({ error: 'mobile is required for a student account' });
      }
    } else if (role === 'faculty') {
      const { department, designation, email } = body;
      if (!department || !designation || !email) {
        return res.status(400).json({ error: 'department, designation and email are required for a faculty account' });
      }
      if (!DESIGNATIONS.includes(designation)) {
        return res.status(400).json({ error: `designation must be one of: ${DESIGNATIONS.join(', ')}` });
      }
      record.department = String(department).trim();
      record.designation = designation;
      record.email = String(email).trim();
      if (!record.mobile) {
        return res.status(400).json({ error: 'mobile is required for a faculty account' });
      }
    }

    const ref = db.collection('users').doc(username);
    if ((await ref.get()).exists) {
      return res.status(409).json({ error: `Username "${username}" is already taken` });
    }

    record.passwordHash = await hashPassword(password);
    await ref.set(record);

    res.status(201).json(toUserDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/auth/login — verify username/password, return the account (no password). */
auth.post('/login', async (req, res) => {
  try {
    const username = normaliseUsername(req.body?.username);
    const password = String(req.body?.password ?? '');

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const doc = await db.collection('users').doc(username).get();
    if (!doc.exists) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const ok = await verifyPassword(password, doc.data().passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json(toUserDto(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/auth/profile/:username — refetch the current account (e.g. after a page reload). */
auth.get('/profile/:username', async (req, res) => {
  try {
    const doc = await db.collection('users').doc(normaliseUsername(req.params.username)).get();
    if (!doc.exists) return res.status(404).json({ error: 'Account not found' });
    res.json(toUserDto(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/auth/profile/:username — a student/faculty account editing their
 * own contact/affiliation details. Username, role and password are not
 * editable here — role changes the RFID/login shape too much to allow
 * casually, and password changes deserve their own re-auth flow later.
 */
auth.patch('/profile/:username', async (req, res) => {
  try {
    const ref = db.collection('users').doc(normaliseUsername(req.params.username));
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Account not found' });

    const role = doc.data().role;
    const body = req.body ?? {};
    const name = String(body.name ?? '').trim();
    const mobile = body.mobile ? String(body.mobile).trim() : null;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const update = { name, mobile };

    if (role === 'librarian') {
      const email = body.email ? String(body.email).trim() : '';
      if (!email) {
        return res.status(400).json({ error: 'email is required' });
      }
      update.email = email;
    }

    if (role === 'student' || role === 'faculty') {
      const department = body.department ? String(body.department).trim() : '';
      const email = body.email ? String(body.email).trim() : '';
      if (!department || !email || !mobile) {
        return res.status(400).json({ error: 'department, mobile and email are required' });
      }
      update.department = department;
      update.email = email;
    }

    if (role === 'faculty') {
      if (!DESIGNATIONS.includes(body.designation)) {
        return res.status(400).json({ error: `designation must be one of: ${DESIGNATIONS.join(', ')}` });
      }
      update.designation = body.designation;
    }

    await ref.update(update);
    res.json(toUserDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/auth/forgot-password — name + email identify the account (no
 * username needed, since that's the thing being recovered access to). Always
 * responds the same way whether or not a match was found, so this can't be
 * used to probe which emails have accounts.
 */
auth.post('/forgot-password', async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim().toLowerCase();
    const email = String(req.body?.email ?? '').trim().toLowerCase();

    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const snapshot = await db.collection('users').where('email', '==', req.body.email.trim()).get();
    const match = snapshot.docs.find((doc) => String(doc.data().name ?? '').trim().toLowerCase() === name);

    const generic = { message: 'If that name and email match an account, a reset link has been sent.' };

    if (!match) {
      return res.json(generic);
    }

    const token = randomBytes(32).toString('hex');
    await match.ref.update({
      resetTokenHash: hashToken(token),
      resetTokenExpiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    });

    const resetUrl = `${FRONTEND_URL}/#/reset-password?token=${token}&username=${match.id}`;

    try {
      await sendPasswordResetEmail({ to: req.body.email.trim(), name: match.data().name, resetUrl });
    } catch (mailErr) {
      console.error('[auth] Failed to send reset email:', mailErr.message);
      return res.status(500).json({ error: `Could not send the reset email: ${mailErr.message}` });
    }

    res.json(generic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/auth/reset-password — the link from the email lands here with a token. */
auth.post('/reset-password', async (req, res) => {
  try {
    const username = normaliseUsername(req.body?.username);
    const token = String(req.body?.token ?? '');
    const password = String(req.body?.password ?? '');

    if (!username || !token || !password) {
      return res.status(400).json({ error: 'username, token and password are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'password must be at least 4 characters' });
    }

    const ref = db.collection('users').doc(username);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const d = doc.data();
    const validToken = d.resetTokenHash && d.resetTokenHash === hashToken(token);
    const notExpired = d.resetTokenExpiresAt && d.resetTokenExpiresAt > Date.now();

    if (!validToken || !notExpired) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    await ref.update({
      passwordHash: await hashPassword(password),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    });

    res.json({ message: 'Password updated — sign in with your new password.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
