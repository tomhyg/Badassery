import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * ============================================================================
 * SETTINGS SERVICE
 * ============================================================================
 *
 * Configuration globale stockée dans Firestore collection 'settings'
 */

// ============================================================================
// EMAIL CONFIGURATION
// ============================================================================

export interface EmailConfig {
  provider: 'smtp' | 'gmail';

  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    // password stocké dans Secret Manager, pas ici
  };

  senders: Array<{
    email: string;
    name: string;
  }>;

  default_signature: string;

  follow_up_delays: {
    first_followup_days: number;
    second_followup_days: number;
    close_after_days: number;
  };
}

const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  provider: 'gmail',
  senders: [
    { email: 'ruth@badassery.co', name: 'Ruth - Badassery' }
  ],
  default_signature: 'Best,\n{sender_name}\nBadassery\nwww.badassery.co',
  follow_up_delays: {
    first_followup_days: 5,
    second_followup_days: 3,
    close_after_days: 5
  }
};

export async function getEmailConfig(): Promise<EmailConfig> {
  try {
    const docRef = doc(db, 'settings', 'email_config');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as EmailConfig;
    }

    // Create default if doesn't exist
    await setDoc(docRef, DEFAULT_EMAIL_CONFIG);
    return DEFAULT_EMAIL_CONFIG;
  } catch (error) {
    console.error('Error getting email config:', error);
    return DEFAULT_EMAIL_CONFIG;
  }
}

export async function updateEmailConfig(config: Partial<EmailConfig>): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'email_config');
    await updateDoc(docRef, config);
    console.log('Email config updated');
  } catch (error) {
    console.error('Error updating email config:', error);
    throw error;
  }
}

// ============================================================================
// AI CONFIGURATION
// ============================================================================

export interface AIConfig {
  pitch_model: string;
  classification_model: string;

  pitch_settings: {
    max_tokens: number;
    temperature: number;
    tone: string;
  };

  api_keys: {
    gemini: string;
    // Autres clés API si nécessaire
  };

  // Pitch generation prompt template
  pitch_prompt_template: string;
}

const DEFAULT_PITCH_PROMPT = `You are an expert podcast pitch writer for Badassery, a podcast booking agency.

Generate a personalized pitch email for the following podcast and client.

=== PODCAST INFO ===
Name: {podcast_name}
Host: {podcast_host}
Description: {podcast_description}
Topics: {podcast_topics}
Category: {podcast_category}
Audience: {podcast_audience}

=== CLIENT INFO ===
Name: {client_name}
Title: {client_title}
Company: {client_company}
Bio: {client_bio}
Speaking Topics: {client_speaking_topics}
Unique Angles: {client_unique_angles}
Professional Goals: {client_goals}

=== INSTRUCTIONS ===
1. Write a concise, personalized pitch email (150-250 words)
2. Reference specific aspects of the podcast that align with the client's expertise
3. Include a compelling hook in the first sentence
4. Highlight 2-3 specific topics the client could discuss
5. End with a clear call to action
6. Keep the tone professional but friendly
7. DO NOT include a subject line - just the email body
8. Sign off with: "Best,\\nRuth\\nBadassery\\nwww.badassery.co"

Write the pitch email now:`;

const DEFAULT_AI_CONFIG: AIConfig = {
  pitch_model: 'gemini-2.0-flash-lite',
  classification_model: 'gemini-2.0-flash-lite',
  pitch_settings: {
    max_tokens: 500,
    temperature: 0.7,
    tone: 'professional_friendly'
  },
  api_keys: {
    gemini: 'AIzaSyBDRKIQEEDiEkX0GkOYSSZkuesG-QIsyr4'
  },
  pitch_prompt_template: DEFAULT_PITCH_PROMPT
};

export async function getAIConfig(): Promise<AIConfig> {
  try {
    const docRef = doc(db, 'settings', 'ai_config');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as AIConfig;
    }

    // Create default if doesn't exist
    await setDoc(docRef, DEFAULT_AI_CONFIG);
    return DEFAULT_AI_CONFIG;
  } catch (error) {
    console.error('Error getting AI config:', error);
    return DEFAULT_AI_CONFIG;
  }
}

export async function updateAIConfig(config: Partial<AIConfig>): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'ai_config');
    await updateDoc(docRef, config);
    console.log('AI config updated');
  } catch (error) {
    console.error('Error updating AI config:', error);
    throw error;
  }
}

// ============================================================================
// SCORING CONFIGURATION
// ============================================================================

export interface ScoringConfig {
  weights: {
    apple_rating: number;
    apple_reviews: number;
    youtube_subs: number;
    engagement: number;
    relevance: number;
    accessibility: number;
  };

  thresholds: {
    min_rating: number;
    min_reviews: number;
    min_score_for_suggestions: number;
  };
}

const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    apple_rating: 0.25,
    apple_reviews: 0.20,
    youtube_subs: 0.15,
    engagement: 0.15,
    relevance: 0.15,
    accessibility: 0.10
  },
  thresholds: {
    min_rating: 4.0,
    min_reviews: 50,
    min_score_for_suggestions: 6.0
  }
};

export async function getScoringConfig(): Promise<ScoringConfig> {
  try {
    const docRef = doc(db, 'settings', 'scoring_config');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as ScoringConfig;
    }

    // Create default if doesn't exist
    await setDoc(docRef, DEFAULT_SCORING_CONFIG);
    return DEFAULT_SCORING_CONFIG;
  } catch (error) {
    console.error('Error getting scoring config:', error);
    return DEFAULT_SCORING_CONFIG;
  }
}

export async function updateScoringConfig(config: Partial<ScoringConfig>): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'scoring_config');
    await updateDoc(docRef, config);
    console.log('Scoring config updated');
  } catch (error) {
    console.error('Error updating scoring config:', error);
    throw error;
  }
}

// ============================================================================
// GENERAL SETTINGS
// ============================================================================

export interface GeneralSettings {
  app_name: string;
  app_logo_url?: string;
  timezone: string;
  date_format: string;
  currency: string;
}

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  app_name: 'Badassery',
  timezone: 'America/New_York',
  date_format: 'MM/DD/YYYY',
  currency: 'USD'
};

export async function getGeneralSettings(): Promise<GeneralSettings> {
  try {
    const docRef = doc(db, 'settings', 'general');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as GeneralSettings;
    }

    // Create default if doesn't exist
    await setDoc(docRef, DEFAULT_GENERAL_SETTINGS);
    return DEFAULT_GENERAL_SETTINGS;
  } catch (error) {
    console.error('Error getting general settings:', error);
    return DEFAULT_GENERAL_SETTINGS;
  }
}

export async function updateGeneralSettings(settings: Partial<GeneralSettings>): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'general');
    await updateDoc(docRef, settings);
    console.log('General settings updated');
  } catch (error) {
    console.error('Error updating general settings:', error);
    throw error;
  }
}

// ============================================================================
// ALL SETTINGS (helper pour charger tout d'un coup)
// ============================================================================

export interface AllSettings {
  email: EmailConfig;
  ai: AIConfig;
  scoring: ScoringConfig;
  general: GeneralSettings;
}

export async function getAllSettings(): Promise<AllSettings> {
  const [email, ai, scoring, general] = await Promise.all([
    getEmailConfig(),
    getAIConfig(),
    getScoringConfig(),
    getGeneralSettings()
  ]);

  return { email, ai, scoring, general };
}

// ============================================================================
// INITIALIZE SETTINGS (créer tous les documents par défaut si nécessaire)
// ============================================================================

export async function initializeSettings(): Promise<void> {
  console.log('Initializing settings...');

  try {
    await Promise.all([
      getEmailConfig(),   // Will create if doesn't exist
      getAIConfig(),      // Will create if doesn't exist
      getScoringConfig(), // Will create if doesn't exist
      getGeneralSettings() // Will create if doesn't exist
    ]);

    console.log('✅ Settings initialized successfully');
  } catch (error) {
    console.error('Error initializing settings:', error);
    throw error;
  }
}
