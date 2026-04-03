import React, { useState, useEffect, useRef } from 'react';
import { PodcastsReal } from './PodcastsReal';
import { AppleCharts } from './AppleCharts';
import { SpotifyCharts } from './SpotifyCharts';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PodcastTab = 'search' | 'apple-charts' | 'spotify-charts' | 'add-new';

const TABS: { id: PodcastTab; label: string }[] = [
  { id: 'search',         label: 'Search'         },
  { id: 'apple-charts',   label: 'Apple Charts'   },
  { id: 'spotify-charts', label: 'Spotify Charts' },
  { id: 'add-new',        label: 'Add New'        },
];

interface Props {
  initialTab?: PodcastTab;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PodcastsHub: React.FC<Props> = ({ initialTab = 'search' }) => {
  const [activeTab, setActiveTab] = useState<PodcastTab>(initialTab);

  // Track which tabs have ever been visited so we keep them mounted
  const [mounted, setMounted] = useState<Set<PodcastTab>>(
    () => new Set([initialTab])
  );

  // Slide animation state
  const [slide, setSlide] = useState<{
    opacity: number;
    x: number;
    animated: boolean;
  }>({ opacity: 1, x: 0, animated: true });

  const switching = useRef(false);

  // Sync when parent changes initialTab (e.g. deep-link from somewhere)
  useEffect(() => {
    if (initialTab && initialTab !== activeTab) switchTab(initialTab as PodcastTab);
  }, [initialTab]);

  const switchTab = (tab: PodcastTab) => {
    if (tab === activeTab || switching.current) return;
    switching.current = true;

    const currentIdx = TABS.findIndex(t => t.id === activeTab);
    const nextIdx    = TABS.findIndex(t => t.id === tab);
    const goRight    = nextIdx > currentIdx;

    // Phase 1 — slide out
    setSlide({ opacity: 0, x: goRight ? -20 : 20, animated: true });

    setTimeout(() => {
      // Phase 2 — snap to entry position (no animation)
      setActiveTab(tab);
      setMounted(prev => prev.has(tab) ? prev : new Set([...prev, tab]));
      setSlide({ opacity: 0, x: goRight ? 20 : -20, animated: false });

      // Phase 3 — slide in (two rAFs to ensure the snap is painted first)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlide({ opacity: 1, x: 0, animated: true });
          switching.current = false;
        });
      });
    }, 150);
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Tab bar — centered ──────────────────────────────────────────── */}
      <div className="flex justify-center mb-6">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={[
                  'px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 select-none',
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content — slide on X ────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0"
        style={{
          opacity:    slide.opacity,
          transform:  `translateX(${slide.x}px)`,
          transition: slide.animated
            ? 'opacity 150ms ease-out, transform 150ms ease-out'
            : 'none',
        }}
      >
        {/* Search — always mounted first, never unmounted */}
        <div style={{ display: activeTab === 'search' ? 'contents' : 'none' }}>
          <PodcastsReal />
        </div>

        {mounted.has('apple-charts') && (
          <div style={{ display: activeTab === 'apple-charts' ? 'contents' : 'none' }}>
            <AppleCharts />
          </div>
        )}

        {mounted.has('spotify-charts') && (
          <div style={{ display: activeTab === 'spotify-charts' ? 'contents' : 'none' }}>
            <SpotifyCharts />
          </div>
        )}

        {mounted.has('add-new') && (
          <div style={{ display: activeTab === 'add-new' ? 'block' : 'none' }}>
            <div className="p-6">
              <h1 className="text-2xl font-bold text-slate-900">Add New Podcast</h1>
              <p className="text-slate-500 mt-2">Coming soon.</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
