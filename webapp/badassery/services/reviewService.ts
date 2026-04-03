import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

export interface ReviewTokenData {
  token: string;
  clientId: string;
  clientName: string;
  outreachId: string;
  podcastId: string;
  podcastName: string;
  used: boolean;
  createdAt: string;
}

export interface ReviewEntry {
  rating: number;
  quote: string;
  wouldInviteBack: boolean | null;
  podcastName: string;
  createdAt: string;
}

const makeToken = () =>
  Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

export async function generateReviewToken(outreach: {
  id: string;
  client_id: string;
  client_name?: string;
  podcast_id: string;
  podcast_name?: string;
}): Promise<string> {
  const token = makeToken();
  await setDoc(doc(db, 'review_tokens', token), {
    token,
    clientId: outreach.client_id,
    clientName: outreach.client_name || '',
    outreachId: outreach.id,
    podcastId: outreach.podcast_id,
    podcastName: outreach.podcast_name || '',
    used: false,
    createdAt: new Date().toISOString(),
  } satisfies ReviewTokenData);
  return token;
}

export async function getReviewToken(token: string): Promise<ReviewTokenData | null> {
  const snap = await getDoc(doc(db, 'review_tokens', token));
  if (!snap.exists()) return null;
  return snap.data() as ReviewTokenData;
}

export async function submitReview(
  tokenData: ReviewTokenData,
  review: { rating: number; quote: string; wouldInviteBack: boolean | null }
): Promise<void> {
  const entry: ReviewEntry = {
    rating: review.rating,
    quote: review.quote,
    wouldInviteBack: review.wouldInviteBack,
    podcastName: tokenData.podcastName,
    createdAt: new Date().toISOString(),
  };

  // Write review to client doc
  await updateDoc(doc(db, 'clients', tokenData.clientId), {
    reviews: arrayUnion(entry),
  });

  // Mark token as used
  await updateDoc(doc(db, 'review_tokens', tokenData.token), {
    used: true,
    usedAt: new Date().toISOString(),
  });

  // Blacklist podcast if rating < 6
  if (review.rating < 6 && tokenData.podcastId) {
    try {
      await updateDoc(doc(db, 'podcasts', tokenData.podcastId), {
        blacklisted: true,
        blacklistedReason: 'Low guest review rating',
        blacklistedAt: new Date().toISOString(),
      });
    } catch {
      // Podcast doc may not exist — ignore
    }
  }
}
