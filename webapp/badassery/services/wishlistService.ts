/**
 * Wishlist Service - Manage client podcast wishlists
 */

import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';

/**
 * Wishlist item structure
 */
export interface WishlistItem {
  id: string;

  // Relations
  client_id: string;
  podcast_itunes_id: string;

  // Status workflow
  status: 'wishlist' | 'outreach' | 'archived';

  // Metadata
  priority: 'low' | 'medium' | 'high';
  notes?: string;
  added_by: string;
  added_at: Timestamp;
  updated_at: Timestamp;

  // Tracking
  moved_to_outreach_at?: Timestamp;
  outreach_id?: string;
  archived_reason?: string;
}

/**
 * Add a podcast to a client's wishlist
 */
export async function addToWishlist(
  clientId: string,
  podcastItunesId: string,
  userId: string,
  priority: 'low' | 'medium' | 'high' = 'medium',
  notes?: string
): Promise<string> {
  // Check if already exists
  const existing = await getWishlistItem(clientId, podcastItunesId);

  if (existing) {
    throw new Error('This podcast is already in the wishlist for this client');
  }

  const wishlistItem: Omit<WishlistItem, 'id'> = {
    client_id: clientId,
    podcast_itunes_id: podcastItunesId,
    status: 'wishlist',
    priority,
    added_by: userId,
    added_at: Timestamp.now(),
    updated_at: Timestamp.now()
  };

  // Only add notes if it has a value (Firestore doesn't accept undefined)
  if (notes) {
    wishlistItem.notes = notes;
  }

  const docRef = await addDoc(
    collection(db, 'client_podcast_wishlist'),
    wishlistItem
  );

  console.log(`✅ Added to wishlist: ${docRef.id}`);
  return docRef.id;
}

/**
 * Get a specific wishlist item
 */
export async function getWishlistItem(
  clientId: string,
  podcastItunesId: string
): Promise<WishlistItem | null> {
  const q = query(
    collection(db, 'client_podcast_wishlist'),
    where('client_id', '==', clientId),
    where('podcast_itunes_id', '==', podcastItunesId)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data()
  } as WishlistItem;
}

/**
 * Get all wishlist items for a client
 */
export async function getClientWishlist(
  clientId: string,
  statusFilter?: 'wishlist' | 'outreach' | 'archived'
): Promise<WishlistItem[]> {
  let q = query(
    collection(db, 'client_podcast_wishlist'),
    where('client_id', '==', clientId),
    orderBy('added_at', 'desc')
  );

  if (statusFilter) {
    q = query(
      collection(db, 'client_podcast_wishlist'),
      where('client_id', '==', clientId),
      where('status', '==', statusFilter),
      orderBy('added_at', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as WishlistItem[];
}

/**
 * Update wishlist item priority or notes
 */
export async function updateWishlistItem(
  wishlistId: string,
  updates: {
    priority?: 'low' | 'medium' | 'high';
    notes?: string;
  }
): Promise<void> {
  await updateDoc(doc(db, 'client_podcast_wishlist', wishlistId), {
    ...updates,
    updated_at: Timestamp.now()
  });

  console.log(`✅ Updated wishlist item: ${wishlistId}`);
}

/**
 * Move wishlist item to outreach
 */
export async function moveToOutreach(
  wishlistId: string
): Promise<string> {
  const wishlistDoc = await getDoc(
    doc(db, 'client_podcast_wishlist', wishlistId)
  );

  if (!wishlistDoc.exists()) {
    throw new Error('Wishlist item not found');
  }

  const wishlistData = wishlistDoc.data() as WishlistItem;

  // 1. Create outreach document
  const outreachData = {
    client_id: wishlistData.client_id,
    itunesId: wishlistData.podcast_itunes_id,
    status: 'identified',
    'Outreach Status': 'Ready for outreach',
    wishlist_id: wishlistId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    // Add other required outreach fields as needed
    hostContactInfo: {
      linkedin: '',
      email: '',
      website: '',
      raw: ''
    }
  };

  const outreachRef = await addDoc(
    collection(db, 'outreach'),
    outreachData
  );

  // 2. Update wishlist status
  await updateDoc(doc(db, 'client_podcast_wishlist', wishlistId), {
    status: 'outreach',
    outreach_id: outreachRef.id,
    moved_to_outreach_at: Timestamp.now(),
    updated_at: Timestamp.now()
  });

  console.log(`✅ Moved to outreach: ${outreachRef.id}`);
  return outreachRef.id;
}

/**
 * Archive a wishlist item
 */
export async function archiveWishlistItem(
  wishlistId: string,
  reason?: string
): Promise<void> {
  await updateDoc(doc(db, 'client_podcast_wishlist', wishlistId), {
    status: 'archived',
    archived_reason: reason,
    updated_at: Timestamp.now()
  });

  console.log(`✅ Archived wishlist item: ${wishlistId}`);
}

/**
 * Remove a wishlist item (permanent delete)
 */
export async function removeFromWishlist(
  wishlistId: string
): Promise<void> {
  await deleteDoc(doc(db, 'client_podcast_wishlist', wishlistId));
  console.log(`✅ Removed from wishlist: ${wishlistId}`);
}

/**
 * Check if a podcast is in any client's wishlist
 */
export async function isPodcastInWishlist(
  podcastItunesId: string
): Promise<boolean> {
  const q = query(
    collection(db, 'client_podcast_wishlist'),
    where('podcast_itunes_id', '==', podcastItunesId),
    where('status', '==', 'wishlist')
  );

  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

/**
 * Get all clients who have this podcast in wishlist
 */
export async function getClientsWithPodcast(
  podcastItunesId: string
): Promise<string[]> {
  const q = query(
    collection(db, 'client_podcast_wishlist'),
    where('podcast_itunes_id', '==', podcastItunesId)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data().client_id);
}

/**
 * Get wishlist statistics for a client
 */
export async function getWishlistStats(clientId: string): Promise<{
  total: number;
  wishlist: number;
  outreach: number;
  archived: number;
}> {
  const allItems = await getClientWishlist(clientId);

  return {
    total: allItems.length,
    wishlist: allItems.filter(i => i.status === 'wishlist').length,
    outreach: allItems.filter(i => i.status === 'outreach').length,
    archived: allItems.filter(i => i.status === 'archived').length
  };
}
