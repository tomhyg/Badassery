import React, { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Client } from '../types';
import { Loader2 } from 'lucide-react';

interface SpeakerProfileProps {
  clientId: string;
}

const CORAL = '#e8463a';

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/>
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  newsletter: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/>
    </svg>
  ),
  podcast: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 6a3 3 0 110 6 3 3 0 010-6zm5.25 10.5c-.414 0-.75-.336-.75-.75 0-2.485-2.015-4.5-4.5-4.5s-4.5 2.015-4.5 4.5c0 .414-.336.75-.75.75s-.75-.336-.75-.75c0-3.309 2.691-6 6-6s6 2.691 6 6c0 .414-.336.75-.75.75zm2.25 0c-.414 0-.75-.336-.75-.75 0-3.722-3.028-6.75-6.75-6.75S5.25 12.028 5.25 15.75c0 .414-.336.75-.75.75s-.75-.336-.75-.75C3.75 11.197 7.447 7.5 12 7.5s8.25 3.697 8.25 8.25c0 .414-.336.75-.75.75z"/>
    </svg>
  ),
  website: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
  other: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  ),
};

export const SpeakerProfile: React.FC<SpeakerProfileProps> = ({ clientId }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        // Try slug lookup first
        const slugQuery = await getDocs(query(collection(db, 'clients'), where('speakerSlug', '==', clientId)));
        if (!slugQuery.empty) {
          const d = slugQuery.docs[0];
          setClient({ id: d.id, ...d.data() } as Client);
          return;
        }
        // Fallback: direct doc ID
        const snap = await getDoc(doc(db, 'clients', clientId));
        if (!snap.exists()) { setNotFound(true); return; }
        setClient({ id: snap.id, ...snap.data() } as Client);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={36} className="animate-spin" style={{ color: CORAL }} />
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl font-semibold text-gray-800 mb-2">Profile not found</p>
          <p className="text-gray-400 text-sm">This speaker profile doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const firstName = client.identity?.firstName || '';
  const lastName = client.identity?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim() || client.contact_name || 'Speaker';
  const jobTitle = client.identity?.jobTitle || '';
  const company = client.identity?.company || (client as any).company_name || '';
  const titleLine = [jobTitle, company].filter(Boolean).join(' at ');
  const tagline = (client.identity as any)?.tagline || '';
  const headshot = client.links?.headshot || (client as any).logo_url || '';
  const bio = client.content?.bioV1 || client.content?.bioUpdated || client.content?.bioOriginal || '';
  const topicTags = client.content?.speakingTopicsArray || [];
  const speakingTopicTitles: string[] = (client.content as any)?.speakingTopicTitles || [];
  const primaryCategory: string = (client.matching as any)?.primaryCategory || (client.matching as any)?.primaryNiche || '';
  const secondaryCategories: string[] = (client.matching as any)?.secondaryCategories || (client.matching as any)?.secondaryNiches || [];
  const industryTags = [primaryCategory, ...secondaryCategories].filter(Boolean).slice(0, 2);
  const expertiseTags = topicTags.slice(0, 3);
  const channels: { platform: string; url: string; reach?: string }[] = (client.links as any)?.channels || [];
  const schedulingLink = client.links?.schedulingLink || '';

  // Past episodes (stored as newline-separated string or array)
  const rawEpisodes = (client.content as any)?.pastEpisodeLinks || '';
  const pastEpisodes: string[] = (
    Array.isArray(rawEpisodes)
      ? rawEpisodes
      : typeof rawEpisodes === 'string'
        ? rawEpisodes.split('\n').map((s: string) => s.trim()).filter(Boolean)
        : []
  ).slice(0, 3);

  // Reviews
  const reviews: { rating: number; quote: string; podcastName?: string; hostName?: string }[] =
    ((client as any).reviews || []).filter((r: any) => r.rating >= 6 && r.quote?.trim());

  // Books
  const books: { title: string; link: string }[] = (client as any).books || [];

  const getAmazonCover = (link: string): string | null => {
    const m = link.match(/(?:dp|gp\/product|ASIN)\/([A-Z0-9]{10})/i);
    return m ? `https://images-na.ssl-images-amazon.com/images/P/${m[1]}.01.LZZZZZZZ.jpg` : null;
  };

  // Detect episode platform
  const getEpisodePlatform = (url: string): 'youtube' | 'spotify' | 'apple' | 'other' => {
    if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
    if (/spotify\.com/.test(url)) return 'spotify';
    if (/podcasts\.apple\.com/.test(url)) return 'apple';
    return 'other';
  };

  const getYouTubeId = (url: string): string | null => {
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Main content ── */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-8 py-12">

        {/* ── Logo top-left ── */}
        <div className="mb-10">
          <img src="/logo.webp" alt="Badassery" className="h-8 opacity-80" />
        </div>

        {/* ── Hero: 2 columns ── */}
        <div className="flex flex-col md:flex-row gap-12 mb-16">

          {/* Left column */}
          <div className="md:w-64 flex-shrink-0 flex flex-col items-center md:items-start">
            {/* Photo */}
            <div className="w-52 h-52 rounded-lg overflow-hidden bg-gray-100 mb-5">
              {headshot ? (
                <img src={headshot} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white text-5xl font-bold"
                  style={{ backgroundColor: CORAL }}
                >
                  {fullName[0] || '?'}
                </div>
              )}
            </div>

            {/* Name */}
            <h1 className="text-2xl font-bold mb-1 text-center md:text-left" style={{ color: CORAL }}>
              {fullName}
            </h1>

            {/* Title */}
            {titleLine && (
              <p className="text-gray-600 text-sm mb-1 text-center md:text-left">{titleLine}</p>
            )}

            {/* Tagline */}
            {tagline && (
              <p className="text-gray-500 text-sm italic mb-4 text-center md:text-left">"{tagline}"</p>
            )}

            {/* Social links */}
            {channels.filter(c => c.url).length > 0 && (
              <div className="flex gap-3 mb-5 justify-center md:justify-start">
                {channels.filter(c => c.url).map((ch, i) => (
                  <a
                    key={i}
                    href={ch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
                    title={ch.platform}
                  >
                    {PLATFORM_ICONS[ch.platform] || PLATFORM_ICONS['other']}
                  </a>
                ))}
              </div>
            )}

            {/* Industry */}
            {industryTags.length > 0 && (
              <div className="mb-3 w-full">
                <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 text-center md:text-left" style={{ color: CORAL }}>Industry</p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  {industryTags.map((tag, i) => (
                    <span key={i} className="px-4 py-1.5 rounded-full text-sm text-gray-600 bg-slate-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Expertise */}
            {expertiseTags.length > 0 && (
              <div className="mb-5 w-full">
                <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 text-center md:text-left" style={{ color: CORAL }}>Expertise</p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  {expertiseTags.map((tag, i) => (
                    <span key={i} className="px-4 py-1.5 rounded-full text-sm text-gray-700 capitalize" style={{ backgroundColor: '#f5f0e8' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Buttons */}
            {schedulingLink && (
              <div className="w-full space-y-3 mt-2">
                <a
                  href={schedulingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 rounded-full text-white font-semibold text-center text-sm transition-opacity hover:opacity-90"
                  style={{ backgroundColor: CORAL }}
                >
                  Book
                </a>
                <a
                  href={schedulingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 rounded-full font-semibold text-center text-sm border-2 transition-colors hover:bg-red-50"
                  style={{ color: CORAL, borderColor: CORAL }}
                >
                  Request Intro
                </a>
              </div>
            )}

            {schedulingLink && (
              <p className="text-gray-400 text-xs italic mt-4 text-center md:text-left">
                Speaker fees may be adjusted based on commitment.
              </p>
            )}
          </div>

          {/* Right column — Bio */}
          <div className="flex-1">
            {bio ? (
              <div className="text-gray-800 text-base leading-relaxed space-y-5">
                {bio.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 italic">No bio available.</p>
            )}
          </div>
        </div>

        {/* ── Divider ── */}
        <hr className="border-gray-100 mb-12" />

        {/* ── Speaking Topics (long titles) ── */}
        {speakingTopicTitles.length > 0 && (
          <div className="mb-10">
            <h2 className="text-base font-semibold mb-4" style={{ color: CORAL }}>Speaking Topics</h2>
            <div className="flex flex-col items-start gap-2">
              {speakingTopicTitles.map((t, i) => (
                <span
                  key={i}
                  className="inline-block px-5 py-3 rounded-full text-sm text-gray-800"
                  style={{ backgroundColor: '#fde8e6', border: '1px solid #f5c0bb' }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Past Episodes ── */}
        {pastEpisodes.length > 0 && (
          <div className="mb-10">
            <h2 className="text-base font-semibold mb-4" style={{ color: CORAL }}>Past Episodes</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pastEpisodes.map((url, i) => {
                const platform = getEpisodePlatform(url);
                const ytId = platform === 'youtube' ? getYouTubeId(url) : null;
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow group"
                  >
                    {platform === 'youtube' && ytId ? (
                      <div className="relative">
                        <img
                          src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                          alt="YouTube episode"
                          className="w-full aspect-video object-cover"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 ml-1"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video flex items-center justify-center gap-3 px-4"
                        style={{ backgroundColor: platform === 'spotify' ? '#1DB954' : platform === 'apple' ? '#fc3c44' : '#f3f4f6' }}
                      >
                        {platform === 'spotify' && (
                          <svg viewBox="0 0 24 24" fill="white" className="w-10 h-10"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                        )}
                        {platform === 'apple' && (
                          <svg viewBox="0 0 24 24" fill="white" className="w-10 h-10"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>
                        )}
                        {platform === 'other' && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} className="w-10 h-10"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="#9ca3af" stroke="none"/></svg>
                        )}
                        <span className="text-white text-xs font-semibold capitalize">{platform === 'other' ? 'Episode' : platform}</span>
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Books ── */}
        {books.length > 0 && (
          <div className="mb-10">
            <h2 className="text-base font-semibold mb-4" style={{ color: CORAL }}>Books</h2>
            <div className="flex flex-wrap gap-4">
              {books.map((book, i) => {
                const cover = getAmazonCover(book.link);
                return (
                  <a
                    key={i}
                    href={book.link || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex flex-col items-center gap-2 group ${book.link ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{ width: '120px' }}
                  >
                    <div className="w-28 h-40 rounded-lg overflow-hidden shadow-md group-hover:shadow-lg transition-shadow bg-gray-100 flex items-center justify-center">
                      {cover ? (
                        <img
                          src={cover}
                          alt={book.title}
                          className="w-full h-full object-cover"
                          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                            e.currentTarget.style.display = 'none';
                            (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute('style');
                          }}
                        />
                      ) : null}
                      <div
                        className="w-full h-full flex items-center justify-center p-2 text-center"
                        style={{ display: cover ? 'none' : 'flex', backgroundColor: '#fde8e6' }}
                      >
                        <span className="text-3xl">📚</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 text-center leading-tight group-hover:text-rose-500 transition-colors">
                      {book.title}
                    </p>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Reviews ── */}
        {reviews.length > 0 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-center mb-8" style={{ color: CORAL }}>Reviews</h2>
            <div className="space-y-6">
              {reviews.map((r, i) => {
                const starsOut5 = r.rating / 2; // 10 → 5
                return (
                <div key={i} className="flex flex-col gap-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, s) => {
                      const fill = Math.min(1, Math.max(0, starsOut5 - s));
                      const pct = Math.round(fill * 100);
                      const gradId = `star-${i}-${s}`;
                      return (
                        <svg key={s} viewBox="0 0 24 24" className="w-5 h-5">
                          <defs>
                            <linearGradient id={gradId}>
                              <stop offset={`${pct}%`} stopColor={CORAL} />
                              <stop offset={`${pct}%`} stopColor="#e5e7eb" />
                            </linearGradient>
                          </defs>
                          <path fill={`url(#${gradId})`} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                      );
                    })}
                    <span className="text-xs text-gray-400 ml-1">{r.rating}/10</span>
                  </div>
                  <p className="text-gray-700 text-base italic">"{r.quote}"</p>
                  {(r.hostName || r.podcastName) && (
                    <p className="text-gray-400 text-sm">
                      {r.hostName && <span className="font-medium text-gray-600">{r.hostName}</span>}
                      {r.hostName && r.podcastName && ' · '}
                      {r.podcastName}
                    </p>
                  )}
                </div>
              ); })}
            </div>
          </div>
        )}

      </div>

      {/* ── Bottom CTA + footer ── */}
      {schedulingLink && (
        <div className="py-10 flex justify-center border-t border-gray-100">
          <a
            href={schedulingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-12 py-4 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90"
            style={{ backgroundColor: CORAL }}
          >
            Book {firstName || fullName}
          </a>
        </div>
      )}

      {/* Red footer bar */}
      <div className="h-3" style={{ backgroundColor: CORAL }} />
    </div>
  );
};
