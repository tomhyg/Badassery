import React, { useState, useEffect } from 'react';
import {
  Globe, Linkedin, Instagram, Twitter, ExternalLink, Loader2,
} from 'lucide-react';
import { getClientById } from '../services/clientService';
import { Client } from '../types';

interface Props {
  clientId: string;
}

export const SpeakProfile: React.FC<Props> = ({ clientId }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getClientById(clientId)
      .then(data => {
        if (!data) setNotFound(true);
        else setClient(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="text-slate-500 animate-spin" size={32} />
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Profile not found.</p>
      </div>
    );
  }

  // Resolve fields with fallbacks
  const firstName = client.identity?.firstName || '';
  const lastName  = client.identity?.lastName  || '';
  const name      = `${firstName} ${lastName}`.trim() || client.contact_name || '';
  const title     = client.identity?.jobTitle   || client.spokesperson?.title || '';
  const company   = client.identity?.company    || client.company_name        || '';
  const headshot  = client.links?.headshot      || client.logo_url            || '';
  const bio       = client.content?.bioUpdated  || client.content?.bioOriginal || client.spokesperson?.bio || '';
  const topics    = client.content?.speakingTopicsArray || client.spokesperson?.topics || [];

  const website   = client.links?.website   || '';
  const linkedin  = client.links?.linkedinAndSocial || client.spokesperson?.linkedin_url || '';
  const instagram = client.links?.instagram || '';
  const twitter   = client.links?.twitter   || '';
  const substack  = client.links?.substack  || '';

  const pastEpisodes = client.pastEpisodes || [];
  const reviews      = client.reviews      || [];

  const hasLinks = website || linkedin || instagram || twitter || substack;

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Top bar */}
      <header className="border-b border-slate-800/60 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center font-bold text-sm">
            B
          </div>
          <span className="text-xs font-semibold text-slate-500 tracking-widest uppercase">
            Badassery
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-14">

        {/* ── Hero ── */}
        <div className="flex flex-col items-center text-center mb-14">
          {headshot ? (
            <img
              src={headshot}
              alt={name}
              className="w-28 h-28 rounded-full object-cover border-4 border-slate-700 shadow-2xl mb-6"
            />
          ) : (
            <div className="w-28 h-28 rounded-full bg-slate-800 border-4 border-slate-700 mb-6 flex items-center justify-center">
              <span className="text-4xl font-bold text-slate-500">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">{name}</h1>
          {title   && <p className="text-slate-300 text-lg mt-0.5">{title}</p>}
          {company && <p className="text-slate-500 text-sm mt-1">{company}</p>}

          {hasLinks && (
            <div className="flex items-center gap-1 mt-6">
              {website   && <SocialLink href={website}   icon={<Globe size={17} />}     label="Website"   />}
              {linkedin  && <SocialLink href={linkedin}  icon={<Linkedin size={17} />}  label="LinkedIn"  />}
              {instagram && <SocialLink href={instagram} icon={<Instagram size={17} />} label="Instagram" />}
              {twitter   && <SocialLink href={twitter}   icon={<Twitter size={17} />}   label="X"         />}
              {substack  && (
                <SocialLink
                  href={substack}
                  label="Substack"
                  icon={
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[17px] h-[17px]">
                      <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/>
                    </svg>
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* ── Bio ── */}
        {bio && (
          <section className="mb-12">
            <SectionLabel>About</SectionLabel>
            <p className="text-slate-300 leading-relaxed whitespace-pre-line text-[15px]">
              {bio}
            </p>
          </section>
        )}

        {/* ── Topics ── */}
        {topics.length > 0 && (
          <section className="mb-12">
            <SectionLabel>Speaking Topics</SectionLabel>
            <div className="flex flex-wrap gap-2.5">
              {topics.slice(0, 5).map(topic => (
                <span
                  key={topic}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-full text-sm font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── Past Episodes ── */}
        {pastEpisodes.length > 0 && (
          <section className="mb-12">
            <SectionLabel>Previous Appearances</SectionLabel>
            <div className="space-y-3">
              {pastEpisodes.slice(0, 3).map((ep, i) => (
                <div
                  key={i}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
                >
                  <div>
                    {ep.showName && (
                      <p className="text-xs text-slate-500 mb-0.5 font-medium uppercase tracking-wide">
                        {ep.showName}
                      </p>
                    )}
                    <p className="text-slate-200 font-medium text-sm leading-snug">{ep.title}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ep.appleUrl   && <PlatformLink href={ep.appleUrl}   label="Apple"   />}
                    {ep.spotifyUrl && <PlatformLink href={ep.spotifyUrl} label="Spotify" />}
                    {ep.youtubeUrl && <PlatformLink href={ep.youtubeUrl} label="YouTube" />}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Reviews ── */}
        {reviews.length > 0 && (
          <section className="mb-12">
            <SectionLabel>What Hosts Say</SectionLabel>
            <div className="space-y-4">
              {reviews.map((r, i) => (
                <div
                  key={i}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-6"
                >
                  <p className="text-slate-300 italic leading-relaxed mb-5 text-[15px]">
                    "{r.text}"
                  </p>
                  <div className="flex items-center gap-3">
                    {r.avatar ? (
                      <img
                        src={r.avatar}
                        alt={r.author}
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-slate-400 text-sm font-bold">
                          {r.author.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-white font-semibold text-sm">{r.author}</p>
                      {(r.role || r.company) && (
                        <p className="text-slate-500 text-xs mt-0.5">
                          {[r.role, r.company].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="border-t border-slate-800/60 pt-8 text-center">
          <p className="text-slate-700 text-xs">
            Managed by{' '}
            <span className="text-slate-500 font-medium">Badassery</span>
            {' '}· Podcast Booking Agency
          </p>
        </footer>

      </main>
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">
    {children}
  </h2>
);

const SocialLink: React.FC<{ href: string; icon: React.ReactNode; label: string }> = ({
  href, icon, label,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    title={label}
    className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
  >
    {icon}
  </a>
);

const PlatformLink: React.FC<{ href: string; label: string }> = ({ href, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full text-slate-300 hover:text-white transition-colors"
  >
    <ExternalLink size={10} />
    {label}
  </a>
);
