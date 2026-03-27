import { getAIConfig } from './settingsService';
import { PodcastDocument } from './podcastService';
import { Client, getClientDisplayData } from '../types';

/**
 * ============================================================================
 * PITCH SERVICE - AI-Powered Pitch Generation
 * ============================================================================
 *
 * Uses Gemini AI to generate personalized podcast pitch emails
 */

export interface PitchGenerationResult {
  success: boolean;
  pitch: string;
  error?: string;
  model_used?: string;
  tokens_used?: number;
}

/**
 * Generate a pitch email using Gemini AI
 */
export async function generatePitch(
  podcast: PodcastDocument,
  client: Client
): Promise<PitchGenerationResult> {
  try {
    // Get AI config with prompt template
    const aiConfig = await getAIConfig();

    // Get client display data
    const clientData = getClientDisplayData(client);

    // Build the prompt by replacing placeholders
    let prompt = aiConfig.pitch_prompt_template;

    // Replace podcast placeholders
    prompt = prompt.replace('{podcast_name}', podcast.title || 'Unknown Podcast');
    prompt = prompt.replace('{podcast_host}', podcast.rss_owner_name || 'Unknown Host');
    prompt = prompt.replace('{podcast_description}', podcast.ai_summary || podcast.description || 'No description available');
    prompt = prompt.replace('{podcast_topics}', (podcast.ai_topics || []).join(', ') || 'General');
    prompt = prompt.replace('{podcast_category}', podcast.ai_primary_category || 'General');
    prompt = prompt.replace('{podcast_audience}', podcast.ai_target_audience || 'General audience');

    // Replace client placeholders
    prompt = prompt.replace('{client_name}', clientData.contact_name);
    prompt = prompt.replace('{client_title}', clientData.spokesperson.title || client.identity?.jobTitle || '');
    prompt = prompt.replace('{client_company}', clientData.company_name);
    prompt = prompt.replace('{client_bio}', clientData.spokesperson.bio || client.content?.bioUpdated || client.content?.bioOriginal || '');
    prompt = prompt.replace('{client_speaking_topics}', (clientData.spokesperson.topics || client.content?.speakingTopicsArray || []).join(', ') || '');
    prompt = prompt.replace('{client_unique_angles}', (client.spokesperson?.unique_angles || []).join(', ') || client.brandPersonality?.passionTopics || '');
    prompt = prompt.replace('{client_goals}', client.goals?.professionalGoals || client.goals?.top3Goals || '');

    console.log('[PitchService] Generating pitch with Gemini AI...');
    console.log('[PitchService] Podcast:', podcast.title);
    console.log('[PitchService] Client:', clientData.contact_name);

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.pitch_model}:generateContent?key=${aiConfig.api_keys.gemini}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: aiConfig.pitch_settings.temperature,
            maxOutputTokens: aiConfig.pitch_settings.max_tokens,
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[PitchService] Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    // Extract the generated text
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('No text generated from Gemini API');
    }

    console.log('[PitchService] Pitch generated successfully!');

    return {
      success: true,
      pitch: generatedText.trim(),
      model_used: aiConfig.pitch_model,
      tokens_used: data.usageMetadata?.totalTokenCount
    };

  } catch (error: any) {
    console.error('[PitchService] Error generating pitch:', error);
    return {
      success: false,
      pitch: '',
      error: error.message || 'Unknown error generating pitch'
    };
  }
}

/**
 * Generate a follow-up email
 */
export async function generateFollowUp(
  podcast: PodcastDocument,
  client: Client,
  originalPitch: string,
  followUpNumber: 1 | 2
): Promise<PitchGenerationResult> {
  try {
    const aiConfig = await getAIConfig();
    const clientData = getClientDisplayData(client);

    const prompt = `You are an expert at writing follow-up emails for podcast bookings.

=== CONTEXT ===
We previously sent this pitch to the podcast "${podcast.title}":

${originalPitch}

=== INSTRUCTIONS ===
Write a ${followUpNumber === 1 ? 'first' : 'second'} follow-up email:
- Keep it short (50-100 words)
- Reference the original pitch briefly
- ${followUpNumber === 1 ? 'Add one new angle or talking point' : 'Create urgency but stay professional'}
- End with a simple question to encourage a response
- Sign off with: "Best,\\nRuth\\nBadassery"

Client name: ${clientData.contact_name}
Client title: ${clientData.spokesperson.title}

Write the follow-up email now:`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.pitch_model}:generateContent?key=${aiConfig.api_keys.gemini}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 300,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('No text generated');
    }

    return {
      success: true,
      pitch: generatedText.trim(),
      model_used: aiConfig.pitch_model
    };

  } catch (error: any) {
    console.error('[PitchService] Error generating follow-up:', error);
    return {
      success: false,
      pitch: '',
      error: error.message
    };
  }
}

/**
 * Generate email subject line
 */
export async function generateSubjectLine(
  podcast: PodcastDocument,
  client: Client
): Promise<string> {
  try {
    const aiConfig = await getAIConfig();
    const clientData = getClientDisplayData(client);

    const prompt = `Generate ONE short, compelling email subject line for a podcast guest pitch.

Podcast: ${podcast.title}
Guest: ${clientData.contact_name}, ${clientData.spokesperson.title}
Topics: ${(clientData.spokesperson.topics || []).slice(0, 3).join(', ')}

Rules:
- Under 50 characters
- No clickbait
- Be specific to the podcast
- Create curiosity

Return ONLY the subject line, nothing else:`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiConfig.api_keys.gemini}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 50,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const subject = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    return subject || `Guest Pitch: ${clientData.contact_name} for ${podcast.title}`;

  } catch (error) {
    console.error('[PitchService] Error generating subject:', error);
    const clientData = getClientDisplayData(client);
    return `Guest Pitch: ${clientData.contact_name} for ${podcast.title}`;
  }
}
