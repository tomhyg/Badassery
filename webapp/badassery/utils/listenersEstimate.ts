import { Podcast } from '../types';

export interface ListenersEstimate {
  estimate: number | null;
  label: string;      // e.g. "~2.5K / ep"
  range: string;      // e.g. "1K – 5K"
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Estimate podcast downloads per episode from available signals.
 *
 * Methodology (similar to Rephonic):
 *  1. YouTube subscribers  → strongest proxy (~17% conversion to podcast dl/ep)
 *  2. Apple review count   → 1 review ≈ 100-200 listeners × ~35% dl rate per ep
 *  3. Category percentile  → Spotify/Buzzsprout industry benchmarks
 *  4. ai_audience_size     → last-resort label mapping
 *
 * Confidence:
 *  high   = 2+ hard signals (YT + Apple)
 *  medium = 1 hard signal
 *  low    = inferred from AI labels only
 */
export function estimateListenersPerEpisode(podcast: Podcast): ListenersEstimate {
  const signals: number[] = [];

  // --- Signal 1: YouTube subscribers ---
  const ytSubs = podcast.yt_subscribers ?? podcast.youtube?.subscribers;
  if (ytSubs && ytSubs > 100) {
    signals.push(ytSubs * 0.17);
  }

  // --- Signal 2: Apple review count ---
  const reviews = podcast.apple_rating_count ?? podcast.apple?.review_count;
  if (reviews && reviews > 0) {
    signals.push(reviews * 55);
  }

  const confidence: 'low' | 'medium' | 'high' =
    signals.length >= 2 ? 'high' : signals.length === 1 ? 'medium' : 'low';

  // --- Fallback: category percentile (industry benchmarks) ---
  if (signals.length === 0) {
    const pct = typeof podcast.ai_category_percentile === 'string' ? podcast.ai_category_percentile
              : typeof podcast.ai_global_percentile === 'string' ? podcast.ai_global_percentile
              : null;
    if (pct) {
      if (pct.includes('Top 1%'))       signals.push(50000);
      else if (pct.includes('Top 5%'))  signals.push(12000);
      else if (pct.includes('Top 10%')) signals.push(5000);
      else if (pct.includes('Top 25%')) signals.push(2000);
      else if (pct.includes('Top 50%')) signals.push(750);
      else                               signals.push(150);
    }
  }

  // --- Fallback: ai_audience_size label ---
  if (signals.length === 0) {
    const size = podcast.ai_audience_size;
    if (size === 'Very Large') signals.push(25000);
    else if (size === 'Large') signals.push(7500);
    else if (size === 'Medium') signals.push(2000);
    else if (size === 'Small') signals.push(400);
  }

  if (signals.length === 0) {
    return { estimate: null, label: 'Unknown', range: 'Unknown', confidence: 'low' };
  }

  const estimate = Math.round(signals.reduce((a, b) => a + b, 0) / signals.length);

  const fmt = (n: number) =>
    n >= 10000 ? `${Math.round(n / 1000)}K`
    : n >= 1000 ? `${(n / 1000).toFixed(1)}K`
    : `${n}`;

  let range: string;
  if (estimate < 200)        range = '< 200';
  else if (estimate < 500)   range = '200 – 500';
  else if (estimate < 1000)  range = '500 – 1K';
  else if (estimate < 2000)  range = '1K – 2K';
  else if (estimate < 5000)  range = '2K – 5K';
  else if (estimate < 10000) range = '5K – 10K';
  else if (estimate < 25000) range = '10K – 25K';
  else if (estimate < 50000) range = '25K – 50K';
  else if (estimate < 100000)range = '50K – 100K';
  else                        range = '100K+';

  return { estimate, label: `~${fmt(estimate)} / ep`, range, confidence };
}
