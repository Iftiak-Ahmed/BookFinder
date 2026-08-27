import { Router } from 'express';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { db, FieldValue } from '../db/firebaseAdmin.js';
import { raiseNotification } from '../services/notifications.js';

export const clearance = Router();

const DEPARTMENTS = ['CE', 'CSE', 'EECE', 'ME', 'IPE', 'Architecture'];

const LOGO_PATH = fileURLToPath(new URL('../../assets/mist-logo.png', import.meta.url));

/** One character at a time along a circular arc — pdfkit has no native
 *  curved-text primitive, so the seal's banner text is hand-placed per glyph.
 *  `startDeg`/`endDeg` are measured clockwise from the top (12 o'clock = 0). */
function drawArcText(pdf, text, cx, cy, radius, startDeg, endDeg, fontSize, color) {
  const chars = [...text];
  if (chars.length === 0) return;
  const step = chars.length > 1 ? (endDeg - startDeg) / (chars.length - 1) : 0;

  pdf.fontSize(fontSize).fillColor(color);
  chars.forEach((ch, i) => {
    const deg = startDeg + step * i;
    const rad = (deg * Math.PI) / 180;
    const x = cx + radius * Math.sin(rad);
    const y = cy - radius * Math.cos(rad);
    const w = pdf.widthOfString(ch);

    pdf.save();
    pdf.translate(x, y);
    pdf.rotate(deg);
    pdf.text(ch, -w / 2, -fontSize / 2, { lineBreak: false });
    pdf.restore();
  });
}

/** A circular "Central Library, MIST" ink stamp — two rings, curved banner
 *  text, and a centered "APPROVED", tilted slightly like a real stamp
 *  pressed by hand. */
function drawLibrarySeal(pdf, cx, cy) {
  const ink = '#9a1b1b';

  pdf.save();
  pdf.rotate(-11, { origin: [cx, cy] });
  pdf.opacity(0.82);

  pdf.circle(cx, cy, 44).lineWidth(1.6).stroke(ink);
  pdf.circle(cx, cy, 37).lineWidth(0.75).stroke(ink);

  drawArcText(pdf, 'CENTRAL LIBRARY MIST', cx, cy, 40, -70, 70, 6.2, ink);

  pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(ink);
  pdf.text('APPROVED', cx - 32, cy - 4, { width: 64, align: 'center', lineBreak: false });
  pdf.font('Helvetica').fontSize(6.3);
  pdf.text('DHAKA CANTONMENT', cx - 36, cy + 11, { width: 72, align: 'center', lineBreak: false });

  pdf.opacity(1);
  pdf.restore();
}

/** An abstract cursive-looking flourish standing in for a librarian's
 *  handwritten signature — a few overlapping bezier waves plus an underline. */
function drawSignature(pdf, x, y) {
  pdf.save();
  pdf.lineCap('round').lineJoin('round');

  pdf.strokeColor('#1c2b6b').lineWidth(1.1);
  pdf
    .moveTo(x, y)
    .bezierCurveTo(x + 8, y - 15, x + 14, y + 11, x + 24, y - 4)
    .bezierCurveTo(x + 30, y - 15, x + 35, y + 5, x + 43, y - 8)
    .bezierCurveTo(x + 51, y - 19, x + 59, y + 6, x + 69, y - 2)
    .bezierCurveTo(x + 78, y - 11, x + 86, y + 3, x + 95, y - 6)
    .stroke();

  pdf.lineWidth(0.8).moveTo(x - 4, y + 11).lineTo(x + 98, y + 9).stroke();
  pdf.restore();
}

function toIso(ts) {
  return ts?.toDate ? ts.toDate().toISOString() : null;
}

function toClearanceDto(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    student_username: d.studentUsername,
    full_name: d.fullName,
    student_id: d.studentIdNumber,
    session: d.session,
    department: d.department,
    card_uid: d.cardUid ?? null,
    status: d.status,
    rejection_reason: d.rejectionReason ?? null,
    certificate_number: d.certificateNumber ?? null,
    decided_by: d.decidedBy ?? null,
    created_at: toIso(d.createdAt),
    decided_at: toIso(d.decidedAt),
  };
}

/** The RFID card registered against this student ID, if any. */
async function findCardUid(studentIdNumber) {
  const snap = await db.collection('students').where('studentId', '==', studentIdNumber).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/** Titles of every book currently checked out to this card — same query
 *  DELETE /api/students/:id uses to block removal while books are out. */
async function outstandingBookTitles(cardUid) {
  if (!cardUid) return [];
  const snap = await db
    .collection('books')
    .where('issuedTo', '==', cardUid)
    .where('status', '==', 'checked_out')
    .get();
  return snap.docs.map((d) => d.data().title);
}

/** POST /api/clearance/requests — a student applies for library clearance. */
clearance.post('/requests', async (req, res) => {
  try {
    const { username, full_name, student_id, session, department } = req.body ?? {};

    if (!username || !full_name || !student_id || !session || !department) {
      return res.status(400).json({ error: 'full_name, student_id, session and department are required' });
    }
    if (!DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: `department must be one of: ${DEPARTMENTS.join(', ')}` });
    }

    const existingPending = await db
      .collection('clearanceRequests')
      .where('studentUsername', '==', username)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existingPending.empty) {
      return res.status(409).json({ error: 'You already have a pending clearance request.' });
    }

    const cardUid = await findCardUid(String(student_id).trim());
    const titles = await outstandingBookTitles(cardUid);

    if (titles.length > 0) {
      return res.status(409).json({
        error: `You have ${titles.length} book(s) still checked out (${titles.join(', ')}). Return them before applying for clearance.`,
      });
    }

    const ref = await db.collection('clearanceRequests').add({
      studentUsername: username,
      fullName: String(full_name).trim(),
      studentIdNumber: String(student_id).trim(),
      session: String(session).trim(),
      department,
      cardUid,
      status: 'pending',
      rejectionReason: null,
      certificateNumber: null,
      decidedBy: null,
      createdAt: FieldValue.serverTimestamp(),
      decidedAt: null,
    });

    // Fire-and-forget: raiseNotification already swallows its own errors and
    // the apply response doesn't need to wait on it.
    raiseNotification({
      type: 'clearance_request',
      priority: 'medium',
      message: `${full_name} (${student_id}) applied for library clearance.`,
      relatedStudentId: cardUid,
    });

    res.status(201).json(toClearanceDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/clearance/requests — librarian queue, newest first. Optional
 *  ?status=pending|approved|rejected filter (applied in JS, not the query,
 *  to avoid needing a where+orderBy composite index). */
clearance.get('/requests', async (req, res) => {
  try {
    const snapshot = await db.collection('clearanceRequests').orderBy('createdAt', 'desc').get();
    let requests = snapshot.docs.map(toClearanceDto);
    if (req.query.status) requests = requests.filter((r) => r.status === req.query.status);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/clearance/requests/mine/:username — a student's own application
 *  history, newest first. Equality-only query (no composite index needed);
 *  sorted here in JS, same trick fetchIssuedBooks uses for its ISSUE lookup. */
clearance.get('/requests/mine/:username', async (req, res) => {
  try {
    const snapshot = await db
      .collection('clearanceRequests')
      .where('studentUsername', '==', req.params.username)
      .get();

    const requests = snapshot.docs
      .map(toClearanceDto)
      .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/clearance/requests/:id/approve — librarian approves. Eligibility
 *  is re-checked here too (not just at apply time) in case a book was
 *  checked out to this student in the meantime. */
clearance.patch('/requests/:id/approve', async (req, res) => {
  try {
    const ref = db.collection('clearanceRequests').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Request not found' });

    const d = doc.data();
    if (d.status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been decided.' });
    }

    const cardUid = await findCardUid(d.studentIdNumber);
    const titles = await outstandingBookTitles(cardUid);

    if (titles.length > 0) {
      return res.status(409).json({
        error: `${d.fullName} still has ${titles.length} book(s) checked out (${titles.join(', ')}) — cannot approve.`,
      });
    }

    const certificateNumber = `LC-${new Date().getFullYear()}-${req.params.id.slice(-6).toUpperCase()}`;

    await ref.update({
      status: 'approved',
      certificateNumber,
      decidedBy: req.body?.reviewed_by ?? null,
      decidedAt: FieldValue.serverTimestamp(),
    });

    res.json(toClearanceDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/clearance/requests/:id/reject — librarian rejects with a reason. */
clearance.patch('/requests/:id/reject', async (req, res) => {
  try {
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });

    const ref = db.collection('clearanceRequests').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Request not found' });

    if (doc.data().status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been decided.' });
    }

    await ref.update({
      status: 'rejected',
      rejectionReason: reason,
      decidedBy: req.body?.reviewed_by ?? null,
      decidedAt: FieldValue.serverTimestamp(),
    });

    res.json(toClearanceDto(await ref.get()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/clearance/requests/:id/certificate.pdf — streams the certificate,
 *  only once the request has been approved. */
clearance.get('/requests/:id/certificate.pdf', async (req, res) => {
  try {
    const doc = await db.collection('clearanceRequests').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Request not found' });

    const d = doc.data();
    if (d.status !== 'approved') {
      return res.status(409).json({ error: 'Certificate not available until the request is approved.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Clearance-${d.certificateNumber}.pdf"`);

    const issueDate = d.decidedAt?.toDate ? d.decidedAt.toDate() : new Date();

    const pdf = new PDFDocument({ size: 'A4', margin: 60 });
    pdf.pipe(res);

    const pageW = pdf.page.width;
    const contentW = pageW - 120;

    // Double-ruled border frame.
    pdf.rect(28, 28, pageW - 56, pdf.page.height - 56).lineWidth(1.2).stroke('#1c2b6b');
    pdf.rect(33, 33, pageW - 66, pdf.page.height - 66).lineWidth(0.5).stroke('#1c2b6b');

    // Letterhead — crest + institute identity.
    pdf.image(LOGO_PATH, pageW / 2 - 32, 52, { width: 64 });
    pdf.y = 122;

    pdf.font('Helvetica-Bold').fontSize(16).fillColor('#111')
      .text('MILITARY INSTITUTE OF SCIENCE AND TECHNOLOGY', 60, pdf.y, { width: contentW, align: 'center' });
    pdf.font('Helvetica').fontSize(9.5).fillColor('#333');
    pdf.text('Mirpur Cantonment, Dhaka-1216, Bangladesh', { width: contentW, align: 'center' });
    pdf.font('Helvetica-Oblique').fontSize(9).fillColor('#555');
    pdf.text('"Technology for Advancement"', { width: contentW, align: 'center' });
    pdf.moveDown(0.5);
    pdf.font('Helvetica-Bold').fontSize(11).fillColor('#1c2b6b');
    pdf.text('C E N T R A L   L I B R A R Y', { width: contentW, align: 'center' });

    pdf.moveDown(0.6);
    pdf.moveTo(60, pdf.y).lineTo(pageW - 60, pdf.y).lineWidth(1).stroke('#1c2b6b');
    pdf.moveDown(1.2);

    // Title.
    pdf.font('Helvetica-Bold').fontSize(18).fillColor('#111');
    pdf.text('LIBRARY CLEARANCE CERTIFICATE', { width: contentW, align: 'center' });
    pdf.moveDown(1);

    // Certificate No / Date meta row.
    const metaY = pdf.y;
    pdf.font('Helvetica').fontSize(10).fillColor('#333');
    pdf.text(`Certificate No: ${d.certificateNumber}`, 60, metaY, { width: contentW / 2, align: 'left' });
    pdf.text(`Date of Issue: ${issueDate.toDateString()}`, 60 + contentW / 2, metaY, {
      width: contentW / 2,
      align: 'right',
    });
    pdf.moveDown(1.5);

    // Body. Explicit x — the meta row above left the text cursor's x parked
    // at its right-aligned column, and text() without x resumes from there.
    pdf.font('Helvetica').fontSize(11.5).fillColor('#111').text(
      `This is to certify that the student named below is a bona fide member of the Military Institute of Science and Technology (MIST) and has cleared all outstanding dues with the Central Library. As of the date of issuance, no book(s) are checked out against the student's name.`,
      60,
      pdf.y,
      { width: contentW, align: 'justify' }
    );
    pdf.moveDown(1.6);

    // Student details — bordered form block.
    const boxTop = pdf.y;
    const rows = [
      ['Full Name', d.fullName],
      ['Student ID', d.studentIdNumber],
      ['Department', d.department],
      ['Session', d.session],
    ];
    const rowH = 24;
    const boxH = rowH * rows.length;
    pdf.rect(60, boxTop, contentW, boxH).lineWidth(0.75).stroke('#999');

    rows.forEach(([label, value], i) => {
      const rowY = boxTop + i * rowH;
      if (i > 0) pdf.moveTo(60, rowY).lineTo(60 + contentW, rowY).lineWidth(0.5).stroke('#ccc');
      pdf.font('Helvetica-Bold').fontSize(10.5).fillColor('#333')
        .text(label, 74, rowY + 6.5, { width: 130, lineBreak: false });
      pdf.font('Helvetica').fontSize(10.5).fillColor('#111')
        .text(value, 210, rowY + 6.5, { width: contentW - 160, lineBreak: false });
    });

    pdf.y = boxTop + boxH + 34;

    pdf.font('Helvetica').fontSize(10).fillColor('#333').text(
      'This certificate is valid for submission to the Directorate of Academics and other administrative offices as proof of library clearance.',
      60,
      pdf.y,
      { width: contentW, align: 'justify' }
    );

    // Seal + signature block, fixed near the foot of the page.
    const sealCx = 160;
    const sealCy = 660;
    drawLibrarySeal(pdf, sealCx, sealCy);

    const sigX = 340;
    const sigBaseline = 655;
    drawSignature(pdf, sigX, sigBaseline);

    pdf.font('Helvetica').fontSize(10).fillColor('#111');
    pdf.text('Librarian', sigX, sigBaseline + 22, { width: 160, lineBreak: false });
    pdf.font('Helvetica').fontSize(8.5).fillColor('#555');
    pdf.text('Central Library, MIST', sigX, sigBaseline + 36, { width: 160, lineBreak: false });
    pdf.text(issueDate.toDateString(), sigX, sigBaseline + 49, { width: 160, lineBreak: false });

    pdf.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});
