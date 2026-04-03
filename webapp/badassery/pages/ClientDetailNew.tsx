import React, { useState, useEffect, useRef } from 'react';
import { Client, getClientDisplayData, WishlistItem } from '../types';
import { ArrowLeft, Edit2, Mail, Sparkles, Heart, AlertCircle, RefreshCw, Wand2, Check, X, Radio, ExternalLink, CheckCircle, XCircle, Info, Trash2, Send, Search, User, Globe, Target, MessageSquare, TrendingUp, ChevronDown } from 'lucide-react';
import { getClientById, updateClient, deleteClient } from '../services/clientService';
import { enhanceBioWithGemini, generateClientSummary } from '../services/geminiService';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getOutreachByClientId, updateOutreachStatus, updateOutreachWorkflowStatus, updateItunesId, updateHostEmail, OutreachDocument, getBestHostEmail, EmailCandidate } from '../services/outreachService';
import { getEnrichedMatchesForClient, approveMatch, rejectMatch, getMatchStatsForClient, generateMatchesForClient } from '../services/aiMatchingService';
import { AIMatchWithPodcast } from '../types';
import { getClientWishlist, removeFromWishlist, moveToOutreach, WishlistItem as WishlistItemType } from '../services/wishlistService';
import { getPodcastByItunesId, PodcastDocument, BADASSERY_TOPICS } from '../services/podcastService';
import { getAIConfig } from '../services/settingsService';
import { generateReviewToken } from '../services/reviewService';
import { ClientSectionCard } from '../components/client-detail/ClientSectionCard';
import { ClientInfoField } from '../components/client-detail/ClientInfoField';
import { ClientHeader } from '../components/client-detail/ClientHeader';
import { ClientMatchingPage } from './ClientMatchingPage';

// Target location options (same as onboarding)
const TARGET_LOCATIONS = ['U.S.', 'Europe', 'No Preference'];

interface ClientDetailNewProps {
  clientId: string;
  onBack: () => void;
}

export const ClientDetailNew: React.FC<ClientDetailNewProps> = ({ clientId, onBack }) => {
  const [showMatchingPage, setShowMatchingPage] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  // AI Matches
  const [aiMatches, setAiMatches] = useState<AIMatchWithPodcast[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [generatingMatches, setGeneratingMatches] = useState(false);
  const [matchStats, setMatchStats] = useState<{ total: number; pending: number; approved: number; rejected: number } | null>(null);

  // Wishlist
  const [wishlistItems, setWishlistItems] = useState<(WishlistItemType & { podcast?: PodcastDocument })[]>([]);
  const [loadingWishlist, setLoadingWishlist] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Client | null>(null);

  // AI Bio Enhancement
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [showBioPreview, setShowBioPreview] = useState(false);
  const [generatedBio, setGeneratedBio] = useState<string>('');

  // Outreach Data
  const [outreach, setOutreach] = useState<OutreachDocument[]>([]);
  const [loadingOutreach, setLoadingOutreach] = useState(false);
  const [editingItunesId, setEditingItunesId] = useState<string | null>(null);
  const [editItunesValue, setEditItunesValue] = useState('');

  // Email Management
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [showEmailModalId, setShowEmailModalId] = useState<string | null>(null);

  // Photo Upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // AI Summary
  const [generatingAISummary, setGeneratingAISummary] = useState(false);

  // Stats Editing
  const [editingStats, setEditingStats] = useState(false);
  const [statsForm, setStatsForm] = useState({ total_bookings: 0, goal_bookings: 0 });

  // Outreach Search
  const [outreachSearch, setOutreachSearch] = useState('');
  const [outreachStatusFilter, setOutreachStatusFilter] = useState<string>('all');

  // Copy notification
  const [copiedLink, setCopiedLink] = useState(false);

  // Review token generation
  const [generatingReview, setGeneratingReview] = useState(false);
  const [copiedReviewLink, setCopiedReviewLink] = useState(false);

  // Identity & Contact inline editing
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [assessmentForm, setAssessmentForm] = useState({ onlinePresenceRating: '', channelReach: '', contentFrequency: '', representationType: '', schedulingLink: '' });

  // Collapsible bios (Section 6) — 'final' open by default
  const [expandedBios, setExpandedBios] = useState<Set<string>>(new Set(['final']));

  // Interview Questions
  const [interviewQuestions, setInterviewQuestions] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  // Bio V1 (legacy)
  const [bioV1Loading, setBioV1Loading] = useState(false);
  const [bioV1Error, setBioV1Error] = useState<string | null>(null);
  const [bioV1Done, setBioV1Done] = useState(false);

  // Phase 1 — Before the Interview
  const [phase1Loading, setPhase1Loading] = useState(false);
  const [phase1Error, setPhase1Error] = useState<string | null>(null);
  const [phase1Done, setPhase1Done] = useState(false);
  const [phase1Bio, setPhase1Bio] = useState('');
  const [phase1Questions, setPhase1Questions] = useState<string[]>([]);
  const [phase1SuggestedTopics, setPhase1SuggestedTopics] = useState<string[]>([]);
  const [phase1SuggestedTitles, setPhase1SuggestedTitles] = useState<string[]>([]);

  // Phase 2 — After the Interview
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [aiProfileLoading, setAiProfileLoading] = useState(false);
  const [aiProfileError, setAiProfileError] = useState<string | null>(null);
  const [aiProfileDone, setAiProfileDone] = useState(false);
  const [aiProfileBio, setAiProfileBio] = useState('');
  const [aiProfileTopics, setAiProfileTopics] = useState<string[]>([]);
  const [aiProfileTitles, setAiProfileTitles] = useState<string[]>([]);

  useEffect(() => {
    loadClient();
  }, [clientId]);

  useEffect(() => {
    loadOutreach();
    loadWishlist();
  }, [clientId]);

  const loadAIMatches = async () => {
    try {
      setLoadingMatches(true);
      const [matches, stats] = await Promise.all([
        getEnrichedMatchesForClient(clientId),
        getMatchStatsForClient(clientId)
      ]);
      setAiMatches(matches);
      setMatchStats(stats);
    } catch (error) {
      console.error('Error loading AI matches:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  const loadWishlist = async () => {
    try {
      setLoadingWishlist(true);
      const items = await getClientWishlist(clientId);
      // Enrich with podcast data
      const enriched = await Promise.all(
        items.map(async (item) => {
          const podcast = await getPodcastByItunesId(item.podcast_itunes_id);
          return { ...item, podcast: podcast || undefined };
        })
      );
      setWishlistItems(enriched);
    } catch (error) {
      console.error('Error loading wishlist:', error);
    } finally {
      setLoadingWishlist(false);
    }
  };

  const handleGenerateMatches = async () => {
    try {
      setGeneratingMatches(true);
      await generateMatchesForClient(
        clientId,
        'current_user', // TODO: get from auth
        10 // number of matches
      );
      await loadAIMatches();
    } catch (error) {
      console.error('Error generating matches:', error);
      alert('Failed to generate matches. Please try again.');
    } finally {
      setGeneratingMatches(false);
    }
  };

  const handleApproveMatch = async (matchId: string) => {
    try {
      await approveMatch(matchId, 'current_user');
      await loadAIMatches();
      await loadOutreach();
    } catch (error) {
      console.error('Error approving match:', error);
      alert('Failed to approve match.');
    }
  };

  // Photo Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !client) return;

    try {
      setUploadingPhoto(true);
      const storage = getStorage();
      const storageRef = ref(storage, `clients/${clientId}/photo_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await updateClient(clientId, { logo_url: downloadURL });
      setClient({ ...client, logo_url: downloadURL });
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // AI Summary Generation
  const handleGenerateAISummary = async () => {
    if (!client) return;

    try {
      setGeneratingAISummary(true);
      const summary = await generateClientSummary(client);
      await updateClient(clientId, {
        ai_summary: summary,
        ai_summary_generated_at: new Date().toISOString()
      });
      setClient({ ...client, ai_summary: summary });
    } catch (error) {
      console.error('Error generating AI summary:', error);
      alert('Failed to generate AI summary. Please try again.');
    } finally {
      setGeneratingAISummary(false);
    }
  };

  // Stats Editing
  const handleStartEditStats = () => {
    if (client) {
      setStatsForm({
        total_bookings: client.stats?.total_bookings || 0,
        goal_bookings: client.stats?.goal_bookings || 0
      });
      setEditingStats(true);
    }
  };

  const handleSaveStats = async () => {
    if (!client) return;

    try {
      setUpdating(true);
      const updatedStats = {
        ...client.stats,
        total_bookings: statsForm.total_bookings,
        goal_bookings: statsForm.goal_bookings
      };
      await updateClient(clientId, { stats: updatedStats });
      setClient({ ...client, stats: updatedStats });
      setEditingStats(false);
    } catch (error) {
      console.error('Error saving stats:', error);
      alert('Failed to save stats. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelEditStats = () => {
    setEditingStats(false);
  };

  const handleDeleteClient = async () => {
    if (!window.confirm(`Delete ${client?.identity?.firstName ?? 'this client'}? This cannot be undone.`)) return;
    try {
      await deleteClient(clientId);
      onBack();
    } catch {
      alert('Failed to delete client. Please try again.');
    }
  };

  // Copy Badassery Link
  const handleCopyBadasseryLink = () => {
    const link = client?.links?.badasseryProfileUrl;
    if (link) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleGenerateReviewLink = async () => {
    if (!client || !clientId) return;
    setGeneratingReview(true);
    try {
      const c = client as any;
      const clientName = c.contact_name ||
        (c.identity ? `${c.identity.firstName} ${c.identity.lastName}`.trim() : '') || clientId;
      const token = await generateReviewToken({
        id: `manual_${clientId}_${Date.now()}`,
        client_id: clientId,
        client_name: clientName,
        podcast_id: '',
        podcast_name: '',
      });
      const link = `${window.location.origin}/?review=${token}`;
      navigator.clipboard.writeText(link);
      setCopiedReviewLink(true);
      setTimeout(() => setCopiedReviewLink(false), 3000);
    } catch (e) {
      console.error('Error generating review token:', e);
    } finally {
      setGeneratingReview(false);
    }
  };

  const handleSaveIdentityFields = async () => {
    if (!client) return;
    setSavingIdentity(true);
    try {
      await updateClient(clientId, {
        'currentStatus.onlinePresenceRating': assessmentForm.onlinePresenceRating || undefined,
        'currentStatus.channelReach': assessmentForm.channelReach || undefined,
        'currentStatus.contentFrequency': assessmentForm.contentFrequency || undefined,
        'identity.representationType': assessmentForm.representationType || undefined,
        'links.schedulingLink': assessmentForm.schedulingLink || undefined,
      } as any);
      setClient(prev => {
        if (!prev) return prev;
        const p = prev as any;
        return {
          ...prev,
          currentStatus: { ...p.currentStatus, onlinePresenceRating: assessmentForm.onlinePresenceRating, channelReach: assessmentForm.channelReach, contentFrequency: assessmentForm.contentFrequency },
          identity: { ...p.identity, representationType: assessmentForm.representationType },
          links: { ...p.links, schedulingLink: assessmentForm.schedulingLink },
        } as any;
      });
      setEditingIdentity(false);
    } catch (e) {
      console.error('Error saving identity fields:', e);
    } finally {
      setSavingIdentity(false);
    }
  };

  // Interview Questions via Gemini
  const handleGenerateInterviewQuestions = async () => {
    if (!client) return;
    try {
      setLoadingQuestions(true);
      setQuestionsError(null);
      const { getAIConfig } = await import('../services/aiConfigService');
      const config = getAIConfig();
      const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;

      const ctx = [
        `Name: ${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`,
        `Title: ${client.identity?.jobTitle || ''}`,
        `Company: ${client.identity?.company || ''}`,
        `Goals: ${client.goals?.professionalGoals || ''}`,
        `Mission: ${client.goals?.missionDescription || ''}`,
        `Why now: ${client.goals?.whyNow || ''}`,
        `Top 3 goals: ${client.goals?.top3Goals || ''}`,
        `Work description: ${client.goals?.workDescription || ''}`,
        `Success definition: ${client.goals?.successDefinition || ''}`,
        `Challenges: ${client.goals?.challenges || ''}`,
        `Target audience: ${client.podcast?.audienceDescription || ''}`,
        `Key questions to answer on podcasts: ${client.podcast?.keyQuestions || ''}`,
        `Unasked question: ${client.podcast?.unaskedQuestion || ''}`,
        `Listener takeaways: ${client.podcast?.listenerTakeaways || ''}`,
        `Products/services: ${client.podcast?.productsServices || ''}`,
        `Passion topics: ${client.brandPersonality?.passionTopics || ''}`,
        `Three adjectives: ${client.brandPersonality?.threeAdjectives || ''}`,
        `Common misunderstandings: ${client.brandPersonality?.commonMisunderstandings || ''}`,
        `Speaking topics: ${(client.content?.speakingTopicsArray || []).join(', ')}`,
        `Badassery Recipe / pivot moment: ${(client.identity as any)?.badasseryRecipe || ''}`,
        `Tagline: ${(client.identity as any)?.tagline || ''}`,
        `Bio: ${client.content?.bioOriginal || ''}`,
      ].filter(l => !l.endsWith(': ')).join('\n');

      const prompt = `You are a podcast interview coach preparing a 1-hour deep-dive session with a speaker.

Based on this client profile, generate exactly 15 sharp, open-ended interview questions organized in 5 categories of 3 questions each:
1. Origine & identité (who they are, their journey, their "why")
2. Le moment pivot (the turning point, the Badassery Recipe, defining decision)
3. Travail actuel (what they do today, methodology, concrete results)
4. Audience & objectifs podcast (who they want to reach, what message to spread)
5. Stories & contenu (anecdotes, controversies, things rarely said on podcasts)

Client profile:
${ctx}

Return ONLY a JSON array of 15 strings, one question per item, in order. No category labels in the strings. No markdown. Example format:
["Question 1", "Question 2", ..., "Question 15"]`;

      const resp = await fetch(`${GEMINI_API_URL}?key=${config.geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048 }
        })
      });
      if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
      const data = await resp.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Could not parse questions from response');
      const questions: string[] = JSON.parse(match[0]);
      setInterviewQuestions(questions);
    } catch (err) {
      setQuestionsError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingQuestions(false);
    }
  };

  // Bio V1 via Gemini
  const handleGenerateBioV1 = async () => {
    if (!client) return;
    try {
      setBioV1Loading(true);
      setBioV1Error(null);
      setBioV1Done(false);
      const { getAIConfig } = await import('../services/aiConfigService');
      const config = getAIConfig();
      const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;

      const firstName = client.identity?.firstName || '';
      const lastName = client.identity?.lastName || '';
      const title = client.identity?.jobTitle || '';
      const company = client.identity?.company || '';
      const recipe = (client.identity as any)?.badasseryRecipe || '';
      const tagline = (client.identity as any)?.tagline || '';
      const goals = client.goals?.professionalGoals || '';
      const mission = client.goals?.missionDescription || '';
      const work = client.goals?.workDescription || '';
      const audience = client.podcast?.audienceDescription || '';
      const takeaways = client.podcast?.listenerTakeaways || '';
      const topics = (client.content?.speakingTopicsArray || []).join(', ');
      const adjectives = client.brandPersonality?.threeAdjectives || '';
      const passions = client.brandPersonality?.passionTopics || '';
      const products = client.podcast?.productsServices || '';

      const prompt = `You are a professional speaker bio writer for a podcast outreach agency called Badassery PR.

Write a compelling speaker bio for ${firstName} ${lastName} based on the information below. Requirements:
- Third person ("${firstName} is...")
- 200–350 words
- Lead with their impact or unique positioning (NOT their job title)
- Weave in their pivot story or "why" if available (Badassery Recipe)
- Mention what they help their audience achieve
- End with a punchy closing line that makes a podcast host want to book them
- Professional but human, no corporate jargon, conversational energy

Client data:
Name: ${firstName} ${lastName}
Title: ${title}
Company: ${company}
Tagline: ${tagline}
Mission: ${mission}
Work: ${work}
Goals: ${goals}
Products/Services: ${products}
Target audience: ${audience}
Listener takeaways: ${takeaways}
Speaking topics: ${topics}
Brand adjectives: ${adjectives}
Passion topics: ${passions}
Pivot story / Badassery Recipe: ${recipe}

Return ONLY the bio text, no title, no label, no markdown.`;

      const resp = await fetch(`${GEMINI_API_URL}?key=${config.geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 1024 }
        })
      });
      if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
      const data = await resp.json();
      const bioText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!bioText) throw new Error('Empty response from Gemini');

      // Save to Firestore
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../services/firebase');
      await updateDoc(doc(db, 'clients', clientId), { 'content.bioV1': bioText });
      setClient({ ...client, content: { ...client.content!, bioV1: bioText } });
      setBioV1Done(true);
    } catch (err) {
      setBioV1Error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBioV1Loading(false);
    }
  };

  // Calculate client duration
  const getClientDuration = () => {
    if (!client?.metadata?.startDateUtc) return null;
    const start = new Date(client.metadata.startDateUtc);
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
    if (months < 1) return 'Less than 1 month';
    if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return `${years} year${years > 1 ? 's' : ''}${remainingMonths > 0 ? ` ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}` : ''}`;
  };

  // Filter outreach
  const filteredOutreach = outreach.filter(o => {
    const matchesSearch = !outreachSearch ||
      o['Podcast Name']?.toLowerCase().includes(outreachSearch.toLowerCase()) ||
      o['Host Name']?.toLowerCase().includes(outreachSearch.toLowerCase());
    const matchesStatus = outreachStatusFilter === 'all' || o.status === outreachStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleRejectMatch = async (matchId: string) => {
    try {
      await rejectMatch(matchId, 'current_user');
      await loadAIMatches();
    } catch (error) {
      console.error('Error rejecting match:', error);
    }
  };

  const handleRemoveFromWishlist = async (wishlistId: string) => {
    try {
      await removeFromWishlist(wishlistId);
      await loadWishlist();
    } catch (error) {
      console.error('Error removing from wishlist:', error);
    }
  };

  const handleMoveToOutreach = async (wishlistId: string) => {
    try {
      await moveToOutreach(wishlistId);
      await loadWishlist();
      await loadOutreach();
    } catch (error) {
      console.error('Error moving to outreach:', error);
      alert('Failed to create outreach. Please try again.');
    }
  };

  const loadClient = async () => {
    try {
      setLoading(true);
      const data = await getClientById(clientId);
      setClient(data);
      if ((data as any)?.interviewQuestions?.length) {
        setInterviewQuestions((data as any).interviewQuestions);
      }
      if ((data as any)?.content?.suggestedTopics?.length) {
        setPhase1SuggestedTopics((data as any).content.suggestedTopics);
      }
      setAssessmentForm({
        onlinePresenceRating: (data as any)?.currentStatus?.onlinePresenceRating || '',
        channelReach: (data as any)?.currentStatus?.channelReach || '',
        contentFrequency: (data as any)?.currentStatus?.contentFrequency || '',
        representationType: (data as any)?.identity?.representationType || '',
        schedulingLink: (data as any)?.links?.schedulingLink || '',
      });
    } catch (error) {
      console.error('Error loading client:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOutreach = async () => {
    try {
      setLoadingOutreach(true);
      const data = await getOutreachByClientId(clientId);
      setOutreach(data);
    } catch (error) {
      console.error('Error loading outreach:', error);
    } finally {
      setLoadingOutreach(false);
    }
  };

  // ── PHASE 1 — Generate BioV1 + Interview Prep ──
  const handlePhase1Generate = async () => {
    if (!client) return;
    try {
      setPhase1Loading(true);
      setPhase1Error(null);
      const { getAIConfig } = await import('../services/aiConfigService');
      const config = getAIConfig();
      const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;
      const c = client as any;
      const existingTopicTitles = (c.content?.speakingTopicTitles || []).join(' / ');
      const existingTopicsArray = (client.content?.speakingTopicsArray || []);
      const existingTopics = existingTopicsArray.join(', ');
      const top3Goals = Array.isArray(client.goals?.top3Goals)
        ? (client.goals!.top3Goals as unknown as string[]).join(', ')
        : (client.goals?.top3Goals || '');
      const secondaryCategories = (c.matching?.secondaryCategories || []).join(', ');
      const books = (c.books || []).map((b: any) => b.title).filter(Boolean).join(', ');
      const dreamPodcasts = (client.podcast?.dreamPodcastList || []).join(', ');
      const ctx = [
        `Name: ${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`,
        `Title: ${client.identity?.jobTitle || ''}`,
        `Company: ${client.identity?.company || ''}`,
        `Representation Type: ${client.identity?.representationType || ''}`,
        `Tagline: ${c.identity?.tagline || ''}`,
        `Badassery Recipe: ${c.identity?.badasseryRecipe || ''}`,
        `Mission: ${client.goals?.mission || ''}`,
        `Why now: ${c.selfAssessment?.whyNow || ''}`,
        `Top 3 goals: ${top3Goals}`,
        `Professional goals: ${client.goals?.professionalGoals || ''}`,
        `Primary Category: ${c.matching?.primaryCategory || ''}`,
        `Secondary Categories: ${secondaryCategories}`,
        `Podcast Experience: ${c.selfAssessment?.podcastExperience || ''}`,
        `Target audience: ${client.podcast?.targetAudience || ''}`,
        `Products/services: ${client.podcast?.productsServices || ''}`,
        `Dream Podcasts: ${dreamPodcasts}`,
        `Listener takeaways: ${client.content?.listenerTakeaways || ''}`,
        `Host questions: ${client.content?.hostQuestions || ''}`,
        `Unusual question: ${client.content?.unusualQuestion || ''}`,
        `Is Author: ${c.isAuthor === true ? 'Yes' : c.isAuthor === false ? 'No' : ''}`,
        `Books: ${books}`,
        `Speaking topic titles: ${existingTopicTitles}`,
        `Speaking topics (keywords): ${existingTopics}`,
        `Bio original: ${client.content?.bioOriginal || ''}`,
        `Topics to Avoid (legal): ${client.preferences?.legalRestrictions || ''}`,
        `Anything Else: ${client.preferences?.anythingElse || ''}`,
      ].filter(l => !l.endsWith(': ')).join('\n');

      // Exact taxonomy from Firestore podcast database (70,972 podcasts scanned)
      const PODCAST_CATEGORIES = [
        'Business','Health & Wellness','Personal Development','Finance & Investing',
        'Technology','Entrepreneurship','Leadership','Career & Work','Marketing & Sales',
        'Relationships','Psychology','Education','Science','Parenting & Family',
        'Real Estate','Travel & Adventure','Environment','Design & Creativity','Philosophy',
        'True Crime','History','Arts & Culture','Religion & Spirituality','Sports & Fitness',
        'Comedy','Music','Film & TV','News & Media','Gaming',
      ];
      const PODCAST_TOPICS = [
        'entrepreneurship','personal growth','leadership','business strategy','mental health',
        'resilience','mindset','career development','personal development','self-improvement',
        'professional development','coaching','personal finance','investment strategies',
        'wellness','creativity','innovation','relationships','parenting','nutrition','fitness',
        'sustainability','education','technology','ai','social issues','philosophy',
        'storytelling','healing','community','journalism','industry trends','creative process',
        'literature','activism','diversity and inclusion','remote work','productivity',
        'work-life balance','emotional intelligence','negotiation','public speaking',
        'branding','content creation','social media','sales','management',
        'organizational culture','team building','customer experience','future of work',
        'wealth building','financial freedom','real estate investing','side hustle',
        'startup','venture capital','business transformation','digital marketing',
      ];

      const prompt = `You are a podcast outreach expert at Badassery PR. Your goal is to create the best possible speaker profile for podcast bookings.

Based on the client profile below, generate exactly 3 outputs:

---
OUTPUT 1 — BIO V1
Write a compelling third-person speaker bio of 220-320 words structured in 3 clear paragraphs:

**Paragraph 1 — Hook & Identity (3-4 sentences):**
Open with a bold, memorable hook about who they are and the transformation they create — NOT their job title. Immediately establish their unique angle or pivot story. End this paragraph with their tagline or a punchy positioning statement.

**Paragraph 2 — Work & Mission (3-4 sentences):**
Describe what they do concretely: their methodology, their company/platform, who they serve and how. Weave in the "why now" and their mission. Mention a concrete result or proof point if available.

**Paragraph 3 — Credibility & CTA (2-3 sentences):**
One sentence on their background, credentials, or notable achievement. One sentence on why podcast audiences love them (what listeners walk away with). End with a punchy, forward-looking closing line.

Rules:
- Third person, active verbs, no buzzword soup, no "passionate about", no generic openers like "Meet [Name]".
- If "Is Author" = Yes → mention the book(s) by name in paragraph 2 or 3 as a credibility signal.
- If "Topics to Avoid (legal)" is filled → do NOT reference those subjects anywhere in the bio.

---
OUTPUT 2 — INTERVIEW QUESTIONS
Write exactly 15 open-ended questions for a 60-minute discovery call:
- Q1 MUST be exactly: "Tell me where you grew up and what that was like?"
- Q15 MUST be exactly: "Is there something fun or personal about yourself that you haven't told me yet?"
- Q2–Q14: Craft specific questions based on THIS client's actual story, pivot, methodology, mission, and audience. Cover: origin story, key turning point, core method/framework, biggest client transformation, counterintuitive belief, what they wish people knew, their own challenges, the future they're building toward.
- If "Is Author" = Yes → include at least 1 question specifically about their book.
- If "Podcast Experience" is low → include a question about what made them decide to start doing podcasts now.
- If "Topics to Avoid (legal)" is filled → do NOT ask questions on those subjects.
- Make questions conversational and specific — avoid generic interview clichés.

---
OUTPUT 3 — SUGGESTED TOPICS
Generate exactly 5 topic keywords for this speaker, DIFFERENT from their existing topics: [${existingTopics || existingTopicTitles || 'none'}]

Use "Primary Category" and "Secondary Categories" from the client profile to orient your choices — the suggested topics should logically fit within or adjacent to these categories.
If "Dream Podcasts" is filled, use it to infer the type of audience and topics that would resonate.
If "Topics to Avoid (legal)" is filled → exclude those subjects entirely.

CRITICAL RULE: Every topic MUST be chosen EXACTLY from one of these two lists — do not invent new values:

CATEGORIES (pick 1 or 2 max):
${PODCAST_CATEGORIES.join(', ')}

TOPICS (pick 3 or 4):
${PODCAST_TOPICS.join(', ')}

Pick the values that best match this speaker's profile. Return them as-is, exactly as written above (same capitalization, same spelling).

---
OUTPUT 4 — SPEAKING TOPIC TITLES
Generate exactly 3 compelling, host-ready speaking topic titles for this speaker.

Context — existing topic titles already filled in by the client:
${existingTopicTitles || 'none yet'}

Rules:
- These must be DIFFERENT from the existing titles above
- Format: punchy, specific, benefit-driven title a podcast host would actually use to pitch an episode
- 5–12 words max per title
- Should make the host think "my audience needs to hear this"
- Examples of good format: "Why Most High Achievers Are Building the Wrong Career", "The Hidden Cost of Hustle Culture (And What to Do Instead)"
- No generic titles like "Leadership Tips" or "How to Be Successful"
- If "Is Author" = Yes → at least 1 title can reference the book's core idea (not the title literally)
- If "Topics to Avoid (legal)" is filled → exclude those subjects

---
CLIENT PROFILE:
${ctx}

Return ONLY valid JSON (no markdown, no code blocks):
{"bio":"...","interviewQuestions":["Q1",...,"Q15"],"suggestedTopics":["t1","t2","t3","t4","t5"],"suggestedTitles":["title1","title2","title3"]}`;

      const resp = await fetch(`${GEMINI_URL}?key=${config.geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 4096 } })
      });
      if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
      const data = await resp.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse JSON from response');
      const result = JSON.parse(match[0]);
      setPhase1Bio(result.bio || '');
      setPhase1Questions(result.interviewQuestions || []);
      setPhase1SuggestedTopics(result.suggestedTopics || []);
      setPhase1SuggestedTitles(result.suggestedTitles || []);
      setPhase1Done(true);
    } catch (err) {
      setPhase1Error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPhase1Loading(false);
    }
  };

  const handlePhase1Save = async () => {
    if (!client || !phase1Done) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../services/firebase');
      await updateDoc(doc(db, 'clients', clientId), {
        'content.bioV1': phase1Bio,
        'interviewQuestions': phase1Questions,
        'content.suggestedTopics': phase1SuggestedTopics,
        ...(phase1SuggestedTitles.length > 0 && { 'content.aiTopicTitles': phase1SuggestedTitles }),
      });
      setClient(prev => ({
        ...prev!,
        content: {
          ...prev!.content!,
          bioV1: phase1Bio,
          ...(phase1SuggestedTitles.length > 0 && { aiTopicTitles: phase1SuggestedTitles } as any),
        },
      }));
      setInterviewQuestions(phase1Questions);
      setPhase1Done(false);
      setPhase1Bio('');
      setPhase1Questions([]);
      setPhase1SuggestedTitles([]);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // ── PHASE 2 — Generate Final Bio from PDF transcript ──
  const handleAiProfileGenerate = async () => {
    if (!client || !pdfFile) return;
    try {
      setAiProfileLoading(true);
      setAiProfileError(null);
      const { getAIConfig } = await import('../services/aiConfigService');
      const config = getAIConfig();
      const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;
      const arrayBuffer = await pdfFile.arrayBuffer();
      const base64Chunks: string[] = [];
      const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.length; i += 8192) {
        base64Chunks.push(String.fromCharCode(...bytes.slice(i, i + 8192)));
      }
      const base64 = btoa(base64Chunks.join(''));
      const c = client as any;
      const existingTopics = (client.content?.speakingTopicsArray || []).join(', ');
      const top3Goals = Array.isArray(client.goals?.top3Goals)
        ? (client.goals!.top3Goals as unknown as string[]).join(', ')
        : (client.goals?.top3Goals || '');
      const secondaryCategories = (c.matching?.secondaryCategories || []).join(', ');
      const books = (c.books || []).map((b: any) => b.title).filter(Boolean).join(', ');
      const dreamPodcasts = (client.podcast?.dreamPodcastList || []).join(', ');
      const interviewQuestions = (c.interviewQuestions || []).join('\n');
      const phase1SuggestedTopicsCtx = (c.content?.suggestedTopics || []).join(', ');
      const phase1TopicTitles = (c.content?.aiTopicTitles || []).join(' / ');
      const existingTopicTitles = (c.content?.speakingTopicTitles || []).join(' / ');

      const ctx = [
        `Name: ${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`,
        `Title: ${client.identity?.jobTitle || ''}`,
        `Company: ${client.identity?.company || ''}`,
        `Representation Type: ${client.identity?.representationType || ''}`,
        `Tagline: ${c.identity?.tagline || ''}`,
        `Badassery Recipe: ${c.identity?.badasseryRecipe || ''}`,
        `Mission: ${client.goals?.mission || ''}`,
        `Why now: ${c.selfAssessment?.whyNow || ''}`,
        `Top 3 goals: ${top3Goals}`,
        `Professional goals: ${client.goals?.professionalGoals || ''}`,
        `Primary Category: ${c.matching?.primaryCategory || ''}`,
        `Secondary Categories: ${secondaryCategories}`,
        `Podcast Experience: ${c.selfAssessment?.podcastExperience || ''}`,
        `Target audience: ${client.podcast?.targetAudience || ''}`,
        `Products/services: ${client.podcast?.productsServices || ''}`,
        `Dream Podcasts: ${dreamPodcasts}`,
        `Listener takeaways: ${client.content?.listenerTakeaways || ''}`,
        `Host questions: ${client.content?.hostQuestions || ''}`,
        `Unusual question: ${client.content?.unusualQuestion || ''}`,
        `Is Author: ${c.isAuthor === true ? 'Yes' : c.isAuthor === false ? 'No' : ''}`,
        `Books: ${books}`,
        `Speaking topic titles (client): ${existingTopicTitles}`,
        `Existing speaking topics: ${existingTopics}`,
        `Bio original (client-written): ${client.content?.bioOriginal || ''}`,
        `Bio V1 (Phase 1 AI): ${client.content?.bioV1 || ''}`,
        `Phase 1 Suggested Topics: ${phase1SuggestedTopicsCtx}`,
        `Phase 1 AI Topic Titles: ${phase1TopicTitles}`,
        `Topics to Avoid (legal): ${client.preferences?.legalRestrictions || ''}`,
        `Anything Else: ${client.preferences?.anythingElse || ''}`,
      ].filter(l => !l.endsWith(': ')).join('\n');

      const interviewQuestionsSection = interviewQuestions
        ? `\nInterview Questions Used:\n${interviewQuestions}\n`
        : '';

      const prompt = `You are a podcast outreach expert at Badassery PR. Your job is to write the final speaker profile using the interview transcript as the primary source.
${interviewQuestionsSection ? `\nThe questions below were asked during the recorded interview. Find the speaker's actual answers in the transcript — use their real stories, words, anecdotes, and examples.\n` : ''}
Generate exactly 3 outputs:

---
OUTPUT 1 — FINAL BIO (250-350 words)
The transcript is your primary source. Extract the best story, moment, or insight the speaker shared and build the bio around it.

Structure — 3 paragraphs:
Paragraph 1 — Hook: Open with the most compelling story or moment from the transcript. Make it human and specific. Draw the reader in immediately.
Paragraph 2 — Work & Method: What they do, who they serve, how they do it — enriched with real details from the transcript. Weave in their mission and "why now".
Paragraph 3 — Credibility & Close: One line on background or achievement. One line on what listeners walk away with. End with a punchy, forward-looking line.

Writing rules — follow every single one:
- Third person, conversational, warm, story-driven
- Personality must come through strongly
- No dashes (makes it sound like AI)
- No corporate or TED talk language
- No movie trailer language ("journey", "transform", "empower")
- No long clunky sentences
- No buzzwords ("passionate", "leverage", "impactful", "thought leader")
- If "Is Author" = Yes → mention the book naturally in paragraph 2 or 3
- If "Topics to Avoid (legal)" → do not reference those subjects anywhere

---
OUTPUT 2 — 5 TOPICS KEYWORDS
Based on what was actually discussed in the transcript — not just the profile.
Use "Phase 1 Suggested Topics" as a starting point: confirm, refine or replace based on what emerged in the interview.
Rules:
- Freeform lowercase, 1-3 words max
- Natural podcast vocabulary
- Different from "Existing speaking topics" in the profile
- If "Topics to Avoid (legal)" → exclude those subjects

---
OUTPUT 3 — 3 SPEAKING TOPIC TITLES
Punchy, bookable episode titles a host would actually pitch to their audience.
Based on real stories and moments from the transcript — not generic.
Different from "Speaking topic titles (client)" in the profile.
Format styles to use: "From X to Y" / "The [Adjective] [Noun]" / "Why [Surprising Statement]" / "The [Number] [Thing] No One Tells You About [Topic]"
- If "Is Author" = Yes → at least 1 title can reference the book's core idea (not literally the title)
- If "Topics to Avoid (legal)" → exclude those subjects

---
CLIENT PROFILE:
${ctx}
${interviewQuestionsSection}
Return ONLY valid JSON (no markdown, no code blocks):
{"bio":"...","topics":["t1","t2","t3","t4","t5"],"titles":["title1","title2","title3"]}`;

      const resp = await fetch(`${GEMINI_URL}?key=${config.geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: base64 } }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 3000 }
        })
      });
      if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
      const data = await resp.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse JSON from response');
      const result = JSON.parse(match[0]);
      setAiProfileBio(result.bio || '');
      setAiProfileTopics(result.topics || []);
      setAiProfileTitles(result.titles || []);
      setAiProfileDone(true);
    } catch (err) {
      setAiProfileError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAiProfileLoading(false);
    }
  };

  const handleAiProfileSave = async () => {
    if (!client || !aiProfileDone) return;
    const hasExistingTopics = (client.content?.speakingTopicsArray || []).length > 0;
    if (hasExistingTopics) {
      const ok = window.confirm('This will replace the existing speaking topics. Continue?');
      if (!ok) return;
    }
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../services/firebase');
      await updateDoc(doc(db, 'clients', clientId), {
        'content.bioFinal': aiProfileBio,
        'content.speakingTopicsArray': aiProfileTopics,
        ...(aiProfileTitles.length > 0 && { 'content.speakingTopicTitles': aiProfileTitles }),
      });
      setClient(prev => ({
        ...prev!,
        content: {
          ...prev!.content!,
          speakingTopicsArray: aiProfileTopics,
          ...(aiProfileTitles.length > 0 && { speakingTopicTitles: aiProfileTitles } as any),
        },
      }));
      setAiProfileDone(false);
      setAiProfileBio('');
      setAiProfileTopics([]);
      setAiProfileTitles([]);
      setPdfFile(null);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleStatusChange = async (newStatus: 'active' | 'onboarding' | 'paused' | 'churned') => {
    if (!client) return;

    try {
      setUpdating(true);
      await updateClient(clientId, { status: newStatus });
      setClient({ ...client, status: newStatus });
      setShowStatusMenu(false);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleEdit = () => {
    if (client) {
      setEditForm({ ...client });
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;

    try {
      setUpdating(true);
      await updateClient(clientId, editForm);
      setClient(editForm);
      setIsEditing(false);
      alert('Client updated successfully!');
    } catch (error) {
      console.error('Error updating client:', error);
      alert('Failed to update client. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelEdit = () => {
    setEditForm(null);
    setIsEditing(false);
  };

  const handleEnhanceBio = async () => {
    if (!client) return;

    try {
      setIsGeneratingBio(true);
      const enhanced = await enhanceBioWithGemini(client);
      setGeneratedBio(enhanced);
      setShowBioPreview(true);
    } catch (error) {
      console.error('Error enhancing bio:', error);
      alert(`Failed to enhance bio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBio(false);
    }
  };

  const handleAcceptBio = async () => {
    if (!client || !generatedBio) return;

    try {
      setUpdating(true);
      const updatedContent = {
        ...client.content,
        bioUpdated: generatedBio
      };
      await updateClient(clientId, { content: updatedContent });
      setClient({ ...client, content: updatedContent });
      setShowBioPreview(false);
      setGeneratedBio('');
      alert('Bio updated successfully!');
    } catch (error) {
      console.error('Error saving bio:', error);
      alert('Failed to save bio. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleRejectBio = () => {
    setShowBioPreview(false);
    setGeneratedBio('');
  };

  const handleSaveItunesId = async (id: string) => {
    try {
      await updateItunesId(id, editItunesValue);
      setEditingItunesId(null);
      setEditItunesValue('');
      await loadOutreach();
    } catch (error) {
      console.error('Error updating iTunes ID:', error);
      alert('Failed to update iTunes ID. Please try again.');
    }
  };

  const handleOutreachStatusChange = async (id: string, status: OutreachDocument['status']) => {
    try {
      await updateOutreachStatus(id, status);
      await loadOutreach();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleWorkflowStatusChange = async (id: string, outreachStatus: OutreachDocument['Outreach Status']) => {
    try {
      await updateOutreachWorkflowStatus(id, outreachStatus);
      await loadOutreach();
    } catch (error) {
      console.error('Error updating workflow status:', error);
      alert('Failed to update workflow status. Please try again.');
    }
  };

  const handleSaveHostEmail = async (id: string) => {
    try {
      await updateHostEmail(id, editEmailValue);
      setEditingEmailId(null);
      setEditEmailValue('');
      await loadOutreach();
    } catch (error) {
      console.error('Error updating host email:', error);
      alert('Failed to update host email. Please try again.');
    }
  };

  const handleSelectEmail = async (id: string, email: string) => {
    try {
      await updateHostEmail(id, email);
      setShowEmailModalId(null);
      await loadOutreach();
    } catch (error) {
      console.error('Error selecting email:', error);
      alert('Failed to select email. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (showMatchingPage) {
    return <ClientMatchingPage clientId={clientId} onBack={() => setShowMatchingPage(false)} />;
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto text-slate-400 mb-2" size={48} />
          <p className="text-slate-500">Client not found</p>
          <button onClick={onBack} className="mt-4 text-indigo-600 hover:underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const display = getClientDisplayData(client);

  return (
    <div className="flex flex-col space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm font-medium">
          <ArrowLeft size={16} /> Back to Clients
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => setShowMatchingPage(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white rounded flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(90deg, #e8463a, #f97316)' }}
            title="Badassery Matching"
          >
            🎯 Matching
          </button>
          <button
            onClick={handleEdit}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1"
          >
            <Edit2 size={12} /> Edit
          </button>
          <button
            onClick={handleDeleteClient}
            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 flex items-center gap-1"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>

      {/* ── NEW HEADER ── */}
      <ClientHeader
        client={client}
        display={display}
        clientId={clientId}
        photoInputRef={photoInputRef}
        uploadingHeadshot={uploadingPhoto}
        onHeadshotUpload={handlePhotoUpload}
        showStatusMenu={showStatusMenu}
        setShowStatusMenu={setShowStatusMenu}
        updating={updating}
        onStatusChange={handleStatusChange}
        editingStats={editingStats}
        statsForm={statsForm}
        setStatsForm={setStatsForm}
        onStartEditStats={handleStartEditStats}
        onSaveStats={handleSaveStats}
        onCancelEditStats={handleCancelEditStats}
        copiedLink={copiedLink}
        onCopyLink={handleCopyBadasseryLink}
        generatingReview={generatingReview}
        copiedReviewLink={copiedReviewLink}
        onGenerateReviewLink={handleGenerateReviewLink}
      />

      {/* ── SECTION 1 — MATCHING PROFILE ── */}
      <ClientSectionCard title="🎯 Matching Profile" accent="indigo">
        {(() => {
          const c = client as any;
          const topics: string[] = client.content?.speakingTopicsArray || [];
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <ClientInfoField label="Primary Category"     value={c.matching?.primaryCategory} />
                <ClientInfoField label="Secondary Categories" value={(c.matching?.secondaryCategories || []).join(', ')} />
                <ClientInfoField label="Podcast Experience"   value={c.selfAssessment?.podcastExperience} />
                <ClientInfoField label="Author?"              value={c.isAuthor} />
              </div>
              {topics.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Speaking Topics (tags)</p>
                  <div className="flex flex-wrap gap-2">
                    {topics.map(t => (
                      <span key={t} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-sm font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </ClientSectionCard>

      {/* ── SECTION 2 — IDENTITY & CONTACT ── */}
      <ClientSectionCard title="👤 Identity & Contact" accent="default">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <ClientInfoField label="Email"        value={display.email} />
            <ClientInfoField label="Phone"        value={display.phone} />
            <ClientInfoField label="Job Title"    value={client.identity?.jobTitle} />
            <ClientInfoField label="Company"      value={display.company_name} />
            <ClientInfoField label="Company Size" value={client.identity?.companySize} />
            <ClientInfoField label="LinkedIn"     value={client.links?.linkedinAndSocial} isLink />

            {/* Editable fields */}
            {(['Representation Type', 'Scheduling Link', 'Online Presence', 'Content Frequency', 'Channel Reach'] as const).map(label => {
              const fieldKey = { 'Representation Type': 'representationType', 'Scheduling Link': 'schedulingLink', 'Online Presence': 'onlinePresenceRating', 'Content Frequency': 'contentFrequency', 'Channel Reach': 'channelReach' }[label] as keyof typeof assessmentForm;
              const isDropdown = label === 'Online Presence' || label === 'Content Frequency' || label === 'Representation Type';
              const options: Record<string, string[]> = {
                'Online Presence': ['Poor', 'Fair', 'Average', 'Good', 'Very Good', 'Excellent'],
                'Content Frequency': ['Daily', 'Several times a week', 'Weekly', 'Monthly', 'Rarely / Never'],
                'Representation Type': ['Independent / Solo', 'Represented by an agent', 'Part of a company / team', 'Other'],
              };
              return (
                <div key={label}>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                  {editingIdentity ? (
                    isDropdown ? (
                      <select
                        value={assessmentForm[fieldKey]}
                        onChange={e => setAssessmentForm(f => ({ ...f, [fieldKey]: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="">— Select —</option>
                        {options[label].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={assessmentForm[fieldKey]}
                        onChange={e => setAssessmentForm(f => ({ ...f, [fieldKey]: e.target.value }))}
                        placeholder={label === 'Channel Reach' ? 'e.g. 5K LinkedIn followers' : ''}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                    )
                  ) : (
                    <p className="text-sm text-slate-900">{assessmentForm[fieldKey] || <span className="text-slate-300 italic">—</span>}</p>
                  )}
                </div>
              );
            })}

            <ClientInfoField label="Client Since" value={client.metadata?.startDateUtc ? new Date(client.metadata.startDateUtc).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : undefined} />
          </div>

          {/* Edit controls */}
          <div className="flex justify-end gap-2">
            {editingIdentity ? (
              <>
                <button onClick={handleSaveIdentityFields} disabled={savingIdentity} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                  <Check size={12} /> {savingIdentity ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingIdentity(false)} className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Cancel</button>
              </>
            ) : (
              <button onClick={() => setEditingIdentity(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
                <Edit2 size={12} /> Edit
              </button>
            )}
          </div>

          {(client.currentStatus?.platformsUsed || []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Platforms</p>
              <div className="flex flex-wrap gap-2">
                {client.currentStatus!.platformsUsed!.map(p => (
                  <span key={p} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </ClientSectionCard>

      {/* ── SECTION 3 — STORY & GOALS ── */}
      <ClientSectionCard title="✨ Story & Goals" accent="rose">
        {(() => {
          const c = client as any;
          const recipe = c.identity?.badasseryRecipe;
          const mission = client.goals?.missionDescription;
          const whyNow = client.goals?.whyNow;
          const top3Raw = client.goals?.top3Goals;
          const top3Items = Array.isArray(top3Raw)
            ? top3Raw.filter(Boolean)
            : top3Raw && typeof top3Raw === 'string'
              ? top3Raw.split(/[\n,;]+/).map((s: string) => s.trim()).filter(Boolean)
              : [];
          return (
            <div className="space-y-5">
              {recipe && (
                <div className="rounded-xl p-4 border border-amber-200" style={{ background: '#fffbeb' }}>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">🔑 Pivot Moment</p>
                  <p className="text-sm text-slate-800 italic leading-relaxed">{recipe}</p>
                </div>
              )}
              {mission && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Mission</p>
                  <p className="text-base font-semibold text-slate-900 leading-relaxed">{mission}</p>
                </div>
              )}
              {whyNow && <ClientInfoField label="Why Now" value={whyNow} multiline />}
              {top3Items.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Top 3 Goals</p>
                  <div className="flex flex-wrap gap-2">
                    {top3Items.map((g: string, i: number) => (
                      <span key={i} className="px-3 py-1.5 rounded-full text-sm font-medium text-white" style={{ background: '#e8463a' }}>{g}</span>
                    ))}
                  </div>
                </div>
              )}
              {top3Items.length === 0 && top3Raw && <ClientInfoField label="Top 3 Goals" value={top3Raw} multiline />}
              <ClientInfoField label="Professional Goals"  value={client.goals?.professionalGoals}  multiline />
            </div>
          );
        })()}
      </ClientSectionCard>

      {/* ── SECTION 4 — PODCAST PREFERENCES ── */}
      <ClientSectionCard title="🎙 Podcast Preferences" accent="teal">
        {(() => {
          const c = client as any;
          const locations: string[] = client.podcast?.targetLocations || [];
          const preferredFormats: string[] = c.matching?.preferredFormats || (c.matching?.preferredFormat ? [c.matching.preferredFormat] : []);
          const dreamList: string[] = c.podcast?.dreamPodcastList || [];
          const legalNotes = client.preferences?.legalRestrictions;
          const additionalNotes = client.preferences?.additionalNotes;
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <ClientInfoField label="Target Audience"     value={client.podcast?.targetAudience} multiline />
                <ClientInfoField label="Products / Services" value={client.podcast?.productsServices}    multiline />
                <ClientInfoField label="Listener Takeaways"  value={client.content?.listenerTakeaways}   multiline />
                <ClientInfoField label="Open to In-Person"   value={client.podcast?.openToInPerson} />
                <ClientInfoField label="Interested in Community" value={client.preferences?.communityInterest} />
                <ClientInfoField label="OK to Post on Social"    value={client.preferences?.okToPostOnSocial ?? undefined} />
              </div>

              {preferredFormats.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Preferred Formats</p>
                  <div className="flex flex-wrap gap-2">
                    {preferredFormats.map((f: string) => (
                      <span key={f} className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-sm font-medium">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {locations.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Target Locations</p>
                  <div className="flex flex-wrap gap-2">
                    {locations.map(loc => (
                      <span key={loc} className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-sm font-medium">{loc}</span>
                    ))}
                  </div>
                </div>
              )}

              {dreamList.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Dream Podcast List</p>
                  <div className="space-y-2">
                    {dreamList.map((url: string, i: number) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors group"
                      >
                        <span className="text-xl flex-shrink-0">🎙</span>
                        <span className="flex-1 text-sm text-teal-800 font-medium truncate">{url}</span>
                        <ExternalLink size={13} className="text-teal-400 group-hover:text-teal-600 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {!dreamList.length && client.podcast?.dreamPodcasts && (
                <ClientInfoField label="Dream Podcasts" value={client.podcast.dreamPodcasts} multiline />
              )}

              {(legalNotes || additionalNotes) && (
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <ClientInfoField label="Legal Guidelines"  value={legalNotes}      multiline />
                  <ClientInfoField label="Additional Notes"  value={additionalNotes} multiline />
                </div>
              )}
            </div>
          );
        })()}
      </ClientSectionCard>

      {/* ── SECTION 5 — CONTENT ASSETS ── */}
      <ClientSectionCard title="📚 Content Assets" accent="violet">
        {(() => {
          const c = client as any;
          const bios: { key: string; label: string; badge: string; badgeColor: string; text?: string }[] = [
            { key: 'final',    label: 'Final Bio',    badge: 'FINAL',    badgeColor: 'bg-green-100 text-green-700',  text: c.content?.bioFinal },
            { key: 'v1',       label: 'Bio V1',       badge: 'V1',       badgeColor: 'bg-teal-100 text-teal-700',    text: client.content?.bioV1 },
            { key: 'original', label: 'Original Bio', badge: 'ORIGINAL', badgeColor: 'bg-slate-100 text-slate-600',  text: client.content?.bioOriginal },
          ].filter(b => b.text);

          const toggleBio = (key: string) => {
            setExpandedBios(prev => {
              const next = new Set(prev);
              next.has(key) ? next.delete(key) : next.add(key);
              return next;
            });
          };

          const topicTitles: string[] = c.content?.speakingTopicTitles || [];
          const books: { title: string; link: string }[] = c.books || [];

          return (
            <div className="space-y-5">
              {/* Bio versions */}
              {bios.length > 0 && (
                <div className="space-y-2">
                  {bios.map(({ key, label, badge, badgeColor, text }) => (
                    <div key={key} className="border border-slate-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleBio(key)}
                        className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${badgeColor}`}>{badge}</span>
                          <span className="text-sm font-semibold text-slate-800">{label}</span>
                        </div>
                        <span className="text-slate-400 text-sm">{expandedBios.has(key) ? '▲' : '▼'}</span>
                      </button>
                      {expandedBios.has(key) && (
                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50">
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{text}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Speaking Topic Titles (long form) */}
              {topicTitles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Speaking Topic Titles</p>
                  <ul className="space-y-1">
                    {topicTitles.map((t: string, i: number) => (
                      <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                        <span className="text-violet-400 font-bold shrink-0">{i + 1}.</span>{t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Unusual Question */}
              {c.content?.unusualQuestion && (
                <div className="rounded-xl p-4 border border-rose-200 bg-rose-50">
                  <p className="text-xs font-bold uppercase tracking-wide text-rose-600 mb-2">Unusual Question</p>
                  <p className="text-sm text-slate-800 leading-relaxed">{c.content.unusualQuestion}</p>
                </div>
              )}

              {/* Host Questions */}
              {c.content?.hostQuestions && (() => {
                const qs: string[] = c.content.hostQuestions.split('\n').map((q: string) => q.trim()).filter(Boolean);
                return (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Host Questions</p>
                    <ol className="space-y-1.5">
                      {qs.map((q: string, i: number) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700">
                          <span className="text-violet-400 font-bold shrink-0">{i + 1}.</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })()}

              {/* Past Episode Links */}
              {c.content?.pastEpisodeLinks && (() => {
                const links: string[] = c.content.pastEpisodeLinks
                  .split('\n')
                  .map((l: string) => l.trim())
                  .filter(Boolean);
                if (links.length === 0) return null;
                return (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Past Episode Links</p>
                    <div className="space-y-1.5">
                      {links.map((url: string, i: number) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-violet-50 hover:border-violet-200 transition-colors group"
                        >
                          <ExternalLink size={12} className="text-slate-400 group-hover:text-violet-500 flex-shrink-0" />
                          <span className="text-sm text-indigo-600 hover:underline truncate">{url}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Books */}
              {books.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Books</p>
                  <div className="space-y-2">
                    {books.map((b: { title: string; link: string }, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                        <span className="text-2xl flex-shrink-0">📖</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{b.title}</p>
                          {b.link && (
                            <a href={b.link} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:underline truncate block mt-0.5">
                              {b.link}
                            </a>
                          )}
                        </div>
                        {b.link && (
                          <a href={b.link} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1.5 bg-violet-100 hover:bg-violet-200 rounded-lg transition-colors">
                            <ExternalLink size={13} className="text-violet-600" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </ClientSectionCard>

      {/* ── SECTION 8 — AI PROFILE GENERATION ── */}

      {/* Phase 1 — Before the Interview */}
      <ClientSectionCard title="✨ Phase 1 — Before the Interview" accent="teal">
        <div className="space-y-4">
          {/* Generate button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">BioV1 + 15 interview questions + 5 suggested topics — from form data only, no transcript needed.</p>
            <button
              onClick={handlePhase1Generate}
              disabled={phase1Loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-lg hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50 text-sm font-semibold whitespace-nowrap"
            >
              {phase1Loading ? <><RefreshCw size={14} className="animate-spin" /> Generating...</> : <><Sparkles size={14} /> {(client.content as any)?.bioV1 ? 'Regenerate Phase 1' : '✨ Generate BioV1 + Interview Prep'}</>}
            </button>
          </div>

          {phase1Error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{phase1Error}</div>
          )}

          {/* Saved data (visible when not in generation mode) */}
          {!phase1Done && ((client.content as any)?.bioV1 || interviewQuestions.length > 0 || phase1SuggestedTopics.length > 0 || ((client.content as any)?.aiTopicTitles?.length > 0)) && (
            <div className="space-y-4 p-4 bg-teal-50 rounded-xl border border-teal-200">
              <p className="text-xs font-bold uppercase tracking-wider text-teal-700">Saved Phase 1 Data</p>
              {(client.content as any)?.bioV1 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 mb-1">Bio V1</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{(client.content as any).bioV1}</p>
                </div>
              )}
              {interviewQuestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 mb-2">Interview Questions ({interviewQuestions.length})</p>
                  <ol className="space-y-1.5">
                    {interviewQuestions.map((q, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-700">
                        <span className="font-bold text-teal-600 shrink-0">{i + 1}.</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {phase1SuggestedTopics.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 mb-2">Suggested Topics</p>
                  <div className="flex flex-wrap gap-2">
                    {phase1SuggestedTopics.map((t, i) => (
                      <span key={i} className="px-3 py-1.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-full text-sm font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {((client.content as any)?.aiTopicTitles?.length > 0) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 mb-2">AI Speaking Topic Titles</p>
                  <div className="flex flex-col gap-2">
                    {((client.content as any).aiTopicTitles as string[]).map((t, i) => (
                      <div key={i} className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 font-medium">
                        <span className="text-amber-400 shrink-0">✦</span>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generation results */}
          {phase1Done && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-teal-600 mb-2">Bio V1 (Generated)</p>
                <textarea
                  value={phase1Bio}
                  onChange={e => setPhase1Bio(e.target.value)}
                  rows={8}
                  className="w-full text-sm border border-teal-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-teal-400 focus:outline-none leading-relaxed"
                />
              </div>
              {phase1Questions.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-teal-600 mb-2">Interview Questions ({phase1Questions.length})</p>
                  <ol className="space-y-2 bg-white rounded-lg border border-teal-200 p-4">
                    {phase1Questions.map((q, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-800">
                        <span className="font-bold text-teal-600 shrink-0">{i + 1}.</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {phase1SuggestedTopics.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-teal-600 mb-2">Suggested Topics</p>
                  <div className="flex flex-wrap gap-2">
                    {phase1SuggestedTopics.map((t, i) => (
                      <span key={i} className="px-3 py-1.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-full text-sm font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {phase1SuggestedTitles.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-teal-600 mb-2">Suggested Speaking Topic Titles</p>
                  <div className="flex flex-col gap-2">
                    {phase1SuggestedTitles.map((t, i) => (
                      <div key={i} className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 font-medium">
                        <span className="text-amber-400 shrink-0">✦</span>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button onClick={handlePhase1Save} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700">
                  <Check size={14} /> Save Phase 1
                </button>
                <button
                  onClick={() => { setPhase1Done(false); setPhase1Bio(''); setPhase1Questions([]); setPhase1SuggestedTopics((client.content as any)?.suggestedTopics || []); setPhase1SuggestedTitles([]); setPhase1Error(null); }}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      </ClientSectionCard>

      {/* Phase 2 — After the Interview */}
      <ClientSectionCard title="🎙 Phase 2 — After the Interview" accent="violet">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Upload the interview transcript (PDF) to generate the Final Bio + updated speaking topics.</p>

          {/* PDF dropzone */}
          <div>
            <input
              type="file"
              accept="application/pdf"
              ref={pdfInputRef}
              onChange={e => setPdfFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            {pdfFile ? (
              <div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-lg">
                <span className="text-sm font-medium text-violet-700 flex-1 truncate">📄 {pdfFile.name}</span>
                <button onClick={() => { setPdfFile(null); if (pdfInputRef.current) pdfInputRef.current.value = ''; }} className="text-slate-400 hover:text-red-500">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => pdfInputRef.current?.click()}
                className="w-full border-2 border-dashed border-violet-200 rounded-xl p-6 text-center hover:border-violet-400 hover:bg-violet-50 transition-colors"
              >
                <p className="text-sm font-medium text-violet-600">Click to upload transcript PDF</p>
                <p className="text-xs text-slate-400 mt-1">PDF only</p>
              </button>
            )}
          </div>

          {pdfFile && !aiProfileDone && (
            <button
              onClick={handleAiProfileGenerate}
              disabled={aiProfileLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-sm font-semibold"
            >
              {aiProfileLoading ? <><RefreshCw size={14} className="animate-spin" /> Generating...</> : <><Sparkles size={14} /> 🎙 Generate Final Bio</>}
            </button>
          )}

          {aiProfileError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{aiProfileError}</div>
          )}

          {/* Generation results */}
          {aiProfileDone && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600 mb-2">Final Bio (Generated)</p>
                <textarea
                  value={aiProfileBio}
                  onChange={e => setAiProfileBio(e.target.value)}
                  rows={8}
                  className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-violet-400 focus:outline-none leading-relaxed"
                />
              </div>
              {aiProfileTopics.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-600 mb-2">Speaking Topics (5)</p>
                  <div className="flex flex-wrap gap-2">
                    {aiProfileTopics.map((topic, i) => (
                      <input
                        key={i}
                        type="text"
                        value={topic}
                        onChange={e => { const next = [...aiProfileTopics]; next[i] = e.target.value; setAiProfileTopics(next); }}
                        className="px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-full text-sm text-violet-700 font-medium focus:ring-2 focus:ring-violet-400 focus:outline-none"
                      />
                    ))}
                  </div>
                </div>
              )}
              {aiProfileTitles.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-600 mb-2">Speaking Topic Titles (3)</p>
                  <div className="flex flex-col gap-2">
                    {aiProfileTitles.map((title, i) => (
                      <input
                        key={i}
                        type="text"
                        value={title}
                        onChange={e => { const next = [...aiProfileTitles]; next[i] = e.target.value; setAiProfileTitles(next); }}
                        className="w-full border border-violet-200 rounded-lg px-4 py-2.5 text-sm text-violet-900 font-medium bg-violet-50 focus:ring-2 focus:ring-violet-400 focus:outline-none"
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button onClick={handleAiProfileSave} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700">
                  <Check size={14} /> Save Final Bio + Topics + Titles
                </button>
                <button
                  onClick={() => { setAiProfileDone(false); setAiProfileBio(''); setAiProfileTopics([]); setAiProfileTitles([]); setAiProfileError(null); }}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      </ClientSectionCard>

      {/* ── SECTION 9 — WISHLIST ── */}
      <ClientSectionCard
        title="💛 Wishlist"
        accent="rose"
        headerRight={
          <span className="text-sm text-slate-500">{wishlistItems.filter(i => i.status === 'wishlist').length} pending</span>
        }
      >
        {loadingWishlist ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-slate-600">Loading wishlist...</span>
          </div>
        ) : wishlistItems.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
            <Heart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">No podcasts in wishlist yet</p>
            <p className="text-sm text-slate-500">Browse podcasts and add them to this client's wishlist</p>
          </div>
        ) : (
          <div className="space-y-3">
            {wishlistItems.map(item => (
              <div
                key={item.id}
                className={`bg-white p-4 rounded-lg border shadow-sm ${
                  item.status === 'wishlist' ? 'border-pink-200' :
                  item.status === 'outreach' ? 'border-green-200' :
                  'border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4">
                  {item.podcast?.imageUrl && (
                    <img src={item.podcast.imageUrl} alt={item.podcast.title || 'Podcast'} className="w-12 h-12 rounded-lg object-cover" />
                  )}
                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900">{item.podcast?.title || item.podcast_itunes_id}</h4>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span>Added by {item.added_by}</span>
                      <span>{item.added_at?.toDate?.().toLocaleDateString() || 'Unknown date'}</span>
                      {item.priority && (
                        <span className={`px-2 py-0.5 rounded ${
                          item.priority === 'high' ? 'bg-red-100 text-red-700' :
                          item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>{item.priority}</span>
                      )}
                    </div>
                    {item.notes && <p className="text-sm text-slate-600 mt-1">{item.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'wishlist' && (
                      <>
                        <button onClick={() => handleMoveToOutreach(item.id)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm font-medium">
                          <Send size={14} /> Start Outreach
                        </button>
                        <button onClick={() => handleRemoveFromWishlist(item.id)} className="p-1.5 text-slate-400 hover:text-red-500">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                    {item.status === 'outreach' && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">Outreach Created</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ClientSectionCard>

      {/* ── SECTION 10 — OUTREACH ── */}
      <ClientSectionCard title="📡 Outreach" accent="default">
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Total Podcasts</div>
              <div className="text-2xl font-bold text-slate-900">{outreach.length}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 shadow-sm">
              <div className="text-sm text-blue-700 mb-1">Sent</div>
              <div className="text-2xl font-bold text-blue-900">
                {outreach.filter(item => item['Outreach Status'] === '1st message sent' || item['Outreach Status'] === '1st follow- up sent' || item['Outreach Status'] === '2nd follow-up sent').length}
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 shadow-sm">
              <div className="text-sm text-purple-700 mb-1">Scheduled</div>
              <div className="text-2xl font-bold text-purple-900">
                {outreach.filter(item => item['Outreach Status'] === 'Recording Scheduled' || item['Outreach Status'] === 'Screening Call Scheduled').length}
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200 shadow-sm">
              <div className="text-sm text-green-700 mb-1">Live</div>
              <div className="text-2xl font-bold text-green-900">
                {outreach.filter(item => item['Outreach Status'] === 'Live').length}
              </div>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search podcasts..."
                value={outreachSearch}
                onChange={(e) => setOutreachSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <select
              value={outreachStatusFilter}
              onChange={(e) => setOutreachStatusFilter(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm"
            >
              <option value="all">All Status</option>
              <option value="ready_for_outreach">Ready for Outreach</option>
              <option value="1st_email_sent">1st Email Sent</option>
              <option value="1st_followup_sent">1st Follow-up Sent</option>
              <option value="2nd_followup_sent">2nd Follow-up Sent</option>
              <option value="in_contact">In Contact</option>
              <option value="scheduling_screening">Scheduling Screening</option>
              <option value="screening_scheduled">Screening Scheduled</option>
              <option value="scheduling_recording">Scheduling Recording</option>
              <option value="recording_scheduled">Recording Scheduled</option>
              <option value="recorded">Recorded</option>
              <option value="live">Live</option>
            </select>
          </div>

          {/* Table */}
          {loadingOutreach ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center">
              <RefreshCw className="animate-spin mx-auto text-slate-400 mb-2" size={32} />
              <p className="text-slate-500">Loading outreach data...</p>
            </div>
          ) : filteredOutreach.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center">
              <Radio className="mx-auto text-slate-300 mb-3" size={48} />
              <p className="text-slate-500 font-medium mb-1">No outreach yet</p>
              <p className="text-sm text-slate-400">Podcast outreach for this client will appear here</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Podcast</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">iTunes ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Host Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Data Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Outreach Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredOutreach.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-slate-900">{item.showName}</div>
                              {item.showLink && (
                                <a href={item.showLink} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-1">
                                  View Podcast <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            {item.needsManualReview && <AlertCircle className="text-yellow-500 flex-shrink-0" size={16} />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {editingItunesId === item.id ? (
                            <div className="flex gap-2">
                              <input type="text" value={editItunesValue} onChange={(e) => setEditItunesValue(e.target.value)} placeholder="Enter iTunes ID" className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500" autoFocus />
                              <button onClick={() => handleSaveItunesId(item.id)} className="p-1 text-green-600 hover:text-green-800"><Check size={16} /></button>
                              <button onClick={() => { setEditingItunesId(null); setEditItunesValue(''); }} className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {item.itunesId ? (
                                <span className="text-sm font-mono text-slate-900">{item.itunesId}</span>
                              ) : (
                                <span className="text-sm text-slate-400 italic">Not set</span>
                              )}
                              {item.needsManualReview && (
                                <button onClick={() => { setEditingItunesId(item.id); setEditItunesValue(item.itunesId || ''); }} className="p-1 text-indigo-600 hover:text-indigo-800">
                                  <Edit2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const bestEmail = getBestHostEmail(item);
                            const isEditingEmail = editingEmailId === item.id;
                            return isEditingEmail ? (
                              <div className="flex gap-2">
                                <input type="email" value={editEmailValue} onChange={(e) => setEditEmailValue(e.target.value)} placeholder="Enter email" className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 w-48" autoFocus />
                                <button onClick={() => handleSaveHostEmail(item.id)} className="p-1 text-green-600 hover:text-green-800"><Check size={16} /></button>
                                <button onClick={() => { setEditingEmailId(null); setEditEmailValue(''); }} className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  {bestEmail.email && (
                                    <>
                                      {bestEmail.confidence === 'high' && <CheckCircle className="text-green-600 flex-shrink-0" size={14} />}
                                      {bestEmail.confidence === 'medium' && <AlertCircle className="text-yellow-600 flex-shrink-0" size={14} />}
                                      {bestEmail.confidence === 'low' && <XCircle className="text-red-600 flex-shrink-0" size={14} />}
                                    </>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    {bestEmail.email ? <div className="text-sm text-slate-900 truncate">{bestEmail.email}</div> : <div className="text-sm text-slate-400 italic">No email</div>}
                                    <div className="text-xs text-slate-500">{bestEmail.source && `${bestEmail.source} • ${bestEmail.confidence}`}</div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => { setEditingEmailId(item.id); setEditEmailValue(bestEmail.email || ''); }} className="p-1 text-indigo-600 hover:text-indigo-800" title="Edit email"><Edit2 size={14} /></button>
                                    {bestEmail.allEmails.length > 1 && (
                                      <button onClick={() => setShowEmailModalId(item.id)} className="p-1 text-slate-600 hover:text-slate-800" title={`${bestEmail.allEmails.length} emails available`}><Info size={14} /></button>
                                    )}
                                  </div>
                                </div>
                                {item.hostContactInfo.linkedin && (
                                  <a href={item.hostContactInfo.linkedin} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 text-xs flex items-center gap-1">LinkedIn <ExternalLink size={10} /></a>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={item.status}
                            onChange={(e) => handleOutreachStatusChange(item.id, e.target.value as OutreachDocument['status'])}
                            className={`text-xs px-2 py-1 rounded-full border ${
                              item.status === 'needs_itunes_id' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                              item.status === 'identified' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                              'bg-slate-100 text-slate-800 border-slate-300'
                            }`}
                          >
                            <option value="needs_itunes_id">Needs iTunes ID</option>
                            <option value="identified">Identified</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={item['Outreach Status'] || ''}
                            onChange={(e) => handleWorkflowStatusChange(item.id, e.target.value as OutreachDocument['Outreach Status'])}
                            className={`text-xs px-2 py-1 rounded-full border ${
                              !item['Outreach Status'] ? 'bg-slate-100 text-slate-800 border-slate-300' :
                              item['Outreach Status'] === 'Ready for outreach' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                              item['Outreach Status'] === '1st message sent' || item['Outreach Status'] === '1st follow- up sent' || item['Outreach Status'] === '2nd follow-up sent' ? 'bg-indigo-100 text-indigo-800 border-indigo-300' :
                              item['Outreach Status'] === 'Scheduling Screening Call' || item['Outreach Status'] === 'Screening Call Scheduled' || item['Outreach Status'] === 'Scheduling Recording' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                              item['Outreach Status'] === 'Recording Scheduled' || item['Outreach Status'] === 'Recorded' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                              item['Outreach Status'] === 'Live' ? 'bg-green-100 text-green-800 border-green-300' :
                              item['Outreach Status'] === 'Host said no' || item['Outreach Status'] === 'Email bounced' ? 'bg-red-100 text-red-800 border-red-300' :
                              'bg-slate-100 text-slate-800 border-slate-300'
                            }`}
                          >
                            <option value="">Not Set</option>
                            <option value="Ready for outreach">Ready for Outreach</option>
                            <option value="1st message sent">1st Message Sent</option>
                            <option value="1st follow- up sent">1st Follow-up Sent</option>
                            <option value="2nd follow-up sent">2nd Follow-up Sent</option>
                            <option value="Scheduling Screening Call">Scheduling Screening Call</option>
                            <option value="Screening Call Scheduled">Screening Call Scheduled</option>
                            <option value="Scheduling Recording">Scheduling Recording</option>
                            <option value="Recording Scheduled">Recording Scheduled</option>
                            <option value="Recorded">Recorded</option>
                            <option value="Live">Live</option>
                            <option value="Host said no">Host Said No</option>
                            <option value="Email bounced">Email Bounced</option>
                            <option value="Paid podcast">Paid Podcast</option>
                            <option value="Blacklist">Blacklist</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-slate-500">
                            {item.createdAt && new Date(item.createdAt.toDate()).toLocaleDateString()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </ClientSectionCard>

      {/* ── SECTION 11 — REVIEWS ── */}
      {(() => {
        const allReviews: { rating: number; quote: string; podcastName?: string; createdAt?: string }[] =
          (client as any).reviews || [];

        const handleDeleteReview = async (index: number) => {
          const updated = allReviews.filter((_, i) => i !== index);
          await updateClient(clientId, { reviews: updated } as any);
          setClient(prev => prev ? { ...prev, reviews: updated } as any : prev);
        };

        return (
          <ClientSectionCard title="⭐ Reviews" accent="default">
            {allReviews.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No reviews yet.</p>
            ) : (
              <div className="space-y-3">
                {allReviews.map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${r.rating < 6 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-bold ${r.rating < 6 ? 'text-red-600' : 'text-slate-900'}`}>{r.rating}/10</span>
                        {r.rating < 6 && <span className="text-[10px] font-semibold text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">Hidden from profile</span>}
                        {r.podcastName && <span className="text-xs text-slate-400 truncate">{r.podcastName}</span>}
                      </div>
                      {r.quote ? (
                        <p className="text-sm text-slate-600 italic">"{r.quote}"</p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No comment left.</p>
                      )}
                      {r.createdAt && (
                        <p className="text-[10px] text-slate-400 mt-1">{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteReview(i)}
                      className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete review"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ClientSectionCard>
        );
      })()}

      {/* Email Selection Modal */}
      {showEmailModalId && (() => {
        const currentOutreach = outreach.find(item => item.id === showEmailModalId);
        if (!currentOutreach) return null;

        const bestEmail = getBestHostEmail(currentOutreach);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex justify-between items-center rounded-t-xl">
                <h2 className="text-xl font-bold text-white">
                  Select Host Email
                </h2>
                <button
                  onClick={() => setShowEmailModalId(null)}
                  className="text-white hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">
                    {currentOutreach.showName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Choose the best email address to contact this podcast host
                  </p>
                </div>

                <div className="space-y-2">
                  {bestEmail.allEmails.map((candidate, index) => (
                    <div
                      key={index}
                      className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {candidate.score >= 100 ? (
                              <CheckCircle size={18} className="text-green-600" />
                            ) : candidate.score >= 60 ? (
                              <AlertCircle size={18} className="text-yellow-600" />
                            ) : (
                              <XCircle size={18} className="text-red-600" />
                            )}
                            <span className="font-medium text-slate-900">
                              {candidate.email}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-600">
                            <span className="flex items-center gap-1">
                              <span className="font-medium">Source:</span> {candidate.sourceLabel}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="font-medium">Score:</span> {candidate.score}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full font-medium ${
                              candidate.score >= 100
                                ? 'bg-green-100 text-green-700'
                                : candidate.score >= 60
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {candidate.score >= 100 ? 'High' : candidate.score >= 60 ? 'Medium' : 'Low'} Confidence
                            </span>
                          </div>

                          {/* Show warnings for low-quality emails */}
                          {candidate.email.includes('buzzsprout') ||
                           candidate.email.includes('libsyn') ||
                           candidate.email.includes('transistor') ? (
                            <div className="mt-2 text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
                              ⚠️ Podcast hosting platform email - may not reach host directly
                            </div>
                          ) : candidate.email.includes('noreply') ||
                                candidate.email.includes('no-reply') ||
                                candidate.email.includes('donotreply') ? (
                            <div className="mt-2 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                              ❌ Generic no-reply address - likely unmonitored
                            </div>
                          ) : null}
                        </div>

                        <button
                          onClick={() => handleSelectEmail(currentOutreach.id, candidate.email)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            bestEmail.email === candidate.email
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-indigo-100 hover:text-indigo-700'
                          }`}
                        >
                          {bestEmail.email === candidate.email ? (
                            <span className="flex items-center gap-1">
                              <Check size={14} /> Current
                            </span>
                          ) : (
                            'Use This Email'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {bestEmail.allEmails.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <Mail size={48} className="mx-auto mb-2 opacity-30" />
                    <p>No email addresses found for this podcast</p>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-4 rounded-b-xl border-t border-slate-200">
                <button
                  onClick={() => setShowEmailModalId(null)}
                  className="w-full bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-300 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Modal - ALL TABS AT ONCE */}
      {isEditing && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-slate-900">
                Edit Client Profile
              </h2>
              <button
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-8">
              {/* SECTION 1: Identity */}
              <div className="border-b border-slate-200 pb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <User size={20} className="text-indigo-600" />
                  Identity & Contact
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                    <input type="text" value={editForm.identity?.firstName || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, firstName: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                    <input type="text" value={editForm.identity?.lastName || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, lastName: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input type="email" value={editForm.identity?.email || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, email: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                    <input type="tel" value={editForm.identity?.phone || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, phone: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Job Title</label>
                    <input type="text" value={editForm.identity?.jobTitle || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, jobTitle: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
                    <input type="text" value={editForm.identity?.company || ''} onChange={(e) => setEditForm({ ...editForm, identity: { ...editForm.identity!, company: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Links */}
              {editForm.links && (
                <div className="border-b border-slate-200 pb-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Globe size={20} className="text-indigo-600" />
                    Links & Assets
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">LinkedIn</label>
                      <input type="url" value={editForm.links.linkedinAndSocial || ''} onChange={(e) => setEditForm({ ...editForm, links: { ...editForm.links!, linkedinAndSocial: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Headshot URL</label>
                      <input type="url" value={editForm.links.headshot || ''} onChange={(e) => setEditForm({ ...editForm, links: { ...editForm.links!, headshot: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Badassery Profile URL</label>
                      <input type="url" value={editForm.links.badasseryProfileUrl || ''} onChange={(e) => setEditForm({ ...editForm, links: { ...editForm.links!, badasseryProfileUrl: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Scheduling Link</label>
                      <input type="url" value={editForm.links.schedulingLink || ''} onChange={(e) => setEditForm({ ...editForm, links: { ...editForm.links!, schedulingLink: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: Goals & Vision */}
              {editForm.goals && (
                <div className="border-b border-slate-200 pb-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Target size={20} className="text-indigo-600" />
                    Goals & Vision
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Professional Goals</label>
                      <textarea rows={2} value={editForm.goals.professionalGoals || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, professionalGoals: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Work Description</label>
                        <textarea rows={2} value={editForm.goals.workDescription || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, workDescription: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Mission Description</label>
                        <textarea rows={2} value={editForm.goals.missionDescription || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, missionDescription: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Why Now?</label>
                        <textarea rows={2} value={editForm.goals.whyNow || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, whyNow: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Top 3 Goals</label>
                        <input type="text" value={editForm.goals.top3Goals || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, top3Goals: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Challenges</label>
                        <textarea rows={2} value={editForm.goals.challenges || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, challenges: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Success Definition</label>
                        <textarea rows={2} value={editForm.goals.successDefinition || ''} onChange={(e) => setEditForm({ ...editForm, goals: { ...editForm.goals!, successDefinition: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: Brand & Voice */}
              {editForm.brandPersonality && (
                <div className="border-b border-slate-200 pb-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Sparkles size={20} className="text-indigo-600" />
                    Brand & Voice
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Three Adjectives</label>
                        <input type="text" value={editForm.brandPersonality.threeAdjectives || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, threeAdjectives: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">How Audience Should Feel</label>
                        <input type="text" value={editForm.brandPersonality.audienceFeeling || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, audienceFeeling: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Key Phrases</label>
                        <textarea rows={2} value={editForm.brandPersonality.keyPhrases || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, keyPhrases: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Passion Topics</label>
                        <textarea rows={2} value={editForm.brandPersonality.passionTopics || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, passionTopics: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Phrases to Avoid</label>
                        <textarea rows={2} value={editForm.brandPersonality.phrasesToAvoid || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, phrasesToAvoid: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Admired Brands</label>
                        <input type="text" value={editForm.brandPersonality.admiredBrands || ''} onChange={(e) => setEditForm({ ...editForm, brandPersonality: { ...editForm.brandPersonality!, admiredBrands: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 5: Podcast Preferences */}
              {editForm.podcast && (
                <div className="border-b border-slate-200 pb-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <MessageSquare size={20} className="text-indigo-600" />
                    Podcast Preferences
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Target Audience</label>
                        <textarea rows={2} value={(editForm.podcast as any).targetAudience || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, targetAudience: e.target.value } as any })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Products/Services</label>
                        <textarea rows={2} value={editForm.podcast.productsServices || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, productsServices: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Dream Podcasts</label>
                      <textarea rows={2} value={editForm.podcast.dreamPodcasts || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, dreamPodcasts: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Key Questions</label>
                        <textarea rows={2} value={editForm.podcast.keyQuestions || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, keyQuestions: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Listener Takeaways</label>
                        <textarea rows={2} value={editForm.podcast.listenerTakeaways || ''} onChange={(e) => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, listenerTakeaways: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Target Location</label>
                      <div className="flex flex-wrap gap-4 mt-2">
                        {TARGET_LOCATIONS.map(loc => (
                          <label key={loc} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.podcast?.targetLocations?.includes(loc) || false}
                              onChange={(e) => {
                                const currentLocations = editForm.podcast?.targetLocations || [];
                                if (e.target.checked) {
                                  setEditForm({ ...editForm, podcast: { ...editForm.podcast!, targetLocations: [...currentLocations, loc] } });
                                } else {
                                  setEditForm({ ...editForm, podcast: { ...editForm.podcast!, targetLocations: currentLocations.filter(l => l !== loc) } });
                                }
                              }}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">{loc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Open to In-Person</label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="openToInPerson"
                              checked={editForm.podcast?.openToInPerson === true}
                              onChange={() => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, openToInPerson: true } })}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">Yes</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="openToInPerson"
                              checked={editForm.podcast?.openToInPerson === false}
                              onChange={() => setEditForm({ ...editForm, podcast: { ...editForm.podcast!, openToInPerson: false } })}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">No</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 6: Content & Bio */}
              {editForm.content && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-indigo-600" />
                    Content & Bio
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Bio (Original)</label>
                      <textarea rows={3} value={editForm.content.bioOriginal || ''} onChange={(e) => setEditForm({ ...editForm, content: { ...editForm.content!, bioOriginal: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-slate-700">Bio (Updated/Enhanced)</label>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!editForm) return;
                            try {
                              setIsGeneratingBio(true);
                              const enhanced = await enhanceBioWithGemini(editForm);
                              setEditForm({ ...editForm, content: { ...editForm.content!, bioUpdated: enhanced } });
                            } catch (error) {
                              console.error('Error enhancing bio:', error);
                              alert(`Failed to enhance bio: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            } finally {
                              setIsGeneratingBio(false);
                            }
                          }}
                          disabled={isGeneratingBio || !editForm.content?.bioOriginal?.trim()}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGeneratingBio ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Wand2 size={12} />
                              Enhance with AI
                            </>
                          )}
                        </button>
                      </div>
                      <textarea rows={3} value={editForm.content.bioUpdated || ''} onChange={(e) => setEditForm({ ...editForm, content: { ...editForm.content!, bioUpdated: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Speaking Topics (Original)</label>
                        <textarea rows={2} value={editForm.content.speakingTopicsOriginal || ''} onChange={(e) => setEditForm({ ...editForm, content: { ...editForm.content!, speakingTopicsOriginal: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Speaking Topics (Updated)</label>
                        <textarea rows={2} value={editForm.content.speakingTopicsUpdated || ''} onChange={(e) => setEditForm({ ...editForm, content: { ...editForm.content!, speakingTopicsUpdated: e.target.value } })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Speaking Topics (Tags)</label>
                      <p className="text-xs text-slate-500 mb-2">Select from 60 standardized topics for better AI matching</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(editForm.content.speakingTopicsArray || []).map(topic => (
                          <span key={topic} className="inline-flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                            <span className="text-xs font-medium text-indigo-900">{topic}</span>
                            <button
                              type="button"
                              onClick={() => setEditForm({
                                ...editForm,
                                content: {
                                  ...editForm.content!,
                                  speakingTopicsArray: (editForm.content?.speakingTopicsArray || []).filter(t => t !== topic)
                                }
                              })}
                              className="text-indigo-600 hover:text-indigo-800"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="relative">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value && !(editForm.content?.speakingTopicsArray || []).includes(e.target.value)) {
                              setEditForm({
                                ...editForm,
                                content: {
                                  ...editForm.content!,
                                  speakingTopicsArray: [...(editForm.content?.speakingTopicsArray || []), e.target.value]
                                }
                              });
                            }
                          }}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white cursor-pointer"
                        >
                          <option value="">Select a topic to add...</option>
                          {BADASSERY_TOPICS.filter(t => !(editForm.content?.speakingTopicsArray || []).includes(t)).map(topic => (
                            <option key={topic} value={topic}>{topic}</option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {(editForm.content?.speakingTopicsArray || []).length} of 60 topics selected
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
                disabled={updating}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {updating ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bio Preview Modal */}
      {showBioPreview && generatedBio && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Wand2 size={24} />
                  AI-Enhanced Bio Preview
                </h2>
                <p className="text-sm text-indigo-100 mt-1">Review and approve the AI-generated bio</p>
              </div>
              <button
                onClick={handleRejectBio}
                className="text-white hover:text-indigo-200"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Original Bio */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Original Bio</h3>
                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                  {client?.content?.bioOriginal}
                </p>
              </div>

              {/* AI Generated Bio */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={20} className="text-indigo-600" />
                  <h3 className="text-lg font-bold text-slate-900">AI-Enhanced Bio</h3>
                </div>
                <p className="text-slate-800 whitespace-pre-wrap leading-relaxed text-base">
                  {generatedBio}
                </p>
              </div>

              {/* Comparison Note */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Review Carefully</p>
                  <p>Please verify that all facts, achievements, and details are accurate. The AI enhances storytelling but may occasionally need factual corrections.</p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleRejectBio}
                className="px-6 py-2.5 text-slate-700 hover:text-slate-900 font-semibold border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-2"
                disabled={updating}
              >
                <X size={18} />
                Reject & Regenerate
              </button>
              <button
                onClick={handleAcceptBio}
                disabled={updating}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
              >
                {updating ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Accept & Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component for info cards
const InfoCard: React.FC<{
  title: string;
  content?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  highlight?: boolean
}> = ({ title, content, icon: Icon, highlight }) => {
  if (!content) return null;

  return (
    <div className={`bg-white border rounded-xl p-6 shadow-sm ${highlight ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200'}`}>
      <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
        {Icon && <Icon size={20} className="text-indigo-600" />}
        {title}
      </h3>
      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{content}</p>
    </div>
  );
};
