import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface Props {
  clientId: string;
  firstName?: string;
  onComplete: () => void;
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormData {
  // Q1–Q3
  primaryCategory: string;
  secondaryCategories: string[];
  podcastExperience: string;
  // Q4–Q7
  topGoals: string[];
  whyNow: string;
  mission: string;
  taglineWho: string;
  taglineWhat: string;
  // Q8–Q11
  bio: string;
  badasseryRecipe: string;
  speakingTopicsArray: string[];
  speakingTopicTitles: string[];
  professionalGoals: string;
  // Q12–Q16
  audienceDescription: string;
  dreamPodcastList: string[];
  preferredFormats: string[];
  openToInPerson: string;
  productsServices: string;
  // Q17–Q19
  hostQuestion1: string;
  hostQuestion2: string;
  hostQuestion3: string;
  takeaway1: string;
  takeaway2: string;
  takeaway3: string;
  unusualQuestion: string;
  // Q20–Q26
  pastEpisodeList: string[];
  communityInterest: string;
  okToPost: string;
  legalRestrictions: string;
  isAuthor: string;
  books: { title: string; link: string }[];
  anythingElse: string;
  contentFrequency: string;
  representationType: string;
}

const EMPTY: FormData = {
  primaryCategory: '', secondaryCategories: [], podcastExperience: '',
  topGoals: [], whyNow: '', mission: '', taglineWho: '', taglineWhat: '',
  bio: '', badasseryRecipe: '', speakingTopicsArray: [], speakingTopicTitles: [], professionalGoals: '',
  audienceDescription: '', dreamPodcastList: [], preferredFormats: [],
  openToInPerson: '', productsServices: '',
  hostQuestion1: '', hostQuestion2: '', hostQuestion3: '', takeaway1: '', takeaway2: '', takeaway3: '', unusualQuestion: '',
  pastEpisodeList: [], communityInterest: '', okToPost: '',
  legalRestrictions: '', isAuthor: '', books: [], anythingElse: '',
  contentFrequency: '', representationType: '',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const FIRESTORE_CATEGORIES = [
  'Arts & Culture', 'Business', 'Career & Work', 'Comedy', 'Design & Creativity',
  'Education', 'Entrepreneurship', 'Environment', 'Finance & Investing', 'Film & TV',
  'Food & Lifestyle', 'Gaming', 'Health & Wellness', 'History', 'Leadership',
  'Marketing & Sales', 'Music', 'News & Media', 'Other', 'Parenting & Family',
  'Personal Development', 'Psychology', 'Real Estate', 'Relationships', 'Religion & Spirituality',
  'Society & Politics', 'Sports & Fitness', 'Technology', 'Travel & Adventure', 'True Crime',
];

const TOP_50_TOPICS = [
  'entrepreneurship', 'personal growth', 'leadership', 'business strategy', 'mental health',
  'faith', 'current events', 'politics', 'relationships', 'innovation', 'resilience',
  'mindfulness', 'storytelling', 'christianity', 'pop culture', 'marketing', 'finance',
  'health', 'productivity', 'motivation', 'self-improvement', 'investing', 'parenting',
  'fitness', 'nutrition', 'technology', 'ai', 'startups', 'sales', 'coaching', 'education',
  'creativity', 'sustainability', 'diversity', 'remote work', 'future of work', 'real estate',
  'public speaking', 'negotiation', 'consulting', 'transformation', 'community', 'branding',
  'content creation', 'podcasting', 'writing', 'personal branding', 'career', 'networking',
  'fundraising',
];

const EXPERIENCE_OPTIONS = [
  'No, this is my first time',
  "A little — I've done some outreach on my own",
  "A lot — I've worked with agents or agencies",
];

const GOALS_OPTIONS = [
  'Get booked on high-quality podcasts',
  'Build a magnetic personal brand',
  'Refine my story and how I tell it',
  "Elevate my / my company's voice",
  'Generate opportunities (clients, partners, community)',
  'Test what resonates before launching something',
  'Build confidence in myself and what I have to say',
  'Gain visibility',
  'Other',
];

const FORMAT_OPTIONS = [
  { key: 'Interview',     label: 'Interview',     icon: '🎙' },
  { key: 'Solo',          label: 'Solo',          icon: '🎤' },
  { key: 'Panel',         label: 'Panel',         icon: '👥' },
  { key: 'No preference', label: 'No preference', icon: '🤷' },
];

const YES_NO_NEUTRAL = ['Yes', 'No', 'Neutral'];
const YES_NO = ['Yes', 'No'];

// Slides 0, 4, 9, 14, 20, 24 are section transition slides (no form field)
const SECTION_SLIDES = new Set([0, 4, 9, 14, 20, 24]);

const SECTION_DEFS: Record<number, { emoji: string; title: string; subtitle: string }> = {
  0:  { emoji: '🎯', title: 'Who Are You?',           subtitle: 'Let\'s start with your niche and your relationship to podcasting.' },
  4:  { emoji: '✨', title: 'Your Story',              subtitle: 'What drives you, what you\'re building, and the mission behind it all.' },
  9:  { emoji: '🧠', title: 'Your Expertise',          subtitle: 'Your bio, your recipe, and the topics you own.' },
  14: { emoji: '🎙', title: 'Your Podcast Preferences', subtitle: 'Who you want to reach and how you want to show up.' },
  20: { emoji: '📚', title: 'Your Content',            subtitle: 'The stories, takeaways, and angles that make your episodes unforgettable.' },
  24: { emoji: '🤝', title: 'Our Collaboration',       subtitle: 'A few logistics before we get to work together.' },
};

const TOTAL_Q = 33;
const ANIM_MS = 380;

// ── UI primitives ─────────────────────────────────────────────────────────────

const OkButton = ({ onAdvance, onClick, label = 'OK', disabled = false }: {
  onAdvance?: () => void; onClick?: () => void; label?: string; disabled?: boolean;
}) => (
  <button
    onClick={onClick ?? onAdvance}
    disabled={disabled}
    className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white font-semibold text-base transition-all
      ${disabled
        ? 'bg-slate-300 cursor-not-allowed'
        : 'bg-rose-500 hover:bg-rose-600 active:scale-95 shadow-md hover:shadow-lg'
      }`}
  >
    {label} <span className="text-lg leading-none">↵</span>
  </button>
);

const SlideWrap = ({ children, animating, animDir }: {
  children: React.ReactNode; animating: boolean; animDir: 'up' | 'down';
}) => (
  <div
    className={`absolute inset-0 flex flex-col items-center justify-center px-6 transition-all
      ${animating
        ? animDir === 'up' ? 'opacity-0 -translate-y-8' : 'opacity-0 translate-y-8'
        : 'opacity-100 translate-y-0'
      }`}
    style={{ transitionDuration: `${ANIM_MS}ms` }}
  >
    <div className="w-full max-w-2xl">{children}</div>
  </div>
);

const QHeader = ({ n, title, desc }: { n: number; title: string; desc?: string }) => (
  <div className="mb-8">
    <div className="flex items-start gap-3 mb-3">
      <span className="text-rose-400 font-bold text-xl mt-1 shrink-0">{n} →</span>
      <h2 className="text-3xl font-bold text-slate-900 leading-tight">{title}</h2>
    </div>
    {desc && <p className="text-slate-500 text-base leading-relaxed ml-10">{desc}</p>}
  </div>
);

const MicButton = ({ isRecording, onClick }: { isRecording: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    title={isRecording ? 'Stop recording' : 'Speak your answer (Chrome only)'}
    className={`absolute right-0 top-3 w-10 h-10 rounded-full flex items-center justify-center transition-all text-lg shrink-0
      ${isRecording
        ? 'bg-rose-500 text-white animate-pulse shadow-lg'
        : 'bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-400'
      }`}
  >
    🎤
  </button>
);

const ShortText = ({ value, onChange, placeholder = 'Type your answer here...', isRecording, onToggleVoice }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  isRecording?: boolean; onToggleVoice?: () => void;
}) => (
  <div className="ml-10">
    <div className="relative">
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-3 text-xl text-slate-800 placeholder-slate-300 bg-transparent transition-colors ${onToggleVoice ? 'pr-14' : ''}`}
      />
      {onToggleVoice && <MicButton isRecording={!!isRecording} onClick={onToggleVoice} />}
    </div>
    {isRecording && <span className="text-rose-500 font-medium animate-pulse text-xs mt-1 block">● Recording…</span>}
  </div>
);

const LongText = ({ value, onChange, placeholder = 'Type your answer here...', isRecording, onToggleVoice }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
  isRecording?: boolean; onToggleVoice?: () => void;
}) => {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);
  return (
    <div className="ml-10">
      <div className="relative">
        <textarea
          ref={ref}
          autoFocus
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={`w-full border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-3 text-lg text-slate-800 placeholder-slate-300 bg-transparent transition-colors resize-none overflow-hidden ${onToggleVoice ? 'pr-14' : ''}`}
        />
        {onToggleVoice && <MicButton isRecording={!!isRecording} onClick={onToggleVoice} />}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>Shift + Enter for new line</span>
        {isRecording && <span className="text-rose-500 font-medium animate-pulse">● Recording…</span>}
      </div>
    </div>
  );
};

const SingleSelect = ({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void;
}) => (
  <div className="ml-10 flex flex-col gap-2">
    {options.map((opt, i) => (
      <button
        key={opt}
        onClick={() => onChange(opt)}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left text-base font-medium transition-all
          ${value === opt
            ? 'border-rose-400 bg-rose-50 text-rose-700'
            : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50/40'
          }`}
      >
        <span className={`w-6 h-6 rounded border-2 flex items-center justify-center text-sm font-bold shrink-0
          ${value === opt ? 'border-rose-400 bg-rose-400 text-white' : 'border-slate-300 text-slate-400'}`}>
          {String.fromCharCode(65 + i)}
        </span>
        {opt}
      </button>
    ))}
  </div>
);

const MultiSelect = ({ options, values, onToggle, maxSelect }: {
  options: string[]; values: string[]; onToggle: (v: string) => void; maxSelect?: number;
}) => (
  <div className="ml-10 flex flex-col gap-2 max-h-72 overflow-y-auto pr-2">
    {options.map(opt => {
      const selected = values.includes(opt);
      const atMax = maxSelect != null && !selected && values.length >= maxSelect;
      return (
        <button
          key={opt}
          onClick={() => !atMax && onToggle(opt)}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 text-left text-sm font-medium transition-all
            ${selected
              ? 'border-rose-400 bg-rose-50 text-rose-700'
              : atMax
                ? 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50/40'
            }`}
        >
          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
            ${selected ? 'border-rose-400 bg-rose-400' : atMax ? 'border-slate-200' : 'border-slate-300'}`}>
            {selected && <span className="w-2 h-2 rounded-full bg-white inline-block" />}
          </span>
          {opt}
        </button>
      );
    })}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

export const ClientOnboardingForm: React.FC<Props> = ({ clientId, firstName, onComplete }) => {
  const [slide, setSlide] = useState(-1);
  const [animating, setAnimating] = useState(false);
  const [animDir, setAnimDir] = useState<'up' | 'down'>('up');
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);

  const [categorySearch, setCategorySearch] = useState('');
  const [topicSearch, setTopicSearch] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [dreamLinkInput, setDreamLinkInput] = useState('');
  const [dreamLinkError, setDreamLinkError] = useState('');
  const [topicTitleInput, setTopicTitleInput] = useState('');
  const [linkError, setLinkError] = useState('');
  const [bookTitleInput, setBookTitleInput] = useState('');
  const [bookLinkInput, setBookLinkInput] = useState('');
  const [bookLinkError, setBookLinkError] = useState('');

  const [recordingField, setRecordingField] = useState<keyof FormData | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (slide === TOTAL_Q + 1) {
      const t = setTimeout(onComplete, 3000);
      return () => clearTimeout(t);
    }
  }, [slide, onComplete]);

  const set = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) =>
    setForm((prev: FormData) => ({ ...prev, [field]: value })), []);

  const toggleMulti = useCallback((
    field: 'secondaryCategories' | 'topGoals' | 'speakingTopicsArray',
    value: string
  ) => {
    setForm((prev: FormData) => {
      const cur = prev[field] as string[];
      return { ...prev, [field]: cur.includes(value) ? cur.filter((v: string) => v !== value) : [...cur, value] };
    });
  }, []);

  const isValidUrl = (s: string) => /^https?:\/\/.+/.test(s.trim());

  const addLink = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!isValidUrl(trimmed)) { setLinkError('Please enter a valid URL starting with https://'); return; }
    setLinkError('');
    setForm((prev: FormData) => ({
      ...prev,
      pastEpisodeList: prev.pastEpisodeList.includes(trimmed)
        ? prev.pastEpisodeList
        : [...prev.pastEpisodeList, trimmed],
    }));
    setLinkInput('');
  }, []);

  const removeLink = useCallback((url: string) => {
    setForm((prev: FormData) => ({
      ...prev,
      pastEpisodeList: prev.pastEpisodeList.filter((l: string) => l !== url),
    }));
  }, []);

  const addDreamLink = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!isValidUrl(trimmed)) { setDreamLinkError('Please enter a valid URL starting with https://'); return; }
    setDreamLinkError('');
    setForm((prev: FormData) => ({
      ...prev,
      dreamPodcastList: prev.dreamPodcastList.includes(trimmed)
        ? prev.dreamPodcastList
        : [...prev.dreamPodcastList, trimmed],
    }));
    setDreamLinkInput('');
  }, []);

  const removeDreamLink = useCallback((url: string) => {
    setForm((prev: FormData) => ({
      ...prev,
      dreamPodcastList: prev.dreamPodcastList.filter((l: string) => l !== url),
    }));
  }, []);

  const addTopicTitle = useCallback((title: string) => {
    const trimmed = title.trim();
    if (!trimmed || form.speakingTopicTitles.length >= 5) return;
    setForm((prev: FormData) => ({
      ...prev,
      speakingTopicTitles: prev.speakingTopicTitles.includes(trimmed)
        ? prev.speakingTopicTitles
        : [...prev.speakingTopicTitles, trimmed],
    }));
    setTopicTitleInput('');
  }, [form.speakingTopicTitles]);

  const removeTopicTitle = useCallback((title: string) => {
    setForm((prev: FormData) => ({
      ...prev,
      speakingTopicTitles: prev.speakingTopicTitles.filter((t: string) => t !== title),
    }));
  }, []);

  const addBook = useCallback((title: string, link: string) => {
    const t = title.trim();
    const l = link.trim();
    if (!t) return;
    if (l && !isValidUrl(l)) { setBookLinkError('Please enter a valid URL starting with https://'); return; }
    setBookLinkError('');
    setForm((prev: FormData) => ({
      ...prev,
      books: [...prev.books, { title: t, link: l }],
    }));
    setBookTitleInput('');
    setBookLinkInput('');
  }, []);

  const removeBook = useCallback((idx: number) => {
    setForm((prev: FormData) => ({
      ...prev,
      books: prev.books.filter((_: { title: string; link: string }, i: number) => i !== idx),
    }));
  }, []);

  const toggleRankedCategory = useCallback((cat: string) => {
    setForm((prev: FormData) => {
      const ranked = [prev.primaryCategory, ...prev.secondaryCategories].filter(Boolean);
      if (ranked.includes(cat)) {
        const newRanked = ranked.filter((c: string) => c !== cat);
        return { ...prev, primaryCategory: newRanked[0] || '', secondaryCategories: newRanked.slice(1) };
      } else if (ranked.length < 3) {
        const newRanked = [...ranked, cat];
        return { ...prev, primaryCategory: newRanked[0] || '', secondaryCategories: newRanked.slice(1) };
      }
      return prev;
    });
  }, []);

  const toggleFormat = useCallback((fmt: string) => {
    setForm((prev: FormData) => ({
      ...prev,
      preferredFormats: prev.preferredFormats.includes(fmt)
        ? prev.preferredFormats.filter((f: string) => f !== fmt)
        : [...prev.preferredFormats, fmt],
    }));
  }, []);

  const toggleRecording = useCallback((field: keyof FormData, currentValue: string) => {
    if (recordingField !== null) {
      recognitionRef.current?.stop();
      setRecordingField(null);
      if (recordingField === field) return;
    }
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Try Chrome.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finalTranscript = currentValue;
    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript + ' ';
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      set(field, (finalTranscript + interim) as any);
    };
    recognition.onend = () => setRecordingField(null);
    recognitionRef.current = recognition;
    recognition.start();
    setRecordingField(field);
  }, [recordingField, set]);

  // ── Navigation ────────────────────────────────────────────────────────────────

  // Slides statically removed from the flow (Q6 mission removed, Q2 merged into Q1)
  const STATIC_SKIPPED = new Set([2, 7]);
  // Slide 30 (books list) is skipped if not an author
  const isSkipped = (n: number) => STATIC_SKIPPED.has(n) || (n === 32 && form.isAuthor !== 'Yes');

  const goTo = useCallback((next: number, dir: 'up' | 'down' = 'up') => {
    if (animating) return;
    setAnimDir(dir);
    setAnimating(true);
    setTimeout(() => {
      setSlide(next);
      setAnimating(false);
    }, ANIM_MS);
  }, [animating]);

  const advance = useCallback(() => {
    if (slide < TOTAL_Q) {
      let next = slide + 1;
      while (isSkipped(next) && next <= TOTAL_Q) next++;
      goTo(next, 'up');
    }
  }, [slide, goTo, isSkipped]);

  const back = useCallback(() => {
    if (slide > 0) {
      let prev = slide - 1;
      while (isSkipped(prev) && prev > 0) prev--;
      goTo(prev, 'down');
    }
  }, [slide, goTo, isSkipped]);

  // ── Validation (by slide number) ──────────────────────────────────────────────

  const isValid = useCallback((s: number): boolean => {
    switch (s) {
      case 1:  return form.primaryCategory !== '';
      case 3:  return form.podcastExperience !== '';
      case 5:  return form.topGoals.length === 3;
      case 12: return form.speakingTopicTitles.length >= 3;
      case 18: return form.openToInPerson !== '';
      case 26: return form.communityInterest !== '';
      case 27: return form.okToPost !== '';
      default: return true;
    }
  }, [form]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (e.target instanceof HTMLTextAreaElement && !e.shiftKey) return;
      if (slide === -1) { goTo(0); return; }
      if (slide >= 0 && slide <= TOTAL_Q && isValid(slide)) {
        if (slide === TOTAL_Q) handleSubmit();
        else advance();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slide, isValid, advance, goTo]);

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const omit = (obj: Record<string, any>) =>
        Object.fromEntries(Object.entries(obj).filter(([, v]) =>
          v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
        ));

      const tagline = form.taglineWho && form.taglineWhat
        ? `I help ${form.taglineWho} to ${form.taglineWhat}`
        : form.taglineWho || form.taglineWhat || '';

      const listenerTakeaways = [form.takeaway1, form.takeaway2, form.takeaway3]
        .filter(Boolean)
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n');

      const pastEpisodeLinks = form.pastEpisodeList.join('\n');

      const updates: Record<string, any> = {
        'identity.tagline':         tagline || undefined,
        'identity.badasseryRecipe': form.badasseryRecipe || undefined,
        matching: omit({
          primaryCategory:     form.primaryCategory,
          secondaryCategories: form.secondaryCategories,
          preferredFormats:    form.preferredFormats,
        }),
        selfAssessment: omit({
          podcastExperience: form.podcastExperience,
          whyNow:            form.whyNow,
        }),
        goals: omit({
          top3Goals:         form.topGoals,
          professionalGoals: form.professionalGoals,
          mission:           form.mission,
        }),
        podcast: omit({
          targetAudience:    form.audienceDescription,
          productsServices:  form.productsServices,
          dreamPodcastList:  form.dreamPodcastList,
          openToInPerson:    form.openToInPerson === 'Yes',
        }),
        content: omit({
          bioOriginal:          form.bio,
          speakingTopicsArray:  form.speakingTopicsArray,
          speakingTopicTitles:  form.speakingTopicTitles,
          hostQuestions:        [form.hostQuestion1, form.hostQuestion2, form.hostQuestion3].filter(Boolean).join('\n'),
          listenerTakeaways:    listenerTakeaways,
          unusualQuestion:      form.unusualQuestion,
          pastEpisodeLinks:     pastEpisodeLinks,
        }),
        preferences: omit({
          communityInterest: form.communityInterest,
          okToPostOnSocial:  form.okToPost === 'Yes' ? true : form.okToPost === 'No' ? false : undefined,
          legalRestrictions: form.legalRestrictions,
          anythingElse:      form.anythingElse,
        }),
        books: form.books.length > 0 ? form.books : undefined,
        isAuthor: form.isAuthor === 'Yes' ? true : form.isAuthor === 'No' ? false : undefined,
        'identity.representationType': form.representationType || undefined,
        'currentStatus.contentFrequency': form.contentFrequency || undefined,
        onboardingCompleted: true,
        updatedAt: new Date().toISOString(),
      };

      Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

      await updateDoc(doc(db, 'clients', clientId), updates);
      goTo(TOTAL_Q + 1, 'up');
    } catch (err) {
      console.error('Onboarding save error:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const progress = slide <= 0 ? 0 : Math.round((slide / TOTAL_Q) * 100);
  const bioWordCount = form.bio.trim().split(/\s+/).filter(Boolean).length;
  const filteredCategories = FIRESTORE_CATEGORIES.filter(c =>
    c.toLowerCase().includes(categorySearch.toLowerCase())
  );
  const filteredTopics = TOP_50_TOPICS.filter(t =>
    t.toLowerCase().includes(topicSearch.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-white overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Progress bar */}
      {slide >= 0 && slide <= TOTAL_Q && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100 z-10">
          <div className="h-full bg-rose-400 transition-all duration-500" style={{ width: `${progress}%` }} />
          <div className="absolute right-3 top-2 text-xs text-slate-400 font-medium">{progress}%</div>
        </div>
      )}

      {/* Back button */}
      {slide >= 1 && slide <= TOTAL_Q && (
        <button
          onClick={back}
          className="absolute top-6 left-4 text-slate-400 hover:text-slate-600 transition-colors z-10 text-2xl leading-none"
          aria-label="Go back"
        >
          ↑
        </button>
      )}

      <div className="relative w-full h-full">

        {/* ── INTRO ── */}
        {slide === -1 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <div className="mb-4 text-5xl">🥳</div>
            <h1 className="text-4xl font-bold text-slate-900 mb-6 leading-tight">
              Hey{firstName ? `, ${firstName}` : ''}! We're excited to kick off this experience with you.
            </h1>
            <p className="text-slate-500 text-lg leading-relaxed mb-10">
              This form helps us understand who you are, how you move, and the stories you're meant to share.
              Your answers will shape every piece of this experience — so please take your time.
              <br /><br />
              It'll take about 20 minutes. <span className="font-medium text-slate-700">💡 Tip: on text questions, click the 🎤 button to record your answer by voice instead of typing.</span>
              <br /><br />
              Ready?
            </p>
            <button
              onClick={() => goTo(0)}
              className="inline-flex items-center gap-2 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all"
            >
              Let's do this →
            </button>
          </SlideWrap>
        )}

        {/* ── SECTION SLIDES ── */}
        {SECTION_SLIDES.has(slide) && SECTION_DEFS[slide] && (
          <SlideWrap animating={animating} animDir={animDir}>
            <div className="text-center">
              <div className="text-6xl mb-5">{SECTION_DEFS[slide].emoji}</div>
              <h2 className="text-4xl font-bold mb-4" style={{ color: '#e8463a' }}>
                {SECTION_DEFS[slide].title}
              </h2>
              <p className="text-slate-500 text-lg mb-10 max-w-md mx-auto leading-relaxed">
                {SECTION_DEFS[slide].subtitle}
              </p>
              <button
                onClick={advance}
                className="inline-flex items-center gap-2 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all"
              >
                Continue →
              </button>
            </div>
          </SlideWrap>
        )}

        {/* ── Q1 Ranked categories (replaces Q1 + Q2) ── */}
        {slide === 1 && (() => {
          const ranked = [form.primaryCategory, ...form.secondaryCategories].filter(Boolean);
          return (
            <SlideWrap animating={animating} animDir={animDir}>
              <QHeader n={1} title="Rank your top 3 categories." desc="Click to select in order of priority — 1st, 2nd, 3rd. (Only 1st is required.)" />
              <div className="ml-10">
                {ranked.length > 0 && (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {ranked.map((cat, i) => (
                      <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500 text-white text-sm font-semibold">
                        <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-xs font-bold">#{i + 1}</span>
                        {cat}
                        <button onClick={() => toggleRankedCategory(cat)} className="ml-1 text-white/70 hover:text-white text-lg leading-none">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  autoFocus
                  type="text"
                  value={categorySearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCategorySearch(e.target.value)}
                  placeholder="Search categories..."
                  className="w-full border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-base text-slate-800 placeholder-slate-300 bg-transparent transition-colors mb-4"
                />
                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                  {filteredCategories.map(cat => {
                    const rank = ranked.indexOf(cat);
                    const isSelected = rank >= 0;
                    const atMax = !isSelected && ranked.length >= 3;
                    return (
                      <button
                        key={cat}
                        onClick={() => !atMax && toggleRankedCategory(cat)}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 text-left text-sm font-medium transition-all
                          ${isSelected ? 'border-rose-400 bg-rose-50 text-rose-700'
                            : atMax ? 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50/40'}`}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold
                          ${isSelected ? 'border-rose-400 bg-rose-400 text-white' : atMax ? 'border-slate-200' : 'border-slate-300 text-slate-400'}`}>
                          {isSelected ? `#${rank + 1}` : ''}
                        </span>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!isValid(1)} /></div>
            </SlideWrap>
          );
        })()}

        {/* ── Q3 Podcast experience ── */}
        {slide === 3 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={3} title="Have you invested time, energy or resources in podcast placements in the past?" />
            <SingleSelect
              options={EXPERIENCE_OPTIONS}
              value={form.podcastExperience}
              onChange={v => { set('podcastExperience', v); setTimeout(advance, 300); }}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!isValid(3)} /></div>
          </SlideWrap>
        )}

        {/* ── Q4 Top 3 goals ── */}
        {slide === 5 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={4} title="What are your top 3 goals for this experience?" desc="Choose exactly 3." />
            <MultiSelect
              options={GOALS_OPTIONS}
              values={form.topGoals}
              onToggle={v => toggleMulti('topGoals', v)}
              maxSelect={3}
            />
            <div className="mt-8 ml-10 flex items-center gap-4">
              <OkButton onAdvance={advance} disabled={!isValid(5)} />
              {form.topGoals.length > 0 && form.topGoals.length !== 3 && (
                <span className="text-sm text-slate-400">{form.topGoals.length}/3 selected</span>
              )}
            </div>
          </SlideWrap>
        )}

        {/* ── Q5 Why now ── */}
        {slide === 6 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={5} title="Why now? What's driving you to show up publicly right now?" />
            <LongText
              value={form.whyNow}
              onChange={v => set('whyNow', v)}
              isRecording={recordingField === 'whyNow'}
              onToggleVoice={() => toggleRecording('whyNow', form.whyNow)}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q6 Mission ── */}
        {slide === 7 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={6} title="If you had to describe your mission in one sentence, what would it be?" />
            <ShortText
              value={form.mission}
              onChange={v => set('mission', v)}
              placeholder=""
              isRecording={recordingField === 'mission'}
              onToggleVoice={() => toggleRecording('mission', form.mission)}
            />
            <div className="mt-8 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q7 Tagline ── */}
        {slide === 8 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={7} title="What's your tagline?" />
            <div className="ml-10">
              <div className="flex flex-wrap items-end gap-x-2 gap-y-4">
                <span className="text-2xl text-slate-400 pb-2">I help</span>
                <div className="relative">
                  <input
                    autoFocus
                    type="text"
                    value={form.taglineWho}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('taglineWho', e.target.value)}
                    placeholder="who?"
                    className="border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-2xl text-rose-600 placeholder-slate-300 bg-transparent transition-colors w-48"
                  />
                </div>
                <span className="text-2xl text-slate-400 pb-2">to</span>
                <div className="relative">
                  <input
                    type="text"
                    value={form.taglineWhat}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('taglineWhat', e.target.value)}
                    placeholder="do what?"
                    className="border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-2xl text-rose-600 placeholder-slate-300 bg-transparent transition-colors w-56"
                  />
                </div>
              </div>
            </div>
            <div className="mt-10 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q8 Bio ── */}
        {slide === 10 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={8} title="Your bio (200–400 words)." />
            <div className="ml-10">
              <div className="relative">
                <textarea
                  autoFocus
                  value={form.bio}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('bio', e.target.value)}
                  placeholder="Write your bio here..."
                  rows={8}
                  className="w-full border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-3 text-lg text-slate-800 placeholder-slate-300 bg-transparent transition-colors resize-none pr-14"
                />
                <MicButton
                  isRecording={recordingField === 'bio'}
                  onClick={() => toggleRecording('bio', form.bio)}
                />
              </div>
              <div className={`flex justify-between text-sm mt-1 ${bioWordCount < 200 || bioWordCount > 400 ? 'text-amber-500' : 'text-emerald-500'}`}>
                <span>{recordingField === 'bio' ? <span className="text-rose-500 font-medium animate-pulse">● Recording…</span> : 'Shift + Enter for new line'}</span>
                <span>{bioWordCount} words {bioWordCount < 200 ? `(${200 - bioWordCount} more to go)` : bioWordCount > 400 ? '(a bit long — try trimming)' : '✓'}</span>
              </div>
            </div>
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q9 Badassery Recipe ── */}
        {slide === 11 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader
              n={9}
              title="What's your Badassery Recipe?"
              desc="The pivot moment or experience that defines your expertise."
            />
            <LongText
              value={form.badasseryRecipe}
              onChange={v => set('badasseryRecipe', v)}
              placeholder="Tell us the story, the turning point, the moment everything changed..."
              rows={6}
              isRecording={recordingField === 'badasseryRecipe'}
              onToggleVoice={() => toggleRecording('badasseryRecipe', form.badasseryRecipe)}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q10 Topics ── */}
        {slide === 12 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={10} title="What topics do you speak about?" desc="First pick tags (up to 5), then add 3–5 topic titles that will show on your profile." />
            <div className="ml-10">
              <input
                autoFocus
                type="text"
                value={topicSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopicSearch(e.target.value)}
                placeholder="Search tags..."
                className="w-full border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-base text-slate-800 placeholder-slate-300 bg-transparent transition-colors mb-3"
              />
              <div className="flex flex-wrap gap-2 mb-2 max-h-36 overflow-y-auto pr-1">
                {filteredTopics.map(topic => {
                  const selected = form.speakingTopicsArray.includes(topic);
                  const atMax = !selected && form.speakingTopicsArray.length >= 5;
                  return (
                    <button
                      key={topic}
                      onClick={() => !atMax && toggleMulti('speakingTopicsArray', topic)}
                      className={`px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all
                        ${selected
                          ? 'border-rose-400 bg-rose-500 text-white'
                          : atMax
                            ? 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-rose-300'
                        }`}
                    >
                      {selected && <span className="mr-1">✓</span>}
                      {topic}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mb-5">{form.speakingTopicsArray.length}/5 tags selected</p>

              {/* Topic titles */}
              <p className="text-sm font-semibold text-slate-700 mb-2">
                Topic titles for your speaker profile
                <span className="ml-2 text-xs font-normal text-slate-400">(min 3, max 5)</span>
              </p>
              {form.speakingTopicTitles.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                  {form.speakingTopicTitles.map((t: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      <span className="w-5 h-5 rounded-full bg-rose-400 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="flex-1 text-sm text-slate-700">{t}</span>
                      <button onClick={() => removeTopicTitle(t)} className="text-slate-300 hover:text-rose-400 text-lg leading-none shrink-0">×</button>
                    </div>
                  ))}
                </div>
              )}
              {form.speakingTopicTitles.length < 5 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={topicTitleInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopicTitleInput(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') { e.preventDefault(); addTopicTitle(topicTitleInput); }
                    }}
                    placeholder="e.g. Building Unshakeable Confidence"
                    className="flex-1 border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-sm text-slate-800 placeholder-slate-300 bg-transparent transition-colors"
                  />
                  <button
                    onClick={() => addTopicTitle(topicTitleInput)}
                    disabled={!topicTitleInput.trim()}
                    className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                  >
                    + Add
                  </button>
                </div>
              )}
              {form.speakingTopicTitles.length < 3 && (
                <p className="text-xs text-amber-500 mt-1">{3 - form.speakingTopicTitles.length} more required</p>
              )}
            </div>
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!isValid(12)} /></div>
          </SlideWrap>
        )}

        {/* ── Q11 Professional goals ── */}
        {slide === 13 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={11} title="What are your professional goals for the next 1-3 years?" />
            <LongText
              value={form.professionalGoals}
              onChange={v => set('professionalGoals', v)}
              isRecording={recordingField === 'professionalGoals'}
              onToggleVoice={() => toggleRecording('professionalGoals', form.professionalGoals)}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q12 Audience ── */}
        {slide === 15 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={12} title="Please describe your audience." desc="Demographics, interests, preferences — who do you want to reach?" />
            <LongText
              value={form.audienceDescription}
              onChange={v => set('audienceDescription', v)}
              isRecording={recordingField === 'audienceDescription'}
              onToggleVoice={() => toggleRecording('audienceDescription', form.audienceDescription)}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q13 Dream podcasts ── */}
        {slide === 16 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={13} title="Do you have any dream podcasts you'd like to be a guest on?" desc="Add links to their websites or episodes. No links? That's totally fine — just skip." />
            <div className="ml-10">
              <div className="flex gap-2 mb-1">
                <input
                  autoFocus
                  type="url"
                  value={dreamLinkInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setDreamLinkInput(e.target.value); setDreamLinkError(''); }}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') { e.preventDefault(); addDreamLink(dreamLinkInput); }
                  }}
                  placeholder="https://example.com/podcast"
                  className="flex-1 border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-base text-slate-800 placeholder-slate-300 bg-transparent transition-colors"
                />
                <button
                  onClick={() => addDreamLink(dreamLinkInput)}
                  disabled={!dreamLinkInput.trim()}
                  className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  + Add
                </button>
              </div>
              {dreamLinkError && <p className="text-rose-500 text-xs mt-1 mb-2">{dreamLinkError}</p>}
              {form.dreamPodcastList.length > 0 ? (
                <ul className="space-y-2 mt-3 max-h-48 overflow-y-auto pr-1">
                  {form.dreamPodcastList.map((url: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                      <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-500 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-slate-600 hover:text-rose-500 truncate transition-colors">{url}</a>
                      <button onClick={() => removeDreamLink(url)} className="text-slate-300 hover:text-rose-400 text-lg leading-none shrink-0">×</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 italic mt-3">No links added yet — skip if you don't have any.</p>
              )}
            </div>
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q14 Preferred format ── */}
        {slide === 17 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={14} title="What podcast format do you prefer?" desc="Select all that apply." />
            <div className="ml-10 grid grid-cols-2 gap-3">
              {FORMAT_OPTIONS.map(opt => {
                const selected = form.preferredFormats.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    onClick={() => toggleFormat(opt.key)}
                    className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 font-medium transition-all
                      ${selected
                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50/40'
                      }`}
                  >
                    <span className="text-3xl">{opt.icon}</span>
                    <span className="text-sm font-semibold">{opt.label}</span>
                    {selected && <span className="text-xs text-rose-500 font-bold">✓ Selected</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-8 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q15 Open to in-person ── */}
        {slide === 18 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={15} title="Are you open to in-person podcast recordings?" />
            <SingleSelect
              options={YES_NO}
              value={form.openToInPerson}
              onChange={v => { set('openToInPerson', v); setTimeout(advance, 300); }}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!isValid(18)} /></div>
          </SlideWrap>
        )}

        {/* ── Q16 Products / services ── */}
        {slide === 19 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={16} title="What products, services or upcoming launches would you like to share on your recordings?" desc="Share links if applicable." />
            <LongText
              value={form.productsServices}
              onChange={v => set('productsServices', v)}
              isRecording={recordingField === 'productsServices'}
              onToggleVoice={() => toggleRecording('productsServices', form.productsServices)}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q17 Host questions ── */}
        {slide === 21 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={17} title="What are some key questions the host can ask you during the show?" desc="Give us 3 questions a host could ask you." />
            <div className="ml-10 space-y-4">
              {(['hostQuestion1', 'hostQuestion2', 'hostQuestion3'] as const).map((field, i) => (
                <div key={field}>
                  <p className="text-xs text-slate-400 mb-1">Question {i + 1}</p>
                  <input
                    autoFocus={i === 0}
                    type="text"
                    value={form[field]}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(field, e.target.value)}
                    placeholder={['What made you walk away from everything?', 'How do you define success now?', 'What do high performers never talk about?'][i]}
                    className="w-full border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-base text-slate-800 placeholder-slate-300 bg-transparent transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q18 Listener takeaways ── */}
        {slide === 22 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={18} title="What are 3 things listeners will walk away with after hearing your episode?" />
            <div className="ml-10 space-y-4">
              {([
                { field: 'takeaway1' as const, label: '1', placeholder: 'They will know how to…' },
                { field: 'takeaway2' as const, label: '2', placeholder: 'They will feel…' },
                { field: 'takeaway3' as const, label: '3', placeholder: 'They will take action on…' },
              ]).map(({ field, label, placeholder }) => (
                <div key={field}>
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-full bg-rose-100 text-rose-500 font-bold text-sm flex items-center justify-center shrink-0 mt-2">
                      {label}
                    </span>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={form[field]}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(field, e.target.value)}
                        placeholder={placeholder}
                        className="w-full border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-lg text-slate-800 placeholder-slate-300 bg-transparent transition-colors pr-14"
                        autoFocus={field === 'takeaway1'}
                      />
                      <MicButton
                        isRecording={recordingField === field}
                        onClick={() => toggleRecording(field, form[field])}
                      />
                    </div>
                  </div>
                  {recordingField === field && (
                    <span className="text-rose-500 font-medium animate-pulse text-xs ml-10 block">● Recording…</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-8 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q19 Unusual question ── */}
        {slide === 23 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={19} title="What's a question that NO ONE ASKS YOU that you wish they would?" />
            <LongText
              value={form.unusualQuestion}
              onChange={v => set('unusualQuestion', v)}
              rows={4}
              isRecording={recordingField === 'unusualQuestion'}
              onToggleVoice={() => toggleRecording('unusualQuestion', form.unusualQuestion)}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q20 Past episode links ── */}
        {slide === 25 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader
              n={20}
              title="Links to podcasts you've guested on in the past."
              desc="We'll make sure they're not on our outreach list. Add them one by one."
            />
            <div className="ml-10">
              <div className="flex gap-2 mb-4">
                <input
                  autoFocus
                  type="url"
                  value={linkInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkInput(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') { e.preventDefault(); addLink(linkInput); }
                  }}
                  placeholder="https://open.spotify.com/episode/… or https://podcasts.apple.com/…"
                  className="flex-1 border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-base text-slate-800 placeholder-slate-300 bg-transparent transition-colors"
                />
                <button
                  onClick={() => addLink(linkInput)}
                  disabled={!linkInput.trim()}
                  className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  + Add
                </button>
              </div>
              {linkError && <p className="text-rose-500 text-xs mt-1 mb-2">{linkError}</p>}
              {form.pastEpisodeList.length > 0 ? (
                <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {form.pastEpisodeList.map((url: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 group">
                      <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-500 text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-slate-600 hover:text-rose-500 truncate transition-colors"
                      >
                        {url}
                      </a>
                      <button
                        onClick={() => removeLink(url)}
                        className="text-slate-300 hover:text-rose-400 transition-colors shrink-0 text-lg leading-none"
                        title="Remove"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 italic">No links added yet — that's fine if this is your first time!</p>
              )}
            </div>
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── Q21 Community interest ── */}
        {slide === 26 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={21} title="Are you interested in being added to a community with other Badassery clients?" />
            <SingleSelect
              options={YES_NO_NEUTRAL}
              value={form.communityInterest}
              onChange={v => { set('communityInterest', v); setTimeout(advance, 300); }}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!isValid(26)} /></div>
          </SlideWrap>
        )}

        {/* ── Q22 OK to post ── */}
        {slide === 27 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={22} title="Are you open to us posting about your involvement with Badassery on social media?" />
            <SingleSelect
              options={YES_NO}
              value={form.okToPost}
              onChange={v => { set('okToPost', v); setTimeout(advance, 300); }}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!isValid(27)} /></div>
          </SlideWrap>
        )}

        {/* ── Q23 Legal restrictions ── */}
        {slide === 28 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader
              n={23}
              title="Anything we should know about executive approvals, legal guidelines, or things we can't say?"
              desc="If you're working for a company, we recommend you talk with your PR team, if applicable."
            />
            <LongText
              value={form.legalRestrictions}
              onChange={v => set('legalRestrictions', v)}
              rows={4}
              isRecording={recordingField === 'legalRestrictions'}
              onToggleVoice={() => toggleRecording('legalRestrictions', form.legalRestrictions)}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} /></div>
          </SlideWrap>
        )}

        {/* ── NEW Q24 Content Frequency ── */}
        {slide === 29 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={24} title="How often do you currently publish content?" desc="Social media posts, newsletters, videos, podcasts — anything counts." />
            <SingleSelect
              options={['Daily', 'Several times a week', 'Weekly', 'Monthly', 'Rarely / Never']}
              value={form.contentFrequency}
              onChange={v => { set('contentFrequency', v); setTimeout(advance, 300); }}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!form.contentFrequency} /></div>
          </SlideWrap>
        )}

        {/* ── NEW Q25 Representation Type ── */}
        {slide === 30 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={25} title="How would you describe your representation?" desc="This helps us position you correctly with podcast hosts." />
            <SingleSelect
              options={['Independent / Solo', 'Represented by an agent', 'Part of a company / team', 'Other']}
              value={form.representationType}
              onChange={v => { set('representationType', v); setTimeout(advance, 300); }}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!form.representationType} /></div>
          </SlideWrap>
        )}

        {/* ── Q26 Are you a published author? ── */}
        {slide === 31 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={26} title="Are you a published author?" desc="We'll showcase your books on your speaker profile — podcast hosts love authors!" />
            <SingleSelect
              options={YES_NO}
              value={form.isAuthor}
              onChange={v => { set('isAuthor', v); setTimeout(() => goTo(v === 'Yes' ? 32 : 33, 'up'), 300); }}
            />
            <div className="mt-6 ml-10"><OkButton onAdvance={advance} disabled={!form.isAuthor} /></div>
          </SlideWrap>
        )}

        {/* ── Q27 Books list ── */}
        {slide === 32 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={27} title="Add your books." desc="Include the Amazon or Goodreads link for each one." />
            <div className="ml-10">
              {form.books.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {form.books.map((b: { title: string; link: string }, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      <span className="text-lg shrink-0">📚</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{b.title}</p>
                        {b.link && <a href={b.link} target="_blank" rel="noopener noreferrer" className="text-xs text-rose-500 hover:underline truncate block">{b.link}</a>}
                      </div>
                      <button onClick={() => removeBook(i)} className="text-slate-300 hover:text-rose-400 text-lg leading-none shrink-0">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={bookTitleInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBookTitleInput(e.target.value)}
                  placeholder="Book title"
                  className="w-full border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-base text-slate-800 placeholder-slate-300 bg-transparent transition-colors"
                />
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={bookLinkInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setBookLinkInput(e.target.value); setBookLinkError(''); }}
                    placeholder="https://amazon.com/dp/… or https://goodreads.com/…"
                    className="flex-1 border-0 border-b-2 border-slate-300 focus:border-rose-400 outline-none py-2 text-sm text-slate-800 placeholder-slate-300 bg-transparent transition-colors"
                  />
                  <button
                    onClick={() => addBook(bookTitleInput, bookLinkInput)}
                    disabled={!bookTitleInput.trim()}
                    className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                  >
                    + Add
                  </button>
                </div>
                {bookLinkError && <p className="text-rose-500 text-xs">{bookLinkError}</p>}
              </div>
            </div>
            <div className="mt-8 ml-10">
              <OkButton onAdvance={advance} disabled={form.books.length === 0} />
            </div>
          </SlideWrap>
        )}

        {/* ── Q28 Anything else — SUBMIT ── */}
        {slide === 33 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <QHeader n={28} title="Is there anything else you'd like to share with us before we say goodbye?" />
            <LongText
              value={form.anythingElse}
              onChange={v => set('anythingElse', v)}
              rows={5}
              isRecording={recordingField === 'anythingElse'}
              onToggleVoice={() => toggleRecording('anythingElse', form.anythingElse)}
            />
            <div className="mt-6 ml-10">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? <><Loader2 size={20} className="animate-spin" /> Saving…</> : 'Submit →'}
              </button>
            </div>
          </SlideWrap>
        )}

        {/* ── FINAL ── */}
        {slide === TOTAL_Q + 1 && (
          <SlideWrap animating={animating} animDir={animDir}>
            <div className="text-center">
              <div className="text-6xl mb-6">🎉</div>
              <h1 className="text-4xl font-bold text-slate-900 mb-4">
                Thanks{firstName ? `, ${firstName}` : ''}!
              </h1>
              <p className="text-slate-500 text-xl leading-relaxed">
                We'll review your responses and get back to you soon with next steps.
                <br />
                In the meantime, do a lil' happy dance!
              </p>
              <p className="text-slate-300 text-sm mt-8">Redirecting you in a moment…</p>
            </div>
          </SlideWrap>
        )}

      </div>
    </div>
  );
};
