import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';

/**
 * ============================================================================
 * ACTIVITY LOG SERVICE
 * ============================================================================
 *
 * Audit trail complet de toutes les actions dans l'application
 */

export type ActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'send_email'
  | 'log_email'
  | 'status_change'
  | 'ai_generate'
  | 'export'
  | 'login';

export type EntityType =
  | 'podcast'
  | 'client'
  | 'match'
  | 'outreach'
  | 'user'
  | 'settings';

export interface ActivityLog {
  id: string;

  // QUI / QUAND
  user_id: string;
  user_email: string;
  user_name: string;
  timestamp: Timestamp;

  // QUOI
  action: ActionType;

  // SUR QUOI
  entity_type: EntityType;
  entity_id: string;
  entity_name: string;

  // DÉTAILS
  description: string;
  changes?: {
    before: any;
    after: any;
    fields_changed: string[];
  };
  metadata?: {
    ip_address?: string;
    user_agent?: string;
    related_client_id?: string;
    related_outreach_id?: string;
    ai_model_used?: string;
    email_sent_to?: string;
  };
}

export interface ActivityLogFilters {
  user_id?: string;
  action?: ActionType;
  entity_type?: EntityType;
  entity_id?: string;
  start_date?: Date;
  end_date?: Date;
}

/**
 * Log an activity
 */
export async function logActivity(
  log: Omit<ActivityLog, 'id' | 'timestamp'>
): Promise<string> {
  try {
    const logsCollection = collection(db, 'activity_logs');

    const newLog = {
      ...log,
      timestamp: Timestamp.now()
    };

    const docRef = await addDoc(logsCollection, newLog);
    console.log('[ActivityLog] Logged:', log.action, log.entity_type, log.entity_name);
    return docRef.id;
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - logging should never break the app
    return '';
  }
}

/**
 * Get activity logs with filters
 */
export async function getActivityLogs(
  filters?: ActivityLogFilters,
  limitCount: number = 100
): Promise<ActivityLog[]> {
  try {
    const logsCollection = collection(db, 'activity_logs');
    let q = query(logsCollection, orderBy('timestamp', 'desc'), limit(limitCount));

    // Apply filters
    if (filters?.user_id) {
      q = query(q, where('user_id', '==', filters.user_id));
    }
    if (filters?.action) {
      q = query(q, where('action', '==', filters.action));
    }
    if (filters?.entity_type) {
      q = query(q, where('entity_type', '==', filters.entity_type));
    }
    if (filters?.entity_id) {
      q = query(q, where('entity_id', '==', filters.entity_id));
    }
    if (filters?.start_date) {
      q = query(q, where('timestamp', '>=', Timestamp.fromDate(filters.start_date)));
    }
    if (filters?.end_date) {
      q = query(q, where('timestamp', '<=', Timestamp.fromDate(filters.end_date)));
    }

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ActivityLog[];
  } catch (error) {
    console.error('Error getting activity logs:', error);
    throw error;
  }
}

/**
 * Get activity logs by user
 */
export async function getActivityLogsByUser(
  userId: string,
  limitCount: number = 50
): Promise<ActivityLog[]> {
  return getActivityLogs({ user_id: userId }, limitCount);
}

/**
 * Get activity logs by entity
 */
export async function getActivityLogsByEntity(
  entityType: EntityType,
  entityId: string,
  limitCount: number = 50
): Promise<ActivityLog[]> {
  return getActivityLogs({ entity_type: entityType, entity_id: entityId }, limitCount);
}

/**
 * Get recent activity (for dashboard)
 */
export async function getRecentActivity(limitCount: number = 10): Promise<ActivityLog[]> {
  return getActivityLogs({}, limitCount);
}

/**
 * Get activity log by ID
 */
export async function getActivityLogById(id: string): Promise<ActivityLog | null> {
  try {
    const docRef = doc(db, 'activity_logs', id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as ActivityLog;
    }
    return null;
  } catch (error) {
    console.error('Error getting activity log by ID:', error);
    throw error;
  }
}

/**
 * Get activity stats (for reports)
 */
export async function getActivityStats(filters?: ActivityLogFilters): Promise<{
  total: number;
  by_action: Record<ActionType, number>;
  by_entity: Record<EntityType, number>;
  by_user: Record<string, number>;
}> {
  try {
    const logs = await getActivityLogs(filters, 10000); // Get more for stats

    const stats = {
      total: logs.length,
      by_action: {} as Record<ActionType, number>,
      by_entity: {} as Record<EntityType, number>,
      by_user: {} as Record<string, number>
    };

    logs.forEach(log => {
      // Count by action
      stats.by_action[log.action] = (stats.by_action[log.action] || 0) + 1;

      // Count by entity
      stats.by_entity[log.entity_type] = (stats.by_entity[log.entity_type] || 0) + 1;

      // Count by user
      stats.by_user[log.user_name] = (stats.by_user[log.user_name] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error('Error getting activity stats:', error);
    throw error;
  }
}

/**
 * Export activity logs to CSV
 */
export async function exportActivityLogsToCSV(filters?: ActivityLogFilters): Promise<string> {
  try {
    const logs = await getActivityLogs(filters, 10000);

    // CSV headers
    const headers = [
      'Timestamp',
      'User Name',
      'User Email',
      'Action',
      'Entity Type',
      'Entity Name',
      'Description',
      'Changes'
    ];

    // CSV rows
    const rows = logs.map(log => [
      log.timestamp.toDate().toISOString(),
      log.user_name,
      log.user_email,
      log.action,
      log.entity_type,
      log.entity_name,
      log.description,
      log.changes ? JSON.stringify(log.changes) : ''
    ]);

    // Build CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  } catch (error) {
    console.error('Error exporting activity logs to CSV:', error);
    throw error;
  }
}
