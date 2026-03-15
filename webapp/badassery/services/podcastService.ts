import { db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, DocumentSnapshot, Timestamp } from 'firebase/firestore';
import { getBlacklistedPodcastIds } from './outreachServiceV2';
import { idbGet, idbSet } from './indexedDBCache';

/**
 * Podcast document structure from Firestore "podcasts" collection
 */
export interface PodcastDocument {
  // Document ID = itunesId
  itunesId: string;
  id?: number; // PodcastIndex internal feed ID (present on enriched podcasts)

  // Basic podcast info
  title: string;
  description: string;
  language: string;
  imageUrl: string;
  url: string;
  link: string;
  website: string;
  episodeCount: number;
  lastUpdate: number | null;

  // Email fields
  rss_owner_email: string;
  website_email: string;

  // Apple Podcast data
  apple_rating: number | null;
  apple_rating_count: number | null;
  apple_api_url: string;
  apple_api_artist_id: string;
  apple_api_artwork_url: string;
  apple_api_genres: string[];
  apple_api_genre_ids: string[];
  apple_scrape_status: string;

  // RSS feed data
  rss_url: string;
  rss_owner_name: string;
  rss_author: string;
  rss_description: string;
  rss_website: string;
  rss_status: string;

  // YouTube data
  yt_subscribers: number | null;
  yt_channel_name: string;
  yt_channel_id: string;
  youtube_status: string;

  // YouTube videos (1-10)
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

  // RSS episodes (1-10)
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

  // Social media links
  website_facebook: string;
  website_instagram: string;
  website_twitter: string;
  website_linkedin: string;
  website_youtube: string;
  website_spotify: string;
  website_tiktok: string;
  website_status: string;

  // Metadata
  uploadedAt: Timestamp;
  uploadedFrom: string;
  updatedAt: Timestamp;

  // AI Categorization (added by AI categorization script)
  ai_primary_category?: string;
  ai_secondary_categories?: string[];
  ai_topics?: string[];
  ai_target_audience?: string;
  ai_podcast_style?: string;
  ai_business_relevance?: number;
  ai_guest_friendly?: boolean;
  ai_monetization_potential?: number;
  ai_content_quality?: number;
  ai_audience_size?: string;
  ai_engagement_level?: number;
  ai_summary?: string;

  // Badassery Score & Percentiles (added by parallel_scoring_v2.js)
  ai_badassery_score?: number;            // 0-10 composite score
  ai_category_percentile?: string;        // Top 1%|Top 5%|Top 10%|Top 25%|Top 50%|Standard
  ai_category_rank?: number | null;       // Rank within category
  ai_category_total?: number;             // Total podcasts in category
  ai_percentile_used_global?: boolean;    // true if category < 10 podcasts
  ai_global_percentile?: string;          // Global percentile
  ai_global_rank?: number;                // Global rank
  ai_global_total?: number;               // Total podcasts scored

  aiCategorizationStatus?: 'completed' | 'failed' | 'pending';
  aiCategorizedAt?: Timestamp;
  aiCategorizationError?: string;

  // Apple Podcast Charts (injected by export_podcasts_lite.js / fetch_apple_charts.js)
  apple_chart_rank?: number;           // Best rank across all genres
  apple_chart_genre?: string;          // Genre where best rank was achieved
  apple_chart_genres?: Record<string, number>; // { GenreName: rank } for every genre it appears in
  apple_chart_scrapedAt?: string;

  // Spotify Podcast Charts (injected by export_podcasts_lite.js / fetch_spotify_charts.js)
  spotify_chart_rank?: number;         // Best rank across all categories
  spotify_chart_genre?: string;        // Category where best rank was achieved
  spotify_chart_genres?: Record<string, number>; // { CategoryName: rank } for every category it appears in
  spotify_chart_scrapedAt?: string;
}

/**
 * Get a podcast by iTunes ID
 */
export const getPodcastByItunesId = async (itunesId: string): Promise<PodcastDocument | null> => {
  try {
    const docRef = doc(db, 'podcasts', String(itunesId));
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        itunesId: docSnap.id,
        ...docSnap.data()
      } as PodcastDocument;
    }
    return null;
  } catch (error) {
    console.error('Error fetching podcast:', error);
    return null;
  }
};

/**
 * Get all podcasts with pagination
 */
export const getAllPodcasts = async (limitCount: number = 50): Promise<PodcastDocument[]> => {
  try {
    const q = query(
      collection(db, 'podcasts'),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error) {
    console.error('Error fetching podcasts:', error);
    return [];
  }
};

// ============================================================================
// IN-MEMORY CACHE FOR FAST CLIENT-SIDE FILTERING
// ============================================================================

// In-memory cache for podcast database (avoid re-fetching)
let cachedPodcasts: PodcastDocument[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// IndexedDB cache key and TTL for the static JSON
const IDB_KEY = 'podcasts-lite';
const IDB_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get all podcasts from cache or fetch them.
 * This loads the ENTIRE database into memory for fast client-side filtering.
 *
 * Priority chain:
 *   1. In-memory cache (instant, valid for 5 min)
 *   2. IndexedDB (fast, survives reloads, valid for 24h)
 *   3. /podcasts-lite.json static file (CDN-cached, ~9MB gzipped)
 *   4. Firestore fallback (when JSON not yet deployed)
 */
export const getAllPodcastsCached = async (): Promise<PodcastDocument[]> => {
  const now = Date.now();

  // 1. In-memory cache (instant)
  if (cachedPodcasts && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('[PodcastService] In-memory hit:', cachedPodcasts.length, 'podcasts');
    return cachedPodcasts;
  }

  // 2. IndexedDB (survives page reloads, 24h TTL)
  try {
    const entry = await idbGet<PodcastDocument[]>(IDB_KEY);
    if (entry && Date.now() < entry.expiresAt) {
      console.log('[PodcastService] IndexedDB hit:', entry.data.length, 'podcasts');
      cachedPodcasts = entry.data;
      cacheTimestamp = now;
      return cachedPodcasts;
    }
  } catch (err) {
    console.warn('[PodcastService] IndexedDB read failed, continuing:', err);
  }

  // 3. Static JSON served by Firebase Hosting (generated by export_podcasts_lite.js)
  try {
    console.log('[PodcastService] Fetching /podcasts-lite.json...');
    const response = await fetch('/podcasts-lite.json');
    if (response.ok) {
      const data = await response.json() as PodcastDocument[];
      console.log('[PodcastService] Fetched', data.length, 'podcasts from JSON');

      // Persist to IndexedDB for next reload
      await idbSet(IDB_KEY, data, IDB_TTL);

      cachedPodcasts = data;
      cacheTimestamp = now;
      return cachedPodcasts;
    }
  } catch (err) {
    console.warn('[PodcastService] JSON fetch failed, falling back to Firestore:', err);
  }

  // 4. Firestore fallback (before first deploy of podcasts-lite.json)
  console.log('[PodcastService] Falling back to Firestore...');
  try {
    const q = query(
      collection(db, 'podcasts'),
      where('ai_guest_friendly', '==', true),
      where('ai_badassery_score', '>', 0),
      orderBy('ai_badassery_score', 'desc')
    );

    const querySnapshot = await getDocs(q);
    cachedPodcasts = querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];

    cacheTimestamp = now;
    console.log('[PodcastService] Firestore fallback cached', cachedPodcasts.length, 'podcasts');

    return cachedPodcasts;
  } catch (error) {
    console.error('Error fetching all podcasts:', error);
    return [];
  }
};

/**
 * Clear the podcast cache (useful after updates)
 */
export const clearPodcastCache = () => {
  cachedPodcasts = null;
  cacheTimestamp = 0;
};

/**
 * Check if podcasts are already cached
 */
export const isPodcastCacheLoaded = (): boolean => {
  return cachedPodcasts !== null && (Date.now() - cacheTimestamp) < CACHE_TTL;
};

/**
 * Search podcasts by title
 */
export const searchPodcastsByTitle = async (searchTerm: string, limitCount: number = 50): Promise<PodcastDocument[]> => {
  try {
    // Note: Firestore doesn't support full-text search natively
    // This is a basic implementation - for production, consider using Algolia or similar
    const allPodcasts = await getAllPodcasts(1000); // Fetch more for filtering

    const lowerSearch = searchTerm.toLowerCase();
    return allPodcasts
      .filter(p => p.title?.toLowerCase().includes(lowerSearch))
      .slice(0, limitCount);
  } catch (error) {
    console.error('Error searching podcasts:', error);
    return [];
  }
};

/**
 * Get podcasts with high ratings (4.0+)
 */
export const getHighRatedPodcasts = async (limitCount: number = 50): Promise<PodcastDocument[]> => {
  try {
    const q = query(
      collection(db, 'podcasts'),
      where('apple_rating', '>=', 4.0),
      orderBy('apple_rating', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error) {
    console.error('Error fetching high-rated podcasts:', error);
    return [];
  }
};

/**
 * Get podcasts by language
 */
export const getPodcastsByLanguage = async (language: string, limitCount: number = 50): Promise<PodcastDocument[]> => {
  try {
    const q = query(
      collection(db, 'podcasts'),
      where('language', '==', language),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error) {
    console.error('Error fetching podcasts by language:', error);
    return [];
  }
};

/**
 * Get podcast statistics
 */
export const getPodcastStats = async (): Promise<{
  total: number;
  withEmail: number;
  withYouTube: number;
  highRated: number;
  categorized: number;
  highBusinessRelevance: number;
}> => {
  try {
    // Note: For large collections, consider maintaining a separate stats document
    const allPodcasts = await getAllPodcasts(10000);

    return {
      total: allPodcasts.length,
      withEmail: allPodcasts.filter(p => p.rss_owner_email || p.website_email).length,
      withYouTube: allPodcasts.filter(p => p.yt_subscribers && p.yt_subscribers > 0).length,
      highRated: allPodcasts.filter(p => p.apple_rating && p.apple_rating >= 4.0).length,
      categorized: allPodcasts.filter(p => p.aiCategorizationStatus === 'completed').length,
      highBusinessRelevance: allPodcasts.filter(p => p.ai_business_relevance && p.ai_business_relevance >= 7).length,
    };
  } catch (error) {
    console.error('Error calculating podcast stats:', error);
    return { total: 0, withEmail: 0, withYouTube: 0, highRated: 0, categorized: 0, highBusinessRelevance: 0 };
  }
};

/**
 * Get podcasts by AI category
 */
export const getPodcastsByCategory = async (category: string, limitCount: number = 50): Promise<PodcastDocument[]> => {
  try {
    const q = query(
      collection(db, 'podcasts'),
      where('ai_primary_category', '==', category),
      orderBy('ai_business_relevance', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error) {
    console.error('Error fetching podcasts by category:', error);
    return [];
  }
};

/**
 * Get guest-friendly podcasts (high business relevance)
 */
export const getGuestFriendlyPodcasts = async (
  minBusinessRelevance: number = 7,
  limitCount: number = 50
): Promise<PodcastDocument[]> => {
  try {
    const q = query(
      collection(db, 'podcasts'),
      where('ai_business_relevance', '>=', minBusinessRelevance),
      orderBy('ai_business_relevance', 'desc'),
      orderBy('apple_rating_count', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error) {
    console.error('Error fetching guest-friendly podcasts:', error);
    // Fallback: get all and filter in memory
    const allPodcasts = await getAllPodcasts(1000);
    return allPodcasts
      .filter(p => p.ai_guest_friendly && (p.ai_business_relevance || 0) >= minBusinessRelevance)
      .sort((a, b) => (b.ai_business_relevance || 0) - (a.ai_business_relevance || 0))
      .slice(0, limitCount);
  }
};

/**
 * Get podcasts by topic
 */
export const getPodcastsByTopic = async (topic: string, limitCount: number = 50): Promise<PodcastDocument[]> => {
  try {
    const q = query(
      collection(db, 'podcasts'),
      where('ai_topics', 'array-contains', topic.toLowerCase()),
      orderBy('ai_business_relevance', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error) {
    console.error('Error fetching podcasts by topic:', error);
    // Fallback: search in memory
    const allPodcasts = await getAllPodcasts(1000);
    return allPodcasts
      .filter(p => p.ai_topics?.some(t => t.toLowerCase().includes(topic.toLowerCase())))
      .slice(0, limitCount);
  }
};

/**
 * Get best podcasts for outreach (guest-friendly + high quality + contactable)
 */
export const getBestPodcastsForOutreach = async (limitCount: number = 50): Promise<PodcastDocument[]> => {
  try {
    // Get all podcasts and filter/sort in memory for complex criteria
    const allPodcasts = await getAllPodcasts(5000);

    return allPodcasts
      .filter(p => {
        // Must have email
        if (!p.rss_owner_email && !p.website_email) return false;

        // Must have decent business relevance
        if ((p.ai_business_relevance || 0) < 5) return false;

        // Must have decent quality
        if ((p.ai_content_quality || 0) < 5) return false;

        return true;
      })
      .sort((a, b) => {
        // Sort by composite score
        const scoreA = (a.ai_business_relevance || 0) * 2 + (a.ai_content_quality || 0) + (a.ai_engagement_level || 0);
        const scoreB = (b.ai_business_relevance || 0) * 2 + (b.ai_content_quality || 0) + (b.ai_engagement_level || 0);
        return scoreB - scoreA;
      })
      .slice(0, limitCount);
  } catch (error) {
    console.error('Error fetching best podcasts for outreach:', error);
    return [];
  }
};

/**
 * Helper: Get best email for a podcast (priority: RSS owner > website)
 */
export const getBestEmail = (podcast: PodcastDocument): string | null => {
  if (podcast.rss_owner_email) return podcast.rss_owner_email;
  if (podcast.website_email) return podcast.website_email;
  return null;
};

/**
 * Helper: Get YouTube videos as array
 */
export const getYouTubeVideos = (podcast: PodcastDocument): Array<{
  title: string;
  views: number;
  duration: string;
  id: string;
}> => {
  const videos = [];
  for (let i = 1; i <= 10; i++) {
    const title = podcast[`yt_video_${i}_title` as keyof PodcastDocument];
    const views = podcast[`yt_video_${i}_views` as keyof PodcastDocument];
    const duration = podcast[`yt_video_${i}_duration` as keyof PodcastDocument];
    const id = podcast[`yt_video_${i}_id` as keyof PodcastDocument];

    if (title) {
      videos.push({
        title: title as string,
        views: views as number || 0,
        duration: duration as string || '',
        id: id as string || '',
      });
    }
  }
  return videos;
};

/**
 * Helper: Get RSS episodes as array
 */
export const getRSSEpisodes = (podcast: PodcastDocument): Array<{
  title: string;
  date: string;
  description: string;
  duration: string;
  audioUrl: string;
  guid: string;
}> => {
  const episodes = [];
  for (let i = 1; i <= 10; i++) {
    const title = podcast[`rss_ep${i}_title` as keyof PodcastDocument];
    const date = podcast[`rss_ep${i}_date` as keyof PodcastDocument];
    const description = podcast[`rss_ep${i}_description` as keyof PodcastDocument];
    const duration = podcast[`rss_ep${i}_duration` as keyof PodcastDocument];
    const audioUrl = podcast[`rss_ep${i}_audio_url` as keyof PodcastDocument];
    const guid = podcast[`rss_ep${i}_guid` as keyof PodcastDocument];

    if (title) {
      episodes.push({
        title: title as string,
        date: date as string || '',
        description: description as string || '',
        duration: duration as string || '',
        audioUrl: audioUrl as string || '',
        guid: guid as string || '',
      });
    }
  }
  return episodes;
};

/**
 * ============================================================================
 * BADASSERY SCORE & CATEGORIZATION FUNCTIONS
 * ============================================================================
 */

// 31 Badassery Niches (from parallel_scoring_v2.js)
export const BADASSERY_NICHES = [
  'Female Founders & Women in Business',
  'Tech Leadership & Engineering',
  'Startup Founders & Entrepreneurs',
  'Executive Coaches & Leadership Consultants',
  'Wellness Coaches & Health Experts',
  'Expat Life & International Living',
  'Community Builders & Event Organizers',
  'SaaS & Product Leaders',
  'AI & Machine Learning Experts',
  'Marketing & Brand Strategists',
  'Venture Capital & Investors',
  'Social Impact & Non-Profit Leaders',
  'Sales & Revenue Strategists',
  'Organizational Change Consultants',
  'Personal Development Coaches',
  'Spiritual Intelligence & Mindfulness',
  'Career Transition Coaches',
  'Content Creators & Storytellers',
  'Pricing & Monetization Experts',
  'Data & Analytics Leaders',
  'HR & People Operations',
  'Finance & Investing Experts',
  'Parenting & Family',
  'Health & Fitness Professionals',
  'Mental Health & Therapy',
  'Creative & Design Leaders',
  'Education & Learning',
  'Sustainability & ESG',
  'Food & Nutrition',
  'Travel & Lifestyle',
  'General Business & Lifestyle'
];

// 60 Badassery Topics for Speaking Topics (from parallel_scoring_v2.js)
export const BADASSERY_TOPICS = [
  'Leadership', 'Entrepreneurship', 'Marketing', 'AI & Technology',
  'Health & Wellness', 'Business Strategy', 'Personal Growth',
  'Career Development', 'Startups', 'Innovation', 'Emotional Intelligence',
  'Change Management', 'Product Development', 'Venture Capital',
  'Women in Business', 'Scaling & Growth', 'Storytelling',
  'Community Building', 'Pricing Strategy', 'Data & Analytics',
  'Social Impact', 'Mental Health', 'Spirituality & Purpose',
  'Finance & Investing', 'Organizational Culture', 'Sales & Revenue',
  'Behavior Change', 'Content Strategy', 'SaaS & Software', 'Parenting',
  'Nutrition & Diet', 'Fitness & Exercise', 'Sustainability', 'Education',
  'Travel & Expat Life', 'Creativity & Design', 'Relationships',
  'Work-Life Balance', 'Remote Work', 'Diversity & Inclusion',
  'Public Speaking', 'Networking', 'Negotiation', 'Productivity',
  'Mindfulness', 'Consulting', 'Transformation', 'Resilience',
  'Self-Improvement', 'Digital Marketing', 'Brand Building',
  'Customer Success', 'Operations', 'Fundraising', 'Team Building',
  'Personal Branding', 'Coaching', 'Podcasting', 'Writing & Publishing',
  'Industry Insights'
];

/**
 * Get podcasts with Badassery Scores (scored podcasts)
 */
export const getScoredPodcasts = async (limitCount: number = 100): Promise<PodcastDocument[]> => {
  try {
    const q = query(
      collection(db, 'podcasts'),
      where('ai_badassery_score', '>', 0),
      orderBy('ai_badassery_score', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error: any) {
    console.error('Error fetching scored podcasts:', error);

    // If it's a missing index error, provide helpful message
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.error('Missing Firestore index. Check Firebase Console for index creation link.');
    }

    return [];
  }
};

/**
 * Get scored podcasts EXCLUDING blacklisted podcasts
 * Use this for search results and suggestions
 */
export const getScoredPodcastsFiltered = async (limitCount: number = 100): Promise<PodcastDocument[]> => {
  try {
    const podcasts = await getScoredPodcasts(limitCount + 100); // Get extra to account for filtering
    const blacklistedIds = await getBlacklistedPodcastIds();

    console.log('[PodcastService] Filtering out', blacklistedIds.size, 'blacklisted podcasts');

    return podcasts
      .filter(p => !blacklistedIds.has(p.itunesId))
      .slice(0, limitCount);
  } catch (error) {
    console.error('Error fetching filtered scored podcasts:', error);
    return [];
  }
};

/**
 * Get all podcasts cached EXCLUDING blacklisted podcasts
 * Use this for database browsing and search
 */
export const getAllPodcastsCachedFiltered = async (): Promise<PodcastDocument[]> => {
  try {
    const podcasts = await getAllPodcastsCached();
    const blacklistedIds = await getBlacklistedPodcastIds();

    console.log('[PodcastService] Filtering out', blacklistedIds.size, 'blacklisted podcasts from cached list');

    return podcasts.filter(p => !blacklistedIds.has(p.itunesId));
  } catch (error) {
    console.error('Error fetching filtered cached podcasts:', error);
    return [];
  }
};

/**
 * Paginated result type for podcast queries
 */
export interface PaginatedPodcastResult {
  podcasts: PodcastDocument[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Get scored podcasts with cursor-based pagination (much faster for large datasets)
 */
export const getScoredPodcastsPaginated = async (
  pageSize: number = 50,
  lastDocCursor?: DocumentSnapshot | null
): Promise<PaginatedPodcastResult> => {
  try {
    let q = query(
      collection(db, 'podcasts'),
      where('ai_badassery_score', '>', 0),
      orderBy('ai_badassery_score', 'desc'),
      limit(pageSize)
    );

    // Add cursor for pagination
    if (lastDocCursor) {
      q = query(
        collection(db, 'podcasts'),
        where('ai_badassery_score', '>', 0),
        orderBy('ai_badassery_score', 'desc'),
        startAfter(lastDocCursor),
        limit(pageSize)
      );
    }

    const querySnapshot = await getDocs(q);
    const podcasts = querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];

    const lastDoc = querySnapshot.docs.length > 0
      ? querySnapshot.docs[querySnapshot.docs.length - 1]
      : null;

    return {
      podcasts,
      lastDoc,
      hasMore: querySnapshot.docs.length === pageSize
    };
  } catch (error: any) {
    console.error('Error fetching paginated podcasts:', error);
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.error('Missing Firestore index. Check Firebase Console for index creation link.');
    }
    return { podcasts: [], lastDoc: null, hasMore: false };
  }
};

/**
 * Get podcasts by Badassery category (one of 31 niches)
 */
export const getPodcastsByBadasseryCategory = async (
  category: string,
  limitCount: number = 100
): Promise<PodcastDocument[]> => {
  try {
    const q = query(
      collection(db, 'podcasts'),
      where('ai_primary_category', '==', category),
      where('ai_badassery_score', '>', 0),
      orderBy('ai_badassery_score', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error) {
    console.error('Error fetching podcasts by Badassery category:', error);
    return [];
  }
};

/**
 * Get top percentile podcasts (Top 1%, Top 5%, etc.)
 */
export const getTopPercentilePodcasts = async (
  percentile: string, // e.g., "Top 1%", "Top 5%"
  useGlobal: boolean = true, // true = ai_global_percentile, false = ai_category_percentile
  limitCount: number = 100
): Promise<PodcastDocument[]> => {
  try {
    const field = useGlobal ? 'ai_global_percentile' : 'ai_category_percentile';

    const q = query(
      collection(db, 'podcasts'),
      where(field, '==', percentile),
      orderBy('ai_badassery_score', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    })) as PodcastDocument[];
  } catch (error) {
    console.error('Error fetching top percentile podcasts:', error);
    return [];
  }
};

/**
 * Get podcasts with filters (comprehensive search)
 */
export const getFilteredPodcasts = async (filters: {
  category?: string;
  minBadasseryScore?: number;
  maxBadasseryScore?: number;
  minBusinessRelevance?: number;
  percentile?: string;
  topics?: string[];
  limitCount?: number;
}): Promise<PodcastDocument[]> => {
  try {
    // Due to Firestore query limitations, we'll fetch all scored podcasts and filter in memory
    const allPodcasts = await getScoredPodcasts(5000);

    let filtered = allPodcasts;

    // Apply filters
    if (filters.category) {
      filtered = filtered.filter(p => p.ai_primary_category === filters.category);
    }

    if (filters.minBadasseryScore !== undefined) {
      filtered = filtered.filter(p => (p.ai_badassery_score || 0) >= filters.minBadasseryScore!);
    }

    if (filters.maxBadasseryScore !== undefined) {
      filtered = filtered.filter(p => (p.ai_badassery_score || 0) <= filters.maxBadasseryScore!);
    }

    if (filters.minBusinessRelevance !== undefined) {
      filtered = filtered.filter(p => (p.ai_business_relevance || 0) >= filters.minBusinessRelevance!);
    }

    if (filters.percentile) {
      filtered = filtered.filter(p =>
        p.ai_global_percentile === filters.percentile ||
        p.ai_category_percentile === filters.percentile
      );
    }

    if (filters.topics && filters.topics.length > 0) {
      filtered = filtered.filter(p =>
        p.ai_topics?.some(t =>
          filters.topics!.some(ft =>
            t.toLowerCase().includes(ft.toLowerCase())
          )
        )
      );
    }

    // Sort by Badassery Score
    filtered.sort((a, b) => (b.ai_badassery_score || 0) - (a.ai_badassery_score || 0));

    // Apply limit
    const limit = filters.limitCount || 100;
    return filtered.slice(0, limit);

  } catch (error) {
    console.error('Error fetching filtered podcasts:', error);
    return [];
  }
};

/**
 * Get category distribution (count of podcasts per category)
 */
export const getCategoryDistribution = async (): Promise<Record<string, number>> => {
  try {
    const allPodcasts = await getScoredPodcasts(10000);

    const distribution: Record<string, number> = {};

    allPodcasts.forEach(p => {
      const category = p.ai_primary_category || 'Uncategorized';
      distribution[category] = (distribution[category] || 0) + 1;
    });

    return distribution;
  } catch (error) {
    console.error('Error getting category distribution:', error);
    return {};
  }
};

/**
 * Email candidate with source information
 */
export interface PodcastEmailCandidate {
  email: string;
  sources: string[];  // e.g., ['RSS Feed', 'Website']
  type: 'primary' | 'booking' | 'general';
}

/**
 * Get all available emails for a podcast with their sources
 */
export const getPodcastEmails = (podcast: PodcastDocument): PodcastEmailCandidate[] => {
  const emailMap = new Map<string, Set<string>>();

  const FAKE_EMAIL_PATTERNS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.mp3', '.mp4', '.webp', '.ico',
    'noreply', 'no-reply', 'donotreply', 'do-not-reply',
    'example.com', 'wixpress', 'sentry.io', 'schema.org',
    'mailchimp', 'klaviyo', 'sendgrid', 'amazonses',
    'your.email', 'your@', 'user@', 'email@domain',
  ];

  // Helper to add email with source
  const addEmail = (email: string | null | undefined, source: string) => {
    if (!email || !email.includes('@')) return;

    const normalizedEmail = email.toLowerCase().trim();

    // Filter out fake/placeholder/asset emails
    if (FAKE_EMAIL_PATTERNS.some(p => normalizedEmail.includes(p))) return;
    // Must have valid TLD (2-6 chars, letters only)
    if (!/\.[a-z]{2,6}$/.test(normalizedEmail)) return;

    if (!emailMap.has(normalizedEmail)) {
      emailMap.set(normalizedEmail, new Set());
    }
    emailMap.get(normalizedEmail)!.add(source);
  };

  // Collect emails from different sources
  addEmail(podcast.rss_owner_email, 'RSS Feed');
  addEmail(podcast.website_email, 'Website');

  // Convert to array and classify by type
  const results: PodcastEmailCandidate[] = [];

  emailMap.forEach((sources, email) => {
    // Determine type based on email address
    let type: 'primary' | 'booking' | 'general' = 'general';

    const lowerEmail = email.toLowerCase();
    if (lowerEmail.includes('booking') || lowerEmail.includes('producer')) {
      type = 'booking';
    } else if (
      sources.has('RSS Feed') ||
      lowerEmail.includes('host') ||
      lowerEmail.includes('owner')
    ) {
      type = 'primary';
    }

    results.push({
      email,
      sources: Array.from(sources),
      type
    });
  });

  // Sort: RSS Feed first, then Website, then others
  results.sort((a, b) => {
    const sourceOrder = (sources: string[]) => {
      if (sources.includes('RSS Feed')) return 0;
      if (sources.includes('Website')) return 1;
      return 2;
    };
    return sourceOrder(a.sources) - sourceOrder(b.sources);
  });

  return results;
};

/**
 * Get social media links for a podcast
 */
export interface PodcastSocialLinks {
  twitter?: string;
  instagram?: string;
  youtube?: string;
  facebook?: string;
  linkedin?: string;
  tiktok?: string;
  website?: string;
}

const normalizeUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  const u = url.trim();
  if (u.startsWith('http')) return u;
  return 'https://' + u;
};

export const getPodcastSocialLinks = (podcast: PodcastDocument): PodcastSocialLinks => {
  const links: PodcastSocialLinks = {};

  if (podcast.yt_channel_id) links.youtube = `https://youtube.com/channel/${podcast.yt_channel_id}`;
  else if (podcast.website_youtube) links.youtube = normalizeUrl(podcast.website_youtube);

  if (podcast.website_instagram) links.instagram = normalizeUrl(podcast.website_instagram);
  if (podcast.website_twitter)   links.twitter   = normalizeUrl(podcast.website_twitter);
  if (podcast.website_facebook)  links.facebook  = normalizeUrl(podcast.website_facebook);
  if (podcast.website_linkedin)  links.linkedin  = normalizeUrl(podcast.website_linkedin);
  if (podcast.website_tiktok)    links.tiktok    = normalizeUrl(podcast.website_tiktok);

  if (podcast.website || podcast.rss_website) links.website = podcast.website || podcast.rss_website;

  return links;
};

/**
 * ============================================================================
 * OUTREACH <-> PODCAST LINKING FUNCTIONS
 * ============================================================================
 */

/**
 * Get podcasts that have been contacted for a specific client
 */
export const getContactedPodcastsForClient = async (clientId: string): Promise<string[]> => {
  try {
    const outreachQuery = query(
      collection(db, 'outreach'),
      where('client_id', '==', clientId)
    );

    const outreachSnapshot = await getDocs(outreachQuery);
    const contactedIds = new Set<string>();

    outreachSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.podcast_itunes_id) {
        contactedIds.add(data.podcast_itunes_id);
      }
    });

    return Array.from(contactedIds);
  } catch (error) {
    console.error('Error fetching contacted podcasts:', error);
    return [];
  }
};

/**
 * Get suggested podcasts for a client (not yet contacted, high Badassery Score, excluding blacklisted)
 */
export const getSuggestedPodcastsForClient = async (
  clientId: string,
  limitCount: number = 50
): Promise<PodcastDocument[]> => {
  try {
    // Get already contacted podcasts
    const contactedIds = await getContactedPodcastsForClient(clientId);

    // Get high-scoring podcasts (already excludes blacklisted)
    const allPodcasts = await getScoredPodcastsFiltered(200);

    // Filter out already contacted
    const suggestions = allPodcasts.filter(p =>
      !contactedIds.includes(p.itunesId || '')
    );

    return suggestions.slice(0, limitCount);
  } catch (error) {
    console.error('Error getting suggested podcasts:', error);
    return [];
  }
};

/**
 * Get outreach history for a specific podcast
 */
export const getOutreachHistoryForPodcast = async (podcastItunesId: string): Promise<any[]> => {
  try {
    const outreachQuery = query(
      collection(db, 'outreach'),
      where('podcast_itunes_id', '==', podcastItunesId),
      orderBy('sent_at', 'desc')
    );

    const outreachSnapshot = await getDocs(outreachQuery);
    return outreachSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching outreach history:', error);
    return [];
  }
};

/**
 * Get podcast details by iTunes ID (with enrichment for outreach display)
 */
export const getPodcastForOutreach = async (itunesId: string): Promise<PodcastDocument | null> => {
  try {
    const docRef = doc(db, 'podcasts', itunesId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        itunesId: docSnap.id,
        ...docSnap.data()
      } as PodcastDocument;
    }

    return null;
  } catch (error) {
    console.error('Error fetching podcast for outreach:', error);
    return null;
  }
};
