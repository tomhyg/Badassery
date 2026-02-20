/**
 * ============================================================================
 * GMAIL AUTH SERVICE
 * ============================================================================
 *
 * Manages Gmail OAuth2 authentication flow and token lifecycle
 */

import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getGmailAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken
} from './gmailService';

// ============================================================================
// CONFIGURATION
// ============================================================================

// TEST MODE - Always send to test email
export const GMAIL_TEST_MODE = true;
export const GMAIL_TEST_EMAIL = 'dletayf@gmail.com';

// OAuth2 Configuration - Replace with your Google Cloud Console credentials
const GMAIL_CONFIG = {
  client_id: '', // Will be loaded from Firestore settings
  client_secret: '', // Will be loaded from Firestore settings
  redirect_uri: `${window.location.origin}/auth/gmail/callback`
};

// ============================================================================
// TYPES
// ============================================================================

export interface GmailTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // timestamp in milliseconds
  email: string;
  connected_at: number;
}

export interface GmailConfig {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  test_mode: boolean;
  test_email: string;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEY = 'gmail_tokens';
const SETTINGS_DOC = 'gmail_config';

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Store tokens in localStorage and Firestore backup
 */
export function storeTokens(tokens: GmailTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  console.log('✅ Gmail tokens stored');
}

/**
 * Load tokens from localStorage
 */
export function loadStoredTokens(): GmailTokens | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as GmailTokens;
  } catch {
    return null;
  }
}

/**
 * Clear stored tokens (disconnect)
 */
export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
  console.log('✅ Gmail tokens cleared');
}

/**
 * Check if Gmail is connected
 */
export function isGmailConnected(): boolean {
  const tokens = loadStoredTokens();
  return tokens !== null && tokens.access_token !== '';
}

/**
 * Get connected Gmail email address
 */
export function getConnectedEmail(): string | null {
  const tokens = loadStoredTokens();
  return tokens?.email || null;
}

// ============================================================================
// GMAIL CONFIG (from Firestore)
// ============================================================================

const DEFAULT_GMAIL_CONFIG: GmailConfig = {
  client_id: '',
  client_secret: '',
  redirect_uri: `${window.location.origin}/auth/gmail/callback`,
  test_mode: true,
  test_email: 'dletayf@gmail.com'
};

/**
 * Get Gmail configuration from Firestore
 */
export async function getGmailConfig(): Promise<GmailConfig> {
  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as GmailConfig;
    }

    // Create default if doesn't exist
    await setDoc(docRef, DEFAULT_GMAIL_CONFIG);
    return DEFAULT_GMAIL_CONFIG;
  } catch (error) {
    console.error('Error getting Gmail config:', error);
    return DEFAULT_GMAIL_CONFIG;
  }
}

/**
 * Update Gmail configuration in Firestore
 */
export async function updateGmailConfig(config: Partial<GmailConfig>): Promise<void> {
  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC);
    const current = await getGmailConfig();
    await setDoc(docRef, { ...current, ...config });
    console.log('✅ Gmail config updated');
  } catch (error) {
    console.error('Error updating Gmail config:', error);
    throw error;
  }
}

// ============================================================================
// OAUTH2 FLOW
// ============================================================================

/**
 * Initialize Gmail OAuth flow
 * Opens Google consent screen in new window
 */
export async function initGmailAuth(): Promise<void> {
  const config = await getGmailConfig();

  if (!config.client_id) {
    throw new Error('Gmail client_id not configured. Please set it in Settings.');
  }

  const authUrl = getGmailAuthUrl(
    config.client_id,
    config.redirect_uri,
    'gmail_auth'
  );

  // Open in same window (will redirect back)
  window.location.href = authUrl;
}

/**
 * Handle OAuth callback - exchange code for tokens
 */
export async function handleOAuthCallback(code: string): Promise<GmailTokens> {
  const config = await getGmailConfig();

  if (!config.client_id || !config.client_secret) {
    throw new Error('Gmail OAuth credentials not configured');
  }

  // Exchange code for tokens
  const tokenResponse = await exchangeCodeForToken(
    code,
    config.client_id,
    config.client_secret,
    config.redirect_uri
  );

  // Get user email from token
  const userInfo = await getUserInfo(tokenResponse.access_token);

  // Calculate expiration timestamp
  const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);

  const tokens: GmailTokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: expiresAt,
    email: userInfo.email,
    connected_at: Date.now()
  };

  // Store tokens
  storeTokens(tokens);

  return tokens;
}

/**
 * Get user info from access token
 */
async function getUserInfo(accessToken: string): Promise<{ email: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json();
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = loadStoredTokens();

  if (!tokens) {
    console.log('No Gmail tokens found');
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  const isExpired = tokens.expires_at < (Date.now() + 5 * 60 * 1000);

  if (!isExpired) {
    return tokens.access_token;
  }

  // Token expired, try to refresh
  console.log('Access token expired, refreshing...');

  try {
    const config = await getGmailConfig();
    const newTokens = await refreshAccessToken(
      tokens.refresh_token,
      config.client_id,
      config.client_secret
    );

    // Update stored tokens
    const updatedTokens: GmailTokens = {
      ...tokens,
      access_token: newTokens.access_token,
      expires_at: Date.now() + (newTokens.expires_in * 1000)
    };

    storeTokens(updatedTokens);
    console.log('✅ Access token refreshed');

    return updatedTokens.access_token;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    // Clear invalid tokens
    clearTokens();
    return null;
  }
}

/**
 * Disconnect Gmail (clear tokens)
 */
export function disconnectGmail(): void {
  clearTokens();
  console.log('✅ Gmail disconnected');
}

// ============================================================================
// SEND EMAIL WITH TEST MODE
// ============================================================================

import { sendEmail, SendEmailParams, SentEmailResult } from './gmailService';

/**
 * Send email via Gmail API with TEST MODE support
 * In test mode, all emails go to the test email address
 */
export async function sendEmailViaGmail(params: SendEmailParams): Promise<SentEmailResult> {
  const config = await getGmailConfig();
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    return {
      success: false,
      error: 'Gmail not connected. Please connect your Gmail account in Settings.'
    };
  }

  // Apply test mode if enabled
  let actualParams = { ...params };

  if (config.test_mode) {
    console.log(`📧 [TEST MODE] Redirecting email from ${params.to} to ${config.test_email}`);
    actualParams = {
      ...params,
      to: config.test_email,
      subject: `[TEST - Original: ${params.to}] ${params.subject}`
    };
  }

  // Send via Gmail API
  const result = await sendEmail(actualParams, accessToken);

  if (result.success) {
    console.log(`✅ Email sent successfully (${config.test_mode ? 'TEST MODE' : 'LIVE'})`);
    if (config.test_mode) {
      console.log(`   Original recipient: ${params.to}`);
      console.log(`   Actual recipient: ${config.test_email}`);
    }
  }

  return result;
}
