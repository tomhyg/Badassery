import { Timestamp } from 'firebase/firestore';
import { getAllOutreachV2, getOutreachByIdV2 } from './outreachServiceV2';
import { getClientById } from './clientService';
import { getPodcastForOutreach } from './podcastService';
import { Outreach, EmailMessage } from '../types';

/**
 * ============================================================================
 * OUTREACH AUTOMATION SERVICE
 * ============================================================================
 *
 * Handles automatic follow-up detection and email generation
 * Ruth validates before sending
 */

/**
 * Follow-up timing rules
 */
const FOLLOWUP_RULES = {
  '1st_email_sent': {
    nextStatus: '1st_followup_sent',
    daysToWait: 5,
    emailType: '1st_followup' as const
  },
  '1st_followup_sent': {
    nextStatus: '2nd_followup_sent',
    daysToWait: 3,
    emailType: '2nd_followup' as const
  },
  '2nd_followup_sent': {
    nextStatus: 'no_response',
    daysToWait: 5,
    emailType: null
  }
};

export interface FollowUpCandidate {
  outreach: Outreach;
  daysWaiting: number;
  shouldSendAt: Date;
  nextEmailType: '1st_followup' | '2nd_followup';
  lastEmail: EmailMessage;
}

/**
 * Get all outreach items that need follow-up
 */
/**
 * Parse date from various formats (handles "October 23, 2025", ISO dates, etc.)
 */
function parseOutreachDate(dateString: string): Date | null {
  if (!dateString) return null;

  try {
    // Try standard parsing first
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Try manual parsing for "October 23, 2025" format
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];

    const parts = dateString.toLowerCase().replace(',', '').split(' ');
    if (parts.length === 3) {
      const monthIndex = monthNames.indexOf(parts[0]);
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);

      if (monthIndex !== -1 && !isNaN(day) && !isNaN(year)) {
        return new Date(year, monthIndex, day);
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing date:', dateString, error);
    return null;
  }
}

/**
 * Calculate the date of the last email sent based on status
 */
function calculateLastEmailDate(outreachDate: Date, status: string): Date {
  const baseDate = new Date(outreachDate);

  if (status === '1st_email_sent') {
    // Last email was the first email
    return baseDate;
  } else if (status === '1st_followup_sent') {
    // Last email was first follow-up (+5 days from first email)
    const date = new Date(baseDate);
    date.setDate(date.getDate() + 5);
    return date;
  } else if (status === '2nd_followup_sent') {
    // Last email was second follow-up (+5 days + 3 days from first email)
    const date = new Date(baseDate);
    date.setDate(date.getDate() + 8);
    return date;
  }

  return baseDate;
}

export async function getFollowUpCandidates(): Promise<FollowUpCandidate[]> {
  const allOutreach = await getAllOutreachV2();
  const now = new Date();
  const candidates: FollowUpCandidate[] = [];

  console.log('[FollowUp] Checking', allOutreach.length, 'outreach items for follow-ups');

  for (const outreach of allOutreach) {
    // Only check active statuses that can have follow-ups
    if (!outreach.status || !FOLLOWUP_RULES[outreach.status as keyof typeof FOLLOWUP_RULES]) {
      continue;
    }

    const rule = FOLLOWUP_RULES[outreach.status as keyof typeof FOLLOWUP_RULES];
    console.log('[FollowUp] Checking outreach', outreach.id, 'with status', outreach.status);

    // Skip if this status doesn't lead to another email
    if (!rule.emailType) continue;

    // TRY 1: Use email_thread if available (new schema)
    const lastOutbound = outreach.email_thread
      ?.filter(e => e.direction === 'outbound')
      .sort((a, b) => {
        const aTime = a.sent_at?.toMillis?.() || 0;
        const bTime = b.sent_at?.toMillis?.() || 0;
        return bTime - aTime;
      })[0];

    let lastEmailDate: Date | null = null;
    let lastEmail: EmailMessage | null = null;

    if (lastOutbound && lastOutbound.sent_at) {
      // New schema - has email_thread
      lastEmailDate = new Date(lastOutbound.sent_at.toMillis());
      lastEmail = lastOutbound;

      // Check if we received any reply since last outbound
      const lastInbound = outreach.email_thread
        ?.filter(e => e.direction === 'inbound')
        .sort((a, b) => {
          const aTime = a.received_at?.toMillis?.() || 0;
          const bTime = b.received_at?.toMillis?.() || 0;
          return bTime - aTime;
        })[0];

      // If there's a reply after our last email, skip
      if (lastInbound && lastInbound.received_at) {
        const lastOutTime = lastOutbound.sent_at.toMillis();
        const lastInTime = lastInbound.received_at.toMillis();
        if (lastInTime > lastOutTime) {
          continue; // They replied, no follow-up needed
        }
      }
    } else {
      // TRY 2: Use "Outreach Date" field (old schema)
      // The field is inside rawData map in Firestore
      const outreachDateStr = (outreach as any).rawData?.['Outreach Date'];

      console.log('[FollowUp] No email_thread for', outreach.id, '- checking rawData[Outreach Date]:', outreachDateStr);
      console.log('[FollowUp] rawData exists:', !!(outreach as any).rawData);

      if (!outreachDateStr) {
        console.log('[FollowUp] No Outreach Date found for', outreach.id);
        continue;
      }

      const outreachDate = parseOutreachDate(outreachDateStr);
      if (!outreachDate) {
        console.log('[FollowUp] Could not parse date:', outreachDateStr);
        continue;
      }

      // Calculate when the last email was sent based on current status
      lastEmailDate = calculateLastEmailDate(outreachDate, outreach.status);
      console.log('[FollowUp] Calculated last email date:', lastEmailDate.toLocaleDateString(), 'for status:', outreach.status);

      // Create a mock email message for compatibility
      lastEmail = {
        id: `legacy_${outreach.status}`,
        direction: 'outbound',
        type: rule.emailType,
        from: 'ruth@badassery.co',
        to: outreach.host_email || '',
        subject: 'Podcast Guest Opportunity',
        body: '[Email from legacy data]',
        sent_at: Timestamp.fromDate(lastEmailDate),
        generated_by_ai: false,
      };
    }

    if (!lastEmailDate || !lastEmail) continue;

    // Calculate days since last email
    const daysSince = Math.floor((now.getTime() - lastEmailDate.getTime()) / (1000 * 60 * 60 * 24));
    console.log('[FollowUp] Days since last email:', daysSince, '- need', rule.daysToWait, 'days');

    // Check if it's time for follow-up
    if (daysSince >= rule.daysToWait) {
      const shouldSendAt = new Date(lastEmailDate);
      shouldSendAt.setDate(shouldSendAt.getDate() + rule.daysToWait);

      console.log('[FollowUp] ✅ ADDING candidate:', outreach.id, '- overdue by', daysSince - rule.daysToWait, 'days');

      candidates.push({
        outreach,
        daysWaiting: daysSince,
        shouldSendAt,
        nextEmailType: rule.emailType,
        lastEmail
      });
    } else {
      console.log('[FollowUp] ⏭️  Not ready yet - need', rule.daysToWait - daysSince, 'more days');
    }
  }

  console.log('[FollowUp] Total candidates found:', candidates.length);

  // Enrich candidates with client and podcast data
  const enrichedCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        // Load client data if not already present
        if (!candidate.outreach.client && candidate.outreach.client_id) {
          const client = await getClientById(candidate.outreach.client_id);
          if (client) {
            candidate.outreach.client = client;
          }
        }

        // Load podcast data if not already present
        if (!candidate.outreach.podcast && candidate.outreach.podcast_itunes_id) {
          const podcast = await getPodcastForOutreach(candidate.outreach.podcast_itunes_id);
          if (podcast) {
            candidate.outreach.podcast = podcast;
          }
        }
      } catch (error) {
        console.error(`[FollowUp] Error enriching candidate ${candidate.outreach.id}:`, error);
      }
      return candidate;
    })
  );

  // Sort by most overdue first
  enrichedCandidates.sort((a, b) => b.daysWaiting - a.daysWaiting);

  return enrichedCandidates;
}

/**
 * Generate follow-up email using Gemini AI
 */
export async function generateFollowUpEmail(
  candidate: FollowUpCandidate,
  apiKey: string
): Promise<{ subject: string; body: string }> {
  const { outreach, lastEmail, nextEmailType } = candidate;

  // Get original 1st email for context
  const originalEmail = outreach.email_thread?.find(e => e.type === '1st_email');

  // Extract client info from either client object or client_name field
  const clientFirstName = outreach.client?.identity?.firstName ||
                          outreach.client_name?.split(' ')[0] ||
                          'the guest';
  const clientLastName = outreach.client?.identity?.lastName ||
                         outreach.client_name?.split(' ').slice(1).join(' ') ||
                         '';
  const clientFullName = `${clientFirstName}${clientLastName ? ' ' + clientLastName : ''}`;

  // Get client expertise/bio
  const clientExpertise = outreach.client?.content?.bioUpdated ||
                          outreach.client?.content?.bioOriginal ||
                          outreach.client?.identity?.jobTitle ||
                          outreach.client?.spokesperson?.bio ||
                          'their unique expertise';

  // Get host name (extract first name if available)
  // Try multiple possible field names in rawData
  console.log('[EmailGen] Debug rawData for', outreach.id, ':', {
    rawDataExists: !!(outreach as any).rawData,
    rawDataKeys: (outreach as any).rawData ? Object.keys((outreach as any).rawData) : [],
    hostNameField: (outreach as any).rawData?.['Host Name'],
    hostField: (outreach as any).rawData?.['Host'],
  });

  const hostFullName = (outreach as any).rawData?.['Host Name'] ||
                       (outreach as any).rawData?.['Host'] ||
                       (outreach as any).rawData?.['hostName'] ||
                       (outreach as any).host_name ||
                       '';

  // Extract first name intelligently
  let hostFirstName = '';
  if (hostFullName && hostFullName !== '') {
    // If it's a real name, extract first part
    hostFirstName = hostFullName.split(' ')[0].trim();
  }

  // If we still don't have a host name, try to extract from podcast name
  if (!hostFirstName || hostFirstName === '') {
    // Some podcasts are named after the host, e.g., "The Joe Rogan Experience"
    // Use podcast name as fallback
    const podcastTitle = outreach.podcast_name || outreach.podcast?.title || '';
    if (podcastTitle) {
      // Extract potential name from podcast title (simple heuristic)
      const words = podcastTitle.split(' ');
      if (words.length > 1) {
        hostFirstName = words[1]; // Often "The [Name] Podcast"
      }
    }
  }

  // Final fallback
  if (!hostFirstName || hostFirstName === '' || hostFirstName === 'the' || hostFirstName === 'The') {
    hostFirstName = 'there'; // "Hi there," is better than "Hi the,"
  }

  // Get podcast description for context
  const podcastName = outreach.podcast_name || outreach.podcast?.title || 'your podcast';
  const podcastDescription = outreach.podcast?.description ||
                             outreach.podcast?.ai_summary ||
                             '';

  const prompt = `Write a follow up email using this template but ensure it aligns to the original email sent.

ORIGINAL EMAIL:
Subject: ${originalEmail?.subject || 'N/A'}
Body:
${originalEmail?.body || 'N/A'}

CONTEXT:
- This is the ${nextEmailType === '1st_followup' ? 'FIRST' : 'SECOND'} follow-up
- Host name: ${hostFullName} (use first name: ${hostFirstName})
- Podcast: ${podcastName}
${podcastDescription ? `- Podcast focus: ${podcastDescription.substring(0, 200)}` : ''}
- Client: ${clientFullName}
- Client expertise: ${typeof clientExpertise === 'string' ? clientExpertise.substring(0, 300) : clientExpertise}
- Days since last email: ${candidate.daysWaiting}

TEMPLATE FOR ${nextEmailType === '1st_followup' ? 'FIRST FOLLOW-UP' : 'SECOND FOLLOW-UP'}:

Hi ${hostFirstName},

Just wanted to follow up to see if you're currently looking for new podcast guests.

${clientFullName}'s expertise offers a unique perspective that could be valuable for ${podcastName} listeners.

Happy to coordinate next steps or share more information if this sounds like a fit.

Warm regards,
Ruth Kimani

INSTRUCTIONS:
1. Use the host's first name (${hostFirstName})
2. Use the client's full name (${clientFullName})
3. Reference the client's actual expertise and achievements based on the bio/description provided
4. Mention specific topics or themes that align with the podcast's focus
5. Keep it brief and friendly (3-4 sentences max)
6. Maintain Ruth's professional tone
7. Return ONLY the email body (no subject line, I'll generate that separately)
8. Do NOT include [brackets] - use actual names and information provided above`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedBody = data.candidates[0].content.parts[0].text.trim();

    // Generate subject line
    const subjectPrompt = `Generate a brief, professional follow-up email subject line for a podcast guest pitch follow-up.
Original subject was: "${originalEmail?.subject || 'Podcast Guest Opportunity'}"
This is the ${nextEmailType === '1st_followup' ? 'first' : 'second'} follow-up.
Return ONLY the subject line, no quotes, no explanation.`;

    const subjectResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: subjectPrompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 100,
          }
        })
      }
    );

    const subjectData = await subjectResponse.json();
    const generatedSubject = subjectData.candidates[0].content.parts[0].text.trim();

    return {
      subject: generatedSubject,
      body: generatedBody
    };
  } catch (error) {
    console.error('Error generating follow-up email:', error);
    throw error;
  }
}

/**
 * Get follow-up statistics
 */
export async function getFollowUpStats() {
  const candidates = await getFollowUpCandidates();

  return {
    total: candidates.length,
    overdue_5plus_days: candidates.filter(c => c.daysWaiting > 5).length,
    first_followups: candidates.filter(c => c.nextEmailType === '1st_followup').length,
    second_followups: candidates.filter(c => c.nextEmailType === '2nd_followup').length,
    most_overdue: candidates[0] || null
  };
}

// ============================================================================
// CONTEXTUAL EMAIL GENERATION (for action buttons)
// ============================================================================

type EmailActionType = 'first_email' | 'followup1' | 'followup2' | 'screening' | 'recording' | 'prep';

// English prompts - these are the defaults if aiConfigService prompts are not available
const EMAIL_PROMPTS: Record<EmailActionType, string> = {
  first_email: `You are Ruth from Badassery, a podcast booking agency.
Write the FIRST PITCH email to a podcast host to introduce a client as a potential guest.

=== PODCAST INFO ===
- Podcast: {podcast_name}
- Host: {host_name}
- Podcast Description: {podcast_description}

=== CLIENT INFO ===
- Client: {client_name} ({client_title})
- Client expertise: {client_expertise}
- Topics they can discuss: {client_topics}

=== INSTRUCTIONS ===
1. Start with a personalized opener referencing the podcast
2. Introduce the client and their credentials briefly (2-3 sentences)
3. Explain why they would be a great fit for THIS specific podcast
4. Mention 2-3 specific topics they could discuss
5. End with a soft call-to-action (e.g., "Would you be open to exploring this?")
6. Keep it concise (5-7 sentences total)
7. Tone: warm, professional, not salesy
8. Sign off: "Best, Ruth"
9. DO NOT use [brackets] or placeholders - use actual names provided
10. Write ONLY the email body (no subject line)

Write the pitch email now:`,

  followup1: `You are Ruth from Badassery, a podcast booking agency.
Write a FIRST follow-up email for a pitch sent a few days ago with no response.

=== ORIGINAL EMAIL ===
{previous_message}

=== CONTEXT ===
- Podcast: {podcast_name}
- Host: {host_name}
- Client: {client_name} ({client_title})
- Client expertise: {client_expertise}

=== INSTRUCTIONS ===
1. Be brief (3-4 sentences max)
2. Reference your previous email
3. Add a new reason to respond (highlight a different angle or expertise)
4. End with a simple question
5. Tone: friendly but professional
6. Sign off: "Best, Ruth"
7. DO NOT use [brackets] or placeholders - use actual names provided
8. Write ONLY the email body (no subject line)

Write the email now:`,

  followup2: `You are Ruth from Badassery, a podcast booking agency.
This is the SECOND and FINAL follow-up after 2 emails with no response.

=== PREVIOUS EMAIL SENT ===
{previous_message}

=== CONTEXT ===
- Podcast: {podcast_name}
- Host: {host_name}
- Client: {client_name} ({client_title})
- Client expertise: {client_expertise}

=== INSTRUCTIONS ===
1. Very brief (2-3 sentences)
2. Mention this is your last message
3. Offer an exit ("if now isn't the right time...")
4. End on a positive note
5. Sign off: "Best, Ruth"
6. DO NOT use [brackets] or placeholders - use actual names provided
7. Write ONLY the email body (no subject line)

Write the email now:`,

  screening: `You are Ruth from Badassery. The podcast host responded positively!
You need to propose a screening call to discuss the episode.

=== PREVIOUS CONVERSATION ===
{previous_message}

=== INFORMATION ===
- Podcast: {podcast_name}
- Host: {host_name}
- Client: {client_name} ({client_title})
- Client topics: {client_topics}

=== INSTRUCTIONS ===
1. Thank them for the positive response
2. Briefly explain the screening call (15-20 min to discuss topics)
3. Offer to send a calendar link or ask for their availability
4. Be enthusiastic but professional
5. Sign off: "Best, Ruth"
6. DO NOT use [brackets] or placeholders - use actual names provided
7. Write ONLY the email body (no subject line)

Write the email now:`,

  recording: `You are Ruth from Badassery. The screening call went well!
Now you need to coordinate the recording date.

=== PREVIOUS CONVERSATION ===
{previous_message}

=== INFORMATION ===
- Podcast: {podcast_name}
- Host: {host_name}
- Client: {client_name}
- Screening notes: {screening_notes}

=== INSTRUCTIONS ===
1. Thank them for the screening call
2. Express enthusiasm for the episode
3. Ask for their availability for recording
4. Mention estimated duration if known
5. Sign off: "Best, Ruth"
6. DO NOT use [brackets] or placeholders - use actual names provided
7. Write ONLY the email body (no subject line)

Write the email now:`,

  prep: `You are Ruth from Badassery, a podcast booking agency.
Write a PREP EMAIL to send to the CLIENT (not the host) to prepare them for their upcoming podcast recording.

=== PODCAST DETAILS ===
- Podcast Name: {podcast_name}
- Host Name: {host_name}
- Recording Date: {recording_date}
- Podcast Description: {podcast_description}
- Podcast Link: {podcast_link}

=== CLIENT INFO ===
- Client: {client_name}
- Topics to discuss: {client_topics}

=== INSTRUCTIONS ===
1. Address the client by first name
2. Remind them of the upcoming recording date/time
3. Include key info about the podcast:
   - Brief description of the show
   - Host name and style
   - Audience demographics if known
4. Suggest they listen to 1-2 recent episodes
5. Include the podcast link if available
6. Remind them of talking points/topics
7. Offer any last-minute assistance
8. Sign off: "Best, Ruth"
9. DO NOT use [brackets] or placeholders - use actual names and info provided
10. Write ONLY the email body (no subject line)

Write the prep email now:`
};

/**
 * Generate contextual email for any action type
 */
export async function generateContextualEmail(
  outreach: Outreach,
  actionType: EmailActionType,
  previousMessage: { subject: string; body: string } | null,
  apiKey: string
): Promise<{ subject: string; body: string }> {
  const promptTemplate = EMAIL_PROMPTS[actionType];

  // Get client info - extract first name properly
  const clientFirstName = outreach.client?.identity?.firstName ||
    outreach.client_name?.split(' ')[0] ||
    '';
  const clientLastName = outreach.client?.identity?.lastName ||
    outreach.client_name?.split(' ').slice(1).join(' ') ||
    '';
  const clientName = clientFirstName + (clientLastName ? ' ' + clientLastName : '') || 'our client';

  const clientTitle = outreach.client?.spokesperson?.title ||
    outreach.client?.identity?.jobTitle ||
    '';

  const clientTopics = outreach.client?.spokesperson?.topics?.join(', ') ||
    outreach.client?.content?.speakingTopicsArray?.join(', ') ||
    '';

  // Get client expertise/bio for better context
  const clientExpertise = outreach.client?.content?.bioUpdated ||
    outreach.client?.content?.bioOriginal ||
    outreach.client?.spokesperson?.bio ||
    clientTopics ||
    'their unique expertise';

  // Get podcast/host info
  const podcastName = outreach.podcast_name || outreach.podcast?.title || 'the podcast';

  // Try to get host name from various sources - extract first name for friendly greeting
  const hostFullName = (outreach as any).rawData?.['Host Name'] ||
    (outreach as any).rawData?.['Host'] ||
    (outreach as any).host_name ||
    (outreach as any).hostContactInfo?.name ||
    '';

  // Extract first name only for greeting
  let hostName = 'there'; // Default fallback
  if (hostFullName && hostFullName.trim() !== '') {
    const firstName = hostFullName.split(' ')[0].trim();
    if (firstName && firstName.toLowerCase() !== 'the') {
      hostName = firstName;
    }
  }

  console.log('[EmailGen] Generating', actionType, 'email for:', {
    podcastName,
    hostName,
    clientName,
    hasPreviousMessage: !!previousMessage
  });

  // Get podcast description and link for prep email
  const podcastDescription = outreach.podcast?.description ||
    outreach.podcast?.ai_summary ||
    '';
  const podcastLink = (outreach.podcast as any)?.rss_url ||
    (outreach.podcast as any)?.website_url ||
    outreach.podcast_url ||
    '';

  // Format recording date if available
  let recordingDateStr = 'TBD';
  if (outreach.recording_date?.toDate) {
    const rDate = outreach.recording_date.toDate();
    recordingDateStr = rDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } else if (outreach.screening_call_date?.toDate) {
    const sDate = outreach.screening_call_date.toDate();
    recordingDateStr = sDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  // Build the prompt with all placeholders replaced
  const prompt = promptTemplate
    .replace(/{previous_message}/g, previousMessage?.body || '[No previous message available - please paste it in the modal]')
    .replace(/{podcast_name}/g, podcastName)
    .replace(/{host_name}/g, hostName)
    .replace(/{client_name}/g, clientName)
    .replace(/{client_title}/g, clientTitle || 'Expert')
    .replace(/{client_topics}/g, clientTopics || 'various topics')
    .replace(/{client_expertise}/g, typeof clientExpertise === 'string' ? clientExpertise.substring(0, 500) : '')
    .replace(/{screening_notes}/g, outreach.screening_call_notes || '')
    .replace(/{podcast_description}/g, podcastDescription.substring(0, 500) || 'a great podcast')
    .replace(/{podcast_link}/g, podcastLink || '[link will be provided]')
    .replace(/{recording_date}/g, recordingDateStr);

  try {
    // Generate email body
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedBody = data.candidates[0].content.parts[0].text.trim();

    // Generate subject line based on action type and previous subject
    const subject = generateSubjectForAction(actionType, previousMessage?.subject || '', podcastName);

    return { subject, body: generatedBody };
  } catch (error) {
    console.error(`[Automation] Error generating ${actionType} email:`, error);
    throw error;
  }
}

/**
 * Generate appropriate subject line for each action type
 */
function generateSubjectForAction(
  actionType: EmailActionType,
  previousSubject: string,
  podcastName: string
): string {
  const cleanSubject = previousSubject.replace(/^(Re:\s*)+/i, '').trim();

  switch (actionType) {
    case 'first_email':
      return `Podcast Guest Opportunity for ${podcastName}`;
    case 'followup1':
    case 'followup2':
      return cleanSubject ? `Re: ${cleanSubject}` : `Following up - Guest for ${podcastName}`;
    case 'screening':
      return `Quick call to discuss ${podcastName} appearance`;
    case 'recording':
      return `Recording scheduling - ${podcastName}`;
    case 'prep':
      return `Preparing for your ${podcastName} appearance`;
    default:
      return `Re: ${cleanSubject || podcastName}`;
  }
}
