
export type UserRole = 'admin' | 'employee' | 'client' | 'viewer';

export interface User {
  id: string;
  display_name: string;
  role: UserRole;
  avatar_url: string;
}

export interface Podcast {
  // Core Podcast Info (from iTunes/Firestore)
  id?: string;  // Optional - PodcastDocument uses itunesId
  itunesId?: string;
  title?: string;  // Optional - PodcastDocument uses showName
  show_name?: string; // Alias for title
  description?: string;
  imageUrl?: string;  // Optional - PodcastDocument uses artworkUrl
  artwork_url?: string; // Alias for imageUrl
  language?: string;
  episodeCount?: number;
  genres?: string[];

  // Apple Metrics
  apple_rating?: number;
  apple_rating_count?: number;
  apple?: {
    rating: number;
    review_count: number;
  };

  // Social Media Metrics
  yt_subscribers?: number;
  instagram_followers?: number;
  twitter_followers?: number;
  linkedin_followers?: number;
  youtube?: {
    subscribers: number;
  };

  // AI Categorization Fields (from parallel_scoring_v2.js)
  ai_primary_category?: string;           // One of 31 Badassery niches
  ai_secondary_categories?: string[];     // 2-3 related niches
  ai_topics?: string[];                   // 3-5 topics
  ai_target_audience?: string;            // Target audience description
  ai_podcast_style?: string;              // Interview|Solo|Panel|etc
  ai_business_relevance?: number;         // 1-10 scale
  ai_guest_friendly?: boolean;            // true/false
  ai_summary?: string;                    // 2-3 sentence summary

  // AI Engagement & Quality Metrics
  ai_engagement_level?: number;           // 1.0-10.0 weighted score
  ai_audience_size?: string;              // Small|Medium|Large|Very Large|Unknown
  ai_content_quality?: number;            // 1.0-10.0
  ai_monetization_potential?: number;     // 1.0-10.0

  // Badassery Score & Percentiles
  ai_badassery_score?: number;            // 0-10 composite score
  badassery_score?: number;               // Alias for ai_badassery_score
  ai_category_percentile?: string;        // Top 1%|Top 5%|Top 10%|Top 25%|Top 50%|Standard
  ai_category_rank?: number | null;       // Rank within category
  ai_category_total?: number;             // Total podcasts in category
  ai_percentile_used_global?: boolean;    // true if category < 10 podcasts
  ai_global_percentile?: string;          // Global percentile
  ai_global_rank?: number;                // Global rank
  ai_global_total?: number;               // Total podcasts scored

  // Status & Metadata
  aiCategorizationStatus?: 'completed' | 'failed' | 'pending';
  aiCategorizedAt?: any; // Firestore Timestamp
  updatedAt?: any;       // Firestore Timestamp
  lastUpdate?: number;   // Unix timestamp

  // Legacy/Mock fields for backward compatibility
  classification?: {
    topics: string[];
  };
  contact?: {
    email_primary: string | null;
  };
}

// Client Identity
export interface ClientIdentity {
  rowNumber?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  company: string;
  companySize?: string;
  representationType: string;
}

// Client Goals
export interface ClientGoals {
  professionalGoals: string;
  workDescription: string;
  missionDescription: string;
  whyNow: string;
  top3Goals: string;
  challenges: string;
  successDefinition: string;
}

// Client Links
export interface ClientLinks {
  linkedinAndSocial: string;
  pastBrandingWork?: string;
  headshot?: string;
  schedulingLink?: string;
  pastPodcasts?: string;
  toneVoiceContent?: string;
  audioVideoPrompt?: string;
  badasseryProfileUrl?: string;  // Badassery profile link for emails
}

// Client Current Status
export interface ClientCurrentStatus {
  pastBrandingWork: string;
  onlinePresenceRating: string;
  platformsUsed: string[];
  contentFrequency: string;
  channelReach?: string;
}

// Client Self Assessment
export interface ClientSelfAssessment {
  clarity: string;
  confidence: string;
  promotionComfort: string;
  presenceStrength: string;
  inboundSatisfaction: string;
  industryRecognition: string;
}

// Client Brand Personality
export interface ClientBrandPersonality {
  threeAdjectives: string;
  audienceFeeling: string;
  keyPhrases: string;
  commonMisunderstandings: string;
  passionTopics: string;
  phrasesToAvoid: string;
  admiredBrands: string;
}

// Client Content
export interface ClientContent {
  bioOriginal?: string;
  bioUpdated?: string;
  bioV1?: string;
  speakingTopicsOriginal?: string;
  speakingTopicsUpdated?: string;
  speakingTopicsArray?: string[];
}

// Client Podcast Preferences
export interface ClientPodcastPreferences {
  audienceDescription: string;
  productsServices: string;
  dreamPodcasts: string;
  targetLocation: string;
  targetLocations?: string[];  // Multi-select: U.S., Europe, No Preference
  openToInPerson?: boolean;    // Made optional - should not be auto-selected
  keyQuestions: string;
  unaskedQuestion: string;
  listenerTakeaways: string;
  upcomingLaunches?: string;
}

// Client Preferences
export interface ClientPreferences {
  feedbackStyle: string;
  monthlyTimeCommitment: string;
  interestedInCommunity: boolean;
  openToLinkedInPost?: boolean | null;
  legalGuidelines: string;
  additionalNotes?: string;
}

// Client Metadata
export interface ClientMetadata {
  startDateUtc: string;
  submitDateUtc: string;
  clientStatus: string;
  tags: string[];
  apiCategory1: string;
  apiCategoryList: string[];
}

// Main Client Interface (matching Firestore structure)
export interface Client {
  id?: string;
  identity?: ClientIdentity;
  goals?: ClientGoals;
  links?: ClientLinks;
  currentStatus?: ClientCurrentStatus;
  selfAssessment?: ClientSelfAssessment;
  brandPersonality?: ClientBrandPersonality;
  content?: ClientContent;
  podcast?: ClientPodcastPreferences;
  preferences?: ClientPreferences;
  metadata?: ClientMetadata;
  importedAt?: string;
  updatedAt?: string;
  source?: string;

  // Legacy fields for backward compatibility and UI display
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  industry?: string;
  logo_url?: string;
  status?: 'active' | 'onboarding' | 'paused' | 'churned';

  // AI-generated fields
  ai_summary?: string;              // AI-generated summary of client
  ai_summary_generated_at?: any;    // Firestore Timestamp

  stats?: {
    matches?: number;
    total_outreach_started: number;
    total_bookings: number;
    goal_bookings?: number;         // Booking goal for client
  };
  spokesperson?: {
    name: string;
    title: string;
    bio?: string;
    topics?: string[];
    unique_angles?: string[];
    linkedin_url?: string;
  };
}

// Helper function to convert new Client format to legacy format for UI
export function getClientDisplayData(client: Client): {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  logo_url: string;
  status: 'active' | 'onboarding' | 'paused' | 'churned';
  industry: string;
  stats: {
    matches: number;
    total_outreach_started: number;
    total_bookings: number;
    goal_bookings: number;
  };
  spokesperson: {
    name: string;
    title: string;
    bio?: string;
    topics?: string[];
    linkedin_url?: string;
  };
} {
  // Safely get status from metadata
  let status: 'active' | 'onboarding' | 'paused' | 'churned' = 'active';
  if (client.status) {
    status = client.status;
  } else if (client.metadata?.clientStatus) {
    const metaStatus = client.metadata.clientStatus.toLowerCase();
    if (metaStatus === 'active' || metaStatus === 'onboarding' || metaStatus === 'paused' || metaStatus === 'churned') {
      status = metaStatus as 'active' | 'onboarding' | 'paused' | 'churned';
    }
  }

  return {
    id: client.id || '',
    company_name: client.company_name || client.identity?.company || 'Unknown',
    contact_name: client.contact_name || `${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`.trim() || 'Unknown',
    email: client.email || client.identity?.email || '',
    phone: client.phone || client.identity?.phone || '',
    logo_url: client.logo_url || client.links?.headshot || 'https://picsum.photos/100/100',
    status: status,
    industry: client.industry || client.metadata?.tags?.[0] || 'General',
    stats: {
      matches: client.stats?.matches ?? 0,
      total_outreach_started: client.stats?.total_outreach_started ?? 0,
      total_bookings: client.stats?.total_bookings ?? 0,
      goal_bookings: client.stats?.goal_bookings ?? 0
    },
    spokesperson: client.spokesperson || {
      name: `${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`.trim() || 'Unknown',
      title: client.identity?.jobTitle || '',
      bio: client.content?.bioUpdated || client.content?.bioOriginal,
      topics: client.content?.speakingTopicsArray,
      linkedin_url: client.links?.linkedinAndSocial
    }
  };
}

// ============================================================================
// OUTREACH TYPES - Complete Schema
// ============================================================================

export type OutreachStatus =
  // Discovery phase
  | 'identified'           // NEW: Podcast identified, not yet contacted
  | 'ready_for_outreach'
  // Active pipeline
  | '1st_email_sent'
  | '1st_followup_sent'
  | '2nd_followup_sent'
  | 'in_contact'
  | 'scheduling_screening'
  | 'screening_scheduled'
  | 'scheduling_recording'
  | 'recording_scheduled'
  | 'recorded'
  | 'live'
  // Parking (resume later)
  | 'backlog'
  | 'follow_up_1_month'
  | 'fill_form'
  // Closed
  | 'declined_by_host'
  | 'client_declined'
  | 'no_response'
  | 'cancelled'
  | 'email_bounced'
  | 'paid_podcast'
  // Blacklist
  | 'blacklist';

export type OutreachStatusCategory = 'discovery' | 'active' | 'parking' | 'closed' | 'success' | 'blacklist';

export interface EmailMessage {
  id: string;
  direction: 'outbound' | 'inbound';
  type: '1st_email' | '1st_followup' | '2nd_followup' | 'reply' | 'scheduling' | 'thank_you' | 'prep' | 'pitch' | 'other';

  // Headers
  from: string;
  to: string;
  cc?: string | null;
  subject: string;

  // Content
  body: string;
  body_html?: string;

  // AI & Edit tracking
  generated_by_ai?: boolean;
  ai_model_used?: string;
  original_ai_body?: string;
  edited_by_user?: boolean;
  edit_summary?: string;

  // Send/Receive info
  sent_via?: 'api' | 'manual';
  sent_at?: any; // Firestore Timestamp
  sent_by?: string; // user_id
  received_at?: any; // Firestore Timestamp
  logged_by?: string; // user_id
  logged_at?: any; // Firestore Timestamp

  // Tracking
  api_message_id?: string;
  delivered?: boolean;
  opened?: boolean;
  opened_at?: any; // Firestore Timestamp

  // Reply context
  in_reply_to?: string; // email_id

  // AI Analysis (for inbound)
  ai_analysis?: {
    sentiment: 'positive' | 'neutral' | 'negative';
    sentiment_score: number; // 0-1
    summary: string;
    key_points: string[];
    suggested_action?: string;
    suggested_status?: OutreachStatus;
    suggested_reply_generated?: boolean;
  };
}

export interface OutreachNote {
  id: string;
  text: string;
  created_by: string; // user_id
  created_at: any; // Firestore Timestamp
}

export interface OutreachReminder {
  type: 'follow_up_due' | 'screening_call' | 'recording' | 'custom';
  due_at: any; // Firestore Timestamp
  completed: boolean;
  completed_at?: any; // Firestore Timestamp
  note?: string;
}

export interface Outreach {
  id: string;

  // ═══════════════════════════════════════════════════════════════
  // RELATIONS
  // ═══════════════════════════════════════════════════════════════
  client_id: string;
  podcast_id: string;  // Legacy iTunes ID (kept for compatibility)
  podcast_itunes_id?: string;  // NEW: Link to podcasts collection by iTunes ID
  match_id?: string; // Link to matches collection (if from AI match)
  assigned_to?: string; // user_id of employee responsible

  // Joined data (populated in UI, not in Firestore)
  podcast?: Podcast;
  client?: Client;

  // ═══════════════════════════════════════════════════════════════
  // DISPLAY FIELDS (denormalized for easy access)
  // ═══════════════════════════════════════════════════════════════
  client_name?: string;      // Denormalized client name
  podcast_name?: string;     // Denormalized podcast name
  podcast_url?: string;      // Podcast link
  host_email?: string;       // Host contact email

  // ═══════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════
  status: OutreachStatus;
  status_category?: OutreachStatusCategory; // Made optional for backward compat
  previous_status?: OutreachStatus;
  status_changed_at?: any; // Firestore Timestamp
  status_changed_by?: string; // user_id

  // ═══════════════════════════════════════════════════════════════
  // SUBJECT/TOPIC (pitch angle)
  // ═══════════════════════════════════════════════════════════════
  subject_tag?: string; // e.g., "FDA Approval Journey" - made optional
  pitch_angle?: string; // e.g., "Neil's journey navigating FDA from France"

  // ═══════════════════════════════════════════════════════════════
  // EMAIL THREAD (complete history)
  // ═══════════════════════════════════════════════════════════════
  email_thread: EmailMessage[];

  // ═══════════════════════════════════════════════════════════════
  // EMAIL STATS (calculated automatically)
  // ═══════════════════════════════════════════════════════════════
  email_stats?: {
    total_sent: number;
    total_received: number;
    last_outbound_at?: any; // Firestore Timestamp
    last_inbound_at?: any; // Firestore Timestamp
    awaiting_reply: boolean;
    awaiting_reply_since?: any; // Firestore Timestamp
    days_since_last_activity?: number;
    response_time_avg_hours?: number;
  };

  // ═══════════════════════════════════════════════════════════════
  // IMPORTANT DATES
  // ═══════════════════════════════════════════════════════════════
  outreach_date?: any; // Firestore Timestamp - Date of LAST EMAIL SENT (for follow-up tracking)

  screening_call_date?: any; // Firestore Timestamp
  screening_call_notes?: string;

  recording_date?: any; // Firestore Timestamp
  recording_notes?: string;

  live_date?: any; // Firestore Timestamp
  live_episode_url?: string;
  live_episode_title?: string;

  // ═══════════════════════════════════════════════════════════════
  // NOTES & REMINDERS
  // ═══════════════════════════════════════════════════════════════
  notes: OutreachNote[];
  reminders: OutreachReminder[];

  // ═══════════════════════════════════════════════════════════════
  // PARKING / CLOSE REASONS
  // ═══════════════════════════════════════════════════════════════
  parking_reason?: 'backlog' | 'follow_up_1_month' | 'fill_form' | null;
  parking_until?: any; // Firestore Timestamp
  parking_notes?: string;

  close_reason?: 'declined_by_host' | 'client_declined' | 'no_response' | 'cancelled' | 'email_bounced' | 'paid_podcast' | null;
  close_notes?: string;

  blacklist?: boolean;
  blacklist_reason?: 'cancelled_last_minute' | 'no_show' | 'unprofessional' | 'other' | null;
  blacklist_notes?: string;      // Free text notes for blacklist
  blacklist_date?: any;          // Firestore Timestamp when blacklisted
  blacklist_by?: string;         // user_id who blacklisted

  // ═══════════════════════════════════════════════════════════════
  // EMAIL COPY TRACKING (for audit/history)
  // ═══════════════════════════════════════════════════════════════

  // First email (pitch)
  first_email_copy?: string;        // Copy of the first email sent
  first_email_subject?: string;     // Subject of first email
  first_email_sent_at?: any;        // Firestore Timestamp when first email was sent
  first_email_sent_by?: string;     // user_id who sent it

  // Follow-up 1
  first_followup_copy?: string;     // Copy of first follow-up
  first_followup_subject?: string;  // Subject of first follow-up
  first_followup_sent_at?: any;     // When first follow-up was sent
  first_followup_sent_by?: string;  // user_id who sent it

  // Follow-up 2
  second_followup_copy?: string;    // Copy of second follow-up
  second_followup_subject?: string; // Subject of second follow-up
  second_followup_sent_at?: any;    // When second follow-up was sent
  second_followup_sent_by?: string; // user_id who sent it

  // Screening email
  screening_email_copy?: string;       // Copy of screening scheduling email
  screening_email_subject?: string;    // Subject of screening email
  screening_email_sent_at?: any;       // When screening email was sent
  screening_email_sent_by?: string;    // user_id who sent it

  // Recording email
  recording_email_copy?: string;       // Copy of recording scheduling email
  recording_email_subject?: string;    // Subject of recording email
  recording_email_sent_at?: any;       // When recording email was sent
  recording_email_sent_by?: string;    // user_id who sent it

  // Prep Email (sent to CLIENT before screening/recording)
  prep_email_copy?: string;            // Copy of prep email
  prep_email_subject?: string;         // Subject of prep email
  prep_email_sent_at?: any;            // When prep email was sent
  prep_email_sent_by?: string;         // user_id who sent it
  prep_email_type?: 'screening' | 'recording'; // Whether for screening or recording

  // AI Generation tracking
  ai_generated_pitch?: string;      // Original AI-generated pitch (before edits)
  ai_pitch_generated_at?: any;      // When the pitch was generated
  pitch_was_edited?: boolean;       // Whether user edited the AI pitch

  // ═══════════════════════════════════════════════════════════════
  // LEGACY FIELDS (for backward compatibility with old outreach records)
  // ═══════════════════════════════════════════════════════════════
  last_activity?: string;
  email_subject?: string;
  email_body?: string;
  sent_at?: any; // Firestore Timestamp
  response_received?: boolean;
  response_date?: any; // Firestore Timestamp

  // ═══════════════════════════════════════════════════════════════
  // REVIEW
  // ═══════════════════════════════════════════════════════════════
  review_token?: string; // Token for host review link

  // ═══════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════
  created_at: any; // Firestore Timestamp
  updated_at: any; // Firestore Timestamp
  created_by?: string; // user_id
}

// ============================================================================
// OUTREACH HELPER FUNCTIONS
// ============================================================================

/**
 * Get status category from status
 */
export function getOutreachStatusCategory(status: OutreachStatus): OutreachStatusCategory {
  const discovery: OutreachStatus[] = [
    'identified',
  ];

  const active: OutreachStatus[] = [
    'ready_for_outreach',
    '1st_email_sent',
    '1st_followup_sent',
    '2nd_followup_sent',
    'in_contact',
    'scheduling_screening',
    'screening_scheduled',
    'scheduling_recording',
    'recording_scheduled',
  ];

  const parking: OutreachStatus[] = [
    'backlog',
    'follow_up_1_month',
    'fill_form',
  ];

  const success: OutreachStatus[] = [
    'recorded',
    'live',
  ];

  const closed: OutreachStatus[] = [
    'declined_by_host',
    'client_declined',
    'no_response',
    'cancelled',
    'email_bounced',
    'paid_podcast',
  ];

  if (status === 'blacklist') return 'blacklist';
  if (discovery.includes(status)) return 'discovery';
  if (success.includes(status)) return 'success';
  if (parking.includes(status)) return 'parking';
  if (closed.includes(status)) return 'closed';
  return 'active';
}

/**
 * Initialize email_thread from legacy fields if needed
 */
export function migrateOutreachToNewSchema(oldOutreach: any): Partial<Outreach> {
  const email_thread: EmailMessage[] = [];
  const notes: OutreachNote[] = [];
  const reminders: OutreachReminder[] = [];

  // Migrate legacy email fields to email_thread
  if (oldOutreach.email_subject && oldOutreach.email_body) {
    email_thread.push({
      id: 'legacy_email_001',
      direction: 'outbound',
      type: '1st_email',
      from: 'legacy@system.com',
      to: oldOutreach.hostContactInfo?.email || 'unknown@unknown.com',
      subject: oldOutreach.email_subject,
      body: oldOutreach.email_body,
      sent_at: oldOutreach.sent_at || null,
      generated_by_ai: false,
    });
  }

  // Migrate legacy notes
  if (oldOutreach.notes && typeof oldOutreach.notes === 'string') {
    notes.push({
      id: 'legacy_note_001',
      text: oldOutreach.notes,
      created_by: 'system',
      created_at: oldOutreach.created_at || new Date(),
    });
  }

  // Map legacy status to new status format
  let status: OutreachStatus = 'ready_for_outreach';
  if (oldOutreach['Outreach Status']) {
    const oldStatus = oldOutreach['Outreach Status'];
    if (oldStatus === 'Ready for outreach') status = 'ready_for_outreach';
    else if (oldStatus === '1st message sent') status = '1st_email_sent';
    else if (oldStatus === '1st follow- up sent') status = '1st_followup_sent';
    else if (oldStatus === '2nd follow-up sent') status = '2nd_followup_sent';
    else if (oldStatus === 'Scheduling Screening Call') status = 'scheduling_screening';
    else if (oldStatus === 'Screening Call Scheduled') status = 'screening_scheduled';
    else if (oldStatus === 'Scheduling Recording') status = 'scheduling_recording';
    else if (oldStatus === 'Recording Scheduled') status = 'recording_scheduled';
    else if (oldStatus === 'Recorded') status = 'recorded';
    else if (oldStatus === 'Live') status = 'live';
    else if (oldStatus === 'Host said no') status = 'declined_by_host';
    else if (oldStatus === 'Email bounced') status = 'email_bounced';
    else if (oldStatus === 'Paid podcast') status = 'paid_podcast';
    else if (oldStatus === 'Blacklist') status = 'blacklist';
    else status = oldOutreach.status || 'ready_for_outreach';
  } else if (oldOutreach.status) {
    status = oldOutreach.status;
  }

  return {
    ...oldOutreach,
    status: status,
    status_category: getOutreachStatusCategory(status),
    email_thread: email_thread.length > 0 ? email_thread : [],
    notes: notes.length > 0 ? notes : [],
    reminders: reminders,
    email_stats: {
      total_sent: email_thread.length,
      total_received: 0,
      awaiting_reply: false,
    },
  };
}

export interface ActivityLog {
  id: string;
  user_name: string;
  action: string;
  description: string;
  timestamp: string;
  type: 'email' | 'status' | 'system' | 'ai';
}

// ============================================================================
// AI MATCHING TYPES
// ============================================================================

export type AIMatchStatus = 'pending' | 'approved' | 'rejected';

export interface AIMatch {
  id: string;

  // Relations
  client_id: string;
  podcast_itunes_id: string;

  // Match data from Gemini
  status: AIMatchStatus;
  match_score: number; // 0-100
  match_reasoning: string;
  match_topics: string[];

  // Generation metadata
  batch_id: string;
  generated_at: any; // Firestore Timestamp
  generated_by: string;

  // Action metadata
  actioned_at?: any; // Firestore Timestamp
  actioned_by?: string;

  // If approved, link to created outreach
  outreach_id?: string;

  // If rejected
  rejection_reason?: string;
  can_resurface: boolean; // true = can reappear in future batches
}

// Enriched version with joined data for UI
export interface AIMatchWithPodcast extends AIMatch {
  podcast?: Podcast;
  client?: Client;
}

// ============================================================================
// WISHLIST TYPES
// ============================================================================

export interface WishlistItem {
  id: string;
  client_id: string;
  podcast_itunes_id: string;

  // Metadata
  added_by: string;  // user_id who added it
  added_at: any;     // Firestore Timestamp
  notes?: string;    // Optional notes about why this is a good fit

  // Status
  status: 'pending' | 'contacted' | 'converted'; // converted = outreach created
  outreach_id?: string; // If converted to outreach

  // Denormalized for display
  podcast_name?: string;
  client_name?: string;
}

// Enriched version with podcast data
export interface WishlistItemWithPodcast extends WishlistItem {
  podcast?: Podcast;
}
