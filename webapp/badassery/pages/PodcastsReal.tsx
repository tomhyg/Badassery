import React, { useState, useEffect } from 'react';
import {
  Search, Filter, Star, Mic, Mail, ExternalLink,
  TrendingUp, Users, ChevronDown, Sparkles, Award, Target,
  Youtube, Twitter, Instagram, Linkedin, Globe, Play, Podcast as PodcastIcon,
  ArrowUpDown, UserPlus, Loader
} from 'lucide-react';
import {
  getScoredPodcastsFiltered,
  getFilteredPodcasts,
  getAllPodcastsCachedFiltered,
  isPodcastCacheLoaded,
  BADASSERY_NICHES,
  PodcastDocument,
  getCategoryDistribution
} from '../services/podcastService';

// Pagination constants
const INITIAL_DISPLAY_COUNT = 50;
const LOAD_MORE_COUNT = 50;
import { RangeSlider } from '../components/RangeSlider';
import { Badge } from '../components/Badge';
import { PodcastDetailModal } from '../components/PodcastDetailModal';

export const PodcastsReal: React.FC = () => {
  const [podcasts, setPodcasts] = useState<PodcastDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastDocument | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);

  // Filter States
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [badasseryScoreRange, setBadasseryScoreRange] = useState<[number, number]>([0, 100]);
  const [businessRelevanceRange, setBusinessRelevanceRange] = useState<[number, number]>([0, 10]);
  const [reviewsRange, setReviewsRange] = useState<[number, number]>([0, 10000]);
  const [guestFriendlyOnly, setGuestFriendlyOnly] = useState(false);
  const [selectedPercentile, setSelectedPercentile] = useState<string>('');
  const [audienceSize, setAudienceSize] = useState<'all' | 'small' | 'medium' | 'large'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'rating' | 'reviews' | 'date'>('score');

  // Category distribution for sidebar
  const [categoryDistribution, setCategoryDistribution] = useState<Record<string, number>>({});
  const [topTopics, setTopTopics] = useState<{ topic: string; count: number }[]>([]);

  // Load podcasts on mount
  useEffect(() => {
    loadPodcasts();
  }, []);

  const loadPodcasts = async () => {
    setLoading(true);
    try {
      // Check if cache is already loaded for instant display
      if (isPodcastCacheLoaded()) {
        const data = await getAllPodcastsCachedFiltered();
        setPodcasts(data);
        extractCategoryDistribution(data);
        extractTopTopics(data);
        setLoading(false);
        return;
      }

      // First load: fetch a small initial batch quickly (excludes blacklisted)
      const initialData = await getScoredPodcastsFiltered(100);
      setPodcasts(initialData);
      setLoading(false);

      // Extract distributions from initial data
      extractCategoryDistribution(initialData);
      extractTopTopics(initialData);

      // Then load the full dataset in background (excludes blacklisted)
      setLoadingMore(true);
      const fullData = await getAllPodcastsCachedFiltered();
      setPodcasts(fullData);
      extractCategoryDistribution(fullData);
      extractTopTopics(fullData);
      setLoadingMore(false);
    } catch (error) {
      console.error('Error loading podcasts:', error);
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Handle "Load More" button
  const handleLoadMore = () => {
    setDisplayCount(prev => prev + LOAD_MORE_COUNT);
  };

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(INITIAL_DISPLAY_COUNT);
  }, [searchTerm, selectedCategories, selectedTopics, badasseryScoreRange, businessRelevanceRange, reviewsRange, guestFriendlyOnly, selectedPercentile, audienceSize, sortBy]);

  const loadCategoryDistribution = async () => {
    // Not used anymore - we extract from loaded podcasts
  };

  // Extract category distribution from podcasts
  const extractCategoryDistribution = (podcastsList: PodcastDocument[]) => {
    const dist: Record<string, number> = {};

    podcastsList.forEach(p => {
      if (p.ai_primary_category) {
        dist[p.ai_primary_category] = (dist[p.ai_primary_category] || 0) + 1;
      }
    });

    setCategoryDistribution(dist);
  };

  // Extract all topics from podcasts (not just top 15)
  const extractTopTopics = (podcastsList: PodcastDocument[]) => {
    const topicCounts: Record<string, number> = {};

    podcastsList.forEach(p => {
      if (p.ai_topics && Array.isArray(p.ai_topics)) {
        p.ai_topics.forEach(topic => {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
      }
    });

    // Sort by count and take ALL topics (not just 15)
    const sorted = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);

    setTopTopics(sorted);
  };

  // Apply filters - now done client-side from cached data for speed
  const applyFilters = async () => {
    // Only show loading if cache isn't loaded yet
    if (!isPodcastCacheLoaded()) {
      setLoading(true);
    }
    try {
      // Use cached podcasts (excludes blacklisted) - filtering happens client-side in filteredPodcasts
      const data = await getAllPodcastsCachedFiltered();
      setPodcasts(data);

      // Update distributions
      extractCategoryDistribution(data);
      extractTopTopics(data);
    } catch (error) {
      console.error('Error applying filters:', error);
    } finally {
      setLoading(false);
    }
  };

  // Only reload from cache on initial mount - filtering is done client-side
  // This removes the expensive re-fetch on every filter change
  useEffect(() => {
    // Only re-load if filters change the source data significantly
    // For now, all filtering is done client-side in filteredPodcasts
  }, [selectedCategories, badasseryScoreRange, businessRelevanceRange, guestFriendlyOnly, selectedPercentile]);

  // Handler for category checkbox
  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Handler for topic checkbox
  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic)
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    );
  };

  // Search filter (client-side) - memoized for performance
  const filteredPodcasts = React.useMemo(() => {
    return podcasts
      .filter(p => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || (
          p.title?.toLowerCase().includes(searchLower) ||
          p.ai_primary_category?.toLowerCase().includes(searchLower) ||
          p.ai_topics?.some(t => t.toLowerCase().includes(searchLower))
        );

        // Category filter (multi-select)
        const matchesCategory = selectedCategories.length === 0 ||
          (p.ai_primary_category && selectedCategories.includes(p.ai_primary_category));

        // Topics filter (multi-select) - podcast must have at least one of the selected topics
        const matchesTopics = selectedTopics.length === 0 ||
          (p.ai_topics && p.ai_topics.some(t => selectedTopics.includes(t)));

        // Apply range filters - only if modified from defaults
        const badasseryScore = p.ai_badassery_score || 0;
        const matchesBadassery = (badasseryScoreRange[0] === 0 && badasseryScoreRange[1] === 100) ||
          (badasseryScore >= badasseryScoreRange[0] && badasseryScore <= badasseryScoreRange[1]);

        const businessRelevance = p.ai_business_relevance || 0;
        const matchesRelevance = (businessRelevanceRange[0] === 0 && businessRelevanceRange[1] === 10) ||
          (businessRelevance >= businessRelevanceRange[0] && businessRelevance <= businessRelevanceRange[1]);

        const reviewCount = p.apple_rating_count || 0;
        const matchesReviews = (reviewsRange[0] === 0 && reviewsRange[1] === 10000) ||
          (reviewCount >= reviewsRange[0] && reviewCount <= reviewsRange[1]);

        // Audience size filter
        const ytSubs = p.yt_subscribers || 0;
        let matchesAudience = true;
        if (audienceSize === 'small') matchesAudience = ytSubs > 0 && ytSubs < 10000;
        else if (audienceSize === 'medium') matchesAudience = ytSubs >= 10000 && ytSubs < 100000;
        else if (audienceSize === 'large') matchesAudience = ytSubs >= 100000;

        return matchesSearch && matchesCategory && matchesTopics && matchesBadassery && matchesRelevance && matchesReviews && matchesAudience;
      })
      .sort((a, b) => {
        // Sorting logic
        switch (sortBy) {
          case 'score':
            return (b.ai_badassery_score || 0) - (a.ai_badassery_score || 0);
          case 'rating':
            return (b.apple_rating || 0) - (a.apple_rating || 0);
          case 'reviews':
            return (b.apple_rating_count || 0) - (a.apple_rating_count || 0);
          case 'date':
            return (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0);
          default:
            return 0;
        }
      });
  }, [podcasts, searchTerm, selectedCategories, selectedTopics, badasseryScoreRange, businessRelevanceRange, reviewsRange, audienceSize, sortBy]);

  // Limit displayed podcasts for performance
  const displayedPodcasts = filteredPodcasts.slice(0, displayCount);
  const hasMoreToLoad = filteredPodcasts.length > displayCount;

  // Badge color based on percentile
  const getPercentileBadgeColor = (percentile?: string) => {
    if (!percentile) return 'bg-slate-100 text-slate-600';
    if (percentile === 'Top 1%') return 'bg-purple-100 text-purple-700';
    if (percentile === 'Top 5%') return 'bg-indigo-100 text-indigo-700';
    if (percentile === 'Top 10%') return 'bg-blue-100 text-blue-700';
    if (percentile === 'Top 25%') return 'bg-green-100 text-green-700';
    if (percentile === 'Top 50%') return 'bg-yellow-100 text-yellow-700';
    return 'bg-slate-100 text-slate-600';
  };

  // Score color
  const getScoreColor = (score?: number) => {
    if (!score) return 'text-slate-400';
    if (score >= 8) return 'text-purple-600';
    if (score >= 6) return 'text-indigo-600';
    if (score >= 4) return 'text-blue-600';
    return 'text-slate-600';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Podcasts Database</h1>
          <p className="text-sm text-slate-600 mt-1">
            Showing <span className="font-semibold text-indigo-600">{Math.min(displayCount, filteredPodcasts.length)}</span> of {filteredPodcasts.length} filtered
            {loadingMore && <span className="text-indigo-500 ml-2">(loading full database...)</span>}
          </p>
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 flex items-center gap-2">
            <ArrowUpDown size={16} />
            Sort by:
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="score">Badassery Score</option>
            <option value="rating">Apple Rating</option>
            <option value="reviews">Review Count</option>
            <option value="date">Recently Updated</option>
          </select>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search by title, category, or topics..."
            className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 gap-6 overflow-hidden">

        {/* Sidebar Filters */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto custom-scrollbar pr-2">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-6">

            {/* Category Filter - Checkboxes */}
            <div>
              <label className="text-sm font-semibold text-slate-900 mb-3 block flex items-center gap-2">
                <Filter size={16} />
                Badassery Categories
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {BADASSERY_NICHES.map(niche => (
                  <label
                    key={niche}
                    className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 p-1.5 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(niche)}
                      onChange={() => toggleCategory(niche)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900 flex-1">
                      {niche}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({categoryDistribution[niche] || 0})
                    </span>
                  </label>
                ))}
              </div>
              {selectedCategories.length > 0 && (
                <button
                  onClick={() => setSelectedCategories([])}
                  className="text-xs text-indigo-600 hover:text-indigo-700 mt-2"
                >
                  Clear categories
                </button>
              )}
            </div>

            {/* Topics Filter - Checkboxes */}
            <div>
              <label className="text-sm font-semibold text-slate-900 mb-3 block flex items-center gap-2">
                <Sparkles size={16} />
                Topics
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {topTopics.map(({ topic, count }) => (
                  <label
                    key={topic}
                    className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 p-1.5 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTopics.includes(topic)}
                      onChange={() => toggleTopic(topic)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900 flex-1 truncate">
                      {topic}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({count})
                    </span>
                  </label>
                ))}
              </div>
              {selectedTopics.length > 0 && (
                <button
                  onClick={() => setSelectedTopics([])}
                  className="text-xs text-indigo-600 hover:text-indigo-700 mt-2"
                >
                  Clear topics
                </button>
              )}
            </div>

            {/* Badassery Score Filter */}
            <RangeSlider
              label="Badassery Score"
              min={0}
              max={100}
              value={badasseryScoreRange}
              onChange={setBadasseryScoreRange}
              step={1}
              formatValue={(v) => v.toFixed(0)}
            />

            {/* Business Relevance Filter */}
            <RangeSlider
              label="Business Relevance"
              min={0}
              max={10}
              value={businessRelevanceRange}
              onChange={setBusinessRelevanceRange}
              step={1}
            />

            {/* Apple Reviews Filter */}
            <RangeSlider
              label="Apple Reviews"
              min={0}
              max={10000}
              value={reviewsRange}
              onChange={setReviewsRange}
              step={100}
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString()}
            />

            {/* Percentile Filter */}
            <div>
              <label className="text-sm font-semibold text-slate-900 mb-3 block flex items-center gap-2">
                <Award size={16} className="text-yellow-500" />
                Percentile
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedPercentile}
                onChange={(e) => setSelectedPercentile(e.target.value)}
              >
                <option value="">All Percentiles</option>
                <option value="Top 1%">Top 1%</option>
                <option value="Top 5%">Top 5%</option>
                <option value="Top 10%">Top 10%</option>
                <option value="Top 25%">Top 25%</option>
                <option value="Top 50%">Top 50%</option>
              </select>
            </div>

            {/* Guest Friendly Toggle */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={guestFriendlyOnly}
                  onChange={(e) => setGuestFriendlyOnly(e.target.checked)}
                  className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">
                    Guest-Friendly Only
                  </div>
                  <div className="text-xs text-slate-500">
                    Podcasts that accept guests
                  </div>
                </div>
              </label>
            </div>

            {/* Audience Size Filter - Radio Buttons */}
            <div>
              <label className="text-sm font-semibold text-slate-900 mb-3 block flex items-center gap-2">
                <Users size={16} />
                Audience Size (YouTube)
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 p-1.5 rounded">
                  <input
                    type="radio"
                    name="audienceSize"
                    value="all"
                    checked={audienceSize === 'all'}
                    onChange={(e) => setAudienceSize('all')}
                    className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900">
                    All Sizes
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 p-1.5 rounded">
                  <input
                    type="radio"
                    name="audienceSize"
                    value="small"
                    checked={audienceSize === 'small'}
                    onChange={(e) => setAudienceSize('small')}
                    className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900">
                    Small (&lt;10K)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 p-1.5 rounded">
                  <input
                    type="radio"
                    name="audienceSize"
                    value="medium"
                    checked={audienceSize === 'medium'}
                    onChange={(e) => setAudienceSize('medium')}
                    className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900">
                    Medium (10K-100K)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 p-1.5 rounded">
                  <input
                    type="radio"
                    name="audienceSize"
                    value="large"
                    checked={audienceSize === 'large'}
                    onChange={(e) => setAudienceSize('large')}
                    className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900">
                    Large (100K+)
                  </span>
                </label>
              </div>
            </div>

            {/* Reset Filters */}
            <button
              onClick={() => {
                setSelectedCategories([]);
                setSelectedTopics([]);
                setBadasseryScoreRange([0, 100]);
                setBusinessRelevanceRange([0, 10]);
                setReviewsRange([0, 10000]);
                setGuestFriendlyOnly(false);
                setSelectedPercentile('');
                setAudienceSize('all');
                setSearchTerm('');
              }}
              className="w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </aside>

        {/* Podcast List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-slate-400">Loading podcasts...</div>
            </div>
          ) : filteredPodcasts.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="text-slate-400 mb-2">No podcasts found</div>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategories([]);
                    setSelectedTopics([]);
                    setBadasseryScoreRange([0, 100]);
                    setBusinessRelevanceRange([0, 10]);
                    setReviewsRange([0, 10000]);
                    setGuestFriendlyOnly(false);
                    setSelectedPercentile('');
                    setAudienceSize('all');
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-6">
              {displayedPodcasts.map((podcast) => (
                <div
                  key={podcast.itunesId}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden"
                  onClick={() => setSelectedPodcast(podcast)}
                >
                  <div className="p-5">
                    <div className="flex gap-4">
                      {/* Podcast Artwork */}
                      <div className="flex-shrink-0">
                        <img
                          src={podcast.imageUrl || 'https://via.placeholder.com/80?text=Podcast'}
                          alt={podcast.title}
                          className="w-20 h-20 rounded-lg object-cover shadow-sm"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = 'https://via.placeholder.com/80?text=Podcast';
                          }}
                        />
                      </div>

                      {/* Podcast Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-lg mb-1 truncate">
                              {podcast.title}
                            </h3>
                            <p className="text-sm text-slate-600 line-clamp-2">
                              {podcast.ai_summary || podcast.description?.substring(0, 150) + '...'}
                            </p>
                          </div>

                          {/* Badassery Score Badge */}
                          <div className="flex-shrink-0">
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${getScoreColor(podcast.ai_badassery_score)} bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200`}>
                              <Sparkles size={16} className="text-purple-500" />
                              <span className="font-bold text-lg">
                                {podcast.ai_badassery_score?.toFixed(1) || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Badges Row */}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          {/* Category Badge */}
                          {podcast.ai_primary_category && (
                            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-md">
                              {podcast.ai_primary_category}
                            </span>
                          )}

                          {/* Percentile Badge */}
                          {podcast.ai_global_percentile && (
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1 ${getPercentileBadgeColor(podcast.ai_global_percentile)}`}>
                              <Award size={12} />
                              {podcast.ai_global_percentile}
                            </span>
                          )}

                          {/* Guest Friendly Badge */}
                          {podcast.ai_guest_friendly && (
                            <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-md">
                              Guest-Friendly
                            </span>
                          )}

                          {/* Business Relevance */}
                          {podcast.ai_business_relevance && podcast.ai_business_relevance >= 7 && (
                            <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-md flex items-center gap-1">
                              <Target size={12} />
                              High Value ({podcast.ai_business_relevance}/10)
                            </span>
                          )}
                        </div>

                        {/* Topics */}
                        {podcast.ai_topics && podcast.ai_topics.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {podcast.ai_topics.slice(0, 5).map((topic, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Stats Row */}
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          {podcast.apple_rating && (
                            <div className="flex items-center gap-1">
                              <Star size={14} className="text-yellow-500 fill-yellow-500" />
                              <span className="font-medium">{podcast.apple_rating.toFixed(1)}</span>
                              {podcast.apple_rating_count && (
                                <span>({podcast.apple_rating_count.toLocaleString()})</span>
                              )}
                            </div>
                          )}

                          {podcast.yt_subscribers && podcast.yt_subscribers > 0 && (
                            <div className="flex items-center gap-1">
                              <Users size={14} className="text-red-500" />
                              <span>{(podcast.yt_subscribers / 1000).toFixed(1)}K</span>
                            </div>
                          )}

                          {podcast.episodeCount && (
                            <div className="flex items-center gap-1">
                              <Mic size={14} className="text-indigo-500" />
                              <span>{podcast.episodeCount} episodes</span>
                            </div>
                          )}

                          {podcast.ai_engagement_level && (
                            <div className="flex items-center gap-1">
                              <TrendingUp size={14} className="text-green-500" />
                              <span>Engagement: {podcast.ai_engagement_level.toFixed(1)}/10</span>
                            </div>
                          )}
                        </div>

                        {/* Social Media Icons Row */}
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                          {podcast.yt_channel_id && (
                            <a
                              href={`https://youtube.com/channel/${podcast.yt_channel_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-red-600 transition-colors"
                              title="YouTube Channel"
                            >
                              <Youtube size={18} />
                            </a>
                          )}

                          {podcast.apple_api_url && (
                            <a
                              href={podcast.apple_api_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-purple-600 transition-colors"
                              title="Apple Podcasts"
                            >
                              <PodcastIcon size={18} />
                            </a>
                          )}

                          {(podcast.website || podcast.rss_website) && (
                            <a
                              href={podcast.website || podcast.rss_website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-blue-600 transition-colors"
                              title="Website"
                            >
                              <Globe size={18} />
                            </a>
                          )}

                          {podcast.rss_url && (
                            <a
                              href={podcast.rss_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-orange-600 transition-colors"
                              title="RSS Feed"
                            >
                              <Play size={18} />
                            </a>
                          )}

                          {podcast.twitter && (
                            <a
                              href={`https://twitter.com/${podcast.twitter.replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-sky-500 transition-colors"
                              title="Twitter/X"
                            >
                              <Twitter size={18} />
                            </a>
                          )}

                          {podcast.instagram && (
                            <a
                              href={`https://instagram.com/${podcast.instagram.replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-pink-600 transition-colors"
                              title="Instagram"
                            >
                              <Instagram size={18} />
                            </a>
                          )}

                          {podcast.linkedin && (
                            <a
                              href={podcast.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-blue-700 transition-colors"
                              title="LinkedIn"
                            >
                              <Linkedin size={18} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Load More Button */}
              {hasMoreToLoad && (
                <div className="flex justify-center pt-6 pb-4">
                  <button
                    onClick={() => {
                      setLoadingMore(true);
                      setTimeout(() => {
                        setDisplayCount(prev => prev + LOAD_MORE_COUNT);
                        setLoadingMore(false);
                      }, 100);
                    }}
                    disabled={loadingMore}
                    className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
                  >
                    {loadingMore ? (
                      <>
                        <Loader size={18} className="animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ChevronDown size={18} />
                        Load More ({filteredPodcasts.length - displayCount} remaining)
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Podcast Detail Modal */}
      {selectedPodcast && (
        <PodcastDetailModal
          podcast={selectedPodcast}
          onClose={() => setSelectedPodcast(null)}
        />
      )}
    </div>
  );
};
