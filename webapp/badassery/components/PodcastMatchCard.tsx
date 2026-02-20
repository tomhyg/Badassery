/**
 * PodcastMatchCard - Displays an AI match with approve/reject actions
 */

import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Sparkles,
  Star,
  Users,
  Mail,
  ExternalLink,
  Loader2,
  TrendingUp
} from 'lucide-react';
import { AIMatchWithPodcast } from '../types';
import { PodcastDocument } from '../services/podcastService';

interface PodcastMatchCardProps {
  match: AIMatchWithPodcast;
  onApprove: (matchId: string) => Promise<void>;
  onReject: (matchId: string) => Promise<void>;
  isLoading?: boolean;
}

export const PodcastMatchCard: React.FC<PodcastMatchCardProps> = ({
  match,
  onApprove,
  onReject,
  isLoading = false
}) => {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const podcast = match.podcast;

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove(match.id);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject(match.id);
    } finally {
      setIsRejecting(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-blue-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const disabled = isLoading || isApproving || isRejecting || match.status !== 'pending';

  return (
    <div className={`bg-white border rounded-xl shadow-sm hover:shadow-md transition-all ${
      match.status === 'approved' ? 'border-green-300 bg-green-50/30' :
      match.status === 'rejected' ? 'border-red-200 bg-red-50/30 opacity-60' :
      'border-slate-200'
    }`}>
      <div className="p-5">
        {/* Header: Image + Title + Score */}
        <div className="flex gap-4">
          {/* Podcast Image */}
          <div className="flex-shrink-0">
            <img
              src={podcast?.imageUrl || 'https://via.placeholder.com/80'}
              alt={podcast?.title || 'Podcast'}
              className="w-20 h-20 rounded-lg object-cover shadow-sm"
            />
          </div>

          {/* Title & Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-lg line-clamp-2 leading-tight">
                  {podcast?.title || 'Unknown Podcast'}
                </h3>
                {podcast?.rss_owner_name && (
                  <p className="text-sm text-slate-600 mt-1">
                    Host: <span className="font-medium">{podcast.rss_owner_name}</span>
                  </p>
                )}
              </div>

              {/* Match Score Badge */}
              <div className="flex-shrink-0 text-center">
                <div className={`text-2xl font-bold ${getScoreTextColor(match.match_score)}`}>
                  {match.match_score}
                </div>
                <div className="text-xs text-slate-500 font-medium">/100</div>
              </div>
            </div>

            {/* Score Bar */}
            <div className="mt-3">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getScoreColor(match.match_score)} transition-all duration-500`}
                  style={{ width: `${match.match_score}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 mt-4 text-sm">
          {podcast?.ai_badassery_score && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 text-purple-700 rounded-lg">
              <Sparkles size={14} />
              <span className="font-semibold">{podcast.ai_badassery_score.toFixed(1)}</span>
            </div>
          )}

          {podcast?.apple_rating && (
            <div className="flex items-center gap-1 text-yellow-600">
              <Star size={14} fill="currentColor" />
              <span className="font-medium">{podcast.apple_rating.toFixed(1)}</span>
              {podcast.apple_rating_count && (
                <span className="text-slate-400 text-xs">({podcast.apple_rating_count})</span>
              )}
            </div>
          )}

          {podcast?.ai_audience_size && (
            <div className="flex items-center gap-1 text-slate-600">
              <Users size={14} />
              <span>{podcast.ai_audience_size}</span>
            </div>
          )}

          {podcast?.ai_global_percentile && (
            <div className="flex items-center gap-1 text-blue-600">
              <TrendingUp size={14} />
              <span className="font-medium">{podcast.ai_global_percentile}</span>
            </div>
          )}
        </div>

        {/* AI Reasoning */}
        <div className="mt-4 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
          <div className="flex items-center gap-2 text-purple-700 text-xs font-semibold mb-1.5 uppercase tracking-wide">
            <Sparkles size={12} />
            AI Match Reasoning
          </div>
          <p className="text-slate-700 text-sm leading-relaxed">
            {match.match_reasoning}
          </p>
        </div>

        {/* Match Topics */}
        {match.match_topics && match.match_topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {match.match_topics.map((topic, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium border border-slate-200"
              >
                {topic}
              </span>
            ))}
          </div>
        )}

        {/* Email & Links */}
        <div className="mt-4 flex items-center gap-3 text-sm">
          {(podcast?.rss_owner_email || podcast?.website_email) && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Mail size={14} className="text-slate-400" />
              <span className="truncate max-w-[200px]">
                {podcast.rss_owner_email || podcast.website_email}
              </span>
            </div>
          )}

          {podcast?.apple_api_url && (
            <a
              href={podcast.apple_api_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
            >
              <ExternalLink size={14} />
              View
            </a>
          )}
        </div>

        {/* Status Badge (for approved/rejected) */}
        {match.status !== 'pending' && (
          <div className={`mt-4 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
            match.status === 'approved'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {match.status === 'approved' ? (
              <>
                <CheckCircle size={16} />
                Approved - Outreach Created
              </>
            ) : (
              <>
                <XCircle size={16} />
                Rejected
              </>
            )}
          </div>
        )}

        {/* Action Buttons (only for pending) */}
        {match.status === 'pending' && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
            <button
              onClick={handleApprove}
              disabled={disabled}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isApproving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating Outreach...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  Approve
                </>
              )}
            </button>

            <button
              onClick={handleReject}
              disabled={disabled}
              className="flex-1 px-4 py-2.5 bg-white text-red-600 font-medium rounded-lg border border-red-200 hover:bg-red-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isRejecting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Replacing...
                </>
              ) : (
                <>
                  <XCircle size={18} />
                  Reject
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
