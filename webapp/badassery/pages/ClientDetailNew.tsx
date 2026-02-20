import React, { useState, useEffect, useRef } from 'react';
import { Client, getClientDisplayData, WishlistItem } from '../types';
import { ArrowLeft, Edit2, Mail, Phone, Linkedin, Calendar, User, Target, Sparkles, MessageSquare, TrendingUp, Globe, Heart, AlertCircle, RefreshCw, Wand2, Check, X, Radio, ExternalLink, CheckCircle, XCircle, Info, Zap, Plus, Trash2, Send, Star, Copy, Camera, Clock, Search, ChevronDown } from 'lucide-react';
import { getClientById, updateClient } from '../services/clientService';
import { enhanceBioWithGemini, generateClientSummary } from '../services/geminiService';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getOutreachByClientId, updateOutreachStatus, updateOutreachWorkflowStatus, updateItunesId, updateHostEmail, OutreachDocument, getBestHostEmail, EmailCandidate } from '../services/outreachService';
import { getEnrichedMatchesForClient, approveMatch, rejectMatch, getMatchStatsForClient, generateMatchesForClient } from '../services/aiMatchingService';
import { AIMatchWithPodcast } from '../types';
import { getClientWishlist, removeFromWishlist, moveToOutreach, WishlistItem as WishlistItemType } from '../services/wishlistService';
import { getPodcastByItunesId, PodcastDocument, BADASSERY_TOPICS } from '../services/podcastService';
import { getAIConfig } from '../services/settingsService';

// Target location options (same as onboarding)
const TARGET_LOCATIONS = ['U.S.', 'Europe', 'No Preference'];

interface ClientDetailNewProps {
  clientId: string;
  onBack: () => void;
}

export const ClientDetailNew: React.FC<ClientDetailNewProps> = ({ clientId, onBack }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'goals' | 'brand' | 'podcast' | 'content' | 'aimatches' | 'wishlist' | 'outreach'>('overview');

  // AI Matches
  const [aiMatches, setAiMatches] = useState<AIMatchWithPodcast[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [generatingMatches, setGeneratingMatches] = useState(false);
  const [matchStats, setMatchStats] = useState<{ total: number; pending: number; approved: number; rejected: number } | null>(null);

  // Wishlist
  const [wishlistItems, setWishlistItems] = useState<(WishlistItemType & { podcast?: PodcastDocument })[]>([]);
  const [loadingWishlist, setLoadingWishlist] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Client | null>(null);

  // AI Bio Enhancement
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [showBioPreview, setShowBioPreview] = useState(false);
  const [generatedBio, setGeneratedBio] = useState<string>('');

  // Outreach Data
  const [outreach, setOutreach] = useState<OutreachDocument[]>([]);
  const [loadingOutreach, setLoadingOutreach] = useState(false);
  const [editingItunesId, setEditingItunesId] = useState<string | null>(null);
  const [editItunesValue, setEditItunesValue] = useState('');

  // Email Management
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [showEmailModalId, setShowEmailModalId] = useState<string | null>(null);

  // Photo Upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // AI Summary
  const [generatingAISummary, setGeneratingAISummary] = useState(false);

  // Stats Editing
  const [editingStats, setEditingStats] = useState(false);
  const [statsForm, setStatsForm] = useState({ total_bookings: 0, goal_bookings: 0 });

  // Outreach Search
  const [outreachSearch, setOutreachSearch] = useState('');
  const [outreachStatusFilter, setOutreachStatusFilter] = useState<string>('all');

  // Copy notification
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    loadClient();
  }, [clientId]);

  useEffect(() => {
    if (activeTab === 'outreach') {
      loadOutreach();
    }
    if (activeTab === 'aimatches') {
      loadAIMatches();
    }
    if (activeTab === 'wishlist') {
      loadWishlist();
    }
  }, [activeTab, clientId]);

  const loadAIMatches = async () => {
    try {
      setLoadingMatches(true);
      const [matches, stats] = await Promise.all([
        getEnrichedMatchesForClient(clientId),
        getMatchStatsForClient(clientId)
      ]);
      setAiMatches(matches);
      setMatchStats(stats);
    } catch (error) {
      console.error('Error loading AI matches:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  const loadWishlist = async () => {
    try {
      setLoadingWishlist(true);
      const items = await getClientWishlist(clientId);
      // Enrich with podcast data
      const enriched = await Promise.all(
        items.map(async (item) => {
          const podcast = await getPodcastByItunesId(item.podcast_itunes_id);
          return { ...item, podcast: podcast || undefined };
        })
      );
      setWishlistItems(enriched);
    } catch (error) {
      console.error('Error loading wishlist:', error);
    } finally {
      setLoadingWishlist(false);
    }
  };

  const handleGenerateMatches = async () => {
    try {
      setGeneratingMatches(true);
      await generateMatchesForClient(
        clientId,
        'current_user', // TODO: get from auth
        10 // number of matches
      );
      await loadAIMatches();
    } catch (error) {
      console.error('Error generating matches:', error);
      alert('Failed to generate matches. Please try again.');
    } finally {
      setGeneratingMatches(false);
    }
  };

  const handleApproveMatch = async (matchId: string) => {
    try {
      await approveMatch(matchId, 'current_user');
      await loadAIMatches();
      // Navigate to Outreach tab after approval
      setActiveTab('outreach');
      await loadOutreach();
    } catch (error) {
      console.error('Error approving match:', error);
      alert('Failed to approve match.');
    }
  };

  // Photo Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !client) return;

    try {
      setUploadingPhoto(true);
      const storage = getStorage();
      const storageRef = ref(storage, `clients/${clientId}/photo_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await updateClient(clientId, { logo_url: downloadURL });
      setClient({ ...client, logo_url: downloadURL });
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // AI Summary Generation
  const handleGenerateAISummary = async () => {
    if (!client) return;

    try {
      setGeneratingAISummary(true);
      const summary = await generateClientSummary(client);
      await updateClient(clientId, {
        ai_summary: summary,
        ai_summary_generated_at: new Date().toISOString()
      });
      setClient({ ...client, ai_summary: summary });
    } catch (error) {
      console.error('Error generating AI summary:', error);
      alert('Failed to generate AI summary. Please try again.');
    } finally {
      setGeneratingAISummary(false);
    }
  };

  // Stats Editing
  const handleStartEditStats = () => {
    if (client) {
      setStatsForm({
        total_bookings: client.stats?.total_bookings || 0,
        goal_bookings: client.stats?.goal_bookings || 0
      });
      setEditingStats(true);
    }
  };

  const handleSaveStats = async () => {
    if (!client) return;

    try {
      setUpdating(true);
      const updatedStats = {
        ...client.stats,
        total_bookings: statsForm.total_bookings,
        goal_bookings: statsForm.goal_bookings
      };
      await updateClient(clientId, { stats: updatedStats });
      setClient({ ...client, stats: updatedStats });
      setEditingStats(false);
    } catch (error) {
      console.error('Error saving stats:', error);
      alert('Failed to save stats. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  // Copy Badassery Link
  const handleCopyBadasseryLink = () => {
    const link = client?.links?.badasseryProfileUrl;
    if (link) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Calculate client duration
  const getClientDuration = () => {
    if (!client?.metadata?.startDateUtc) return null;
    const start = new Date(client.metadata.startDateUtc);
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
    if (months < 1) return 'Less than 1 month';
    if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return `${years} year${years > 1 ? 's' : ''}${remainingMonths > 0 ? ` ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}` : ''}`;
  };

  // Filter outreach
  const filteredOutreach = outreach.filter(o => {
    const matchesSearch = !outreachSearch ||
      o['Podcast Name']?.toLowerCase().includes(outreachSearch.toLowerCase()) ||
      o['Host Name']?.toLowerCase().includes(outreachSearch.toLowerCase());
    const matchesStatus = outreachStatusFilter === 'all' || o.status === outreachStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleRejectMatch = async (matchId: string) => {
    try {
      await rejectMatch(matchId, 'current_user');
      await loadAIMatches();
    } catch (error) {
      console.error('Error rejecting match:', error);
    }
  };

  const handleRemoveFromWishlist = async (wishlistId: string) => {
    try {
      await removeFromWishlist(wishlistId);
      await loadWishlist();
    } catch (error) {
      console.error('Error removing from wishlist:', error);
    }
  };

  const handleMoveToOutreach = async (wishlistId: string) => {
    try {
      await moveToOutreach(wishlistId);
      await loadWishlist();
      // Also refresh outreach tab if needed
      if (activeTab === 'outreach') {
        await loadOutreach();
      }
    } catch (error) {
      console.error('Error moving to outreach:', error);
      alert('Failed to create outreach. Please try again.');
    }
  };

  const loadClient = async () => {
    try {
      setLoading(true);
      const data = await getClientById(clientId);
      setClient(data);
    } catch (error) {
      console.error('Error loading client:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOutreach = async () => {
    try {
      setLoadingOutreach(true);
      const data = await getOutreachByClientId(clientId);
      setOutreach(data);
    } catch (error) {
      console.error('Error loading outreach:', error);
    } finally {
      setLoadingOutreach(false);
    }
  };

  const handleStatusChange = async (newStatus: 'active' | 'onboarding' | 'paused' | 'churned') => {
    if (!client) return;

    try {
      setUpdating(true);
      await updateClient(clientId, { status: newStatus });
      setClient({ ...client, status: newStatus });
      setShowStatusMenu(false);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleEdit = () => {
    if (client) {
      setEditForm({ ...client });
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;

    try {
      setUpdating(true);
      await updateClient(clientId, editForm);
      setClient(editForm);
      setIsEditing(false);
      alert('Client updated successfully!');
    } catch (error) {
      console.error('Error updating client:', error);
      alert('Failed to update client. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelEdit = () => {
    setEditForm(null);
    setIsEditing(false);
  };

  const handleEnhanceBio = async () => {
    if (!client) return;

    try {
      setIsGeneratingBio(true);
      const enhanced = await enhanceBioWithGemini(client);
      setGeneratedBio(enhanced);
      setShowBioPreview(true);
    } catch (error) {
      console.error('Error enhancing bio:', error);
      alert(`Failed to enhance bio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBio(false);
    }
  };

  const handleAcceptBio = async () => {
    if (!client || !generatedBio) return;

    try {
      setUpdating(true);
      const updatedContent = {
        ...client.content,
        bioUpdated: generatedBio
      };
      await updateClient(clientId, { content: updatedContent });
      setClient({ ...client, content: updatedContent });
      setShowBioPreview(false);
      setGeneratedBio('');
      alert('Bio updated successfully!');
    } catch (error) {
      console.error('Error saving bio:', error);
      alert('Failed to save bio. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleRejectBio = () => {
    setShowBioPreview(false);
    setGeneratedBio('');
  };

  const handleSaveItunesId = async (id: string) => {
    try {
      await updateItunesId(id, editItunesValue);
      setEditingItunesId(null);
      setEditItunesValue('');
      await loadOutreach();
    } catch (error) {
      console.error('Error updating iTunes ID:', error);
      alert('Failed to update iTunes ID. Please try again.');
    }
  };

  const handleOutreachStatusChange = async (id: string, status: OutreachDocument['status']) => {
    try {
      await updateOutreachStatus(id, status);
      await loadOutreach();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleWorkflowStatusChange = async (id: string, outreachStatus: OutreachDocument['Outreach Status']) => {
    try {
      await updateOutreachWorkflowStatus(id, outreachStatus);
      await loadOutreach();
    } catch (error) {
      console.error('Error updating workflow status:', error);
      alert('Failed to update workflow status. Please try again.');
    }
  };

  const handleSaveHostEmail = async (id: string) => {
    try {
      await updateHostEmail(id, editEmailValue);
      setEditingEmailId(null);
      setEditEmailValue('');
      await loadOutreach();
    } catch (error) {
      console.error('Error updating host email:', error);
      alert('Failed to update host email. Please try again.');
    }
  };

  const handleSelectEmail = async (id: string, email: string) => {
    try {
      await updateHostEmail(id, email);
      setShowEmailModalId(null);
      await loadOutreach();
    } catch (error) {
      console.error('Error selecting email:', error);
      alert('Failed to select email. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto text-slate-400 mb-2" size={48} />
          <p className="text-slate-500">Client not found</p>
          <button onClick={onBack} className="mt-4 text-indigo-600 hover:underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const display = getClientDisplayData(client);

  return (
    <div className="flex flex-col h-full space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm font-medium">
          <ArrowLeft size={16} /> Back to Clients
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleEdit}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1"
          >
            <Edit2 size={12} /> Edit
          </button>
        </div>
      </div>

      {/* Client Header Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-start gap-6">
          {/* Photo with upload */}
          <div className="relative group">
            <img
              src={display.logo_url}
              alt={display.company_name}
              className="w-20 h-20 rounded-full border-2 border-slate-200 object-cover"
            />
            <input
              type="file"
              ref={photoInputRef}
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              {uploadingPhoto ? (
                <RefreshCw size={20} className="text-white animate-spin" />
              ) : (
                <Camera size={20} className="text-white" />
              )}
            </button>
          </div>

          <div className="flex-1">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{display.contact_name}</h1>
                <p className="text-slate-600">
                  {display.spokesperson?.title && `${display.spokesperson.title} at `}
                  {display.company_name}
                </p>
                {/* AI Summary */}
                {client.ai_summary ? (
                  <p className="text-sm text-slate-500 mt-2 italic">{client.ai_summary}</p>
                ) : (
                  <button
                    onClick={handleGenerateAISummary}
                    disabled={generatingAISummary}
                    className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    {generatingAISummary ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Wand2 size={12} />
                    )}
                    {generatingAISummary ? 'Generating...' : 'Generate AI Summary'}
                  </button>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  disabled={updating}
                  className={`px-3 py-1 rounded-full text-sm font-bold capitalize flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50
                    ${display.status === 'active' ? 'bg-green-100 text-green-800' :
                      display.status === 'onboarding' ? 'bg-amber-100 text-amber-800' :
                      display.status === 'paused' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-600'}
                  `}>
                  {updating ? <RefreshCw size={14} className="animate-spin" /> : null}
                  {display.status}
                  <span className="text-xs">▼</span>
                </button>

                {showStatusMenu && !updating && (
                  <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-[150px]">
                    {(['active', 'onboarding', 'paused', 'churned'] as const).map(status => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg capitalize
                          ${display.status === status ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700'}
                        `}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Contact Info */}
            <div className="flex flex-wrap gap-4 text-sm text-slate-600 mt-3">
              {display.email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} /> {display.email}
                </div>
              )}
              {display.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} /> {display.phone}
                </div>
              )}
              {client?.links?.linkedinAndSocial && (
                <a
                  href={client.links.linkedinAndSocial}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-indigo-600 hover:underline"
                >
                  <Linkedin size={14} /> LinkedIn
                </a>
              )}
              {/* Badassery Profile Link */}
              {client?.links?.badasseryProfileUrl && (
                <div className="flex items-center gap-2">
                  <a
                    href={client.links.badasseryProfileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <Globe size={14} /> Badassery Profile
                  </a>
                  <button
                    onClick={handleCopyBadasseryLink}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                    title="Copy link"
                  >
                    {copiedLink ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                  </button>
                </div>
              )}
            </div>

            {/* Signup Date & Duration */}
            {client.metadata?.startDateUtc && (
              <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <Clock size={14} />
                  <span>Client since {new Date(client.metadata.startDateUtc).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                </div>
                {getClientDuration() && (
                  <span className="text-slate-400">({getClientDuration()})</span>
                )}
              </div>
            )}

            {/* Stats - Editable */}
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg">
                <Target size={16} className="text-indigo-600" />
                <span className="text-sm text-slate-600">
                  <strong className="text-slate-900">{display.stats.matches}</strong> matches
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
                <Mail size={16} className="text-blue-600" />
                <span className="text-sm text-slate-600">
                  <strong className="text-slate-900">{display.stats.total_outreach_started}</strong> outreach
                </span>
              </div>

              {/* Editable Booked & Goal */}
              {editingStats ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
                  <Calendar size={16} className="text-green-600" />
                  <input
                    type="number"
                    value={statsForm.total_bookings}
                    onChange={(e) => setStatsForm({ ...statsForm, total_bookings: parseInt(e.target.value) || 0 })}
                    className="w-12 text-center border rounded px-1 text-sm font-bold"
                  />
                  <span className="text-sm text-slate-600">booked /</span>
                  <input
                    type="number"
                    value={statsForm.goal_bookings}
                    onChange={(e) => setStatsForm({ ...statsForm, goal_bookings: parseInt(e.target.value) || 0 })}
                    className="w-12 text-center border rounded px-1 text-sm"
                  />
                  <span className="text-sm text-slate-600">goal</span>
                  <button onClick={handleSaveStats} className="text-green-600 hover:text-green-700">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingStats(false)} className="text-red-600 hover:text-red-700">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={handleStartEditStats}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                >
                  <Calendar size={16} className="text-green-600" />
                  <span className="text-sm text-slate-600">
                    <strong className="text-slate-900">{display.stats.total_bookings}</strong> booked
                    {display.stats.goal_bookings > 0 && (
                      <>
                        <span className="text-slate-400 mx-1">/</span>
                        <span>{display.stats.goal_bookings} goal</span>
                        <span className={`ml-2 font-bold ${
                          (display.stats.total_bookings / display.stats.goal_bookings) >= 1 ? 'text-green-600' :
                          (display.stats.total_bookings / display.stats.goal_bookings) >= 0.5 ? 'text-amber-600' :
                          'text-slate-600'
                        }`}>
                          ({Math.round((display.stats.total_bookings / display.stats.goal_bookings) * 100)}%)
                        </span>
                      </>
                    )}
                  </span>
                  <Edit2 size={12} className="text-slate-400 ml-1" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {[
          { id: 'overview', label: 'Overview', icon: User },
          { id: 'goals', label: 'Goals & Vision', icon: Target },
          { id: 'brand', label: 'Brand & Voice', icon: Sparkles },
          { id: 'podcast', label: 'Podcast Preferences', icon: MessageSquare },
          { id: 'content', label: 'Content & Bio', icon: TrendingUp },
          { id: 'aimatches', label: 'AI Matches', icon: Zap },
          { id: 'wishlist', label: 'Wishlist', icon: Heart },
          { id: 'outreach', label: 'Outreach', icon: Radio }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors
              ${activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
            `}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Identity */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <User size={20} className="text-indigo-600" />
                Identity & Contact
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-slate-500 font-medium">First Name</label>
                  <p className="text-slate-900">{client.identity?.firstName || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-slate-500 font-medium">Last Name</label>
                  <p className="text-slate-900">{client.identity?.lastName || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-slate-500 font-medium">Job Title</label>
                  <p className="text-slate-900">{client.identity?.jobTitle || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-slate-500 font-medium">Company</label>
                  <p className="text-slate-900">{client.identity?.company || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-slate-500 font-medium">Company Size</label>
                  <p className="text-slate-900">{client.identity?.companySize || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-slate-500 font-medium">Representation Type</label>
                  <p className="text-slate-900">{client.identity?.representationType || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Current Status */}
            {client.currentStatus && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp size={20} className="text-indigo-600" />
                  Current Status
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-slate-500 font-medium">Online Presence Rating</label>
                    <p className="text-slate-900">{client.currentStatus.onlinePresenceRating || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-slate-500 font-medium">Content Frequency</label>
                    <p className="text-slate-900">{client.currentStatus.contentFrequency || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-slate-500 font-medium">Platforms Used</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {client.currentStatus.platformsUsed?.map(platform => (
                        <span key={platform} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
                          {platform}
                        </span>
                      ))}
                    </div>
                  </div>
                  {client.currentStatus.channelReach && (
                    <div className="col-span-2">
                      <label className="text-slate-500 font-medium">Channel Reach</label>
                      <p className="text-slate-900 text-xs">{client.currentStatus.channelReach}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tags */}
            {client.metadata?.tags && client.metadata.tags.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {client.metadata.tags.map(tag => (
                    <span key={tag} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* GOALS TAB */}
        {activeTab === 'goals' && client.goals && (
          <div className="space-y-6">
            <InfoCard title="Professional Goals" icon={Target} content={client.goals.professionalGoals} />
            <InfoCard title="Work Description" content={client.goals.workDescription} />
            <InfoCard title="Mission Description" content={client.goals.missionDescription} />
            <InfoCard title="Why Now?" content={client.goals.whyNow} />
            <InfoCard title="Top 3 Goals" content={client.goals.top3Goals} highlight />
            <InfoCard title="Challenges" content={client.goals.challenges} />
            <InfoCard title="Success Definition" content={client.goals.successDefinition} highlight />
          </div>
        )}

        {/* BRAND TAB */}
        {activeTab === 'brand' && client.brandPersonality && (
          <div className="space-y-6">
            <InfoCard title="Three Adjectives" icon={Sparkles} content={client.brandPersonality.threeAdjectives} highlight />
            <InfoCard title="How Audience Should Feel" content={client.brandPersonality.audienceFeeling} />
            <InfoCard title="Key Phrases" content={client.brandPersonality.keyPhrases} />
            <InfoCard title="Common Misunderstandings" content={client.brandPersonality.commonMisunderstandings} />
            <InfoCard title="Passion Topics" content={client.brandPersonality.passionTopics} highlight />
            <InfoCard title="Phrases to Avoid" content={client.brandPersonality.phrasesToAvoid} />
            <InfoCard title="Admired Brands" content={client.brandPersonality.admiredBrands} />
          </div>
        )}

        {/* PODCAST TAB */}
        {activeTab === 'podcast' && client.podcast && (
          <div className="space-y-6">
            <InfoCard title="Target Audience" icon={MessageSquare} content={client.podcast.audienceDescription} />
            <InfoCard title="Products/Services" content={client.podcast.productsServices} />
            <InfoCard title="Dream Podcasts" content={client.podcast.dreamPodcasts} highlight />
            <InfoCard title="Key Questions" content={client.podcast.keyQuestions} />
            <InfoCard title="Unasked Question" content={client.podcast.unaskedQuestion} />
            <InfoCard title="Listener Takeaways" content={client.podcast.listenerTakeaways} />

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-slate-500 font-medium">Target Location</label>
                  <p className="text-slate-900">{client.podcast.targetLocation}</p>
                </div>
                <div>
                  <label className="text-slate-500 font-medium">Open to In-Person</label>
                  <p className="text-slate-900">{client.podcast.openToInPerson ? 'Yes ✓' : 'No'}</p>
                </div>
              </div>
            </div>

            {client.podcast.upcomingLaunches && (
              <InfoCard title="Upcoming Launches" content={client.podcast.upcomingLaunches} highlight />
            )}
          </div>
        )}

        {/* CONTENT TAB */}
        {activeTab === 'content' && client.content && (
          <div className="space-y-6">
            {/* AI Bio Enhancement Button */}
            {client.content.bioOriginal && !client.content.bioUpdated && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-dashed border-indigo-300 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                      <Wand2 size={20} className="text-indigo-600" />
                      Enhance Bio with AI
                    </h3>
                    <p className="text-sm text-slate-600">
                      Transform your original bio into a compelling, storytelling-driven professional bio using AI.
                    </p>
                  </div>
                  <button
                    onClick={handleEnhanceBio}
                    disabled={isGeneratingBio}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
                  >
                    {isGeneratingBio ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 size={18} />
                        Generate Enhanced Bio
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {client.content.bioOriginal && (
              <InfoCard title="Bio (Original)" content={client.content.bioOriginal} />
            )}
            {client.content.bioUpdated && (
              <InfoCard title="Bio (Updated)" content={client.content.bioUpdated} highlight />
            )}
            {client.content.speakingTopicsOriginal && (
              <InfoCard title="Speaking Topics (Original)" content={client.content.speakingTopicsOriginal} />
            )}
            {client.content.speakingTopicsUpdated && (
              <InfoCard title="Speaking Topics (Updated)" content={client.content.speakingTopicsUpdated} highlight />
            )}
            {client.content.speakingTopicsArray && client.content.speakingTopicsArray.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Speaking Topics</h3>
                <div className="flex flex-wrap gap-2">
                  {client.content.speakingTopicsArray.map(topic => (
                    <span key={topic} className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-200">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI MATCHES TAB */}
        {activeTab === 'aimatches' && (
          <div className="space-y-6">
            {/* AI Matches Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">AI Podcast Matches</h3>
                <p className="text-sm text-slate-500">Podcasts matched by AI based on client profile</p>
              </div>
              <button
                onClick={handleGenerateMatches}
                disabled={generatingMatches}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all"
              >
                {generatingMatches ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Zap size={16} />
                )}
                {generatingMatches ? 'Generating...' : 'Generate New Matches'}
              </button>
            </div>

            {/* Match Stats */}
            {matchStats && (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                  <div className="text-sm text-slate-600 mb-1">Total</div>
                  <div className="text-2xl font-bold text-slate-900">{matchStats.total}</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 shadow-sm">
                  <div className="text-sm text-yellow-700 mb-1">Pending</div>
                  <div className="text-2xl font-bold text-yellow-900">{matchStats.pending}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200 shadow-sm">
                  <div className="text-sm text-green-700 mb-1">Approved</div>
                  <div className="text-2xl font-bold text-green-900">{matchStats.approved}</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200 shadow-sm">
                  <div className="text-sm text-red-700 mb-1">Rejected</div>
                  <div className="text-2xl font-bold text-red-900">{matchStats.rejected}</div>
                </div>
              </div>
            )}

            {/* Matches List */}
            {loadingMatches ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="ml-2 text-slate-600">Loading matches...</span>
              </div>
            ) : aiMatches.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                <Zap className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 mb-4">No AI matches yet</p>
                <button
                  onClick={handleGenerateMatches}
                  disabled={generatingMatches}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Generate First Matches
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {aiMatches.map(match => (
                  <div
                    key={match.id}
                    className={`bg-white p-4 rounded-lg border shadow-sm ${
                      match.status === 'pending' ? 'border-yellow-200' :
                      match.status === 'approved' ? 'border-green-200' :
                      'border-red-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Podcast Image */}
                      {match.podcast?.imageUrl && (
                        <img
                          src={match.podcast.imageUrl}
                          alt={match.podcast.title || 'Podcast'}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      )}

                      {/* Match Info */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-bold text-slate-900">
                            {match.podcast?.title || 'Unknown Podcast'}
                          </h4>
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            match.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            match.status === 'approved' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            <Star size={12} />
                            {match.match_score}/100
                          </div>
                        </div>

                        <p className="text-sm text-slate-600 mb-2">{match.match_reasoning}</p>

                        {/* Topics */}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {match.match_topics.slice(0, 5).map(topic => (
                            <span key={topic} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                              {topic}
                            </span>
                          ))}
                        </div>

                        {/* Actions */}
                        {match.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApproveMatch(match.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
                            >
                              <CheckCircle size={14} />
                              Approve & Create Outreach
                            </button>
                            <button
                              onClick={() => handleRejectMatch(match.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
                            >
                              <XCircle size={14} />
                              Reject
                            </button>
                            {match.podcast?.apple_api_url && (
                              <a
                                href={match.podcast.apple_api_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-3 py-1.5 text-slate-600 hover:text-indigo-600 text-sm"
                              >
                                <ExternalLink size={14} />
                                View
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* WISHLIST TAB */}
        {activeTab === 'wishlist' && (
          <div className="space-y-6">
            {/* Wishlist Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Podcast Wishlist</h3>
                <p className="text-sm text-slate-500">Podcasts manually tagged as good fits</p>
              </div>
              <div className="text-sm text-slate-600">
                {wishlistItems.filter(i => i.status === 'wishlist').length} pending
              </div>
            </div>

            {/* Wishlist Items */}
            {loadingWishlist ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="ml-2 text-slate-600">Loading wishlist...</span>
              </div>
            ) : wishlistItems.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                <Heart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 mb-2">No podcasts in wishlist yet</p>
                <p className="text-sm text-slate-500">Browse podcasts and add them to this client's wishlist</p>
              </div>
            ) : (
              <div className="space-y-3">
                {wishlistItems.map(item => (
                  <div
                    key={item.id}
                    className={`bg-white p-4 rounded-lg border shadow-sm ${
                      item.status === 'wishlist' ? 'border-pink-200' :
                      item.status === 'outreach' ? 'border-green-200' :
                      'border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Podcast Image */}
                      {item.podcast?.imageUrl && (
                        <img
                          src={item.podcast.imageUrl}
                          alt={item.podcast.title || 'Podcast'}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      )}

                      {/* Info */}
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900">
                          {item.podcast?.title || item.podcast_itunes_id}
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span>Added by {item.added_by}</span>
                          <span>
                            {item.added_at?.toDate?.().toLocaleDateString() || 'Unknown date'}
                          </span>
                          {item.priority && (
                            <span className={`px-2 py-0.5 rounded ${
                              item.priority === 'high' ? 'bg-red-100 text-red-700' :
                              item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {item.priority}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-sm text-slate-600 mt-1">{item.notes}</p>
                        )}
                      </div>

                      {/* Status & Actions */}
                      <div className="flex items-center gap-2">
                        {item.status === 'wishlist' && (
                          <>
                            <button
                              onClick={() => handleMoveToOutreach(item.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm font-medium"
                            >
                              <Send size={14} />
                              Start Outreach
                            </button>
                            <button
                              onClick={() => handleRemoveFromWishlist(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        {item.status === 'outreach' && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                            Outreach Created
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* OUTREACH TAB */}
        {activeTab === 'outreach' && (
          <div className="space-y-6">
            {/* Outreach Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <div className="text-sm text-slate-600 mb-1">Total Podcasts</div>
                <div className="text-2xl font-bold text-slate-900">{outreach.length}</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 shadow-sm">
                <div className="text-sm text-blue-700 mb-1">Sent</div>
                <div className="text-2xl font-bold text-blue-900">
                  {outreach.filter(item => item['Outreach Status'] === '1st message sent' || item['Outreach Status'] === '1st follow- up sent' || item['Outreach Status'] === '2nd follow-up sent').length}
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 shadow-sm">
                <div className="text-sm text-purple-700 mb-1">Scheduled</div>
                <div className="text-2xl font-bold text-purple-900">
                  {outreach.filter(item => item['Outreach Status'] === 'Recording Scheduled' || item['Outreach Status'] === 'Screening Call Scheduled').length}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 shadow-sm">
                <div className="text-sm text-green-700 mb-1">Live</div>
                <div className="text-2xl font-bold text-green-900">
                  {outreach.filter(item => item['Outreach Status'] === 'Live').length}
                </div>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search podcasts..."
                  value={outreachSearch}
                  onChange={(e) => setOutreachSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <select
                value={outreachStatusFilter}
                onChange={(e) => setOutreachStatusFilter(e.target.value)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm"
              >
                <option value="all">All Status</option>
                <option value="ready_for_outreach">Ready for Outreach</option>
                <option value="1st_email_sent">1st Email Sent</option>
                <option value="1st_followup_sent">1st Follow-up Sent</option>
                <option value="2nd_followup_sent">2nd Follow-up Sent</option>
                <option value="in_contact">In Contact</option>
                <option value="scheduling_screening">Scheduling Screening</option>
                <option value="screening_scheduled">Screening Scheduled</option>
                <option value="scheduling_recording">Scheduling Recording</option>
                <option value="recording_scheduled">Recording Scheduled</option>
                <option value="recorded">Recorded</option>
                <option value="live">Live</option>
              </select>
            </div>

            {/* Outreach Table */}
            {loadingOutreach ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center">
                <RefreshCw className="animate-spin mx-auto text-slate-400 mb-2" size={32} />
                <p className="text-slate-500">Loading outreach data...</p>
              </div>
            ) : filteredOutreach.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center">
                <Radio className="mx-auto text-slate-300 mb-3" size={48} />
                <p className="text-slate-500 font-medium mb-1">No outreach yet</p>
                <p className="text-sm text-slate-400">Podcast outreach for this client will appear here</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Podcast
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          iTunes ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Host Contact
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Data Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Outreach Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Date Added
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredOutreach.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          {/* Podcast */}
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <div className="font-medium text-slate-900">{item.showName}</div>
                                {item.showLink && (
                                  <a
                                    href={item.showLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-1"
                                  >
                                    View Podcast <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                              {item.needsManualReview && (
                                <AlertCircle className="text-yellow-500 flex-shrink-0" size={16} />
                              )}
                            </div>
                          </td>

                          {/* iTunes ID */}
                          <td className="px-4 py-3">
                            {editingItunesId === item.id ? (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={editItunesValue}
                                  onChange={(e) => setEditItunesValue(e.target.value)}
                                  placeholder="Enter iTunes ID"
                                  className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveItunesId(item.id)}
                                  className="p-1 text-green-600 hover:text-green-800"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingItunesId(null);
                                    setEditItunesValue('');
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-600"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {item.itunesId ? (
                                  <span className="text-sm font-mono text-slate-900">{item.itunesId}</span>
                                ) : (
                                  <span className="text-sm text-slate-400 italic">Not set</span>
                                )}
                                {item.needsManualReview && (
                                  <button
                                    onClick={() => {
                                      setEditingItunesId(item.id);
                                      setEditItunesValue(item.itunesId || '');
                                    }}
                                    className="p-1 text-indigo-600 hover:text-indigo-800"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Host Contact */}
                          <td className="px-4 py-3">
                            {(() => {
                              const bestEmail = getBestHostEmail(item);
                              const isEditing = editingEmailId === item.id;

                              return isEditing ? (
                                <div className="flex gap-2">
                                  <input
                                    type="email"
                                    value={editEmailValue}
                                    onChange={(e) => setEditEmailValue(e.target.value)}
                                    placeholder="Enter email"
                                    className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 w-48"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleSaveHostEmail(item.id)}
                                    className="p-1 text-green-600 hover:text-green-800"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingEmailId(null);
                                      setEditEmailValue('');
                                    }}
                                    className="p-1 text-slate-400 hover:text-slate-600"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    {/* Confidence Icon */}
                                    {bestEmail.email && (
                                      <>
                                        {bestEmail.confidence === 'high' && (
                                          <CheckCircle className="text-green-600 flex-shrink-0" size={14} />
                                        )}
                                        {bestEmail.confidence === 'medium' && (
                                          <AlertCircle className="text-yellow-600 flex-shrink-0" size={14} />
                                        )}
                                        {bestEmail.confidence === 'low' && (
                                          <XCircle className="text-red-600 flex-shrink-0" size={14} />
                                        )}
                                      </>
                                    )}

                                    {/* Email */}
                                    <div className="flex-1 min-w-0">
                                      {bestEmail.email ? (
                                        <div className="text-sm text-slate-900 truncate">{bestEmail.email}</div>
                                      ) : (
                                        <div className="text-sm text-slate-400 italic">No email</div>
                                      )}
                                      <div className="text-xs text-slate-500">
                                        {bestEmail.source && `${bestEmail.source} • ${bestEmail.confidence}`}
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                      {/* Edit button */}
                                      <button
                                        onClick={() => {
                                          setEditingEmailId(item.id);
                                          setEditEmailValue(bestEmail.email || '');
                                        }}
                                        className="p-1 text-indigo-600 hover:text-indigo-800"
                                        title="Edit email"
                                      >
                                        <Edit2 size={14} />
                                      </button>

                                      {/* Show all emails button */}
                                      {bestEmail.allEmails.length > 1 && (
                                        <button
                                          onClick={() => setShowEmailModalId(item.id)}
                                          className="p-1 text-slate-600 hover:text-slate-800"
                                          title={`${bestEmail.allEmails.length} emails available`}
                                        >
                                          <Info size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* LinkedIn */}
                                  {item.hostContactInfo.linkedin && (
                                    <a
                                      href={item.hostContactInfo.linkedin}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-indigo-600 hover:text-indigo-800 text-xs flex items-center gap-1"
                                    >
                                      LinkedIn <ExternalLink size={10} />
                                    </a>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Data Status */}
                          <td className="px-4 py-3">
                            <select
                              value={item.status}
                              onChange={(e) => handleOutreachStatusChange(item.id, e.target.value as OutreachDocument['status'])}
                              className={`text-xs px-2 py-1 rounded-full border ${
                                item.status === 'needs_itunes_id'
                                  ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                  : item.status === 'identified'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                            >
                              <option value="needs_itunes_id">Needs iTunes ID</option>
                              <option value="identified">Identified</option>
                            </select>
                          </td>

                          {/* Outreach Status */}
                          <td className="px-4 py-3">
                            <select
                              value={item['Outreach Status'] || ''}
                              onChange={(e) => handleWorkflowStatusChange(item.id, e.target.value as OutreachDocument['Outreach Status'])}
                              className={`text-xs px-2 py-1 rounded-full border ${
                                !item['Outreach Status']
                                  ? 'bg-slate-100 text-slate-800 border-slate-300'
                                  : item['Outreach Status'] === 'Ready for outreach'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : item['Outreach Status'] === '1st message sent' || item['Outreach Status'] === '1st follow- up sent' || item['Outreach Status'] === '2nd follow-up sent'
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                  : item['Outreach Status'] === 'Scheduling Screening Call' || item['Outreach Status'] === 'Screening Call Scheduled' || item['Outreach Status'] === 'Scheduling Recording'
                                  ? 'bg-purple-100 text-purple-800 border-purple-300'
                                  : item['Outreach Status'] === 'Recording Scheduled' || item['Outreach Status'] === 'Recorded'
                                  ? 'bg-orange-100 text-orange-800 border-orange-300'
                                  : item['Outreach Status'] === 'Live'
                                  ? 'bg-green-100 text-green-800 border-green-300'
                                  : item['Outreach Status'] === 'Host said no' || item['Outreach Status'] === 'Email bounced'
                                  ? 'bg-red-100 text-red-800 border-red-300'
                                  : item['Outreach Status'] === 'Paid podcast' || item['Outreach Status'] === 'Blacklist'
                                  ? 'bg-gray-100 text-gray-800 border-gray-300'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                            >
                              <option value="">Not Set</option>
                              <option value="Ready for outreach">Ready for Outreach</option>
                              <option value="1st message sent">1st Message Sent</option>
                              <option value="1st follow- up sent">1st Follow-up Sent</option>
                              <option value="2nd follow-up sent">2nd Follow-up Sent</option>
                              <option value="Scheduling Screening Call">Scheduling Screening Call</option>
                              <option value="Screening Call Scheduled">Screening Call Scheduled</option>
                              <option value="Scheduling Recording">Scheduling Recording</option>
                              <option value="Recording Scheduled">Recording Scheduled</option>
                              <option value="Recorded">Recorded</option>
                              <option value="Live">Live</option>
                              <option value="Host said no">Host Said No</option>
                              <option value="Email bounced">Email Bounced</option>
                              <option value="Paid podcast">Paid Podcast</option>
                              <option value="Blacklist">Blacklist</option>
                            </select>
                          </td>

                          {/* Date Added */}
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-500">
                              {item.createdAt && new Date(item.createdAt.toDate()).toLocaleDateString()}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Email Selection Modal */}
      {showEmailModalId && (() => {
        const currentOutreach = outreach.find(item => item.id === showEmailModalId);
        if (!currentOutreach) return null;

        const bestEmail = getBestHostEmail(currentOutreach);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex justify-between items-center rounded-t-xl">
                <h2 className="text-xl font-bold text-white">
                  Select Host Email
                </h2>
                <button
                  onClick={() => setShowEmailModalId(null)}
                  className="text-white hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">
                    {currentOutreach.showName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Choose the best email address to contact this podcast host
                  </p>
                </div>

                <div className="space-y-2">
                  {bestEmail.allEmails.map((candidate, index) => (
                    <div
                      key={index}
                      className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {candidate.score >= 100 ? (
                              <CheckCircle size={18} className="text-green-600" />
                            ) : candidate.score >= 60 ? (
                              <AlertCircle size={18} className="text-yellow-600" />
                            ) : (
                              <XCircle size={18} className="text-red-600" />
                            )}
                            <span className="font-medium text-slate-900">
                              {candidate.email}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-600">
                            <span className="flex items-center gap-1">
                              <span className="font-medium">Source:</span> {candidate.sourceLabel}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="font-medium">Score:</span> {candidate.score}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full font-medium ${
                              candidate.score >= 100
                                ? 'bg-green-100 text-green-700'
                                : candidate.score >= 60
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {candidate.score >= 100 ? 'High' : candidate.score >= 60 ? 'Medium' : 'Low'} Confidence
                            </span>
                          </div>

                          {/* Show warnings for low-quality emails */}
                          {candidate.email.includes('buzzsprout') ||
                           candidate.email.includes('libsyn') ||
                           candidate.email.includes('transistor') ? (
                            <div className="mt-2 text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
                              ⚠️ Podcast hosting platform email - may not reach host directly
                            </div>
                          ) : candidate.email.includes('noreply') ||
                                candidate.email.includes('no-reply') ||
                                candidate.email.includes('donotreply') ? (
                            <div className="mt-2 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                              ❌ Generic no-reply address - likely unmonitored
                            </div>
                          ) : null}
                        </div>

                        <button
                          onClick={() => handleSelectEmail(currentOutreach.id, candidate.email)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            bestEmail.email === candidate.email
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-indigo-100 hover:text-indigo-700'
                          }`}
                        >
                          {bestEmail.email === candidate.email ? (
                            <span className="flex items-center gap-1">
                              <Check size={14} /> Current
                            </span>
                          ) : (
                            'Use This Email'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {bestEmail.allEmails.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <Mail size={48} className="mx-auto mb-2 opacity-30" />
                    <p>No email addresses found for this podcast</p>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-4 rounded-b-xl border-t border-slate-200">
                <button
                  onClick={() => setShowEmailModalId(null)}
                  className="w-full bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-300 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Modal - ALL TABS AT ONCE */}
      {isEditing && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-slate-900">
                Edit Client Profile
              </h2>
              <button
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-8">
              {/* SECTION 1: Identity */}
              <div className="border-b border-slate-200 pb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User size={20} className="text-indigo-600" />
                  Identity & Contact
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                    <input type="text" value={editForm.identity?.firstName || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, firstName: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                    <input type="text" value={editForm.identity?.lastName || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, lastName: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input type="email" value={editForm.identity?.email || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, email: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                    <input type="tel" value={editForm.identity?.phone || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, phone: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Job Title</label>
                    <input type="text" value={editForm.identity?.jobTitle || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, jobTitle: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
                    <input type="text" value={editForm.identity?.company || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, company: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Links */}
              {editForm.links && (
                <div className="border-b border-slate-200 pb-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Globe size={20} className="text-indigo-600" />
                    Links & Assets
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">LinkedIn</label>
                      <input type="url" value={editForm.links.linkedinAndSocial || ''} onChange={(e) => setEditForm({ ...editForm, links: { ...editForm.links!, linkedinAndSocial: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Headshot URL</label>
                      <input type="url" value={editForm.links.headshot || ''} onChange={(e) => setEditForm({ ...editForm, links: { ...editForm.links!, headshot: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Badassery Profile URL</label>
                      <input type="url" value={editForm.links.badasseryProfileUrl || ''} onChange={(e) => setEditForm({ ...editForm, links: { ...editForm.links!, badasseryProfileUrl: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Scheduling Link</label>
                      <input type="url" value={editForm.links.schedulingLink || ''} onChange={(e) => setEditForm({ ...editForm, links: { ...editForm.links!, schedulingLink: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: Goals & Vision */}
              {editForm.goals && (
                <div className="border-b border-slate-200 pb-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Target size={20} className="text-indigo-600" />
                    Goals & Vision
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Professional Goals</label>
                      <textarea rows={2} value={editForm.goals.professionalGoals || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, professionalGoals: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Work Description</label>
                        <textarea rows={2} value={editForm.goals.workDescription || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, workDescription: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Mission Description</label>
                        <textarea rows={2} value={editForm.goals.missionDescription || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, missionDescription: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Why Now?</label>
                        <textarea rows={2} value={editForm.goals.whyNow || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, whyNow: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Top 3 Goals</label>
                        <input type="text" value={editForm.goals.top3Goals || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, top3Goals: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Challenges</label>
                        <textarea rows={2} value={editForm.goals.challenges || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, challenges: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Success Definition</label>
                        <textarea rows={2} value={editForm.goals.successDefinition || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, successDefinition: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: Brand & Voice */}
              {editForm.brandPersonality && (
                <div className="border-b border-slate-200 pb-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Sparkles size={20} className="text-indigo-600" />
                    Brand & Voice
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Three Adjectives</label>
                        <input type="text" value={editForm.brandPersonality.threeAdjectives || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, threeAdjectives: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">How Audience Should Feel</label>
                        <input type="text" value={editForm.brandPersonality.audienceFeeling || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, audienceFeeling: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Key Phrases</label>
                        <textarea rows={2} value={editForm.brandPersonality.keyPhrases || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, keyPhrases: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Passion Topics</label>
                        <textarea rows={2} value={editForm.brandPersonality.passionTopics || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, passionTopics: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Phrases to Avoid</label>
                        <textarea rows={2} value={editForm.brandPersonality.phrasesToAvoid || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, phrasesToAvoid: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Admired Brands</label>
                        <input type="text" value={editForm.brandPersonality.admiredBrands || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, admiredBrands: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 5: Podcast Preferences */}
              {editForm.podcast && (
                <div className="border-b border-slate-200 pb-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <MessageSquare size={20} className="text-indigo-600" />
                    Podcast Preferences
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Target Audience</label>
                        <textarea rows={2} value={editForm.podcast.audienceDescription || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, audienceDescription: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Products/Services</label>
                        <textarea rows={2} value={editForm.podcast.productsServices || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, productsServices: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Dream Podcasts</label>
                      <textarea rows={2} value={editForm.podcast.dreamPodcasts || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, dreamPodcasts: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Key Questions</label>
                        <textarea rows={2} value={editForm.podcast.keyQuestions || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, keyQuestions: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Listener Takeaways</label>
                        <textarea rows={2} value={editForm.podcast.listenerTakeaways || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, listenerTakeaways: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Target Location</label>
                      <div className="flex flex-wrap gap-4 mt-2">
                        {TARGET_LOCATIONS.map(loc => (
                          <label key={loc} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.podcast?.targetLocations?.includes(loc) || false}
                              onChange={(e) => {
                                const currentLocations = editForm.podcast?.targetLocations || [];
                                if (e.target.checked) {
                                  setEditForm({ ...editForm, podcast: { ...editForm.podcast!, targetLocations: [...currentLocations, loc] } });
                                } else {
                                  setEditForm({ ...editForm, podcast: { ...editForm.podcast!, targetLocations: currentLocations.filter(l => l !== loc) } });
                                }
                              }}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">{loc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Open to In-Person</label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="openToInPerson"
                              checked={editForm.podcast?.openToInPerson === true}
                              onChange={() => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, openToInPerson: true } })}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">Yes</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="openToInPerson"
                              checked={editForm.podcast?.openToInPerson === false}
                              onChange={() => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, openToInPerson: false } })}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">No</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 6: Content & Bio */}
              {editForm.content && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-indigo-600" />
                    Content & Bio
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Bio (Original)</label>
                      <textarea rows={3} value={editForm.content.bioOriginal || ''} onChange={(e) => setEditForm({ ...editForm, content: { ...editForm.content!, bioOriginal: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-slate-700">Bio (Updated/Enhanced)</label>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!editForm) return;
                            try {
                              setIsGeneratingBio(true);
                              const enhanced = await enhanceBioWithGemini(editForm);
                              setEditForm({ ...editForm, content: { ...editForm.content!, bioUpdated: enhanced } });
                            } catch (error) {
                              console.error('Error enhancing bio:', error);
                              alert(`Failed to enhance bio: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            } finally {
                              setIsGeneratingBio(false);
                            }
                          }}
                          disabled={isGeneratingBio || !editForm.content?.bioOriginal?.trim()}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGeneratingBio ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Wand2 size={12} />
                              Enhance with AI
                            </>
                          )}
                        </button>
                      </div>
                      <textarea rows={3} value={editForm.content.bioUpdated || ''} onChange={(e) => setEditForm({ ...editForm, content: { ...editForm.content!, bioUpdated: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Speaking Topics (Original)</label>
                        <textarea rows={2} value={editForm.content.speakingTopicsOriginal || ''} onChange={(e) => setEditForm({ ...editForm, content: { ...editForm.content!, speakingTopicsOriginal: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Speaking Topics (Updated)</label>
                        <textarea rows={2} value={editForm.content.speakingTopicsUpdated || ''} onChange={(e) => setEditForm({ ...editForm, content: { ...editForm.content!, speakingTopicsUpdated: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Speaking Topics (Tags)</label>
                      <p className="text-xs text-slate-500 mb-2">Select from 60 standardized topics for better AI matching</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(editForm.content.speakingTopicsArray || []).map(topic => (
                          <span key={topic} className="inline-flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                            <span className="text-xs font-medium text-indigo-900">{topic}</span>
                            <button
                              type="button"
                              onClick={() => setEditForm({
                                ...editForm,
                                content: {
                                  ...editForm.content!,
                                  speakingTopicsArray: (editForm.content?.speakingTopicsArray || []).filter(t => t !== topic)
                                }
                              })}
                              className="text-indigo-600 hover:text-indigo-800"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="relative">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value && !(editForm.content?.speakingTopicsArray || []).includes(e.target.value)) {
                              setEditForm({
                                ...editForm,
                                content: {
                                  ...editForm.content!,
                                  speakingTopicsArray: [...(editForm.content?.speakingTopicsArray || []), e.target.value]
                                }
                              });
                            }
                          }}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white cursor-pointer"
                        >
                          <option value="">Select a topic to add...</option>
                          {BADASSERY_TOPICS.filter(t => !(editForm.content?.speakingTopicsArray || []).includes(t)).map(topic => (
                            <option key={topic} value={topic}>{topic}</option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {(editForm.content?.speakingTopicsArray || []).length} of 60 topics selected
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
                disabled={updating}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {updating ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bio Preview Modal */}
      {showBioPreview && generatedBio && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Wand2 size={24} />
                  AI-Enhanced Bio Preview
                </h2>
                <p className="text-sm text-indigo-100 mt-1">Review and approve the AI-generated bio</p>
              </div>
              <button
                onClick={handleRejectBio}
                className="text-white hover:text-indigo-200"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Original Bio */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Original Bio</h3>
                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                  {client?.content?.bioOriginal}
                </p>
              </div>

              {/* AI Generated Bio */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={20} className="text-indigo-600" />
                  <h3 className="text-lg font-bold text-slate-900">AI-Enhanced Bio</h3>
                </div>
                <p className="text-slate-800 whitespace-pre-wrap leading-relaxed text-base">
                  {generatedBio}
                </p>
              </div>

              {/* Comparison Note */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Review Carefully</p>
                  <p>Please verify that all facts, achievements, and details are accurate. The AI enhances storytelling but may occasionally need factual corrections.</p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleRejectBio}
                className="px-6 py-2.5 text-slate-700 hover:text-slate-900 font-semibold border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-2"
                disabled={updating}
              >
                <X size={18} />
                Reject & Regenerate
              </button>
              <button
                onClick={handleAcceptBio}
                disabled={updating}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
              >
                {updating ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Accept & Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component for info cards
const InfoCard: React.FC<{
  title: string;
  content?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  highlight?: boolean
}> = ({ title, content, icon: Icon, highlight }) => {
  if (!content) return null;

  return (
    <div className={`bg-white border rounded-xl p-6 shadow-sm ${highlight ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200'}`}>
      <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
        {Icon && <Icon size={20} className="text-indigo-600" />}
        {title}
      </h3>
      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{content}</p>
    </div>
  );
};
