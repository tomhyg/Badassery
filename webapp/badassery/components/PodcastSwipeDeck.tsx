import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, X, Loader2, Headphones, Users, Mic, Globe } from 'lucide-react';
import { PodcastDocument, getAllPodcastsCached } from '../services/podcastService';
import {
  recordSwipe,
  getClientSwipes,
  computeCategoryWeights,
  SwipeRecord,
} from '../services/swipeService';
import { addToWishlist } from '../services/wishlistService';
import { Client } from '../types';

interface PodcastSwipeDeckProps {
  clientId: string;
  client: Client;
}

const SWIPE_THRESHOLD = 80;
const DECK_SIZE = 3; // visible cards in stack

function formatAudience(size?: string): string {
  const map: Record<string, string> = {
    micro: 'Micro (<1K)',
    small: 'Small (1K–10K)',
    medium: 'Medium (10K–100K)',
    large: 'Large (100K–500K)',
    mega: 'Mega (500K+)',
  };
  return size ? (map[size] || size) : 'Unknown';
}

export const PodcastSwipeDeck: React.FC<PodcastSwipeDeckProps> = ({ clientId, client }) => {
  const [queue, setQueue] = useState<PodcastDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [swipeHistory, setSwipeHistory] = useState<SwipeRecord[]>([]);
  const [totalSwiped, setTotalSwiped] = useState(0);
  const [rightSwipes, setRightSwipes] = useState(0);
  const [lastAction, setLastAction] = useState<'like' | 'pass' | null>(null);

  // Drag state for the top card
  const [isDragging, setIsDragging] = useState(false);
  const [deltaX, setDeltaX] = useState(0);
  const dragStartX = useRef<number>(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // ── Load podcasts and filter/sort ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [allPodcasts, existingSwipes] = await Promise.all([
          getAllPodcastsCached(),
          getClientSwipes(clientId),
        ]);

        if (cancelled) return;

        const swipedIds = new Set(existingSwipes.map(s => s.itunesId));
        const categoryWeights = computeCategoryWeights(existingSwipes);

        // Client's preferred categories from their profile
        const clientTopics: string[] = (client as any).content?.speakingTopicsArray || [];

        // Filter: must have a badassery score, not yet swiped
        let candidates = allPodcasts.filter(p =>
          p.itunesId &&
          !swipedIds.has(p.itunesId) &&
          typeof p.ai_badassery_score === 'number' &&
          p.ai_badassery_score >= 30
        );

        // Score each candidate for sorting
        const scored = candidates.map(p => {
          const cat = p.ai_primary_category || '';
          let sort = p.ai_badassery_score || 0;

          // Boost by category weight (learned from swipes)
          if (categoryWeights[cat] !== undefined) {
            sort += categoryWeights[cat] * 10;
          }

          // Boost if category matches client topics
          const catLower = cat.toLowerCase();
          const topicMatch = clientTopics.some(t =>
            catLower.includes(t.toLowerCase()) || t.toLowerCase().includes(catLower)
          );
          if (topicMatch) sort += 20;

          return { podcast: p, sort };
        });

        scored.sort((a, b) => b.sort - a.sort);

        setSwipeHistory(existingSwipes);
        setTotalSwiped(existingSwipes.length);
        setRightSwipes(existingSwipes.filter(s => s.direction === 'right').length);
        setQueue(scored.map(s => s.podcast));
      } catch (err) {
        console.error('SwipeDeck load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [clientId, client]);

  // ── Swipe action ─────────────────────────────────────────────────────────
  const handleSwipe = useCallback(async (direction: 'right' | 'left') => {
    const top = queue[0];
    if (!top) return;

    setLastAction(direction === 'right' ? 'like' : 'pass');
    setTimeout(() => setLastAction(null), 800);

    // Optimistic update
    setQueue(prev => prev.slice(1));
    setTotalSwiped(n => n + 1);
    if (direction === 'right') setRightSwipes(n => n + 1);

    // Persist
    try {
      await recordSwipe(
        clientId,
        top.itunesId,
        direction,
        top.ai_primary_category || '',
        top.ai_badassery_score || 0
      );
      if (direction === 'right') {
        try {
          await addToWishlist(clientId, top.itunesId, clientId, 'medium');
        } catch {
          // Already in wishlist — ignore
        }
      }
    } catch (err) {
      console.error('Swipe persist error:', err);
    }
  }, [queue, clientId]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const startDrag = (clientXVal: number) => {
    setIsDragging(true);
    dragStartX.current = clientXVal;
  };

  const moveDrag = (clientXVal: number) => {
    if (!isDragging) return;
    setDeltaX(clientXVal - dragStartX.current);
  };

  const endDrag = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (deltaX > SWIPE_THRESHOLD) {
      handleSwipe('right');
    } else if (deltaX < -SWIPE_THRESHOLD) {
      handleSwipe('left');
    }
    setDeltaX(0);
  };

  // Mouse
  const onMouseDown = (e: React.MouseEvent) => startDrag(e.clientX);
  const onMouseMove = (e: React.MouseEvent) => moveDrag(e.clientX);
  const onMouseUp = () => endDrag();
  const onMouseLeave = () => { if (isDragging) endDrag(); };

  // Touch
  const onTouchStart = (e: React.TouchEvent) => startDrag(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => moveDrag(e.touches[0].clientX);
  const onTouchEnd = () => endDrag();

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="text-indigo-400 animate-spin mb-3" size={28} />
        <p className="text-sm text-slate-500">Loading podcast recommendations…</p>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="font-bold text-slate-900 text-lg mb-2">All caught up!</h3>
        <p className="text-slate-500 text-sm max-w-xs">
          You've reviewed all available podcasts. Check back soon for new recommendations.
        </p>
        <div className="mt-4 flex gap-6 text-sm">
          <span className="text-green-600 font-semibold">❤️ {rightSwipes} liked</span>
          <span className="text-slate-400">{totalSwiped - rightSwipes} passed</span>
        </div>
      </div>
    );
  }

  const topCard = queue[0];
  const rotation = deltaX * 0.04;
  const overlayOpacity = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1);

  return (
    <div className="flex flex-col items-center gap-6 py-4">

      {/* Stats bar */}
      <div className="flex items-center gap-6 text-sm text-slate-500">
        <span>❤️ <span className="font-semibold text-green-600">{rightSwipes}</span> liked</span>
        <span>✕ <span className="font-semibold text-slate-400">{totalSwiped - rightSwipes}</span> passed</span>
      </div>

      {/* Card stack */}
      <div className="relative w-full max-w-sm" style={{ height: 520 }}>

        {/* Background cards (stack effect) */}
        {queue.slice(1, DECK_SIZE).map((p, i) => (
          <div
            key={p.itunesId}
            className="absolute inset-0 bg-white border border-slate-200 rounded-2xl shadow-md"
            style={{
              transform: `scale(${1 - (i + 1) * 0.04}) translateY(${(i + 1) * 8}px)`,
              zIndex: DECK_SIZE - i - 1,
            }}
          />
        ))}

        {/* Top card — draggable */}
        <div
          ref={cardRef}
          className="absolute inset-0 bg-white border border-slate-200 rounded-2xl shadow-lg cursor-grab active:cursor-grabbing select-none overflow-hidden"
          style={{
            transform: `translateX(${deltaX}px) rotate(${rotation}deg)`,
            zIndex: DECK_SIZE,
            transition: isDragging ? 'none' : 'transform 0.3s ease',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* LIKE overlay */}
          <div
            className="absolute inset-0 bg-green-500 rounded-2xl flex items-center justify-center pointer-events-none z-10"
            style={{ opacity: deltaX > 0 ? overlayOpacity * 0.6 : 0 }}
          >
            <div className="border-4 border-white rounded-xl px-6 py-2 rotate-[-15deg]">
              <span className="text-white font-black text-3xl tracking-widest">LIKE</span>
            </div>
          </div>

          {/* PASS overlay */}
          <div
            className="absolute inset-0 bg-red-400 rounded-2xl flex items-center justify-center pointer-events-none z-10"
            style={{ opacity: deltaX < 0 ? overlayOpacity * 0.6 : 0 }}
          >
            <div className="border-4 border-white rounded-xl px-6 py-2 rotate-[15deg]">
              <span className="text-white font-black text-3xl tracking-widest">PASS</span>
            </div>
          </div>

          {/* Card content */}
          <div className="flex flex-col h-full">
            {/* Podcast image */}
            <div className="relative h-48 bg-gradient-to-br from-indigo-100 to-purple-100 flex-shrink-0 rounded-t-2xl overflow-hidden">
              {topCard.imageUrl || topCard.apple_api_artwork_url ? (
                <img
                  src={topCard.apple_api_artwork_url || topCard.imageUrl}
                  alt={topCard.title}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Headphones size={48} className="text-indigo-300" />
                </div>
              )}
              {/* Category badge */}
              {topCard.ai_primary_category && (
                <span className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  {topCard.ai_primary_category}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto min-h-0">
              <h3 className="font-bold text-slate-900 text-base leading-tight">
                {topCard.title}
              </h3>

              {/* Meta pills */}
              <div className="flex flex-wrap gap-2">
                {topCard.ai_audience_size && (
                  <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-1">
                    <Users size={10} /> {formatAudience(topCard.ai_audience_size)}
                  </span>
                )}
                {topCard.episodeCount > 0 && (
                  <span className="flex items-center gap-1 text-xs bg-slate-50 text-slate-600 border border-slate-200 rounded-full px-2.5 py-1">
                    <Mic size={10} /> {topCard.episodeCount} episodes
                  </span>
                )}
                {topCard.apple_rating && (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2.5 py-1">
                    ⭐ {topCard.apple_rating.toFixed(1)}
                    {topCard.apple_rating_count ? ` (${topCard.apple_rating_count.toLocaleString()})` : ''}
                  </span>
                )}
                {(topCard.website || topCard.rss_website) && (
                  <a
                    href={topCard.website || topCard.rss_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs bg-slate-50 text-slate-500 border border-slate-200 rounded-full px-2.5 py-1 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                  >
                    <Globe size={10} /> Website
                  </a>
                )}
              </div>

              {/* Description — full, scrollable with the card */}
              <p className="text-xs text-slate-500 leading-relaxed">
                {topCard.rss_description || topCard.description || ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-6">
        <button
          onClick={() => handleSwipe('left')}
          className="w-14 h-14 rounded-full bg-white border-2 border-red-200 shadow-md flex items-center justify-center text-red-400 hover:bg-red-50 hover:border-red-400 hover:text-red-500 transition-all active:scale-95"
          aria-label="Pass"
        >
          <X size={24} />
        </button>

        <button
          onClick={() => handleSwipe('right')}
          className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg flex items-center justify-center text-white hover:from-green-500 hover:to-emerald-600 transition-all active:scale-95"
          aria-label="Like"
        >
          <Heart size={26} fill="white" />
        </button>
      </div>

      {/* Action feedback */}
      {lastAction && (
        <div className={`text-sm font-semibold animate-bounce ${lastAction === 'like' ? 'text-green-500' : 'text-slate-400'}`}>
          {lastAction === 'like' ? '❤️ Added to wishlist!' : '✕ Passed'}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        Swipe right to add to your wishlist · Swipe left to pass
      </p>
    </div>
  );
};
