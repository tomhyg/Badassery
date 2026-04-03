import React, { useState, useEffect } from 'react';
import { X, Copy, Send, Loader2, CheckCircle, AlertCircle, Mail } from 'lucide-react';
import { getAIConfig } from '../services/aiConfigService';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Client } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  client: Client;
  podcastName: string;
  podcastDescription?: string;
  podcastUrl?: string;
  hostName?: string;
  recordingDateStr: string;
  onClose: () => void;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrepPrompt(props: Props): string {
  const { client, podcastName, podcastDescription, podcastUrl, hostName, recordingDateStr } = props;

  const firstName = client.identity?.firstName || client.contact_name?.split(' ')[0] || 'the client';
  const lastName  = client.identity?.lastName  || '';
  const fullName  = `${firstName} ${lastName}`.trim();

  const bio = client.content?.bioUpdated || client.content?.bioOriginal || '';
  const topics = client.content?.speakingTopicsArray?.join(', ')
    || client.spokesperson?.topics?.join(', ')
    || '';
  const goals = [
    client.goals?.professionalGoals,
    client.goals?.top3Goals,
  ].filter(Boolean).join(' | ');
  const audience   = client.podcast?.audienceDescription || '';
  const brand      = [
    client.brandPersonality?.threeAdjectives,
    client.brandPersonality?.keyPhrases,
  ].filter(Boolean).join(' | ');
  const keyQs      = client.podcast?.keyQuestions || '';
  const unaskedQ   = client.podcast?.unaskedQuestion || '';
  const takeaways  = client.podcast?.listenerTakeaways || '';
  const pastEps    = (client.pastEpisodes || [])
    .map(ep => {
      const link = ep.appleUrl || ep.spotifyUrl || ep.youtubeUrl || '';
      return `${ep.showName || ep.title || ''}${link ? ' (' + link + ')' : ''}`;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');

  return `You are Ruth from Badassery, a premium podcast booking agency.
Write a PREP EMAIL to send to the CLIENT to prepare them for their upcoming podcast recording.

=== PODCAST ===
- Name: ${podcastName}
- Host: ${hostName || 'the host'}
- Recording Date: ${recordingDateStr}
- Description: ${(podcastDescription || 'N/A').substring(0, 600)}
- Link: ${podcastUrl || 'N/A'}

=== CLIENT ===
- Name: ${fullName}
- Bio: ${bio.substring(0, 600) || 'N/A'}
- Speaking Topics: ${topics || 'N/A'}
- Goals: ${goals || 'N/A'}
- Target Audience: ${audience || 'N/A'}
- Brand Personality: ${brand || 'N/A'}
- Key Questions they answer well: ${keyQs || 'N/A'}
- The question no one asks them: ${unaskedQ || 'N/A'}
- What listeners should take away: ${takeaways || 'N/A'}
- Past podcast appearances: ${pastEps || 'N/A'}

=== INSTRUCTIONS ===
1. Address ${firstName} by first name
2. Confirm the recording date/time clearly
3. Give a brief overview of the show: description, host style, typical audience
4. Suggest listening to 1–2 recent episodes before recording
5. Include the podcast link if available
6. List 3 tailored talking points for THIS specific show (based on the podcast audience and the client's expertise)
7. Remind them of their unique angle / what makes them stand out
8. Short logistics reminder: quiet space, good mic/headset, water nearby, show up 5 min early
9. Close warmly, offer to answer last-minute questions
10. Sign off: "Best, Ruth"

RULES:
- Write ONLY the email body (no subject line)
- Do NOT use [brackets] or placeholders — use the actual names and info provided
- Be warm, professional, and concise
- Max ~300 words

Write the prep email now:`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PrepEmailModal: React.FC<Props> = (props) => {
  const { client, podcastName, recordingDateStr, onClose } = props;

  const [emailBody, setEmailBody]   = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(false);
  const [sendError, setSendError]   = useState<string | null>(null);

  // Auto-generate on open
  useEffect(() => {
    generate();
  }, []);

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    setEmailBody('');
    try {
      const { geminiApiKey } = getAIConfig();
      if (!geminiApiKey) throw new Error('Gemini API key not configured');

      const prompt = buildPrepPrompt(props);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
      const data = await res.json();
      setEmailBody(data.candidates[0].content.parts[0].text.trim());
    } catch (err: any) {
      setGenError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(emailBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToRuth = async () => {
    setSending(true);
    setSendError(null);
    try {
      const fns = getFunctions(undefined, 'us-central1');
      const sendFn = httpsCallable<{ to: string; subject: string; body: string; testMode: boolean; fromName: string }, any>(
        fns, 'sendEmail'
      );
      const clientName = `${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`.trim() || 'Client';
      const subject = `[PREP] ${clientName} on ${podcastName} – ${recordingDateStr}`;
      await sendFn({
        to: 'tom@badassery-hq.com',
        subject,
        body: emailBody,
        testMode: false,
        fromName: 'Badassery Platform',
      });
      setSent(true);
    } catch (err: any) {
      setSendError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Mail size={18} className="text-indigo-600" />
              ✉️ Prep Email
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {podcastName} · {recordingDateStr}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {generating ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={32} className="animate-spin text-indigo-500" />
              <p className="text-sm text-slate-500">Generating prep email with Gemini…</p>
            </div>
          ) : genError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <AlertCircle size={32} className="text-red-400" />
              <p className="text-sm text-red-600">{genError}</p>
              <button
                onClick={generate}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
              >
                Retry
              </button>
            </div>
          ) : (
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="w-full h-80 p-4 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none font-sans leading-relaxed"
              placeholder="Email will appear here…"
            />
          )}

          {sendError && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {sendError}
            </p>
          )}
          {sent && (
            <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
              <CheckCircle size={12} /> Sent to Ruth!
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!emailBody || generating}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              {copied ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleSendToRuth}
              disabled={!emailBody || generating || sending || sent}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
            >
              {sending ? (
                <><Loader2 size={14} className="animate-spin" /> Sending…</>
              ) : sent ? (
                <><CheckCircle size={14} /> Sent to Ruth</>
              ) : (
                <><Send size={14} /> Send to Ruth</>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
