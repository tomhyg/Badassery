# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (webapp/badassery/)

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build (outputs to dist/)
npm run preview      # Preview production build locally
npm run deploy       # Build + deploy hosting only
npm run deploy:all   # Build + deploy hosting + Cloud Functions
```

### Cloud Functions (webapp/badassery/functions/)

```bash
npm run build        # Compile TypeScript
npm run lint         # ESLint (TypeScript only)
npm run serve        # Build + run emulator (functions only)
npm run deploy       # Deploy functions only
```

### Root-level scripts (Node.js)

```bash
node scripts/parallel_scoring_v2.js     # Main AI scoring pipeline
node scripts/upload_podcasts_to_firestore.js
node scripts/validate_setup.js
```

### Python enrichment scripts

```bash
source .venv/bin/activate
python scripts/podcast_enricher_v3.py
python scripts/production_enrichment_vm.py
```

## Architecture

The platform has three distinct layers:

### 1. React SPA (`webapp/badassery/src/`)

- **Pages/** (19 pages): Full-page views. Notable: `PodcastsReal.tsx` (search/filter), `OutreachKanban.tsx` (campaign board), `AIMatching.tsx` (client-podcast matching), `ClientDetailNew.tsx`, `ClientOnboardingNew.tsx`
- **Components/** (11 components): Reusable UI. `Layout.tsx` wraps all pages with sidebar nav. `PodcastDetailModal.tsx` and `OutreachActionModal.tsx` are the main modal workflows.
- **Services/** (21 modules): All Firestore access lives here. `podcastService.ts` has in-memory caching. `outreachServiceV2.ts` is the current version. `aiMatchingService.ts` calls Gemini. `gmailService.ts` calls the Cloud Function.
- **types.ts**: Central type definitions (~2000 LOC). `Podcast` type has 195+ optional fields mirroring Firestore. `Outreach.status` is `'pending' | 'contacted' | 'interested' | 'booked' | 'completed'`.

State management is React Context + Hooks only (no Redux). No test framework is configured.

### 2. Firebase Backend

- **Firestore collections**: `podcasts` (keyed by `itunesId`), `clients`, `outreach`
- **Cloud Functions** (`functions/src/index.ts`): Single `sendEmail` callable function using Nodemailer over Gmail SMTP. Test mode redirects all mail to a test address.
- **Hosting**: SPA with catch-all rewrite to `index.html`

### 3. Offline Processing Pipeline

- **`scripts/parallel_scoring_v2.js`** (1087 LOC): The core AI pipeline. Reads from Firestore, calls Gemini 2.0 Flash to categorize podcasts into 31 niches, calculates a Badassery Score (0-100) via a weighted formula, and writes results back in batches. Supports checkpointing for resumability and is designed to run on 20 VMs in parallel.
- **Python enrichment scripts**: Pull data from Apple Podcasts, RSS feeds, YouTube (via yt-dlp), and web scraping (BeautifulSoup). Produce the 195+ fields stored per podcast in Firestore.

### Data flow

```
PodcastIndex SQLite (800K podcasts)
    → Filter to ~5-10K by SQL criteria
    → Python enrichment (RSS, Apple, YouTube, scraping)
    → Firestore (podcasts collection, 195+ fields each)
    → parallel_scoring_v2.js (Gemini AI categorization + Badassery Score)
    → React frontend (search, match, outreach)
    → Cloud Function → Gmail SMTP (email sending)
```

## Environment Variables

Configured in `.env.local` (copy from `.env.example`). Key variables:
- `GEMINI_API_KEY` — Google AI Studio
- `PODCASTINDEX_API_KEY` / `PODCASTINDEX_API_SECRET`
- `GMAIL_USER` / `GMAIL_PASSWORD` (App Password)
- Firebase config vars (see `src/services/firebase.ts`)
- `serviceAccountKey.json` — Firebase service account (for scripts and Python enrichment; never committed)

## Firebase Project

- **Project ID:** `brooklynn-61dc8`
- **Live URL:** `https://brooklynn-61dc8.web.app`
- **Functions runtime:** Node.js 20

## Key Conventions

- Document ID for podcasts = `itunesId` (string)
- `outreachServiceV2.ts` supersedes `outreachService.ts` — prefer V2
- The 31 AI niche categories are defined in `parallel_scoring_v2.js` and mirrored in `aiMatchingService.ts`
- Tailwind CSS for styling; Lucide React for icons
- Path alias `@/` resolves to `webapp/badassery/` root (configured in both `vite.config.ts` and `tsconfig.json`)
- Cloud Functions are TypeScript compiled to `functions/lib/`; ESLint only runs on functions code
