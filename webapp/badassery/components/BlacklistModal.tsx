/**
 * BlacklistModal - Modal for blacklisting podcasts with reason selection
 */

import React, { useState } from 'react';
import { X, Ban, AlertTriangle } from 'lucide-react';

const BLACKLIST_REASONS = [
  { value: 'cancelled_last_minute', label: 'Cancelled last-minute' },
  { value: 'no_show', label: 'Did not show up to recording' },
  { value: 'unprofessional', label: 'Unprofessional behavior' },
  { value: 'other', label: 'Other' },
] as const;

type BlacklistReason = typeof BLACKLIST_REASONS[number]['value'];

interface BlacklistModalProps {
  isOpen: boolean;
  podcastName: string;
  onClose: () => void;
  onConfirm: (reason: BlacklistReason, notes: string) => void;
}

export const BlacklistModal: React.FC<BlacklistModalProps> = ({
  isOpen,
  podcastName,
  onClose,
  onConfirm
}) => {
  const [reason, setReason] = useState<BlacklistReason | ''>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!reason) return;

    setIsSubmitting(true);
    try {
      await onConfirm(reason, notes);
      setReason('');
      setNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-slate-100 to-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-200 rounded-lg">
              <Ban className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Blacklist Podcast</h2>
              <p className="text-sm text-gray-600 line-clamp-1">{podcastName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Warning */}
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Blacklisting will permanently exclude this podcast from all future searches and outreach.
            </p>
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Why are you blacklisting this podcast?
            </label>
            <div className="space-y-2">
              {BLACKLIST_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    reason === r.value
                      ? 'border-slate-500 bg-slate-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="blacklist_reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="w-4 h-4 text-slate-600 border-gray-300 focus:ring-slate-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes (always visible, but required for "other") */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional notes {reason === 'other' ? '(required)' : '(optional)'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={reason === 'other' ? 'Please explain why...' : 'Any additional context...'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || (reason === 'other' && !notes.trim()) || isSubmitting}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⏳</span>
                Blacklisting...
              </>
            ) : (
              <>
                <Ban size={16} />
                Confirm Blacklist
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
