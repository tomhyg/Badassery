// AI Configuration Service - Stores settings in localStorage

export interface AIConfig {
  geminiApiKey: string;
  geminiModel: 'gemini-2.5-flash-lite' | 'gemini-1.5-pro' | 'gemini-2.5-flash-lite';
  prompts: {
    bioEnhancement: string;
    pitchEmail: string;
    prepEmail: string;
    followUpEmail: string;
  };
}

const DEFAULT_CONFIG: AIConfig = {
  geminiApiKey: 'AIzaSyCIojDiN-uo1-Pxn37l5gML92gyp4Sd1eI',
  geminiModel: 'gemini-2.5-flash-lite',
  prompts: {
    bioEnhancement: `You are an expert bio writer who specializes in creating compelling, storytelling-driven professional bios for thought leaders, entrepreneurs, and changemakers.

Your task: Transform the ORIGINAL BIO below into a more engaging, narrative-driven bio that sells the person's expertise and impact while staying authentic to their voice.

CONTEXT ABOUT THE PERSON:
{context}

ORIGINAL BIO:
{bioOriginal}

GUIDELINES FOR THE ENHANCED BIO:
1. **Lead with impact, not credentials** - Start with what they're disrupting, building, or transforming
2. **Use storytelling arc** - Show their journey from where they started to where they are now
3. **Make it conversational yet authoritative** - Write like they're telling their own story at a dinner party
4. **Include specific details** - Use real examples, numbers, and concrete achievements when available
5. **Show personality** - Let their passion, values, and unique approach shine through
6. **End with a call to presence** - What are they doing NOW and what's their mission moving forward
7. **Length**: 3-4 paragraphs (250-350 words max)
8. **Tone**: Confident, warm, human, slightly punchy - avoid corporate jargon
9. **Structure**:
   - Para 1: Who they are NOW + their unique angle/disruption
   - Para 2: Their journey/background (the "how they got here" story)
   - Para 3: Key achievements, credentials, recognition
   - Para 4: Current mission, what drives them, personal touch

Now write the ENHANCED BIO (return ONLY the bio text, no preamble or explanation):`,

    pitchEmail: `I'll provide you with a podcast for which I want you to write an email pitching the client as a guest on the show. Align the pitch email to what the podcast is about and why he or she would be a fit for the show.

Make the email sound Persuasive & Action-Oriented

Start the email with Hi [Host Name],

I'm reaching out to recommend [Client First Name] [Client Last Name], [Job Title] at [Company], as a guest for your podcast.

Use the client's Badassery bio as reference on what he or she can speak to on the show and the value he or she will provide to the show's audience.

PODCAST INFORMATION:
{podcastInfo}

CLIENT INFORMATION:
{clientInfo}

Write the pitch email:`,

    prepEmail: `The purpose of this email is to prepare podcast clients for their podcast recordings. Please use the information provided to fill in the template below.

INPUTS:
- Apple podcast link: {podcastLink}
- Client's Badassery page: {clientPage}
- Recording date and time: {recordingDateTime}
- Podcast details: {podcastDetails}
- Host details: {hostDetails}

**Subject Line**: Your Podcast Prep for "[Podcast Name]"

Hi [Client First Name],

We want to make sure you feel prepped and ready-to-go before your recording! We know doing the research can take some time, so we've put everything together for you to make it easier 😉

**Your Recording Date**: [Date and Time, including timezone if have it. If they don't have the time, then just the date works]

**About the Podcast**

- **Link**: [Apple podcast link - make sure link is /us not another country]
- **Start Date**: [Year]
- **Episode Count**: [Number of Episodes]
- **Consistency**: [Frequency of Episodes]
- **Reviews**: [Rating and Review Count]

**About the Host(s)**

- **Podcast Host**: [Host Name]
- **Location**: [City, Region]
- **Bio**: [Brief Professional Summary]

**Social Links**:

- Website(s): [Links]
- LinkedIn: [Link]
- Instagram: [Link]
- X: [Link]

**Additional Notes**

[Add any details about the host, their background, or why the podcast is a great fit for the client. Highlight connections between the podcast theme and client's expertise.]

**Prep for the Recording**

Here are 3 episodes to check out for inspiration [these should align with the client's line of work or speaking topics]:

1. [Episode Title + Brief Description - A podcast episode with guest so that they understand the interview style. Include Apple podcast hyperlink to the episode.]
2. [Episode Title + Brief Description - A podcast episode with guest so that they understand the interview style. Include Apple podcast hyperlink to the episode.]
3. [Episode Title + Brief Description - A podcast episode with guest so that they understand the interview style. Include Apple podcast hyperlink to the episode.]

If there's anything you need help with while prepping for the conversation, please let me know! I hope you have a great conversation with [Host First Name].

[AGENT NAME]`,

    followUpEmail: `Write a follow up email using this template but ensure it aligns to the original email sent.

ORIGINAL EMAIL:
{originalEmail}

TEMPLATE:

Hi [Host's First Name],

Just wanted to follow up to see if you're currently looking for new podcast guests.

[Client First Name] [Client Last Name's] expertise, on [brief highlight of key achievements or background], offers a unique perspective on [key themes such as creativity, leadership, mindset, entrepreneurship, etc.].

Happy to coordinate next steps or share more information if this sounds like a fit.

Warm regards,
Ruth Kimani`
  }
};

const STORAGE_KEY = 'badassery_ai_config';

export function getAIConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      // Merge with defaults to ensure all fields exist
      return {
        ...DEFAULT_CONFIG,
        ...config,
        prompts: {
          ...DEFAULT_CONFIG.prompts,
          ...config.prompts
        }
      };
    }
  } catch (error) {
    console.error('Error loading AI config:', error);
  }
  return DEFAULT_CONFIG;
}

export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error saving AI config:', error);
    throw error;
  }
}

export function resetAIConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error resetting AI config:', error);
  }
}
