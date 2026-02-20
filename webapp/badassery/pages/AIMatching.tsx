/**
 * AIMatching Page - AI-powered podcast matching for clients
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Users,
  ChevronDown,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Filter,
  X,
  Settings
} from 'lucide-react';
import { PodcastMatchCard } from '../components/PodcastMatchCard';
import { getAllClients, Client } from '../services/clientService';
import {
  generateMatchesForClient,
  getEnrichedMatchesForClient,
  approveMatch,
  rejectMatch,
  getMatchStatsForClient
} from '../services/aiMatchingService';
import { getCurrentUser } from '../services/userService';
import { AIMatchWithPodcast, getClientDisplayData } from '../types';
import { BADASSERY_NICHES } from '../services/podcastService';

type TabType = 'pending' | 'approved' | 'rejected';

// Filter options for AI matching
interface MatchingFilters {
  minScore: number;
  maxScore: number;
  categories: string[];
  guestFriendlyOnly: boolean;
  hasEmailOnly: boolean;
  minReviews: number;
  matchCount: number;
}

export const AIMatching: React.FC = () => {
  // State
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);

  const [matches, setMatches] = useState<AIMatchWithPodcast[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  }>({ total: 0, pending: 0, approved: 0, rejected: 0 });

  // Filter modal state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<MatchingFilters>({
    minScore: 50,
    maxScore: 100,
    categories: [],
    guestFriendlyOnly: true,
    hasEmailOnly: true,
    minReviews: 10,
    matchCount: 10
  });

  // Load clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  // Load matches when client changes
  useEffect(() => {
    if (selectedClient) {
      loadMatches();
    }
  }, [selectedClient, activeTab]);

  const loadClients = async () => {
    setLoadingClients(true);
    try {
      const allClients = await getAllClients();
      setClients(allClients);
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoadingClients(false);
    }
  };

  const loadMatches = async () => {
    if (!selectedClient) return;

    setLoadingMatches(true);
    setError(null);

    try {
      const [enrichedMatches, matchStats] = await Promise.all([
        getEnrichedMatchesForClient(selectedClient.id!, activeTab),
        getMatchStatsForClient(selectedClient.id!)
      ]);

      setMatches(enrichedMatches);
      setStats(matchStats);
    } catch (err: any) {
      console.error('Error loading matches:', err);
      setError(err.message || 'Failed to load matches');
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleGenerateMatches = async () => {
    if (!selectedClient) {
      setError('Please select a client first');
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      setError('Please login first');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      console.log('[AIMatching] Starting generation for client:', selectedClient.id, 'with filters:', filters);
      const newMatches = await generateMatchesForClient(selectedClient.id!, user.id, filters.matchCount);
      console.log('[AIMatching] Generated matches:', newMatches);

      await loadMatches();
      setActiveTab('pending'); // Switch to pending tab to see new matches
      setSuccessMessage(`Successfully generated ${newMatches.length} podcast matches!`);

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('[AIMatching] Error generating matches:', err);
      setError(err.message || 'Failed to generate matches. Check console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = async (matchId: string) => {
    const user = getCurrentUser();
    if (!user) {
      setError('Please login first');
      return;
    }

    try {
      await approveMatch(matchId, user.id);
      await loadMatches();
    } catch (err: any) {
      console.error('Error approving match:', err);
      setError(err.message || 'Failed to approve match');
    }
  };

  const handleReject = async (matchId: string) => {
    const user = getCurrentUser();
    if (!user) {
      setError('Please login first');
      return;
    }

    try {
      const replacement = await rejectMatch(matchId, user.id);
      await loadMatches();

      if (replacement) {
        // Show notification that a replacement was generated
        console.log('Replacement match generated:', replacement);
      }
    } catch (err: any) {
      console.error('Error rejecting match:', err);
      setError(err.message || 'Failed to reject match');
    }
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setShowClientDropdown(false);
    setMatches([]);
    setActiveTab('pending');
  };

  const tabs: { id: TabType; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'pending', label: 'Pending', icon: Clock, count: stats.pending },
    { id: 'approved', label: 'Approved', icon: CheckCircle, count: stats.approved },
    { id: 'rejected', label: 'Rejected', icon: XCircle, count: stats.rejected }
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <Sparkles className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AI Podcast Matching</h1>
            <p className="text-slate-600">Find the perfect podcasts for your clients with AI</p>
          </div>
        </div>
      </div>

      {/* Client Selection & Generate */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Client Dropdown */}
          <div className="relative flex-1 min-w-[300px]">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Client
            </label>
            <button
              onClick={() => setShowClientDropdown(!showClientDropdown)}
              className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-left flex items-center justify-between hover:border-slate-400 transition-colors"
            >
              {selectedClient ? (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold">
                    {getClientDisplayData(selectedClient).contact_name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">
                      {getClientDisplayData(selectedClient).contact_name}
                    </div>
                    <div className="text-sm text-slate-500">
                      {getClientDisplayData(selectedClient).company_name}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-slate-500">Choose a client...</span>
              )}
              <ChevronDown size={20} className={`text-slate-400 transition-transform ${showClientDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {showClientDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
                {loadingClients ? (
                  <div className="p-4 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                    Loading clients...
                  </div>
                ) : clients.length === 0 ? (
                  <div className="p-4 text-center text-slate-500">
                    No clients found
                  </div>
                ) : (
                  <div className="py-2">
                    {clients.map((client) => {
                      const data = getClientDisplayData(client);
                      return (
                        <button
                          key={client.id}
                          onClick={() => handleSelectClient(client)}
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center gap-3"
                        >
                          <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold">
                            {data.contact_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900">
                              {data.contact_name}
                            </div>
                            <div className="text-sm text-slate-500 truncate">
                              {data.company_name} • {data.spokesperson.title}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filter & Generate Buttons */}
          <div className="flex-shrink-0 flex items-end gap-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 opacity-0">
                Filters
              </label>
              <button
                onClick={() => setShowFilterModal(true)}
                disabled={!selectedClient}
                className="px-4 py-3 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Settings size={20} />
                Filters
                {(filters.categories.length > 0 || !filters.guestFriendlyOnly || filters.minScore > 50) && (
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                )}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 opacity-0">
                Action
              </label>
              <button
                onClick={handleGenerateMatches}
                disabled={!selectedClient || isGenerating}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Generate {filters.matchCount} Matches
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Refresh Button */}
          {selectedClient && (
            <div className="flex-shrink-0">
              <label className="block text-sm font-medium text-slate-700 mb-2 opacity-0">
                Refresh
              </label>
              <button
                onClick={loadMatches}
                disabled={loadingMatches}
                className="px-4 py-3 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                title="Refresh matches"
              >
                <RefreshCw size={20} className={loadingMatches ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-700">
            <CheckCircle size={20} />
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-auto text-green-500 hover:text-green-700"
            >
              <XCircle size={18} />
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle size={20} />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <XCircle size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Tabs & Content */}
      {selectedClient && (
        <>
          {/* Tabs */}
          <div className="bg-white rounded-t-xl border border-b-0 border-slate-200 overflow-hidden">
            <div className="flex">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 px-6 py-4 flex items-center justify-center gap-2 font-medium transition-colors border-b-2 ${
                      isActive
                        ? 'border-purple-600 text-purple-600 bg-purple-50/50'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={18} />
                    {tab.label}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      isActive
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Matches Grid */}
          <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 shadow-sm p-6">
            {loadingMatches ? (
              <div className="text-center py-12">
                <Loader2 className="animate-spin mx-auto mb-4 text-purple-600" size={40} />
                <p className="text-slate-600">Loading matches...</p>
              </div>
            ) : matches.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  {activeTab === 'pending' ? (
                    <Clock size={32} className="text-slate-400" />
                  ) : activeTab === 'approved' ? (
                    <CheckCircle size={32} className="text-slate-400" />
                  ) : (
                    <XCircle size={32} className="text-slate-400" />
                  )}
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  No {activeTab} matches
                </h3>
                <p className="text-slate-600 max-w-md mx-auto">
                  {activeTab === 'pending'
                    ? 'Click "Generate 10 Matches" to find the best podcasts for this client.'
                    : activeTab === 'approved'
                    ? 'Approved matches will appear here. Each approved match creates an outreach automatically.'
                    : 'Rejected matches will appear here. They can be regenerated later.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {matches.map((match) => (
                  <PodcastMatchCard
                    key={match.id}
                    match={match}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isLoading={isGenerating}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* No Client Selected State */}
      {!selectedClient && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Users size={40} className="text-purple-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Select a Client to Start
          </h2>
          <p className="text-slate-600 max-w-md mx-auto">
            Choose a client from the dropdown above, then click "Generate Matches" to find
            the best podcast opportunities powered by AI.
          </p>
        </div>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Filter size={20} className="text-purple-600" />
                Match Generation Filters
              </h2>
              <button
                onClick={() => setShowFilterModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Match Count */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Number of Matches to Generate
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="5"
                    max="25"
                    step="5"
                    value={filters.matchCount}
                    onChange={(e) => setFilters({ ...filters, matchCount: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-bold text-purple-600">{filters.matchCount}</span>
                </div>
              </div>

              {/* Minimum Badassery Score */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Minimum Badassery Score
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={filters.minScore}
                    onChange={(e) => setFilters({ ...filters, minScore: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-medium text-slate-600">{filters.minScore}</span>
                </div>
              </div>

              {/* Minimum Reviews */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Minimum Reviews
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={filters.minReviews}
                    onChange={(e) => setFilters({ ...filters, minReviews: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-medium text-slate-600">{filters.minReviews}</span>
                </div>
              </div>

              {/* Toggle Filters */}
              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                  <span className="font-medium text-slate-700">Guest-Friendly Only</span>
                  <input
                    type="checkbox"
                    checked={filters.guestFriendlyOnly}
                    onChange={(e) => setFilters({ ...filters, guestFriendlyOnly: e.target.checked })}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                  <span className="font-medium text-slate-700">Must Have Email</span>
                  <input
                    type="checkbox"
                    checked={filters.hasEmailOnly}
                    onChange={(e) => setFilters({ ...filters, hasEmailOnly: e.target.checked })}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                  />
                </label>
              </div>

              {/* Category Filters */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Filter by Categories (optional)
                </label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {BADASSERY_NICHES.map(niche => (
                    <button
                      key={niche}
                      onClick={() => {
                        const newCategories = filters.categories.includes(niche)
                          ? filters.categories.filter(c => c !== niche)
                          : [...filters.categories, niche];
                        setFilters({ ...filters, categories: newCategories });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        filters.categories.includes(niche)
                          ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                          : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                      }`}
                    >
                      {niche}
                    </button>
                  ))}
                </div>
                {filters.categories.length > 0 && (
                  <button
                    onClick={() => setFilters({ ...filters, categories: [] })}
                    className="mt-2 text-sm text-purple-600 hover:text-purple-700"
                  >
                    Clear all categories
                  </button>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between sticky bottom-0 bg-white">
              <button
                onClick={() => setFilters({
                  minScore: 50,
                  maxScore: 100,
                  categories: [],
                  guestFriendlyOnly: true,
                  hasEmailOnly: true,
                  minReviews: 10,
                  matchCount: 10
                })}
                className="text-slate-600 hover:text-slate-800 font-medium"
              >
                Reset to Defaults
              </button>
              <button
                onClick={() => setShowFilterModal(false)}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
