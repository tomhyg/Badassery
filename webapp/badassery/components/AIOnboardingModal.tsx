import React, { useState, useRef, useCallback } from 'react';
import {
  X, Upload, FileText, Loader2, CheckCircle, AlertCircle,
  ChevronRight, Sparkles, Save, RotateCcw,
} from 'lucide-react';
import { getAIConfig } from '../services/aiConfigService';
import { updateClient } from '../services/clientService';
import { Client } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
}

interface ExtractedData {
  firstName:      string;
  lastName:       string;
  jobTitle:       string;
  company:        string;
  bio:            string;
  topics:         [string, string, string, string, string];
  linkedin:       string;
  website:        string;
  instagram:      string;
  twitter:        string;
  substack:       string;
  headshotUrl:    string;
  targetAudience: string;
}

type Step = 'upload' | 'results' | 'saved';

// ── Prompt ───────────────────────────────────────────────────────────────────

const GEMINI_PROMPT = `You are an expert onboarding assistant for Badassery, a podcast booking agency.

You will receive TWO documents:
1. A Typeform onboarding form filled by the client
2. A transcript of a 1-hour onboarding call between Ruth (Badassery) and the client

TYPEFORM STRUCTURE (what to look for):
- Q1–Q7: First name, Last name, Email, Phone, Job title, Company, Company size
- Q8: Personal Brand Assessment — goals, platforms used, Likert-scale questions, challenges
- Q9: Grounding & Identity — why now, 1–3 year goals, mission statement, LinkedIn URL, other links (website, Substack, etc.)
- Q10: Podcast Pitching — target audience description, products/services, dream podcasts, preferred locations, open to in-person
- Q11: Story Assets — headshot URL (if provided), bio (200–400 words), 3–5 speaking topics, key questions they can answer, 3 listener takeaways, the question no one asks them, past podcast appearances, audience reach by channel
- Q12: Our Collaboration — community interest, social media consent, legal guidelines, additional notes

TRANSCRIPT STRUCTURE (what to extract):
- This is a ~1 hour conversation between Ruth and the client
- Extract: key themes and recurring ideas, memorable anecdotes and stories, differentiating angles (what makes this person unique), the client's natural tone and voice, any specific examples or numbers they mention, passion topics that came through strongly

YOUR TASK:
1. Extract all identity fields (name, job title, company) from the Typeform
2. Rewrite the bio: combine the Typeform bio with insights from the transcript to create a compelling, narrative-driven bio of 200–400 words. Lead with impact, use storytelling, avoid corporate jargon. Write in third person.
3. Identify and refine exactly 5 speaking topics. These should be specific, compelling, and podcast-ready (not generic). Use the Typeform topics as base, enhance them with themes from the transcript.
4. Extract all social/web links found in either document
5. Summarize the target audience in 1–2 sentences based on Typeform Q10 and transcript context
6. Extract headshot URL if present in the Typeform (Q11)

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation, no preamble):
{
  "firstName": "string",
  "lastName": "string",
  "jobTitle": "string",
  "company": "string",
  "bio": "string (200-400 words, third person, narrative-driven)",
  "topics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"],
  "linkedin": "full URL or empty string",
  "website": "full URL or empty string",
  "instagram": "full URL or empty string",
  "twitter": "full URL or empty string",
  "substack": "full URL or empty string",
  "headshotUrl": "URL or empty string",
  "targetAudience": "1-2 sentence description of ideal audience"
}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function readPdfAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1]; // strip data:application/pdf;base64,
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function emptyData(): ExtractedData {
  return {
    firstName: '', lastName: '', jobTitle: '', company: '',
    bio: '',
    topics: ['', '', '', '', ''],
    linkedin: '', website: '', instagram: '', twitter: '', substack: '',
    headshotUrl: '', targetAudience: '',
  };
}

// ── Drag-and-drop zone ────────────────────────────────────────────────────────

interface DropZoneProps {
  label:       string;
  description: string;
  file:        File | null;
  onFile:      (f: File) => void;
  disabled?:   boolean;
}

const DropZone: React.FC<DropZoneProps> = ({ label, description, file, onFile, disabled }) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') onFile(f);
  }, [onFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${dragging ? 'border-indigo-400 bg-indigo-50' : file ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40'}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${file ? 'bg-green-100' : 'bg-slate-200'}`}>
          {file ? <CheckCircle size={24} className="text-green-600" /> : <FileText size={24} className="text-slate-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          {file && (
            <p className="text-xs text-green-700 font-medium mt-1 truncate">
              ✓ {file.name}
            </p>
          )}
          {!file && (
            <p className="text-xs text-slate-400 mt-1">Drop PDF here or click to browse</p>
          )}
        </div>
        {!file && <Upload size={18} className="text-slate-400 flex-shrink-0" />}
      </div>
    </div>
  );
};

// ── Main Modal ────────────────────────────────────────────────────────────────

export const AIOnboardingModal: React.FC<Props> = ({ clientId, client, onClose, onSaved }) => {
  const [step, setStep]               = useState<Step>('upload');
  const [typeformPdf, setTypeformPdf] = useState<File | null>(null);
  const [transcriptPdf, setTranscriptPdf] = useState<File | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [data, setData]               = useState<ExtractedData>(emptyData());

  const clientName = client
    ? `${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`.trim() || client.contact_name || 'this client'
    : 'this client';

  // ── Gemini call ────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!typeformPdf || !transcriptPdf) return;
    setLoading(true);
    setError(null);

    try {
      const [typeformB64, transcriptB64] = await Promise.all([
        readPdfAsBase64(typeformPdf),
        readPdfAsBase64(transcriptPdf),
      ]);

      const config = getAIConfig();
      const apiKey = config.geminiApiKey;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: typeformB64 } },
              { inline_data: { mime_type: 'application/pdf', data: transcriptB64 } },
              { text: GEMINI_PROMPT },
            ],
          }],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `API error ${response.status}`);
      }

      const result = await response.json();
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      // Strip possible markdown code fences
      const jsonText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed: ExtractedData = JSON.parse(jsonText);

      // Ensure topics is always length 5
      const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
      while (topics.length < 5) topics.push('');
      parsed.topics = topics.slice(0, 5) as ExtractedData['topics'];

      setData(parsed);
      setStep('results');
    } catch (e: any) {
      setError(e.message || 'Failed to call Gemini API');
    } finally {
      setLoading(false);
    }
  };

  // ── Save to Firestore ──────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updates: Partial<Client> = {
        identity: {
          ...(client?.identity ?? {
            email: '', phone: '', representationType: '',
          }),
          firstName:  data.firstName,
          lastName:   data.lastName,
          jobTitle:   data.jobTitle,
          company:    data.company,
        },
        content: {
          ...(client?.content ?? {}),
          bioUpdated:          data.bio,
          speakingTopicsArray: data.topics.filter(Boolean),
        },
        links: {
          ...(client?.links ?? { linkedinAndSocial: '' }),
          linkedinAndSocial: data.linkedin,
          website:           data.website   || undefined,
          instagram:         data.instagram || undefined,
          twitter:           data.twitter   || undefined,
          substack:          data.substack  || undefined,
          headshot:          data.headshotUrl || client?.links?.headshot,
        },
        spokesperson: {
          ...(client?.spokesperson ?? { name: '', title: '' }),
          name:           `${data.firstName} ${data.lastName}`.trim(),
          title:          data.jobTitle,
          targetAudience: data.targetAudience,
        },
      };

      await updateClient(clientId, updates);
      setStep('saved');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1800);
    } catch (e: any) {
      setError(e.message || 'Failed to save to Firestore');
    } finally {
      setSaving(false);
    }
  };

  // ── Topic field helper ─────────────────────────────────────────────────────

  const setTopic = (i: number, val: string) => {
    const next = [...data.topics] as ExtractedData['topics'];
    next[i] = val;
    setData({ ...data, topics: next });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">AI Onboarding</h2>
              <p className="text-xs text-slate-400">{clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50">
          {(['upload', 'results', 'saved'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-indigo-600' : (
                (i === 1 && step === 'saved') || (i === 0 && step !== 'upload') ? 'text-green-600' : 'text-slate-400'
              )}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s ? 'bg-indigo-600 text-white' :
                  (i === 1 && step === 'saved') || (i === 0 && step !== 'upload') ? 'bg-green-500 text-white' :
                  'bg-slate-200 text-slate-500'
                }`}>
                  {(i === 0 && step !== 'upload') || (i === 1 && step === 'saved') ? '✓' : i + 1}
                </div>
                {s === 'upload' ? 'Upload PDFs' : s === 'results' ? 'Review & Edit' : 'Saved'}
              </div>
              {i < 2 && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Upload the two onboarding documents</h3>
                <p className="text-sm text-slate-500">Gemini will read both PDFs and generate bio, topics, and links automatically.</p>
              </div>

              <DropZone
                label="Typeform Onboarding"
                description="Export the client's completed Typeform as PDF"
                file={typeformPdf}
                onFile={setTypeformPdf}
                disabled={loading}
              />
              <DropZone
                label="TL;DV Transcript"
                description="Export the 1h call transcript from TL;DV as PDF"
                file={transcriptPdf}
                onFile={setTranscriptPdf}
                disabled={loading}
              />

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center gap-3 py-6 text-slate-500">
                  <Loader2 size={32} className="animate-spin text-indigo-500" />
                  <div className="text-center">
                    <p className="font-medium text-slate-700">Gemini is reading both documents…</p>
                    <p className="text-sm text-slate-400 mt-1">This usually takes 15–30 seconds</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Results ── */}
          {step === 'results' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Review and edit the extracted data</h3>
                <button
                  onClick={() => { setStep('upload'); setData(emptyData()); }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  <RotateCcw size={12} /> Start over
                </button>
              </div>

              {/* Identity */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Identity</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">First Name</label>
                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={data.firstName} onChange={e => setData({...data, firstName: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Last Name</label>
                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={data.lastName} onChange={e => setData({...data, lastName: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Job Title</label>
                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={data.jobTitle} onChange={e => setData({...data, jobTitle: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Company</label>
                    <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={data.company} onChange={e => setData({...data, company: e.target.value})} />
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Bio (200–400 words)</p>
                <textarea
                  rows={8}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={data.bio}
                  onChange={e => setData({...data, bio: e.target.value})}
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{data.bio.split(/\s+/).filter(Boolean).length} words</p>
              </div>

              {/* Topics */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Speaking Topics (5)</p>
                <div className="space-y-2">
                  {data.topics.map((t, i) => (
                    <input
                      key={i}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      value={t}
                      placeholder={`Topic ${i + 1}`}
                      onChange={e => setTopic(i, e.target.value)}
                    />
                  ))}
                </div>
              </div>

              {/* Links */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Links</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'LinkedIn',   field: 'linkedin'  },
                    { label: 'Website',    field: 'website'   },
                    { label: 'Instagram',  field: 'instagram' },
                    { label: 'Twitter / X', field: 'twitter'  },
                    { label: 'Substack',   field: 'substack'  },
                    { label: 'Headshot URL', field: 'headshotUrl' },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <label className="block text-xs text-slate-500 mb-1">{label}</label>
                      <input
                        type="url"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        value={(data as any)[field]}
                        onChange={e => setData({...data, [field]: e.target.value})}
                        placeholder="https://..."
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Target Audience</p>
                <textarea
                  rows={2}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={data.targetAudience}
                  onChange={e => setData({...data, targetAudience: e.target.value})}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Saved ── */}
          {step === 'saved' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-1">Profile updated!</h3>
              <p className="text-sm text-slate-500">
                Bio, topics, and links have been saved to {clientName}'s profile.
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        {step !== 'saved' && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
              Cancel
            </button>

            {step === 'upload' && (
              <button
                onClick={handleGenerate}
                disabled={!typeformPdf || !transcriptPdf || loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? 'Generating…' : 'Generate with Gemini'}
              </button>
            )}

            {step === 'results' && (
              <button
                onClick={handleSave}
                disabled={saving || !data.firstName || !data.bio}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Saving…' : 'Save to Client Profile'}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
