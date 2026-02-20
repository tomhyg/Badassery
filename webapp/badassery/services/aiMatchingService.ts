/**
 * ============================================================================
 * AI MATCHING SERVICE
 * ============================================================================
 *
 * Uses Gemini AI to match clients with the best podcasts
 * Stores matches in Firestore collection 'ai_matches'
 */

import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { getAIConfig } from './settingsService';
import { getScoredPodcastsFiltered, getPodcastByItunesId, PodcastDocument } from './podcastService';
import { getClientById } from './clientService';
import { createOutreachV2 } from './outreachServiceV2';
import { AIMatch, AIMatchWithPodcast, Client, getClientDisplayData } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'ai_matches';

// ============================================================================
// GEMINI MATCHING PROMPT
// ============================================================================

const MATCHING_PROMPT = `Tu es un expert en booking podcast pour Badassery, une agence de booking podcast premium.

=== PROFIL CLIENT ===
Nom: {client_name}
Entreprise: {client_company}
Titre: {client_title}
Bio: {client_bio}
Sujets de discussion: {client_topics}
Angles uniques: {client_unique_angles}
Objectifs: {client_goals}
Audience cible: {client_target_audience}

=== PODCASTS CANDIDATS ===
{podcasts_json}

=== TÂCHE ===
Analyse chaque podcast et évalue sa compatibilité avec ce client.
Retourne les {count} meilleurs podcasts classés par pertinence.

Pour chaque podcast, fournis:
1. podcast_itunes_id: L'ID exact du podcast
2. match_score (0-100): Score de compatibilité
3. match_reasoning (2-3 phrases en anglais): Pourquoi ce podcast est un bon match
4. match_topics (array): Quels sujets du client correspondent à ce podcast

=== FORMAT DE SORTIE (JSON STRICT) ===
{
  "matches": [
    {
      "podcast_itunes_id": "123456789",
      "match_score": 85,
      "match_reasoning": "This podcast focuses on entrepreneurship and leadership, which aligns perfectly with the client's expertise in building startups. The host regularly features founders who have scaled companies.",
      "match_topics": ["entrepreneurship", "leadership", "startup growth"]
    }
  ]
}

IMPORTANT: Retourne UNIQUEMENT du JSON valide, sans texte avant ou après.`;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Generate AI matches for a client
 */
export async function generateMatchesForClient(
  clientId: string,
  userId: string,
  count: number = 10
): Promise<AIMatch[]> {
  console.log(`[AI Matching] Generating ${count} matches for client ${clientId}...`);

  // 1. Load client data
  const client = await getClientById(clientId);
  if (!client) {
    throw new Error('Client not found');
  }

  const clientData = getClientDisplayData(client);

  // 2. Get existing matches to exclude
  const existingMatches = await getMatchesForClient(clientId);
  const excludeIds = new Set(existingMatches.map(m => m.podcast_itunes_id));

  // 3. Get top podcasts (guest-friendly, with email, high score) - excludes blacklisted
  console.log('[AI Matching] Fetching scored podcasts (excluding blacklisted)...');
  const allPodcasts = await getScoredPodcastsFiltered(200);
  console.log(`[AI Matching] Got ${allPodcasts.length} total podcasts (after blacklist filter)`);

  if (allPodcasts.length === 0) {
    throw new Error('No podcasts found in database. Make sure podcasts have been imported and scored (ai_badassery_score > 0). Check browser console for Firestore index errors.');
  }

  // Filter out already matched podcasts and those without email
  // Relaxed filtering: only require email, not badassery score minimum
  let candidates = allPodcasts.filter(p => {
    const hasEmail = !!(p.rss_owner_email || p.website_email);
    const notExcluded = !excludeIds.has(p.itunesId);
    const guestFriendly = p.ai_guest_friendly !== false;

    return notExcluded && hasEmail && guestFriendly;
  });

  console.log(`[AI Matching] ${candidates.length} candidate podcasts after filtering (with email)`);

  if (candidates.length === 0) {
    // If no candidates with email, try without email filter as fallback
    candidates = allPodcasts.filter(p =>
      !excludeIds.has(p.itunesId) &&
      p.ai_guest_friendly !== false
    );

    console.log(`[AI Matching] Fallback: ${candidates.length} podcasts without email filter`);

    if (candidates.length === 0) {
      throw new Error('No eligible podcasts found. Make sure you have podcasts in your database with ai_badassery_score > 0.');
    }
  }

  // 4. Prepare podcasts for Gemini (limit to 50 for context)
  const podcastsForAI = candidates.slice(0, 50).map(p => ({
    podcast_itunes_id: p.itunesId,
    title: p.title,
    host: p.rss_owner_name || 'Unknown',
    description: p.ai_summary || p.description?.slice(0, 300) || '',
    topics: p.ai_topics || [],
    category: p.ai_primary_category || 'General',
    audience: p.ai_target_audience || '',
    badassery_score: p.ai_badassery_score || 0
  }));

  // 5. Build prompt
  const prompt = MATCHING_PROMPT
    .replace('{client_name}', clientData.contact_name)
    .replace('{client_company}', clientData.company_name)
    .replace('{client_title}', clientData.spokesperson.title || '')
    .replace('{client_bio}', clientData.spokesperson.bio || '')
    .replace('{client_topics}', (clientData.spokesperson.topics || []).join(', '))
    .replace('{client_unique_angles}', (client.spokesperson?.unique_angles || []).join(', '))
    .replace('{client_goals}', client.goals?.professionalGoals || client.goals?.top3Goals || '')
    .replace('{client_target_audience}', client.podcast?.audienceDescription || '')
    .replace('{podcasts_json}', JSON.stringify(podcastsForAI, null, 2))
    .replace('{count}', count.toString());

  // 6. Call Gemini API
  const aiConfig = await getAIConfig();

  console.log('[AI Matching] Calling Gemini API...');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.pitch_model}:generateContent?key=${aiConfig.api_keys.gemini}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3, // Lower temperature for more consistent JSON
          maxOutputTokens: 2000,
        }
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    console.error('[AI Matching] Gemini API error:', errorData);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('No response from Gemini API');
  }

  // 7. Parse JSON response
  let parsedMatches: Array<{
    podcast_itunes_id: string;
    match_score: number;
    match_reasoning: string;
    match_topics: string[];
  }>;

  try {
    // Clean up response (remove markdown code blocks if present)
    let cleanJson = rawText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleanJson);
    parsedMatches = parsed.matches || [];
  } catch (e) {
    console.error('[AI Matching] Failed to parse Gemini response:', rawText);
    throw new Error('Failed to parse AI response. Please try again.');
  }

  console.log(`[AI Matching] Received ${parsedMatches.length} matches from Gemini`);

  // 8. Create batch ID for this generation
  const batchId = `batch_${Date.now()}_${clientId.slice(0, 8)}`;

  // 9. Save matches to Firestore
  const savedMatches: AIMatch[] = [];

  for (const match of parsedMatches.slice(0, count)) {
    // Validate podcast exists - try both string and original format
    const podcastIdStr = String(match.podcast_itunes_id);
    let podcastDoc = await getPodcastByItunesId(podcastIdStr);

    if (!podcastDoc) {
      console.warn(`[AI Matching] Podcast ${podcastIdStr} not found in Firestore, skipping`);
      continue;
    }

    console.log(`[AI Matching] Validated podcast: ${podcastDoc.title} (${podcastIdStr})`);

    const matchDoc: Omit<AIMatch, 'id'> = {
      client_id: clientId,
      podcast_itunes_id: podcastIdStr,
      status: 'pending',
      match_score: Math.min(100, Math.max(0, match.match_score)),
      match_reasoning: match.match_reasoning,
      match_topics: match.match_topics || [],
      batch_id: batchId,
      generated_at: Timestamp.now(),
      generated_by: userId,
      can_resurface: true
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), matchDoc);

    savedMatches.push({
      id: docRef.id,
      ...matchDoc
    } as AIMatch);
  }

  console.log(`[AI Matching] Saved ${savedMatches.length} matches to Firestore`);

  if (savedMatches.length === 0 && parsedMatches.length > 0) {
    console.warn('[AI Matching] Warning: AI returned matches but none were saved. Check if podcast IDs match Firestore document IDs.');
    throw new Error(`AI returned ${parsedMatches.length} matches but none could be validated. Check console for details.`);
  }

  return savedMatches;
}

/**
 * Get all matches for a client
 * Note: If index errors occur, we fallback to client-side filtering
 */
export async function getMatchesForClient(
  clientId: string,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<AIMatch[]> {
  try {
    // Try simple query first (without orderBy to avoid index requirements)
    let q;

    if (status) {
      q = query(
        collection(db, COLLECTION_NAME),
        where('client_id', '==', clientId),
        where('status', '==', status)
      );
    } else {
      q = query(
        collection(db, COLLECTION_NAME),
        where('client_id', '==', clientId)
      );
    }

    const snapshot = await getDocs(q);

    const matches = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...(data as Omit<AIMatch, 'id'>)
      } as AIMatch;
    });

    // Sort client-side by generated_at descending
    return matches.sort((a, b) => {
      const dateA = a.generated_at?.toDate?.() || new Date(0);
      const dateB = b.generated_at?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
  } catch (error: any) {
    console.error('[AI Matching] Error getting matches:', error);

    // If it's an index error, try without compound queries
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.log('[AI Matching] Index not found, trying fallback query...');
      try {
        const q = query(
          collection(db, COLLECTION_NAME),
          where('client_id', '==', clientId)
        );
        const snapshot = await getDocs(q);
        let matches = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as AIMatch[];

        // Filter by status client-side if needed
        if (status) {
          matches = matches.filter(m => m.status === status);
        }

        // Sort client-side
        return matches.sort((a, b) => {
          const dateA = a.generated_at?.toDate?.() || new Date(0);
          const dateB = b.generated_at?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
      } catch (fallbackError) {
        console.error('[AI Matching] Fallback query also failed:', fallbackError);
        return [];
      }
    }

    return [];
  }
}

/**
 * Get pending matches for a client
 */
export async function getPendingMatchesForClient(clientId: string): Promise<AIMatch[]> {
  return getMatchesForClient(clientId, 'pending');
}

/**
 * Get match by ID
 */
export async function getMatchById(matchId: string): Promise<AIMatch | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, matchId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data()
    } as AIMatch;
  } catch (error) {
    console.error('[AI Matching] Error getting match:', error);
    return null;
  }
}

/**
 * Approve a match - creates outreach automatically
 */
export async function approveMatch(
  matchId: string,
  userId: string
): Promise<string> {
  console.log(`[AI Matching] Approving match ${matchId}...`);

  // 1. Get match
  const match = await getMatchById(matchId);
  if (!match) {
    throw new Error('Match not found');
  }

  if (match.status !== 'pending') {
    throw new Error(`Match is already ${match.status}`);
  }

  // 2. Get podcast and client
  const podcastDoc = await getPodcastByItunesId(match.podcast_itunes_id);
  const client = await getClientById(match.client_id);

  if (!podcastDoc || !client) {
    throw new Error('Podcast or client not found');
  }

  const clientData = getClientDisplayData(client);

  // 3. Create outreach
  const primaryEmail = podcastDoc.rss_owner_email || podcastDoc.website_email || null;

  const outreachId = await createOutreachV2({
    client_id: match.client_id,
    client_name: clientData.contact_name,
    podcast_id: podcastDoc.itunesId,
    podcast_itunes_id: podcastDoc.itunesId,
    podcast_name: podcastDoc.title || 'Unknown Podcast',
    podcast_url: podcastDoc.apple_api_url,
    host_email: primaryEmail,
    status: 'identified',
    status_category: 'discovery',
    match_id: matchId,
    subject_tag: match.match_topics[0] || 'General',
    pitch_angle: match.match_reasoning,
    email_thread: [],
    notes: [{
      id: `note_${Date.now()}`,
      text: `AI Match Score: ${match.match_score}/100\nReasoning: ${match.match_reasoning}`,
      created_by: userId,
      created_at: Timestamp.now()
    }],
    reminders: [],
    email_stats: {
      total_sent: 0,
      total_received: 0,
      awaiting_reply: false
    },
    created_by: userId
  });

  // 4. Update match status
  await updateDoc(doc(db, COLLECTION_NAME, matchId), {
    status: 'approved',
    actioned_at: Timestamp.now(),
    actioned_by: userId,
    outreach_id: outreachId
  });

  console.log(`[AI Matching] Match approved, outreach created: ${outreachId}`);

  return outreachId;
}

/**
 * Reject a match and generate a replacement
 */
export async function rejectMatch(
  matchId: string,
  userId: string,
  reason?: string
): Promise<AIMatch | null> {
  console.log(`[AI Matching] Rejecting match ${matchId}...`);

  // 1. Get match
  const match = await getMatchById(matchId);
  if (!match) {
    throw new Error('Match not found');
  }

  if (match.status !== 'pending') {
    throw new Error(`Match is already ${match.status}`);
  }

  // 2. Update match status
  await updateDoc(doc(db, COLLECTION_NAME, matchId), {
    status: 'rejected',
    actioned_at: Timestamp.now(),
    actioned_by: userId,
    rejection_reason: reason || 'User rejected',
    can_resurface: true // Can reappear in future batches
  });

  console.log(`[AI Matching] Match rejected`);

  // 3. Generate 1 replacement match
  try {
    const newMatches = await generateMatchesForClient(match.client_id, userId, 1);
    return newMatches[0] || null;
  } catch (error) {
    console.error('[AI Matching] Failed to generate replacement:', error);
    return null;
  }
}

/**
 * Get matches with enriched podcast data
 */
export async function getEnrichedMatchesForClient(
  clientId: string,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<AIMatchWithPodcast[]> {
  const matches = await getMatchesForClient(clientId, status);

  const enriched = await Promise.all(
    matches.map(async (match) => {
      const podcastDoc = await getPodcastByItunesId(match.podcast_itunes_id);
      // Convert PodcastDocument to Podcast format
      const podcast = podcastDoc ? {
        ...podcastDoc,
        id: podcastDoc.itunesId,
        title: podcastDoc.title || '',
        imageUrl: podcastDoc.imageUrl || ''
      } : undefined;
      return {
        ...match,
        podcast
      } as AIMatchWithPodcast;
    })
  );

  return enriched;
}

/**
 * Get match statistics for a client
 */
export async function getMatchStatsForClient(clientId: string): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}> {
  const allMatches = await getMatchesForClient(clientId);

  return {
    total: allMatches.length,
    pending: allMatches.filter(m => m.status === 'pending').length,
    approved: allMatches.filter(m => m.status === 'approved').length,
    rejected: allMatches.filter(m => m.status === 'rejected').length
  };
}
