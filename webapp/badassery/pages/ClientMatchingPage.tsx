import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Client } from '../types';
import {
  ArrowLeft, Search, Plus, X, Loader2, RefreshCw,
  Star, Filter, ChevronDown, ChevronRight, CheckCircle2, Tag, Info
} from 'lucide-react';
import { BrooklynDetailModal } from '../components/BrooklynDetailModal';
import { PodcastDocument, getAllPodcastsCachedFiltered } from '../services/podcastService';
import { idbGet, idbSet } from '../services/indexedDBCache';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WishlistItem {
  podcastId: string;
  title: string;
  imageUrl?: string;
  category?: string;
  matchScore: number;
  addedAt: string;
}

type ScoredPodcast = PodcastDocument & { matchScore: number };

interface Props {
  clientId: string;
  onBack: () => void;
}

interface DimDetail {
  score: number;
  weight: number;
  label: string;
  hits: string[];
  misses: string[];
  signals: { label: string; ok: boolean }[];
}

interface MatchDetail {
  total: number;
  bonus: number;
  excluded: boolean;
  exclusionReason?: string;
  dims: DimDetail[];
}

const CORAL = '#e8463a';
const PAGE_SIZE = 300;
const BATCH_SIZE = 1000;
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','through','how','why','what','when','who',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','can','its','your','my',
  'our','their','this','that','these','those','i','you','he','she','we','they',
]);

function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return String(text).toLowerCase()
    .split(/[\s,;|/\-–—]+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function fuzzyTopicHit(clientToken: string, podTokens: string[]): boolean {
  return podTokens.some(pt => pt.includes(clientToken) || clientToken.includes(pt));
}

// ── computeMatch (fast, bulk scoring) ────────────────────────────────────────

function computeMatch(podcast: PodcastDocument, client: Client): number {
  const c = client as any;
  const primaryCat = (c.matching?.primaryCategory || '').toLowerCase().trim();
  const secondaryCats: string[] = (c.matching?.secondaryCategories || []).map((s: string) => s.toLowerCase().trim());
  const topicsPhase2: string[] = (client.content?.speakingTopicsArray || []).map((t: string) => t.toLowerCase());
  const topicsPhase1: string[] = (c.content?.suggestedTopics || []).map((t: string) => t.toLowerCase());
  const topicsStrong = [...new Set([...topicsPhase2, ...topicsPhase1])];
  const titleTokensAI: string[] = (c.content?.aiTopicTitles || []).flatMap((t: string) => tokenize(t));
  const titleTokensValid: string[] = (c.content?.speakingTopicTitles || []).flatMap((t: string) => tokenize(t));
  const passionTokens: string[] = tokenize(c.brandPersonality?.passionTopics || '');
  const legalTokens: string[] = tokenize(client.preferences?.legalGuidelines || c.preferences?.legalRestrictions || '');
  const targetLocations: string[] = c.podcast?.targetLocations || (c.podcast?.targetLocation ? [c.podcast.targetLocation] : []);
  const usOnly = targetLocations.length > 0 && targetLocations.every((l: string) => l === 'U.S.');
  const europeOnly = targetLocations.length > 0 && targetLocations.every((l: string) => l === 'Europe');
  const isAuthor: boolean = c.isAuthor === true;
  const dreamList: string[] = (c.podcast?.dreamPodcastList || []).map((s: string) => s.toLowerCase().trim());
  const dreamText: string = (c.podcast?.dreamPodcasts || '').toLowerCase();
  const experience: string = (c.selfAssessment?.podcastExperience || '').toLowerCase();

  const podPrimaryCat = (podcast.ai_primary_category || '').toLowerCase().trim();
  const podSecondaryCats: string[] = (podcast.ai_secondary_categories || []).map((s: string) => s.toLowerCase().trim());
  const podAllCats = [podPrimaryCat, ...podSecondaryCats].filter(Boolean);
  const podTopics: string[] = (podcast.ai_topics || []).map((t: string) => t.toLowerCase());
  const podTopicTokens: string[] = podTopics.flatMap(t => tokenize(t));
  const podSummaryTokens: string[] = tokenize(podcast.ai_summary || '');
  const podStyle = (podcast.ai_podcast_style || '').toLowerCase();
  const podLang = (podcast.language || '').toLowerCase();
  const podGuestInds: string[] = (podcast.gemini_guest_industries || []).map((s: string) => s.toLowerCase());
  const podGuestAuth = (podcast.gemini_guest_authority || '').toLowerCase();
  const podGuestTypes: string[] = ((podcast as any).gemini_guest_types || []).map((s: string) => s.toLowerCase());
  const podGuestRatio: number = (podcast as any).gemini_guest_ratio ?? -1;

  if (legalTokens.length > 0) {
    const podAll = [...podAllCats.flatMap(cat => tokenize(cat)), ...podTopicTokens];
    if (legalTokens.some(lt => podAll.includes(lt))) return 0;
  }

  // D1 — score proportionnel : primary = 2 pts, chaque secondary = 1 pt
  const d1Weighted = [
    { cat: primaryCat, w: 2 },
    ...secondaryCats.map(s => ({ cat: s, w: 1 })),
  ].filter(({ cat }) => cat);
  const d1MaxPts = d1Weighted.reduce((s, { w }) => s + w, 0);
  const d1GotPts = d1Weighted.filter(({ cat }) => podAllCats.includes(cat)).reduce((s, { w }) => s + w, 0);
  const d1 = d1MaxPts > 0 ? Math.round((d1GotPts / d1MaxPts) * 100) : 0;

  let d2 = 0;
  d2 += Math.min(topicsStrong.filter(ct => fuzzyTopicHit(ct, podTopics)).length * 15, 60);
  const weakTokens = [...new Set([...titleTokensAI, ...titleTokensValid, ...passionTokens])];
  d2 += Math.min(weakTokens.filter(wt => fuzzyTopicHit(wt, [...podTopics, ...podTopicTokens])).length * 8, 24);
  d2 = Math.min(d2 + (topicsStrong.some(ct => podSummaryTokens.some(st => st.includes(ct) || ct.includes(st))) ? 10 : 0), 100);

  const jobTokens = tokenize(`${c.identity?.jobTitle || ''} ${c.identity?.company || ''}`);
  let d3 = 0;
  if (podStyle.includes('interview')) d3 += 25;
  if (podGuestRatio >= 0.7) d3 += 20; else if (podGuestRatio >= 0.4) d3 += 10;
  if ((podcast as any).score_guest_compatibility >= 7) d3 += 5;
  if (isAuthor) {
    if (podGuestTypes.some((g: string) => g.includes('author') || g.includes('book'))) d3 += 15;
    if (podPrimaryCat.includes('book') || podPrimaryCat.includes('literat')) d3 += 15;
  }
  if (experience.includes('experienc') || experience.includes('veteran')) {
    if (podGuestAuth.includes('high') || podGuestAuth.includes('expert')) d3 += 10;
  }
  if (jobTokens.some(jt => podGuestInds.some(gi => gi.includes(jt) || jt.includes(gi)))) d3 += 10;
  d3 = Math.min(d3, 100);

  let d4 = 50;
  const isEnglish = ['en', 'en-us', 'en-gb', 'english'].some(e => podLang.startsWith(e));
  const isFrench = podLang.startsWith('fr');
  const isGerman = podLang.startsWith('de');
  const isEuropean = isFrench || isGerman || ['es','it','pt','nl','pl'].some(e => podLang.startsWith(e));
  if (usOnly && !isEnglish) d4 = 0;
  else if (europeOnly && isEnglish && !isEuropean) d4 -= 20;
  else {
    const audienceTokens = tokenize(c.podcast?.audienceDescription || '');
    const podAudienceTokens = tokenize(podcast.ai_target_audience || '');
    d4 += Math.min(audienceTokens.filter(at => podAudienceTokens.some(pa => pa.includes(at) || at.includes(pa))).length * 10, 40);
    if (jobTokens.some(jt => podGuestInds.some(gi => gi.includes(jt) || jt.includes(gi)))) d4 += 15;
    if (jobTokens.some(jt => tokenize(podcast.ai_target_audience || '').some(pa => pa.includes(jt)))) d4 += 10;
  }
  d4 = Math.min(Math.max(d4, 0), 100);

  const d5 = Math.min(podcast.ai_badassery_score ?? 0, 100);

  const raw = 0.30 * d1 + 0.25 * d2 + 0.20 * d3 + 0.15 * d4 + 0.10 * d5;
  const podTitle = (podcast.title || '').toLowerCase();
  let bonus = 0;
  if (dreamList.some(d => podTitle.includes(d) || d.includes(podTitle))) bonus = 20;
  else if (dreamText && podTitle && dreamText.includes(podTitle)) bonus = 10;

  return Math.min(100, Math.round(raw + bonus));
}

// ── computeMatchDetail (on-demand, detailed breakdown) ───────────────────────

function computeMatchDetail(podcast: PodcastDocument, client: Client): MatchDetail {
  const c = client as any;

  const primaryCat = (c.matching?.primaryCategory || '').toLowerCase().trim();
  const secondaryCats: string[] = (c.matching?.secondaryCategories || []).map((s: string) => s.toLowerCase().trim());
  const topicsPhase2: string[] = (client.content?.speakingTopicsArray || []).map((t: string) => t.toLowerCase());
  const topicsPhase1: string[] = (c.content?.suggestedTopics || []).map((t: string) => t.toLowerCase());
  const topicsStrong = [...new Set([...topicsPhase2, ...topicsPhase1])];
  const titleTokensAI: string[] = (c.content?.aiTopicTitles || []).flatMap((t: string) => tokenize(t));
  const titleTokensValid: string[] = (c.content?.speakingTopicTitles || []).flatMap((t: string) => tokenize(t));
  const passionTokens: string[] = tokenize(c.brandPersonality?.passionTopics || '');
  const legalTokens: string[] = tokenize(client.preferences?.legalGuidelines || c.preferences?.legalRestrictions || '');
  const targetLocations: string[] = c.podcast?.targetLocations || (c.podcast?.targetLocation ? [c.podcast.targetLocation] : []);
  const usOnly = targetLocations.length > 0 && targetLocations.every((l: string) => l === 'U.S.');
  const europeOnly = targetLocations.length > 0 && targetLocations.every((l: string) => l === 'Europe');
  const isAuthor: boolean = c.isAuthor === true;
  const dreamList: string[] = (c.podcast?.dreamPodcastList || []).map((s: string) => s.toLowerCase().trim());
  const dreamText: string = (c.podcast?.dreamPodcasts || '').toLowerCase();
  const experience: string = (c.selfAssessment?.podcastExperience || '').toLowerCase();
  const jobTokens = tokenize(`${c.identity?.jobTitle || ''} ${c.identity?.company || ''}`);

  const podPrimaryCat = (podcast.ai_primary_category || '').toLowerCase().trim();
  const podSecondaryCats: string[] = (podcast.ai_secondary_categories || []).map((s: string) => s.toLowerCase().trim());
  const podAllCats = [podPrimaryCat, ...podSecondaryCats].filter(Boolean);
  const podTopics: string[] = (podcast.ai_topics || []).map((t: string) => t.toLowerCase());
  const podTopicTokens: string[] = podTopics.flatMap(t => tokenize(t));
  const podSummaryTokens: string[] = tokenize(podcast.ai_summary || '');
  const podStyle = (podcast.ai_podcast_style || '').toLowerCase();
  const podLang = (podcast.language || '').toLowerCase();
  const podGuestInds: string[] = (podcast.gemini_guest_industries || []).map((s: string) => s.toLowerCase());
  const podGuestAuth = (podcast.gemini_guest_authority || '').toLowerCase();
  const podGuestTypes: string[] = ((podcast as any).gemini_guest_types || []).map((s: string) => s.toLowerCase());
  const podGuestRatio: number = (podcast as any).gemini_guest_ratio ?? -1;

  // Exclusion gate
  if (legalTokens.length > 0) {
    const podAll = [...podAllCats.flatMap(cat => tokenize(cat)), ...podTopicTokens];
    const blocked = legalTokens.find(lt => podAll.includes(lt));
    if (blocked) return { total: 0, bonus: 0, excluded: true, exclusionReason: blocked, dims: [] };
  }

  // D1 — Catégorie : primary = 2 pts, chaque secondary = 1 pt
  const d1Entries = [
    { cat: primaryCat, w: 2, label: `★ ${primaryCat} (primary)` },
    ...secondaryCats.map(s => ({ cat: s, w: 1, label: s })),
  ].filter(({ cat }) => cat);
  const d1MaxPts = d1Entries.reduce((s, { w }) => s + w, 0);
  const d1GotPts = d1Entries.filter(({ cat }) => podAllCats.includes(cat)).reduce((s, { w }) => s + w, 0);
  const d1 = d1MaxPts > 0 ? Math.round((d1GotPts / d1MaxPts) * 100) : 0;
  const d1Hits = d1Entries.filter(({ cat }) => podAllCats.includes(cat)).map(({ label }) => label);
  const d1Misses = d1Entries.filter(({ cat }) => !podAllCats.includes(cat)).map(({ label }) => label);

  // D2 — Topics (25%)
  let d2 = 0;
  const d2Hits: string[] = [];
  const d2Misses: string[] = [];
  topicsStrong.forEach(ct => {
    if (fuzzyTopicHit(ct, podTopics)) { d2Hits.push(ct); }
    else { d2Misses.push(ct); }
  });
  d2 += Math.min(d2Hits.length * 15, 60);
  const weakTokens = [...new Set([...titleTokensAI, ...titleTokensValid, ...passionTokens])];
  const weakHits = weakTokens.filter(wt => fuzzyTopicHit(wt, [...podTopics, ...podTopicTokens]));
  d2 += Math.min(weakHits.length * 8, 24);
  const summaryHit = topicsStrong.some(ct => podSummaryTokens.some(st => st.includes(ct) || ct.includes(st)));
  if (summaryHit) d2 += 10;
  d2 = Math.min(d2, 100);

  // D3 — Guest Fit (20%)
  let d3 = 0;
  const d3Signals: { label: string; ok: boolean }[] = [
    { label: `Interview style (${podcast.ai_podcast_style || 'unknown'})`, ok: podStyle.includes('interview') },
    { label: `Guest ratio ${podGuestRatio >= 0 ? Math.round(podGuestRatio * 100) + '%' : 'unknown'}`, ok: podGuestRatio >= 0.4 },
    { label: `Guest compat. score ≥7`, ok: (podcast as any).score_guest_compatibility >= 7 },
  ];
  if (podStyle.includes('interview')) d3 += 25;
  if (podGuestRatio >= 0.7) d3 += 20; else if (podGuestRatio >= 0.4) d3 += 10;
  if ((podcast as any).score_guest_compatibility >= 7) d3 += 5;
  if (isAuthor) {
    const authHit = podGuestTypes.some((g: string) => g.includes('author') || g.includes('book'));
    d3Signals.push({ label: `Author-friendly guest types`, ok: authHit });
    if (authHit) d3 += 15;
    const bookCat = podPrimaryCat.includes('book') || podPrimaryCat.includes('literat');
    d3Signals.push({ label: `Books/literature category`, ok: bookCat });
    if (bookCat) d3 += 15;
  }
  if (experience.includes('experienc') || experience.includes('veteran')) {
    const expHit = podGuestAuth.includes('high') || podGuestAuth.includes('expert');
    d3Signals.push({ label: `High authority guests (${podGuestAuth || 'unknown'})`, ok: expHit });
    if (expHit) d3 += 10;
  }
  const jobIndMatch = jobTokens.some(jt => podGuestInds.some(gi => gi.includes(jt) || jt.includes(gi)));
  d3Signals.push({ label: `Industry match (${c.identity?.jobTitle || '?'})`, ok: jobIndMatch });
  if (jobIndMatch) d3 += 10;
  d3 = Math.min(d3, 100);

  // D4 — Audience (15%)
  let d4 = 50;
  const isEnglish = ['en', 'en-us', 'en-gb', 'english'].some(e => podLang.startsWith(e));
  const isFrench = podLang.startsWith('fr');
  const isGerman = podLang.startsWith('de');
  const isEuropean = isFrench || isGerman || ['es','it','pt','nl','pl'].some(e => podLang.startsWith(e));
  const d4Signals: { label: string; ok: boolean }[] = [
    { label: `Language: ${podcast.language || 'unknown'}`, ok: isEnglish || (europeOnly && isEuropean) },
  ];
  let geoBlocked = false;
  if (usOnly && !isEnglish) { d4 = 0; geoBlocked = true; d4Signals[0] = { label: `Language: ${podcast.language} (US-only client — blocked)`, ok: false }; }
  else if (europeOnly && isEnglish && !isEuropean) { d4 -= 20; d4Signals.push({ label: `Europe-only client, English podcast`, ok: false }); }
  else {
    const audienceTokens = tokenize(c.podcast?.audienceDescription || '');
    const podAudienceTokens = tokenize(podcast.ai_target_audience || '');
    const audMatchedTokens = audienceTokens.filter(at => podAudienceTokens.some(pa => pa.includes(at) || at.includes(pa)));
    d4Signals.push({ label: `Audience overlap: ${audMatchedTokens.length} keyword(s)`, ok: audMatchedTokens.length > 0 });
    d4 += Math.min(audMatchedTokens.length * 10, 40);
    const jobAudMatch = jobTokens.some(jt => tokenize(podcast.ai_target_audience || '').some(pa => pa.includes(jt)));
    d4Signals.push({ label: `Job title in audience (${c.identity?.jobTitle || '?'})`, ok: jobAudMatch });
    if (jobIndMatch) d4 += 15;
    if (jobAudMatch) d4 += 10;
  }
  d4 = Math.min(Math.max(d4, 0), 100);

  // D5 — Qualité (10%)
  const d5 = Math.min(podcast.ai_badassery_score ?? 0, 100);
  const d5Signals: { label: string; ok: boolean }[] = [
    { label: `Badassery score: ${Math.round(d5)}/100 — intègre reach, ratings, charts`, ok: d5 >= 50 },
  ];

  const raw = 0.30 * d1 + 0.25 * d2 + 0.20 * d3 + 0.15 * d4 + 0.10 * d5;
  const podTitle = (podcast.title || '').toLowerCase();
  let bonus = 0;
  if (dreamList.some(d => podTitle.includes(d) || d.includes(podTitle))) bonus = 20;
  else if (dreamText && podTitle && dreamText.includes(podTitle)) bonus = 10;

  return {
    total: Math.min(100, Math.round(raw + bonus)),
    bonus,
    excluded: false,
    dims: [
      { score: d1, weight: 30, label: 'Catégorie', hits: d1Hits, misses: d1Misses, signals: [] },
      { score: d2, weight: 25, label: 'Topics',    hits: d2Hits, misses: d2Misses.slice(0, 5),
        signals: [
          { label: `Topics matchés : ${d2Hits.length} / ${topicsStrong.length}`, ok: d2Hits.length > 0 },
          { label: `Weak keyword hits: ${weakHits.length}`, ok: weakHits.length > 0 },
          { label: `Found in podcast summary`, ok: summaryHit },
        ]
      },
      { score: d3, weight: 20, label: 'Guest Fit', hits: [], misses: [], signals: d3Signals },
      { score: d4, weight: 15, label: 'Audience',  hits: [], misses: geoBlocked ? ['Geography blocked'] : [], signals: d4Signals },
      { score: d5, weight: 10, label: 'Qualité',   hits: [], misses: [], signals: d5Signals },
    ],
  };
}

// ── Score badge color ─────────────────────────────────────────────────────────

function scoreBadge(score: number) {
  if (score >= 70) return 'bg-green-100 text-green-700 border-green-200';
  if (score >= 40) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

// ── Match Breakdown Modal ─────────────────────────────────────────────────────

const MatchBreakdownModal: React.FC<{
  podcast: ScoredPodcast;
  client: Client;
  onClose: () => void;
}> = ({ podcast, client, onClose }) => {
  const detail = useMemo(() => computeMatchDetail(podcast, client), [podcast, client]);

  const dimColor = (score: number) => {
    if (score >= 70) return '#16a34a';
    if (score >= 40) return '#d97706';
    return '#94a3b8';
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3 items-center">
              {podcast.imageUrl && (
                <img src={podcast.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              )}
              <div>
                <p className="font-bold text-slate-900 text-sm leading-tight">{podcast.title}</p>
                {podcast.rss_owner_name && <p className="text-xs text-slate-400 mt-0.5">{podcast.rss_owner_name}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className="text-2xl font-black px-3 py-1 rounded-xl text-white"
                style={{ background: `linear-gradient(135deg, ${CORAL}, #f97316)` }}
              >
                {detail.total}%
              </div>
              <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
          </div>

          {detail.excluded && (
            <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              ⛔ Exclusion légale — keyword bloqué : <strong>{detail.exclusionReason}</strong>
            </div>
          )}

          {detail.bonus > 0 && (
            <div className="mt-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-1">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              Dream podcast bonus : +{detail.bonus} pts
            </div>
          )}
        </div>

        {/* Dimensions */}
        <div className="p-5 space-y-5">
          {detail.dims.map((dim, i) => (
            <div key={i}>
              {/* Dim header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">D{i + 1}</span>
                  <span className="text-sm font-semibold text-slate-800">{dim.label}</span>
                  <span className="text-xs text-slate-400">({dim.weight}%)</span>
                </div>
                <span className="text-sm font-bold" style={{ color: dimColor(dim.score) }}>
                  {Math.round(dim.score)}/100
                </span>
              </div>

              {/* Score bar */}
              <div className="h-1.5 w-full bg-slate-100 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${dim.score}%`, backgroundColor: dimColor(dim.score) }}
                />
              </div>

              {/* Hits (topics/categories) */}
              {dim.hits.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {dim.hits.map((h, j) => (
                    <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                      ✓ {h}
                    </span>
                  ))}
                </div>
              )}
              {dim.misses.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {dim.misses.slice(0, 4).map((m, j) => (
                    <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200 flex items-center gap-1">
                      ✗ {m}
                    </span>
                  ))}
                </div>
              )}

              {/* Signals */}
              {dim.signals.length > 0 && (
                <div className="space-y-1">
                  {dim.signals.map((s, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs">
                      <span className={s.ok ? 'text-green-600' : 'text-slate-300'}>
                        {s.ok ? '✓' : '✗'}
                      </span>
                      <span className={s.ok ? 'text-slate-700' : 'text-slate-400'}>{s.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Loading Screen ────────────────────────────────────────────────────────────

const LoadingScreen: React.FC<{ done: number; total: number }> = ({ done, total }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: '#0f172a' }}>
      <div className="mb-10 text-center">
        <div className="text-4xl font-black tracking-tight text-white mb-1">
          <span style={{ color: CORAL }}>BADASSERY</span> PR
        </div>
        <p className="text-slate-400 text-sm">AI Podcast Matching Engine</p>
      </div>
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full border-4 border-slate-700 animate-spin"
          style={{ borderTopColor: CORAL }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Star size={20} style={{ color: CORAL }} className="fill-current" />
        </div>
      </div>
      <div className="w-80 text-center">
        <p className="text-white font-semibold mb-1">
          {total === 0 ? 'Loading podcast database…' : `Analyzing ${done.toLocaleString()} / ${total.toLocaleString()} podcasts`}
        </p>
        <p className="text-slate-500 text-xs mb-4">Computing match scores — cached for 24h</p>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-150"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${CORAL}, #f97316)` }} />
        </div>
        <p className="text-slate-500 text-xs mt-2">{pct}%</p>
      </div>
    </div>
  );
};

// ── Client Cats Panel ─────────────────────────────────────────────────────────

const ClientCatsPanel: React.FC<{
  categories: string[];
  topics: string[];
  primaryCat: string;
  activeCats: Set<string>;
  activeTopics: Set<string>;
  onToggleCat: (cat: string) => void;
  onToggleTopic: (topic: string) => void;
  onSelectAll: () => void;
  onClose: () => void;
}> = ({ categories, topics, primaryCat, activeCats, activeTopics, onToggleCat, onToggleTopic, onSelectAll, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const allActive = categories.every(c => activeCats.has(c)) && topics.every(t => activeTopics.has(t));

  return (
    <div ref={ref} className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 w-72 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filtres client actifs</p>
        <button onClick={onSelectAll} className="text-xs text-indigo-600 hover:underline">
          {allActive ? 'Tout désactiver' : 'Tout activer'}
        </button>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <>
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Tag size={10} /> Catégories</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {categories.map((cat, i) => {
              const active = activeCats.has(cat);
              return (
                <button
                  key={i}
                  onClick={() => onToggleCat(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium ${
                    active ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:border-slate-300'
                  } ${i === 0 ? '' : ''}`}
                  style={active ? { backgroundColor: CORAL } : {}}
                >
                  {i === 0 && '★ '}{cat}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Topics */}
      {topics.length > 0 && (
        <>
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Info size={10} /> Topics</p>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((topic, i) => {
              const active = activeTopics.has(topic);
              return (
                <button
                  key={i}
                  onClick={() => onToggleTopic(topic)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    active ? 'bg-indigo-600 text-white border-transparent' : 'text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </>
      )}

      {categories.length === 0 && topics.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-2">Aucune donnée de matching configurée pour ce client.</p>
      )}
    </div>
  );
};

// ── Podcast Card ──────────────────────────────────────────────────────────────

const PodcastCard: React.FC<{
  podcast: ScoredPodcast;
  inBasket: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onClick: () => void;
  onScoreClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}> = ({ podcast, inBasket, onAdd, onRemove, onClick, onScoreClick, onDragStart }) => (
  <div
    draggable={!inBasket}
    onDragStart={onDragStart}
    className={`group relative bg-white rounded-xl border p-3 transition-all ${
      inBasket ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
    }`}
  >
    <div className="flex gap-3 items-start">
      <button onClick={onClick} className="flex gap-3 items-start flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
          {podcast.imageUrl
            ? <img src={podcast.imageUrl} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-slate-300 text-xl">🎙</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{podcast.title || 'Untitled'}</p>
          {podcast.rss_owner_name && (
            <p className="text-xs text-slate-400 truncate">{podcast.rss_owner_name}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {podcast.ai_primary_category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{podcast.ai_primary_category}</span>
            )}
            {podcast.ai_badassery_score != null && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 flex items-center gap-0.5">
                <Star size={9} className="fill-rose-400 text-rose-400" /> {Math.round(podcast.ai_badassery_score)}
              </span>
            )}
          </div>
          {podcast.ai_topics && podcast.ai_topics.length > 0 && (
            <p className="text-xs text-slate-400 mt-1 truncate">{podcast.ai_topics.slice(0, 3).join(' · ')}</p>
          )}
        </div>
      </button>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {/* Score badge — click to see breakdown */}
        <button
          onClick={onScoreClick}
          title="Voir le détail du score"
          className={`text-xs font-bold px-2 py-0.5 rounded-full border hover:ring-2 hover:ring-offset-1 transition-all ${scoreBadge(podcast.matchScore)}`}
          style={{ '--tw-ring-color': CORAL } as any}
        >
          {podcast.matchScore}%
        </button>
        {inBasket ? (
          <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-400 transition-colors">
            <X size={14} />
          </button>
        ) : (
          <button onClick={onAdd} className="p-1 text-slate-300 hover:text-green-500 transition-colors">
            <Plus size={14} />
          </button>
        )}
      </div>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

export const ClientMatchingPage: React.FC<Props> = ({ clientId, onBack }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);

  const [rawPodcasts, setRawPodcasts] = useState<PodcastDocument[]>([]);
  const [scoreMap, setScoreMap] = useState<Map<string, number>>(new Map());

  const [computing, setComputing] = useState(false);
  const [computeProgress, setComputeProgress] = useState({ done: 0, total: 0 });

  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMinScore, setFilterMinScore] = useState(50);
  const [filterMinMatch, setFilterMinMatch] = useState(0);
  const [filterAudienceSize, setFilterAudienceSize] = useState<'any' | 'Micro' | 'Small' | 'Medium' | 'Large' | 'Mega'>('any');
  const [showFilters, setShowFilters] = useState(false);

  // Client cats panel
  const [showCatsPanel, setShowCatsPanel] = useState(false);
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());
  const catsPanelRef = useRef<HTMLDivElement>(null);

  // Basket
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [savingWishlist, setSavingWishlist] = useState(false);
  const [wishlistSaved, setWishlistSaved] = useState(false);

  // Drag & drop
  const [dropOver, setDropOver] = useState(false);
  const basketRef = useRef<HTMLDivElement>(null);

  // Modals
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastDocument | null>(null);
  const [breakdownPodcast, setBreakdownPodcast] = useState<ScoredPodcast | null>(null);

  // ── Load client ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'clients', clientId));
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as Client;
          setClient(data);
          setWishlist((data as any).wishlist || []);
        }
      } finally {
        setLoadingClient(false);
      }
    };
    load();
  }, [clientId]);

  // ── Load raw podcasts ────────────────────────────────────────────────────────

  useEffect(() => {
    getAllPodcastsCachedFiltered().then(pods => {
      console.log(`[Matching] ${pods.length} podcasts loaded`);
      setRawPodcasts(pods);
    });
  }, []);

  // ── Init filter sets from client data ────────────────────────────────────────

  const allClientCats = useMemo(() => {
    if (!client) return [] as string[];
    const c = client as any;
    const primary: string = (c.matching?.primaryCategory || '').trim();
    const secondary: string[] = (c.matching?.secondaryCategories || []).map((s: string) => s.trim()).filter(Boolean);
    return [primary, ...secondary].filter(Boolean);
  }, [client]);

  const allClientTopics = useMemo(() => {
    if (!client) return [] as string[];
    const c = client as any;
    return [...new Set([
      ...(client.content?.speakingTopicsArray || []),
      ...(c.content?.suggestedTopics || []),
    ].map((t: string) => t.trim()).filter(Boolean))];
  }, [client]);

  // Initialize active sets when client loads
  useEffect(() => {
    if (allClientCats.length > 0) setActiveCats(new Set(allClientCats));
    if (allClientTopics.length > 0) setActiveTopics(new Set(allClientTopics));
  }, [allClientCats.join(','), allClientTopics.join(',')]);

  const filterActive = activeCats.size > 0 || activeTopics.size > 0;
  const filterIsAll = allClientCats.every(c => activeCats.has(c)) && allClientTopics.every(t => activeTopics.has(t));

  // ── Compute scores ───────────────────────────────────────────────────────────

  const runScoring = useCallback(async (pods: PodcastDocument[], cl: Client, forceRecompute = false) => {
    const cacheKey = `matching-${clientId}`;
    if (!forceRecompute) {
      const cached = await idbGet<Record<string, number>>(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log('[Matching] Cache hit');
        setScoreMap(new Map<string, number>(Object.entries(cached.data)));
        return;
      }
    }
    console.log(`[Matching] Scoring ${pods.length} podcasts`);
    setComputing(true);
    setComputeProgress({ done: 0, total: pods.length });
    const map = new Map<string, number>();
    for (let i = 0; i < pods.length; i += BATCH_SIZE) {
      for (const p of pods.slice(i, i + BATCH_SIZE)) {
        try { map.set(p.itunesId, computeMatch(p, cl)); }
        catch { map.set(p.itunesId, 0); }
      }
      setComputeProgress({ done: Math.min(i + BATCH_SIZE, pods.length), total: pods.length });
      await new Promise(r => setTimeout(r, 0));
    }
    const record: Record<string, number> = {};
    map.forEach((v, k) => { record[k] = v; });
    await idbSet(cacheKey, record, CACHE_TTL);
    setScoreMap(map);
    setComputing(false);
  }, [clientId]);

  useEffect(() => {
    if (client && rawPodcasts.length > 0) runScoring(rawPodcasts, client);
  }, [client, rawPodcasts]);

  // Reset pagination on filter change
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [search, filterCategory, activeCats, activeTopics, filterMinScore, filterMinMatch]);

  // ── Filtered + sorted list ───────────────────────────────────────────────────

  const displayed = useMemo(() => {
    if (scoreMap.size === 0) return [];
    const q = search.toLowerCase();
    const useClientFilter = filterActive;

    return rawPodcasts
      .map(p => ({ ...p, matchScore: scoreMap.get(p.itunesId) ?? 0 } as ScoredPodcast))
      .filter(p => {
        if (search && !p.title?.toLowerCase().includes(q) && !p.rss_owner_name?.toLowerCase().includes(q)) return false;

        if (filterCategory) {
          const podCats = [p.ai_primary_category, ...(p.ai_secondary_categories || [])].filter(Boolean);
          if (!podCats.includes(filterCategory)) return false;
        }

        if (useClientFilter) {
          // 1. Catégorie primaire obligatoire
          const podPrimary = (p.ai_primary_category || '').toLowerCase().trim();
          const activeCatsLower = new Set([...activeCats].map(c => c.toLowerCase()));
          if (!activeCatsLower.has(podPrimary)) return false;

          // 2. Topics : filtre actif seulement si au moins un topic est décoché
          const topicFilterActive = activeTopics.size < allClientTopics.length;
          if (topicFilterActive && activeTopics.size > 0) {
            const podTopics = (p.ai_topics || []).map((t: string) => t.toLowerCase().trim());
            const topicMatch = [...activeTopics].some(ct =>
              podTopics.some(pt => pt.includes(ct.toLowerCase()) || ct.toLowerCase().includes(pt))
            );
            if (!topicMatch) return false;
          }
        }

        if (p.ai_badassery_score != null && p.ai_badassery_score < filterMinScore) return false;
        if (p.matchScore < filterMinMatch) return false;
        if (filterAudienceSize !== 'any' && p.ai_audience_size !== filterAudienceSize) return false;

        return true;
      })
      .sort((a, b) => b.matchScore - a.matchScore || (b.ai_badassery_score ?? 0) - (a.ai_badassery_score ?? 0));
  }, [rawPodcasts, scoreMap, search, filterCategory, activeCats, activeTopics, filterActive, filterMinScore, filterMinMatch, filterAudienceSize]);

  const visiblePodcasts = displayed.slice(0, displayCount);
  const hasMore = displayed.length > displayCount;
  const basketIds = new Set(wishlist.map(w => w.podcastId));

  // ── Basket ───────────────────────────────────────────────────────────────────

  const addToBasket = useCallback((podcast: ScoredPodcast) => {
    if (basketIds.has(podcast.itunesId)) return;
    setWishlist(prev => [...prev, {
      podcastId: podcast.itunesId,
      title: podcast.title || 'Untitled',
      imageUrl: podcast.imageUrl,
      category: podcast.ai_primary_category,
      matchScore: podcast.matchScore,
      addedAt: new Date().toISOString(),
    }]);
    setWishlistSaved(false);
  }, [basketIds]);

  const removeFromBasket = useCallback((podcastId: string) => {
    setWishlist(prev => prev.filter(w => w.podcastId !== podcastId));
    setWishlistSaved(false);
  }, []);

  const saveWishlist = async () => {
    setSavingWishlist(true);
    try {
      await updateDoc(doc(db, 'clients', clientId), {
        wishlist,
        'stats.matches': wishlist.length,
      });
      setWishlistSaved(true);
    } finally {
      setSavingWishlist(false);
    }
  };

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, podcast: ScoredPodcast) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('podcastId', podcast.itunesId);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const id = e.dataTransfer.getData('podcastId');
    const podcast = displayed.find(p => p.itunesId === id);
    if (podcast) addToBasket(podcast);
  };

  // ── Client cats handlers ─────────────────────────────────────────────────────

  const toggleCat = (cat: string) => {
    setActiveCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const toggleTopic = (topic: string) => {
    setActiveTopics(prev => {
      const next = new Set(prev);
      next.has(topic) ? next.delete(topic) : next.add(topic);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (filterIsAll) {
      setActiveCats(new Set());
      setActiveTopics(new Set());
    } else {
      setActiveCats(new Set(allClientCats));
      setActiveTopics(new Set(allClientTopics));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (computing) return <LoadingScreen done={computeProgress.done} total={computeProgress.total} />;

  if (loadingClient) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-slate-400" />
    </div>
  );

  if (!client) return (
    <div className="text-center py-20 text-slate-400">Client not found.</div>
  );

  const c = client as any;
  const clientName = `${client.identity?.firstName || ''} ${client.identity?.lastName || ''}`.trim() || 'Client';
  const primaryCat = allClientCats[0] || '';
  const isPodcastsLoading = rawPodcasts.length === 0 || scoreMap.size === 0;

  const activeCount = activeCats.size + activeTopics.size;
  const totalCount = allClientCats.length + allClientTopics.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm">
          <ArrowLeft size={16} /> Back to profile
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-900">
            Podcast Matching — <span style={{ color: CORAL }}>{clientName}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isPodcastsLoading
              ? 'Loading podcast database…'
              : `${scoreMap.size.toLocaleString()} podcasts scored · ${displayed.length.toLocaleString()} matching`}
          </p>
        </div>
        {(() => {
          const photoUrl = (client as any).logo_url || (client as any).links?.headshot;
          if (!photoUrl) return null;
          return (
            <img
              src={photoUrl}
              alt={clientName}
              className="w-12 h-12 rounded-full border-2 border-slate-200 object-cover shadow-sm flex-shrink-0"
            />
          );
        })()}
      </div>

      {/* Body */}
      <div className="flex gap-6 flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">

          {/* Toolbar */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name or host…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-200 focus:border-rose-300 outline-none"
              />
            </div>

            {/* Client cats panel trigger */}
            <div className="relative" ref={catsPanelRef}>
              <button
                onClick={() => setShowCatsPanel(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap ${
                  filterActive
                    ? 'text-white border-transparent'
                    : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                style={filterActive ? { backgroundColor: CORAL } : {}}
              >
                <Filter size={12} />
                Filtres client
                {totalCount > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${filterActive ? 'bg-white/25' : 'bg-slate-100'}`}>
                    {activeCount}/{totalCount}
                  </span>
                )}
                <ChevronDown size={10} className={`transition-transform ${showCatsPanel ? 'rotate-180' : ''}`} />
              </button>

              {showCatsPanel && (
                <ClientCatsPanel
                  categories={allClientCats}
                  topics={allClientTopics}
                  primaryCat={primaryCat}
                  activeCats={activeCats}
                  activeTopics={activeTopics}
                  onToggleCat={toggleCat}
                  onToggleTopic={toggleTopic}
                  onSelectAll={handleSelectAll}
                  onClose={() => setShowCatsPanel(false)}
                />
              )}
            </div>

            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${showFilters ? 'bg-slate-100 border-slate-300' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} /> Filters
            </button>

            <button
              onClick={() => client && rawPodcasts.length > 0 && (setScoreMap(new Map()), runScoring(rawPodcasts, client, true))}
              disabled={isPodcastsLoading}
              title="Recompute scores (clears cache)"
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isPodcastsLoading ? 'animate-spin text-slate-400' : 'text-slate-400'} />
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="flex flex-wrap gap-4 items-center mb-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Min Badassery: <strong>{filterMinScore}</strong></label>
                <input type="range" min={0} max={100} step={5} value={filterMinScore}
                  onChange={e => setFilterMinScore(Number(e.target.value))} className="w-28" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Min Match %: <strong>{filterMinMatch}</strong></label>
                <input type="range" min={0} max={100} step={5} value={filterMinMatch}
                  onChange={e => setFilterMinMatch(Number(e.target.value))} className="w-28" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Audience Size</label>
                <select
                  value={filterAudienceSize}
                  onChange={e => setFilterAudienceSize(e.target.value as typeof filterAudienceSize)}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-200"
                >
                  <option value="any">Any</option>
                  <option value="Micro">Micro</option>
                  <option value="Small">Small</option>
                  <option value="Medium">Medium</option>
                  <option value="Large">Large</option>
                  <option value="Mega">Mega</option>
                </select>
              </div>
            </div>
          )}

          {/* Podcast list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {isPodcastsLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-sm">Loading podcast database…</p>
              </div>
            )}
            {!isPodcastsLoading && displayed.length === 0 && (
              <div className="text-center py-16 text-slate-400 text-sm">No podcasts found. Try adjusting filters.</div>
            )}
            {!isPodcastsLoading && visiblePodcasts.map(podcast => (
              <PodcastCard
                key={podcast.itunesId}
                podcast={podcast}
                inBasket={basketIds.has(podcast.itunesId)}
                onAdd={() => addToBasket(podcast)}
                onRemove={() => removeFromBasket(podcast.itunesId)}
                onClick={() => setSelectedPodcast(podcast)}
                onScoreClick={() => setBreakdownPodcast(podcast)}
                onDragStart={(e) => handleDragStart(e, podcast)}
              />
            ))}

            {hasMore && (
              <button
                onClick={() => setDisplayCount(n => n + PAGE_SIZE)}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-800 border border-dashed border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
              >
                <ChevronRight size={14} />
                Load {Math.min(PAGE_SIZE, displayed.length - displayCount).toLocaleString()} more
                <span className="text-slate-400">({(displayed.length - displayCount).toLocaleString()} remaining)</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Basket ── */}
        <div
          ref={basketRef}
          onDragOver={e => { e.preventDefault(); setDropOver(true); }}
          onDragLeave={() => setDropOver(false)}
          onDrop={handleDrop}
          className={`w-80 flex-shrink-0 flex flex-col rounded-2xl border-2 transition-all ${
            dropOver ? 'border-green-400 bg-green-50' : 'border-dashed border-slate-200 bg-slate-50'
          }`}
        >
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Selected for Outreach</p>
                <p className="text-xs text-slate-400 mt-0.5">{wishlist.length} podcast{wishlist.length !== 1 ? 's' : ''} selected</p>
              </div>
              <button
                onClick={saveWishlist}
                disabled={savingWishlist || wishlist.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                  wishlistSaved ? 'bg-green-100 text-green-700' : 'bg-slate-800 text-white hover:bg-slate-700'
                }`}
              >
                {savingWishlist ? <Loader2 size={12} className="animate-spin" />
                  : wishlistSaved ? <><CheckCircle2 size={12} /> Saved</> : 'Save'}
              </button>
            </div>
          </div>

          {wishlist.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-2xl">🎙</div>
              <p className="text-sm text-slate-400">Drag podcasts here or click <Plus size={12} className="inline" /></p>
              <p className="text-xs text-slate-300">Selections saved to client's outreach wishlist</p>
            </div>
          )}

          {wishlist.length > 0 && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {wishlist.map(item => (
                <div key={item.podcastId} className="bg-white rounded-xl border border-slate-200 p-3 flex gap-3 items-center">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-slate-300">🎙</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.category && <span className="text-xs text-slate-400 truncate">{item.category}</span>}
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${scoreBadge(item.matchScore)}`}>{item.matchScore}%</span>
                    </div>
                  </div>
                  <button onClick={() => removeFromBasket(item.podcastId)} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {wishlist.length > 0 && (
            <div className="p-3 border-t border-slate-200">
              <p className="text-xs text-slate-400 text-center">
                {wishlistSaved ? '✓ Changes saved' : 'Unsaved changes — click Save'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Podcast detail modal */}
      {selectedPodcast && (
        <BrooklynDetailModal podcast={selectedPodcast} onClose={() => setSelectedPodcast(null)} />
      )}

      {/* Match breakdown modal */}
      {breakdownPodcast && client && (
        <MatchBreakdownModal
          podcast={breakdownPodcast}
          client={client}
          onClose={() => setBreakdownPodcast(null)}
        />
      )}
    </div>
  );
};
