/**
 * "Scan the Book" arms the checkpoint reader to capture the NEXT tag it sees
 * as a new book's UID instead of processing it as a normal checkpoint tap
 * (see the intercept in scanProcessor.js). In-memory and single-session by
 * design — registering books is a one-librarian-at-a-time workflow, same as
 * the old (pre-Firestore) pendingStudent used to be.
 */
let capture = { armed: false, uid: null, armedAt: null, capturedAt: null };

export function armCapture() {
  capture = { armed: true, uid: null, armedAt: Date.now(), capturedAt: null };
}

export function getCapture() {
  return capture;
}

export function clearCapture() {
  capture = { armed: false, uid: null, armedAt: null, capturedAt: null };
}

/** Called from the scan pipeline. Returns true if it consumed the scan
 *  (caller should skip normal checkpoint processing for this tap). */
export function tryCaptureRegistration(uid) {
  if (!capture.armed) return false;
  capture = { armed: false, uid, armedAt: capture.armedAt, capturedAt: Date.now() };
  return true;
}
