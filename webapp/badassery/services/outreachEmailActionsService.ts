/**
 * ============================================================================
 * OUTREACH EMAIL ACTIONS SERVICE
 * ============================================================================
 *
 * Handles email actions (follow-ups, screening, recording) with:
 * - Status updates
 * - Email copy storage
 * - Email thread management
 */

import { Timestamp } from 'firebase/firestore';
import {
  updateOutreachV2,
  addEmailToThreadV2,
  getOutreachByIdV2
} from './outreachServiceV2';
import { Outreach, OutreachStatus, EmailMessage } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type EmailActionType = 'first_email' | 'followup1' | 'followup2' | 'screening' | 'recording' | 'prep';

export interface SendEmailResult {
  success: boolean;
  newStatus: OutreachStatus;
  error?: string;
}

export interface EmailActionConfig {
  newStatus: OutreachStatus | null; // null means don't change status (for prep email)
  emailType: EmailMessage['type'];
  copyField: string;
  subjectField: string;
  sentAtField: string;
  sentByField: string;
}

// ============================================================================
// ACTION CONFIGURATIONS
// ============================================================================

const ACTION_CONFIGS: Record<EmailActionType, EmailActionConfig> = {
  first_email: {
    newStatus: '1st_email_sent',
    emailType: '1st_email',
    copyField: 'first_email_copy',
    subjectField: 'first_email_subject',
    sentAtField: 'first_email_sent_at',
    sentByField: 'first_email_sent_by'
  },
  followup1: {
    newStatus: '1st_followup_sent',
    emailType: '1st_followup',
    copyField: 'first_followup_copy',
    subjectField: 'first_followup_subject',
    sentAtField: 'first_followup_sent_at',
    sentByField: 'first_followup_sent_by'
  },
  followup2: {
    newStatus: '2nd_followup_sent',
    emailType: '2nd_followup',
    copyField: 'second_followup_copy',
    subjectField: 'second_followup_subject',
    sentAtField: 'second_followup_sent_at',
    sentByField: 'second_followup_sent_by'
  },
  screening: {
    newStatus: 'scheduling_screening',
    emailType: 'scheduling',
    copyField: 'screening_email_copy',
    subjectField: 'screening_email_subject',
    sentAtField: 'screening_email_sent_at',
    sentByField: 'screening_email_sent_by'
  },
  recording: {
    newStatus: 'scheduling_recording',
    emailType: 'scheduling',
    copyField: 'recording_email_copy',
    subjectField: 'recording_email_subject',
    sentAtField: 'recording_email_sent_at',
    sentByField: 'recording_email_sent_by'
  },
  prep: {
    newStatus: null, // Prep email doesn't change status
    emailType: 'prep',
    copyField: 'prep_email_copy',
    subjectField: 'prep_email_subject',
    sentAtField: 'prep_email_sent_at',
    sentByField: 'prep_email_sent_by'
  }
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Format date as "Month Day, Year" for Outreach Date field
 */
function formatOutreachDate(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Records an email action (after user sends via Gmail)
 * Updates status, stores email copy, adds to email thread, and updates Outreach Date
 */
export async function recordEmailAction(
  outreachId: string,
  actionType: EmailActionType,
  subject: string,
  body: string,
  recipientEmail: string, // Can be host email or client email (for prep)
  userId: string
): Promise<SendEmailResult> {
  try {
    const config = ACTION_CONFIGS[actionType];
    const now = Timestamp.now();
    const nowDate = new Date();

    // Build update object dynamically
    const updateData: Record<string, any> = {
      // Email copy storage
      [config.copyField]: body,
      [config.subjectField]: subject,
      [config.sentAtField]: now,
      [config.sentByField]: userId,

      // Also update new schema timestamps
      updatedAt: now
    };

    // Always update outreach_date when an email is sent (for follow-up tracking)
    updateData.outreach_date = now;
    updateData['Outreach Date'] = formatOutreachDate(nowDate); // Legacy format for backwards compatibility

    // Only update status if newStatus is defined (prep email doesn't change status)
    if (config.newStatus) {
      updateData.status = config.newStatus;
      updateData.status_category = 'active';
      updateData.status_changed_at = now;
      updateData.status_changed_by = userId;
    }

    // Update outreach document
    await updateOutreachV2(outreachId, updateData);

    // Add to email thread
    const emailMessage: EmailMessage = {
      id: `${actionType}_${Date.now()}`,
      direction: 'outbound',
      type: config.emailType,
      from: 'ruth@badassery.co',
      to: recipientEmail,
      subject,
      body,
      sent_at: now,
      sent_by: userId,
      sent_via: 'manual',
      generated_by_ai: true
    };

    await addEmailToThreadV2(outreachId, emailMessage);

    console.log(`[EmailActions] ${actionType} recorded for outreach ${outreachId}${config.newStatus ? ', status updated to ' + config.newStatus : ''}`);

    return {
      success: true,
      newStatus: config.newStatus || 'no_change' as any
    };
  } catch (error: any) {
    console.error(`[EmailActions] Error recording ${actionType}:`, error);
    return {
      success: false,
      newStatus: ACTION_CONFIGS[actionType].newStatus || 'error' as any,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Convenience functions for specific actions
 */
export async function recordFollowUp1(
  outreachId: string,
  subject: string,
  body: string,
  hostEmail: string,
  userId: string
): Promise<SendEmailResult> {
  return recordEmailAction(outreachId, 'followup1', subject, body, hostEmail, userId);
}

export async function recordFollowUp2(
  outreachId: string,
  subject: string,
  body: string,
  hostEmail: string,
  userId: string
): Promise<SendEmailResult> {
  return recordEmailAction(outreachId, 'followup2', subject, body, hostEmail, userId);
}

export async function recordScreeningEmail(
  outreachId: string,
  subject: string,
  body: string,
  hostEmail: string,
  userId: string
): Promise<SendEmailResult> {
  return recordEmailAction(outreachId, 'screening', subject, body, hostEmail, userId);
}

export async function recordRecordingEmail(
  outreachId: string,
  subject: string,
  body: string,
  hostEmail: string,
  userId: string
): Promise<SendEmailResult> {
  return recordEmailAction(outreachId, 'recording', subject, body, hostEmail, userId);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the last sent message for context when generating follow-ups
 * Returns the most recent outbound email
 */
export function getLastSentMessage(outreach: Outreach): { subject: string; body: string } | null {
  // Check dedicated copy fields first (most reliable)
  // Order: most recent first
  if (outreach.second_followup_copy) {
    return {
      subject: outreach.second_followup_subject || '',
      body: outreach.second_followup_copy
    };
  }

  if (outreach.first_followup_copy) {
    return {
      subject: outreach.first_followup_subject || '',
      body: outreach.first_followup_copy
    };
  }

  if (outreach.first_email_copy) {
    return {
      subject: outreach.first_email_subject || '',
      body: outreach.first_email_copy
    };
  }

  // Fallback: check email_thread array
  if (outreach.email_thread && outreach.email_thread.length > 0) {
    const outboundEmails = outreach.email_thread
      .filter(e => e.direction === 'outbound')
      .sort((a, b) => {
        const aTime = a.sent_at?.toMillis?.() || 0;
        const bTime = b.sent_at?.toMillis?.() || 0;
        return bTime - aTime;
      });

    if (outboundEmails.length > 0) {
      return {
        subject: outboundEmails[0].subject,
        body: outboundEmails[0].body
      };
    }
  }

  // Last fallback: legacy email_body field
  if (outreach.email_body) {
    return {
      subject: outreach.email_subject || '',
      body: outreach.email_body
    };
  }

  return null;
}

/**
 * Get the PREVIOUS email based on the action type
 * For followup1: return first_email_copy
 * For followup2: return first_followup_copy
 * For screening: return most recent (they replied, so use latest thread)
 * For recording: return screening email or latest
 */
export function getPreviousMessageForAction(
  outreach: Outreach,
  actionType: EmailActionType
): { subject: string; body: string } | null {
  switch (actionType) {
    case 'first_email':
      // First email has no previous message - it's the initial pitch
      return null;

    case 'followup1':
      // For first follow-up, we need the original pitch email
      if (outreach.first_email_copy) {
        return {
          subject: outreach.first_email_subject || '',
          body: outreach.first_email_copy
        };
      }
      // Try email_thread
      const firstEmail = outreach.email_thread?.find(e => e.type === '1st_email' || e.type === 'pitch');
      if (firstEmail) {
        return { subject: firstEmail.subject, body: firstEmail.body };
      }
      // Legacy fallback
      if (outreach.email_body) {
        return { subject: outreach.email_subject || '', body: outreach.email_body };
      }
      return null;

    case 'followup2':
      // For second follow-up, we need the first follow-up email
      if (outreach.first_followup_copy) {
        return {
          subject: outreach.first_followup_subject || '',
          body: outreach.first_followup_copy
        };
      }
      // Try email_thread
      const firstFollowup = outreach.email_thread?.find(e => e.type === '1st_followup');
      if (firstFollowup) {
        return { subject: firstFollowup.subject, body: firstFollowup.body };
      }
      // Fallback to original email if no follow-up found
      return getPreviousMessageForAction(outreach, 'followup1');

    case 'screening':
      // For screening, use the most recent email (could be any follow-up or original)
      return getLastSentMessage(outreach);

    case 'recording':
      // For recording, use screening email if available, otherwise latest
      if (outreach.screening_email_copy) {
        return {
          subject: outreach.screening_email_subject || '',
          body: outreach.screening_email_copy
        };
      }
      return getLastSentMessage(outreach);

    default:
      return getLastSentMessage(outreach);
  }
}

/**
 * Get available action for an outreach based on its status
 */
export function getAvailableAction(status: OutreachStatus): EmailActionType | null {
  switch (status) {
    case 'ready_for_outreach':
      return 'first_email';
    case '1st_email_sent':
      return 'followup1';
    case '1st_followup_sent':
      return 'followup2';
    case 'in_contact':
      return 'screening';
    case 'scheduling_screening':
    case 'screening_scheduled':
      return 'recording';
    default:
      return null;
  }
}

/**
 * Check if an action is allowed for the current status
 */
export function isActionAllowed(status: OutreachStatus, actionType: EmailActionType): boolean {
  const allowedActions: Record<OutreachStatus, EmailActionType[]> = {
    '1st_email_sent': ['followup1'],
    '1st_followup_sent': ['followup2'],
    'in_contact': ['screening'],
    'scheduling_screening': ['recording'],
    'screening_scheduled': ['recording'],
    // Other statuses don't have specific email actions
    'identified': [],
    'ready_for_outreach': ['first_email'],
    '2nd_followup_sent': [],
    'scheduling_recording': [],
    'recording_scheduled': [],
    'recorded': [],
    'live': [],
    'backlog': [],
    'follow_up_1_month': [],
    'fill_form': [],
    'declined_by_host': [],
    'client_declined': [],
    'no_response': [],
    'cancelled': [],
    'email_bounced': [],
    'paid_podcast': [],
    'blacklist': []
  };

  return allowedActions[status]?.includes(actionType) || false;
}

/**
 * Get action label for UI display
 */
export function getActionLabel(actionType: EmailActionType): string {
  const labels: Record<EmailActionType, string> = {
    first_email: 'Send Pitch',
    followup1: 'Follow Up 1',
    followup2: 'Follow Up 2',
    screening: 'Schedule Screening',
    recording: 'Schedule Recording',
    prep: 'Send Prep Email'
  };
  return labels[actionType];
}

/**
 * Generate a follow-up subject line based on the original subject
 */
export function generateFollowUpSubject(originalSubject: string, actionType: EmailActionType): string {
  // Remove any existing Re: prefix
  const cleanSubject = originalSubject.replace(/^(Re:\s*)+/i, '').trim();

  switch (actionType) {
    case 'first_email':
      return `Podcast Guest Opportunity - ${cleanSubject || 'Expert Introduction'}`;
    case 'followup1':
    case 'followup2':
      return `Re: ${cleanSubject}`;
    case 'screening':
      return `Quick call to discuss podcast appearance - ${cleanSubject}`;
    case 'recording':
      return `Recording details - ${cleanSubject}`;
    case 'prep':
      return `Preparing for your podcast appearance`;
    default:
      return `Re: ${cleanSubject}`;
  }
}
