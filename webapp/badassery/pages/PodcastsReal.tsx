import React, { useState, useEffect, useMemo } from 'react';
import { estimateListenersPerEpisode } from '../utils/listenersEstimate';
import {
  Search, Filter, Star, Mic, Mail, Globe,
  Youtube, Twitter, Instagram, Linkedin,
  ArrowUpDown, Loader, ChevronDown, ChevronUp,
  Calendar, Clock, Award, Music2, Facebook, Video, Edit3,
} from 'lucide-react';
import {
  getAllPodcastsCachedFiltered,
  getScoredPodcastsFiltered,
  isPodcastCacheLoaded,
  PodcastDocument,
} from '../services/podcastService';
import { BrooklynDetailModal } from '../components/BrooklynDetailModal';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_HIERARCHY: Record<string, string[]> = {
  'Business':           ['Entrepreneurship', 'Marketing & Sales', 'Leadership', 'Finance & Investing', 'Career & Work', 'Real Estate', 'Non-Profit'],
  'Health & Wellness':  ['Personal Development', 'Parenting & Family', 'Relationships', 'Psychology', 'Food & Lifestyle', 'Fitness'],
  'Arts & Culture':     ['Film & TV', 'Music', 'Gaming', 'Comedy', 'Design & Creativity'],
  'Education':          ['Science', 'History'],
  'Technology':         [],
  'Society & Politics': ['News & Media', 'True Crime', 'Religion & Spirituality', 'Environment'],
  'Sports & Fitness':   [],
  'Travel & Adventure': [],
  'Other':              [],
};

const MAIN_CATEGORIES = ['All', ...Object.keys(CATEGORY_HIERARCHY)];

const CAT_ALIASES: Record<string, string> = {
  'society & culture':  'Society & Politics',
  'careers':            'Career & Work',
  'career':             'Career & Work',
  'non-profits':        'Non-Profit',
};

const ALL_KNOWN_CATS = new Set([
  ...Object.keys(CATEGORY_HIERARCHY),
  ...Object.values(CATEGORY_HIERARCHY).flat(),
].map(c => c.toLowerCase()));

function normalizeCat(cat: string | undefined | null): string {
  if (!cat) return 'Other';
  const lower = cat.trim().toLowerCase();
  if (CAT_ALIASES[lower]) return CAT_ALIASES[lower];
  const allKnown = [...Object.keys(CATEGORY_HIERARCHY), ...Object.values(CATEGORY_HIERARCHY).flat()];
  const match = allKnown.find(k => k.toLowerCase() === lower);
  if (match) return match;
  if (!ALL_KNOWN_CATS.has(lower)) return 'Other';
  return cat.trim();
}

const EPISODE_LENGTH_OPTIONS = [
  { label: 'Any',         value: 'any' },
  { label: 'Under 30m',  value: 'under30' },
  { label: '30–60m',     value: '30to60' },
  { label: 'Over 60m',   value: 'over60' },
] as const;

const AUDIENCE_SIZE_OPTIONS = [
  { label: 'Any',    value: 'any' },
  { label: 'Micro',  value: 'Micro' },
  { label: 'Small',  value: 'Small' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Large',  value: 'Large' },
  { label: 'Mega',   value: 'Mega' },
] as const;

const PERCENTILE_OPTIONS = [
  { label: 'Any',      value: 'any' },
  { label: 'Top 1%',   value: '99' },
  { label: 'Top 5%',   value: '95' },
  { label: 'Top 10%',  value: '90' },
  { label: 'Top 25%',  value: '75' },
  { label: 'Top 50%',  value: '50' },
] as const;

const SORT_OPTIONS = [
  { label: 'Badassery Score',  value: 'score' },
  { label: 'Most Recent',      value: 'recent' },
  { label: 'Most Episodes',    value: 'episodes' },
  { label: 'Best Engagement',  value: 'engagement' },
  { label: 'Best Contact',     value: 'contact' },
] as const;

const PAGE_SIZE = 18;

const CATEGORY_COLORS: Record<string, string> = {
  'Business':               'bg-blue-100 text-blue-700',
  'Technology':             'bg-indigo-100 text-indigo-700',
  'Marketing & Sales':      'bg-purple-100 text-purple-700',
  'Entrepreneurship':       'bg-violet-100 text-violet-700',
  'Leadership':             'bg-slate-200 text-slate-700',
  'Health & Wellness':      'bg-green-100 text-green-700',
  'Finance & Investing':    'bg-emerald-100 text-emerald-700',
  'Science':                'bg-cyan-100 text-cyan-700',
  'Education':              'bg-teal-100 text-teal-700',
  'Society & Politics':     'bg-orange-100 text-orange-700',
  'Arts & Culture':         'bg-rose-100 text-rose-700',
  'Sports & Fitness':       'bg-amber-100 text-amber-700',
  'News & Media':           'bg-sky-100 text-sky-700',
  'Religion & Spirituality':'bg-pink-100 text-pink-700',
  'Personal Development':   'bg-lime-100 text-lime-700',
  'Parenting & Family':     'bg-yellow-100 text-yellow-700',
  'Real Estate':            'bg-stone-100 text-stone-700',
  'Relationships':          'bg-fuchsia-100 text-fuchsia-700',
  'Other':                  'bg-gray-100 text-gray-600',
};

const AUDIENCE_COLORS: Record<string, string> = {
  'Micro':  'bg-slate-100 text-slate-600',
  'Small':  'bg-blue-50 text-blue-600',
  'Medium': 'bg-indigo-100 text-indigo-600',
  'Large':  'bg-purple-100 text-purple-600',
  'Mega':   'bg-orange-100 text-orange-700',
};

const SUB_SCORES = [
  { label: 'Guest',       key: 'score_guest_compatibility',  weight: 20 },
  { label: 'Audience',    key: 'score_audience_power',       weight: 25 },
  { label: 'Authority',   key: 'score_podcast_authority',    weight: 15 },
  { label: 'Activity',    key: 'score_activity_consistency', weight: 20 },
  { label: 'Engagement',  key: 'score_engagement',           weight: 10 },
  { label: 'Contact',     key: 'score_contactability',       weight: 10 },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function daysAgo(ts: number | null | undefined): string {
  if (!ts) return '—';
  const ms = ts > 1e10 ? ts : ts * 1000;
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return '1 day ago';
  return `${d} days ago`;
}

function daysAgoNum(ts: number | null | undefined): number {
  if (!ts) return Infinity;
  const ms = ts > 1e10 ? ts : ts * 1000;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function formatPercentile(p: number | string | null | undefined): string {
  if (p == null || p === '') return '';
  if (typeof p === 'string') return p;
  if (p >= 99) return 'Top 1%';
  if (p >= 95) return 'Top 5%';
  if (p >= 90) return 'Top 10%';
  if (p >= 75) return 'Top 25%';
  if (p >= 50) return 'Top 50%';
  return `Top ${Math.round(100 - p)}%`;
}

function scoreStyle(s: number | null | undefined): string {
  if (s == null) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (s >= 70) return 'bg-green-100 text-green-700 border-green-200';
  if (s >= 50) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

function barColor(s: number | null | undefined): string {
  if (s == null) return 'bg-slate-300';
  if (s >= 70) return 'bg-green-500';
  if (s >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

// ── PodcastCard ──────────────────────────────────────────────────────────────

const PodcastCard: React.FC<{ podcast: PodcastDocument; onEdit?: () => void }> = ({ podcast: p, onEdit }) => {
  const [scoresOpen, setScoresOpen] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  const chartRank = Math.min(
    p.apple_chart_rank ?? Infinity,
    p.spotify_chart_rank ?? Infinity,
  );
  const displayRank = chartRank < Infinity ? chartRank : null;
  const lastEpTs = p.lastUpdate ?? p.newestItemPubdate;
  const catColor = CATEGORY_COLORS[p.ai_primary_category || ''] || 'bg-gray-100 text-gray-600';
  const audColor = AUDIENCE_COLORS[p.ai_audience_size || ''] || 'bg-slate-100 text-slate-600';
  const pctLabel = formatPercentile(p.ai_global_percentile);
  const listenersEst = estimateListenersPerEpisode(p as any);

  const socialLinks = [
    { href: p.website_youtube,   icon: <Youtube size={14} />,    title: 'YouTube',    cls: 'hover:text-red-600' },
    { href: p.website_instagram, icon: <Instagram size={14} />,  title: 'Instagram',  cls: 'hover:text-pink-600' },
    { href: p.website_twitter,   icon: <Twitter size={14} />,    title: 'Twitter/X',  cls: 'hover:text-sky-500' },
    { href: p.website_spotify,   icon: <Music2 size={14} />,     title: 'Spotify',    cls: 'hover:text-green-600' },
    { href: p.website_linkedin,  icon: <Linkedin size={14} />,   title: 'LinkedIn',   cls: 'hover:text-blue-700' },
    { href: p.website_facebook,  icon: <Facebook size={14} />,   title: 'Facebook',   cls: 'hover:text-blue-600' },
    { href: p.website_tiktok,    icon: <Video size={14} />,      title: 'TikTok',     cls: 'hover:text-slate-900' },
  ].filter(s => !!s.href);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">

      {/* ── TOP: cover + title + score ── */}
      <div className="p-4 flex gap-3">
        <img
          src={!imgErr && p.imageUrl ? p.imageUrl : `https://placehold.co/80x80/e2e8f0/94a3b8?text=${encodeURIComponent((p.title || 'P')[0])}`}
          alt={p.title}
          className="w-20 h-20 rounded-lg object-cover flex-shrink-0 bg-slate-100 shadow-sm"
          onError={() => setImgErr(true)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1.5">
            <h3 className="flex-1 font-bold text-slate-900 text-sm leading-snug line-clamp-2">
              {p.title || '—'}
            </h3>
            {/* Score badge */}
            <div className={`flex-shrink-0 border rounded-lg px-2.5 py-1.5 text-center min-w-[52px] ${scoreStyle(p.ai_badassery_score)}`}>
              <div className="text-xl font-bold leading-none">{p.ai_badassery_score?.toFixed(0) ?? '—'}</div>
              <div className="text-[10px] font-medium opacity-60 mt-0.5">score</div>
            </div>
          </div>
          {/* Category + percentile */}
          <div className="flex flex-wrap gap-1.5">
            {p.ai_primary_category && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${catColor}`}>
                {p.ai_primary_category}
              </span>
            )}
            {pctLabel && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-indigo-50 text-indigo-600">
                {pctLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── STATS ROW ── */}
      <div className="px-4 pb-3 border-b border-slate-100">
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {p.episodeCount != null && (
            <span className="flex items-center gap-1">
              <Mic size={11} className="text-indigo-400" />
              {p.episodeCount} eps
            </span>
          )}
          {p.avg_episode_length_min != null && (
            <span className="flex items-center gap-1">
              <Clock size={11} className="text-teal-400" />
              {p.avg_episode_length_min} min
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar size={11} className="text-slate-400" />
            {daysAgo(lastEpTs as number)}
          </span>
          {p.ai_audience_size && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${audColor}`}>
              {p.ai_audience_size}
            </span>
          )}
          {listenersEst.estimate && (
            <span className="text-xs text-slate-400" title="Estimated downloads per episode">
              {listenersEst.label}
            </span>
          )}
        </div>
      </div>

      {/* ── RATINGS ROW ── */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Star size={11} className="text-yellow-400 fill-yellow-400" />
          Apple: {p.apple_rating != null ? `${p.apple_rating.toFixed(1)}/5` : '—'}
          {p.apple_rating_count != null && (
            <span className="text-slate-400">({fmt(p.apple_rating_count)})</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Music2 size={11} className="text-green-500" />
          Spotify: {p.spotify_rating != null ? `${p.spotify_rating.toFixed(1)}/5` : '—'}
          {p.spotify_review_count != null && (
            <span className="text-slate-400">({fmt(p.spotify_review_count)})</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Award size={11} className="text-amber-500" />
          #{displayRank ?? '—'}
        </span>
      </div>

      {/* ── SOCIAL ROW ── */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Youtube size={11} className="text-red-500" />
          {fmt(p.yt_subscribers)}
        </span>
        <span className="flex items-center gap-1">
          <Instagram size={11} className="text-pink-500" />
          {fmt(p.instagram_followers)}
        </span>
        <span className="flex items-center gap-1">
          <Twitter size={11} className="text-sky-500" />
          {fmt(p.twitter_followers)}
        </span>
      </div>

      {/* ── DESCRIPTION ── */}
      <div className="px-4 py-3 border-b border-slate-100">
        {p.ai_summary && (
          <p className="text-xs text-slate-600 line-clamp-3 mb-2 leading-relaxed">
            {p.ai_summary}
          </p>
        )}
        {p.ai_topics && p.ai_topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.ai_topics.slice(0, 5).map((t, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── GUEST SECTION ── */}
      {(p.gemini_guest_types?.length || p.gemini_typical_guest_profile) ? (
        <div className="px-4 py-3 border-b border-slate-100">
          {p.gemini_guest_types && p.gemini_guest_types.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {p.gemini_guest_types.map((g, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-violet-50 text-violet-700 text-xs rounded border border-violet-100">
                  {g}
                </span>
              ))}
            </div>
          )}
          {p.gemini_typical_guest_profile && (
            <p className="text-xs text-slate-500 italic leading-relaxed">
              {p.gemini_typical_guest_profile}
            </p>
          )}
        </div>
      ) : null}

      {/* ── CONTACT SECTION ── */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {p.rss_owner_email ? (
            <a
              href={`mailto:${p.rss_owner_email}`}
              className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
            >
              <Mail size={11} />
              {p.rss_owner_email}
            </a>
          ) : (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Mail size={11} />
              No email
            </span>
          )}
          <div className="flex items-center gap-2.5">
            {socialLinks.map(({ href, icon, title, cls }) => (
              <a
                key={title}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-slate-400 transition-colors ${cls}`}
                title={title}
              >
                {icon}
              </a>
            ))}
            {p.itunesId && (
              <a
                href={p.apple_api_url || `https://podcasts.apple.com/podcast/id${p.itunesId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-slate-400 hover:text-purple-600 transition-colors"
                title="Apple Podcasts"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              </a>
            )}
            {(p.website || p.rss_website) && (
              <a
                href={p.website || p.rss_website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-slate-400 hover:text-blue-600 transition-colors"
                title="Website"
              >
                <Globe size={14} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── SCORES BREAKDOWN (collapsible) ── */}
      <div className="px-4 pb-3">
        <button
          className="w-full flex items-center justify-between py-2.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          onClick={e => { e.stopPropagation(); setScoresOpen(o => !o); }}
        >
          <span className="font-semibold">Score Breakdown</span>
          {scoresOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {scoresOpen && (
          <div className="space-y-2.5 pt-1">
            {SUB_SCORES.map(({ label, key, weight }) => {
              const val = (p as any)[key] as number | undefined;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600">
                      {label} <span className="text-slate-400">({weight}%)</span>
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      {val != null ? val.toFixed(1) : '—'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor(val)}`}
                      style={{ width: val != null ? `${Math.min(100, val)}%` : '0%' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

export const PodcastsReal: React.FC = () => {
  const [podcasts, setPodcasts] = useState<PodcastDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [mainCategory, setMainCategory] = useState('All');
  const [subCategory, setSubCategory] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [minEpisodes, setMinEpisodes] = useState(0);
  const [episodeLength, setEpisodeLength] = useState<'any' | 'under30' | '30to60' | 'over60'>('any');
  const [audienceSize, setAudienceSize] = useState<'any' | 'Micro' | 'Small' | 'Medium' | 'Large' | 'Mega'>('any');
  const [minPercentile, setMinPercentile] = useState<'any' | '99' | '95' | '90' | '75' | '50'>('any');

  // Detail modal
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastDocument | null>(null);

  const handleCardUpdated = (updated: PodcastDocument) => {
    setPodcasts(prev => prev.map(p => p.itunesId === updated.itunesId ? updated : p));
    setSelectedPodcast(updated);
  };

  // Sort + pagination
  const [sortBy, setSortBy] = useState<'score' | 'recent' | 'episodes' | 'engagement' | 'contact'>('score');
  const [page, setPage] = useState(1);

  // Load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (isPodcastCacheLoaded()) {
          setPodcasts(await getAllPodcastsCachedFiltered());
          setLoading(false);
          return;
        }
        const initial = await getScoredPodcastsFiltered(100);
        setPodcasts(initial);
        setLoading(false);
        setLoadingMore(true);
        setPodcasts(await getAllPodcastsCachedFiltered());
      } catch {
        // no-op
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    })();
  }, []);

  // Reset page on filter/sort change
  useEffect(() => { setPage(1); }, [search, mainCategory, subCategory, minScore, minEpisodes, episodeLength, audienceSize, minPercentile, sortBy]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    // Build the set of categories to match for the current main selection
    const matchSet = mainCategory === 'All'
      ? null
      : new Set([mainCategory, ...(CATEGORY_HIERARCHY[mainCategory] || [])].map(c => c.toLowerCase()));

    return podcasts
      .filter(p => {
        if (q) {
          const hit =
            p.title?.toLowerCase().includes(q) ||
            (p.description as string | undefined)?.toLowerCase().includes(q) ||
            p.ai_summary?.toLowerCase().includes(q) ||
            p.ai_topics?.some(t => t.toLowerCase().includes(q));
          if (!hit) return false;
        }

        if (mainCategory !== 'All') {
          const primaryNorm = normalizeCat(p.ai_primary_category).toLowerCase();

          if (subCategory) {
            if (primaryNorm !== subCategory.toLowerCase()) return false;
          } else {
            if (!matchSet!.has(primaryNorm)) return false;
          }
        }
        if ((p.ai_badassery_score ?? 0) < minScore) return false;
        if ((p.episodeCount ?? 0) < minEpisodes) return false;
        const len = p.avg_episode_length_min;
        if (episodeLength === 'under30' && (len == null || len >= 30)) return false;
        if (episodeLength === '30to60' && (len == null || len < 30 || len > 60)) return false;
        if (episodeLength === 'over60' && (len == null || len <= 60)) return false;
        if (audienceSize !== 'any' && p.ai_audience_size !== audienceSize) return false;
        if (minPercentile !== 'any') {
          const pct = typeof p.ai_global_percentile === 'number' ? p.ai_global_percentile : null;
          if (pct == null) return false;
          if (minPercentile === '99' && pct < 99) return false;
          if (minPercentile === '95' && (pct < 95 || pct >= 99)) return false;
          if (minPercentile === '90' && (pct < 90 || pct >= 95)) return false;
          if (minPercentile === '75' && (pct < 75 || pct >= 90)) return false;
          if (minPercentile === '50' && (pct < 50 || pct >= 75)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'score':      return (b.ai_badassery_score ?? 0)      - (a.ai_badassery_score ?? 0);
          case 'recent':     return daysAgoNum((a.lastUpdate ?? a.newestItemPubdate) as number) - daysAgoNum((b.lastUpdate ?? b.newestItemPubdate) as number);
          case 'episodes':   return (b.episodeCount ?? 0)             - (a.episodeCount ?? 0);
          case 'engagement': return (b.score_engagement ?? 0)         - (a.score_engagement ?? 0);
          case 'contact':    return (b.score_contactability ?? 0)     - (a.score_contactability ?? 0);
          default:           return 0;
        }
      });
  }, [podcasts, search, mainCategory, subCategory, minScore, minEpisodes, episodeLength, audienceSize, minPercentile, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => {
    setSearch('');
    setMainCategory('All');
    setSubCategory('');
    setMinScore(0);
    setMinEpisodes(0);
    setEpisodeLength('any');
    setAudienceSize('any');
    setMinPercentile('any');
  };

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4 flex-shrink-0">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Search by name, description, topics…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-sm text-slate-500 whitespace-nowrap flex-shrink-0">
          <span className="font-semibold text-slate-800">{filtered.length}</span> podcasts
          {loadingMore && <span className="text-indigo-400 ml-2 text-xs animate-pulse">loading…</span>}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ArrowUpDown size={13} className="text-slate-400" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Layout ── */}
      <div className="flex flex-1 gap-5 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-60 flex-shrink-0 overflow-y-auto custom-scrollbar">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-5">

            {/* Category — Level 1 */}
            <div>
              <label className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <Filter size={12} className="text-slate-500" /> Category
              </label>
              <div className="flex flex-col gap-1">
                {MAIN_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setMainCategory(cat); setSubCategory(''); }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      mainCategory === cat
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Subcategories — Level 2 */}
              {mainCategory !== 'All' && (CATEGORY_HIERARCHY[mainCategory] || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Subcategory</p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setSubCategory('')}
                      className={`px-2 py-1 rounded-md text-xs transition-colors ${
                        subCategory === ''
                          ? 'bg-indigo-100 text-indigo-700 font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      All
                    </button>
                    {(CATEGORY_HIERARCHY[mainCategory] || []).map(sub => (
                      <button
                        key={sub}
                        onClick={() => setSubCategory(sub === subCategory ? '' : sub)}
                        className={`px-2 py-1 rounded-md text-xs transition-colors ${
                          subCategory === sub
                            ? 'bg-indigo-100 text-indigo-700 font-semibold'
                            : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Badassery Score min */}
            <div>
              <label className="text-sm font-semibold text-slate-800 mb-1.5 block">
                Score ≥ <span className="text-indigo-600 font-bold">{minScore}</span>
              </label>
              <input
                type="range" min={0} max={100} step={1}
                value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                <span>0</span><span>100</span>
              </div>
            </div>

            {/* Episode Count min */}
            <div>
              <label className="text-sm font-semibold text-slate-800 mb-1.5 block">
                ≥ <span className="text-indigo-600 font-bold">{minEpisodes}</span> episodes
              </label>
              <input
                type="range" min={0} max={500} step={5}
                value={minEpisodes}
                onChange={e => setMinEpisodes(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                <span>0</span><span>500</span>
              </div>
            </div>


            {/* Audience Size */}
            <div>
              <label className="text-sm font-semibold text-slate-800 mb-1.5 block">
                Audience Size
              </label>
              <div className="grid grid-cols-3 gap-1">
                {AUDIENCE_SIZE_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setAudienceSize(o.value as typeof audienceSize)}
                    className={`px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                      audienceSize === o.value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Percentile */}
            <div>
              <label className="text-sm font-semibold text-slate-800 mb-1.5 block">
                Percentile
              </label>
              <div className="grid grid-cols-3 gap-1">
                {PERCENTILE_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setMinPercentile(o.value as typeof minPercentile)}
                    className={`px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                      minPercentile === o.value
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-600'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            <button
              onClick={resetFilters}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors"
            >
              Reset filters
            </button>
          </div>
        </aside>

        {/* ── Cards grid ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader size={22} className="animate-spin text-indigo-400 mr-2" />
              <span className="text-slate-400 text-sm">Loading podcasts…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-3xl mb-3">🎙️</div>
              <p className="text-slate-500 text-sm mb-3">No podcasts match your filters</p>
              <button
                onClick={resetFilters}
                className="text-sm text-indigo-600 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
                {paginated.map(p => (
                  <div key={p.itunesId} onClick={() => setSelectedPodcast(p)} className="cursor-pointer">
                    <PodcastCard podcast={p} onEdit={() => setSelectedPodcast(p)} />
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <button
                    onClick={() => setPage(v => Math.max(1, v - 1))}
                    disabled={page === 1}
                    className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-500 px-2">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(v => Math.min(totalPages, v + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>

      {selectedPodcast && (
        <BrooklynDetailModal
          podcast={selectedPodcast}
          onClose={() => setSelectedPodcast(null)}
          onUpdated={handleCardUpdated}
        />
      )}
    </>
  );
};
