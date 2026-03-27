import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, X, Loader2, ChevronDown } from 'lucide-react';
import { Client } from '../types';
import { createClient } from '../services/clientService';
import { BADASSERY_NICHES, BADASSERY_TOPICS } from '../services/podcastService';

// Target location options
const TARGET_LOCATIONS = ['U.S.', 'Europe', 'No Preference'];

interface ClientOnboardingProps {
  onBack: () => void;
  onComplete: () => void;
}

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

export const ClientOnboardingNew: React.FC<ClientOnboardingProps> = ({ onBack, onComplete }) => {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state - Step 1: Identity
  const [identity, setIdentity] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    jobTitle: '',
    company: '',
    companySize: '',
    representationType: ''  // Empty by default - should be selected
  });

  // Step 2: Goals
  const [goals, setGoals] = useState({
    professionalGoals: '',
    workDescription: '',
    missionDescription: '',
    whyNow: '',
    top3Goals: '',
    challenges: '',
    successDefinition: ''
  });

  // Step 3: Links & Assets
  const [links, setLinks] = useState({
    linkedinAndSocial: '',
    pastBrandingWork: '',
    headshot: '',
    schedulingLink: '',
    pastPodcasts: '',
    toneVoiceContent: '',
    audioVideoPrompt: ''
  });

  // Step 4: Brand Personality & Content
  const [brandPersonality, setBrandPersonality] = useState({
    threeAdjectives: '',
    audienceFeeling: '',
    keyPhrases: '',
    commonMisunderstandings: '',
    passionTopics: '',
    phrasesToAvoid: '',
    admiredBrands: ''
  });

  const [content, setContent] = useState({
    bioOriginal: '',
    bioUpdated: '',
    speakingTopicsOriginal: '',
    speakingTopicsUpdated: '',
    speakingTopicsArray: [] as string[]
  });

  // Step 5: Podcast Preferences
  const [podcast, setPodcast] = useState({
    audienceDescription: '',
    productsServices: '',
    dreamPodcasts: '',
    targetLocation: '',
    targetLocations: [] as string[],  // Multi-select array
    openToInPerson: undefined as boolean | undefined,  // Not auto-selected
    keyQuestions: '',
    unaskedQuestion: '',
    listenerTakeaways: '',
    upcomingLaunches: ''
  });

  // Step 6: Current Status & Preferences
  const [currentStatus, setCurrentStatus] = useState({
    pastBrandingWork: '',
    onlinePresenceRating: '',
    platformsUsed: [] as string[],
    contentFrequency: '',
    channelReach: ''
  });

  const [selfAssessment, setSelfAssessment] = useState({
    clarity: 'Neutral',
    confidence: 'Neutral',
    promotionComfort: 'Neutral',
    presenceStrength: 'Neutral',
    inboundSatisfaction: 'Neutral',
    industryRecognition: 'Neutral'
  });

  const [preferences, setPreferences] = useState({
    feedbackStyle: 'A mix of both',
    monthlyTimeCommitment: '3-5 hours',
    interestedInCommunity: true,
    openToLinkedInPost: null as boolean | null,
    legalGuidelines: '',
    additionalNotes: ''
  });

  const [metadata, setMetadata] = useState({
    tags: [] as string[],
    apiCategory1: '',
    apiCategoryList: [] as string[]
  });

  const validateStep = (): boolean => {
    switch (step) {
      case 1:
        if (!identity.firstName.trim() || !identity.lastName.trim() ||
            !identity.email.trim() || !identity.phone.trim() ||
            !identity.jobTitle.trim() || !identity.company.trim() ||
            !identity.companySize || !identity.representationType) {
          alert('Please fill in all required fields marked with *');
          return false;
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(identity.email)) {
          alert('Please enter a valid email address');
          return false;
        }
        break;
      case 2:
        if (!goals.professionalGoals.trim() || !goals.workDescription.trim() ||
            !goals.missionDescription.trim() || !goals.whyNow.trim() ||
            !goals.top3Goals.trim() || !goals.challenges.trim() ||
            !goals.successDefinition.trim()) {
          alert('Please fill in all required fields marked with *');
          return false;
        }
        break;
      case 3:
        if (!links.linkedinAndSocial.trim()) {
          alert('LinkedIn & Social URL is required');
          return false;
        }
        break;
      case 4:
        if (!brandPersonality.threeAdjectives.trim() || !brandPersonality.audienceFeeling.trim()) {
          alert('Please fill in all required fields marked with *');
          return false;
        }
        break;
      case 5:
        if (!podcast.audienceDescription.trim() || !podcast.productsServices.trim() ||
            !podcast.dreamPodcasts.trim() || !podcast.keyQuestions.trim() ||
            !podcast.listenerTakeaways.trim() ||
            podcast.targetLocations.length === 0 ||
            podcast.openToInPerson === undefined) {
          alert('Please fill in all required fields marked with *');
          return false;
        }
        break;
      case 6:
        if (!currentStatus.onlinePresenceRating || currentStatus.platformsUsed.length === 0 ||
            metadata.tags.length === 0) {
          alert('Please select your online presence rating, at least one platform, and at least one tag');
          return false;
        }
        break;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) {
      return;
    }
    if (step < 6) {
      setStep((step + 1) as OnboardingStep);
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep((step - 1) as OnboardingStep);
    }
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);

      const now = new Date().toISOString();

      const clientData: Omit<Client, 'id'> = {
        identity,
        goals,
        links,
        currentStatus,
        selfAssessment,
        brandPersonality,
        content,
        podcast,
        preferences,
        metadata: {
          startDateUtc: now,
          submitDateUtc: now,
          clientStatus: 'Onboarding',
          tags: metadata.tags,
          apiCategory1: metadata.apiCategory1,
          apiCategoryList: metadata.apiCategoryList
        },
        source: 'Manual Entry'
      };

      await createClient(clientData);
      onComplete();
    } catch (err) {
      console.error('Error creating client:', err);
      setError('Failed to save client. Please try again.');
      setSaving(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setCurrentStatus(prev => ({
      ...prev,
      platformsUsed: prev.platformsUsed.includes(platform)
        ? prev.platformsUsed.filter(p => p !== platform)
        : [...prev.platformsUsed, platform]
    }));
  };

  const addTag = (tag: string) => {
    if (tag && !metadata.tags.includes(tag)) {
      setMetadata(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
    }
  };

  const removeTag = (tag: string) => {
    setMetadata(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const addSpeakingTopic = (topic: string) => {
    if (topic && !content.speakingTopicsArray.includes(topic)) {
      setContent(prev => ({
        ...prev,
        speakingTopicsArray: [...prev.speakingTopicsArray, topic]
      }));
    }
  };

  const removeSpeakingTopic = (topic: string) => {
    setContent(prev => ({
      ...prev,
      speakingTopicsArray: prev.speakingTopicsArray.filter(t => t !== topic)
    }));
  };

  const getStepTitle = () => {
    switch (step) {
      case 1: return 'Client Identity';
      case 2: return 'Goals & Vision';
      case 3: return 'Links & Assets';
      case 4: return 'Brand & Content';
      case 5: return 'Podcast Preferences';
      case 6: return 'Status & Preferences';
      default: return '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Header / Progress */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Client Onboarding</h1>
          <span className="text-sm font-medium text-slate-500">Step {step} of 6</span>
        </div>
        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${(step / 6) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs font-medium text-slate-500 uppercase tracking-wide">
          <span className={step >= 1 ? 'text-indigo-600' : ''}>Identity</span>
          <span className={step >= 2 ? 'text-indigo-600' : ''}>Goals</span>
          <span className={step >= 3 ? 'text-indigo-600' : ''}>Links</span>
          <span className={step >= 4 ? 'text-indigo-600' : ''}>Brand</span>
          <span className={step >= 5 ? 'text-indigo-600' : ''}>Podcast</span>
          <span className={step >= 6 ? 'text-indigo-600' : ''}>Review</span>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-1">{getStepTitle()}</h2>
        </div>

        {/* Step 1: Identity */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={identity.firstName}
                  onChange={(e) => setIdentity({ ...identity, firstName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={identity.lastName}
                  onChange={(e) => setIdentity({ ...identity, lastName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={identity.email}
                  onChange={(e) => setIdentity({ ...identity, email: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone *</label>
                <input
                  type="tel"
                  value={identity.phone}
                  onChange={(e) => setIdentity({ ...identity, phone: e.target.value })}
                  placeholder="+33 6 12 34 56 78"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Include country code (e.g., +33 for France, +1 for US)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job Title *</label>
                <input
                  type="text"
                  value={identity.jobTitle}
                  onChange={(e) => setIdentity({ ...identity, jobTitle: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company *</label>
                <input
                  type="text"
                  value={identity.company}
                  onChange={(e) => setIdentity({ ...identity, company: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Size <span className="text-red-500">*</span></label>
                <select
                  value={identity.companySize}
                  onChange={(e) => setIdentity({ ...identity, companySize: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                >
                  <option value="">Select size</option>
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-500">201-500</option>
                  <option value="500+">500+</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Representation Type <span className="text-red-500">*</span></label>
                <select
                  value={identity.representationType}
                  onChange={(e) => setIdentity({ ...identity, representationType: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                >
                  <option value="">Select type</option>
                  <option value="Just me">Just me</option>
                  <option value="Small team">Small team</option>
                  <option value="Larger organization">Larger organization</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Goals */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Professional Goals *</label>
              <textarea
                rows={3}
                value={goals.professionalGoals}
                onChange={(e) => setGoals({ ...goals, professionalGoals: e.target.value })}
                placeholder="What are your main professional goals?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Work Description *</label>
              <textarea
                rows={3}
                value={goals.workDescription}
                onChange={(e) => setGoals({ ...goals, workDescription: e.target.value })}
                placeholder="Describe what you do"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mission Description *</label>
              <textarea
                rows={3}
                value={goals.missionDescription}
                onChange={(e) => setGoals({ ...goals, missionDescription: e.target.value })}
                placeholder="What is your company's mission?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Why Now? *</label>
              <textarea
                rows={3}
                value={goals.whyNow}
                onChange={(e) => setGoals({ ...goals, whyNow: e.target.value })}
                placeholder="Why is this the right time?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Top 3 Goals *</label>
              <input
                type="text"
                value={goals.top3Goals}
                onChange={(e) => setGoals({ ...goals, top3Goals: e.target.value })}
                placeholder="e.g., Refine my story, Generate opportunities, Build confidence"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Challenges *</label>
              <textarea
                rows={3}
                value={goals.challenges}
                onChange={(e) => setGoals({ ...goals, challenges: e.target.value })}
                placeholder="What challenges are you facing?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Success Definition *</label>
              <textarea
                rows={3}
                value={goals.successDefinition}
                onChange={(e) => setGoals({ ...goals, successDefinition: e.target.value })}
                placeholder="What does success look like for you?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 3: Links */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">LinkedIn & Social *</label>
              <input
                type="url"
                value={links.linkedinAndSocial}
                onChange={(e) => setLinks({ ...links, linkedinAndSocial: e.target.value })}
                placeholder="https://linkedin.com/in/yourname"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Past Branding Work</label>
              <input
                type="url"
                value={links.pastBrandingWork}
                onChange={(e) => setLinks({ ...links, pastBrandingWork: e.target.value })}
                placeholder="Link to past branding materials"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Headshot</label>
              <input
                type="url"
                value={links.headshot}
                onChange={(e) => setLinks({ ...links, headshot: e.target.value })}
                placeholder="Link to your professional headshot"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Scheduling Link</label>
              <input
                type="url"
                value={links.schedulingLink}
                onChange={(e) => setLinks({ ...links, schedulingLink: e.target.value })}
                placeholder="Calendly or similar"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Past Podcasts</label>
              <input
                type="url"
                value={links.pastPodcasts}
                onChange={(e) => setLinks({ ...links, pastPodcasts: e.target.value })}
                placeholder="Links to previous podcast appearances"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tone/Voice Content</label>
              <input
                type="url"
                value={links.toneVoiceContent}
                onChange={(e) => setLinks({ ...links, toneVoiceContent: e.target.value })}
                placeholder="Examples of your communication style"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* Step 4: Brand & Content */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Three Adjectives *</label>
              <input
                type="text"
                value={brandPersonality.threeAdjectives}
                onChange={(e) => setBrandPersonality({ ...brandPersonality, threeAdjectives: e.target.value })}
                placeholder="e.g., Upbeat, Discerning, Trustworthy"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">How Should Audience Feel? *</label>
              <input
                type="text"
                value={brandPersonality.audienceFeeling}
                onChange={(e) => setBrandPersonality({ ...brandPersonality, audienceFeeling: e.target.value })}
                placeholder="e.g., Enlightened, empowered, bonded"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Key Phrases</label>
              <textarea
                rows={3}
                value={brandPersonality.keyPhrases}
                onChange={(e) => setBrandPersonality({ ...brandPersonality, keyPhrases: e.target.value })}
                placeholder="Phrases you use often"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Passion Topics</label>
              <textarea
                rows={3}
                value={brandPersonality.passionTopics}
                onChange={(e) => setBrandPersonality({ ...brandPersonality, passionTopics: e.target.value })}
                placeholder="What topics light you up?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
              <textarea
                rows={4}
                value={content.bioOriginal}
                onChange={(e) => setContent({ ...content, bioOriginal: e.target.value })}
                placeholder="Your professional bio"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Speaking Topics *</label>
              <p className="text-xs text-slate-500 mb-3">Select 3-10 topics that best describe what you speak about on podcasts</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {content.speakingTopicsArray.map(topic => (
                  <span key={topic} className="inline-flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                    <span className="text-sm font-medium text-indigo-900">{topic}</span>
                    <button onClick={() => removeSpeakingTopic(topic)} className="text-indigo-600 hover:text-indigo-800">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addSpeakingTopic(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white cursor-pointer"
                >
                  <option value="">Select a topic to add...</option>
                  {BADASSERY_TOPICS.filter(t => !content.speakingTopicsArray.includes(t)).map(topic => (
                    <option key={topic} value={topic}>{topic}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {content.speakingTopicsArray.length} of 60 topics selected
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Podcast Preferences */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Audience Description *</label>
              <textarea
                rows={3}
                value={podcast.audienceDescription}
                onChange={(e) => setPodcast({ ...podcast, audienceDescription: e.target.value })}
                placeholder="Who is your target audience?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Products/Services *</label>
              <textarea
                rows={3}
                value={podcast.productsServices}
                onChange={(e) => setPodcast({ ...podcast, productsServices: e.target.value })}
                placeholder="What do you offer?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dream Podcasts *</label>
              <textarea
                rows={3}
                value={podcast.dreamPodcasts}
                onChange={(e) => setPodcast({ ...podcast, dreamPodcasts: e.target.value })}
                placeholder="Which podcasts would you love to appear on?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Key Questions *</label>
              <textarea
                rows={3}
                value={podcast.keyQuestions}
                onChange={(e) => setPodcast({ ...podcast, keyQuestions: e.target.value })}
                placeholder="What questions do you want to be asked?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Listener Takeaways *</label>
              <textarea
                rows={3}
                value={podcast.listenerTakeaways}
                onChange={(e) => setPodcast({ ...podcast, listenerTakeaways: e.target.value })}
                placeholder="What should listeners take away?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Target Location <span className="text-red-500">*</span></label>
                <div className="space-y-2">
                  {TARGET_LOCATIONS.map(loc => (
                    <label key={loc} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={podcast.targetLocations.includes(loc)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPodcast({ ...podcast, targetLocations: [...podcast.targetLocations, loc] });
                          } else {
                            setPodcast({ ...podcast, targetLocations: podcast.targetLocations.filter(l => l !== loc) });
                          }
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">{loc}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Open to In-Person <span className="text-red-500">*</span></label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="openToInPerson"
                      checked={podcast.openToInPerson === true}
                      onChange={() => setPodcast({ ...podcast, openToInPerson: true })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="openToInPerson"
                      checked={podcast.openToInPerson === false}
                      onChange={() => setPodcast({ ...podcast, openToInPerson: false })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700">No</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Status & Preferences */}
        {step === 6 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Platforms Used *</label>
              <div className="flex flex-wrap gap-3">
                {['Website', 'LinkedIn', 'Instagram', 'Twitter', 'Facebook', 'Newsletter', 'YouTube', 'TikTok'].map(platform => (
                  <label key={platform} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentStatus.platformsUsed.includes(platform)}
                      onChange={() => togglePlatform(platform)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-700">{platform}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Online Presence Rating *</label>
              <select
                value={currentStatus.onlinePresenceRating}
                onChange={(e) => setCurrentStatus({ ...currentStatus, onlinePresenceRating: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Select rating</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Time Commitment *</label>
              <select
                value={preferences.monthlyTimeCommitment}
                onChange={(e) => setPreferences({ ...preferences, monthlyTimeCommitment: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="1-2 hours">1-2 hours</option>
                <option value="3-5 hours">3-5 hours</option>
                <option value="6-10 hours">6-10 hours</option>
                <option value="10+ hours">10+ hours</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.interestedInCommunity}
                  onChange={(e) => setPreferences({ ...preferences, interestedInCommunity: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-700">Interested in Community</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Legal Guidelines</label>
              <textarea
                rows={2}
                value={preferences.legalGuidelines}
                onChange={(e) => setPreferences({ ...preferences, legalGuidelines: e.target.value })}
                placeholder="Any legal or compliance guidelines?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Additional Notes</label>
              <textarea
                rows={3}
                value={preferences.additionalNotes}
                onChange={(e) => setPreferences({ ...preferences, additionalNotes: e.target.value })}
                placeholder="Anything else we should know?"
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Tags (Niche Categories) <span className="text-red-500">*</span></label>
              <div className="flex flex-wrap gap-2 mb-3">
                {metadata.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                    <span className="text-sm font-medium text-indigo-900">{tag}</span>
                    <button onClick={() => removeTag(tag)} className="text-indigo-600 hover:text-indigo-800">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
              <select
                id="newTag"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                onChange={(e) => {
                  if (e.target.value) {
                    addTag(e.target.value);
                    e.target.value = '';
                  }
                }}
                value=""
              >
                <option value="">Select a niche to add...</option>
                {BADASSERY_NICHES.filter(niche => !metadata.tags.includes(niche)).map(niche => (
                  <option key={niche} value={niche}>{niche}</option>
                ))}
              </select>
              {metadata.tags.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Please select at least one tag</p>
              )}
            </div>

          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center mt-12 pt-6 border-t border-slate-100">
          <button
            onClick={step === 1 ? onBack : handlePrevious}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm"
            disabled={saving}
          >
            <ArrowLeft size={16} /> {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 6 ? (
            <button
              onClick={handleNext}
              className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm"
            >
              Next Step <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Saving...
                </>
              ) : (
                <>
                  Complete Onboarding
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
