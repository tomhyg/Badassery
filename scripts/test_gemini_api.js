/**
 * Test Gemini API - Diagnostic
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBDRKIQEEDiEkX0GkOYSSZkuesG-QIsyr4';

console.log('='.repeat(80));
console.log('   🔍 GEMINI API DIAGNOSTIC');
console.log('='.repeat(80));
console.log('');

async function testAPI() {
  try {
    console.log('📋 API Key:', apiKey.substring(0, 10) + '...');
    console.log('🔧 Model: gemini-2.0-flash-exp');
    console.log('');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    console.log('🧪 Test 1: Simple request...');
    const startTime = Date.now();

    const result = await model.generateContent('Say "API is working" if you can hear me.');
    const response = await result.response;
    const text = response.text();

    const elapsed = Date.now() - startTime;

    console.log(`✅ Response received in ${elapsed}ms`);
    console.log(`📝 Response: ${text.substring(0, 100)}`);
    console.log('');

    console.log('🧪 Test 2: Testing 5 parallel requests...');
    const startTime2 = Date.now();

    const promises = Array(5).fill(null).map(async (_, i) => {
      try {
        const result = await model.generateContent(`Request ${i + 1}: Say "OK"`);
        const response = await result.response;
        return { success: true, index: i + 1, text: response.text() };
      } catch (error) {
        return { success: false, index: i + 1, error: error.message };
      }
    });

    const results = await Promise.all(promises);
    const elapsed2 = Date.now() - startTime2;

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Completed in ${elapsed2}ms`);
    console.log(`   Success: ${successful}/5`);
    console.log(`   Failed: ${failed}/5`);
    console.log('');

    if (failed > 0) {
      console.log('❌ Failed requests:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   Request ${r.index}: ${r.error}`);
      });
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('');

    if (failed === 0) {
      console.log('✅ GEMINI API IS WORKING PERFECTLY!');
      console.log('');
      console.log('The issue might be:');
      console.log('  • Rate limit hit (too many requests too fast)');
      console.log('  • Temporary API slowdown');
      console.log('  • Network issues');
      console.log('');
      console.log('🎯 Solutions:');
      console.log('  1. Try again in 1-2 minutes (rate limit reset)');
      console.log('  2. Use --config=conservative (slower, 10 parallel)');
      console.log('  3. Check quota at: https://aistudio.google.com/');
    } else {
      console.log('⚠️  GEMINI API HAS ISSUES!');
      console.log('');
      console.log('🔧 Possible causes:');
      console.log('  • Invalid API key');
      console.log('  • Quota exceeded (check console)');
      console.log('  • API service down');
      console.log('');
      console.log('🎯 Next steps:');
      console.log('  1. Check API key at: https://aistudio.google.com/app/apikey');
      console.log('  2. Check quota/billing');
      console.log('  3. Try a different API key');
    }

    console.log('');
    console.log('='.repeat(80));

  } catch (error) {
    console.log('');
    console.log('❌ ERROR:', error.message);
    console.log('');

    if (error.message.includes('API_KEY_INVALID')) {
      console.log('🔑 API Key is invalid!');
      console.log('   Get a new one at: https://aistudio.google.com/app/apikey');
    } else if (error.message.includes('quota')) {
      console.log('💰 Quota exceeded!');
      console.log('   Check your usage at: https://aistudio.google.com/');
    } else if (error.message.includes('RESOURCE_EXHAUSTED')) {
      console.log('⏱️  Rate limit exceeded!');
      console.log('   Wait 1-2 minutes and try again');
      console.log('   Or use --config=conservative (slower)');
    } else {
      console.log('🌐 Network or API issue');
      console.log('   Check your internet connection');
      console.log('   Try again in a few minutes');
    }

    console.log('');
    console.log('Full error:');
    console.error(error);
  }

  process.exit(0);
}

testAPI();
