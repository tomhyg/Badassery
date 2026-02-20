/**
 * Migration Script: Add email_thread to existing outreach records
 *
 * This script reads existing outreach data and creates email_thread entries
 * based on the "Outreach Date" and "Outreach Status" fields from old schema.
 */

import { db } from '../services/firebase';
import { collection, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { EmailMessage, OutreachStatus } from '../types';

interface OldOutreachData {
  id: string;
  'Outreach Status'?: string;
  'Outreach Date'?: string;
  hostContactInfo?: {
    email?: string;
  };
  email_subject?: string;
  email_body?: string;
  email_thread?: EmailMessage[];
}

/**
 * Parse date string from various formats
 */
function parseOutreachDate(dateString: string): Date | null {
  if (!dateString) return null;

  try {
    // Try standard date parsing first
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
 * Determine email type from status
 */
function getEmailTypeFromStatus(status: string): '1st_email' | '1st_followup' | '2nd_followup' | null {
  const normalizedStatus = status.toLowerCase().trim();

  if (normalizedStatus.includes('1st message') || normalizedStatus.includes('1st email')) {
    return '1st_email';
  } else if (normalizedStatus.includes('1st follow')) {
    return '1st_followup';
  } else if (normalizedStatus.includes('2nd follow')) {
    return '2nd_followup';
  }

  return null;
}

/**
 * Calculate email dates based on status and base date
 */
function calculateEmailDates(baseDate: Date, emailType: '1st_email' | '1st_followup' | '2nd_followup'): {
  firstEmailDate: Date;
  dates: Date[];
} {
  const firstEmailDate = new Date(baseDate);
  const dates: Date[] = [];

  if (emailType === '1st_email') {
    // Only first email sent
    dates.push(new Date(firstEmailDate));
  } else if (emailType === '1st_followup') {
    // First email + first follow-up
    dates.push(new Date(firstEmailDate));

    const followupDate = new Date(firstEmailDate);
    followupDate.setDate(followupDate.getDate() + 5); // +5 days for 1st follow-up
    dates.push(followupDate);
  } else if (emailType === '2nd_followup') {
    // First email + both follow-ups
    dates.push(new Date(firstEmailDate));

    const firstFollowupDate = new Date(firstEmailDate);
    firstFollowupDate.setDate(firstFollowupDate.getDate() + 5);
    dates.push(firstFollowupDate);

    const secondFollowupDate = new Date(firstFollowupDate);
    secondFollowupDate.setDate(secondFollowupDate.getDate() + 3); // +3 days for 2nd follow-up
    dates.push(secondFollowupDate);
  }

  return { firstEmailDate, dates };
}

/**
 * Main migration function
 */
async function migrateOutreachEmailThreads() {
  console.log('Starting outreach email_thread migration...\n');

  try {
    const outreachCollection = collection(db, 'outreach');
    const snapshot = await getDocs(outreachCollection);

    console.log(`Found ${snapshot.docs.length} total outreach documents\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as OldOutreachData;
      const docId = docSnap.id;

      // Skip if already has email_thread
      if (data.email_thread && data.email_thread.length > 0) {
        console.log(`⏭️  Skipping ${docId} - already has email_thread`);
        skippedCount++;
        continue;
      }

      // Check if has Outreach Date and Status
      const outreachDateStr = data['Outreach Date'];
      const outreachStatus = data['Outreach Status'];

      if (!outreachDateStr || !outreachStatus) {
        console.log(`⏭️  Skipping ${docId} - missing Outreach Date or Status`);
        skippedCount++;
        continue;
      }

      // Parse date
      const outreachDate = parseOutreachDate(outreachDateStr);
      if (!outreachDate) {
        console.log(`⚠️  Skipping ${docId} - could not parse date: "${outreachDateStr}"`);
        skippedCount++;
        continue;
      }

      // Determine email type from status
      const emailType = getEmailTypeFromStatus(outreachStatus);
      if (!emailType) {
        console.log(`⏭️  Skipping ${docId} - status doesn't indicate emails sent: "${outreachStatus}"`);
        skippedCount++;
        continue;
      }

      // Calculate email dates
      const { firstEmailDate, dates } = calculateEmailDates(outreachDate, emailType);

      // Build email_thread
      const email_thread: EmailMessage[] = [];
      const emailTypes: Array<'1st_email' | '1st_followup' | '2nd_followup'> = ['1st_email', '1st_followup', '2nd_followup'];

      for (let i = 0; i < dates.length; i++) {
        const emailDate = dates[i];
        const type = emailTypes[i];

        email_thread.push({
          id: `migrated_${type}_${docId}`,
          direction: 'outbound',
          type: type,
          from: 'ruth@badassery.co',
          to: data.hostContactInfo?.email || 'unknown@unknown.com',
          subject: data.email_subject || `Podcast Guest Opportunity${type !== '1st_email' ? ' - Follow Up' : ''}`,
          body: data.email_body || '[Email body not available in migration]',
          sent_at: Timestamp.fromDate(emailDate),
          generated_by_ai: false,
        });
      }

      // Calculate email stats
      const email_stats = {
        total_sent: email_thread.length,
        total_received: 0,
        last_outbound_at: email_thread[email_thread.length - 1].sent_at,
        awaiting_reply: true,
        awaiting_reply_since: email_thread[email_thread.length - 1].sent_at,
      };

      // Update document
      try {
        const docRef = doc(db, 'outreach', docId);
        await updateDoc(docRef, {
          email_thread,
          email_stats,
          updated_at: Timestamp.now(),
        });

        console.log(`✅ Migrated ${docId}`);
        console.log(`   Status: "${outreachStatus}" → Created ${email_thread.length} email(s)`);
        console.log(`   First email date: ${firstEmailDate.toLocaleDateString()}`);
        if (email_thread.length > 1) {
          console.log(`   Last email date: ${dates[dates.length - 1].toLocaleDateString()}`);
        }
        console.log('');

        migratedCount++;
      } catch (updateError) {
        console.error(`❌ Error updating ${docId}:`, updateError);
        errorCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${migratedCount}`);
    console.log(`⏭️  Skipped (already migrated or no data): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total processed: ${snapshot.docs.length}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Fatal error during migration:', error);
    throw error;
  }
}

// Run migration
migrateOutreachEmailThreads()
  .then(() => {
    console.log('\n✨ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  });
