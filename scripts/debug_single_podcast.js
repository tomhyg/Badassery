/**
 * Debug - Test scoring on a SINGLE podcast
 * Shows exact error messages
 */

const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyBDRKIQEEDiEkX0GkOYSSZkuesG-QIsyr4');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

const BADASSERY_NICHES = [
  'Female Founders & Women in Business',
  'Tech Leadership & Engineering',
  'Startup Founders & Entrepreneurs',
  'Executive Coaches & Leadership Consultants',
  'Wellness Coaches & Health Experts',
  'General Business & Lifestyle'
];

async function testSinglePodcast() {
  console.log('='.repeat(80));
  console.log('   🐛 DEBUG - Single Podcast Scoring');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Fetch ONE podcast
    console.log('📂 Fetching one podcast...');
    const snapshot = await db.collection('podcasts')
      .orderBy('updatedAt', 'desc')
      .limit(5)
      .get();

    const podcasts = snapshot.docs
      .map(doc => ({ ...doc.data(), itunesId: doc.id }))
      .filter(p => !p.ai_badassery_score);

    if (podcasts.length === 0) {
      console.log('❌ No podcasts found without scores!');
      process.exit(1);
    }

    const podcast = podcasts[0];

    console.log('✅ Found podcast:');
    console.log(`   Title: ${podcast.title || 'N/A'}`);
    console.log(`   iTunes ID: ${podcast.itunesId}`);
    console.log(`   Episodes: ${podcast.episodeCount || 0}`);
    console.log(`   Description length: ${(podcast.description || '').length} chars`);
    console.log('');

    // Build Gemini prompt
    console.log('🤖 Building Gemini prompt...');

    const prompt = `You are a podcast categorization expert for "Badassery PR".

Analyze this podcast and categorize it into ONE of these niches:
${BADASSERY_NICHES.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Podcast data:
- Title: ${podcast.title || 'N/A'}
- Description: ${(podcast.description || '').substring(0, 500)}
- Genres: ${(podcast.genres || []).join(', ')}
- Episodes: ${podcast.episodeCount || 0}

Return ONLY valid JSON (no markdown):
{
  "niche": "exact niche name from list",
  "topics": ["topic1", "topic2"],
  "business_relevance": 5,
  "guest_friendly": true,
  "summary": "Brief summary"
}`;

    console.log('✅ Prompt built');
    console.log(`   Prompt length: ${prompt.length} chars`);
    console.log('');

    // Send to Gemini
    console.log('📤 Sending to Gemini API...');
    console.log('   (This may take 2-5 seconds)');
    console.log('');

    const startTime = Date.now();

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      const elapsed = Date.now() - startTime;

      console.log(`✅ Response received in ${elapsed}ms`);
      console.log('');
      console.log('📝 Raw response:');
      console.log('─'.repeat(80));
      console.log(text.substring(0, 500));
      if (text.length > 500) console.log('...(truncated)');
      console.log('─'.repeat(80));
      console.log('');

      // Try to parse JSON
      console.log('🔍 Parsing JSON...');

      // Clean
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

      const jsonStart = text.indexOf('{');
      if (jsonStart >= 0) {
        text = text.substring(jsonStart);
      }

      const jsonEnd = text.lastIndexOf('}');
      if (jsonEnd >= 0) {
        text = text.substring(0, jsonEnd + 1);
      }

      const parsed = JSON.parse(text);

      console.log('✅ JSON parsed successfully!');
      console.log('');
      console.log('📊 Extracted data:');
      console.log(`   Niche: ${parsed.niche}`);
      console.log(`   Topics: ${(parsed.topics || []).join(', ')}`);
      console.log(`   Business Relevance: ${parsed.business_relevance}/10`);
      console.log(`   Guest Friendly: ${parsed.guest_friendly}`);
      console.log('');

      console.log('='.repeat(80));
      console.log('✅ SUCCESS! The script should work.');
      console.log('');
      console.log('The issue might be:');
      console.log('  • Rate limit when processing many at once');
      console.log('  • Network timeout on some requests');
      console.log('');
      console.log('💡 Solutions:');
      console.log('  1. Use --config=conservative (10 parallel instead of 20)');
      console.log('  2. Add delays between batches');
      console.log('  3. Increase timeout');
      console.log('='.repeat(80));

    } catch (geminiError) {
      console.log('');
      console.log('❌ GEMINI API ERROR:');
      console.log('─'.repeat(80));
      console.log(geminiError.message);
      console.log('─'.repeat(80));
      console.log('');

      if (geminiError.message.includes('RESOURCE_EXHAUSTED')) {
        console.log('⏱️  Rate limit exceeded!');
        console.log('');
        console.log('Your API key has hit the rate limit.');
        console.log('');
        console.log('Solutions:');
        console.log('  1. Wait 1-2 minutes');
        console.log('  2. Use --config=conservative (slower)');
        console.log('  3. Check if you need paid tier');
      } else if (geminiError.message.includes('quota')) {
        console.log('💰 Quota exceeded!');
        console.log('');
        console.log('Check your quota at: https://aistudio.google.com/');
      } else if (geminiError.message.includes('safety')) {
        console.log('🛡️ Content blocked by safety filters!');
        console.log('');
        console.log('The podcast description may contain flagged content.');
      } else {
        console.log('🌐 Unknown Gemini error');
        console.log('');
        console.log('Full error:');
        console.error(geminiError);
      }
    }

  } catch (error) {
    console.log('');
    console.log('❌ SCRIPT ERROR:');
    console.error(error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testSinglePodcast();
