/**
 * ============================================================================
 * EMAIL SERVICE - Gmail Integration
 * ============================================================================
 *
 * This service handles sending emails via Gmail.
 *
 * SETUP REQUIRED:
 * 1. Go to Google Account → Security → 2-Step Verification (enable it)
 * 2. Go to Google Account → Security → App passwords
 * 3. Create an app password for "Mail" on "Windows Computer"
 * 4. Copy the 16-character password
 * 5. Add it to Settings in the app
 *
 * Note: For production, consider using a proper backend service or
 * Gmail API with OAuth2 for better security.
 */

import { getEmailConfig } from './settingsService';
import { sendEmailViaGmail, isGmailConnected, getGmailConfig } from './gmailAuthService';
import { getFunctions, httpsCallable } from 'firebase/functions';

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  from?: string;
  replyTo?: string;
  cc?: string;
  bcc?: string;
}

/**
 * Send email using Gmail SMTP via a Cloud Function or backend proxy
 *
 * Since browsers can't directly connect to SMTP servers,
 * we need to use a backend service. Options:
 *
 * 1. Firebase Cloud Function (recommended)
 * 2. External email API (SendGrid, Resend, etc.)
 * 3. Your own backend server
 *
 * For now, this opens the user's email client as a fallback.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
  try {
    const emailConfig = await getEmailConfig();

    // Priority 1: Use Gmail API if connected
    if (isGmailConnected()) {
      console.log('[EmailService] Sending via Gmail API...');
      const result = await sendEmailViaGmail({
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        from: payload.from,
        replyTo: payload.replyTo,
        cc: payload.cc,
        bcc: payload.bcc
      });

      if (result.success) {
        return {
          success: true,
          messageId: result.messageId
        };
      } else {
        console.warn('[EmailService] Gmail API failed, falling back to mailto:', result.error);
      }
    }

    // Priority 2: Check if we have a backend email endpoint configured
    const emailEndpoint = localStorage.getItem('email_api_endpoint');

    if (emailEndpoint) {
      // Send via backend API
      return await sendViaBackend(emailEndpoint, payload);
    }

    // Fallback: Open mailto link (user sends manually but it's pre-filled)
    return await openMailtoLink(payload);

  } catch (error: any) {
    console.error('[EmailService] Error sending email:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email'
    };
  }
}

/**
 * Send email via backend API endpoint
 */
async function sendViaBackend(endpoint: string, payload: EmailPayload): Promise<EmailSendResult> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP error: ${response.status}`);
    }

    const result = await response.json();

    return {
      success: true,
      messageId: result.messageId
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Open mailto link - Pre-fills the user's default email client
 * This is the fallback when no backend is configured
 */
async function openMailtoLink(payload: EmailPayload): Promise<EmailSendResult> {
  try {
    // Encode the email parts for URL
    const subject = encodeURIComponent(payload.subject);
    const body = encodeURIComponent(payload.body);

    let mailtoUrl = `mailto:${payload.to}?subject=${subject}&body=${body}`;

    if (payload.cc) {
      mailtoUrl += `&cc=${encodeURIComponent(payload.cc)}`;
    }

    if (payload.bcc) {
      mailtoUrl += `&bcc=${encodeURIComponent(payload.bcc)}`;
    }

    // Open the mailto link
    window.open(mailtoUrl, '_blank');

    return {
      success: true,
      messageId: `mailto_${Date.now()}`
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Copy email to clipboard in a formatted way
 */
export function copyEmailToClipboard(payload: EmailPayload): boolean {
  try {
    const emailText = `To: ${payload.to}
Subject: ${payload.subject}

${payload.body}`;

    navigator.clipboard.writeText(emailText);
    return true;
  } catch (error) {
    console.error('[EmailService] Error copying to clipboard:', error);
    return false;
  }
}

/**
 * Open Gmail compose in a new tab
 */
export function openGmailCompose(payload: EmailPayload): void {
  const to = encodeURIComponent(payload.to);
  const subject = encodeURIComponent(payload.subject);
  const body = encodeURIComponent(payload.body);

  let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;

  if (payload.cc) {
    gmailUrl += `&cc=${encodeURIComponent(payload.cc)}`;
  }

  if (payload.bcc) {
    gmailUrl += `&bcc=${encodeURIComponent(payload.bcc)}`;
  }

  window.open(gmailUrl, '_blank');
}

/**
 * Check if email configuration is complete
 */
export async function isEmailConfigured(): Promise<boolean> {
  try {
    const config = await getEmailConfig();
    return !!(config.senders && config.senders.length > 0);
  } catch {
    return false;
  }
}

/**
 * Get the default sender email
 */
export async function getDefaultSender(): Promise<{ email: string; name: string } | null> {
  try {
    const config = await getEmailConfig();
    if (config.senders && config.senders.length > 0) {
      return config.senders[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Send email with Gmail API (requires Gmail to be connected)
 * Respects TEST_MODE from settings
 */
export async function sendEmailWithGmail(payload: EmailPayload): Promise<EmailSendResult> {
  if (!isGmailConnected()) {
    return {
      success: false,
      error: 'Gmail not connected. Please connect Gmail in Settings.'
    };
  }

  const result = await sendEmailViaGmail({
    to: payload.to,
    subject: payload.subject,
    body: payload.body,
    from: payload.from,
    replyTo: payload.replyTo,
    cc: payload.cc,
    bcc: payload.bcc
  });

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error
  };
}

/**
 * Check if Gmail is connected and ready to send
 */
export function isGmailReady(): boolean {
  return isGmailConnected();
}

/**
 * Get Gmail test mode status
 */
export async function getTestModeStatus(): Promise<{ enabled: boolean; testEmail: string }> {
  const config = await getGmailConfig();
  return {
    enabled: config.test_mode,
    testEmail: config.test_email
  };
}

// ============================================================================
// CLOUD FUNCTION EMAIL SENDING
// ============================================================================

/**
 * Send email via Firebase Cloud Function (SMTP backend)
 * This is the recommended approach - no credentials exposed in frontend
 *
 * SETUP:
 * 1. Deploy the Cloud Function: cd functions && npm install && firebase deploy --only functions
 * 2. Configure credentials: firebase functions:config:set gmail.user="email" gmail.password="app_password"
 */
export async function sendEmailViaCloudFunction(payload: EmailPayload): Promise<EmailSendResult> {
  try {
    // Specify the region where the function is deployed
    const functions = getFunctions(undefined, 'us-central1');
    const sendEmailFn = httpsCallable(functions, 'sendEmail');

    // Get test mode settings from Gmail config
    const gmailConfig = await getGmailConfig();
    const testMode = gmailConfig.test_mode ?? true; // Default to test mode for safety
    const testEmail = gmailConfig.test_email || 'dletayf@gmail.com';

    console.log('[EmailService] Sending via Cloud Function, test_mode:', testMode);

    const result = await sendEmailFn({
      to: payload.to,
      subject: payload.subject,
      body: payload.body,
      testMode,
      testEmail,
      fromName: 'Ruth'
    });

    const data = result.data as { success: boolean; messageId?: string; testMode?: boolean; sentTo?: string };

    if (data.success) {
      console.log('[EmailService] Cloud Function email sent:', {
        messageId: data.messageId,
        testMode: data.testMode,
        sentTo: data.sentTo
      });

      return {
        success: true,
        messageId: data.messageId
      };
    } else {
      throw new Error('Cloud Function returned failure');
    }

  } catch (error: any) {
    console.error('[EmailService] Cloud Function error:', error);

    // Check if it's a "function not found" error
    if (error.code === 'functions/not-found') {
      return {
        success: false,
        error: 'Cloud Function not deployed. Please run: cd functions && firebase deploy --only functions'
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to send via Cloud Function'
    };
  }
}

/**
 * Test if Cloud Function email is configured
 */
export async function testCloudFunctionEmail(): Promise<{ success: boolean; message: string }> {
  try {
    const functions = getFunctions(undefined, 'us-central1');
    const testConfigFn = httpsCallable(functions, 'testEmailConfig');

    const result = await testConfigFn({});
    const data = result.data as { success: boolean; message: string };

    return data;
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to test Cloud Function'
    };
  }
}
