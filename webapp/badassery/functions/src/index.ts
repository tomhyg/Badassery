import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
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
