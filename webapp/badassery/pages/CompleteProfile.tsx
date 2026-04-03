import React, { useState, useRef } from 'react';
import { Camera, Loader2, ArrowRight, Plus, X } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, storage } from '../services/firebase';

function buildSpeakerSlug(displayName: string, fallback: string): string {
  const base = displayName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || fallback;
}

interface CompleteProfileProps {
  clientId: string;
  displayName: string;
  onComplete: () => void;
}

const COUNTRY_CODES = [
  { code: '+1',   flag: '🇺🇸', label: 'US' },
  { code: '+1',   flag: '🇨🇦', label: 'CA' },
  { code: '+33',  flag: '🇫🇷', label: 'FR' },
  { code: '+44',  flag: '🇬🇧', label: 'GB' },
  { code: '+49',  flag: '🇩🇪', label: 'DE' },
  { code: '+34',  flag: '🇪🇸', label: 'ES' },
  { code: '+39',  flag: '🇮🇹', label: 'IT' },
  { code: '+31',  flag: '🇳🇱', label: 'NL' },
  { code: '+32',  flag: '🇧🇪', label: 'BE' },
  { code: '+41',  flag: '🇨🇭', label: 'CH' },
  { code: '+61',  flag: '🇦🇺', label: 'AU' },
  { code: '+64',  flag: '🇳🇿', label: 'NZ' },
  { code: '+971', flag: '🇦🇪', label: 'AE' },
  { code: '+65',  flag: '🇸🇬', label: 'SG' },
  { code: '+852', flag: '🇭🇰', label: 'HK' },
];

const COMPANY_SIZES = ['Just me', '2–10', '11–50', '51–200', '201–1000', '1000+'];

interface Platform {
  id: string;
  label: string;
  placeholder: string;
  color: string;
  hasReach: boolean;
  // SVG path or emoji
  icon: React.ReactNode;
}

const PLATFORMS: Platform[] = [
  {
    id: 'website', label: 'Website', placeholder: 'https://yourwebsite.com', color: '#6366f1', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
      </svg>
    ),
  },
  {
    id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/…', color: '#0077b5', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  {
    id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…', color: '#e1306c', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    id: 'x', label: 'X / Twitter', placeholder: 'https://x.com/…', color: '#000000', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@…', color: '#ff0000', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  },
  {
    id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…', color: '#010101', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/>
      </svg>
    ),
  },
  {
    id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…', color: '#1877f2', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    id: 'newsletter', label: 'Newsletter', placeholder: 'https://substack.com/…', color: '#ff6719', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/>
      </svg>
    ),
  },
  {
    id: 'podcast', label: 'Podcast', placeholder: 'https://open.spotify.com/…', color: '#8b5cf6', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 6a3 3 0 110 6 3 3 0 010-6zm5.25 10.5c-.414 0-.75-.336-.75-.75 0-2.485-2.015-4.5-4.5-4.5s-4.5 2.015-4.5 4.5c0 .414-.336.75-.75.75s-.75-.336-.75-.75c0-3.309 2.691-6 6-6s6 2.691 6 6c0 .414-.336.75-.75.75zm2.25 0c-.414 0-.75-.336-.75-.75 0-3.722-3.028-6.75-6.75-6.75S5.25 12.028 5.25 15.75c0 .414-.336.75-.75.75s-.75-.336-.75-.75C3.75 11.197 7.447 7.5 12 7.5s8.25 3.697 8.25 8.25c0 .414-.336.75-.75.75z"/>
      </svg>
    ),
  },
  {
    id: 'other', label: 'Other', placeholder: 'https://…', color: '#6b7280', hasReach: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    ),
  },
];

interface ChannelRow {
  platformId: string;
  url: string;
  reach: string;
}

export const CompleteProfile: React.FC<CompleteProfileProps> = ({ clientId, displayName, onComplete }) => {
  const [headshotPreview, setHeadshotPreview] = useState('');
  const [headshotUrl, setHeadshotUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [countryCode, setCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      setHeadshotPreview(URL.createObjectURL(file));
      const storageRef = ref(storage, `clients/${clientId}/headshot_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setHeadshotUrl(url);
    } catch {
      setPhotoError('Photo uploaded but URL could not be retrieved. It will still appear on your profile.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addChannel = (platformId: string) => {
    if (channels.some(c => c.platformId === platformId)) return;
    setChannels(prev => [...prev, { platformId, url: '', reach: '' }]);
  };

  const updateChannel = (platformId: string, field: 'url' | 'reach', value: string) => {
    setChannels(prev => prev.map(c => c.platformId === platformId ? { ...c, [field]: value } : c));
  };

  const removeChannel = (platformId: string) => {
    setChannels(prev => prev.filter(c => c.platformId !== platformId));
  };

  const handleSave = async () => {
    if (!jobTitle || !company) {
      setError('Job title and company are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const websiteEntry = channels.find(c => c.platformId === 'website');
      const linkedinEntry = channels.find(c => c.platformId === 'linkedin');
      const channelReachText = channels
        .filter(c => c.reach)
        .map(c => {
          const p = PLATFORMS.find(p => p.id === c.platformId);
          return `${p?.label ?? c.platformId}: ${c.reach}`;
        })
        .join('\n');

      // Build a unique slug; if already taken, append a suffix
      const baseSlug = buildSpeakerSlug(displayName, clientId);
      let slug = baseSlug;
      const existing = await getDocs(query(collection(db, 'clients'), where('speakerSlug', '==', baseSlug)));
      if (!existing.empty && existing.docs[0].id !== clientId) {
        slug = `${baseSlug}-${clientId.slice(0, 4)}`;
      }

      await updateDoc(doc(db, 'clients', clientId), {
        'identity.phone': countryCode + phone,
        'identity.jobTitle': jobTitle,
        'identity.company': company,
        'identity.companySize': companySize,
        'links.headshot': headshotUrl,
        'links.website': websiteEntry?.url ?? '',
        'links.linkedinAndSocial': linkedinEntry?.url ?? '',
        'links.channels': channels.map(c => ({ platform: c.platformId, url: c.url, reach: c.reach })),
        'content.channelReach': channelReachText,
        speakerSlug: slug,
        profileCompleted: true,
      });
      onComplete();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = headshotPreview || headshotUrl;
  const addedIds = channels.map(c => c.platformId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.webp" alt="Badassery" className="h-16 mx-auto mb-4 drop-shadow-lg" />
          <h1 className="text-3xl font-bold text-white mb-1">Complete your profile</h1>
          <p className="text-purple-200 text-sm">Welcome, {displayName.split(' ')[0]}! Fill in your details to get started.</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8 space-y-6">

          {/* Headshot */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative w-24 h-24 rounded-full cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt="Headshot" className="w-24 h-24 rounded-full object-cover border-4 border-white/20" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-white/10 border-4 border-white/20 flex items-center justify-center">
                  <Camera size={28} className="text-purple-300" />
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingPhoto
                  ? <Loader2 size={22} className="text-white animate-spin" />
                  : <Camera size={22} className="text-white" />
                }
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            <p className="text-purple-300 text-xs">Click to upload your photo</p>
            {photoError && <p className="text-yellow-300 text-xs text-center">{photoError}</p>}
          </div>

          {/* Job Title + Company */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-1.5">Job Title *</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJobTitle(e.target.value)}
                placeholder="CEO, Coach…"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-1.5">Company *</label>
              <input
                type="text"
                value={company}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompany(e.target.value)}
                placeholder="Acme Inc."
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Company Size */}
          <div>
            <label className="block text-sm font-medium text-purple-200 mb-1.5">Company Size</label>
            <div className="grid grid-cols-3 gap-2">
              {COMPANY_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setCompanySize(size)}
                  className={`py-2 text-xs rounded-lg border transition-colors ${
                    companySize === size
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white/10 text-purple-200 border-white/20 hover:border-purple-400 hover:text-white'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-purple-200 mb-1.5">Phone number</label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCountryCode(e.target.value)}
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {COUNTRY_CODES.map(c => (
                  <option key={c.flag + c.code} value={c.code} className="bg-slate-800">
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                placeholder="612 345 678"
                className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Channels (links only) */}
          <div>
            <label className="block text-sm font-medium text-purple-200 mb-3">
              Links per channel
            </label>

            {/* Added channels */}
            {channels.length > 0 && (
              <div className="space-y-2 mb-3">
                {channels.map(ch => {
                  const platform = PLATFORMS.find(p => p.id === ch.platformId)!;
                  return (
                    <div key={ch.platformId} className="bg-white/10 border border-white/20 rounded-xl p-3">
                      {/* Platform header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                            style={{ backgroundColor: platform.color }}
                          >
                            {platform.icon}
                          </span>
                          <span className="text-white text-sm font-medium">{platform.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeChannel(ch.platformId)}
                          className="text-purple-400 hover:text-red-400 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {/* URL */}
                      <input
                        type="url"
                        value={ch.url}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateChannel(ch.platformId, 'url', e.target.value)}
                        placeholder={platform.placeholder}
                        className="w-full px-2.5 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-400 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Platform picker */}
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => {
                const added = addedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addChannel(p.id)}
                    disabled={added}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      added
                        ? 'border-purple-500/40 bg-purple-500/20 text-purple-300 cursor-default'
                        : 'border-white/20 bg-white/5 text-purple-200 hover:border-purple-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded flex items-center justify-center text-white"
                      style={{ color: added ? undefined : p.color }}
                    >
                      {p.icon}
                    </span>
                    {p.label}
                    {!added && <Plus size={10} />}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !jobTitle || !company}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            {saving ? (
              <><Loader2 size={20} className="animate-spin" /> Saving…</>
            ) : (
              <>Save & Continue <ArrowRight size={20} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
