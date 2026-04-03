/**
 * Swipe Service — tracks client swipe decisions on podcasts
 * Firestore collection: "swipes" (flat, keyed by `{clientId}_{itunesId}`)
 */

import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';

export type SwipeDirection = 'right' | 'left';

export interface SwipeRecord {
  clientId: string;
  itunesId: string;
  direction: SwipeDirection;
  category: string;
  score: number;
  swipedAt: Timestamp;
}

/** Record a swipe decision */
export async function recordSwipe(
  clientId: string,
  itunesId: string,
  direction: SwipeDirection,
  category: string,
  score: number
): Promise<void> {
  const docId = `${clientId}_${itunesId}`;
  await setDoc(doc(db, 'swipes', docId), {
    clientId,
    itunesId,
    direction,
    category,
    score,
    swipedAt: Timestamp.now(),
  });
}

/** Get all swipe records for a client */
export async function getClientSwipes(clientId: string): Promise<SwipeRecord[]> {
  const q = query(collection(db, 'swipes'), where('clientId', '==', clientId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as SwipeRecord);
}

/** Get set of itunesIds already swiped (any direction) */
export async function getSwipedIds(clientId: string): Promise<Set<string>> {
  const swipes = await getClientSwipes(clientId);
  return new Set(swipes.map(s => s.itunesId));
}

/**
 * Compute category weights from swipe history.
 * Returns a map of category → weight (positive = liked, negative = disliked).
 */
export function computeCategoryWeights(swipes: SwipeRecord[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const s of swipes) {
    if (!s.category) continue;
    const delta = s.direction === 'right' ? 1 : -0.5;
    weights[s.category] = (weights[s.category] || 0) + delta;
  }
  return weights;
}
