import React, { useState, useEffect } from 'react';
import {
  getAllOutreachV2,
  getAllOutreachV2Cached,
  getOutreachByClientIdV2,
  updateOutreachStatusV2,
  updateOutreachV2,
  invalidateOutreachCache
} from '../services/outreachServiceV2';
import { getPodcastForOutreach } from '../services/podcastService';
import { getFollowUpStats } from '../services/outreachAutomationService';
import { getAIConfig } from '../services/aiConfigService';
import { Outreach, OutreachStatus, Podcast } from '../types';
import {
  Mail, User, Calendar, Award, ExternalLink,
  Filter, ChevronDown, AlertCircle, CheckCircle2,
  Clock, XCircle, DollarSign, Ban, Send, Bell, Eye, EyeOff,
  MessageSquare, Copy, X, Info
} from 'lucide-react';
import { FollowUpReviewModal } from '../components/FollowUpReviewModal';
import { OutreachActionModal } from '../components/OutreachActionModal';
import { PodcastDetailModal } from '../components/PodcastDetailModal';
import { BlacklistModal } from '../components/BlacklistModal';
import { EmailActionType } from '../services/outreachEmailActionsService';
import { PodcastDocument } from '../services/podcastService';
import { Timestamp } from 'firebase/firestore';

type EnrichedOutreach = Outreach & { podcast?: Podcast | null };

const WORKFLOW_COLUMNS: { status: OutreachStatus; label: string; icon: any; color: string; tooltip?: string }[] = [
  { status: 'identified', label: 'Identified', icon: User, color: 'bg-slate-50 border-slate-200', tooltip: 'Podcast found, not yet validated for outreach' },
  { status: 'ready_for_outreach', label: 'Ready', icon: CheckCircle2, color: 'bg-blue-50 border-blue-200', tooltip: 'Podcast validated, ready to send first pitch email' },
  { status: '1st_email_sent', label: '1st Email', icon: Mail, color: 'bg-purple-50 border-purple-200', tooltip: 'First pitch email has been sent' },
  { status: '1st_followup_sent', label: '1st Follow-up', icon: Mail, color: 'bg-indigo-50 border-indigo-200', tooltip: 'First follow-up email sent' },
  { status: '2nd_followup_sent', label: '2nd Follow-up', icon: Mail, color: 'bg-violet-50 border-violet-200', tooltip: 'Second follow-up email sent' },
  { status: 'no_response', label: 'No Response', icon: XCircle, color: 'bg-gray-100 border-gray-300', tooltip: 'No response after all follow-ups' },
  { status: 'in_contact', label: 'In Contact', icon: Mail, color: 'bg-blue-100 border-blue-300', tooltip: 'Host replied, discussion ongoing before scheduling' },
  { status: 'scheduling_screening', label: 'Sched. Screen', icon: Calendar, color: 'bg-yellow-50 border-yellow-200', tooltip: 'Working on scheduling a screening call' },
  { status: 'screening_scheduled', label: 'Screen Scheduled', icon: Calendar, color: 'bg-amber-50 border-amber-200', tooltip: 'Screening call date confirmed' },
  { status: 'scheduling_recording', label: 'Sched. Recording', icon: Calendar, color: 'bg-orange-50 border-orange-200', tooltip: 'Working on scheduling the recording' },
  { status: 'recording_scheduled', label: 'Rec. Scheduled', icon: Clock, color: 'bg-green-50 border-green-200', tooltip: 'Recording date confirmed' },
  { status: 'recorded', label: 'Recorded', icon: CheckCircle2, color: 'bg-emerald-50 border-emerald-200', tooltip: 'Recording completed, waiting for release' },
  { status: 'live', label: 'Live', icon: CheckCircle2, color: 'bg-green-100 border-green-300', tooltip: 'Episode is published and live!' },
  { status: 'backlog', label: 'Backlog', icon: Clock, color: 'bg-slate-50 border-slate-200', tooltip: 'Saved for later outreach' },
  { status: 'follow_up_1_month', label: 'Follow Up 1 Month', icon: Calendar, color: 'bg-slate-50 border-slate-200', tooltip: 'Will follow up in 1 month' },
  { status: 'declined_by_host', label: 'Declined', icon: XCircle, color: 'bg-red-50 border-red-200', tooltip: 'Host declined the opportunity' },
  { status: 'client_declined', label: 'Client Declined', icon: XCircle, color: 'bg-orange-50 border-orange-200', tooltip: 'Client declined this podcast' },
  { status: 'cancelled', label: 'Cancelled', icon: XCircle, color: 'bg-red-100 border-red-300', tooltip: 'Outreach cancelled' },
  { status: 'email_bounced', label: 'Bounced', icon: AlertCircle, color: 'bg-gray-50 border-gray-200', tooltip: 'Email could not be delivered' },
  { status: 'paid_podcast', label: 'Paid', icon: DollarSign, color: 'bg-pink-50 border-pink-200', tooltip: 'This podcast requires payment' },
  { status: 'fill_form', label: 'Fill Form', icon: AlertCircle, color: 'bg-yellow-100 border-yellow-300', tooltip: 'Needs to fill out a form first' },
  { status: 'blacklist', label: 'Blacklist', icon: Ban, color: 'bg-slate-50 border-slate-300', tooltip: 'Podcast permanently excluded' },
];

export const OutreachKanban: React.FC = () => {
  const [allOutreach, setAllOutreach] = useState<EnrichedOutreach[]>([]);
  const [filteredOutreach, setFilteredOutreach] = useState<EnrichedOutreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpStats, setFollowUpStats] = useState<{
    total: number;
    overdue_5plus_days: number;
    first_followups: number;
    second_followups: number;
  } | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [gmailAccessToken, setGmailAccessToken] = useState<string>('');

  // Action modal state
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    outreach: EnrichedOutreach | null;
    actionType: EmailActionType;
  }>({ isOpen: false, outreach: null, actionType: 'followup1' });

  // Response modal state (for handling overdue tickets)
  const [responseModal, setResponseModal] = useState<{
    isOpen: boolean;
    outreach: EnrichedOutreach | null;
  }>({ isOpen: false, outreach: null });
  const [responseText, setResponseText] = useState('');
  const [responseType, setResponseType] = useState<'response' | 'no_response'>('no_response');

  // Column visibility
  const [showAllColumns, setShowAllColumns] = useState(false);

  // Podcast detail modal state
  const [selectedPodcastForDetail, setSelectedPodcastForDetail] = useState<PodcastDocument | null>(null);

  // Blacklist modal state
  const [blacklistModal, setBlacklistModal] = useState<{
    isOpen: boolean;
    outreach: EnrichedOutreach | null;
  }>({ isOpen: false, outreach: null });

  // Main workflow statuses (always visible)
  const MAIN_WORKFLOW_STATUSES: OutreachStatus[] = [
    'identified',  // Added so "identified" column is always visible
    'ready_for_outreach',
    '1st_email_sent',
    '1st_followup_sent',
    '2nd_followup_sent',
    'in_contact',
    'scheduling_screening',
    'screening_scheduled',
    'scheduling_recording',
    'recording_scheduled',
    'recorded',
    'live'
  ];

  useEffect(() => {
    loadOutreach();
    loadFollowUpStats();
    loadApiKeys();
  }, []);

  useEffect(() => {
    filterOutreach();
  }, [allOutreach, selectedClient]);

  const loadApiKeys = () => {
    const aiConfig = getAIConfig();
    setGeminiApiKey(aiConfig.geminiApiKey || '');

    // Gmail access token would come from Settings/OAuth flow
    // For now, this is a placeholder - will be implemented when user provides credentials
    const gmailToken = localStorage.getItem('gmail_access_token');
    setGmailAccessToken(gmailToken || '');
  };

  const loadFollowUpStats = async () => {
    try {
      const stats = await getFollowUpStats();
      setFollowUpStats(stats);
    } catch (error) {
      console.error('Error loading follow-up stats:', error);
    }
  };

  const loadOutreach = async () => {
    try {
      setLoading(true);
      // Use cached version for faster loading
      const data = await getAllOutreachV2Cached();

      // Enrich with podcast data
      const enriched = await Promise.all(
        data.map(async (item) => {
          if (item.podcast_itunes_id) {
            try {
              const podcast = await getPodcastForOutreach(item.podcast_itunes_id);
              return { ...item, podcast };
            } catch (error) {
              console.error(`Error fetching podcast for ${item.podcast_itunes_id}:`, error);
              return { ...item, podcast: null };
            }
          }
          return { ...item, podcast: null };
        })
      );

      setAllOutreach(enriched);

      // Extract unique clients
      const uniqueClients = Array.from(
        new Map(
          enriched.map(item => [item.client_id, { id: item.client_id, name: item.client_name || 'Unknown Client' }])
        ).values()
      );
      setClients(uniqueClients);
    } catch (error) {
      console.error('Error loading outreach:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOutreach = () => {
    if (selectedClient === 'all') {
      setFilteredOutreach(allOutreach);
    } else {
      setFilteredOutreach(allOutreach.filter(item => item.client_id === selectedClient));
    }
  };

  const handleStatusChange = async (outreachId: string, newStatus: OutreachStatus) => {
    try {
      await updateOutreachStatusV2(outreachId, newStatus);
      await loadOutreach();
    } catch (error) {
      console.error('Error updating outreach status:', error);
    }
  };

  const handleFollowUpEmailSent = async () => {
    // Reload data after email is sent
    await loadOutreach();
    await loadFollowUpStats();
  };

  // Open action modal for a specific outreach item
  const openActionModal = (outreach: EnrichedOutreach, actionType: EmailActionType) => {
    setActionModal({
      isOpen: true,
      outreach,
      actionType
    });
  };

  // Close action modal
  const closeActionModal = () => {
    setActionModal({ isOpen: false, outreach: null, actionType: 'followup1' });
  };

  // Handle action modal completion
  const handleActionEmailSent = async () => {
    await loadOutreach();
    await loadFollowUpStats();
    closeActionModal();
  };

  // Handle blacklist confirmation
  const handleBlacklistConfirm = async (reason: string, notes: string) => {
    if (!blacklistModal.outreach) return;

    try {
      await updateOutreachV2(blacklistModal.outreach.id, {
        status: 'blacklist',
        blacklist: true,
        blacklist_reason: reason as any,
        blacklist_notes: notes,
        blacklist_date: Timestamp.now(),
        blacklist_by: 'current_user', // TODO: Get actual user ID
        status_changed_at: Timestamp.now(),
      });
      invalidateOutreachCache();
      await loadOutreach();
      setBlacklistModal({ isOpen: false, outreach: null });
    } catch (error) {
      console.error('Error blacklisting podcast:', error);
    }
  };

  const getItemsForColumn = (status: OutreachStatus): EnrichedOutreach[] => {
    return filteredOutreach.filter(item => item.status === status);
  };

  // Parse date from various formats (Firestore Timestamp, Date string, etc.)
  // Returns the MOST RECENT email action date (outreach_date)
  const parseOutreachDate = (item: EnrichedOutreach): number | null => {
    // Collect all possible dates and find the most recent one
    const dates: number[] = [];

    // Check outreach_date first (this should be the canonical "last email sent" date)
    if (item.outreach_date?.toMillis) dates.push(item.outreach_date.toMillis());

    // Also check individual email timestamps
    if (item.second_followup_sent_at?.toMillis) dates.push(item.second_followup_sent_at.toMillis());
    if (item.first_followup_sent_at?.toMillis) dates.push(item.first_followup_sent_at.toMillis());
    if (item.first_email_sent_at?.toMillis) dates.push(item.first_email_sent_at.toMillis());

    // If we have any dates, return the most recent one
    if (dates.length > 0) {
      return Math.max(...dates);
    }

    // Fallback to status_changed_at
    if (item.status_changed_at?.toMillis) return item.status_changed_at.toMillis();

    // Fallback to legacy "Outreach Date" field (string format like "01/15/2026")
    const legacyDate = (item as any)['Outreach Date'];
    if (legacyDate && typeof legacyDate === 'string') {
      // Parse MM/DD/YYYY format
      const parts = legacyDate.split('/');
      if (parts.length === 3) {
        const [month, day, year] = parts.map(Number);
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
      // Try direct Date parse
      const parsed = Date.parse(legacyDate);
      if (!isNaN(parsed)) return parsed;
    }

    // Fallback to created_at
    if (item.created_at?.toMillis) return item.created_at.toMillis();

    return null;
  };

  // Check if outreach is overdue (5+ days since last action without response)
  const isOverdue = (item: EnrichedOutreach): boolean => {
    // Only check for statuses that are waiting for response
    const waitingStatuses = ['1st_email_sent', '1st_followup_sent', '2nd_followup_sent'];
    if (!waitingStatuses.includes(item.status)) return false;

    const lastDate = parseOutreachDate(item);
    if (!lastDate) return false;

    const now = Date.now();
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    return (now - lastDate) > fiveDaysMs;
  };

  // Get days since last action
  const getDaysSinceLastAction = (item: EnrichedOutreach): number => {
    const lastDate = parseOutreachDate(item);
    if (!lastDate) return 0;

    const now = Date.now();
    return Math.floor((now - lastDate) / (24 * 60 * 60 * 1000));
  };

  // Open response modal for overdue handling
  const openResponseModal = (outreach: EnrichedOutreach) => {
    setResponseModal({ isOpen: true, outreach });
    setResponseText('');
    setResponseType('no_response');
  };

  // Handle response submission
  const handleResponseSubmit = async (newStatus: OutreachStatus) => {
    if (!responseModal.outreach) return;

    try {
      // Update outreach with response info
      const updates: Partial<Outreach> = {
        status: newStatus,
        status_changed_at: { toMillis: () => Date.now() } as any,
      };

      if (responseType === 'response' && responseText) {
        // Add response to email thread
        const newEmail = {
          id: `inbound_${Date.now()}`,
          direction: 'inbound' as const,
          type: 'host_reply' as const,
          from: responseModal.outreach.host_email || 'unknown',
          to: 'ruth@badassery.co',
          subject: 'Re: ' + (responseModal.outreach.first_email_subject || 'Podcast Pitch'),
          body: responseText,
          sent_at: { toMillis: () => Date.now() } as any,
        };

        updates.email_thread = [
          ...(responseModal.outreach.email_thread || []),
          newEmail
        ];
        updates.email_stats = {
          ...responseModal.outreach.email_stats,
          total_received: (responseModal.outreach.email_stats?.total_received || 0) + 1,
          awaiting_reply: false,
          last_email_at: { toMillis: () => Date.now() } as any,
        };
      }

      await handleStatusChange(responseModal.outreach.id, newStatus);
      setResponseModal({ isOpen: false, outreach: null });
      setResponseText('');
    } catch (error) {
      console.error('Error updating response:', error);
    }
  };

  // Get visible columns based on toggle
  const getVisibleColumns = () => {
    if (showAllColumns) {
      return WORKFLOW_COLUMNS;
    }
    return WORKFLOW_COLUMNS.filter(col => {
      const items = getItemsForColumn(col.status);
      return MAIN_WORKFLOW_STATUSES.includes(col.status) || items.length > 0;
    });
  };

  // Action indicator types for visual badges
  type ActionIndicator = {
    type: 'validate' | 'followup1' | 'followup2' | 'no_response' | 'prep' | 'ready';
    label: string;
    color: 'blue' | 'orange' | 'red' | 'purple' | 'green';
  };

  // Determine if a card requires an action (for visual indicator)
  const getActionRequired = (item: EnrichedOutreach): ActionIndicator | null => {
    const daysSince = getDaysSinceLastAction(item);

    // Identified - needs validation
    if (item.status === 'identified') {
      return { type: 'validate', label: 'To Validate', color: 'blue' };
    }

    // Ready for outreach - needs first email
    if (item.status === 'ready_for_outreach') {
      return { type: 'ready', label: 'Send Pitch', color: 'green' };
    }

    // Follow-up 1 needed (5+ days since 1st email)
    if (item.status === '1st_email_sent' && daysSince >= 5) {
      return { type: 'followup1', label: 'Follow-up 1', color: 'orange' };
    }

    // Follow-up 2 needed (5+ days since 1st follow-up)
    if (item.status === '1st_followup_sent' && daysSince >= 5) {
      return { type: 'followup2', label: 'Follow-up 2', color: 'orange' };
    }

    // No response candidate (7+ days since 2nd follow-up)
    if (item.status === '2nd_followup_sent' && daysSince >= 7) {
      return { type: 'no_response', label: 'No Response?', color: 'red' };
    }

    // Prep email needed (5 days before screening/recording)
    if (shouldShowPrepButton(item)) {
      return { type: 'prep', label: 'Send Prep', color: 'purple' };
    }

    return null;
  };

  // Check if we should show the Prep Email button (5 days before screening/recording)
  const shouldShowPrepButton = (item: EnrichedOutreach): boolean => {
    // Already sent prep email?
    if (item.prep_email_sent_at) return false;

    const now = Date.now();
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

    // Check screening date (for screening_scheduled status)
    if (item.status === 'screening_scheduled' && item.screening_call_date?.toMillis) {
      const screeningTime = item.screening_call_date.toMillis();
      const daysUntil = (screeningTime - now) / (24 * 60 * 60 * 1000);
      if (daysUntil <= 5 && daysUntil >= 0) return true;
    }

    // Check recording date (for recording_scheduled status)
    if (item.status === 'recording_scheduled' && item.recording_date?.toMillis) {
      const recordingTime = item.recording_date.toMillis();
      const daysUntil = (recordingTime - now) / (24 * 60 * 60 * 1000);
      if (daysUntil <= 5 && daysUntil >= 0) return true;
    }

    return false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading outreach data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 h-screen flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Outreach Pipeline</h1>

          {/* Follow-up Stats Widget */}
          {followUpStats && followUpStats.total > 0 && (
            <button
              onClick={() => setShowFollowUpModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-3"
            >
              <div className="flex items-center gap-2">
                <Bell size={20} />
                <div className="text-left">
                  <div className="text-sm font-bold">
                    {followUpStats.total} Follow-up{followUpStats.total !== 1 ? 's' : ''} Ready
                  </div>
                  {followUpStats.overdue_5plus_days > 0 && (
                    <div className="text-xs opacity-90">
                      {followUpStats.overdue_5plus_days} overdue 5+ days
                    </div>
                  )}
                </div>
              </div>
              <Send size={18} />
            </button>
          )}
        </div>

        {/* Filters Row */}
        <div className="flex items-center justify-between">
          {/* Client Filter */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter size={20} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filter by Client:</span>
            </div>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Clients ({allOutreach.length})</option>
              {clients.map(client => {
                const count = allOutreach.filter(o => o.client_id === client.id).length;
              return (
                <option key={client.id} value={client.id}>
                  {client.name} ({count})
                </option>
              );
            })}
            </select>
          </div>

          {/* Show All Columns Toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
            <input
              type="checkbox"
              checked={showAllColumns}
              onChange={(e) => setShowAllColumns(e.target.checked)}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            {showAllColumns ? (
              <span className="flex items-center gap-1"><Eye size={16} /> Show all columns</span>
            ) : (
              <span className="flex items-center gap-1"><EyeOff size={16} /> Main workflow only</span>
            )}
          </label>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full pb-4" style={{ minWidth: 'max-content' }}>
          {getVisibleColumns().map(column => {
            const items = getItemsForColumn(column.status);
            const IconComponent = column.icon;

            return (
              <div
                key={column.status}
                className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm"
                style={{ width: '320px', minWidth: '320px' }}
              >
                {/* Column Header */}
                <div className={`p-4 border-b ${column.color} rounded-t-lg`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconComponent size={18} className="text-gray-700" />
                      <h3 className="font-bold text-gray-900">{column.label}</h3>
                      {column.tooltip && (
                        <div className="group relative">
                          <Info size={14} className="text-gray-400 cursor-help" />
                          <div className="absolute left-0 top-6 z-50 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                            {column.tooltip}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="px-2 py-1 bg-white text-gray-700 rounded-full text-xs font-bold">
                      {items.length}
                    </span>
                  </div>
                </div>

                {/* Column Items */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {items.map(item => {
                    const overdue = isOverdue(item);
                    const daysSince = getDaysSinceLastAction(item);

                    return (
                      <div
                        key={item.id}
                        onClick={() => item.podcast && setSelectedPodcastForDetail(item.podcast as unknown as PodcastDocument)}
                        className={`bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                          overdue ? 'border-red-300 bg-red-50/30' :
                          (() => {
                            const action = getActionRequired(item);
                            if (!action) return 'border-gray-200 hover:border-indigo-300';
                            const borderClasses = {
                              blue: 'border-blue-300',
                              orange: 'border-orange-300',
                              red: 'border-red-300',
                              purple: 'border-purple-300',
                              green: 'border-green-300'
                            };
                            return borderClasses[action.color];
                          })()
                        }`}
                      >
                        {/* Action Required Badge */}
                        {(() => {
                          const action = getActionRequired(item);
                          if (!action) return null;

                          const colorClasses = {
                            blue: 'bg-blue-100 text-blue-700',
                            orange: 'bg-orange-100 text-orange-700',
                            red: 'bg-red-100 text-red-700',
                            purple: 'bg-purple-100 text-purple-700',
                            green: 'bg-green-100 text-green-700'
                          };

                          return (
                            <div className={`flex items-center gap-2 mb-2 px-2 py-1 ${colorClasses[action.color]} rounded-md text-xs font-medium`}>
                              <span className="text-sm">⚡</span>
                              <span>{action.label}</span>
                              {action.type !== 'validate' && action.type !== 'ready' && action.type !== 'prep' && daysSince > 0 && (
                                <span className="opacity-75">({daysSince} days)</span>
                              )}
                            </div>
                          );
                        })()}

                        {/* Podcast Info */}
                        <div className="flex gap-3 mb-3">
                          {item.podcast?.imageUrl && (
                            <img
                              src={item.podcast.imageUrl}
                              alt={item.podcast_name || 'Podcast'}
                              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-900 text-sm line-clamp-2 mb-1">
                              {item.podcast_name || 'Unknown Podcast'}
                            </h4>
                            {item.podcast?.ai_badassery_score && (
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-md w-fit">
                                <Award size={12} className="text-purple-600" />
                                <span className="text-xs font-bold text-purple-700">
                                  {item.podcast.ai_badassery_score.toFixed(1)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Client Name */}
                        <div className="flex items-center gap-2 mb-2 text-xs text-gray-600">
                          <User size={12} />
                          <span className="font-medium">{item.client_name || 'Unknown Client'}</span>
                        </div>

                        {/* Host Email */}
                        {item.host_email && (
                          <div className="flex items-start gap-2 mb-3">
                            <Mail size={12} className="text-gray-400 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <a
                                href={`mailto:${item.host_email}`}
                                className="text-xs text-indigo-600 hover:text-indigo-800 truncate block"
                              >
                                {item.host_email}
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Email Stats */}
                        {item.email_stats && (item.email_stats.total_sent > 0 || item.email_stats.total_received > 0) && (
                          <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-500">
                            <span>📤 {item.email_stats.total_sent} sent</span>
                            <span>📥 {item.email_stats.total_received} received</span>
                            {item.email_stats.awaiting_reply && (
                              <span className="text-yellow-600 font-medium">⏳ Awaiting reply</span>
                            )}
                          </div>
                        )}

                        {/* Status Dropdown */}
                        <select
                          value={item.status || 'ready_for_outreach'}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as OutreachStatus)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          {WORKFLOW_COLUMNS.map(col => (
                            <option key={col.status} value={col.status}>
                              {col.label}
                            </option>
                          ))}
                        </select>

                        {/* Screening/Recording Date Display */}
                        {item.status === 'screening_scheduled' && item.screening_call_date?.toDate && (
                          <div className="mt-2 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded flex items-center gap-1">
                            <Calendar size={12} />
                            Screening: {item.screening_call_date.toDate().toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                        {item.status === 'recording_scheduled' && item.recording_date?.toDate && (
                          <div className="mt-2 text-xs text-green-700 bg-green-50 px-2 py-1 rounded flex items-center gap-1">
                            <Calendar size={12} />
                            Recording: {item.recording_date.toDate().toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}

                        {/* Podcast Link - Apple Podcasts preferred */}
                        {(item.podcast?.itunesId || item.podcast_itunes_id || item.podcast_url) && (
                          <a
                            href={
                              item.podcast?.itunesId
                                ? `https://podcasts.apple.com/podcast/id${item.podcast.itunesId}`
                                : item.podcast_itunes_id
                                  ? `https://podcasts.apple.com/podcast/id${item.podcast_itunes_id}`
                                  : item.podcast_url
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-2"
                          >
                            <ExternalLink size={12} />
                            Apple Podcasts
                          </a>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                          {/* Approve for Outreach - visible if identified */}
                          {item.status === 'identified' && (
                            <button
                              onClick={() => handleStatusChange(item.id, 'ready_for_outreach')}
                              className="flex-1 px-2 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded hover:bg-green-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <CheckCircle2 size={12} />
                              Ready for Outreach
                            </button>
                          )}

                          {/* Send Pitch - visible if ready_for_outreach */}
                          {item.status === 'ready_for_outreach' && (
                            <button
                              onClick={() => openActionModal(item, 'first_email')}
                              className="flex-1 px-2 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded hover:bg-green-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Send size={12} />
                              Send Pitch
                            </button>
                          )}

                          {/* Follow Up 1 - visible if 1st_email_sent */}
                          {item.status === '1st_email_sent' && (
                            <button
                              onClick={() => openActionModal(item, 'followup1')}
                              className="flex-1 px-2 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded hover:bg-indigo-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Mail size={12} />
                              Follow Up 1
                            </button>
                          )}

                          {/* Follow Up 2 - visible if 1st_followup_sent */}
                          {item.status === '1st_followup_sent' && (
                            <button
                              onClick={() => openActionModal(item, 'followup2')}
                              className="flex-1 px-2 py-1.5 bg-violet-50 text-violet-600 text-xs font-medium rounded hover:bg-violet-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Mail size={12} />
                              Follow Up 2
                            </button>
                          )}

                          {/* Record Response - visible if 2nd_followup_sent (end of email sequence) */}
                          {item.status === '2nd_followup_sent' && (
                            <button
                              onClick={() => openResponseModal(item)}
                              className="flex-1 px-2 py-1.5 bg-orange-50 text-orange-600 text-xs font-medium rounded hover:bg-orange-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <MessageSquare size={12} />
                              Record Response
                            </button>
                          )}

                          {/* Screening - visible if in_contact */}
                          {item.status === 'in_contact' && (
                            <button
                              onClick={() => openActionModal(item, 'screening')}
                              className="flex-1 px-2 py-1.5 bg-yellow-50 text-yellow-700 text-xs font-medium rounded hover:bg-yellow-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Calendar size={12} />
                              Screening
                            </button>
                          )}

                          {/* Recording Email - visible if screening_scheduled (to schedule recording) */}
                          {item.status === 'screening_scheduled' && (
                            <button
                              onClick={() => openActionModal(item, 'recording')}
                              className="flex-1 px-2 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded hover:bg-green-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Calendar size={12} />
                              Recording
                            </button>
                          )}

                          {/* Mark as Screening Scheduled - visible if scheduling_screening */}
                          {item.status === 'scheduling_screening' && (
                            <button
                              onClick={() => handleStatusChange(item.id, 'screening_scheduled')}
                              className="flex-1 px-2 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded hover:bg-amber-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <CheckCircle2 size={12} />
                              Screening Done
                            </button>
                          )}

                          {/* Mark as Recording Scheduled - visible if scheduling_recording */}
                          {item.status === 'scheduling_recording' && (
                            <button
                              onClick={() => handleStatusChange(item.id, 'recording_scheduled')}
                              className="flex-1 px-2 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded hover:bg-green-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <CheckCircle2 size={12} />
                              Rec. Scheduled
                            </button>
                          )}

                          {/* Mark as Recorded - visible if recording_scheduled */}
                          {item.status === 'recording_scheduled' && (
                            <button
                              onClick={() => handleStatusChange(item.id, 'recorded')}
                              className="flex-1 px-2 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded hover:bg-emerald-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <CheckCircle2 size={12} />
                              Recorded
                            </button>
                          )}

                          {/* Mark as Live - visible if recorded */}
                          {item.status === 'recorded' && (
                            <button
                              onClick={() => handleStatusChange(item.id, 'live')}
                              className="flex-1 px-2 py-1.5 bg-green-100 text-green-800 text-xs font-medium rounded hover:bg-green-200 flex items-center justify-center gap-1 transition-colors"
                            >
                              <CheckCircle2 size={12} />
                              Mark Live
                            </button>
                          )}

                          {/* Send Prep Email - visible 5 days before screening/recording */}
                          {shouldShowPrepButton(item) && (
                            <button
                              onClick={() => openActionModal(item, 'prep')}
                              className="flex-1 px-2 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded hover:bg-blue-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Mail size={12} />
                              Send Prep
                            </button>
                          )}

                          {/* Overdue Actions - visible when overdue */}
                          {overdue && (
                            <button
                              onClick={() => openResponseModal(item)}
                              className="flex-1 px-2 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded hover:bg-red-100 flex items-center justify-center gap-1 transition-colors"
                            >
                              <MessageSquare size={12} />
                              Record Response
                            </button>
                          )}
                        </div>

                        {/* Dates */}
                        <div className="text-[10px] text-gray-400 mt-2 space-y-0.5">
                          {/* Outreach Date (last email sent) */}
                          {(() => {
                            const lastActionDate = parseOutreachDate(item);
                            const legacyDate = (item as any)['Outreach Date'];
                            // Determine if this is an email date (from email_sent_at fields)
                            const hasEmailDate = item.outreach_date?.toMillis ||
                              item.second_followup_sent_at?.toMillis ||
                              item.first_followup_sent_at?.toMillis ||
                              item.first_email_sent_at?.toMillis;

                            if (lastActionDate || legacyDate) {
                              const displayDate = lastActionDate
                                ? new Date(lastActionDate).toLocaleDateString()
                                : legacyDate;
                              const label = hasEmailDate ? 'Last email' : 'Last action';
                              return (
                                <div className={daysSince > 5 ? 'text-red-500 font-medium' : ''}>
                                  {label}: {displayDate} ({daysSince} days ago)
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {/* Created date fallback */}
                          {item.created_at && !parseOutreachDate(item) && (
                            <div>
                              Created {new Date(item.created_at.toMillis()).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {items.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No items
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Follow-up Review Modal */}
      <FollowUpReviewModal
        isOpen={showFollowUpModal}
        onClose={() => setShowFollowUpModal(false)}
        geminiApiKey={geminiApiKey}
        gmailAccessToken={gmailAccessToken}
        onEmailSent={handleFollowUpEmailSent}
      />

      {/* Outreach Action Modal */}
      {actionModal.outreach && (
        <OutreachActionModal
          isOpen={actionModal.isOpen}
          onClose={closeActionModal}
          outreach={actionModal.outreach}
          actionType={actionModal.actionType}
          onEmailSent={handleActionEmailSent}
        />
      )}

      {/* Response Handling Modal */}
      {responseModal.isOpen && responseModal.outreach && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-red-50 to-orange-50">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Handle Overdue Ticket</h2>
                <p className="text-sm text-gray-600">{responseModal.outreach.podcast_name}</p>
              </div>
              <button
                onClick={() => setResponseModal({ isOpen: false, outreach: null })}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Response Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What happened?
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setResponseType('no_response')}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      responseType === 'no_response'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <XCircle className="w-5 h-5 mx-auto mb-1" />
                    <div className="text-sm font-medium">No Response</div>
                  </button>
                  <button
                    onClick={() => setResponseType('response')}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      responseType === 'response'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
                    <div className="text-sm font-medium">Got Response</div>
                  </button>
                </div>
              </div>

              {/* Response Text (if got response) */}
              {responseType === 'response' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paste the response here
                  </label>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Paste the host's response..."
                  />
                </div>
              )}

              {/* Status Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Move to status:
                </label>
                {responseType === 'no_response' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleResponseSubmit('no_response')}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      No Response
                    </button>
                    <button
                      onClick={() => handleResponseSubmit('declined_by_host')}
                      className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Host Declined
                    </button>
                    <button
                      onClick={() => handleResponseSubmit('email_bounced')}
                      className="px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Email Bounced
                    </button>
                    <button
                      onClick={() => {
                        setResponseModal({ isOpen: false, outreach: null });
                        setBlacklistModal({ isOpen: true, outreach: responseModal.outreach });
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Blacklist
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleResponseSubmit('in_contact')}
                      className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      In Contact
                    </button>
                    <button
                      onClick={() => handleResponseSubmit('scheduling_screening')}
                      className="px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Scheduling Screening
                    </button>
                    <button
                      onClick={() => handleResponseSubmit('scheduling_recording')}
                      className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Scheduling Recording
                    </button>
                    <button
                      onClick={() => handleResponseSubmit('declined_by_host')}
                      className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Host Declined
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Podcast Detail Modal */}
      {selectedPodcastForDetail && (
        <PodcastDetailModal
          podcast={selectedPodcastForDetail}
          onClose={() => setSelectedPodcastForDetail(null)}
        />
      )}

      {/* Blacklist Modal */}
      <BlacklistModal
        isOpen={blacklistModal.isOpen}
        podcastName={blacklistModal.outreach?.podcast_name || 'Unknown Podcast'}
        onClose={() => setBlacklistModal({ isOpen: false, outreach: null })}
        onConfirm={handleBlacklistConfirm}
      />
    </div>
  );
};
