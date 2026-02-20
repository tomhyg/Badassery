import React, { useState, useEffect } from 'react';
import {
  X, Mail, RefreshCw, Copy, ExternalLink, CheckCircle, Loader2, AlertCircle, Send
} from 'lucide-react';
import { Outreach } from '../types';
import { generateContextualEmail } from '../services/outreachAutomationService';
import {
  recordEmailAction,
  getLastSentMessage,
  getPreviousMessageForAction,
  getActionLabel,
  generateFollowUpSubject,
  EmailActionType
} from '../services/outreachEmailActionsService';
import { getAIConfig } from '../services/settingsService';
import { openGmailCompose, copyEmailToClipboard, sendEmailViaCloudFunction } from '../services/emailService';

interface OutreachActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  outreach: Outreach;
  actionType: EmailActionType;
  onEmailSent: () => void;
}

export const OutreachActionModal: React.FC<OutreachActionModalProps> = ({
  isOpen,
  onClose,
  outreach,
  actionType,
  onEmailSent
}) => {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [previousMessage, setPreviousMessage] = useState<{ subject: string; body: string } | null>(null);
  const [editablePreviousMessage, setEditablePreviousMessage] = useState('');
  const [showPreviousEditor, setShowPreviousEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Get host email
  const hostEmail = outreach.host_email ||
    (outreach as any).hostContactInfo?.email ||
    (outreach as any).rss_owner_email ||
    (outreach as any).website_email ||
    '';

  // Get client email (for prep emails)
  const clientEmail = outreach.client?.identity?.email ||
    outreach.client?.contact?.email ||
    (outreach as any).client_email ||
    '';

  // Determine recipient based on action type
  // Prep emails go to CLIENT, all others go to HOST
  const recipientEmail = actionType === 'prep' ? clientEmail : hostEmail;
  const recipientLabel = actionType === 'prep' ? 'Client' : 'Host';

  // Load previous message on open (not needed for prep emails or first_email)
  useEffect(() => {
    if (isOpen && actionType !== 'prep' && actionType !== 'first_email') {
      loadPreviousMessage();
    } else if (isOpen && (actionType === 'prep' || actionType === 'first_email')) {
      // For prep emails and first pitch, generate immediately - no previous message needed
      generateEmail();
    }
  }, [isOpen, outreach.id, actionType]);

  // Generate email after previous message is loaded (for non-prep/first_email)
  useEffect(() => {
    if (isOpen && actionType !== 'prep' && actionType !== 'first_email' && (previousMessage !== null || showPreviousEditor)) {
      // Only generate once previous message state is set
      generateEmail();
    }
  }, [isOpen, previousMessage, showPreviousEditor]);

  const loadPreviousMessage = () => {
    // Use action-specific function to get the correct previous email
    const prevMessage = getPreviousMessageForAction(outreach, actionType);
    setPreviousMessage(prevMessage);

    if (prevMessage) {
      setEditablePreviousMessage(prevMessage.body);
      setShowPreviousEditor(false);
    } else {
      // No previous message found - show editor for manual paste
      setEditablePreviousMessage('');
      setShowPreviousEditor(true);
    }
  };

  const generateEmail = async () => {
    setGenerating(true);
    setError(null);

    try {
      const aiConfig = await getAIConfig();
      const apiKey = aiConfig.api_keys?.gemini;

      if (!apiKey) {
        throw new Error('Gemini API key not configured. Please configure it in Settings.');
      }

      // Use the editable previous message if available, or the loaded one
      const prevMessageForAI = editablePreviousMessage
        ? { subject: previousMessage?.subject || '', body: editablePreviousMessage }
        : previousMessage;

      console.log('[ActionModal] Generating email with previous message:', {
        hasEditablePrev: !!editablePreviousMessage,
        hasPrevMessage: !!previousMessage,
        actionType
      });

      const generated = await generateContextualEmail(
        outreach,
        actionType,
        prevMessageForAI,
        apiKey
      );

      setSubject(generated.subject);
      setBody(generated.body);
    } catch (err: any) {
      console.error('[ActionModal] Error generating email:', err);
      setError(err.message || 'Failed to generate email');

      // Set default content as fallback
      const prevMsg = previousMessage;
      setSubject(generateFollowUpSubject(prevMsg?.subject || '', actionType));
      setBody('');
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenGmail = async () => {
    if (!recipientEmail) {
      setError(actionType === 'prep' ? 'No client email found' : 'No host email found');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Send email via Cloud Function (automatic sending!)
      console.log('[ActionModal] Sending email via Cloud Function to:', recipientEmail);

      const emailResult = await sendEmailViaCloudFunction({
        to: recipientEmail,
        subject,
        body
      });

      console.log('[ActionModal] Email result:', emailResult);

      if (!emailResult.success) {
        // Fallback to Gmail compose if Cloud Function fails
        console.warn('[ActionModal] Cloud Function failed, opening Gmail instead');
        openGmailCompose({
          to: recipientEmail,
          subject,
          body
        });
      }

      // Record the email action (update status & store copy)
      const userId = 'current_user'; // TODO: Get from auth context

      // If user pasted/edited a previous message that wasn't stored, save it too
      if (editablePreviousMessage && !previousMessage?.body && editablePreviousMessage.trim()) {
        // Save the pasted previous message to the correct field
        await savePreviousEmailIfNeeded(
          outreach.id,
          actionType,
          editablePreviousMessage,
          previousMessage?.subject || '',
          userId
        );
      }

      await recordEmailAction(
        outreach.id,
        actionType,
        subject,
        body,
        recipientEmail,
        userId
      );

      setSuccess(emailResult.success
        ? 'Email SENT automatically via Cloud Function!'
        : 'Gmail opened (Cloud Function unavailable) - Please send manually');

      // Notify parent and close after delay
      setTimeout(() => {
        onEmailSent();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[ActionModal] Error:', err);
      setError(err.message || 'Failed to process action');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save the previous email to history if it was pasted and not already stored
   */
  const savePreviousEmailIfNeeded = async (
    outreachId: string,
    action: EmailActionType,
    pastedBody: string,
    pastedSubject: string,
    userId: string
  ) => {
    // Determine which field to save based on the current action
    // If doing followup1, the previous is the first_email
    // If doing followup2, the previous is the first_followup
    const { updateOutreachV2 } = await import('../services/outreachServiceV2');
    const { Timestamp } = await import('firebase/firestore');

    let updateData: Record<string, any> = {};

    switch (action) {
      case 'followup1':
        // Previous was the first email (pitch)
        if (!outreach.first_email_copy) {
          updateData = {
            first_email_copy: pastedBody,
            first_email_subject: pastedSubject || 'Podcast Guest Opportunity',
            first_email_sent_at: Timestamp.now(), // Approximate
            first_email_sent_by: userId
          };
        }
        break;
      case 'followup2':
        // Previous was the first follow-up
        if (!outreach.first_followup_copy) {
          updateData = {
            first_followup_copy: pastedBody,
            first_followup_subject: pastedSubject || 'Re: Podcast Guest Opportunity',
            first_followup_sent_at: Timestamp.now(), // Approximate
            first_followup_sent_by: userId
          };
        }
        break;
      // For screening/recording, we don't need to backfill
      default:
        break;
    }

    if (Object.keys(updateData).length > 0) {
      console.log('[ActionModal] Saving pasted previous email to history:', action, updateData);
      await updateOutreachV2(outreachId, updateData);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await copyEmailToClipboard({
        to: recipientEmail,
        subject,
        body
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ActionModal] Error copying:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Mail className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {getActionLabel(actionType)}
              </h2>
              <p className="text-sm text-gray-600">
                {outreach.podcast_name || 'Unknown Podcast'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* First Pitch Email Info Section */}
          {actionType === 'first_email' && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <h3 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                <Send className="w-4 h-4" />
                First Pitch Email - Sent to Host
              </h3>
              <div className="space-y-2 text-sm text-green-700">
                <p><strong>Podcast:</strong> {outreach.podcast_name || 'Unknown'}</p>
                <p><strong>Host:</strong> {(outreach as any).rawData?.['Host Name'] || (outreach as any).host_name || 'Unknown'}</p>
                <p><strong>Client:</strong> {outreach.client_name || 'Unknown'}</p>
                {outreach.client?.content?.speakingTopicsArray && outreach.client.content.speakingTopicsArray.length > 0 && (
                  <p><strong>Topics:</strong> {outreach.client.content.speakingTopicsArray.slice(0, 3).join(', ')}</p>
                )}
              </div>
            </div>
          )}

          {/* Prep Email Info Section - show podcast/client details instead of previous message */}
          {actionType === 'prep' && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Prep Email - Sent to Client
              </h3>
              <div className="space-y-2 text-sm text-blue-700">
                <p><strong>Client:</strong> {outreach.client_name || 'Unknown'}</p>
                <p><strong>Podcast:</strong> {outreach.podcast_name || 'Unknown'}</p>
                {outreach.screening_call_date?.toDate && (
                  <p><strong>Screening Date:</strong> {outreach.screening_call_date.toDate().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                )}
                {outreach.recording_date?.toDate && (
                  <p><strong>Recording Date:</strong> {outreach.recording_date.toDate().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                )}
              </div>
            </div>
          )}

          {/* Previous Message Section - NOT shown for prep emails or first_email */}
          {actionType !== 'prep' && actionType !== 'first_email' && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Previous Message {actionType === 'followup1' ? '(Original Pitch)' : actionType === 'followup2' ? '(1st Follow-up)' : ''}
                </h3>
                {previousMessage && !showPreviousEditor && (
                  <button
                    onClick={() => setShowPreviousEditor(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    Edit
                  </button>
                )}
              </div>

              {!previousMessage && !editablePreviousMessage && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                  <p className="text-sm text-yellow-700">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    No previous email found. Please paste the previous email below for better AI generation.
                  </p>
                </div>
              )}

              {showPreviousEditor || !previousMessage ? (
                <div className="space-y-2">
                  <textarea
                    value={editablePreviousMessage}
                    onChange={(e) => setEditablePreviousMessage(e.target.value)}
                    placeholder="Paste your previous email here to give context to the AI..."
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                  />
                  {showPreviousEditor && previousMessage && (
                    <button
                      onClick={() => {
                        setEditablePreviousMessage(previousMessage.body);
                        setShowPreviousEditor(false);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {previousMessage.subject && (
                    <div className="text-xs text-gray-500 mb-2">
                      Subject: {previousMessage.subject}
                    </div>
                  )}
                  <div className="text-sm text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto bg-white p-2 rounded border border-gray-100">
                    {previousMessage.body}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">Success</p>
                <p className="text-sm text-green-600">{success}</p>
              </div>
            </div>
          )}

          {/* New Message */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">New Message</h3>
              <button
                onClick={generateEmail}
                disabled={generating}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Regenerate
              </button>
            </div>

            {/* To field */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                To ({recipientLabel})
              </label>
              <input
                type="text"
                value={recipientEmail}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-600"
              />
            </div>

            {/* Subject field */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Body field */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
              {generating ? (
                <div className="w-full h-48 border border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                  <div className="flex items-center gap-3 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Generating with AI...</span>
                  </div>
                </div>
              ) : (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Email body..."
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={handleCopyToClipboard}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy to Clipboard
              </>
            )}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleOpenGmail}
              disabled={loading || generating || !subject || !body || !recipientEmail}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              Send Email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
