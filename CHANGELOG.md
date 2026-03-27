# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-20

### Added
- Podcast enrichment pipeline: PodcastIndex SQLite -> Apple iTunes API -> Apple Scraping -> RSS Parsing -> YouTube (yt-dlp) -> Website Scraping
- AI categorization with Google Gemini 2.0 Flash (31 Badassery niches)
- Multi-signal scoring: engagement, audience size, content quality, monetization potential
- Badassery Score (0-100) with category and global percentiles
- React 19 web application with Vite 6 and TypeScript
- Firebase Firestore database (120K+ enriched podcasts, 195+ fields each)
- Firebase Hosting deployment (https://brooklynn-61dc8.web.app)
- Firebase Cloud Functions for email sending (Gmail SMTP via Nodemailer)
- Dashboard with global statistics
- Podcast search and filtering interface
- Client management pages
- Outreach Kanban board
- AI Matching: client-podcast matching powered by Gemini
- Brooklyn spider animation with Lebanese/Swahili greetings
- Distributed scraping support (20 VMs parallel processing)
- Windows batch launchers (LANCER_PARALLEL.bat, etc.)
- Comprehensive documentation (15+ markdown guides)
