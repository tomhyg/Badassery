import { db, auth } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

/**
 * ============================================================================
 * USER SERVICE
 * ============================================================================
 *
 * Gestion des utilisateurs avec rôles et permissions
 */

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;

  // Rôle & Permissions
  role: 'admin' | 'employee' | 'client' | 'viewer';
  permissions: string[]; // ['search', 'match', 'outreach', 'clients', 'settings']

  // Lien vers client si role = client
  client_id: string | null;

  // Status
  status: 'active' | 'inactive' | 'invited';

  // Metadata
  created_at: Timestamp;
  last_login_at: Timestamp;
  created_by: string;

  // First login password change
  must_change_password?: boolean;
}

/**
 * Get all users
 */
export async function getAllUsers(): Promise<User[]> {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection, orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  try {
    const docRef = doc(db, 'users', id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as User;
    }
    return null;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection, where('email', '==', email));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      } as User;
    }
    return null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    throw error;
  }
}

/**
 * Create new user
 */
export async function createUser(
  userData: Omit<User, 'id' | 'created_at' | 'last_login_at'>
): Promise<string> {
  try {
    const usersCollection = collection(db, 'users');

    // Check if user with email already exists
    const existing = await getUserByEmail(userData.email);
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const newUser = {
      ...userData,
      created_at: Timestamp.now(),
      last_login_at: Timestamp.now()
    };

    const docRef = await addDoc(usersCollection, newUser);
    console.log('User created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Update user
 */
export async function updateUser(
  id: string,
  updates: Partial<Omit<User, 'id' | 'created_at'>>
): Promise<void> {
  try {
    const docRef = doc(db, 'users', id);
    await updateDoc(docRef, updates);
    console.log('User updated:', id);
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

/**
 * Delete user
 */
export async function deleteUser(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'users', id);
    await deleteDoc(docRef);
    console.log('User deleted:', id);
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

/**
 * Get users by role
 */
export async function getUsersByRole(role: 'admin' | 'employee' | 'client'): Promise<User[]> {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(
      usersCollection,
      where('role', '==', role),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
  } catch (error) {
    console.error('Error getting users by role:', error);
    throw error;
  }
}

/**
 * Get users by status
 */
export async function getUsersByStatus(status: 'active' | 'inactive' | 'invited'): Promise<User[]> {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(
      usersCollection,
      where('status', '==', status),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
  } catch (error) {
    console.error('Error getting users by status:', error);
    throw error;
  }
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  try {
    await updateUser(userId, {
      last_login_at: Timestamp.now()
    });
  } catch (error) {
    console.error('Error updating last login:', error);
    throw error;
  }
}

/**
 * Get current user (from localStorage or context)
 * TODO: Replace with proper auth context
 */
export function getCurrentUser(): User | null {
  try {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      return JSON.parse(userStr);
    }
    return null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Set current user (in localStorage)
 * TODO: Replace with proper auth context
 */
export function setCurrentUser(user: User): void {
  try {
    localStorage.setItem('currentUser', JSON.stringify(user));
  } catch (error) {
    console.error('Error setting current user:', error);
  }
}

/**
 * Clear current user (logout)
 */
export function clearCurrentUser(): void {
  try {
    localStorage.removeItem('currentUser');
  } catch (error) {
    console.error('Error clearing current user:', error);
  }
}

/**
 * ============================================================================
 * SIMPLE LOGIN SYSTEM (for development/testing)
 * ============================================================================
 */

// Hard-coded admin user for testing
const ADMIN_USER: User = {
  id: 'admin_brooklynn',
  email: 'brooklynn@badassery.co',
  display_name: 'Brooklynn',
  avatar_url: 'https://ui-avatars.com/api/?name=Brooklynn&background=8b5cf6&color=fff',
  role: 'admin',
  permissions: ['search', 'match', 'outreach', 'clients', 'settings'],
  client_id: null,
  status: 'active',
  created_at: Timestamp.now(),
  last_login_at: Timestamp.now(),
  created_by: 'system'
};

/**
 * Simple login with username/password
 * For development/testing purposes only
 */
export async function simpleLogin(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  // Check for admin credentials
  if ((username.toLowerCase() === 'admin' && password === 'admin') || (username.toLowerCase() === 'brooklynn' && password === 'Brooklynn')) {
    const userWithLogin = {
      ...ADMIN_USER,
      last_login_at: Timestamp.now()
    };
    setCurrentUser(userWithLogin);
    console.log('[UserService] Admin login successful:', username);
    try {
      await recordAdminLogin(userWithLogin.id, userWithLogin.display_name, userWithLogin.email);
    } catch (err) {
      console.error('[UserService] Failed to record login:', err);
    }
    return { success: true, user: userWithLogin };
  }

  // Try viewer login (email + password in Firestore viewer_users)
  const viewerResult = await viewerLogin(username.toLowerCase(), password);
  if (viewerResult.success) return viewerResult;

  // Try client login via Firebase Auth (email + password)
  const clientResult = await clientLoginWithFirebaseAuth(username.toLowerCase(), password);
  if (clientResult.success) return clientResult;

  console.log('[UserService] Login failed for:', username);
  try {
    await recordFailedAdminLogin(username, 'Invalid username or password');
  } catch (err) {
    console.error('[UserService] Failed to record failed login:', err);
  }

  return { success: false, error: 'Invalid email or password' };
}

/**
 * Logout current user
 */
export function logout(): void {
  clearCurrentUser();
  console.log('[UserService] User logged out');
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
  return getCurrentUser() !== null;
}

/**
 * Check if current user is admin
 */
export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

/**
 * ============================================================================
 * CLIENT LOGIN SYSTEM
 * ============================================================================
 */

import { getAllClients } from './clientService';
import {
  recordAdminLogin,
  recordFailedAdminLogin,
  recordClientLogin,
  recordFailedClientLogin
} from './loginTrackingService';

/**
 * Login as client using first name and last name
 * Returns the client if found, or error if not found
 */
export async function clientLogin(firstName: string, lastName: string): Promise<{ success: boolean; clientId?: string; user?: User; error?: string }> {
  try {
    console.log('[UserService] Client login attempt:', firstName, lastName);

    // Get all clients and search for matching name
    const clients = await getAllClients();

    // Find client by matching first and last name
    const matchingClient = clients.find(client => {
      // Try different name fields
      const clientFirstName = client.identity?.firstName || '';
      const clientLastName = client.identity?.lastName || '';
      const contactName = client.contact_name || '';

      // Check identity fields
      if (clientFirstName.toLowerCase() === firstName.toLowerCase() &&
          clientLastName.toLowerCase() === lastName.toLowerCase()) {
        return true;
      }

      // Check contact_name (might be "First Last" format)
      const [contactFirst, contactLast] = contactName.split(' ');
      if (contactFirst?.toLowerCase() === firstName.toLowerCase() &&
          contactLast?.toLowerCase() === lastName.toLowerCase()) {
        return true;
      }

      return false;
    });

    if (!matchingClient) {
      console.log('[UserService] Client not found:', firstName, lastName);
      // Track failed login
      await recordFailedClientLogin(firstName, lastName, 'Client not found');
      return { success: false, error: 'Client not found. Please check your name and try again.' };
    }

    console.log('[UserService] Client found:', matchingClient.id);

    // Create a client user object
    const clientUser: User = {
      id: `client_${matchingClient.id}`,
      email: matchingClient.email || matchingClient.identity?.email || '',
      display_name: `${firstName} ${lastName}`,
      avatar_url: matchingClient.logo_url || `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=ec4899&color=fff`,
      role: 'client',
      permissions: ['view_profile', 'view_outreach', 'view_bookings'],
      client_id: matchingClient.id!,
      status: 'active',
      created_at: Timestamp.now(),
      last_login_at: Timestamp.now(),
      created_by: 'system'
    };

    setCurrentUser(clientUser);
    console.log('[UserService] Client login successful:', clientUser.display_name);

    // Track successful login to Firestore
    await recordClientLogin(
      matchingClient.id!,
      clientUser.display_name,
      clientUser.email
    );

    return {
      success: true,
      clientId: matchingClient.id,
      user: clientUser
    };
  } catch (error: any) {
    console.error('[UserService] Client login error:', error);
    // Track failed login
    await recordFailedClientLogin(firstName, lastName, error.message || 'Login failed');
    return { success: false, error: error.message || 'Login failed. Please try again.' };
  }
}

/**
 * Get current user's client ID (if logged in as client)
 */
export function getCurrentClientId(): string | null {
  const user = getCurrentUser();
  return user?.client_id || null;
}

/**
 * Check if current user is a client
 */
export function isClient(): boolean {
  const user = getCurrentUser();
  return user?.role === 'client';
}

/**
 * ============================================================================
 * VIEWER LOGIN SYSTEM
 * Accounts stored in Firestore 'viewer_users' collection
 * ============================================================================
 */

/**
 * Login as viewer using email + password
 */
export async function viewerLogin(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const viewerCollection = collection(db, 'viewer_users');
    const q = query(viewerCollection, where('email', '==', email.toLowerCase()));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { success: false, error: 'Invalid email or password' };
    }

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();

    if (data.password !== password) {
      return { success: false, error: 'Invalid email or password' };
    }

    const user: User = {
      id: docSnap.id,
      email: data.email,
      display_name: data.display_name,
      avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.display_name)}&background=8b5cf6&color=fff`,
      role: 'viewer',
      permissions: ['podcasts'],
      client_id: null,
      status: 'active',
      must_change_password: data.must_change_password ?? false,
      created_at: data.created_at || Timestamp.now(),
      last_login_at: Timestamp.now(),
      created_by: 'system'
    };

    setCurrentUser(user);

    // Update last login in Firestore
    await updateDoc(doc(db, 'viewer_users', docSnap.id), { last_login_at: Timestamp.now() });

    console.log('[UserService] Viewer login successful:', email);
    return { success: true, user };
  } catch (error: any) {
    console.error('[UserService] Viewer login error:', error);
    return { success: false, error: 'Login failed. Please try again.' };
  }
}

/**
 * Change viewer password — clears must_change_password flag
 */
export async function changeViewerPassword(userId: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    await updateDoc(doc(db, 'viewer_users', userId), {
      password: newPassword,
      must_change_password: false
    });

    // Update the cached user in localStorage
    const currentUser = getCurrentUser();
    if (currentUser) {
      setCurrentUser({ ...currentUser, must_change_password: false });
    }

    console.log('[UserService] Viewer password changed:', userId);
    return { success: true };
  } catch (error: any) {
    console.error('[UserService] Change password error:', error);
    return { success: false, error: 'Failed to update password. Please try again.' };
  }
}

/**
 * ============================================================================
 * CLIENT FIREBASE AUTH LOGIN
 * ============================================================================
 */

/**
 * Login as client using Firebase Authentication (email + password)
 */
export async function clientLoginWithFirebaseAuth(
  email: string,
  password: string
): Promise<{ success: boolean; user?: User; clientId?: string; error?: string }> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = credential.user;

    // Find matching client in Firestore by authUid (set during account creation)
    const clientsCollection = collection(db, 'clients');
    const q = query(clientsCollection, where('authUid', '==', firebaseUser.uid));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { success: false, error: 'Client not found. Please contact your account manager.' };
    }

    const clientDoc = snapshot.docs[0];
    const clientData = clientDoc.data();
    const displayName = clientData.identity?.firstName
      ? `${clientData.identity.firstName} ${clientData.identity.lastName || ''}`.trim()
      : clientData.contact_name || email.split('@')[0];

    const clientUser = {
      id: clientDoc.id,
      email: firebaseUser.email || email,
      display_name: displayName,
      avatar_url: clientData.links?.headshot || clientData.logo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=ec4899&color=fff`,
      role: 'client' as const,
      permissions: ['view_profile', 'view_outreach', 'view_bookings'],
      client_id: clientDoc.id,
      status: 'active' as const,
      must_change_password: clientData.must_change_password ?? false,
      profileCompleted: clientData.profileCompleted ?? false,
      created_at: Timestamp.now(),
      last_login_at: Timestamp.now(),
      created_by: 'system',
    } as unknown as User;

    setCurrentUser(clientUser);
    return { success: true, user: clientUser, clientId: clientDoc.id };
  } catch (error: any) {
    console.error('[UserService] Firebase client login error:', error);
    const msg = error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password'
      ? 'Invalid email or password.'
      : error.code === 'auth/user-not-found'
      ? 'No account found with this email.'
      : 'Login failed. Please try again.';
    return { success: false, error: msg };
  }
}

/**
 * Send password reset email via Firebase Auth
 */
export async function sendClientPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error: any) {
    console.error('[UserService] Password reset error:', error);
    return { success: false, error: 'Could not send reset email. Check the address and try again.' };
  }
}
