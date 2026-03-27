import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import {
  Outreach,
  OutreachStatus,
  OutreachStatusCategory,
  EmailMessage,
  OutreachNote,
  OutreachReminder,
  getOutreachStatusCategory,
  migrateOutreachToNewSchema
} from '../types';

/**
 * ============================================================================
 * OUTREACH SERVICE V2 - With Backward Compatibility
 * ============================================================================
 *
 * This service handles both old and new outreach schemas:
 * - Reads old data from Firestore
 * - Migrates automatically to new schema in memory
 * - Saves using new schema
 * - No manual migration needed!
 */

// ============================================================================
// CACHE SYSTEM - Reduces Firestore reads
// ============================================================================
let outreachCache: Outreach[] | null = null;
let outreachCacheTimestamp: number = 0;
const OUTREACH_CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache

/**
 * Invalidate the outreach cache (call after updates)
 */
export function invalidateOutreachCache(): void {
  outreachCache = null;
  outreachCacheTimestamp = 0;
  console.log('[OutreachV2] Cache invalidated');
}

/**
 * Get all outreach with caching (faster for repeated loads)
 */
export async function getAllOutreachV2Cached(): Promise<Outreach[]> {
  const now = Date.now();

  // Return cached data if valid
  if (outreachCache && (now - outreachCacheTimestamp) < OUTREACH_CACHE_TTL) {
    console.log('[OutreachV2] Returning cached data, age:', Math.round((now - outreachCacheTimestamp) / 1000), 'seconds');
    return outreachCache;
  }

  // Fetch fresh data
  console.log('[OutreachV2] Cache miss - fetching fresh data');
  const freshData = await getAllOutreachV2();
  outreachCache = freshData;
  outreachCacheTimestamp = now;
  return freshData;
}

/**
 * Get all outreach documents (with automatic migration) - NO CACHE
 */
export async function getAllOutreachV2(): Promise<Outreach[]> {
  try {
    const outreachCollection = collection(db, 'outreach');
    // Don't use orderBy if created_at might not exist on all documents
    const snapshot = await getDocs(outreachCollection);

    console.log('[OutreachV2] Raw documents loaded:', snapshot.docs.length);

    const results = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      console.log('[OutreachV2] Processing doc:', docSnap.id, {
        hasEmailThread: !!data.email_thread,
        oldStatus: data['Outreach Status'],
        status: data.status,
        clientId: data.clientId,
        showName: data.showName
      });

      // Check if it's old schema (no email_thread field)
      if (!data.email_thread) {
        // SIMPLIFIED: Just add minimal new schema fields, keep everything else
        const result = {
          ...data, // Keep ALL original Firestore fields including "Outreach Date"
          id: docSnap.id,
          // Add ONLY the required new fields
          client_id: data.clientId || data.client_id || '',
          client_name: data.clientName || data.client_name || 'Unknown Client',
          podcast_id: data.itunesId || data.podcast_id || '',
          podcast_itunes_id: data.itunesId || data.podcast_itunes_id,
          podcast_name: data.showName || data.podcast_name || 'Unknown Podcast',
          podcast_url: data.showLink || data.podcast_url,
          host_email: data.hostContactInfo?.email || data.host_email,
          // Map status from old "Outreach Status" field
          status: (() => {
            const oldStatus = data['Outreach Status'];
            if (!oldStatus) return data.status || 'ready_for_outreach';

            // Complete mapping of legacy status values
            const statusMap: Record<string, OutreachStatus> = {
              'Ready for outreach': 'ready_for_outreach',
              '1st message sent': '1st_email_sent',
              '1st follow- up sent': '1st_followup_sent',  // Note: space after "follow-"
              '1st follow-up sent': '1st_followup_sent',
              '2nd follow-up sent': '2nd_followup_sent',
              'In Contact': 'in_contact',
              'Scheduling Screening Call': 'scheduling_screening',
              'Screening Call Scheduled': 'screening_scheduled',
              'Scheduling Recording': 'scheduling_recording',
              'Recording Scheduled': 'recording_scheduled',
              'Recorded': 'recorded',
              'Live': 'live',
              'Host said no': 'declined_by_host',
              'Email bounced': 'email_bounced',
              'Paid podcast': 'paid_podcast',
              'Blacklist': 'blacklist',
              'No Response': 'no_response',
              'Backlog': 'backlog',
              'Cancelled': 'cancelled',
            };

            return statusMap[oldStatus] || data.status || 'ready_for_outreach';
          })(),
          created_at: data.createdAt || data.created_at || Timestamp.now(),
          updated_at: data.updatedAt || data.updated_at || Timestamp.now(),
          // Initialize empty arrays for new schema
          email_thread: [],
          notes: [],
          reminders: [],
          email_stats: { total_sent: 0, total_received: 0, awaiting_reply: false },
        } as Outreach;

        console.log('[OutreachV2] Migrated result:', {
          id: result.id,
          status: result.status,
          hasRawData: !!(result as any).rawData,
          outreachDateFromRawData: (result as any).rawData?.['Outreach Date'],
          allKeys: Object.keys(result).slice(0, 10) // Show first 10 keys
        });

        return result;
      }

      // Already new schema
      return {
        id: docSnap.id,
        ...data
      } as Outreach;
    });

    // Sort by created_at after loading
    results.sort((a, b) => {
      const aTime = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
      const bTime = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
      return bTime - aTime;
    });

    console.log('[OutreachV2] Final results:', results.length, 'items');
    console.log('[OutreachV2] Status breakdown:', results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>));

    return results;
  } catch (error) {
    console.error('Error getting outreach:', error);
    throw error;
  }
}

/**
 * Get outreach by ID (with automatic migration)
 */
export async function getOutreachByIdV2(id: string): Promise<Outreach | null> {
  try {
    const docRef = doc(db, 'outreach', id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();

      // Check if old schema
      if (!data.email_thread) {
        const migrated = migrateOutreachToNewSchema(data);
        return {
          id: docSnap.id,
          ...migrated
        } as Outreach;
      }

      return {
        id: docSnap.id,
        ...data
      } as Outreach;
    }
    return null;
  } catch (error) {
    console.error('Error getting outreach by ID:', error);
    throw error;
  }
}

/**
 * Get outreach by client ID (with automatic migration)
 */
export async function getOutreachByClientIdV2(clientId: string): Promise<Outreach[]> {
  try {
    const outreachCollection = collection(db, 'outreach');
    const q = query(
      outreachCollection,
      where('client_id', '==', clientId)
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map(docSnap => {
      const data = docSnap.data();

      // Check if old schema
      if (!data.email_thread) {
        const migrated = migrateOutreachToNewSchema(data);
        return {
          id: docSnap.id,
          ...migrated
        } as Outreach;
      }

      return {
        id: docSnap.id,
        ...data
      } as Outreach;
    });

    // Sort by created_at descending
    results.sort((a, b) => {
      if (!a.created_at || !b.created_at) return 0;
      return b.created_at.toMillis() - a.created_at.toMillis();
    });

    return results;
  } catch (error) {
    console.error('Error getting outreach by client ID:', error);
    throw error;
  }
}

/**
 * Get outreach by status
 */
export async function getOutreachByStatusV2(status: OutreachStatus): Promise<Outreach[]> {
  try {
    const outreachCollection = collection(db, 'outreach');
    const q = query(
      outreachCollection,
      where('status', '==', status),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();

      if (!data.email_thread) {
        const migrated = migrateOutreachToNewSchema(data);
        return {
          id: docSnap.id,
          ...migrated
        } as Outreach;
      }

      return {
        id: docSnap.id,
        ...data
      } as Outreach;
    });
  } catch (error) {
    console.error('Error getting outreach by status:', error);
    throw error;
  }
}

/**
 * Get outreach by status category
 */
export async function getOutreachByStatusCategoryV2(
  category: OutreachStatusCategory
): Promise<Outreach[]> {
  try {
    const allOutreach = await getAllOutreachV2();
    return allOutreach.filter(o => o.status_category === category);
  } catch (error) {
    console.error('Error getting outreach by status category:', error);
    throw error;
  }
}

/**
 * Update outreach document (saves with new schema)
 */
export async function updateOutreachV2(
  id: string,
  updates: Partial<Outreach>
): Promise<void> {
  try {
    const docRef = doc(db, 'outreach', id);

    // Always calculate status_category when status changes
    if (updates.status) {
      updates.status_category = getOutreachStatusCategory(updates.status);
    }

    await updateDoc(docRef, {
      ...updates,
      updated_at: Timestamp.now()
    });

    // Invalidate cache after successful update
    invalidateOutreachCache();
  } catch (error) {
    console.error('Error updating outreach:', error);
    throw error;
  }
}

/**
 * Update outreach status
 */
export async function updateOutreachStatusV2(
  id: string,
  status: OutreachStatus,
  userId?: string
): Promise<void> {
  try {
    const updateData: any = {
      status,
      status_category: getOutreachStatusCategory(status),
      previous_status: (await getOutreachByIdV2(id))?.status,
      status_changed_at: Timestamp.now(),
    };

    // Only add status_changed_by if userId is defined (Firestore doesn't accept undefined)
    if (userId) {
      updateData.status_changed_by = userId;
    }

    await updateOutreachV2(id, updateData);
  } catch (error) {
    console.error('Error updating outreach status:', error);
    throw error;
  }
}

/**
 * Get all blacklisted podcast IDs
 * Used to filter out blacklisted podcasts from search results
 */
export async function getBlacklistedPodcastIds(): Promise<Set<string>> {
  const outreachList = await getAllOutreachV2Cached();
  const blacklisted = outreachList
    .filter(o => o.status === 'blacklist' || o.blacklist === true)
    .map(o => o.podcast_itunes_id || o.podcast_id)
    .filter(Boolean) as string[];
  return new Set(blacklisted);
}

/**
 * Add email to thread
 */
export async function addEmailToThreadV2(
  outreachId: string,
  email: EmailMessage
): Promise<void> {
  try {
    const outreach = await getOutreachByIdV2(outreachId);
    if (!outreach) throw new Error('Outreach not found');

    const updatedThread = [...(outreach.email_thread || []), email];

    // Calculate new email stats
    const sent = updatedThread.filter(e => e.direction === 'outbound').length;
    const received = updatedThread.filter(e => e.direction === 'inbound').length;
    const lastOutbound = updatedThread.filter(e => e.direction === 'outbound').sort((a, b) =>
      (b.sent_at?.toMillis() || 0) - (a.sent_at?.toMillis() || 0)
    )[0];
    const lastInbound = updatedThread.filter(e => e.direction === 'inbound').sort((a, b) =>
      (b.received_at?.toMillis() || 0) - (a.received_at?.toMillis() || 0)
    )[0];

    await updateOutreachV2(outreachId, {
      email_thread: updatedThread,
      email_stats: {
        total_sent: sent,
        total_received: received,
        last_outbound_at: lastOutbound?.sent_at,
        last_inbound_at: lastInbound?.received_at,
        awaiting_reply: email.direction === 'outbound',
        awaiting_reply_since: email.direction === 'outbound' ? email.sent_at : outreach.email_stats?.awaiting_reply_since,
      },
    });
  } catch (error) {
    console.error('Error adding email to thread:', error);
    throw error;
  }
}

/**
 * Add note to outreach
 */
export async function addNoteToOutreachV2(
  outreachId: string,
  note: OutreachNote
): Promise<void> {
  try {
    const outreach = await getOutreachByIdV2(outreachId);
    if (!outreach) throw new Error('Outreach not found');

    const updatedNotes = [...(outreach.notes || []), note];

    await updateOutreachV2(outreachId, {
      notes: updatedNotes,
    });
  } catch (error) {
    console.error('Error adding note:', error);
    throw error;
  }
}

/**
 * Add reminder to outreach
 */
export async function addReminderToOutreachV2(
  outreachId: string,
  reminder: OutreachReminder
): Promise<void> {
  try {
    const outreach = await getOutreachByIdV2(outreachId);
    if (!outreach) throw new Error('Outreach not found');

    const updatedReminders = [...(outreach.reminders || []), reminder];

    await updateOutreachV2(outreachId, {
      reminders: updatedReminders,
    });
  } catch (error) {
    console.error('Error adding reminder:', error);
    throw error;
  }
}

/**
 * Complete reminder
 */
export async function completeReminderV2(
  outreachId: string,
  reminderIndex: number
): Promise<void> {
  try {
    const outreach = await getOutreachByIdV2(outreachId);
    if (!outreach) throw new Error('Outreach not found');

    const updatedReminders = [...(outreach.reminders || [])];
    if (updatedReminders[reminderIndex]) {
      updatedReminders[reminderIndex].completed = true;
      updatedReminders[reminderIndex].completed_at = Timestamp.now();
    }

    await updateOutreachV2(outreachId, {
      reminders: updatedReminders,
    });
  } catch (error) {
    console.error('Error completing reminder:', error);
    throw error;
  }
}

/**
 * Create new outreach document (with new schema)
 */
export async function createOutreachV2(
  data: Omit<Outreach, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  try {
    const outreachCollection = collection(db, 'outreach');

    // Ensure new schema fields are initialized
    const newData = {
      ...data,
      status_category: getOutreachStatusCategory(data.status),
      email_thread: data.email_thread || [],
      notes: data.notes || [],
      reminders: data.reminders || [],
      email_stats: data.email_stats || {
        total_sent: 0,
        total_received: 0,
        awaiting_reply: false,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };

    const docRef = await addDoc(outreachCollection, newData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating outreach:', error);
    throw error;
  }
}

/**
 * Get active reminders (due soon)
 */
export async function getActiveRemindersV2(): Promise<Array<{
  outreach: Outreach;
  reminder: OutreachReminder;
  reminderIndex: number;
}>> {
  try {
    const allOutreach = await getAllOutreachV2();
    const now = Timestamp.now();
    const results: Array<{
      outreach: Outreach;
      reminder: OutreachReminder;
      reminderIndex: number;
    }> = [];

    for (const outreach of allOutreach) {
      if (outreach.reminders) {
        outreach.reminders.forEach((reminder, index) => {
          if (!reminder.completed && reminder.due_at && reminder.due_at.toMillis() <= now.toMillis()) {
            results.push({ outreach, reminder, reminderIndex: index });
          }
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error getting active reminders:', error);
    return [];
  }
}
