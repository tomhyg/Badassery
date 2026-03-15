import React, { useState, useEffect } from 'react';
import {
  getFollowUpCandidates,
  generateFollowUpEmail,
  FollowUpCandidate
} from '../services/outreachAutomationService';
import { sendEmail } from '../services/gmailService';
import { addEmailToThreadV2, updateOutreachStatusV2 } from '../services/outreachServiceV2';
import { Timestamp } from 'firebase/firestore';
import {
  X, Mail, Calendar, AlertCircle, Send, RefreshCw,
  CheckCircle2, Clock, User, Award
} from 'lucide-react';

interface FollowUpReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  geminiApiKey: string;
  gmailAccessToken: string;
  onEmailSent?: () => void;
}

interface GeneratedEmail {
  candidate: FollowUpCandidate;
  subject: string;
  body: string;
  isGenerating: boolean;
  error?: string;
}

export const FollowUpReviewModal: React.FC<FollowUpReviewModalProps> = ({
  isOpen,
  onClose,
  geminiApiKey,
  gmailAccessToken,
  onEmailSent
}) => {
  const [candidates, setCandidates] = useState<FollowUpCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [generatedEmails, setGeneratedEmails] = useState<Map<string, GeneratedEmail>>(new Map());
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCandidates();
    }
  }, [isOpen]);

  const loadCandidates = async () => {
    try {
      setLoading(true);
      const data = await getFollowUpCandidates();
      setCandidates(data);
      setSelectedIndex(0);

      // Auto-generate email for first candidate
      if (data.length > 0) {
        await generateEmailForCandidate(data[0], 0);
      }
    } catch (error) {
      console.error('Error loading follow-up candidates:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateEmailForCandidate = async (candidate: FollowUpCandidate, index: number) => {
    const key = candidate.outreach.id;

    // Mark as generating
    setGeneratedEmails(prev => {
      const updated = new Map(prev);
      updated.set(key, {
        candidate,
        subject: '',
        body: '',
        isGenerating: true
      });
      return updated;
    });

    try {
      const { subject, body } = await generateFollowUpEmail(candidate, geminiApiKey);

      setGeneratedEmails(prev => {
        const updated = new Map(prev);
        updated.set(key, {
          candidate,
          subject,
          body,
          isGenerating: false
        });
        return updated;
      });
    } catch (error) {
      console.error('Error generating email:', error);
      setGeneratedEmails(prev => {
        const updated = new Map(prev);
        updated.set(key, {
          candidate,
          subject: '',
          body: '',
          isGenerating: false,
          error: error instanceof Error ? error.message : 'Failed to generate email'
        });
        return updated;
      });
    }
  };

  const handleSelectCandidate = async (index: number) => {
    setSelectedIndex(index);
    const candidate = candidates[index];
    const key = candidate.outreach.id;

    // Generate email if not already generated
    if (!generatedEmails.has(key)) {
      await generateEmailForCandidate(candidate, index);
    }
  };

  const handleRegenerateEmail = async () => {
    const candidate = candidates[selectedIndex];
    await generateEmailForCandidate(candidate, selectedIndex);
  };

  const handleEditSubject = (newSubject: string) => {
    const candidate = candidates[selectedIndex];
    const key = candidate.outreach.id;
    const current = generatedEmails.get(key);

    if (current) {
      setGeneratedEmails(prev => {
        const updated = new Map(prev);
        updated.set(key, { ...current, subject: newSubject });
        return updated;
      });
    }
  };

  const handleEditBody = (newBody: string) => {
    const candidate = candidates[selectedIndex];
    const key = candidate.outreach.id;
    const current = generatedEmails.get(key);

    if (current) {
      setGeneratedEmails(prev => {
        const updated = new Map(prev);
        updated.set(key, { ...current, body: newBody });
        return updated;
      });
    }
  };

  const handleSendEmail = async () => {
    const candidate = candidates[selectedIndex];
    const key = candidate.outreach.id;
    const generated = generatedEmails.get(key);

    if (!generated || !generated.subject || !generated.body) {
      setSendError('Email subject and body are required');
      return;
    }

    if (!gmailAccessToken) {
      setSendError('Gmail access token not available. Please configure Gmail in Settings.');
      return;
    }

    setIsSending(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      // Send email via Gmail API
      const result = await sendEmail(
        {
          to: candidate.outreach.host_email || '',
          subject: generated.subject,
          body: generated.body,
          from: 'Ruth Kimani <ruth@badassery.co>',
          inReplyTo: candidate.lastEmail.message_id // For email threading
        },
        gmailAccessToken
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to send email');
      }

      // Save email to Firestore
      await addEmailToThreadV2(candidate.outreach.id, {
        id: result.messageId || `email_${Date.now()}`,
        direction: 'outbound',
        type: candidate.nextEmailType,
        from: 'ruth@badassery.co',
        to: candidate.outreach.host_email || '',
        subject: generated.subject,
        body: generated.body,
        sent_at: Timestamp.now(),
        generated_by_ai: true,
        ai_model_used: 'gemini-2.0-flash-lite',
        api_message_id: result.messageId
      });

      // Update outreach status
      const nextStatus = candidate.nextEmailType === '1st_followup'
        ? '1st_followup_sent'
        : '2nd_followup_sent';

      await updateOutreachStatusV2(candidate.outreach.id, nextStatus);

      setSendSuccess(`Follow-up email sent successfully to ${candidate.outreach.host_email}`);

      // Remove this candidate from the list
      const updatedCandidates = candidates.filter((_, i) => i !== selectedIndex);
      setCandidates(updatedCandidates);

      // Reset to first candidate
      if (updatedCandidates.length > 0) {
        setSelectedIndex(0);
        if (!generatedEmails.has(updatedCandidates[0].outreach.id)) {
          await generateEmailForCandidate(updatedCandidates[0], 0);
        }
      } else {
        // No more candidates, close modal
        setTimeout(() => {
          onClose();
          if (onEmailSent) onEmailSent();
        }, 2000);
      }

      // Call callback
      if (onEmailSent) onEmailSent();

    } catch (error) {
      console.error('Error sending follow-up email:', error);
      setSendError(error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const currentCandidate = candidates[selectedIndex];
  const currentGenerated = currentCandidate ? generatedEmails.get(currentCandidate.outreach.id) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Mail className="text-indigo-600" size={24} />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Follow-up Email Review</h2>
              <p className="text-sm text-gray-500 mt-1">
                {candidates.length} follow-up{candidates.length !== 1 ? 's' : ''} ready to send
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <RefreshCw className="animate-spin text-indigo-600 mx-auto mb-4" size={48} />
              <p className="text-gray-600">Loading follow-up candidates...</p>
            </div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <CheckCircle2 className="text-green-600 mx-auto mb-4" size={48} />
              <h3 className="text-xl font-bold text-gray-900 mb-2">All Caught Up!</h3>
              <p className="text-gray-600">No follow-ups needed at this time.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar - Candidate List */}
            <div className="w-80 border-r border-gray-200 overflow-y-auto">
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h3 className="font-bold text-gray-900 text-sm">Pending Follow-ups</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {candidates.map((candidate, index) => {
                  const isSelected = index === selectedIndex;
                  const generated = generatedEmails.get(candidate.outreach.id);

                  return (
                    <button
                      key={candidate.outreach.id}
                      onClick={() => handleSelectCandidate(index)}
                      className={`w-full text-left p-4 transition-colors ${
                        isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        {candidate.outreach.client?.identity?.profilePictureUrl ? (
                          <img
                            src={candidate.outreach.client.identity.profilePictureUrl}
                            alt={candidate.outreach.client_name}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <User size={20} className="text-gray-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 text-sm truncate">
                            {candidate.outreach.podcast_name}
                          </h4>
                          <p className="text-xs text-gray-600 truncate">
                            {candidate.outreach.client_name}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Clock size={12} />
                        <span className={candidate.daysWaiting > 7 ? 'text-red-600 font-medium' : ''}>
                          {candidate.daysWaiting} days overdue
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          candidate.nextEmailType === '1st_followup'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-violet-100 text-violet-700'
                        }`}>
                          {candidate.nextEmailType === '1st_followup' ? '1st Follow-up' : '2nd Follow-up'}
                        </span>
                        {generated?.isGenerating && (
                          <RefreshCw size={12} className="animate-spin text-indigo-600" />
                        )}
                        {generated && !generated.isGenerating && !generated.error && (
                          <CheckCircle2 size={12} className="text-green-600" />
                        )}
                        {generated?.error && (
                          <AlertCircle size={12} className="text-red-600" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Content - Email Editor */}
            {currentCandidate && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Candidate Info Header */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                  <div className="flex items-start gap-4">
                    {currentCandidate.outreach.podcast?.imageUrl && (
                      <img
                        src={currentCandidate.outreach.podcast.imageUrl}
                        alt={currentCandidate.outreach.podcast_name}
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {currentCandidate.outreach.podcast_name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                        <span className="flex items-center gap-1">
                          <User size={14} />
                          {currentCandidate.outreach.client_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail size={14} />
                          {currentCandidate.outreach.host_email}
                        </span>
                        {currentCandidate.outreach.podcast?.ai_badassery_score && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 rounded-md">
                            <Award size={14} className="text-purple-600" />
                            <span className="font-bold text-purple-700">
                              {currentCandidate.outreach.podcast.ai_badassery_score.toFixed(1)}
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                          currentCandidate.nextEmailType === '1st_followup'
                            ? 'bg-purple-200 text-purple-800'
                            : 'bg-violet-200 text-violet-800'
                        }`}>
                          {currentCandidate.nextEmailType === '1st_followup' ? '1st Follow-up' : '2nd Follow-up'}
                        </span>
                        <span className={`text-sm flex items-center gap-1 ${
                          currentCandidate.daysWaiting > 7 ? 'text-red-600 font-bold' : 'text-gray-600'
                        }`}>
                          <Clock size={14} />
                          {currentCandidate.daysWaiting} days since last email
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email Editor */}
                <div className="flex-1 overflow-y-auto p-6">
                  {currentGenerated?.isGenerating ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <RefreshCw className="animate-spin text-indigo-600 mx-auto mb-4" size={48} />
                        <p className="text-gray-600">Generating email with Gemini AI...</p>
                      </div>
                    </div>
                  ) : currentGenerated?.error ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <AlertCircle className="text-red-600 mx-auto mb-4" size={48} />
                        <h4 className="text-lg font-bold text-gray-900 mb-2">Generation Failed</h4>
                        <p className="text-gray-600 mb-4">{currentGenerated.error}</p>
                        <button
                          onClick={handleRegenerateEmail}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto"
                        >
                          <RefreshCw size={16} />
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : currentGenerated ? (
                    <div className="space-y-4">
                      {/* Subject Line */}
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          Subject Line
                        </label>
                        <input
                          type="text"
                          value={currentGenerated.subject}
                          onChange={(e) => handleEditSubject(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Email subject..."
                        />
                      </div>

                      {/* Email Body */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-bold text-gray-700">
                            Email Body
                          </label>
                          <button
                            onClick={handleRegenerateEmail}
                            className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                          >
                            <RefreshCw size={14} />
                            Regenerate
                          </button>
                        </div>
                        <textarea
                          value={currentGenerated.body}
                          onChange={(e) => handleEditBody(e.target.value)}
                          rows={12}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                          placeholder="Email body..."
                        />
                      </div>

                      {/* Original Email Context */}
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 className="text-sm font-bold text-gray-700 mb-2">Original Email Context</h4>
                        <div className="text-sm text-gray-600">
                          <p className="mb-1">
                            <span className="font-medium">Subject:</span> {currentCandidate.lastEmail.subject}
                          </p>
                          <p className="mb-2">
                            <span className="font-medium">Sent:</span>{' '}
                            {currentCandidate.lastEmail.sent_at
                              ? new Date(currentCandidate.lastEmail.sent_at.toMillis()).toLocaleDateString()
                              : 'Unknown'}
                          </p>
                          <div className="max-h-32 overflow-y-auto bg-white p-2 rounded border border-gray-200 text-xs font-mono">
                            {currentCandidate.lastEmail.body}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Footer - Actions */}
                <div className="p-6 border-t border-gray-200 bg-gray-50">
                  {sendError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-800">{sendError}</p>
                    </div>
                  )}

                  {sendSuccess && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-green-800">{sendSuccess}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Email {selectedIndex + 1} of {candidates.length}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={onClose}
                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors font-medium text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSendEmail}
                        disabled={
                          isSending ||
                          !currentGenerated ||
                          currentGenerated.isGenerating ||
                          !currentGenerated.subject ||
                          !currentGenerated.body
                        }
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSending ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send size={18} />
                            Send Follow-up
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
