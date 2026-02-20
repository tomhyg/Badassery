/**
 * Test Outreach Data Generator
 *
 * Creates test outreach records for the client "hgfd" to test
 * all Kanban visual indicators and workflow transitions.
 *
 * Run from browser console or via a test page.
 */

import { db } from '../services/firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  limit,
  Timestamp,
  doc,
  setDoc
} from 'firebase/firestore';
import { OutreachStatus } from '../types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLIENT_FIRST_NAME = 'hgfd';
const TEST_CLIENT_ID = 'test_client_hgfd';

// Helper to create timestamp from days offset
const daysAgo = (days: number): Timestamp =>
  Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

const daysFromNow = (days: number): Timestamp =>
  Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

// ============================================================================
// TEST DATA DEFINITIONS
// ============================================================================

interface TestOutreachConfig {
  status: OutreachStatus;
  label: string;
  daysAgoOutreach?: number;      // Days since last email
  daysUntilScreening?: number;   // Days until screening
  daysUntilRecording?: number;   // Days until recording
  hasFirstEmail?: boolean;
  hasFirstFollowup?: boolean;
  hasSecondFollowup?: boolean;
  hasPrepEmail?: boolean;
  expectedBadge: string;
}

const TEST_OUTREACH_CONFIGS: TestOutreachConfig[] = [
  // ===== IDENTIFIED (3) =====
  { status: 'identified', label: 'ID-1', expectedBadge: '🔵 To Validate' },
  { status: 'identified', label: 'ID-2', expectedBadge: '🔵 To Validate' },
  { status: 'identified', label: 'ID-3', expectedBadge: '🔵 To Validate' },

  // ===== READY FOR OUTREACH (3) =====
  { status: 'ready_for_outreach', label: 'RDY-1', expectedBadge: '🟢 Send Pitch' },
  { status: 'ready_for_outreach', label: 'RDY-2', expectedBadge: '🟢 Send Pitch' },
  { status: 'ready_for_outreach', label: 'RDY-3', expectedBadge: '🟢 Send Pitch' },

  // ===== 1ST EMAIL SENT (3 with varied dates) =====
  {
    status: '1st_email_sent',
    label: '1ST-A (2d)',
    daysAgoOutreach: 2,
    hasFirstEmail: true,
    expectedBadge: '(none - too recent)'
  },
  {
    status: '1st_email_sent',
    label: '1ST-B (5d)',
    daysAgoOutreach: 5,
    hasFirstEmail: true,
    expectedBadge: '🟠 Follow-up 1 (5 days)'
  },
  {
    status: '1st_email_sent',
    label: '1ST-C (8d)',
    daysAgoOutreach: 8,
    hasFirstEmail: true,
    expectedBadge: '🟠 Follow-up 1 (8 days)'
  },

  // ===== 1ST FOLLOWUP SENT (3 with varied dates) =====
  {
    status: '1st_followup_sent',
    label: 'FU1-A (3d)',
    daysAgoOutreach: 3,
    hasFirstEmail: true,
    hasFirstFollowup: true,
    expectedBadge: '(none - too recent)'
  },
  {
    status: '1st_followup_sent',
    label: 'FU1-B (5d)',
    daysAgoOutreach: 5,
    hasFirstEmail: true,
    hasFirstFollowup: true,
    expectedBadge: '🟠 Follow-up 2 (5 days)'
  },
  {
    status: '1st_followup_sent',
    label: 'FU1-C (10d)',
    daysAgoOutreach: 10,
    hasFirstEmail: true,
    hasFirstFollowup: true,
    expectedBadge: '🟠 Follow-up 2 (10 days)'
  },

  // ===== 2ND FOLLOWUP SENT (3 with varied dates) =====
  {
    status: '2nd_followup_sent',
    label: 'FU2-A (4d)',
    daysAgoOutreach: 4,
    hasFirstEmail: true,
    hasFirstFollowup: true,
    hasSecondFollowup: true,
    expectedBadge: '(none - not yet 7 days)'
  },
  {
    status: '2nd_followup_sent',
    label: 'FU2-B (7d)',
    daysAgoOutreach: 7,
    hasFirstEmail: true,
    hasFirstFollowup: true,
    hasSecondFollowup: true,
    expectedBadge: '🔴 No Response? (7 days)'
  },
  {
    status: '2nd_followup_sent',
    label: 'FU2-C (14d)',
    daysAgoOutreach: 14,
    hasFirstEmail: true,
    hasFirstFollowup: true,
    hasSecondFollowup: true,
    expectedBadge: '🔴 No Response? (14 days)'
  },

  // ===== IN CONTACT (3) =====
  { status: 'in_contact', label: 'CONT-1', daysAgoOutreach: 1, expectedBadge: '(none)' },
  { status: 'in_contact', label: 'CONT-2', daysAgoOutreach: 2, expectedBadge: '(none)' },
  { status: 'in_contact', label: 'CONT-3', daysAgoOutreach: 3, expectedBadge: '(none)' },

  // ===== SCHEDULING SCREENING (3) =====
  { status: 'scheduling_screening', label: 'SCHSC-1', expectedBadge: '(none)' },
  { status: 'scheduling_screening', label: 'SCHSC-2', expectedBadge: '(none)' },
  { status: 'scheduling_screening', label: 'SCHSC-3', expectedBadge: '(none)' },

  // ===== SCREENING SCHEDULED (3 with varied dates) =====
  {
    status: 'screening_scheduled',
    label: 'SCRN-A (10d)',
    daysUntilScreening: 10,
    expectedBadge: '(none - too far)'
  },
  {
    status: 'screening_scheduled',
    label: 'SCRN-B (4d)',
    daysUntilScreening: 4,
    expectedBadge: '🟣 Send Prep'
  },
  {
    status: 'screening_scheduled',
    label: 'SCRN-C (2d)',
    daysUntilScreening: 2,
    expectedBadge: '🟣 Send Prep'
  },

  // ===== SCHEDULING RECORDING (3) =====
  { status: 'scheduling_recording', label: 'SCHREC-1', expectedBadge: '(none)' },
  { status: 'scheduling_recording', label: 'SCHREC-2', expectedBadge: '(none)' },
  { status: 'scheduling_recording', label: 'SCHREC-3', expectedBadge: '(none)' },

  // ===== RECORDING SCHEDULED (3 with varied dates) =====
  {
    status: 'recording_scheduled',
    label: 'REC-A (8d)',
    daysUntilRecording: 8,
    expectedBadge: '(none - too far)'
  },
  {
    status: 'recording_scheduled',
    label: 'REC-B (3d)',
    daysUntilRecording: 3,
    expectedBadge: '🟣 Send Prep'
  },
  {
    status: 'recording_scheduled',
    label: 'REC-C (1d)',
    daysUntilRecording: 1,
    expectedBadge: '🟣 Send Prep'
  },

  // ===== RECORDED (3) =====
  { status: 'recorded', label: 'RECD-1', daysAgoOutreach: 5, expectedBadge: '(none)' },
  { status: 'recorded', label: 'RECD-2', daysAgoOutreach: 10, expectedBadge: '(none)' },
  { status: 'recorded', label: 'RECD-3', daysAgoOutreach: 15, expectedBadge: '(none)' },

  // ===== LIVE (3) =====
  { status: 'live', label: 'LIVE-1', daysAgoOutreach: 2, expectedBadge: '(none)' },
  { status: 'live', label: 'LIVE-2', daysAgoOutreach: 7, expectedBadge: '(none)' },
  { status: 'live', label: 'LIVE-3', daysAgoOutreach: 14, expectedBadge: '(none)' },

  // ===== PARKING/CLOSED STATUSES (1-2 each) =====
  { status: 'no_response', label: 'NR-1', daysAgoOutreach: 20, expectedBadge: '(none)' },
  { status: 'no_response', label: 'NR-2', daysAgoOutreach: 30, expectedBadge: '(none)' },
  { status: 'declined_by_host', label: 'DEC-1', expectedBadge: '(none)' },
  { status: 'declined_by_host', label: 'DEC-2', expectedBadge: '(none)' },
  { status: 'client_declined', label: 'CDEC-1', expectedBadge: '(none)' },
  { status: 'client_declined', label: 'CDEC-2', expectedBadge: '(none)' },
  { status: 'cancelled', label: 'CANC-1', expectedBadge: '(none)' },
  { status: 'email_bounced', label: 'BNCE-1', expectedBadge: '(none)' },
  { status: 'paid_podcast', label: 'PAID-1', expectedBadge: '(none)' },
  { status: 'backlog', label: 'BKLG-1', expectedBadge: '(none)' },
  { status: 'backlog', label: 'BKLG-2', expectedBadge: '(none)' },
  { status: 'follow_up_1_month', label: 'FU1M-1', expectedBadge: '(none)' },
  { status: 'follow_up_1_month', label: 'FU1M-2', expectedBadge: '(none)' },
  { status: 'blacklist', label: 'BL-1', expectedBadge: '(none)' },
];

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

export interface CreatedOutreach {
  id: string;
  config: TestOutreachConfig;
  podcastId: string;
  podcastName: string;
  data: Record<string, any>;
}

/**
 * Create test client if it doesn't exist
 */
export async function ensureTestClient(): Promise<string> {
  const clientsRef = collection(db, 'clients');

  // Check if client exists
  const existingQuery = query(
    clientsRef,
    where('first_name', '==', CLIENT_FIRST_NAME),
    limit(1)
  );
  const existingDocs = await getDocs(existingQuery);

  if (existingDocs.docs.length > 0) {
    const clientId = existingDocs.docs[0].id;
    console.log(`✅ Found existing client "${CLIENT_FIRST_NAME}" with ID: ${clientId}`);
    return clientId;
  }

  // Create new client
  const newClient = {
    first_name: CLIENT_FIRST_NAME,
    last_name: 'Test',
    email: 'hgfd.test@example.com',
    company: 'Test Company',
    title: 'Test Title',
    bio: 'This is a test client for Kanban visual testing.',
    linkedin_url: 'https://linkedin.com/in/test',
    topics: ['technology', 'business', 'startups'],
    active: true,
    status: 'active',
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  };

  const docRef = await addDoc(clientsRef, newClient);
  console.log(`✅ Created new client "${CLIENT_FIRST_NAME}" with ID: ${docRef.id}`);
  return docRef.id;
}

/**
 * Get random podcasts for test data
 */
export async function getRandomPodcasts(count: number): Promise<{ id: string; name: string; url?: string }[]> {
  const podcastsRef = collection(db, 'podcasts');

  // Try to get podcasts with scores first
  let podcastsQuery = query(
    podcastsRef,
    where('ai_badassery_score', '>', 0),
    limit(count)
  );

  let snapshot = await getDocs(podcastsQuery);

  // Fallback to any podcasts if none have scores
  if (snapshot.docs.length === 0) {
    podcastsQuery = query(podcastsRef, limit(count));
    snapshot = await getDocs(podcastsQuery);
  }

  console.log(`📻 Found ${snapshot.docs.length} podcasts for test data`);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().title || doc.data().name || 'Unknown Podcast',
    url: doc.data().rss_url || doc.data().website_url || ''
  }));
}

/**
 * Create a single test outreach document
 */
export async function createTestOutreach(
  clientId: string,
  podcast: { id: string; name: string; url?: string },
  config: TestOutreachConfig,
  index: number
): Promise<CreatedOutreach> {
  const now = Timestamp.now();

  // Build outreach document
  const outreachData: Record<string, any> = {
    // Relations
    client_id: clientId,
    podcast_id: podcast.id,
    podcast_itunes_id: podcast.id,

    // Display fields
    client_name: CLIENT_FIRST_NAME,
    podcast_name: podcast.name,
    podcast_url: podcast.url || `https://podcasts.apple.com/podcast/id${podcast.id}`,
    host_email: `host${index}@testpodcast.com`,

    // Status
    status: config.status,
    status_category: getStatusCategory(config.status),
    status_changed_at: now,

    // Timestamps
    created_at: now,
    updated_at: now,

    // Initialize arrays
    email_thread: [],
    notes: [],
    reminders: [],

    // Test label for easy identification
    pitch_angle: `[TEST ${config.label}] Test outreach for Kanban visual testing`,
  };

  // Add outreach_date if applicable
  if (config.daysAgoOutreach !== undefined) {
    outreachData.outreach_date = daysAgo(config.daysAgoOutreach);
    outreachData['Outreach Date'] = formatDate(new Date(Date.now() - config.daysAgoOutreach * 24 * 60 * 60 * 1000));
  }

  // Add first email data
  if (config.hasFirstEmail) {
    const firstEmailDate = config.daysAgoOutreach !== undefined
      ? daysAgo(config.daysAgoOutreach + 5) // First email was 5 days before outreach_date
      : daysAgo(10);

    outreachData.first_email_copy = `Hi [Host Name],\n\nI'm reaching out on behalf of ${CLIENT_FIRST_NAME}...\n\nBest,\nRuth`;
    outreachData.first_email_subject = `Guest Pitch: ${CLIENT_FIRST_NAME} for ${podcast.name}`;
    outreachData.first_email_sent_at = firstEmailDate;
    outreachData.first_email_sent_by = 'test_user';
  }

  // Add first followup data
  if (config.hasFirstFollowup) {
    const followup1Date = config.daysAgoOutreach !== undefined
      ? daysAgo(config.daysAgoOutreach + 2) // First followup was 2 days before outreach_date
      : daysAgo(5);

    outreachData.first_followup_copy = `Hi [Host Name],\n\nJust following up on my previous email...\n\nBest,\nRuth`;
    outreachData.first_followup_subject = `Re: Guest Pitch: ${CLIENT_FIRST_NAME} for ${podcast.name}`;
    outreachData.first_followup_sent_at = followup1Date;
    outreachData.first_followup_sent_by = 'test_user';
  }

  // Add second followup data
  if (config.hasSecondFollowup) {
    const followup2Date = config.daysAgoOutreach !== undefined
      ? daysAgo(config.daysAgoOutreach)
      : daysAgo(0);

    outreachData.second_followup_copy = `Hi [Host Name],\n\nI wanted to check in one more time...\n\nBest,\nRuth`;
    outreachData.second_followup_subject = `Re: Guest Pitch: ${CLIENT_FIRST_NAME} for ${podcast.name}`;
    outreachData.second_followup_sent_at = followup2Date;
    outreachData.second_followup_sent_by = 'test_user';
  }

  // Add screening date
  if (config.daysUntilScreening !== undefined) {
    outreachData.screening_call_date = daysFromNow(config.daysUntilScreening);
    outreachData.screening_call_notes = `Test screening in ${config.daysUntilScreening} days`;
  }

  // Add recording date
  if (config.daysUntilRecording !== undefined) {
    outreachData.recording_date = daysFromNow(config.daysUntilRecording);
    outreachData.recording_notes = `Test recording in ${config.daysUntilRecording} days`;
  }

  // Add live data for live status
  if (config.status === 'live') {
    outreachData.live_date = daysAgo(config.daysAgoOutreach || 2);
    outreachData.live_episode_url = `https://example.com/episode/${index}`;
    outreachData.live_episode_title = `Test Episode with ${CLIENT_FIRST_NAME}`;
  }

  // Add close reason for closed statuses
  if (['no_response', 'declined_by_host', 'client_declined', 'cancelled', 'email_bounced', 'paid_podcast'].includes(config.status)) {
    outreachData.close_reason = config.status;
    outreachData.close_notes = `Test close reason: ${config.status}`;
  }

  // Add parking reason for parking statuses
  if (['backlog', 'follow_up_1_month'].includes(config.status)) {
    outreachData.parking_reason = config.status;
    outreachData.parking_notes = `Test parking: ${config.status}`;
    if (config.status === 'follow_up_1_month') {
      outreachData.parking_until = daysFromNow(30);
    }
  }

  // Add blacklist data
  if (config.status === 'blacklist') {
    outreachData.blacklist = true;
    outreachData.blacklist_reason = 'other';
    outreachData.close_notes = 'Test blacklist';
  }

  // Create document
  const docRef = await addDoc(collection(db, 'outreach'), outreachData);

  console.log(`  ✅ Created outreach ${config.label} (${config.status}) -> ${docRef.id}`);

  return {
    id: docRef.id,
    config,
    podcastId: podcast.id,
    podcastName: podcast.name,
    data: outreachData
  };
}

/**
 * Main function to create all test outreach
 */
export async function createAllTestOutreach(): Promise<CreatedOutreach[]> {
  console.log('🚀 Starting test outreach creation...\n');

  // 1. Ensure client exists
  const clientId = await ensureTestClient();
  console.log('');

  // 2. Get podcasts
  const podcasts = await getRandomPodcasts(TEST_OUTREACH_CONFIGS.length);
  if (podcasts.length < TEST_OUTREACH_CONFIGS.length) {
    console.warn(`⚠️ Only found ${podcasts.length} podcasts, will reuse some`);
  }
  console.log('');

  // 3. Create outreach
  console.log(`📝 Creating ${TEST_OUTREACH_CONFIGS.length} test outreach records...\n`);

  const createdOutreach: CreatedOutreach[] = [];

  for (let i = 0; i < TEST_OUTREACH_CONFIGS.length; i++) {
    const config = TEST_OUTREACH_CONFIGS[i];
    const podcast = podcasts[i % podcasts.length]; // Reuse podcasts if needed

    const created = await createTestOutreach(clientId, podcast, config, i);
    createdOutreach.push(created);
  }

  console.log(`\n✨ Created ${createdOutreach.length} test outreach records!`);
  console.log(`\n📊 Summary by status:`);

  // Group by status
  const byStatus = createdOutreach.reduce((acc, o) => {
    acc[o.config.status] = (acc[o.config.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });

  return createdOutreach;
}

// ============================================================================
// HELPERS
// ============================================================================

function getStatusCategory(status: OutreachStatus): string {
  if (status === 'identified') return 'discovery';
  if (['recorded', 'live'].includes(status)) return 'success';
  if (['backlog', 'follow_up_1_month', 'fill_form'].includes(status)) return 'parking';
  if (['no_response', 'declined_by_host', 'client_declined', 'cancelled', 'email_bounced', 'paid_podcast', 'blacklist'].includes(status)) return 'closed';
  return 'active';
}

function formatDate(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).createTestOutreach = createAllTestOutreach;
  (window as any).TEST_OUTREACH_CONFIGS = TEST_OUTREACH_CONFIGS;
}
