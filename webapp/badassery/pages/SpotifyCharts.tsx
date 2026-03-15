import React, { useEffect, useState, useMemo } from 'react';
import { Music2, TrendingUp, Database, RefreshCw } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChartEntry {
  bestRank: number;
  bestGenre: string;
  title: string;
  genres: Record<string, number>;
  inDb: boolean;
  spotifyId?: string | null;
  itunesId?: string | null;
}

interface ChartsData {
  scrapedAt: string;
  charts: Record<string, ChartEntry>;
}

// ── Genre list (matches scraper SPOTIFY_CHART_CATEGORIES order) ──────────────

const GENRES = [
  'Top Podcasts', 'Trending Podcasts', 'Top Episodes',
  'Arts', 'Business', 'Comedy', 'Education', 'Fiction',
  'Health & Fitness', 'History', 'Leisure', 'Music', 'News',
  'Religion & Spirituality', 'Science', 'Society & Culture',
  'Sports', 'Technology', 'True Crime', 'TV & Film',
];

const GENRE_COLORS: Record<string, string> = {
  'Top Podcasts'            : 'bg-green-100 text-green-700',
  'Trending Podcasts'       : 'bg-emerald-100 text-emerald-700',
  'Top Episodes'            : 'bg-teal-100 text-teal-700',
  'Arts'                    : 'bg-pink-100 text-pink-700',
  'Business'                : 'bg-blue-100 text-blue-700',
  'Comedy'                  : 'bg-yellow-100 text-yellow-700',
  'Education'               : 'bg-indigo-100 text-indigo-700',
  'Fiction'                 : 'bg-fuchsia-100 text-fuchsia-700',
  'Health & Fitness'        : 'bg-lime-100 text-lime-700',
  'History'                 : 'bg-orange-100 text-orange-700',
  'Leisure'                 : 'bg-cyan-100 text-cyan-700',
  'Music'                   : 'bg-violet-100 text-violet-700',
  'News'                    : 'bg-red-100 text-red-700',
  'Religion & Spirituality' : 'bg-amber-100 text-amber-700',
  'Science'                 : 'bg-sky-100 text-sky-700',
  'Society & Culture'       : 'bg-purple-100 text-purple-700',
  'Sports'                  : 'bg-green-100 text-green-700',
  'Technology'              : 'bg-slate-100 text-slate-700',
  'True Crime'              : 'bg-gray-100 text-gray-700',
  'TV & Film'               : 'bg-rose-100 text-rose-700',
};

// ── Spotify SVG icon ──────────────────────────────────────────────────────────

const SpotifyIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-label="Spotify"
  >
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.307a.75.75 0 01-1.032.25c-2.825-1.726-6.383-2.117-10.573-1.16a.75.75 0 01-.334-1.463c4.585-1.047 8.52-.596 11.69 1.341a.75.75 0 01.249 1.032zm1.472-3.268a.937.937 0 01-1.29.309c-3.232-1.987-8.161-2.563-11.982-1.403a.937.937 0 01-.543-1.791c4.37-1.326 9.8-.684 13.507 1.596a.937.937 0 01.308 1.289zm.126-3.405C15.27 8.42 9.217 8.222 5.755 9.28a1.125 1.125 0 01-.652-2.15C9.52 5.894 16.237 6.12 20.147 8.484a1.125 1.125 0 01-1.033 2.15z" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

export const SpotifyCharts: React.FC = () => {
  const [data, setData]           = useState<ChartsData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string>('All');

  useEffect(() => {
    fetch('/spotify_charts.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: ChartsData) => { setData(json); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Convert the charts object to a flat array
  const allEntries = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.charts).map(([spotifyId, entry]) => ({
      spotifyId,
      ...entry,
    }));
  }, [data]);

  // Filter + sort for the selected genre
  const displayedEntries = useMemo(() => {
    if (selectedGenre === 'All') {
      return [...allEntries].sort((a, b) => a.bestRank - b.bestRank);
    }
    return allEntries
      .filter(e => e.genres[selectedGenre] !== undefined)
      .sort((a, b) => a.genres[selectedGenre] - b.genres[selectedGenre]);
  }, [allEntries, selectedGenre]);

  const inDbCount = useMemo(() => allEntries.filter(e => e.inDb).length, [allEntries]);

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-green-500 mr-3" />
        <span className="text-slate-500">Loading Spotify Charts...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Music2 size={40} className="text-slate-300 mb-4" />
        <h2 className="text-lg font-semibold text-slate-600 mb-2">No chart data available</h2>
        <p className="text-sm text-slate-400 max-w-sm">
          Run <code className="bg-slate-100 px-1 rounded">node scripts/fetch_spotify_charts.js --confirm</code> then
          re-export <code className="bg-slate-100 px-1 rounded">node scripts/export_podcasts_lite.js</code> to generate the charts file.
        </p>
        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      </div>
    );
  }

  const scrapedDate = new Date(data.scrapedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <SpotifyIcon size={24} className="text-green-500" />
            Spotify Podcast Charts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            US Top 50 · 20 genres · scraped {scrapedDate}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-center">
            <div className="text-lg font-bold text-slate-900">{allEntries.length.toLocaleString()}</div>
            <div className="text-slate-500">In charts</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-center">
            <div className="text-lg font-bold text-green-600">{inDbCount.toLocaleString()}</div>
            <div className="text-slate-500">In our DB</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-center">
            <div className="text-lg font-bold text-slate-400">{(allEntries.length - inDbCount).toLocaleString()}</div>
            <div className="text-slate-500">Missing</div>
          </div>
        </div>
      </div>

      {/* Genre filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedGenre('All')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedGenre === 'All'
              ? 'bg-green-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All ({allEntries.length})
        </button>
        {GENRES.map(genre => {
          const count = allEntries.filter(e => e.genres[genre] !== undefined).length;
          if (count === 0) return null;
          return (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedGenre === genre
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {genre} ({count})
            </button>
          );
        })}
      </div>

      {/* Count for current view */}
      <p className="text-sm text-slate-500">
        Showing <strong>{displayedEntries.length}</strong> podcasts
        {selectedGenre !== 'All' && ` in ${selectedGenre}`}
        {' '}· sorted by rank
      </p>

      {/* Chart list */}
      <div className="space-y-2">
        {displayedEntries.map(entry => {
          const rank = selectedGenre === 'All'
            ? entry.bestRank
            : entry.genres[selectedGenre];

          return (
            <div
              key={entry.spotifyId}
              className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-4 hover:border-slate-300 transition-colors"
            >
              {/* Rank */}
              <div className={`w-10 text-right font-bold tabular-nums flex-shrink-0 ${
                rank === 1 ? 'text-yellow-500 text-lg' :
                rank <= 3  ? 'text-orange-400' :
                rank <= 10 ? 'text-slate-700' :
                'text-slate-400'
              }`}>
                #{rank}
              </div>

              {/* Title + genre */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">
                  {entry.title || <span className="text-slate-400 italic">Unknown title</span>}
                </div>
                {selectedGenre === 'All' && (
                  <span className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium ${
                    GENRE_COLORS[entry.bestGenre] || 'bg-slate-100 text-slate-600'
                  }`}>
                    {entry.bestGenre}
                  </span>
                )}
              </div>

              {/* In DB badge */}
              <div className="flex-shrink-0">
                {entry.inDb ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                    <Database size={10} />
                    In DB
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-50 text-slate-400 border border-slate-200">
                    <Database size={10} />
                    Not in DB
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
