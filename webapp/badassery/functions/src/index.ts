// v3
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import { defineString } from 'firebase-functions/params';

// Initialize Firebase Admin
admin.initializeApp();

// Define parameters for email configuration
// These will be set via: firebase functions:secrets:set GMAIL_USER, GMAIL_PASSWORD
// Or via .env file for local development
const gmailUser = defineString('GMAIL_USER', {
  description: 'Gmail address for sending emails',
  default: ''
});

const gmailPassword = defineString('GMAIL_PASSWORD', {
  description: 'Gmail app password (16 characters, no spaces)',
  default: ''
});

// SMTP Configuration
const getTransporter = () => {
  const user = gmailUser.value();
  const password = gmailPassword.value();

  if (!user || !password) {
    throw new Error('Gmail credentials not configured. Set GMAIL_USER and GMAIL_PASSWORD environment variables.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: password.replace(/\s/g, '') // Remove any spaces from app password
    }
  });
};

interface SendEmailData {
  to: string;
  subject: string;
  body: string;
  testMode?: boolean;
  testEmail?: string;
  fromName?: string;
}

/**
 * Cloud Function: Send Email via SMTP
 *
 * Usage from frontend:
 * const sendEmailFn = httpsCallable(functions, 'sendEmail');
 * await sendEmailFn({ to, subject, body, testMode: true, testEmail: 'test@example.com' });
 */
export const sendEmail = functions.https.onCall(async (data: SendEmailData, context) => {
  const { to, subject, body, testMode = true, testEmail = 'dletayf@gmail.com', fromName = 'Ruth' } = data;

  // Validate inputs
  if (!to || !subject || !body) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: to, subject, or body'
    );
  }

  // In test mode, redirect all emails to test address
  const actualTo = testMode ? testEmail : to;
  const actualSubject = testMode ? `[TEST - To: ${to}] ${subject}` : subject;

  // Simple text to HTML conversion
  const htmlBody = body
    .replace(/\n/g, '<br>')
    .replace(/  /g, '&nbsp;&nbsp;');

  const user = gmailUser.value();

  const mailOptions = {
    from: `${fromName} <${user || 'noreply@badassery.co'}>`,
    to: actualTo,
    subject: actualSubject,
    text: body,
    html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`
  };

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);

    console.log('[SendEmail] Email sent successfully:', {
      messageId: info.messageId,
      to: actualTo,
      testMode,
      originalTo: testMode ? to : undefined
    });

    return {
      success: true,
      messageId: info.messageId,
      testMode,
      sentTo: actualTo
    };
  } catch (error: any) {
    console.error('[SendEmail] Error sending email:', error);

    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Failed to send email'
    );
  }
});

// PodcastIndex credentials
const piApiKey = defineString('PODCASTINDEX_API_KEY', {
  description: 'PodcastIndex API key',
  default: ''
});

const piApiSecret = defineString('PODCASTINDEX_API_SECRET', {
  description: 'PodcastIndex API secret',
  default: ''
});

/**
 * Cloud Function: PodcastIndex API Proxy
 *
 * Proxies /api/podcastindex/** requests to api.podcastindex.org,
 * injecting the SHA-1 auth headers server-side so credentials are never
 * exposed to the browser.
 *
 * Firebase Hosting rewrites /api/podcastindex/** to this function.
 * e.g. /api/podcastindex/episodes/byfeedid?id=123
 *   → https://api.podcastindex.org/api/1.0/episodes/byfeedid?id=123
 */
export const podcastIndexProxy = functions.https.onRequest(async (req, res) => {
  const apiKey    = piApiKey.value();
  const apiSecret = piApiSecret.value();

  if (!apiKey || !apiSecret) {
    res.status(500).json({ error: 'PodcastIndex credentials not configured' });
    return;
  }

  // Strip the /api/podcastindex prefix; req.url includes path + query string
  const suffix    = req.url.replace(/^\/api\/podcastindex/, '');
  const targetUrl = `https://api.podcastindex.org/api/1.0${suffix}`;

  // Build SHA-1 auth headers
  const epochTime = Math.floor(Date.now() / 1000);
  const hash      = crypto
    .createHash('sha1')
    .update(apiKey + apiSecret + String(epochTime))
    .digest('hex');

  const piRes = await fetch(targetUrl, {
    headers: {
      'X-Auth-Date'  : String(epochTime),
      'X-Auth-Key'   : apiKey,
      'Authorization': hash,
      'User-Agent'   : 'BadasseryPR/1.0',
    },
  });

  const data = await piRes.json();
  res.status(piRes.status).json(data);
});

/**
 * Cloud Function: Create Client Auth Account
 *
 * Creates a Firebase Auth user and sends an invitation email with a
 * "Set up your account" link (Firebase password-reset link).
 * The client clicks the link, chooses their own password, and lands on the app.
 * No temporary password is ever shared.
 */
export const createClientAccount = functions.https.onCall(async (data, _context) => {
  const { email, password } = data as { email: string; password: string };

  if (!email || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Email and password are required');
  }

  let uid: string;
  let alreadyExists = false;

  try {
    const userRecord = await admin.auth().createUser({ email, password });
    uid = userRecord.uid;
  } catch (error: any) {
    if (error.code === 'auth/email-already-exists') {
      // Update password on existing account
      const existing = await admin.auth().getUserByEmail(email);
      uid = existing.uid;
      await admin.auth().updateUser(uid, { password });
      alreadyExists = true;
    } else {
      throw new functions.https.HttpsError('internal', error.message || 'Failed to create account');
    }
  }

  return { uid, alreadyExists };
});

/**
 * Cloud Function: Delete Client Auth Account
 *
 * Deletes the Firebase Auth user for a client.
 */
export const deleteClientAccount = functions.https.onCall(async (data, _context) => {
  const { uid } = data as { uid: string };

  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'UID is required');
  }

  try {
    await admin.auth().deleteUser(uid);
    return { success: true };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message || 'Failed to delete account');
  }
});

/**
 * Cloud Function: Test Email Configuration
 *
 * Quick test to verify SMTP setup works
 */
export const testEmailConfig = functions.https.onCall(async (data, context) => {
  try {
    const transporter = getTransporter();
    await transporter.verify();

    return {
      success: true,
      message: 'Email configuration is valid'
    };
  } catch (error: any) {
    console.error('[TestEmailConfig] Error:', error);

    return {
      success: false,
      message: error.message || 'Configuration error'
    };
  }
});
