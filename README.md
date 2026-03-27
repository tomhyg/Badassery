# Badassery PR — Podcast Outreach Platform

A full-stack platform for discovering, enriching, scoring, and managing podcast outreach at scale. Built with React, Firebase, Google Gemini AI, and a multi-source data enrichment pipeline.

## Features

- **Podcast Enrichment Pipeline** — Ingests 800K+ podcasts from PodcastIndex, filters to ~5-10K, and enriches with data from Apple, RSS, YouTube, and website scraping
- **AI Categorization** — Google Gemini classifies podcasts into 31 niche categories with scoring (Badassery Score 0-100)
- **Client-Podcast Matching** — AI-powered matching between clients and relevant podcasts
- **Outreach Management** — Kanban board for tracking outreach campaigns
- **Email Integration** — Gmail-based email sending via Cloud Functions

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 19 + TypeScript + Vite 6 |
| Database | Firebase Firestore |
| Hosting | Firebase Hosting |
| Backend | Firebase Cloud Functions (Node.js 20) |
| AI | Google Gemini 2.0 Flash |
| Enrichment | Python 3 (BeautifulSoup, yt-dlp, requests) |
| Email | Nodemailer (Gmail SMTP) |

## Quick Start

### Prerequisites

- Node.js 20+ ([download](https://nodejs.org/))
- Python 3.x ([download](https://www.python.org/))
- Firebase CLI: `npm install -g firebase-tools`
- GitHub CLI: `gh` ([download](https://cli.github.com/))

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/badassery-pr.git
cd badassery-pr

# 2. Install Node.js dependencies
npm install
cd webapp/badassery && npm install
cd functions && npm install && cd ../../..

# 3. Set up Python environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate
pip install beautifulsoup4 requests firebase-admin yt-dlp

# 4. Configure environment variables
cp .env.example .env.local
# Edit .env.local with your API keys (see "Environment Variables" below)

# 5. Log into Firebase
firebase login
```

### Run locally

```bash
cd webapp/badassery
npm run dev
# Open http://localhost:3000
```

### Deploy

```bash
cd webapp/badassery
npm run deploy        # Hosting only
npm run deploy:all    # Hosting + Cloud Functions
```

Live URL: `https://brooklynn-61dc8.web.app`

## Architecture

```
PodcastIndex SQLite (800K+ podcasts)
        |
        | SQL filters (language, activity, episodes, iTunes ID)
        v
  ~5-10K podcasts
        |
        | Parallel enrichment (20 VMs)
        v
+-------+-------+-------+-------+
| RSS   | Apple | Web   | YouTube|
| Feed  | Scrape| Scrape| yt-dlp |
+-------+-------+-------+-------+
        |
        v
  Gemini AI Categorization (31 niches)
        |
        v
  Scoring (Badassery Score 0-100)
        |
        v
  Firestore (120K+ documents, 195+ fields each)
        |
        v
  React Web App (Dashboard, Podcasts, Outreach, AI Matching)
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

| Variable | Where to get it |
|----------|----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://makersuite.google.com/app/apikey) |
| `PODCASTINDEX_API_KEY` | [PodcastIndex](https://api.podcastindex.org/) |
| `PODCASTINDEX_API_SECRET` | Same as above |
| `GMAIL_USER` | Your Gmail address |
| `GMAIL_PASSWORD` | [Gmail App Password](https://myaccount.google.com/apppasswords) |

The Firebase service account JSON (`serviceAccountKey.json`) must be placed at the project root. Generate it from the [Firebase Console](https://console.firebase.google.com/) > Settings > Service Accounts.

> **For collaborators:** All secrets are shared via a private Google Drive folder. Ask the project owner for access.

## Database Setup

The PodcastIndex database (~4.6 GB) is too large for GitHub. Two options:

**Option A — Download from PodcastIndex (latest version):**
```bash
bash scripts/download_database.sh
```

**Option B — Get from shared Google Drive:**
Ask the project owner for the Google Drive link containing the enriched database.

## Project Structure

```
.
├── scripts/                  # Node.js operational scripts
│   ├── parallel_scoring_v2.js    # Main AI scoring engine
│   ├── upload_podcasts_to_firestore.js
│   └── ...
├── webapp/badassery/         # React web application
│   ├── components/           # React components
│   ├── pages/                # App pages
│   ├── services/             # Firebase, Gemini, Gmail services
│   └── functions/            # Cloud Functions (Node.js 20)
├── *.py                      # Python enrichment scripts
├── *.bat                     # Windows launcher scripts
└── docs (*.md)               # Documentation files
```

## Documentation

| File | Description |
|------|-------------|
| [REFERENCE_TOUS_LES_CHAMPS.md](REFERENCE_TOUS_LES_CHAMPS.md) | All 195+ data fields reference |
| [GUIDE_API_ET_DEPLOIEMENT.md](GUIDE_API_ET_DEPLOIEMENT.md) | All APIs & deployment guide |
| [GUIDE_TRANSMISSION_PROJET.md](GUIDE_TRANSMISSION_PROJET.md) | Project handoff guide |
| [INDEX.md](INDEX.md) | Full documentation index |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## License

ISC License — see [LICENSE](LICENSE) for details.
# Badassery
