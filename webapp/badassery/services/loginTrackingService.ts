import { db } from './firebase';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
  limit
} from 'firebase/firestore';

/**
 * ============================================================================
 * LOGIN TRACKING SERVICE
 * ============================================================================
 *
 * Tracks all login attempts in Firestore for audit purposes
 */

export interface LoginRecord {
  id?: string;
  user_type: 'admin' | 'employee' | 'client';
  user_id: string;
  user_email?: string;
  user_name: string;
  client_id?: string; // Only for client logins
  login_method: 'username_password' | 'name_lookup';
  success: boolean;
  error_message?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: Timestamp;
}

const COLLECTION_NAME = 'logins';

/**
 * Record a login attempt (successful or failed)
 */
export async function recordLogin(data: Omit<LoginRecord, 'id' | 'timestamp'>): Promise<string> {
  try {
    const loginsCollection = collection(db, COLLECTION_NAME);

    const record: Omit<LoginRecord, 'id'> = {
      ...data,
      timestamp: Timestamp.now(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    const docRef = await addDoc(loginsCollection, record);
    console.log('[LoginTracking] Login recorded:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('[LoginTracking] Error recording login:', error);
    throw error;
  }
}

/**
 * Record a successful admin/employee login
 */
export async function recordAdminLogin(userId: string, userName: string, userEmail?: string): Promise<string> {
  return recordLogin({
    user_type: 'admin',
    user_id: userId,
    user_email: userEmail,
    user_name: userName,
    login_method: 'username_password',
    success: true,
  });
}

/**
 * Record a failed admin/employee login
 */
export async function recordFailedAdminLogin(userName: string, errorMessage: string): Promise<string> {
  return recordLogin({
    user_type: 'admin',
    user_id: 'unknown',
    user_name: userName,
    login_method: 'username_password',
    success: false,
    error_message: errorMessage,
  });
}

/**
 * Record a successful client login
 */
export async function recordClientLogin(
  clientId: string,
  userName: string,
  userEmail?: string
): Promise<string> {
  return recordLogin({
    user_type: 'client',
    user_id: `client_${clientId}`,
    user_email: userEmail,
    user_name: userName,
    client_id: clientId,
    login_method: 'name_lookup',
    success: true,
  });
}

/**
 * Record a failed client login
 */
export async function recordFailedClientLogin(
  firstName: string,
  lastName: string,
  errorMessage: string
): Promise<string> {
  return recordLogin({
    user_type: 'client',
    user_id: 'unknown',
    user_name: `${firstName} ${lastName}`,
    login_method: 'name_lookup',
    success: false,
    error_message: errorMessage,
  });
}

/**
 * Get recent login history
 */
export async function getRecentLogins(limitCount: number = 50): Promise<LoginRecord[]> {
  try {
    const loginsCollection = collection(db, COLLECTION_NAME);
    const q = query(
      loginsCollection,
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as LoginRecord[];
  } catch (error) {
    console.error('[LoginTracking] Error getting recent logins:', error);
    throw error;
  }
}

/**
 * Get login history for a specific user
 */
export async function getUserLogins(userId: string, limitCount: number = 20): Promise<LoginRecord[]> {
  try {
    const loginsCollection = collection(db, COLLECTION_NAME);
    const q = query(
      loginsCollection,
      where('user_id', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as LoginRecord[];
  } catch (error) {
    console.error('[LoginTracking] Error getting user logins:', error);
    throw error;
  }
}

/**
 * Get failed login attempts (for security monitoring)
 */
export async function getFailedLogins(limitCount: number = 50): Promise<LoginRecord[]> {
  try {
    const loginsCollection = collection(db, COLLECTION_NAME);
    const q = query(
      loginsCollection,
      where('success', '==', false),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as LoginRecord[];
  } catch (error) {
    console.error('[LoginTracking] Error getting failed logins:', error);
    throw error;
  }
}

/**
 * Get client login history
 */
export async function getClientLogins(clientId: string, limitCount: number = 20): Promise<LoginRecord[]> {
  try {
    const loginsCollection = collection(db, COLLECTION_NAME);
    const q = query(
      loginsCollection,
      where('client_id', '==', clientId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as LoginRecord[];
  } catch (error) {
    console.error('[LoginTracking] Error getting client logins:', error);
    throw error;
  }
}
