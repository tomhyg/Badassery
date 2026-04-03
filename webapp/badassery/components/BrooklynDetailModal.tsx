import React, { useRef, useState, useEffect } from 'react';

// ─── Simple password gate ────────────────────────────────────────────────────
// Replace with proper auth later. Stored in sessionStorage so re-entry is
// only needed once per browser session.
const EDIT_PASSWORD = 'badassery2025';
const SESSION_KEY   = 'bk_edit_auth';
import {
  X, Mail, Globe, Youtube, Instagram, Twitter, Linkedin,
  Star, Mic, Clock, Calendar, Users, Award, Music2,
  Facebook, Video, ChevronDown, ChevronUp, Edit3,
  Play, Loader2, AlertCircle, Headphones,
} from 'lucide-react';
import { PodcastDocument } from '../services/podcastService';
import { BrooklynEditModal } from './BrooklynEditModal';
import { fetchEpisodes, PIEpisode, formatPIDuration, formatPIDate } from '../services/podcastIndexService';

interface Props {
  podcast: PodcastDocument;
  onClose: () => void;
  onUpdated?: (updated: PodcastDocument) => void;
}

const SUB_SCORES = [
  { label: 'Guest Compatibility', key: 'score_guest_compatibility',  weight: 20, desc: 'Guest ratio, episode length, and guest authority level' },
  { label: 'Audience Power',      key: 'score_audience_power',       weight: 25, desc: 'Review counts, YouTube views, social followers, chart rank' },
  { label: 'Podcast Authority',   key: 'score_podcast_authority',    weight: 15, desc: 'Podcast age, content quality, business relevance' },
  { label: 'Activity',            key: 'score_activity_consistency', weight: 20, desc: 'Recency of last episode, publish consistency' },
  { label: 'Engagement',          key: 'score_engagement',           weight: 10, desc: 'Reviews per episode, average star rating' },
  { label: 'Contactability',      key: 'score_contactability',       weight: 10, desc: 'Email quality + social link richness' },
] as const;

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

function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  const ms = ts > 1e10 ? ts : ts * 1000;
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function scoreColor(s: number | null | undefined): string {
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

export const BrooklynDetailModal: React.FC<Props> = ({ podcast: initialPodcast, onClose, onUpdated }) => {
  const [podcast, setPodcast] = useState(initialPodcast);
  const [showEdit, setShowEdit] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [showPwPrompt, setShowPwPrompt] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const pwInputRef = useRef<HTMLInputElement>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'episodes'>('overview');

  // Episodes
  const [liveEpisodes, setLiveEpisodes] = useState<PIEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (activeTab !== 'episodes') return;
    if (liveEpisodes.length > 0 || episodesLoading) return;
    setEpisodesLoading(true);
    setEpisodesError(null);
    fetchEpisodes({ itunesId: podcast.itunesId, id: podcast.id }, 10)
      .then(eps => setLiveEpisodes(eps))
      .catch(err => setEpisodesError(err.message ?? 'Failed to load episodes'))
      .finally(() => setEpisodesLoading(false));
  }, [activeTab]);

  const isAuthenticated = () => sessionStorage.getItem(SESSION_KEY) === '1';

  const handleEditClick = () => {
    if (isAuthenticated()) {
      setShowEdit(true);
    } else {
      setPwInput('');
      setPwError(false);
      setShowPwPrompt(true);
      setTimeout(() => pwInputRef.current?.focus(), 50);
    }
  };

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwInput === EDIT_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setShowPwPrompt(false);
      setShowEdit(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  const handleUpdated = (updated: PodcastDocument) => {
    setPodcast(updated);
    onUpdated?.(updated);
  };

  const pctLabel = formatPercentile(podcast.ai_global_percentile);
  const lastEpTs = podcast.lastUpdate ?? podcast.newestItemPubdate;
  const chartRank = Math.min(podcast.apple_chart_rank ?? Infinity, podcast.spotify_chart_rank ?? Infinity);
  const displayRank = chartRank < Infinity ? chartRank : null;

  const appleUrl = podcast.apple_api_url || (podcast.itunesId ? `https://podcasts.apple.com/podcast/id${podcast.itunesId}` : null);

  const socialLinks = [
    { href: appleUrl,                  icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>, title: 'Apple Podcasts', cls: 'hover:text-purple-600' },
    { href: podcast.website_youtube,   icon: <Youtube size={16} />,    title: 'YouTube',    cls: 'hover:text-red-600' },
    { href: podcast.website_instagram, icon: <Instagram size={16} />,  title: 'Instagram',  cls: 'hover:text-pink-600' },
    { href: podcast.website_twitter,   icon: <Twitter size={16} />,    title: 'Twitter/X',  cls: 'hover:text-sky-500' },
    { href: podcast.website_spotify,   icon: <Music2 size={16} />,     title: 'Spotify',    cls: 'hover:text-green-600' },
    { href: podcast.website_linkedin,  icon: <Linkedin size={16} />,   title: 'LinkedIn',   cls: 'hover:text-blue-700' },
    { href: podcast.website_facebook,  icon: <Facebook size={16} />,   title: 'Facebook',   cls: 'hover:text-blue-600' },
    { href: podcast.website_tiktok,    icon: <Video size={16} />,      title: 'TikTok',     cls: 'hover:text-slate-900' },
  ].filter(s => !!s.href);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3 z-10 rounded-t-2xl">
            <img
              src={!imgErr && podcast.imageUrl ? podcast.imageUrl : `https://placehold.co/48x48/e2e8f0/94a3b8?text=${encodeURIComponent((podcast.title || 'P')[0])}`}
              alt={podcast.title}
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-100"
              onError={() => setImgErr(true)}
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-slate-900 text-lg leading-tight truncate">{podcast.title}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {podcast.ai_primary_category && (
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-md">
                    {podcast.ai_primary_category}
                  </span>
                )}
                {pctLabel && (
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-md">{pctLabel}</span>
                )}
                {podcast.ai_podcast_style && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-md">{podcast.ai_podcast_style}</span>
                )}
              </div>
            </div>
            <div className={`flex-shrink-0 border rounded-xl px-3 py-2 text-center mr-2 ${scoreColor(podcast.ai_badassery_score)}`}>
              <div className="text-2xl font-bold leading-none">{podcast.ai_badassery_score?.toFixed(0) ?? '—'}</div>
              <div className="text-[10px] font-medium opacity-60 mt-0.5">Badassery</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleEditClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
              >
                <Edit3 size={13} /> Edit
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div className="border-b border-slate-200 px-6 flex gap-1">
            {(['overview', 'episodes'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab === 'overview' ? '📊 Overview' : '🎧 Episodes'}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          <div className={activeTab === 'overview' ? 'px-6 py-5 space-y-6' : 'hidden'}>

            {/* ── Summary ── */}
            {podcast.ai_summary && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Summary</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{podcast.ai_summary}</p>
              </section>
            )}

            {/* ── Links ── */}
            {socialLinks.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Links</h3>
                <div className="flex items-center gap-3 flex-wrap">
                  {socialLinks.map(({ href, icon, title, cls }) => (
                    <a
                      key={title}
                      href={href}
                      target="_blank" rel="noopener noreferrer"
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors ${cls}`}
                      title={title}
                    >
                      {icon} {title}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* ── All Topics & Categories ── */}
            {((podcast.ai_topics && podcast.ai_topics.length > 0) || (podcast.ai_secondary_categories && podcast.ai_secondary_categories.length > 0)) && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Topics & Categories</h3>
                {podcast.ai_secondary_categories && podcast.ai_secondary_categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {podcast.ai_secondary_categories.map((c, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-md font-medium">{c}</span>
                    ))}
                  </div>
                )}
                {podcast.ai_topics && (
                  <div className="flex flex-wrap gap-1.5">
                    {podcast.ai_topics.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">{t}</span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Target Audience ── */}
            {podcast.ai_target_audience && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target Audience</h3>
                <p className="text-sm text-slate-700">{podcast.ai_target_audience}</p>
              </section>
            )}

            {/* ── Key Stats ── */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Key Stats</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Episodes', value: podcast.episodeCount?.toString() ?? '—', icon: <Mic size={14} className="text-indigo-400" /> },
                  { label: 'Avg Length', value: podcast.avg_episode_length_min ? `${podcast.avg_episode_length_min} min` : '—', icon: <Clock size={14} className="text-teal-400" /> },
                  { label: 'Last Episode', value: daysAgo(lastEpTs as number), icon: <Calendar size={14} className="text-slate-400" /> },
                  { label: 'First Episode', value: formatDate(podcast.oldestItemPubdate), icon: <Calendar size={14} className="text-slate-300" /> },
                  { label: 'Consistency', value: podcast.publish_consistency != null ? `${podcast.publish_consistency}/100` : '—', icon: <Award size={14} className="text-amber-400" /> },
                  { label: 'Audience Size', value: podcast.ai_audience_size ?? '—', icon: <Users size={14} className="text-purple-400" /> },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                    {icon}
                    <div>
                      <div className="text-xs text-slate-400">{label}</div>
                      <div className="text-sm font-semibold text-slate-800">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Ratings ── */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Ratings & Charts</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star size={13} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-xs text-slate-500">Apple</span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">{podcast.apple_rating?.toFixed(1) ?? '—'}/5</div>
                  <div className="text-xs text-slate-400">{podcast.apple_rating_count != null ? `${fmt(podcast.apple_rating_count)} reviews` : 'no reviews'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Music2 size={13} className="text-green-500" />
                    <span className="text-xs text-slate-500">Spotify</span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">{podcast.spotify_rating?.toFixed(1) ?? '—'}/5</div>
                  <div className="text-xs text-slate-400">{podcast.spotify_review_count != null ? `${fmt(podcast.spotify_review_count)} reviews` : 'no reviews'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Award size={13} className="text-amber-500" />
                    <span className="text-xs text-slate-500">Chart Rank</span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">#{displayRank ?? '—'}</div>
                  <div className="text-xs text-slate-400">{podcast.apple_chart_genre ?? podcast.spotify_chart_genre ?? ''}</div>
                </div>
              </div>
            </section>

            {/* ── Social Audience ── */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Social Audience</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                  <Youtube size={16} className="text-red-500 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400">YouTube</div>
                    <div className="text-sm font-bold text-slate-800">{fmt(podcast.yt_subscribers)} subs</div>
                    {podcast.yt_avg_views_per_video != null && <div className="text-xs text-slate-400">{fmt(podcast.yt_avg_views_per_video)} avg views</div>}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                  <Instagram size={16} className="text-pink-500 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400">Instagram</div>
                    <div className="text-sm font-bold text-slate-800">{fmt(podcast.instagram_followers)}</div>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                  <Twitter size={16} className="text-sky-500 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400">Twitter/X</div>
                    <div className="text-sm font-bold text-slate-800">{fmt(podcast.twitter_followers)}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── AI Quality Scores ── */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">AI Quality Assessment</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-0.5">Business Relevance</div>
                  <div className="text-lg font-bold text-slate-800">{podcast.ai_business_relevance ?? '—'}<span className="text-sm font-normal text-slate-400">/10</span></div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-0.5">Content Quality</div>
                  <div className="text-lg font-bold text-slate-800">{podcast.ai_content_quality ?? '—'}<span className="text-sm font-normal text-slate-400">/10</span></div>
                </div>
              </div>
            </section>

            {/* ── Score Breakdown ── */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Score Breakdown</h3>
              <div className="space-y-3">
                {SUB_SCORES.map(({ label, key, weight, desc }) => {
                  const val = (podcast as any)[key] as number | undefined;
                  return (
                    <div key={key} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-start justify-between mb-1.5 gap-2">
                        <div>
                          <span className="text-sm font-semibold text-slate-700">{label}</span>
                          <span className="text-xs text-slate-400 ml-2">({weight}%)</span>
                          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                        </div>
                        <span className="text-lg font-bold text-slate-800 flex-shrink-0">
                          {val != null ? val.toFixed(1) : '—'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${val != null && val >= 70 ? 'bg-green-500' : val != null && val >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                          style={{ width: val != null ? `${Math.min(100, val)}%` : '0%' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {podcast.score_missing_signals && podcast.score_missing_signals.length > 0 && (
                <p className="text-xs text-slate-400 mt-2">Missing signals: {podcast.score_missing_signals.join(', ')}</p>
              )}
            </section>

            {/* ── Guests ── */}
            {(podcast.gemini_guest_types?.length || podcast.gemini_typical_guest_profile || podcast.gemini_recent_guests?.length) && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Guest Intelligence</h3>
                {podcast.gemini_guest_types && podcast.gemini_guest_types.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {podcast.gemini_guest_types.map((g, i) => (
                      <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 text-xs rounded border border-violet-100">{g}</span>
                    ))}
                  </div>
                )}
                {podcast.gemini_typical_guest_profile && (
                  <p className="text-sm text-slate-600 italic mb-3">{podcast.gemini_typical_guest_profile}</p>
                )}
                {podcast.gemini_recent_guests && podcast.gemini_recent_guests.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-slate-500 mb-2">Recent Guests</div>
                    <div className="space-y-1.5">
                      {podcast.gemini_recent_guests.filter((g: any) => g.guest_name).map((g: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                          <span className="font-medium text-slate-800">{g.guest_name}</span>
                          <span className="text-slate-400">—</span>
                          <span className="text-slate-600 capitalize">{g.guest_role}</span>
                          <span className="text-slate-400">—</span>
                          <span className="text-slate-500 capitalize">{g.guest_industry}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* ── Contact ── */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Contact</h3>
              <div className="space-y-3">
                {(podcast.rss_owner_email || podcast.website_email) ? (
                  <a
                    href={`mailto:${podcast.rss_owner_email || podcast.website_email}`}
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:underline"
                  >
                    <Mail size={14} />
                    {podcast.rss_owner_email || podcast.website_email}
                  </a>
                ) : (
                  <span className="flex items-center gap-2 text-sm text-slate-400">
                    <Mail size={14} /> No email available
                  </span>
                )}
                {(podcast.website || podcast.rss_website) && (
                  <a
                    href={podcast.website || podcast.rss_website}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
                  >
                    <Globe size={14} />
                    {podcast.website || podcast.rss_website}
                  </a>
                )}
              </div>
            </section>

          </div>

          {/* ── Episodes tab ── */}
          {activeTab === 'episodes' && (
            <div className="px-6 py-5 space-y-4">
              {episodesLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
                  <Loader2 size={32} className="animate-spin text-purple-500" />
                  <p className="text-sm">Loading episodes…</p>
                </div>
              )}
              {episodesError && !episodesLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500">
                  <AlertCircle size={32} className="text-red-400" />
                  <p className="text-sm text-red-600">{episodesError}</p>
                </div>
              )}
              {!episodesLoading && !episodesError && liveEpisodes.length === 0 && (
                <div className="text-center text-slate-400 py-12">
                  <Headphones size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No episodes found — podcast may not be indexed by PodcastIndex.</p>
                </div>
              )}
              {!episodesLoading && liveEpisodes.map((ep, idx) => {
                const isExpanded = expandedEpisodes.has(ep.id);
                const desc = ep.description?.replace(/<[^>]*>/g, '') ?? '';
                return (
                  <div key={ep.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm leading-snug mb-1">
                          {ep.title || `Episode ${idx + 1}`}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                          {ep.datePublished > 0 && <span>{formatPIDate(ep.datePublished)}</span>}
                          {ep.duration > 0 && <span>{formatPIDuration(ep.duration)}</span>}
                        </div>
                        {desc && (
                          <div className="mb-2">
                            <p className={`text-xs text-slate-600 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                              {desc}
                            </p>
                            {desc.length > 120 && (
                              <button
                                onClick={() => setExpandedEpisodes(prev => {
                                  const next = new Set(prev);
                                  isExpanded ? next.delete(ep.id) : next.add(ep.id);
                                  return next;
                                })}
                                className="text-xs text-purple-600 hover:text-purple-800 font-medium mt-0.5"
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </div>
                        )}
                        {ep.enclosureUrl && (
                          <a
                            href={ep.enclosureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors font-medium"
                          >
                            <Play size={11} /> Listen
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {showEdit && (
        <BrooklynEditModal
          podcast={podcast}
          onClose={() => setShowEdit(false)}
          onSaved={handleUpdated}
        />
      )}

      {showPwPrompt && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPwPrompt(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-slate-900 mb-1">Team access required</h3>
            <p className="text-xs text-slate-500 mb-4">Enter the edit password to continue.</p>
            <form onSubmit={handlePwSubmit} className="space-y-3">
              <input
                ref={pwInputRef}
                type="password"
                value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                placeholder="Password"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${pwError ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
              />
              {pwError && <p className="text-xs text-red-500">Incorrect password.</p>}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowPwPrompt(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
