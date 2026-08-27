/** Firestore book doc -> the snake_case shape the rest of the dashboard expects. */
export function bookFromDoc(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    rfid_uid: doc.id,
    title: d.title ?? null,
    author: d.author ?? null,
    copy_no: d.copyNo ?? null,
    dept: d.dept ?? null,
    correct_shelf: d.correctShelf ?? null,
    current_shelf: d.currentShelf ?? null,
    status: d.status ?? 'in_library',
    is_misplaced: d.isMisplaced ?? false,
    issued_to: d.issuedTo ?? null,
    last_seen_at: d.lastSeenAt?.toDate ? d.lastSeenAt.toDate().toISOString() : null,
  };
}

/** Firestore scanEvents doc -> the snake_case shape (with nested students/books) the dashboard expects. */
export function eventFromDoc(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    reader_id: d.readerId,
    uid: d.uid,
    event_type: d.eventType,
    book_status: d.bookStatus,
    student_id: d.studentId ?? null,
    book_id: d.bookId ?? null,
    is_misplaced: d.isMisplaced ?? null,
    detected_shelf: d.detectedShelf ?? null,
    correct_shelf: d.correctShelf ?? null,
    created_at: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : null,
    students: d.studentName
      ? { name: d.studentName, student_id: d.studentNumber ?? null, dept: d.studentDept ?? null }
      : null,
    books: d.bookTitle
      ? {
          title: d.bookTitle,
          author: d.bookAuthor ?? null,
          copy_no: d.copyNo ?? null,
          status: d.bookStatus ?? null,
          correct_shelf: d.correctShelf ?? null,
        }
      : null,
  };
}

/** Firestore clearanceRequests doc -> the snake_case shape the dashboard expects. */
export function clearanceRequestFromDoc(doc) {
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
    created_at: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : null,
    decided_at: d.decidedAt?.toDate ? d.decidedAt.toDate().toISOString() : null,
  };
}

/** Firestore placementAlerts doc -> the snake_case shape for the history table. */
export function alertFromDoc(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    book_id: d.bookId,
    book_title: d.bookTitle,
    copy_no: d.copyNo ?? null,
    correct_shelf: d.correctShelf,
    detected_shelf: d.detectedShelf,
    status: d.status,
    created_at: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : null,
    resolved_at: d.resolvedAt?.toDate ? d.resolvedAt.toDate().toISOString() : null,
  };
}
