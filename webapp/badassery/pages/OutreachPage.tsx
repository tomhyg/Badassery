import React, { useState, useEffect, useCallback } from 'react';
import {
  getAllOutreachV2Cached, updateOutreachStatusV2, updateOutreachV2,
  invalidateOutreachCache, createOutreachV2,
} from '../services/outreachServiceV2';
import { getPodcastForOutreach, searchPodcastsByTitle, PodcastDocument as PodcastDoc } from '../services/podcastService';
import { getClientById, getAllClients } from '../services/clientService';
import { Client } from '../types';
import { getAIConfig } from '../services/aiConfigService';
import { generateReviewToken } from '../services/reviewService';
import { Outreach, OutreachStatus, Podcast } from '../types';
import {
  Mail, User, Calendar, Award, ExternalLink, Filter, CheckCircle2,
  Clock, XCircle, DollarSign, Ban, Send, Bell, MessageSquare, Copy,
  X, Trash2, Search, LayoutList, Columns, ChevronDown, ChevronUp, Plus, Loader2,
} from 'lucide-react';
import { FollowUpReviewModal } from '../components/FollowUpReviewModal';
import { OutreachActionModal } from '../components/OutreachActionModal';
import { PrepEmailModal } from '../components/PrepEmailModal';
import { PodcastDetailModal } from '../components/PodcastDetailModal';
import { BlacklistModal } from '../components/BlacklistModal';
import { EmailActionType } from '../services/outreachEmailActionsService';
import { PodcastDocument } from '../services/podcastService';
import { Timestamp, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

type EnrichedOutreach = Outreach & { podcast?: Podcast | null };
type ViewMode = 'kanban' | 'table';

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGES = [
  { id: 'pipeline',   label: 'Pipeline',    icon: '🎯', color: 'bg-slate-50 border-slate-200',   statuses: ['identified', 'ready_for_outreach'] as OutreachStatus[] },
  { id: 'outreach',   label: 'Outreach',    icon: '📧', color: 'bg-blue-50 border-blue-200',     statuses: ['1st_email_sent', '1st_followup_sent', '2nd_followup_sent'] as OutreachStatus[] },
  { id: 'contact',    label: 'In Contact',  icon: '💬', color: 'bg-amber-50 border-amber-200',   statuses: ['in_contact', 'scheduling_screening', 'screening_scheduled', 'scheduling_recording', 'recording_scheduled'] as OutreachStatus[] },
  { id: 'recorded',   label: 'Recorded',    icon: '🎙', color: 'bg-emerald-50 border-emerald-200', statuses: ['recorded', 'live'] as OutreachStatus[] },
] as const;

const CLOSED_STATUSES: OutreachStatus[] = [
  'backlog', 'follow_up_1_month', 'fill_form',
  'declined_by_host', 'client_declined', 'no_response',
  'cancelled', 'email_bounced', 'paid_podcast', 'blacklist',
];

const STATUS_LABELS: Record<OutreachStatus, string> = {
  'identified': 'Identified',
  'ready_for_outreach': 'Ready for Outreach',
  '1st_email_sent': '1st Email Sent',
  '1st_followup_sent': '1st Follow-up Sent',
  '2nd_followup_sent': '2nd Follow-up Sent',
  'in_contact': 'In Contact',
  'scheduling_screening': 'Scheduling Screening',
  'screening_scheduled': 'Screening Scheduled',
  'scheduling_recording': 'Scheduling Recording',
  'recording_scheduled': 'Recording Scheduled',
  'recorded': 'Recorded',
  'live': 'Live 🟢',
  'backlog': 'Backlog',
  'follow_up_1_month': 'Follow Up in 1 Month',
  'fill_form': 'Fill Form',
  'declined_by_host': 'Declined by Host',
  'client_declined': 'Client Declined',
  'no_response': 'No Response',
  'cancelled': 'Cancelled',
  'email_bounced': 'Email Bounced',
  'paid_podcast': 'Paid Podcast',
  'blacklist': 'Blacklisted',
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as OutreachStatus[];

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseOutreachDate = (item: EnrichedOutreach): number | null => {
  const dates: number[] = [];
  if (item.outreach_date?.toMillis) dates.push(item.outreach_date.toMillis());
  if (item.second_followup_sent_at?.toMillis) dates.push(item.second_followup_sent_at.toMillis());
  if (item.first_followup_sent_at?.toMillis) dates.push(item.first_followup_sent_at.toMillis());
  if (item.first_email_sent_at?.toMillis) dates.push(item.first_email_sent_at.toMillis());
  if (dates.length > 0) return Math.max(...dates);
  if (item.status_changed_at?.toMillis) return item.status_changed_at.toMillis();
  const legacy = (item as any)['Outreach Date'];
  if (legacy && typeof legacy === 'string') {
    const parts = legacy.split('/');
    if (parts.length === 3) {
      const [m, d, y] = parts.map(Number);
      const date = new Date(y, m - 1, d);
      if (!isNaN(date.getTime())) return date.getTime();
    }
    const p = Date.parse(legacy);
    if (!isNaN(p)) return p;
  }
  if (item.created_at?.toMillis) return item.created_at.toMillis();
  return null;
};

const getDaysSince = (item: EnrichedOutreach): number => {
  const d = parseOutreachDate(item);
  if (!d) return 0;
  return Math.floor((Date.now() - d) / 86400000);
};

const isOverdue = (item: EnrichedOutreach): boolean => {
  const waiting = ['1st_email_sent', '1st_followup_sent', '2nd_followup_sent'];
  if (!waiting.includes(item.status)) return false;
  return getDaysSince(item) >= 5;
};

const shouldShowPrepButton = (item: EnrichedOutreach): boolean => {
  if ((item as any).prep_email_sent_at) return false;
  const now = Date.now();
  const five = 5 * 86400000;
  if (item.status === 'screening_scheduled' && item.screening_call_date?.toMillis) {
    const d = (item.screening_call_date.toMillis() - now) / 86400000;
    if (d <= 5 && d >= 0) return true;
  }
  if (item.status === 'recording_scheduled' && item.recording_date?.toMillis) {
    const d = (item.recording_date.toMillis() - now) / 86400000;
    if (d <= 5 && d >= 0) return true;
  }
  return false;
};

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ── OutreachCard ──────────────────────────────────────────────────────────────

interface CardProps {
  item: EnrichedOutreach;
  onStatusChange: (id: string, s: OutreachStatus) => void;
  onAction: (item: EnrichedOutreach, type: EmailActionType) => void;
  onResponse: (item: EnrichedOutreach) => void;
  onPrep: (item: EnrichedOutreach) => void;
  onBlacklist: (item: EnrichedOutreach) => void;
  onDelete: (item: EnrichedOutreach) => void;
  onViewPodcast: (p: PodcastDocument) => void;
}

const OutreachCard: React.FC<CardProps> = ({
  item, onStatusChange, onAction, onResponse, onPrep, onBlacklist, onDelete, onViewPodcast,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copiedReview, setCopiedReview] = useState(false);
  const overdue = isOverdue(item);
  const daysSince = getDaysSince(item);
  const lastDate = parseOutreachDate(item);

  const copyReviewLink = () => {
    const token = (item as any).review_token;
    if (!token) return;
    navigator.clipboard.writeText(`${window.location.origin}/?review=${token}`);
    setCopiedReview(true);
    setTimeout(() => setCopiedReview(false), 2000);
  };

  // Primary action button
  const primaryAction = (() => {
    switch (item.status) {
      case 'identified':           return { label: '✓ Ready', fn: () => onStatusChange(item.id, 'ready_for_outreach'), cls: 'bg-slate-100 text-slate-700 hover:bg-slate-200' };
      case 'ready_for_outreach':   return { label: '↗ Send Pitch', fn: () => onAction(item, 'first_email'), cls: 'bg-green-100 text-green-700 hover:bg-green-200' };
      case '1st_email_sent':       return daysSince >= 5 ? { label: '📧 Follow-up 1', fn: () => onAction(item, 'followup1'), cls: 'bg-blue-100 text-blue-700 hover:bg-blue-200' } : null;
      case '1st_followup_sent':    return daysSince >= 5 ? { label: '📧 Follow-up 2', fn: () => onAction(item, 'followup2'), cls: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' } : null;
      case '2nd_followup_sent':    return { label: '💬 Record Response', fn: () => onResponse(item), cls: 'bg-orange-100 text-orange-700 hover:bg-orange-200' };
      case 'in_contact':           return { label: '📅 Screening', fn: () => onAction(item, 'screening'), cls: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' };
      case 'scheduling_screening': return { label: '✓ Screening Done', fn: () => onStatusChange(item.id, 'screening_scheduled'), cls: 'bg-amber-100 text-amber-700 hover:bg-amber-200' };
      case 'screening_scheduled':  return { label: '📅 Recording', fn: () => onAction(item, 'recording'), cls: 'bg-green-100 text-green-700 hover:bg-green-200' };
      case 'scheduling_recording': return { label: '✓ Recording Scheduled', fn: () => onStatusChange(item.id, 'recording_scheduled'), cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' };
      case 'recording_scheduled':  return { label: '🎙 Mark Recorded', fn: () => onStatusChange(item.id, 'recorded'), cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' };
      case 'recorded':             return { label: '🟢 Mark Live', fn: () => onStatusChange(item.id, 'live'), cls: 'bg-green-100 text-green-700 hover:bg-green-200' };
      default: return null;
    }
  })();

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 relative ${
      overdue ? 'border-red-300' : 'border-slate-200 hover:border-slate-300'
    } transition-shadow hover:shadow-md`}>

      {/* Overdue badge */}
      {overdue && (
        <div className="flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full mb-2 w-fit">
          ⚡ Overdue · {daysSince}d
        </div>
      )}

      {/* Podcast info */}
      <div className="flex gap-2 mb-2">
        {item.podcast?.imageUrl && (
          <img
            src={item.podcast.imageUrl}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 cursor-pointer"
            onClick={() => item.podcast && onViewPodcast(item.podcast as unknown as PodcastDocument)}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 leading-tight line-clamp-2">{item.podcast_name || 'Unknown Podcast'}</p>
          {item.podcast?.ai_badassery_score != null && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-md mt-0.5">
              <Award size={10} />{item.podcast.ai_badassery_score.toFixed(0)}
            </span>
          )}
        </div>
        {/* Menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
          >
            ···
          </button>
          {showMenu && (
            <div className="absolute right-0 top-7 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[160px] overflow-hidden">
              <button onClick={() => { onBlacklist(item); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Ban size={12} /> Blacklist</button>
              <button onClick={() => { onDelete(item); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={12} /> Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Client + Sub-status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
          <User size={10} />{item.client_name || '—'}
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
          {STATUS_LABELS[item.status] || item.status}
        </span>
      </div>

      {/* Email */}
      {item.host_email && (
        <a href={`mailto:${item.host_email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 truncate mb-2">
          <Mail size={10} />{item.host_email}
        </a>
      )}

      {/* Dates */}
      {item.status === 'screening_scheduled' && item.screening_call_date?.toDate && (
        <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 mb-2">
          <Calendar size={10} />Screening: {item.screening_call_date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
      {item.status === 'recording_scheduled' && item.recording_date?.toDate && (
        <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded flex items-center gap-1 mb-2">
          <Calendar size={10} />Recording: {item.recording_date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}

      {/* Last action date */}
      {lastDate && (
        <p className={`text-[10px] mb-2 ${daysSince > 5 ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
          Last action: {formatDate(lastDate)} · {daysSince}d ago
        </p>
      )}

      {/* Status dropdown */}
      <select
        value={item.status}
        onChange={e => onStatusChange(item.id, e.target.value as OutreachStatus)}
        onClick={e => e.stopPropagation()}
        className="w-full text-[10px] px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 mb-2 text-slate-600 bg-white"
      >
        {ALL_STATUSES.map(s => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      {/* Action buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {primaryAction && (
          <button onClick={e => { e.stopPropagation(); primaryAction.fn(); }} className={`flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors ${primaryAction.cls}`}>
            {primaryAction.label}
          </button>
        )}
        {shouldShowPrepButton(item) && (
          <button onClick={e => { e.stopPropagation(); onPrep(item); }} className="flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center gap-1 transition-colors">
            ✉️ Prep
          </button>
        )}
        {item.status === 'recorded' && (item as any).review_token && (
          <button onClick={e => { e.stopPropagation(); copyReviewLink(); }} className="flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center gap-1 transition-colors">
            <Copy size={10} />{copiedReview ? 'Copied!' : 'Review Link'}
          </button>
        )}
        {item.status === 'live' && item.live_episode_url && (
          <a href={item.live_episode_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100 flex items-center justify-center gap-1 transition-colors">
            <ExternalLink size={10} />View Episode
          </a>
        )}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const OutreachPage: React.FC = () => {
  const [allOutreach, setAllOutreach] = useState<EnrichedOutreach[]>([]);
  const [filteredOutreach, setFilteredOutreach] = useState<EnrichedOutreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [showClosed, setShowClosed] = useState(false);
  const [followUpStats, setFollowUpStats] = useState<{ total: number; overdue_5plus_days: number } | null>(null);
  // Compute follow-up stats locally from loaded data
  useEffect(() => {
    const followUpStatuses = ['1st_email_sent', '1st_followup_sent', '2nd_followup_sent'];
    const pending = allOutreach.filter(o => followUpStatuses.includes(o.status));
    const overdue = pending.filter(o => {
      if (!o.outreach_date) return false;
      const lastDate = o.outreach_date.toDate ? o.outreach_date.toDate() : new Date(o.outreach_date);
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
      return daysSince >= 5;
    });
    setFollowUpStats({ total: pending.length, overdue_5plus_days: overdue.length });
  }, [allOutreach]);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [gmailAccessToken, setGmailAccessToken] = useState('');

  // Modals
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [actionModal, setActionModal] = useState<{ isOpen: boolean; outreach: EnrichedOutreach | null; actionType: EmailActionType }>({ isOpen: false, outreach: null, actionType: 'followup1' });
  const [responseModal, setResponseModal] = useState<{ isOpen: boolean; outreach: EnrichedOutreach | null }>({ isOpen: false, outreach: null });
  const [responseText, setResponseText] = useState('');
  const [responseType, setResponseType] = useState<'response' | 'no_response'>('no_response');
  const [selectedPodcastForDetail, setSelectedPodcastForDetail] = useState<PodcastDocument | null>(null);
  const [blacklistModal, setBlacklistModal] = useState<{ isOpen: boolean; outreach: EnrichedOutreach | null }>({ isOpen: false, outreach: null });
  const [prepModal, setPrepModal] = useState<{ item: EnrichedOutreach; client: any } | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  // New outreach modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newModalClients, setNewModalClients] = useState<Client[]>([]);
  const [newClientId, setNewClientId] = useState('');
  const [newPodcastSearch, setNewPodcastSearch] = useState('');
  const [newPodcastResults, setNewPodcastResults] = useState<PodcastDoc[]>([]);
  const [newPodcastSearching, setNewPodcastSearching] = useState(false);
  const [newSelectedPodcast, setNewSelectedPodcast] = useState<PodcastDoc | null>(null);
  const [newHostEmail, setNewHostEmail] = useState('');
  const [newPitchAngle, setNewPitchAngle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadOutreach();
    const ai = getAIConfig();
    setGeminiApiKey(ai.geminiApiKey || '');
    setGmailAccessToken(localStorage.getItem('gmail_access_token') || '');
  }, []);

  useEffect(() => {
    let result = allOutreach;
    if (selectedClient !== 'all') result = result.filter(i => i.client_id === selectedClient);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.podcast_name?.toLowerCase().includes(q) ||
        i.client_name?.toLowerCase().includes(q) ||
        i.host_email?.toLowerCase().includes(q)
      );
    }
    setFilteredOutreach(result);
  }, [allOutreach, selectedClient, searchQuery]);

  const loadOutreach = async () => {
    try {
      setLoading(true);
      const data = await getAllOutreachV2Cached();
      const enriched = await Promise.all(
        data.map(async item => {
          if (item.podcast_itunes_id) {
            try {
              const podcast = await getPodcastForOutreach(item.podcast_itunes_id);
              return { ...item, podcast };
            } catch { return { ...item, podcast: null }; }
          }
          return { ...item, podcast: null };
        })
      );
      setAllOutreach(enriched);
      setClients(Array.from(
        new Map(enriched.map(i => [i.client_id, { id: i.client_id, name: i.client_name || 'Unknown' }])).values()
      ));
    } catch (e) {
      console.error('Error loading outreach:', e);
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = async () => {
    setShowNewModal(true);
    setNewClientId('');
    setNewPodcastSearch('');
    setNewPodcastResults([]);
    setNewSelectedPodcast(null);
    setNewHostEmail('');
    setNewPitchAngle('');
    try {
      const all = await getAllClients();
      setNewModalClients(all.filter(c => c.id));
    } catch {}
  };

  const searchPodcasts = async (q: string) => {
    setNewPodcastSearch(q);
    if (q.trim().length < 2) { setNewPodcastResults([]); return; }
    setNewPodcastSearching(true);
    try {
      const results = await searchPodcastsByTitle(q, 10);
      setNewPodcastResults(results);
    } catch {} finally { setNewPodcastSearching(false); }
  };

  const handleCreateOutreach = async () => {
    if (!newClientId || !newSelectedPodcast) return;
    setCreating(true);
    try {
      const client = newModalClients.find(c => c.id === newClientId);
      const clientName = client?.contact_name ||
        (client?.identity ? `${client.identity.firstName} ${client.identity.lastName}`.trim() : '') ||
        client?.id || '';
      await createOutreachV2({
        client_id: newClientId,
        client_name: clientName,
        podcast_id: String(newSelectedPodcast.itunesId || newSelectedPodcast.id || ''),
        podcast_itunes_id: String(newSelectedPodcast.itunesId || newSelectedPodcast.id || ''),
        podcast_name: newSelectedPodcast.title || '',
        podcast_url: newSelectedPodcast.feedUrl || '',
        host_email: newHostEmail,
        pitch_angle: newPitchAngle,
        status: 'identified',
        email_thread: [],
        notes: [],
        reminders: [],
      });
      invalidateOutreachCache();
      await loadOutreach();
      setShowNewModal(false);
    } catch (e) {
      console.error('Error creating outreach:', e);
    } finally { setCreating(false); }
  };

  const handleStatusChange = async (outreachId: string, newStatus: OutreachStatus) => {
    try {
      await updateOutreachStatusV2(outreachId, newStatus);
      if (newStatus === 'recorded') {
        const item = allOutreach.find(o => o.id === outreachId);
        if (item && !(item as any).review_token) {
          const token = await generateReviewToken({
            id: item.id, client_id: item.client_id, client_name: item.client_name,
            podcast_id: item.podcast_id, podcast_name: item.podcast_name,
          });
          await updateOutreachV2(outreachId, { review_token: token });
        }
      }
      await loadOutreach();
    } catch (e) {
      console.error('Error updating status:', e);
    }
  };

  const openPrepModal = async (item: EnrichedOutreach) => {
    let clientData = item.client || null;
    if (!clientData && item.client_id) {
      try { clientData = await getClientById(item.client_id); } catch {}
    }
    setPrepModal({ item, client: clientData || {} });
  };

  const handleBlacklistConfirm = async (reason: string, notes: string) => {
    if (!blacklistModal.outreach) return;
    try {
      await updateOutreachV2(blacklistModal.outreach.id, {
        status: 'blacklist', blacklist: true,
        blacklist_reason: reason as any, blacklist_notes: notes,
        blacklist_date: Timestamp.now(), blacklist_by: 'current_user',
        status_changed_at: Timestamp.now(),
      });
      invalidateOutreachCache();
      await loadOutreach();
      setBlacklistModal({ isOpen: false, outreach: null });
    } catch (e) {
      console.error('Error blacklisting:', e);
    }
  };

  const handleDeleteOutreach = async (item: EnrichedOutreach) => {
    if (!window.confirm(`Delete "${item.podcast_name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'outreach', item.id));
      invalidateOutreachCache();
      await loadOutreach();
    } catch (e) {
      console.error('Error deleting:', e);
    }
  };

  const handleResponseSubmit = async (newStatus: OutreachStatus) => {
    if (!responseModal.outreach) return;
    await handleStatusChange(responseModal.outreach.id, newStatus);
    setResponseModal({ isOpen: false, outreach: null });
    setResponseText('');
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const snap = await getDocs(collection(db, 'outreach'));
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'outreach', d.id))));
      invalidateOutreachCache();
      setAllOutreach([]);
      setShowClearModal(false);
      setClearConfirmText('');
    } catch (e) { console.error(e); }
    finally { setClearing(false); }
  };

  const getByStage = (statuses: readonly OutreachStatus[]) =>
    filteredOutreach.filter(i => statuses.includes(i.status));

  const closedItems = filteredOutreach.filter(i => CLOSED_STATUSES.includes(i.status));

  const cardProps = (item: EnrichedOutreach): CardProps => ({
    item,
    onStatusChange: handleStatusChange,
    onAction: (o, t) => setActionModal({ isOpen: true, outreach: o, actionType: t }),
    onResponse: o => { setResponseModal({ isOpen: true, outreach: o }); setResponseText(''); setResponseType('no_response'); },
    onPrep: openPrepModal,
    onBlacklist: o => setBlacklistModal({ isOpen: true, outreach: o }),
    onDelete: handleDeleteOutreach,
    onViewPodcast: p => setSelectedPodcastForDetail(p),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading outreach…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">Outreach Pipeline</h1>
            <span className="text-xs text-slate-400 font-medium">{filteredOutreach.length} items</span>
            <button
              onClick={() => { setShowClearModal(true); setClearConfirmText(''); }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 border border-red-200 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Clear all outreach data"
            >
              <Trash2 size={11} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* New outreach */}
            <button
              onClick={openNewModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition-colors shadow-sm"
            >
              <Plus size={15} /> New Outreach
            </button>

            {/* Follow-ups bell */}
            {followUpStats && followUpStats.total > 0 && (
              <button
                onClick={() => setShowFollowUpModal(true)}
                className="relative flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Bell size={15} />
                {followUpStats.total} Follow-up{followUpStats.total !== 1 ? 's' : ''}
                {followUpStats.overdue_5plus_days > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {followUpStats.overdue_5plus_days}
                  </span>
                )}
              </button>
            )}

            {/* View toggle */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors ${viewMode === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <Columns size={13} /> Kanban
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutList size={13} /> Table
              </button>
            </div>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search podcast, client, email…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
            />
          </div>

          {/* Client filter */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select
              value={selectedClient}
              onChange={e => setSelectedClient(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            >
              <option value="all">All clients ({allOutreach.length})</option>
              {clients.map(c => {
                const count = allOutreach.filter(o => o.client_id === c.id).length;
                return <option key={c.id} value={c.id}>{c.name} ({count})</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {/* ── Kanban View ── */}
      {viewMode === 'kanban' && (
        <div className="flex-1 overflow-auto p-6" style={{ minHeight: 0 }}>

          {/* 4 main columns */}
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(4, minmax(280px, 1fr))', alignItems: 'start' }}>
            {STAGES.map(stage => {
              const items = getByStage(stage.statuses);
              return (
                <div key={stage.id} className={`rounded-xl border ${stage.color} overflow-hidden`}>
                  {/* Column header */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{stage.icon}</span>
                      <h3 className="text-sm font-bold text-slate-800">{stage.label}</h3>
                    </div>
                    <span className="w-6 h-6 bg-white rounded-full text-xs font-bold text-slate-700 flex items-center justify-center shadow-sm">
                      {items.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
                    {items.map(item => (
                      <OutreachCard key={item.id} {...cardProps(item)} />
                    ))}
                    {items.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-6 italic">Nothing here</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Closed section (collapsible) */}
          {closedItems.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowClosed(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-3"
              >
                {showClosed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                Closed / Archived ({closedItems.length})
              </button>
              {showClosed && (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(280px, 1fr))' }}>
                  {closedItems.map(item => (
                    <OutreachCard key={item.id} {...cardProps(item)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Table View ── */}
      {viewMode === 'table' && (
        <div className="flex-1 overflow-auto p-6" style={{ minHeight: 0 }}>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Podcast</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Last Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOutreach.map(item => {
                  const lastDate = parseOutreachDate(item);
                  const daysSince = getDaysSince(item);
                  const overdue = isOverdue(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      {/* Podcast */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {item.podcast?.imageUrl && (
                            <img src={item.podcast.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          )}
                          <div>
                            <p className="font-semibold text-slate-900 text-xs leading-tight max-w-[180px] truncate">{item.podcast_name || '—'}</p>
                            {item.podcast?.ai_badassery_score != null && (
                              <span className="text-[10px] text-purple-600 font-bold">{item.podcast.ai_badassery_score.toFixed(0)} pts</span>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Client */}
                      <td className="px-4 py-3 text-xs text-slate-600">{item.client_name || '—'}</td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <select
                          value={item.status}
                          onChange={e => handleStatusChange(item.id, e.target.value as OutreachStatus)}
                          className="text-[10px] px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-600 focus:ring-1 focus:ring-indigo-400"
                        >
                          {ALL_STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3">
                        {item.host_email ? (
                          <a href={`mailto:${item.host_email}`} className="text-[10px] text-indigo-500 hover:text-indigo-700 truncate max-w-[160px] block">{item.host_email}</a>
                        ) : <span className="text-[10px] text-slate-300">—</span>}
                      </td>
                      {/* Last action */}
                      <td className="px-4 py-3">
                        {lastDate ? (
                          <span className={`text-[10px] ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                            {formatDate(lastDate)} · {daysSince}d
                          </span>
                        ) : <span className="text-[10px] text-slate-300">—</span>}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setActionModal({ isOpen: true, outreach: item, actionType: 'followup1' })} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Email action"><Mail size={13} /></button>
                          <button onClick={() => openPrepModal(item)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Prep email"><Send size={13} /></button>
                          <button onClick={() => setBlacklistModal({ isOpen: true, outreach: item })} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Blacklist"><Ban size={13} /></button>
                          <button onClick={() => handleDeleteOutreach(item)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredOutreach.length === 0 && (
              <div className="text-center py-16 text-slate-400 text-sm">No outreach items found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}

      <FollowUpReviewModal
        isOpen={showFollowUpModal}
        onClose={() => setShowFollowUpModal(false)}
        geminiApiKey={geminiApiKey}
        gmailAccessToken={gmailAccessToken}
        onEmailSent={async () => { await loadOutreach(); setShowFollowUpModal(false); }}
      />

      {actionModal.outreach && (
        <OutreachActionModal
          isOpen={actionModal.isOpen}
          onClose={() => setActionModal({ isOpen: false, outreach: null, actionType: 'followup1' })}
          outreach={actionModal.outreach}
          actionType={actionModal.actionType}
          onEmailSent={async () => { await loadOutreach(); setActionModal({ isOpen: false, outreach: null, actionType: 'followup1' }); }}
        />
      )}

      {selectedPodcastForDetail && (
        <PodcastDetailModal
          podcast={selectedPodcastForDetail}
          onClose={() => setSelectedPodcastForDetail(null)}
        />
      )}

      <BlacklistModal
        isOpen={blacklistModal.isOpen}
        podcastName={blacklistModal.outreach?.podcast_name || 'Unknown Podcast'}
        onClose={() => setBlacklistModal({ isOpen: false, outreach: null })}
        onConfirm={handleBlacklistConfirm}
      />

      {/* Response modal */}
      {responseModal.isOpen && responseModal.outreach && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Handle Ticket</h2>
                <p className="text-xs text-slate-500 mt-0.5">{responseModal.outreach.podcast_name}</p>
              </div>
              <button onClick={() => setResponseModal({ isOpen: false, outreach: null })} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-3">
                <button onClick={() => setResponseType('no_response')} className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${responseType === 'no_response' ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <XCircle size={18} className="mx-auto mb-1" />No Response
                </button>
                <button onClick={() => setResponseType('response')} className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${responseType === 'response' ? 'border-green-400 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <CheckCircle2 size={18} className="mx-auto mb-1" />Got Response
                </button>
              </div>
              {responseType === 'response' && (
                <textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={4} placeholder="Paste the host's response…" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 outline-none resize-none" />
              )}
              <div className="grid grid-cols-2 gap-2">
                {responseType === 'no_response' ? (
                  <>
                    <button onClick={() => handleResponseSubmit('no_response')} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold">No Response</button>
                    <button onClick={() => handleResponseSubmit('declined_by_host')} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold">Host Declined</button>
                    <button onClick={() => handleResponseSubmit('email_bounced')} className="px-3 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-xl text-xs font-semibold">Email Bounced</button>
                    <button onClick={() => { setResponseModal({ isOpen: false, outreach: null }); setBlacklistModal({ isOpen: true, outreach: responseModal.outreach }); }} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold">Blacklist</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleResponseSubmit('in_contact')} className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold">In Contact</button>
                    <button onClick={() => handleResponseSubmit('scheduling_screening')} className="px-3 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-xl text-xs font-semibold">Scheduling Screening</button>
                    <button onClick={() => handleResponseSubmit('scheduling_recording')} className="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl text-xs font-semibold">Scheduling Recording</button>
                    <button onClick={() => handleResponseSubmit('declined_by_host')} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold">Host Declined</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-red-600 flex items-center gap-2"><Trash2 size={16} /> Delete All Outreach Data</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">This will permanently delete <strong>all outreach data</strong>. This cannot be undone.</p>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm</label>
                <input autoFocus type="text" value={clearConfirmText} onChange={e => setClearConfirmText(e.target.value)} placeholder="DELETE" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
              <button onClick={() => setShowClearModal(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              <button onClick={handleClearAll} disabled={clearConfirmText !== 'DELETE' || clearing} className="flex-1 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {clearing ? 'Deleting…' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Outreach Modal ── */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">New Outreach</h2>
              <button onClick={() => setShowNewModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">

              {/* Client */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Client <span className="text-red-400">*</span></label>
                <select
                  value={newClientId}
                  onChange={e => setNewClientId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
                >
                  <option value="">Select a client…</option>
                  {newModalClients.map(c => {
                    const name = c.contact_name ||
                      (c.identity ? `${c.identity.firstName} ${c.identity.lastName}`.trim() : '') ||
                      c.id;
                    return <option key={c.id} value={c.id}>{name}</option>;
                  })}
                </select>
              </div>

              {/* Podcast search */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Podcast <span className="text-red-400">*</span></label>
                {newSelectedPodcast ? (
                  <div className="flex items-center gap-3 p-3 border border-emerald-200 bg-emerald-50 rounded-xl">
                    {newSelectedPodcast.imageUrl && <img src={newSelectedPodcast.imageUrl} className="w-10 h-10 rounded-lg object-cover" alt="" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{newSelectedPodcast.title}</p>
                      <p className="text-xs text-slate-500 truncate">{newSelectedPodcast.author}</p>
                    </div>
                    <button onClick={() => { setNewSelectedPodcast(null); setNewPodcastSearch(''); }} className="text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={newPodcastSearch}
                      onChange={e => searchPodcasts(e.target.value)}
                      placeholder="Search podcast by name…"
                      className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                    />
                    {newPodcastSearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
                    {newPodcastResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                        {newPodcastResults.map(p => (
                          <button
                            key={p.itunesId || p.id}
                            onClick={() => { setNewSelectedPodcast(p); setNewPodcastResults([]); setNewHostEmail((p as any).contact_email || ''); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                          >
                            {p.imageUrl && <img src={p.imageUrl} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt="" />}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{p.title}</p>
                              <p className="text-xs text-slate-400 truncate">{p.author}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Host email */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Host Email</label>
                <input
                  type="email"
                  value={newHostEmail}
                  onChange={e => setNewHostEmail(e.target.value)}
                  placeholder="host@podcast.com"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>

              {/* Pitch angle */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pitch angle <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="text"
                  value={newPitchAngle}
                  onChange={e => setNewPitchAngle(e.target.value)}
                  placeholder="e.g. Neil's FDA journey from France…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNewModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button
                  onClick={handleCreateOutreach}
                  disabled={!newClientId || !newSelectedPodcast || creating}
                  className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creating ? <><Loader2 size={14} className="animate-spin" />Creating…</> : 'Add to Pipeline'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prep Email Modal */}
      {prepModal && (() => {
        const { item, client } = prepModal;
        const podcast = item.podcast as any;
        let dateStr = 'TBD';
        if (item.recording_date?.toDate) {
          dateStr = item.recording_date.toDate().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        }
        return (
          <PrepEmailModal
            client={client}
            podcastName={item.podcast_name || podcast?.title || 'Unknown Podcast'}
            podcastDescription={podcast?.description || podcast?.ai_summary || ''}
            podcastUrl={item.podcast_url || podcast?.website_url || ''}
            hostName={(item as any).host_name || ''}
            recordingDateStr={dateStr}
            onClose={() => setPrepModal(null)}
          />
        );
      })()}

    </div>
  );
};
