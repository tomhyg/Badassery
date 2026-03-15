/**
 * PodcastDetailModal - Enhanced podcast detail view with email sources, social links, and actions
 */

import React, { useState, useEffect } from 'react';
import {
  X, Mail, Globe, Youtube, Instagram, Twitter, Linkedin,
  ExternalLink, Copy, Send, CheckCircle, Star, Users, TrendingUp,
  Calendar, Clock, BarChart3, Sparkles, ChevronDown, Play, Headphones,
  LogIn, Loader2, Wand2, Edit3, AlertCircle
} from 'lucide-react';
import {
  PodcastDocument,
  getPodcastEmails,
  getPodcastSocialLinks,
  PodcastEmailCandidate,
  getRSSEpisodes
} from '../services/podcastService';
import {
  fetchEpisodes,
  formatPIDuration,
  formatPIDate,
  PIEpisode,
} from '../services/podcastIndexService';
import { Badge } from './Badge';
import { getAllClients, Client, getClientById } from '../services/clientService';
import { addToWishlist, getWishlistItem } from '../services/wishlistService';
import { getCurrentUser, simpleLogin, isLoggedIn } from '../services/userService';
import { createOutreachV2, getAllOutreachV2 } from '../services/outreachServiceV2';
import { generatePitch, generateSubjectLine } from '../services/pitchService';
import { openGmailCompose, copyEmailToClipboard, sendEmailViaCloudFunction } from '../services/emailService';
import { Outreach, getClientDisplayData } from '../types';
import { Timestamp } from 'firebase/firestore';

interface PodcastDetailModalProps {
  podcast: PodcastDocument;
  onClose: () => void;
  onAddToClient?: (podcastId: string, clientId: string) => void;
  onStartOutreach?: (outreachId: string) => void;
}

export const PodcastDetailModal: React.FC<PodcastDetailModalProps> = ({
  podcast,
  onClose,
  onAddToClient,
  onStartOutreach
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'episodes' | 'guests' | 'outreach' | 'activity'>('overview');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Client dropdown state
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [addingToWishlist, setAddingToWishlist] = useState(false);
  const [selectedClientForOutreach, setSelectedClientForOutreach] = useState<Client | null>(null);
  const [creatingOutreach, setCreatingOutreach] = useState(false);

  // Outreach history state
  const [outreachHistory, setOutreachHistory] = useState<Outreach[]>([]);
  const [loadingOutreachHistory, setLoadingOutreachHistory] = useState(false);

  // Login state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentUser, setCurrentUserState] = useState(getCurrentUser());

  // Pitch generation state
  const [showPitchModal, setShowPitchModal] = useState(false);
  const [generatingPitch, setGeneratingPitch] = useState(false);
  const [generatedPitch, setGeneratedPitch] = useState('');
  const [editedPitch, setEditedPitch] = useState('');
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [pitchError, setPitchError] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Live episodes state
  const [liveEpisodes, setLiveEpisodes] = useState<PIEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set());

  const emails = getPodcastEmails(podcast);
  const socialLinks = getPodcastSocialLinks(podcast);

  // Load clients when dropdown opens
  useEffect(() => {
    if (showClientDropdown && clients.length === 0) {
      loadClients();
    }
  }, [showClientDropdown]);

  // Load outreach history when tab is opened
  useEffect(() => {
    if (activeTab === 'outreach' && outreachHistory.length === 0) {
      loadOutreachHistory();
    }
  }, [activeTab]);

  // Fetch live episodes from PodcastIndex when episodes tab is opened
  useEffect(() => {
    if (activeTab !== 'episodes') return;
    if (liveEpisodes.length > 0 || episodesLoading) return; // already loaded
    setEpisodesLoading(true);
    setEpisodesError(null);
    fetchEpisodes({ itunesId: podcast.itunesId, id: podcast.id })
      .then(eps => setLiveEpisodes(eps))
      .catch(err => setEpisodesError(err.message ?? 'Failed to load episodes'))
      .finally(() => setEpisodesLoading(false));
  }, [activeTab]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showClientDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.client-dropdown-container')) {
        setShowClientDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showClientDropdown]);

  const loadClients = async () => {
    setLoadingClients(true);
    try {
      const allClients = await getAllClients();
      setClients(allClients);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoadingClients(false);
    }
  };

  const loadOutreachHistory = async () => {
    setLoadingOutreachHistory(true);
    try {
      const allOutreach = await getAllOutreachV2();
      // Filter by podcast iTunes ID
      const filtered = allOutreach.filter(
        o => o.podcast_itunes_id === podcast.itunesId || o.podcast_id === podcast.itunesId
      );
      setOutreachHistory(filtered);
    } catch (error) {
      console.error('Error loading outreach history:', error);
    } finally {
      setLoadingOutreachHistory(false);
    }
  };

  const handleAddToClient = async (client: Client) => {
    setAddingToWishlist(true);
    try {
      const user = getCurrentUser();
      if (!user) {
        alert('Please login first');
        return;
      }

      // Check if already in wishlist
      const existing = await getWishlistItem(client.id, podcast.itunesId);
      if (existing) {
        alert(`Already in wishlist for ${client.identity.firstName} ${client.identity.lastName}`);
        setAddingToWishlist(false);
        return;
      }

      // Add to wishlist
      await addToWishlist(
        client.id,
        podcast.itunesId,
        user.id,
        'medium'
      );

      alert(`✅ Added to wishlist for ${client.identity.firstName} ${client.identity.lastName}!`);
      setSelectedClientForOutreach(client); // Set as selected for outreach
      setShowClientDropdown(false);
    } catch (error: any) {
      console.error('Error adding to wishlist:', error);
      alert(`Failed to add to wishlist: ${error.message}`);
    } finally {
      setAddingToWishlist(false);
    }
  };

  const handleStartOutreach = async () => {
    if (!selectedClientForOutreach) {
      alert('Please select a client first by using "Add to Client" button');
      return;
    }

    setCreatingOutreach(true);
    try {
      const user = getCurrentUser();
      if (!user) {
        alert('Please login first');
        return;
      }

      // Get first available email
      const primaryEmail = emails.length > 0 ? emails[0].email : null;

      // Create outreach
      const outreachId = await createOutreachV2({
        client_id: selectedClientForOutreach.id,
        client_name: `${selectedClientForOutreach.identity.firstName} ${selectedClientForOutreach.identity.lastName}`,
        podcast_id: podcast.itunesId || '',
        podcast_itunes_id: podcast.itunesId,
        podcast_name: podcast.title,
        podcast_url: podcast.apple_api_url,
        host_email: primaryEmail,
        status: 'identified',
        status_category: 'discovery',
        email_thread: [],
        notes: [],
        reminders: [],
        email_stats: {
          total_sent: 0,
          total_received: 0,
          awaiting_reply: false
        }
      });

      alert(`✅ Outreach created successfully for ${selectedClientForOutreach.identity.firstName}!`);

      // Call callback if provided
      if (onStartOutreach) {
        onStartOutreach(outreachId);
      }

      onClose();
    } catch (error: any) {
      console.error('Error creating outreach:', error);
      alert(`Failed to create outreach: ${error.message}`);
    } finally {
      setCreatingOutreach(false);
    }
  };

  // Copy email to clipboard
  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // Copy podcast link to clipboard
  const handleCopyLink = () => {
    const link = podcast.apple_api_url || podcast.website || podcast.url;
    if (link) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // LOGIN HANDLERS
  // ═══════════════════════════════════════════════════════════════

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const result = await simpleLogin(loginUsername, loginPassword);
      if (result.success && result.user) {
        setCurrentUserState(result.user);
        setShowLoginModal(false);
        setLoginUsername('');
        setLoginPassword('');
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch (error: any) {
      setLoginError(error.message || 'Login error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // PITCH GENERATION & OUTREACH FLOW
  // ═══════════════════════════════════════════════════════════════

  const handleStartOutreachWithPitch = async () => {
    // Check if logged in
    if (!currentUser) {
      setShowLoginModal(true);
      return;
    }

    // Check if client is selected
    if (!selectedClientForOutreach) {
      alert('Please select a client first using "Add to Client" button');
      return;
    }

    // Open pitch modal and generate pitch
    setShowPitchModal(true);
    setGeneratingPitch(true);
    setPitchError('');
    setGeneratedPitch('');
    setEditedPitch('');

    try {
      // Generate pitch with AI
      const [pitchResult, subjectLine] = await Promise.all([
        generatePitch(podcast, selectedClientForOutreach),
        generateSubjectLine(podcast, selectedClientForOutreach)
      ]);

      if (pitchResult.success) {
        setGeneratedPitch(pitchResult.pitch);
        setEditedPitch(pitchResult.pitch);
        setGeneratedSubject(subjectLine);
        setEditedSubject(subjectLine);
      } else {
        setPitchError(pitchResult.error || 'Failed to generate pitch');
      }
    } catch (error: any) {
      setPitchError(error.message || 'Error generating pitch');
    } finally {
      setGeneratingPitch(false);
    }
  };

  const handleSendFirstEmail = async () => {
    if (!selectedClientForOutreach || !currentUser) return;

    setSendingEmail(true);

    try {
      const primaryEmail = emails.length > 0 ? emails[0].email : null;
      const clientData = getClientDisplayData(selectedClientForOutreach);

      // Create outreach with all tracking fields
      const outreachId = await createOutreachV2({
        client_id: selectedClientForOutreach.id || '',
        client_name: clientData.contact_name,
        podcast_id: podcast.itunesId || '',
        podcast_itunes_id: podcast.itunesId,
        podcast_name: podcast.title,
        podcast_url: podcast.apple_api_url,
        host_email: primaryEmail,

        // Status - now "1st_email_sent" since we're sending the email
        status: '1st_email_sent',
        status_category: 'active',

        // Subject/Pitch tracking
        subject_tag: editedSubject,
        pitch_angle: `Pitch for ${clientData.contact_name} on ${podcast.title}`,

        // Email thread with the first email
        email_thread: [{
          id: `email_${Date.now()}`,
          direction: 'outbound',
          type: '1st_email',
          from: 'ruth@badassery.co',
          to: primaryEmail || '',
          subject: editedSubject,
          body: editedPitch,
          generated_by_ai: true,
          ai_model_used: 'gemini-2.0-flash-lite',
          original_ai_body: generatedPitch,
          edited_by_user: editedPitch !== generatedPitch,
          sent_at: Timestamp.now(),
          sent_by: currentUser.id,
          sent_via: 'manual'
        }],

        // Email stats
        email_stats: {
          total_sent: 1,
          total_received: 0,
          awaiting_reply: true,
          awaiting_reply_since: Timestamp.now(),
          last_outbound_at: Timestamp.now()
        },

        // NEW: Email copy tracking fields
        first_email_copy: editedPitch,
        first_email_subject: editedSubject,
        first_email_sent_at: Timestamp.now(),
        first_email_sent_by: currentUser.id,

        // AI generation tracking
        ai_generated_pitch: generatedPitch,
        ai_pitch_generated_at: Timestamp.now(),
        pitch_was_edited: editedPitch !== generatedPitch,

        // Initialize empty arrays
        notes: [],
        reminders: [{
          type: 'follow_up_due',
          due_at: Timestamp.fromDate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)), // 5 days from now
          completed: false,
          note: 'Send first follow-up if no response'
        }],

        // Metadata
        created_by: currentUser.id
      });

      // Send email via Cloud Function (automatic sending!)
      let emailSent = false;
      let emailError = '';

      if (primaryEmail) {
        console.log('[PodcastDetailModal] Sending email via Cloud Function to:', primaryEmail);

        const emailResult = await sendEmailViaCloudFunction({
          to: primaryEmail,
          subject: editedSubject,
          body: editedPitch
        });

        emailSent = emailResult.success;
        emailError = emailResult.error || '';

        console.log('[PodcastDetailModal] Email result:', emailResult);
      }

      // Also copy to clipboard as backup
      copyEmailToClipboard({
        to: primaryEmail || '',
        subject: editedSubject,
        body: editedPitch
      });

      if (emailSent) {
        alert(`✅ Email SENT automatically via Cloud Function!\n\nOutreach created and email delivered.\n(Also copied to clipboard as backup)\n\nStatus: 1st Email Sent\nClient: ${clientData.contact_name}\nPodcast: ${podcast.title}`);
      } else {
        // Fallback: open Gmail compose if Cloud Function fails
        if (primaryEmail) {
          openGmailCompose({
            to: primaryEmail,
            subject: editedSubject,
            body: editedPitch
          });
        }
        alert(`⚠️ Outreach created but email not sent automatically.\n\nError: ${emailError}\n\nGmail has been opened for manual sending.\n(Also copied to clipboard as backup)\n\nStatus: 1st Email Sent\nClient: ${clientData.contact_name}\nPodcast: ${podcast.title}`);
      }

      // Close modals
      setShowPitchModal(false);

      // Call callback if provided
      if (onStartOutreach) {
        onStartOutreach(outreachId);
      }

      onClose();
    } catch (error: any) {
      console.error('Error creating outreach:', error);
      alert(`Failed to create outreach: ${error.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  // Get badge color for score
  const getScoreColor = (score?: number) => {
    if (!score) return 'text-slate-400';
    if (score >= 8) return 'text-purple-600';
    if (score >= 6) return 'text-blue-600';
    if (score >= 4) return 'text-green-600';
    return 'text-yellow-600';
  };

  // Get percentile badge color
  const getPercentileBadgeColor = (percentile?: string) => {
    if (!percentile) return 'bg-slate-100 text-slate-600';
    if (percentile === 'Top 1%') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (percentile === 'Top 5%') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (percentile === 'Top 10%') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (percentile === 'Top 25%') return 'bg-green-100 text-green-700 border-green-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  // Get email type icon
  const getEmailTypeIcon = (type: string) => {
    switch (type) {
      case 'primary': return '📧';
      case 'booking': return '📅';
      default: return '✉️';
    }
  };

  // Get email type label
  const getEmailTypeLabel = (type: string) => {
    switch (type) {
      case 'primary': return 'Primary';
      case 'booking': return 'Booking';
      default: return 'General';
    }
  };

  // Format episode date from RSS format
  const formatEpisodeDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Strip HTML tags from description
  const stripHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, '').trim();
  };

  // Extract a guest name from an episode title using regex heuristics.
  // Returns null if no confident match is found.
  const extractGuest = (title: string): string | null => {
    const name = /(?:^|[–\-|•])\s*([A-Z][a-zÀ-ÿ']+(?:\s+[A-Z][a-zÀ-ÿ']+){1,3})\s*(?:[–\-|•]|$)/;
    const patterns: RegExp[] = [
      /\bwith\s+([A-Z][a-zÀ-ÿ']+(?:\s+[A-Z][a-zÀ-ÿ']+){1,3})/,
      /\bfeaturing\s+([A-Z][a-zÀ-ÿ']+(?:\s+[A-Z][a-zÀ-ÿ']+){1,3})/i,
      /\binterview(?:ing|s)?\s+([A-Z][a-zÀ-ÿ']+(?:\s+[A-Z][a-zÀ-ÿ']+){1,3})/i,
      /^(?:Ep\.?\s*\d+\s*[-:|]?\s*)?([A-Z][a-zÀ-ÿ']+(?:\s+[A-Z][a-zÀ-ÿ']+){1,3})\s*[:\|–]/,
      name,
    ];
    // Common false-positive words to reject
    const stopWords = new Set([
      'The', 'How', 'Why', 'What', 'When', 'Where', 'Who', 'This', 'That',
      'From', 'Into', 'Building', 'Growing', 'Using', 'Making', 'Getting',
      'Podcast', 'Episode', 'Part', 'Special', 'Season', 'Show', 'Live',
    ]);
    for (const re of patterns) {
      const m = title.match(re);
      if (m) {
        const candidate = m[1].trim();
        const first = candidate.split(' ')[0];
        if (!stopWords.has(first) && candidate.split(' ').length >= 2) {
          return candidate;
        }
      }
    }
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              {/* Podcast Artwork */}
              <img
                src={podcast.imageUrl || 'https://via.placeholder.com/100'}
                alt={podcast.title}
                className="w-24 h-24 rounded-lg shadow-md object-cover"
              />

              {/* Title & Host */}
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  {podcast.title}
                </h2>
                {podcast.rss_owner_name && (
                  <p className="text-slate-600 mb-3">
                    Host: <span className="font-medium">{podcast.rss_owner_name}</span>
                  </p>
                )}

                {/* Scores & Badges */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-3 py-1.5 rounded-lg font-bold text-lg ${getScoreColor(podcast.ai_badassery_score)} bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 flex items-center gap-1.5`}>
                    <Sparkles size={18} />
                    {podcast.ai_badassery_score?.toFixed(1) || 'N/A'} Badassery
                  </span>

                  {podcast.ai_global_percentile && (
                    <span className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 border ${getPercentileBadgeColor(podcast.ai_global_percentile)}`}>
                      <TrendingUp size={16} />
                      {podcast.ai_global_percentile}
                    </span>
                  )}

                  {podcast.apple_rating && (
                    <span className="px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 flex items-center gap-1.5 font-medium">
                      <Star size={16} fill="currentColor" />
                      {podcast.apple_rating.toFixed(1)}
                      {podcast.apple_rating_count && (
                        <span className="text-xs text-yellow-600">
                          ({podcast.apple_rating_count.toLocaleString()})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X size={24} className="text-slate-600" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-200">
            <button
              onClick={handleStartOutreachWithPitch}
              disabled={generatingPitch || !selectedClientForOutreach}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 font-medium ${
                selectedClientForOutreach
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              } disabled:opacity-50`}
              title={!selectedClientForOutreach ? 'Select a client first using "Add to Client"' : 'Generate pitch and create outreach'}
            >
              <Wand2 size={18} />
              {generatingPitch ? 'Generating...' : 'Generate Pitch & Start Outreach'}
              {selectedClientForOutreach && (
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                  for {selectedClientForOutreach.identity?.firstName || 'Client'}
                </span>
              )}
            </button>

            {/* Add to Client Dropdown */}
            <div className="relative client-dropdown-container">
              <button
                onClick={() => setShowClientDropdown(!showClientDropdown)}
                disabled={addingToWishlist}
                className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 font-medium disabled:opacity-50"
              >
                <Users size={18} />
                Add to Client
                <ChevronDown size={16} className={`transition-transform ${showClientDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showClientDropdown && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                  {loadingClients ? (
                    <div className="p-4 text-center text-slate-500">
                      Loading clients...
                    </div>
                  ) : clients.length === 0 ? (
                    <div className="p-4 text-center text-slate-500">
                      No clients found
                    </div>
                  ) : (
                    <div className="py-2">
                      {clients.map((client) => (
                        <button
                          key={client.id}
                          onClick={() => handleAddToClient(client)}
                          disabled={addingToWishlist}
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center justify-between group disabled:opacity-50"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-slate-900">
                              {client.identity.firstName} {client.identity.lastName}
                            </div>
                            <div className="text-sm text-slate-500">
                              {client.identity.company}
                            </div>
                          </div>
                          <div className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Users size={16} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-white">
          <div className="flex gap-1 px-6">
            {[
              { id: 'overview', label: '📊 Overview', icon: BarChart3 },
              { id: 'episodes', label: '🎧 Episodes', icon: Calendar },
              { id: 'guests',   label: '👤 Guests',   icon: Users },
              { id: 'outreach', label: '📧 Outreach History', icon: Mail },
              { id: 'activity', label: '📜 Activity', icon: Clock }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm text-blue-600 font-medium mb-1">Apple Rating</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {podcast.apple_rating?.toFixed(1) || 'N/A'}
                  </div>
                  {podcast.apple_rating_count && (
                    <div className="text-xs text-blue-600 mt-1">
                      {podcast.apple_rating_count.toLocaleString()} reviews
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
                  <div className="text-sm text-red-600 font-medium mb-1">YouTube Subs</div>
                  <div className="text-2xl font-bold text-red-900">
                    {podcast.yt_subscribers ? `${(podcast.yt_subscribers / 1000).toFixed(0)}K` : 'N/A'}
                  </div>
                  {podcast.yt_channel_name && (
                    <div className="text-xs text-red-600 mt-1 truncate">
                      {podcast.yt_channel_name}
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
                  <div className="text-sm text-green-600 font-medium mb-1">Episodes</div>
                  <div className="text-2xl font-bold text-green-900">
                    {podcast.episodeCount || 'N/A'}
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    Total published
                  </div>
                </div>

              </div>

              {/* Apple Charts */}
              {(podcast.apple_chart_genres || podcast.apple_chart_rank) && (() => {
                const entries = podcast.apple_chart_genres
                  ? Object.entries(podcast.apple_chart_genres).sort(([, a], [, b]) => a - b)
                  : [[podcast.apple_chart_genre!, podcast.apple_chart_rank!] as [string, number]];
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-amber-700 uppercase tracking-wide mr-1">Apple Charts</span>
                      {entries.map(([genre, rank]) => (
                        <span
                          key={genre}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            rank === 1   ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                            rank <= 3    ? 'bg-orange-100 text-orange-800 border-orange-300' :
                            rank <= 10   ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                           'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          🏆 #{rank} in {genre}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Spotify Charts */}
              {(podcast.spotify_chart_genres || podcast.spotify_chart_rank) && (() => {
                const entries = podcast.spotify_chart_genres
                  ? Object.entries(podcast.spotify_chart_genres).sort(([, a], [, b]) => a - b)
                  : [[podcast.spotify_chart_genre!, podcast.spotify_chart_rank!] as [string, number]];
                return (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-green-700 uppercase tracking-wide mr-1">Spotify Charts</span>
                      {entries.map(([genre, rank]) => (
                        <span
                          key={genre}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            rank === 1   ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                            rank <= 3    ? 'bg-orange-100 text-orange-800 border-orange-300' :
                            rank <= 10   ? 'bg-green-100 text-green-800 border-green-300' :
                                           'bg-green-50 text-green-700 border-green-200'
                          }`}
                        >
                          🎵 #{rank} in {genre}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Description */}
              {(podcast.ai_summary || podcast.description) && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">Description</h3>
                  <p className="text-slate-700 leading-relaxed">
                    {podcast.ai_summary || stripHtml(podcast.description || '')}
                  </p>
                </div>
              )}

              {/* Topics & Audience */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Topics & Audience</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Category</div>
                      <Badge variant="info">{podcast.ai_primary_category || 'N/A'}</Badge>
                    </div>
                    {podcast.ai_topics && podcast.ai_topics.length > 0 && (
                      <div>
                        <div className="text-xs text-slate-500 mb-2">Topics</div>
                        <div className="flex flex-wrap gap-2">
                          {podcast.ai_topics.slice(0, 5).map((topic, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs border border-slate-200"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Audience Size</div>
                      <span className="text-sm font-medium text-slate-700">
                        {podcast.ai_audience_size || 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Metrics</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Business Relevance</span>
                      <span className="text-sm font-bold text-slate-900">
                        {podcast.ai_business_relevance || 'N/A'}/10
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Engagement Level</span>
                      <span className="text-sm font-bold text-slate-900">
                        {podcast.ai_engagement_level?.toFixed(1) || 'N/A'}/10
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Content Quality</span>
                      <span className="text-sm font-bold text-slate-900">
                        {podcast.ai_content_quality?.toFixed(1) || 'N/A'}/10
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CONTACT Section - Enhanced with email sources */}
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide flex items-center gap-2">
                  <Mail size={16} />
                  Contact
                </h3>

                <div className="space-y-3">
                  {/* Emails list */}
                  {emails.length > 0 ? (
                    emails.map((emailCandidate, idx) => (
                      <div key={idx} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getEmailTypeIcon(emailCandidate.type)}</span>
                            <div>
                              <div className="text-xs text-slate-500 font-medium uppercase">
                                {getEmailTypeLabel(emailCandidate.type)}
                              </div>
                              <a
                                href={`mailto:${emailCandidate.email}`}
                                className="text-sm font-mono text-blue-600 hover:text-blue-700 hover:underline"
                              >
                                {emailCandidate.email}
                              </a>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCopyEmail(emailCandidate.email)}
                            className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                            title="Copy email"
                          >
                            {copiedEmail === emailCandidate.email ? (
                              <CheckCircle size={16} className="text-green-600" />
                            ) : (
                              <Copy size={16} className="text-slate-500" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500">Source:</span>
                          {emailCandidate.sources.map((source, sIdx) => (
                            <span key={sIdx} className="px-2 py-0.5 bg-green-100 text-green-700 rounded border border-green-200">
                              {source} ✓
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
                      No email found
                    </div>
                  )}

                  {/* Fallback: website link when website_email is missing */}
                  {!podcast.website_email && (podcast.website || podcast.rss_website) && (
                    <div>
                      <div className="text-xs text-slate-400 mb-2">No scraped email — visit the website to find a contact:</div>
                      <a
                        href={(podcast.website || podcast.rss_website || '').replace(/\/$/, '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors inline-flex items-center gap-1.5 text-xs font-medium"
                      >
                        <ExternalLink size={12} />
                        Visit website
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Quick Actions</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleStartOutreachWithPitch}
                    disabled={generatingPitch || !selectedClientForOutreach}
                    className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
                      selectedClientForOutreach
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    } disabled:opacity-50`}
                    title={!selectedClientForOutreach ? 'Select a client first' : 'Generate pitch and start outreach'}
                  >
                    <Wand2 size={16} />
                    {generatingPitch ? 'Generating...' : 'Generate Pitch'}
                  </button>

                  {emails.length > 0 && (
                    <button
                      onClick={() => handleCopyEmail(emails[0].email)}
                      className="px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      {copiedEmail === emails[0].email ? (
                        <>
                          <CheckCircle size={16} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          Copy Email
                        </>
                      )}
                    </button>
                  )}

                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    {copiedLink ? (
                      <>
                        <CheckCircle size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <ExternalLink size={16} />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Social Links */}
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wide">Links</h3>
                <div className="flex flex-wrap gap-2">
                  {socialLinks.youtube && (
                    <a href={socialLinks.youtube} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 text-sm font-medium">
                      <Youtube size={16} /> YouTube
                    </a>
                  )}
                  {socialLinks.instagram && (
                    <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-pink-50 text-pink-700 border border-pink-200 rounded-lg hover:bg-pink-100 transition-colors flex items-center gap-2 text-sm font-medium">
                      <Instagram size={16} /> Instagram
                    </a>
                  )}
                  {socialLinks.twitter && (
                    <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-2 text-sm font-medium">
                      <Twitter size={16} /> X / Twitter
                    </a>
                  )}
                  {socialLinks.facebook && (
                    <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2 text-sm font-medium">
                      <ExternalLink size={16} /> Facebook
                    </a>
                  )}
                  {socialLinks.linkedin && (
                    <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors flex items-center gap-2 text-sm font-medium">
                      <Linkedin size={16} /> LinkedIn
                    </a>
                  )}
                  {socialLinks.tiktok && (
                    <a href={socialLinks.tiktok} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-slate-900 text-white border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm font-medium">
                      <ExternalLink size={16} /> TikTok
                    </a>
                  )}
                  {socialLinks.website && (
                    <a href={socialLinks.website} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2 text-sm font-medium">
                      <Globe size={16} /> Website
                    </a>
                  )}
                  {podcast.apple_api_url && (
                    <a href={podcast.apple_api_url} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-2 text-sm font-medium">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                      </svg>
                      Apple Podcasts
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'episodes' && (
            <div className="space-y-4">
              {/* Loading */}
              {episodesLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <Loader2 size={36} className="animate-spin text-purple-500 mb-3" />
                  <p className="text-sm">Loading episodes from PodcastIndex...</p>
                </div>
              )}

              {/* Error */}
              {episodesError && !episodesLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <AlertCircle size={36} className="text-red-400 mb-3" />
                  <p className="text-sm font-medium text-red-600 mb-1">Failed to load episodes</p>
                  <p className="text-xs text-slate-400">{episodesError}</p>
                </div>
              )}

              {/* Episodes list */}
              {!episodesLoading && !episodesError && liveEpisodes.length === 0 && (
                <div className="text-center text-slate-500 py-12">
                  <Headphones size={48} className="mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-2">No episodes found</p>
                  <p className="text-sm">This podcast may not be indexed by PodcastIndex.</p>
                </div>
              )}

              {!episodesLoading && liveEpisodes.length > 0 && (
                <>
                  {(() => {
                    const withDuration = liveEpisodes.filter(e => e.duration > 0);
                    const avgSec = withDuration.length > 0
                      ? Math.round(withDuration.reduce((sum, e) => sum + e.duration, 0) / withDuration.length)
                      : 0;
                    return avgSec > 0 ? (
                      <div className="flex items-center gap-2 text-sm text-slate-600 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 mb-3">
                        <Clock size={14} className="text-purple-500" />
                        <span>Avg episode length: <strong className="text-purple-800">{formatPIDuration(avgSec)}</strong></span>
                        <span className="text-slate-400 text-xs">(based on {withDuration.length} episodes)</span>
                      </div>
                    ) : null;
                  })()}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Headphones size={20} className="text-purple-600" />
                      Recent Episodes ({liveEpisodes.length})
                    </h3>
                  </div>

                  {liveEpisodes.map((episode, idx) => {
                    const isExpanded = expandedEpisodes.has(episode.id);
                    const description = stripHtml(episode.description || '');
                    return (
                      <div
                        key={episode.id}
                        className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-4">
                          {/* Episode Number Badge */}
                          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm">
                            {idx + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Title */}
                            <h4 className="font-semibold text-slate-900 mb-1 leading-snug">
                              {episode.title || `Episode ${idx + 1}`}
                            </h4>

                            {/* Meta */}
                            <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
                              {episode.datePublished > 0 && (
                                <span className="flex items-center gap-1">
                                  <Calendar size={12} />
                                  {formatPIDate(episode.datePublished)}
                                </span>
                              )}
                              {episode.duration > 0 && (
                                <span className="flex items-center gap-1">
                                  <Clock size={12} />
                                  {formatPIDuration(episode.duration)}
                                </span>
                              )}
                            </div>

                            {/* Description — 2 lines, expandable */}
                            {description && (
                              <div className="mb-2">
                                <p className={`text-sm text-slate-600 ${isExpanded ? '' : 'line-clamp-2'}`}>
                                  {description}
                                </p>
                                {description.length > 120 && (
                                  <button
                                    onClick={() => setExpandedEpisodes(prev => {
                                      const next = new Set(prev);
                                      isExpanded ? next.delete(episode.id) : next.add(episode.id);
                                      return next;
                                    })}
                                    className="text-xs text-purple-600 hover:text-purple-800 font-medium mt-0.5"
                                  >
                                    {isExpanded ? 'Show less' : 'Show more'}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Actions */}
                            {episode.enclosureUrl && (
                              <a
                                href={episode.enclosureUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors font-medium"
                              >
                                <Play size={12} />
                                Listen
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {activeTab === 'guests' && (
            <div className="space-y-4">
              {(() => {
                // Build a deduplicated map: name → first episode title it appeared in
                const guestMap = new Map<string, string>();
                for (const ep of liveEpisodes) {
                  const guest = extractGuest(ep.title);
                  if (guest && !guestMap.has(guest)) {
                    guestMap.set(guest, ep.title);
                  }
                }
                const guests = Array.from(guestMap.entries());

                if (liveEpisodes.length === 0) {
                  return (
                    <div className="text-center text-slate-500 py-12">
                      <Users size={48} className="mx-auto mb-4 opacity-30" />
                      <p className="text-sm">Open the Episodes tab first to load episode data.</p>
                    </div>
                  );
                }

                if (guests.length === 0) {
                  return (
                    <div className="text-center text-slate-500 py-12">
                      <Users size={48} className="mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium mb-2">No guests detected in recent episode titles</p>
                      <p className="text-sm">Guest names couldn't be extracted from the {liveEpisodes.length} episode titles fetched.</p>
                    </div>
                  );
                }

                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Users size={20} className="text-purple-600" />
                        Detected Guests ({guests.length})
                      </h3>
                      <span className="text-xs text-slate-400">from {liveEpisodes.length} episodes</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {guests.map(([name, episodeTitle]) => (
                        <div
                          key={name}
                          className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center text-purple-600">
                            <Users size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900">{name}</p>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{episodeTitle}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {activeTab === 'outreach' && (
            <div className="p-6">
              {loadingOutreachHistory ? (
                <div className="text-center text-slate-500 py-8">
                  Loading outreach history...
                </div>
              ) : outreachHistory.length === 0 ? (
                <div className="text-center text-slate-500 py-8">
                  <Mail size={48} className="mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-2">No outreach history yet</p>
                  <p className="text-sm">This podcast hasn't been contacted by any client yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">
                    Outreach History ({outreachHistory.length})
                  </h3>
                  {outreachHistory.map((outreach) => (
                    <div
                      key={outreach.id}
                      className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-slate-900">{outreach.client_name}</h4>
                          <p className="text-sm text-slate-600">
                            Status: <span className="font-medium capitalize">{outreach.status.replace(/_/g, ' ')}</span>
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          outreach.status_category === 'booked' ? 'bg-green-100 text-green-700' :
                          outreach.status_category === 'active' ? 'bg-blue-100 text-blue-700' :
                          outreach.status_category === 'discovery' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {outreach.status_category}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-500">Emails sent:</span>
                          <span className="ml-2 font-medium">{outreach.email_stats?.total_sent || 0}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Emails received:</span>
                          <span className="ml-2 font-medium">{outreach.email_stats?.total_received || 0}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Created:</span>
                          <span className="ml-2 font-medium">
                            {outreach.created_at?.toDate?.().toLocaleDateString() || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Last updated:</span>
                          <span className="ml-2 font-medium">
                            {outreach.updated_at?.toDate?.().toLocaleDateString() || 'N/A'}
                          </span>
                        </div>
                      </div>

                      {outreach.notes && outreach.notes.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500 mb-1">Latest note:</p>
                          <p className="text-sm text-slate-700">{outreach.notes[outreach.notes.length - 1].text}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="text-center text-slate-500 py-8">
              Activity tab - Coming soon
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LOGIN MODAL */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <LogIn size={24} className="text-purple-600" />
                Login Required
              </h3>
              <button
                onClick={() => setShowLoginModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <p className="text-slate-600 mb-6">
              Please login to start an outreach campaign.
            </p>

            {loginError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle size={18} />
                {loginError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>

              <button
                onClick={handleLogin}
                disabled={isLoggingIn || !loginUsername || !loginPassword}
                className="w-full py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    Login
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-4 text-center">
              Hint: Use "Brooklynn" / "Brooklynn" for admin access
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PITCH GENERATION MODAL */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showPitchModal && selectedClientForOutreach && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Wand2 size={24} className="text-purple-600" />
                    Generate Pitch Email
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    For <span className="font-medium">{getClientDisplayData(selectedClientForOutreach).contact_name}</span> →{' '}
                    <span className="font-medium">{podcast.title}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowPitchModal(false)}
                  className="p-2 hover:bg-white/50 rounded-lg"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {generatingPitch ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 size={48} className="text-purple-600 animate-spin mb-4" />
                  <p className="text-lg font-medium text-slate-900">Generating personalized pitch...</p>
                  <p className="text-sm text-slate-500 mt-2">Using AI to create the perfect outreach email</p>
                </div>
              ) : pitchError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <div className="flex items-center gap-3 text-red-700 mb-4">
                    <AlertCircle size={24} />
                    <h4 className="font-bold">Failed to generate pitch</h4>
                  </div>
                  <p className="text-red-600">{pitchError}</p>
                  <button
                    onClick={handleStartOutreachWithPitch}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Subject Line */}
                  <div>
                    <label className="block text-sm font-bold text-slate-900 mb-2">
                      Subject Line
                    </label>
                    <input
                      type="text"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                    />
                  </div>

                  {/* Email Body */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-slate-900">
                        Email Body
                      </label>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Sparkles size={14} className="text-purple-500" />
                        AI Generated
                        {editedPitch !== generatedPitch && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Edited</span>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={editedPitch}
                      onChange={(e) => setEditedPitch(e.target.value)}
                      rows={14}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm leading-relaxed"
                    />
                  </div>

                  {/* Host Email Info */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail size={16} className="text-slate-500" />
                      <span className="text-slate-600">Will be sent to:</span>
                      <span className="font-medium text-slate-900">
                        {emails.length > 0 ? emails[0].email : 'No email found'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {!generatingPitch && !pitchError && (
              <div className="border-t border-slate-200 p-5 bg-slate-50">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setEditedPitch(generatedPitch);
                      setEditedSubject(generatedSubject);
                    }}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
                    disabled={editedPitch === generatedPitch}
                  >
                    <Edit3 size={16} />
                    Reset to Original
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowPitchModal(false)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={handleSendFirstEmail}
                      disabled={sendingEmail || !editedPitch || !editedSubject}
                      className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {sendingEmail ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Sending Email...
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          Create Outreach & Send Email
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
