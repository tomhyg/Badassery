import React, { useState } from 'react';
import { X, Save, Loader, CheckCircle } from 'lucide-react';
import { PodcastDocument, updatePodcast } from '../services/podcastService';
import { recalcBadasseryScore } from '../utils/badasseryScorer';

const CACHE_SERVER = 'http://localhost:3001';

async function triggerCacheExport(): Promise<{ ok: boolean; offline?: boolean }> {
  try {
    const res = await fetch(`${CACHE_SERVER}/export`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000), // 2 min max
    });
    const json = await res.json();
    return { ok: json.ok === true };
  } catch {
    return { ok: false, offline: true };
  }
}

interface Props {
  podcast: PodcastDocument;
  onClose: () => void;
  onSaved: (updated: PodcastDocument) => void;
}

type EditFields = {
  website_email: string;
  instagram_followers: string;
  twitter_followers: string;
  yt_subscribers: string;
  yt_avg_views_per_video: string;
  website_instagram: string;
  website_youtube: string;
  website_twitter: string;
  website_spotify: string;
  website_linkedin: string;
  website_facebook: string;
  website_tiktok: string;
  apple_rating: string;
  apple_rating_count: string;
  spotify_rating: string;
  spotify_review_count: string;
};

function toStr(v: any): string {
  if (v == null) return '';
  return String(v);
}

function parseNum(s: string): number | null {
  const n = Number(s.trim().replace(/,/g, ''));
  return s.trim() === '' || isNaN(n) ? null : n;
}

const FIELD_GROUPS: { title: string; fields: { key: keyof EditFields; label: string; type: 'text' | 'number' | 'url' }[] }[] = [
  {
    title: 'Audience Data',
    fields: [
      { key: 'yt_subscribers',         label: 'YouTube Subscribers',         type: 'number' },
      { key: 'yt_avg_views_per_video',  label: 'YouTube Avg Views/Video',     type: 'number' },
      { key: 'instagram_followers',     label: 'Instagram Followers',         type: 'number' },
      { key: 'twitter_followers',       label: 'Twitter/X Followers',         type: 'number' },
    ],
  },
  {
    title: 'Ratings',
    fields: [
      { key: 'apple_rating',            label: 'Apple Rating (0-5)',          type: 'number' },
      { key: 'apple_rating_count',      label: 'Apple Review Count',          type: 'number' },
      { key: 'spotify_rating',          label: 'Spotify Rating (0-5)',        type: 'number' },
      { key: 'spotify_review_count',    label: 'Spotify Review Count',        type: 'number' },
    ],
  },
  {
    title: 'Contact',
    fields: [
      { key: 'website_email',           label: 'Email (website)',             type: 'text' },
    ],
  },
  {
    title: 'Social Links',
    fields: [
      { key: 'website_instagram',       label: 'Instagram URL',               type: 'url' },
      { key: 'website_youtube',         label: 'YouTube URL',                 type: 'url' },
      { key: 'website_twitter',         label: 'Twitter/X URL',               type: 'url' },
      { key: 'website_spotify',         label: 'Spotify URL',                 type: 'url' },
      { key: 'website_linkedin',        label: 'LinkedIn URL',                type: 'url' },
      { key: 'website_facebook',        label: 'Facebook URL',                type: 'url' },
      { key: 'website_tiktok',          label: 'TikTok URL',                  type: 'url' },
    ],
  },
];

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[56px]">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
        done   ? 'bg-green-500 text-white' :
        active ? 'bg-indigo-600 text-white' :
                 'bg-slate-200 text-slate-400'
      }`}>
        {done ? <CheckCircle size={12} /> : (
          active ? <Loader size={10} className="animate-spin" /> : <span className="text-[10px]">·</span>
        )}
      </div>
      <span className={`text-[10px] font-medium leading-none ${
        done ? 'text-green-600' : active ? 'text-indigo-600' : 'text-slate-400'
      }`}>{label}</span>
    </div>
  );
}

export const BrooklynEditModal: React.FC<Props> = ({ podcast, onClose, onSaved }) => {
  const [fields, setFields] = useState<EditFields>({
    website_email:         toStr(podcast.website_email),
    instagram_followers:   toStr(podcast.instagram_followers),
    twitter_followers:     toStr(podcast.twitter_followers),
    yt_subscribers:        toStr(podcast.yt_subscribers),
    yt_avg_views_per_video: toStr(podcast.yt_avg_views_per_video),
    website_instagram:     toStr(podcast.website_instagram),
    website_youtube:       toStr(podcast.website_youtube),
    website_twitter:       toStr(podcast.website_twitter),
    website_spotify:       toStr(podcast.website_spotify),
    website_linkedin:      toStr(podcast.website_linkedin),
    website_facebook:      toStr(podcast.website_facebook),
    website_tiktok:        toStr(podcast.website_tiktok),
    apple_rating:          toStr(podcast.apple_rating),
    apple_rating_count:    toStr(podcast.apple_rating_count),
    spotify_rating:        toStr(podcast.spotify_rating),
    spotify_review_count:  toStr(podcast.spotify_review_count),
  });
  const [step, setStep] = useState<'' | 'saving' | 'rescoring' | 'cache' | 'done'>('');
  const [cacheOffline, setCacheOffline] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof EditFields, val: string) => setFields(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setStep('saving');
    setError('');
    setCacheOffline(false);
    try {
      // Step 1 — Build updates
      const updates: Partial<PodcastDocument> & Record<string, any> = {
        manual_overrides: true,
        website_email:          fields.website_email.trim() || null,
        instagram_followers:    parseNum(fields.instagram_followers),
        twitter_followers:      parseNum(fields.twitter_followers),
        yt_subscribers:         parseNum(fields.yt_subscribers),
        yt_avg_views_per_video: parseNum(fields.yt_avg_views_per_video),
        website_instagram:      fields.website_instagram.trim() || null,
        website_youtube:        fields.website_youtube.trim() || null,
        website_twitter:        fields.website_twitter.trim() || null,
        website_spotify:        fields.website_spotify.trim() || null,
        website_linkedin:       fields.website_linkedin.trim() || null,
        website_facebook:       fields.website_facebook.trim() || null,
        website_tiktok:         fields.website_tiktok.trim() || null,
        apple_rating:           parseNum(fields.apple_rating),
        apple_rating_count:     parseNum(fields.apple_rating_count),
        spotify_rating:         parseNum(fields.spotify_rating),
        spotify_review_count:   parseNum(fields.spotify_review_count),
      };

      // Step 2 — Rescore
      setStep('rescoring');
      const merged: PodcastDocument = { ...podcast, ...updates } as PodcastDocument;
      const scores = recalcBadasseryScore(merged);
      const finalUpdates = { ...updates, ...scores };

      // Write to Firestore
      await updatePodcast(podcast.itunesId, finalUpdates);
      const updatedPodcast: PodcastDocument = { ...merged, ...scores };

      // Step 3 — Regenerate JSON cache
      setStep('cache');
      const cacheResult = await triggerCacheExport();
      if (cacheResult.offline) setCacheOffline(true);

      // Step 4 — Done
      setStep('done');
      setTimeout(() => {
        setStep('');
        onSaved(updatedPodcast);
        onClose();
      }, 1500);
    } catch (e: any) {
      setStep('');
      setError(e?.message ?? 'Save failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h3 className="font-bold text-slate-900">Edit Podcast Data</h3>
            <p className="text-xs text-slate-400 mt-0.5">{podcast.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {FIELD_GROUPS.map(group => (
            <div key={group.title}>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">{group.title}</h4>
              <div className="space-y-2">
                {group.fields.map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                    <input
                      type={type === 'number' ? 'text' : type}
                      value={fields[key]}
                      onChange={e => set(key, e.target.value)}
                      placeholder={type === 'number' ? 'e.g. 12500' : type === 'url' ? 'https://...' : ''}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4 rounded-b-2xl">
          {/* Progress steps */}
          {step !== '' && (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <StepDot active={step === 'saving'}   done={['rescoring','cache','done'].includes(step)} label="Saving" />
              <div className="flex-1 h-px bg-slate-200" />
              <StepDot active={step === 'rescoring'} done={['cache','done'].includes(step)}             label="Rescoring" />
              <div className="flex-1 h-px bg-slate-200" />
              <StepDot active={step === 'cache'}     done={step === 'done'}                             label="Updating cache" />
              <div className="flex-1 h-px bg-slate-200" />
              <StepDot active={step === 'done'}      done={false}                                       label="Done ✅" />
            </div>
          )}
          {step === 'done' && cacheOffline && (
            <p className="text-xs text-amber-600 mb-2">Cache server offline — run <code className="bg-amber-100 px-1 rounded">npm run server</code> to enable auto-export.</p>
          )}
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <div className="flex items-center gap-3">
            <div className="flex-1" />
            <button
              onClick={onClose}
              disabled={step !== '' && step !== 'done'}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={step !== ''}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {step !== '' && step !== 'done' ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
              {step !== '' && step !== 'done' ? 'Working…' : 'Save + Rescore'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
