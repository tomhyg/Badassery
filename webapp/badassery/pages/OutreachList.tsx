import React, { useState, useEffect } from 'react';
import {
  getAllOutreach,
  getOutreachNeedingReview,
  updateItunesId,
  updateOutreachStatus,
  OutreachDocument
} from '../services/outreachService';
import { getPodcastForOutreach } from '../services/podcastService';
import { Podcast } from '../types';
import { Search, Filter, AlertCircle, Check, Edit2, ExternalLink, Award } from 'lucide-react';

type EnrichedOutreach = OutreachDocument & { podcast?: Podcast | null };

export const OutreachList: React.FC = () => {
  const [outreach, setOutreach] = useState<OutreachDocument[]>([]);
  const [enrichedOutreach, setEnrichedOutreach] = useState<EnrichedOutreach[]>([]);
  const [filteredOutreach, setFilteredOutreach] = useState<EnrichedOutreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_review' | 'identified'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItunesId, setEditItunesId] = useState('');

  useEffect(() => {
    loadOutreach();
  }, []);

  // Enrich outreach with podcast data
  useEffect(() => {
    const enrichData = async () => {
      const enriched = await Promise.all(
        outreach.map(async (item) => {
          if (item.itunesId) {
            try {
              const podcast = await getPodcastForOutreach(item.itunesId);
              return { ...item, podcast };
            } catch (error) {
              console.error(`Error fetching podcast for ${item.itunesId}:`, error);
              return { ...item, podcast: null };
            }
          }
          return { ...item, podcast: null };
        })
      );
      setEnrichedOutreach(enriched);
    };

    if (outreach.length > 0) {
      enrichData();
    } else {
      setEnrichedOutreach([]);
    }
  }, [outreach]);

  useEffect(() => {
    filterOutreach();
  }, [enrichedOutreach, searchTerm, statusFilter]);

  const loadOutreach = async () => {
    try {
      setLoading(true);
      const data = await getAllOutreach();
      setOutreach(data);
    } catch (error) {
      console.error('Error loading outreach:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOutreach = () => {
    let filtered = enrichedOutreach;

    // Filter by status
    if (statusFilter === 'needs_review') {
      filtered = filtered.filter(item => item.needsManualReview);
    } else if (statusFilter === 'identified') {
      filtered = filtered.filter(item => !item.needsManualReview && item.itunesId);
    }

    // Filter by search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.showName.toLowerCase().includes(lower) ||
        item.clientName.toLowerCase().includes(lower) ||
        item.hostContactInfo.email.toLowerCase().includes(lower)
      );
    }

    setFilteredOutreach(filtered);
  };

  const handleSaveItunesId = async (id: string) => {
    try {
      await updateItunesId(id, editItunesId);
      setEditingId(null);
      setEditItunesId('');
      await loadOutreach();
    } catch (error) {
      console.error('Error updating iTunes ID:', error);
    }
  };

  const handleStatusChange = async (id: string, status: OutreachDocument['status']) => {
    try {
      await updateOutreachStatus(id, status);
      await loadOutreach();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const stats = {
    total: enrichedOutreach.length,
    needsReview: enrichedOutreach.filter(item => item.needsManualReview).length,
    identified: enrichedOutreach.filter(item => !item.needsManualReview && item.itunesId).length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading outreach data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Outreach Management</h1>
        <p className="text-gray-600">Manage podcast outreach campaigns and track progress</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Total Podcasts</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg shadow border border-yellow-200">
          <div className="text-sm text-yellow-700 mb-1">Needs Manual Review</div>
          <div className="text-2xl font-bold text-yellow-900">{stats.needsReview}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg shadow border border-green-200">
          <div className="text-sm text-green-700 mb-1">Identified</div>
          <div className="text-2xl font-bold text-green-900">{stats.identified}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200 mb-6">
        <div className="flex gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by podcast name, client, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter('needs_review')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === 'needs_review'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Needs Review ({stats.needsReview})
            </button>
            <button
              onClick={() => setStatusFilter('identified')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === 'identified'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Identified ({stats.identified})
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Podcast
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  iTunes ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Host Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOutreach.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  {/* Podcast */}
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      {/* Podcast Artwork */}
                      {item.podcast?.imageUrl && (
                        <img
                          src={item.podcast.imageUrl}
                          alt={item.showName}
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{item.showName}</div>

                        {/* Badassery Score */}
                        {item.podcast?.ai_badassery_score && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-md">
                              <Award size={12} className="text-purple-600" />
                              <span className="text-xs font-bold text-purple-700">
                                {item.podcast.ai_badassery_score.toFixed(1)}
                              </span>
                            </div>
                            {item.podcast.ai_global_percentile && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                                {item.podcast.ai_global_percentile}
                              </span>
                            )}
                          </div>
                        )}

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

                  {/* Client */}
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">{item.clientName}</div>
                  </td>

                  {/* iTunes ID */}
                  <td className="px-4 py-3">
                    {editingId === item.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editItunesId}
                          onChange={(e) => setEditItunesId(e.target.value)}
                          placeholder="Enter iTunes ID"
                          className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveItunesId(item.id)}
                          className="p-1 text-green-600 hover:text-green-800"
                        >
                          <Check size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {item.itunesId ? (
                          <span className="text-sm font-mono text-gray-900">{item.itunesId}</span>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Not set</span>
                        )}
                        {item.needsManualReview && (
                          <button
                            onClick={() => {
                              setEditingId(item.id);
                              setEditItunesId(item.itunesId || '');
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
                    <div className="text-sm space-y-1">
                      {item.hostContactInfo.email && (
                        <div className="text-gray-900">{item.hostContactInfo.email}</div>
                      )}
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
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value as OutreachDocument['status'])}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        item.status === 'needs_itunes_id'
                          ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                          : item.status === 'identified'
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : item.status === 'contacted'
                          ? 'bg-purple-100 text-purple-800 border-purple-300'
                          : item.status === 'booked'
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : 'bg-gray-100 text-gray-800 border-gray-300'
                      }`}
                    >
                      <option value="needs_itunes_id">Needs iTunes ID</option>
                      <option value="identified">Identified</option>
                      <option value="contacted">Contacted</option>
                      <option value="replied">Replied</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="booked">Booked</option>
                    </select>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-500">
                      {item.createdAt && new Date(item.createdAt.toDate()).toLocaleDateString()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredOutreach.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No outreach found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
};
