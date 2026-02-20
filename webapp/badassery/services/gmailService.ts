/**
 * ============================================================================
 * GMAIL API SERVICE
 * ============================================================================
 *
 * Handles sending emails via Gmail API
 * Requires OAuth2 authentication
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  from?: string;
  replyTo?: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string; // Message-ID for threading
}

export interface SentEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  threadId?: string;
}

/**
 * Send email via Gmail API
 * Requires valid OAuth2 access token
 */
export async function sendEmail(
  params: SendEmailParams,
  accessToken: string
): Promise<SentEmailResult> {
  try {
    // Build raw email message (RFC 2822 format)
    const { to, subject, body, from, replyTo, cc, bcc, inReplyTo } = params;

    const headers = [
      `From: ${from || 'Ruth Kimani <ruth@badassery.co>'}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`
    ];

    if (cc) headers.push(`Cc: ${cc}`);
    if (bcc) headers.push(`Bcc: ${bcc}`);
    if (replyTo) headers.push(`Reply-To: ${replyTo}`);
    if (inReplyTo) {
      headers.push(`In-Reply-To: ${inReplyTo}`);
      headers.push(`References: ${inReplyTo}`);
    }

    const rawMessage = [
      ...headers,
      '',
      body
    ].join('\r\n');

    // Encode in base64url format (Gmail API requirement)
    const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedMessage
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gmail API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
      success: true,
      messageId: data.id,
      threadId: data.threadId
    };
  } catch (error) {
    console.error('Error sending email via Gmail:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get Gmail OAuth2 URL for authentication
 */
export function getGmailAuthUrl(
  clientId: string,
  redirectUri: string,
  state?: string
): string {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly'
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });

  if (state) params.append('state', state);

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for token');
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  return response.json();
}
