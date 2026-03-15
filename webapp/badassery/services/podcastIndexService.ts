/**
 * Browser-side PodcastIndex API client
 *
 * All requests go through the Vite dev proxy at /api/podcastindex/*
 * which injects the SHA-1 auth headers server-side (vite.config.ts).
 * No API secrets are exposed to the browser.
 *
 * Feed ID resolution order:
 *   1. podcast.id  (PodcastIndex internal feed ID, stored on enriched docs)
 *   2. /podcasts/byitunesid  (iTunes ID → PI feed ID lookup)
 *   3. Error: "No feed ID available"
 */

const API_BASE = '/api/podcastindex';

export interface PIEpisode {
  id: number;
  title: string;
  description: string;
  datePublished: number; // Unix timestamp (seconds)
  duration: number;      // seconds
  enclosureUrl: string;  // audio URL
  link: string;
}

async function piGet(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`PodcastIndex HTTP ${res.status}`);
  return res.json();
}

async function resolveFeedIdFromItunes(itunesId: string): Promise<number | null> {
  const data = await piGet(`/podcasts/byitunesid?id=${itunesId}`) as { feed?: { id: number } };
  return data?.feed?.id ?? null;
}

/**
 * Fetch up to `max` recent episodes for a podcast.
 *
 * @param podcast  Object with itunesId (required) and optionally id (PI feed ID)
 * @param max      Max episodes to fetch (default 50)
 */
export async function fetchEpisodes(
  podcast: { itunesId: string; id?: number },
  max = 50
): Promise<PIEpisode[]> {
  console.log('[PodcastIndex] Resolving feed for:', {
    itunesId: podcast.itunesId,
    storedFeedId: podcast.id ?? null,
  });

  // Use stored PI feed ID — iTunes fallback removed: the proxy only works in
  // Vite dev and is not available in production (Firebase Hosting).
  if (!podcast.id) {
    throw new Error('No feed ID available for this podcast');
  }

  const feedId = podcast.id;

  console.log('[PodcastIndex] Fetching episodes for feed ID:', feedId);
  const data = await piGet(`/episodes/byfeedid?id=${feedId}&max=${max}`) as { items?: PIEpisode[] };
  const episodes = data?.items ?? [];
  console.log('[PodcastIndex] Episodes fetched:', episodes.length);
  return episodes;
}

export function formatPIDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatPIDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}
