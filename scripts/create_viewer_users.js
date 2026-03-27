/**
 * CREATE VIEWER USERS
 *
 * Creates the 5 viewer accounts in Firestore 'viewer_users' collection.
 * Viewers can only access the Podcasts page.
 * They will be prompted to change their password on first login.
 *
 * Usage:
 *   node scripts/create_viewer_users.js
 *
 * Default temporary password: Badassery2024!
 * Each user must change it on first login.
 */

const admin = require('firebase-admin');
const path = require('path');

// Firebase init
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-78a34974dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// ============================================================================
// VIEWER ACCOUNTS
// Temporary password — users will be forced to change it on first login
// ============================================================================
const TEMP_PASSWORD = 'Badassery2026!';

const VIEWER_USERS = [
  {
    email: 'ruth@badassery-hq.com',
    display_name: 'Ruth'
  },
  {
    email: 'marionne@badassery-hq.com',
    display_name: 'Marionne'
  },
  {
    email: 'louisebuckley@leadlagmedia.com',
    display_name: 'Louise Buckley'
  },
  {
    email: 'amanda@curateyoursoul.com',
    display_name: 'Amanda'
  },
  {
    email: 'victoria@victoriabennion.com',
    display_name: 'Victoria'
  }
];

async function createViewerUsers() {
  console.log('Creating viewer users in Firestore...\n');
  const collection = db.collection('viewer_users');

  for (const viewer of VIEWER_USERS) {
    // Check if already exists
    const existing = await collection.where('email', '==', viewer.email).get();

    if (!existing.empty) {
      console.log(`⚠️  Already exists: ${viewer.email} (skipping)`);
      continue;
    }

    const docData = {
      email: viewer.email,
      display_name: viewer.display_name,
      password: TEMP_PASSWORD,
      must_change_password: true,
      created_at: admin.firestore.Timestamp.now(),
      last_login_at: null,
      role: 'viewer',
      status: 'active'
    };

    const docRef = await collection.add(docData);
    console.log(`✅  Created: ${viewer.display_name} <${viewer.email}> (id: ${docRef.id})`);
  }

  console.log('\nDone! All viewer accounts created.');
  console.log(`\nTemporary password for all accounts: ${TEMP_PASSWORD}`);
  console.log('Users will be prompted to change it on first login.\n');
}

createViewerUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
