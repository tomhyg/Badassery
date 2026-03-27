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
  const [activeTab, setActiveTab] = useState<'overview' | 'episodes' | 'outreach' | 'activity'>('overview');
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
          ai_model_used: 'gemini-2.0-flash',
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

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
                  <div className="text-sm text-purple-600 font-medium mb-1">Avg Length</div>
                  <div className="text-2xl font-bold text-purple-900">
                    {podcast.rss_ep1_duration || 'N/A'}
                  </div>
                  <div className="text-xs text-purple-600 mt-1">
                    Per episode
                  </div>
                </div>
              </div>

              {/* Description */}
              {podcast.ai_summary && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">Summary</h3>
                  <p className="text-slate-700 leading-relaxed">{podcast.ai_summary}</p>
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
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Guest Friendly</span>
                      <span className="text-sm font-bold text-slate-900">
                        {podcast.ai_guest_friendly ? '✅ Yes' : '❌ No'}
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

                {emails.length > 0 ? (
                  <div className="space-y-3">
                    {emails.map((emailCandidate, idx) => (
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

                        {/* Sources */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500">Sources:</span>
                          {emailCandidate.sources.map((source, sIdx) => (
                            <span
                              key={sIdx}
                              className="px-2 py-0.5 bg-green-100 text-green-700 rounded border border-green-200 flex items-center gap-1"
                            >
                              {source} ✓
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
                    No email addresses available
                  </div>
                )}
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
                    <a
                      href={socialLinks.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <Youtube size={16} />
                      YouTube
                    </a>
                  )}

                  {socialLinks.website && (
                    <a
                      href={socialLinks.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <Globe size={16} />
                      Website
                    </a>
                  )}

                  {podcast.apple_api_url && (
                    <a
                      href={podcast.apple_api_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                      </svg>
                      Apple Podcasts
                    </a>
                  )}

                  {podcast.rss_url && (
                    <a
                      href={podcast.rss_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20A2.18 2.18 0 0 1 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
                      </svg>
                      RSS Feed
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'episodes' && (
            <div className="space-y-4">
              {(() => {
                const episodes = getRSSEpisodes(podcast);

                if (episodes.length === 0) {
                  return (
                    <div className="text-center text-slate-500 py-12">
                      <Headphones size={48} className="mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium mb-2">No episodes available</p>
                      <p className="text-sm">Episode data hasn't been fetched for this podcast yet.</p>
                    </div>
                  );
                }

                return (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Headphones size={20} className="text-purple-600" />
                        Recent Episodes ({episodes.length})
                      </h3>
                    </div>

                    {episodes.map((episode, idx) => (
                      <div
                        key={episode.guid || idx}
                        className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-4">
                          {/* Episode Number Badge */}
                          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
                            {idx + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Episode Title */}
                            <h4 className="font-bold text-slate-900 mb-2 line-clamp-2">
                              {episode.title || `Episode ${idx + 1}`}
                            </h4>

                            {/* Episode Meta */}
                            <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                              {episode.date && (
                                <span className="flex items-center gap-1.5">
                                  <Calendar size={14} className="text-slate-400" />
                                  {formatEpisodeDate(episode.date)}
                                </span>
                              )}
                              {episode.duration && (
                                <span className="flex items-center gap-1.5">
                                  <Clock size={14} className="text-slate-400" />
                                  {episode.duration}
                                </span>
                              )}
                            </div>

                            {/* Episode Description */}
                            {episode.description && (
                              <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                                {stripHtml(episode.description)}
                              </p>
                            )}

                            {/* Episode Actions */}
                            <div className="flex items-center gap-2">
                              {episode.audioUrl && (
                                <a
                                  href={episode.audioUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1.5 font-medium"
                                >
                                  <Play size={14} />
                                  Listen
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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
