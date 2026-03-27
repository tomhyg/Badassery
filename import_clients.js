/**
 * Import CSV -> Firestore (clients)
 * 
 * Script complet pour importer les 66 colonnes du CSV Badassery
 *
 * Prérequis:
 * - npm install firebase-admin csv-parser
 * - serviceAccountKey.json dans le même dossier
 * - le CSV "Danielle's Client List-Grid view.csv" dans le même dossier
 * 
 * Usage:
 * node import-clients-firestore.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

// ============================================================================
// 1) CONFIGURATION
// ============================================================================

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const CLIENTS_COLLECTION = 'clients';
const CSV_FILE = "Danielle's Client List-Grid view.csv";

// ============================================================================
// 2) HELPER FUNCTIONS
// ============================================================================

/**
 * Nettoie et retourne la première valeur non vide parmi les clés
 */
const pickFirst = (row, ...keys) => {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
};

/**
 * Parse une string en array (split par virgule, point-virgule, ou newline)
 */
const splitArray = (str) => {
  if (!str) return [];
  return String(str)
    .split(/[;\n]|,(?![^(]*\))/) // virgule (sauf dans parenthèses), point-virgule, newline
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * Parse une date UTC au format "2025-11-12 09:48" -> Firestore Timestamp
 */
const parseUtcDate = (s) => {
  if (!s) return null;
  const trimmed = String(s).trim();
  // Format: "2025-11-12 09:48" -> "2025-11-12T09:48:00Z"
  const iso = trimmed.replace(' ', 'T') + ':00Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : admin.firestore.Timestamp.fromDate(d);
};

/**
 * Parse un booléen (checked/unchecked, yes/no, etc.)
 */
const parseBool = (s) => {
  if (!s) return null;
  const lower = String(s).toLowerCase().trim();
  if (['checked', 'yes', 'true', '1', 'oui'].includes(lower)) return true;
  if (['unchecked', 'no', 'false', '0', 'non'].includes(lower)) return false;
  return null;
};

// ============================================================================
// 3) MAPPING CSV -> FIRESTORE DOCUMENT
// ============================================================================

/**
 * Transforme une ligne CSV en document Firestore structuré
 */
function mapRowToDocument(row) {
  const email = pickFirst(row, 'Your email').toLowerCase();
  
  // Skip si pas d'email
  if (!email) {
    return null;
  }

  return {
    // =========================================================================
    // IDENTITY & CONTACT
    // =========================================================================
    identity: {
      rowNumber: pickFirst(row, '#'),
      firstName: pickFirst(row, 'Your first name'),
      lastName: pickFirst(row, 'Your last name'),
      email: email,
      phone: pickFirst(row, 'Your phone number'),
      jobTitle: pickFirst(row, 'Your job title'),
      company: pickFirst(row, 'Your company'),
      companySize: pickFirst(row, 'How big is your company?'),
      representationType: pickFirst(row, 'Do you represent an external company, or is this work just about you and/ or your business?'),
    },

    // =========================================================================
    // PROFESSIONAL GOALS & VISION
    // =========================================================================
    goals: {
      professionalGoals: pickFirst(row, 'What are your professional goals for the next 1-3 years? Beyond that?'),
      workDescription: pickFirst(row, 'If you had to describe your work in one sentence, what would it be?'),
      missionDescription: pickFirst(row, 'If you had to describe your mission in one sentence, what would it be?'),
      whyNow: pickFirst(row, "Why now? What's driving you to show up publicly right _now_?"),
      top3Goals: pickFirst(row, 'What are your top 3 goals for this experience?'),
      challenges: pickFirst(row, 'What challenges or obstacles have you faced in developing your personal brand?'),
      successDefinition: pickFirst(row, 'What would "success" look like in 3 months working with Badassery? And in 12 months?'),
    },

    // =========================================================================
    // LINKS & ONLINE PRESENCE
    // =========================================================================
    links: {
      linkedinAndSocial: pickFirst(row, 'Please include any links that will help us know you better: your LinkedIn / professional social media pages, website, etc.'),
      pastBrandingWork: pickFirst(row, "Please include links to any personal branding work you've done in the past, if relevant."),
      headshot: pickFirst(row, 'Link to your headshot:'),
      schedulingLink: pickFirst(row, 'Your scheduling link'),
      pastPodcasts: pickFirst(row, "Please include any links to podcasts you've guested on in the past. We'll make sure they're not on our outreach list."),
      toneVoiceContent: pickFirst(row, 'Do you have any content we can use to learn your tone/voice?'),
      audioVideoPrompt: pickFirst(row, 'Please record a 3-5 minute audio or video with this prompt and include the link here: _Tell us about a moment in your life or work where you felt most alive—like you were fully in your purpose, fully yourself._'),
    },

    // =========================================================================
    // CURRENT BRAND STATUS
    // =========================================================================
    currentStatus: {
      pastBrandingWork: pickFirst(row, 'How much personal brand strategy work have you done in the past?'),
      onlinePresenceRating: pickFirst(row, 'How would you rate your current online presence?'),
      platformsUsed: splitArray(pickFirst(row, 'Which platforms do you currently use to promote your personal brand?')),
      contentFrequency: pickFirst(row, 'How frequently do you update or post content related to your personal brand?'),
      channelReach: pickFirst(row, "Include your reach for each of your channels, if applicable. This might include active professional social media accounts, newsletter, your own podcast, etc. List these out individually / by platform."),
    },

    // =========================================================================
    // SELF-ASSESSMENT (Likert scale responses)
    // =========================================================================
    selfAssessment: {
      clarity: pickFirst(row, 'I feel clear about my personal brand and messaging'),
      confidence: pickFirst(row, 'I feel confident articulating my expertise and value'),
      promotionComfort: pickFirst(row, 'I feel comfortable promoting myself and my expertise'),
      presenceStrength: pickFirst(row, 'I feel like my online presence is strong'),
      inboundSatisfaction: pickFirst(row, "I'm satisfied with my inbound opportunities (clients, speaking, collaborators)"),
      industryRecognition: pickFirst(row, 'I feel recognized and respected in my industry.'),
    },

    // =========================================================================
    // VOICE & BRAND PERSONALITY
    // =========================================================================
    brandPersonality: {
      threeAdjectives: pickFirst(row, 'What are 3 adjectives that describe how you want to come across in the world?'),
      audienceFeeling: pickFirst(row, 'How do you want people to feel when they hear you speak?'),
      keyPhrases: pickFirst(row, 'Are there any phrases, values, or messages you come back to often?'),
      commonMisunderstandings: pickFirst(row, "What's something people misunderstand about your work or industry?"),
      passionTopics: pickFirst(row, 'What topics light you up or make you rant?'),
      phrasesToAvoid: pickFirst(row, 'Are there any phrases, words, or tones we should avoid using for you?'),
      admiredBrands: pickFirst(row, 'Are there any individuals or companies whose voice and brand you admire? Why?'),
    },

    // =========================================================================
    // BIOS & SPEAKING TOPICS
    // =========================================================================
    content: {
      bioOriginal: pickFirst(row, 'Bio - Original'),
      bioUpdated: pickFirst(row, 'Updated Bio (Badassery Version)'),
      speakingTopicsOriginal: pickFirst(row, 'Speaking Topics - Originals'),
      speakingTopicsUpdated: pickFirst(row, 'Speaking Topics - Updated (Badassery Version)'),
      // Pour faciliter les recherches, on garde aussi les topics en array
      speakingTopicsArray: splitArray(pickFirst(row, 'Speaking Topics - Updated (Badassery Version)', 'Speaking Topics - Originals')),
    },

    // =========================================================================
    // PODCAST STRATEGY
    // =========================================================================
    podcast: {
      audienceDescription: pickFirst(row, 'Please describe your audience, including demographics, interests and preferences. Who do you want to reach?'),
      productsServices: pickFirst(row, "What products and services would you like to share with the podcast's audience? Please share links if applicable."),
      dreamPodcasts: pickFirst(row, "Do you have any dream podcasts you'd like to be a guest on?"),
      targetLocation: pickFirst(row, 'What location would you like to target for the podcast / audience?'),
      openToInPerson: parseBool(pickFirst(row, 'Are you open to in-person podcast recordings?')),
      keyQuestions: pickFirst(row, 'What are some key questions the host can ask you during the show?'),
      unaskedQuestion: pickFirst(row, "What's a question that NO ONE ASKS YOU that you wish they would?"),
      listenerTakeaways: pickFirst(row, 'What are 3 things listeners will walk away with/take action on after hearing your episode?'),
      upcomingLaunches: pickFirst(row, "Are there any new launches or projects that you'd like to promote in the coming months? Please include loose dates where relevant."),
    },

    // =========================================================================
    // WORKING PREFERENCES
    // =========================================================================
    preferences: {
      feedbackStyle: pickFirst(row, 'How do you prefer to receive feedback and guidance?'),
      monthlyTimeCommitment: pickFirst(row, 'How much time do you want to dedicate to this monthly?'),
      interestedInCommunity: parseBool(pickFirst(row, 'Are you interested in being added to a community with other Badassery clients?')),
      openToLinkedInPost: parseBool(pickFirst(row, 'Are you open to us posting about your involvement with Badassery on LinkedIn?')),
      legalGuidelines: pickFirst(row, "Anything we should know about executive approvals, legal guidelines, or things we can't say?"),
      additionalNotes: pickFirst(row, "Is there anything else you'd like to share with us before we say _au revoir_, {{field:0deae712-7a1a-4dd2-9487-7ccbcdeaa3d5}}?"),
    },

    // =========================================================================
    // METADATA & STATUS
    // =========================================================================
    metadata: {
      startDateUtc: parseUtcDate(pickFirst(row, 'Start Date (UTC)')),
      submitDateUtc: parseUtcDate(pickFirst(row, 'Submit Date (UTC)')),
      clientStatus: pickFirst(row, 'Client Status (Active / Inactive)'),
      tags: splitArray(pickFirst(row, "Tags (Danielle's Suggestions)")),
      apiCategory1: pickFirst(row, 'API_Category_1'),
      apiCategoryList: splitArray(pickFirst(row, 'API_Category_List')),
    },

    // =========================================================================
    // SYSTEM FIELDS
    // =========================================================================
    importedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'CSV Import',

    // =========================================================================
    // RAW DATA (backup complet)
    // =========================================================================
    raw: row,
  };
}

// ============================================================================
// 4) IMPORT FUNCTION
// ============================================================================

async function importCsv() {
  const results = [];

  console.log('🚀 Démarrage de l\'importation...\n');
  console.log(`📁 Fichier: ${CSV_FILE}`);
  console.log(`📂 Collection: ${CLIENTS_COLLECTION}\n`);

  // Vérifier que le fichier existe
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ Fichier non trouvé: ${CSV_FILE}`);
    console.log('\n💡 Assurez-vous que le fichier CSV est dans le même dossier que ce script.');
    process.exit(1);
  }

  fs.createReadStream(CSV_FILE)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      console.log(`📊 ${results.length} lignes trouvées dans le CSV.\n`);

      let successCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const row of results) {
        const clientData = mapRowToDocument(row);

        if (!clientData) {
          // Pas d'email -> skip
          const lastName = pickFirst(row, 'Your last name');
          const firstName = pickFirst(row, 'Your first name');
          console.warn(`⚠️  Ligne sans email ignorée: ${firstName} ${lastName}`);
          skippedCount++;
          continue;
        }

        try {
          // Vérifier si un client avec cet email existe déjà
          const existingClient = await db
            .collection(CLIENTS_COLLECTION)
            .where('identity.email', '==', clientData.identity.email)
            .limit(1)
            .get();

          let docId;
          
          if (!existingClient.empty) {
            // Client existe -> update
            docId = existingClient.docs[0].id;
            await db.collection(CLIENTS_COLLECTION).doc(docId).update({
              ...clientData,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`🔄 [${successCount + 1}] UPDATED: ${clientData.identity.firstName} ${clientData.identity.lastName} (${docId})`);
          } else {
            // Nouveau client -> create avec ID auto
            const docRef = await db.collection(CLIENTS_COLLECTION).add(clientData);
            docId = docRef.id;
            console.log(`✅ [${successCount + 1}] CREATED: ${clientData.identity.firstName} ${clientData.identity.lastName} (${docId})`);
          }

          successCount++;
          
        } catch (error) {
          console.error(`❌ Erreur pour ${clientData.identity.email}:`, error.message);
          errorCount++;
        }
      }

      console.log('\n' + '='.repeat(50));
      console.log('📈 RÉSUMÉ DE L\'IMPORTATION');
      console.log('='.repeat(50));
      console.log(`✅ Succès:        ${successCount}`);
      console.log(`⚠️  Ignorés:       ${skippedCount}`);
      console.log(`❌ Erreurs:       ${errorCount}`);
      console.log(`📊 Total traité:  ${results.length}`);
      console.log('='.repeat(50));
      
      if (successCount > 0) {
        console.log('\n🎉 Importation terminée avec succès!');
      }
      
      process.exit(errorCount > 0 ? 1 : 0);
    })
    .on('error', (err) => {
      console.error('❌ Erreur lecture CSV:', err);
      process.exit(1);
    });
}

// ============================================================================
// 5) RUN
// ============================================================================

importCsv();