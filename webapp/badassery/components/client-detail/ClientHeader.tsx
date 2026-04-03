import React from 'react';
import { Camera, RefreshCw, Check, Copy, Edit2, ExternalLink, Star, Loader2 } from 'lucide-react';
import { Client, getClientDisplayData } from '../../types';

interface Props {
  client: Client;
  display: ReturnType<typeof getClientDisplayData>;
  clientId: string;
  // photo
  photoInputRef: React.RefObject<HTMLInputElement>;
  uploadingHeadshot: boolean;
  onHeadshotUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // status
  showStatusMenu: boolean;
  setShowStatusMenu: (v: boolean) => void;
  updating: boolean;
  onStatusChange: (status: 'active' | 'onboarding' | 'paused' | 'churned') => void;
  // stats
  editingStats: boolean;
  statsForm: { total_bookings: number; goal_bookings: number };
  setStatsForm: React.Dispatch<React.SetStateAction<{ total_bookings: number; goal_bookings: number }>>;
  onStartEditStats: () => void;
  onSaveStats: () => void;
  onCancelEditStats: () => void;
  // profile link
  copiedLink: boolean;
  onCopyLink: () => void;
  // review link
  generatingReview: boolean;
  copiedReviewLink: boolean;
  onGenerateReviewLink: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  active:     'bg-green-100 text-green-800',
  onboarding: 'bg-amber-100 text-amber-800',
  paused:     'bg-blue-100 text-blue-800',
  churned:    'bg-slate-100 text-slate-600',
};

export const ClientHeader: React.FC<Props> = ({
  client, display, clientId,
  photoInputRef, uploadingHeadshot, onHeadshotUpload,
  showStatusMenu, setShowStatusMenu, updating, onStatusChange,
  editingStats, statsForm, setStatsForm, onStartEditStats, onSaveStats, onCancelEditStats,
  copiedLink, onCopyLink,
  generatingReview, copiedReviewLink, onGenerateReviewLink,
}) => {
  const c = client as any;
  const tagline = c.identity?.tagline;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Top accent bar */}
      <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #e8463a, #f97316)' }} />

      <div className="p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative group flex-shrink-0">
            <img
              src={display.logo_url}
              alt={display.contact_name}
              className="w-20 h-20 rounded-full border-2 border-slate-200 object-cover shadow-sm"
            />
            <input type="file" accept="image/*" ref={photoInputRef} onChange={onHeadshotUpload} className="hidden" />
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingHeadshot}
              className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              {uploadingHeadshot
                ? <RefreshCw size={18} className="text-white animate-spin" />
                : <Camera size={18} className="text-white" />}
            </button>
          </div>

          {/* Name & Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">{display.contact_name}</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {display.spokesperson?.title && `${display.spokesperson.title}`}
                  {display.spokesperson?.title && display.company_name && ' · '}
                  {display.company_name}
                </p>
                {tagline && (
                  <p className="text-sm italic mt-1.5" style={{ color: '#888' }}>"{tagline}"</p>
                )}
              </div>

              {/* Status badge */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  disabled={updating}
                  className={`px-3 py-1.5 rounded-full text-sm font-bold capitalize flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50 ${STATUS_COLORS[display.status] || STATUS_COLORS.churned}`}
                >
                  {updating && <RefreshCw size={12} className="animate-spin" />}
                  {display.status}
                  <span className="text-xs opacity-60">▼</span>
                </button>

                {showStatusMenu && !updating && (
                  <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[150px] overflow-hidden">
                    {(['active', 'onboarding', 'paused', 'churned'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => { onStatusChange(s); setShowStatusMenu(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm capitalize hover:bg-slate-50 transition-colors ${display.status === s ? 'font-semibold text-indigo-600' : 'text-slate-700'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex items-center gap-6">
          {/* Stat pills */}
          <div className="flex gap-4 flex-1">
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-0.5">Matches</p>
              <p className="text-xl font-bold text-slate-900">{display.stats?.matches ?? 0}</p>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-0.5">Outreach</p>
              <p className="text-xl font-bold text-slate-900">{display.stats?.total_outreach_started ?? 0}</p>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-0.5">Booked</p>
              {editingStats ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={statsForm.total_bookings}
                    onChange={e => setStatsForm(f => ({ ...f, total_bookings: Number(e.target.value) }))}
                    className="w-14 text-center border border-slate-300 rounded px-1 py-0.5 text-sm font-bold"
                    min={0}
                  />
                  <span className="text-xs text-slate-400">/</span>
                  <input
                    type="number"
                    value={statsForm.goal_bookings}
                    onChange={e => setStatsForm(f => ({ ...f, goal_bookings: Number(e.target.value) }))}
                    className="w-14 text-center border border-slate-300 rounded px-1 py-0.5 text-sm"
                    min={0}
                  />
                </div>
              ) : (
                <p className="text-xl font-bold text-slate-900">
                  {display.stats?.total_bookings ?? 0}
                  <span className="text-sm font-normal text-slate-400"> / {display.stats?.goal_bookings ?? 0}</span>
                </p>
              )}
            </div>
          </div>

          {/* Stats edit controls */}
          <div className="flex items-center gap-2">
            {editingStats ? (
              <>
                <button onClick={onSaveStats} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center gap-1">
                  <Check size={12} /> Save
                </button>
                <button onClick={onCancelEditStats} className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={onStartEditStats} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <Edit2 size={12} /> Edit stats
              </button>
            )}
          </div>

          {/* Speaker profile buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {(c.speakerSlug || c.links?.badasseryProfileUrl) && (
              <a
                href={`/?speak=${c.speakerSlug || clientId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-800 px-3 py-1.5 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
              >
                <ExternalLink size={12} /> View Speaker Profile
              </a>
            )}
            {c.links?.badasseryProfileUrl && (
              <button
                onClick={onCopyLink}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 px-3 py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                {copiedLink ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Link</>}
              </button>
            )}
            <button
              onClick={onGenerateReviewLink}
              disabled={generatingReview}
              className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 px-3 py-1.5 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              {generatingReview
                ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
                : copiedReviewLink
                ? <><Check size={12} /> Link Copied!</>
                : <><Star size={12} /> Get Review Link</>}
            </button>
          </div>
        </div>

        {/* Tags */}
        {(client.metadata?.tags?.length ?? 0) > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {client.metadata!.tags!.map((tag: string) => (
              <span key={tag} className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: '#fef3f2', color: '#e8463a', border: '1px solid #fecaca' }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
