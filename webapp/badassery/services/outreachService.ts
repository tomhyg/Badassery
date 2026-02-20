import { db } from './firebase';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { getPodcastByItunesId, type PodcastDocument } from './podcastService';

/**
 * Outreach document structure from Firestore
 */
export interface OutreachDocument {
  id: string;
  itunesId: string;
  showName: string;
  showNameOriginal: string;
  showLink: string;
  clientId: string;
  clientName: string;
  hostContactInfo: {
    linkedin: string;
    email: string;
    website: string;
    raw: string;
  };
  // Data quality status - tracks if we have iTunes ID
  status: 'identified' | 'needs_itunes_id' | 'contacted' | 'replied' | 'scheduled' | 'booked';
  // Workflow status - tracks outreach progression (Firestore field name: "Outreach Status")
  'Outreach Status'?:
    | 'Ready for outreach'
    | '1st message sent'
    | '1st follow- up sent'
    | '2nd follow-up sent'
    | 'Scheduling Screening Call'
    | 'Screening Call Scheduled'
    | 'Scheduling Recording'
    | 'Recording Scheduled'
    | 'Recorded'
    | 'Live'
    | 'Host said no'
    | 'Email bounced'
    | 'Paid podcast'
    | 'Blacklist';
  needsManualReview?: boolean;
  rawData: Record<string, any>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  importedFrom?: string;
  importedAt?: Timestamp;

  // ============================================================================
  // ENRICHED FIELDS (optional, from enriched_vm1-20.json files)
  // ============================================================================

  // Basic podcast info
  title?: string;
  description?: string;
  language?: string;
  imageUrl?: string;
  url?: string;
  link?: string;
  website?: string;
  lastUpdate?: number;

  // Email fields
  rss_owner_email?: string;
  website_email?: string;

  // Apple Podcast data
  apple_rating?: number;
  apple_rating_count?: number;
  apple_api_url?: string;
  apple_api_artist_id?: string;
  apple_api_artwork_url?: string;
  apple_api_genres?: string[];
  apple_api_genre_ids?: string[];
  apple_scrape_status?: string;

  // RSS feed data
  rss_url?: string;
  rss_owner_name?: string;
  rss_author?: string;
  rss_description?: string;
  rss_website?: string;
  rss_status?: string;

  // Episode data
  episodeCount?: number;

  // RSS episodes (ep1-10) - Complete data
  rss_ep1_title?: string;
  rss_ep1_date?: string;
  rss_ep1_description?: string;
  rss_ep1_duration?: string;
  rss_ep1_audio_url?: string;
  rss_ep1_guid?: string;

  rss_ep2_title?: string;
  rss_ep2_date?: string;
  rss_ep2_description?: string;
  rss_ep2_duration?: string;
  rss_ep2_audio_url?: string;
  rss_ep2_guid?: string;

  rss_ep3_title?: string;
  rss_ep3_date?: string;
  rss_ep3_description?: string;
  rss_ep3_duration?: string;
  rss_ep3_audio_url?: string;
  rss_ep3_guid?: string;

  rss_ep4_title?: string;
  rss_ep4_date?: string;
  rss_ep4_description?: string;
  rss_ep4_duration?: string;
  rss_ep4_audio_url?: string;
  rss_ep4_guid?: string;

  rss_ep5_title?: string;
  rss_ep5_date?: string;
  rss_ep5_description?: string;
  rss_ep5_duration?: string;
  rss_ep5_audio_url?: string;
  rss_ep5_guid?: string;

  rss_ep6_title?: string;
  rss_ep6_date?: string;
  rss_ep6_description?: string;
  rss_ep6_duration?: string;
  rss_ep6_audio_url?: string;
  rss_ep6_guid?: string;

  rss_ep7_title?: string;
  rss_ep7_date?: string;
  rss_ep7_description?: string;
  rss_ep7_duration?: string;
  rss_ep7_audio_url?: string;
  rss_ep7_guid?: string;

  rss_ep8_title?: string;
  rss_ep8_date?: string;
  rss_ep8_description?: string;
  rss_ep8_duration?: string;
  rss_ep8_audio_url?: string;
  rss_ep8_guid?: string;

  rss_ep9_title?: string;
  rss_ep9_date?: string;
  rss_ep9_description?: string;
  rss_ep9_duration?: string;
  rss_ep9_audio_url?: string;
  rss_ep9_guid?: string;

  rss_ep10_title?: string;
  rss_ep10_date?: string;
  rss_ep10_description?: string;
  rss_ep10_duration?: string;
  rss_ep10_audio_url?: string;
  rss_ep10_guid?: string;

  // YouTube data
  yt_subscribers?: number;
  yt_channel_name?: string;
  yt_channel_id?: string;
  youtube_status?: string;

  // YouTube videos (yt_video_1-10) - Complete data
  yt_video_1_title?: string;
  yt_video_1_views?: number;
  yt_video_1_duration?: string;
  yt_video_1_id?: string;

  yt_video_2_title?: string;
  yt_video_2_views?: number;
  yt_video_2_duration?: string;
  yt_video_2_id?: string;

  yt_video_3_title?: string;
  yt_video_3_views?: number;
  yt_video_3_duration?: string;
  yt_video_3_id?: string;

  yt_video_4_title?: string;
  yt_video_4_views?: number;
  yt_video_4_duration?: string;
  yt_video_4_id?: string;

  yt_video_5_title?: string;
  yt_video_5_views?: number;
  yt_video_5_duration?: string;
  yt_video_5_id?: string;

  yt_video_6_title?: string;
  yt_video_6_views?: number;
  yt_video_6_duration?: string;
  yt_video_6_id?: string;

  yt_video_7_title?: string;
  yt_video_7_views?: number;
  yt_video_7_duration?: string;
  yt_video_7_id?: string;

  yt_video_8_title?: string;
  yt_video_8_views?: number;
  yt_video_8_duration?: string;
  yt_video_8_id?: string;

  yt_video_9_title?: string;
  yt_video_9_views?: number;
  yt_video_9_duration?: string;
  yt_video_9_id?: string;

  yt_video_10_title?: string;
  yt_video_10_views?: number;
  yt_video_10_duration?: string;
  yt_video_10_id?: string;

  // Social media links
  website_facebook?: string;
  website_instagram?: string;
  website_twitter?: string;
  website_linkedin?: string;
  website_youtube?: string;
  website_spotify?: string;
  website_tiktok?: string;
  website_status?: string;
}

/**
 * Get all outreach documents
 */
export async function getAllOutreach(): Promise<OutreachDocument[]> {
  try {
    const outreachCollection = collection(db, 'outreach');
    const q = query(outreachCollection, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as OutreachDocument));
  } catch (error) {
    console.error('Error getting outreach:', error);
    throw error;
  }
}

/**
 * Get outreach by ID
 */
export async function getOutreachById(id: string): Promise<OutreachDocument | null> {
  try {
    const docRef = doc(db, 'outreach', id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as OutreachDocument;
    }
    return null;
  } catch (error) {
    console.error('Error getting outreach by ID:', error);
    throw error;
  }
}

/**
 * Get outreach by client ID
 */
export async function getOutreachByClientId(clientId: string): Promise<OutreachDocument[]> {
  try {
    const outreachCollection = collection(db, 'outreach');
    const q = query(
      outreachCollection,
      where('clientId', '==', clientId)
    );
    const snapshot = await getDocs(q);

    // Sort in memory instead of using orderBy to avoid index requirement
    const results = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as OutreachDocument));

    // Sort by createdAt descending
    results.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.toMillis() - a.createdAt.toMillis();
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
export async function getOutreachByStatus(status: OutreachDocument['status']): Promise<OutreachDocument[]> {
  try {
    const outreachCollection = collection(db, 'outreach');
    const q = query(
      outreachCollection,
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as OutreachDocument));
  } catch (error) {
    console.error('Error getting outreach by status:', error);
    throw error;
  }
}

/**
 * Get outreach needing manual review
 */
export async function getOutreachNeedingReview(): Promise<OutreachDocument[]> {
  try {
    const outreachCollection = collection(db, 'outreach');
    const q = query(
      outreachCollection,
      where('needsManualReview', '==', true),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as OutreachDocument));
  } catch (error) {
    console.error('Error getting outreach needing review:', error);
    throw error;
  }
}

/**
 * Update outreach document
 */
export async function updateOutreach(
  id: string,
  updates: Partial<OutreachDocument>
): Promise<void> {
  try {
    const docRef = doc(db, 'outreach', id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error updating outreach:', error);
    throw error;
  }
}

/**
 * Update outreach status (data quality status)
 */
export async function updateOutreachStatus(
  id: string,
  status: OutreachDocument['status']
): Promise<void> {
  try {
    await updateOutreach(id, { status });
  } catch (error) {
    console.error('Error updating outreach status:', error);
    throw error;
  }
}

/**
 * Update outreach workflow status
 */
export async function updateOutreachWorkflowStatus(
  id: string,
  outreachStatus: OutreachDocument['Outreach Status']
): Promise<void> {
  try {
    await updateOutreach(id, { 'Outreach Status': outreachStatus } as any);
  } catch (error) {
    console.error('Error updating outreach workflow status:', error);
    throw error;
  }
}

/**
 * Update iTunes ID for outreach
 */
export async function updateItunesId(
  id: string,
  itunesId: string
): Promise<void> {
  try {
    await updateOutreach(id, {
      itunesId,
      needsManualReview: false,
      status: 'identified'
    });
  } catch (error) {
    console.error('Error updating iTunes ID:', error);
    throw error;
  }
}

/**
 * Create new outreach document
 */
export async function createOutreach(
  data: Omit<OutreachDocument, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const outreachCollection = collection(db, 'outreach');
    const docRef = await addDoc(outreachCollection, {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating outreach:', error);
    throw error;
  }
}

/**
 * Delete outreach document
 */
export async function deleteOutreach(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'outreach', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting outreach:', error);
    throw error;
  }
}

/**
 * Search outreach by show name
 */
export async function searchOutreachByShowName(searchTerm: string): Promise<OutreachDocument[]> {
  try {
    const allOutreach = await getAllOutreach();
    const lowerSearch = searchTerm.toLowerCase();

    return allOutreach.filter(item =>
      item.showName.toLowerCase().includes(lowerSearch) ||
      item.showNameOriginal.toLowerCase().includes(lowerSearch)
    );
  } catch (error) {
    console.error('Error searching outreach:', error);
    throw error;
  }
}

/**
 * Update host email
 */
export async function updateHostEmail(
  id: string,
  email: string
): Promise<void> {
  try {
    await updateOutreach(id, {
      hostContactInfo: { email } as any
    });
  } catch (error) {
    console.error('Error updating host email:', error);
    throw error;
  }
}

// ============================================================================
// EMAIL INTELLIGENCE HELPERS
// ============================================================================

/**
 * Podcast hosting platforms to avoid
 */
const PODCAST_HOST_DOMAINS = [
  'buzzsprout.com',
  'libsyn.com',
  'transistor.fm',
  'captivate.fm',
  'simplecast.com',
  'podbean.com',
  'spreaker.com',
  'anchor.fm',
  'megaphone.fm',
  'acast.com',
  'blubrry.com',
  'fireside.fm',
  'castos.com',
  'podomatic.com',
  'soundcloud.com',
  'spotify.com'
];

/**
 * Generic email prefixes to penalize
 */
const GENERIC_PREFIXES = [
  'noreply',
  'no-reply',
  'donotreply',
  'notifications',
  'info',
  'support',
  'hello',
  'contact',
  'podcast'
];

/**
 * Extract email from raw text
 */
export function extractEmailFromText(text: string): string | null {
  if (!text) return null;

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const match = text.match(emailRegex);

  return match ? match[0] : null;
}

/**
 * Calculate quality score for an email
 */
export function getEmailQualityScore(email: string, source: string): number {
  if (!email || !email.includes('@')) return 0;

  const [prefix, domain] = email.toLowerCase().split('@');
  let score = 0;

  // Source priority (base score)
  if (source === 'manual') score += 100;
  else if (source === 'rss_owner') score += 80;
  else if (source === 'website') score += 60;
  else if (source === 'raw') score += 40;

  // Penalties for podcast hosting platforms
  if (PODCAST_HOST_DOMAINS.some(d => domain.includes(d))) {
    score -= 50;
  }

  // Penalties for generic prefixes
  if (GENERIC_PREFIXES.some(p => prefix.includes(p))) {
    score -= 30;
  }

  // Bonus for personal email providers
  if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'].includes(domain)) {
    score += 20;
  }

  return score;
}

export interface EmailCandidate {
  email: string;
  source: string;
  sourceLabel: string;
  score: number;
}

export interface BestEmailResult {
  email: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  allEmails: EmailCandidate[];
}

/**
 * Get the best host email from all available sources
 */
export function getBestHostEmail(outreach: OutreachDocument): BestEmailResult {
  const candidates: EmailCandidate[] = [];

  // Manual email (highest priority)
  if (outreach.hostContactInfo?.email) {
    candidates.push({
      email: outreach.hostContactInfo.email,
      source: 'manual',
      sourceLabel: 'Manual Research',
      score: getEmailQualityScore(outreach.hostContactInfo.email, 'manual')
    });
  }

  // RSS owner email
  if (outreach.rss_owner_email) {
    candidates.push({
      email: outreach.rss_owner_email,
      source: 'rss_owner',
      sourceLabel: 'RSS Feed',
      score: getEmailQualityScore(outreach.rss_owner_email, 'rss_owner')
    });
  }

  // Website email
  if (outreach.website_email) {
    candidates.push({
      email: outreach.website_email,
      source: 'website',
      sourceLabel: 'Website',
      score: getEmailQualityScore(outreach.website_email, 'website')
    });
  }

  // Extract from raw text
  const rawEmail = extractEmailFromText(outreach.hostContactInfo?.raw || '');
  if (rawEmail && !candidates.find(c => c.email === rawEmail)) {
    candidates.push({
      email: rawEmail,
      source: 'raw',
      sourceLabel: 'Contact Info',
      score: getEmailQualityScore(rawEmail, 'raw')
    });
  }

  // No emails found
  if (candidates.length === 0) {
    return {
      email: '',
      source: '',
      confidence: 'low',
      allEmails: []
    };
  }

  // Sort by score (descending)
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];

  // Determine confidence based on score
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (best.score >= 100) confidence = 'high';
  else if (best.score >= 60) confidence = 'medium';

  return {
    email: best.email,
    source: best.sourceLabel,
    confidence,
    allEmails: candidates
  };
}

/**
 * Enriched outreach + podcast data combined
 */
export interface OutreachWithPodcast extends OutreachDocument {
  podcastData?: PodcastDocument;
}

/**
 * Get outreach with enriched podcast data from "podcasts" collection
 */
export async function getOutreachWithPodcastData(outreachId: string): Promise<OutreachWithPodcast | null> {
  try {
    const outreach = await getOutreachById(outreachId);
    if (!outreach) return null;

    // If we have an itunesId, fetch the podcast data
    if (outreach.itunesId) {
      const podcastData = await getPodcastByItunesId(outreach.itunesId);
      return {
        ...outreach,
        podcastData: podcastData || undefined
      };
    }

    return outreach;
  } catch (error) {
    console.error('Error getting outreach with podcast data:', error);
    return null;
  }
}

/**
 * Get all outreach with enriched podcast data
 */
export async function getAllOutreachWithPodcastData(): Promise<OutreachWithPodcast[]> {
  try {
    const allOutreach = await getAllOutreach();

    // Fetch podcast data for each outreach in parallel
    const enriched = await Promise.all(
      allOutreach.map(async (outreach) => {
        if (outreach.itunesId) {
          const podcastData = await getPodcastByItunesId(outreach.itunesId);
          return {
            ...outreach,
            podcastData: podcastData || undefined
          };
        }
        return outreach;
      })
    );

    return enriched;
  } catch (error) {
    console.error('Error getting all outreach with podcast data:', error);
    return [];
  }
}

/**
 * Get outreach by client with enriched podcast data
 */
export async function getOutreachByClientIdWithPodcastData(clientId: string): Promise<OutreachWithPodcast[]> {
  try {
    const clientOutreach = await getOutreachByClientId(clientId);

    // Fetch podcast data for each outreach in parallel
    const enriched = await Promise.all(
      clientOutreach.map(async (outreach) => {
        if (outreach.itunesId) {
          const podcastData = await getPodcastByItunesId(outreach.itunesId);
          return {
            ...outreach,
            podcastData: podcastData || undefined
          };
        }
        return outreach;
      })
    );

    return enriched;
  } catch (error) {
    console.error('Error getting client outreach with podcast data:', error);
    return [];
  }
}
