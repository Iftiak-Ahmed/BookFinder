import { db, FieldValue } from '../db/firebaseAdmin.js';

/**
 * Raise a notification, deduped the same way placementAlerts are: if an
 * unread notification of the same type + related entity already exists,
 * refresh it instead of piling up duplicates for the same condition.
 */
export async function raiseNotification({
  type,
  message,
  priority = 'medium',
  relatedBookId = null,
  relatedStudentId = null,
}) {
  try {
    let query = db.collection('notifications').where('type', '==', type).where('read', '==', false);
    if (relatedBookId) query = query.where('relatedBookId', '==', relatedBookId);
    if (relatedStudentId) query = query.where('relatedStudentId', '==', relatedStudentId);

    const existing = await query.limit(1).get();

    if (!existing.empty) {
      await existing.docs[0].ref.update({ message, priority, updatedAt: FieldValue.serverTimestamp() });
      return;
    }

    await db.collection('notifications').add({
      type,
      message,
      priority,
      relatedBookId,
      relatedStudentId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[notifications] Failed to raise notification:', err.message);
  }
}
