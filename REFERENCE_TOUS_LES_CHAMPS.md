# RÉFÉRENCE COMPLÈTE — TOUS LES CHAMPS DU PIPELINE D'ENRICHISSEMENT

> Fichier de référence exhaustif de tous les champs/colonnes utilisés à chaque étape du pipeline Badassery.
> Dernière mise à jour : Février 2026

---

## SECTION 1 : PodcastIndex SQLite DB (10 colonnes extraites)

Source : `podcastindex_feeds.db` → Script : `prepare_all_podcasts.py`

| # | Colonne | Type | Description |
|---|---------|------|-------------|
| 1 | `id` | int | ID unique PodcastIndex du podcast |
| 2 | `url` | string | URL du flux RSS |
| 3 | `title` | string | Nom du podcast |
| 4 | `itunesId` | int | ID iTunes/Apple Podcasts (clé de liaison vers Apple) |
| 5 | `link` | string | Site web du podcast |
| 6 | `description` | string | Description du podcast |
| 7 | `language` | string | Code langue (ex: "en", "en-us", "en-gb") |
| 8 | `imageUrl` | string | URL de l'image de couverture |
| 9 | `lastUpdate` | timestamp | Date de dernière mise à jour du flux RSS |
| 10 | `episodeCount` | int | Nombre total d'épisodes publiés |

**Filtres SQL appliqués (réduction de ~800K → ~5-10K podcasts) :**

| Filtre | Condition SQL | Effet |
|--------|--------------|-------|
| Fraîcheur | `lastUpdate > (now - 60 jours)` | Podcasts actifs récemment uniquement |
| Statut | `dead = 0` | Exclure les podcasts morts/archivés |
| Maturité | `episodeCount > 49` | Minimum 50 épisodes (podcasts établis) |
| iTunes ID | `itunesId > 0` | Doit avoir un iTunes ID valide |
| Langue | `language LIKE 'en%' OR language LIKE 'EN%'` | Anglais uniquement |

---

## SECTION 2 : Apple iTunes Lookup API (5 champs)

Source : `https://itunes.apple.com/lookup?id={IDs}&entity=podcast` (batch de 150 IDs par requête)
Scripts : `prepare_all_podcasts.py`, `podcast_enricher.py`, `podcast_enricher_v2.py`

| # | Champ Firestore | Champ API source | Type | Description |
|---|----------------|------------------|------|-------------|
| 1 | `apple_api_url` | `collectionViewUrl` | string | URL de la page Apple Podcasts |
| 2 | `apple_api_artist_id` | `artistId` | string | ID de l'artiste/créateur sur Apple |
| 3 | `apple_api_artwork_url` | `artworkUrl600` | string | URL de l'artwork haute résolution (600×600px) |
| 4 | `apple_api_genres` | `genres` | string (JSON) | Liste des genres Apple (ex: ["Business", "Technology"]) |
| 5 | `apple_api_genre_ids` | `genreIds` | string (JSON) | IDs numériques des genres Apple (ex: [1321, 1318]) |

---

## SECTION 3 : Apple Podcasts Web Scraping (5 champs)

Source : `https://podcasts.apple.com/us/podcast/id{ITUNES_ID}` (HTML parsing)
Script : `apple_scraper_vm.py`

| # | Champ Firestore | Type | Description |
|---|----------------|------|-------------|
| 1 | `apple_rating` | float | Note moyenne (0.0 à 5.0 étoiles) |
| 2 | `apple_rating_count` | int | Nombre total de notes/ratings |
| 3 | `apple_review_count` | int | Nombre d'avis écrits (reviews textuelles) |
| 4 | `apple_scrape_status` | string | Statut du scraping ("success", "error", "no_data") |
| 5 | `apple_scrape_error` | string | Message d'erreur détaillé si échec |

**Méthodes d'extraction (par ordre de priorité) :**
1. JSON-LD : `<script type="application/ld+json">` → objet `aggregateRating`
2. Regex HTML : `(\d+\.?\d*) out of 5`, `\d+[\s,]*Ratings?`
3. Meta tags : `<meta name="apple:rating">`

---

## SECTION 4 : PodcastIndex API (1 champ)

Source : `https://api.podcastindex.org/api/1.0/podcasts/byfeedid?id={id}`
Script : `podcast_enricher.py`
Auth : SHA1 HMAC (API_KEY + API_SECRET + epoch)

| # | Champ Firestore | Champ API source | Type | Description |
|---|----------------|------------------|------|-------------|
| 1 | `pi_owner_email` | `ownerEmail` | string | Email du propriétaire du podcast (depuis PodcastIndex API) |

---

## SECTION 5 : RSS Feed Parsing — Infos Podcast (14 champs)

Source : Flux RSS du podcast (URL depuis PodcastIndex)
Scripts : `podcast_enricher.py`, `podcast_enricher_v2.py`, `production_enrichment_v2.py`, `production_enrichment_vm.py`

| # | Champ Firestore | Tag RSS source | Type | Description |
|---|----------------|----------------|------|-------------|
| 1 | `rss_url` | (l'URL elle-même) | string | URL complète du flux RSS |
| 2 | `rss_owner_email` | `<itunes:owner><itunes:email>` | string | Email du propriétaire (iTunes namespace) |
| 3 | `rss_owner_name` | `<itunes:owner><itunes:name>` | string | Nom du propriétaire |
| 4 | `rss_author` | `<itunes:author>` | string | Auteur/créateur du podcast |
| 5 | `rss_website` | `<link>` | string | Site web principal du podcast |
| 6 | `rss_description` | `<description>` ou `<itunes:summary>` | string | Description complète (max 2000 chars) |
| 7 | `rss_copyright` | `<copyright>` | string | Mention de copyright |
| 8 | `rss_type` | `<itunes:type>` | string | Type de podcast : "episodic" ou "serial" |
| 9 | `rss_complete` | `<itunes:complete>` | string | Podcast terminé : "Yes" ou absent |
| 10 | `rss_funding_url` | `<podcast:funding>` | string | URL de financement/donation (PodcastIndex namespace) |
| 11 | `rss_managing_editor` | `<managingEditor>` | string | Email de l'éditeur en charge |
| 12 | `rss_subtitle` | `<itunes:subtitle>` | string | Sous-titre court du podcast |
| 13 | `rss_status` | (calculé) | string | Statut du parsing : "success" ou "error" |
| 14 | `rss_error` | (calculé) | string | Message d'erreur si le parsing a échoué |

---

## SECTION 6 : RSS Feed Parsing — Réseaux sociaux (6 champs)

Source : Tags `<podcast:social>` dans le RSS (PodcastIndex namespace)
Scripts : `podcast_enricher.py`, `podcast_enricher_v2.py`

| # | Champ Firestore | Type | Description |
|---|----------------|------|-------------|
| 1 | `rss_social_twitter` | string | URL/handle Twitter/X déclaré dans le RSS |
| 2 | `rss_social_instagram` | string | URL/handle Instagram déclaré dans le RSS |
| 3 | `rss_social_facebook` | string | URL/page Facebook déclarée dans le RSS |
| 4 | `rss_social_youtube` | string | URL chaîne YouTube déclarée dans le RSS |
| 5 | `rss_social_linkedin` | string | URL profil/page LinkedIn déclaré dans le RSS |
| 6 | `rss_social_tiktok` | string | URL/handle TikTok déclaré dans le RSS |

---

## SECTION 7 : RSS Feed Parsing — Épisodes (60 à 100 champs)

Les **10 derniers épisodes** sont extraits du flux RSS.

### Champs de base — pour chaque épisode N (1 à 10) : 6 champs × 10 = 60

| # | Champ Firestore | Tag RSS source | Type | Description |
|---|----------------|----------------|------|-------------|
| 1 | `rss_ep{N}_title` | `<title>` | string | Titre de l'épisode (max 500 chars) |
| 2 | `rss_ep{N}_description` | `<description>` | string | Description/résumé de l'épisode (max 1000 chars) |
| 3 | `rss_ep{N}_date` | `<pubDate>` | string | Date de publication (format RSS) |
| 4 | `rss_ep{N}_duration` | `<itunes:duration>` | string | Durée de l'épisode (ex: "01:23:45" ou "3600") |
| 5 | `rss_ep{N}_audio_url` | `<enclosure url="">` | string | URL directe du fichier audio MP3/M4A |
| 6 | `rss_ep{N}_guid` | `<guid>` | string | Identifiant unique global de l'épisode |

### Champs optionnels — pour chaque épisode N (1 à 10) : jusqu'à 4 champs × 10 = 40

| # | Champ Firestore | Tag RSS source | Type | Description |
|---|----------------|----------------|------|-------------|
| 7 | `rss_ep{N}_link` | `<link>` | string | URL web de la page de l'épisode |
| 8 | `rss_ep{N}_episode_num` | `<itunes:episode>` | string | Numéro de l'épisode |
| 9 | `rss_ep{N}_season_num` | `<itunes:season>` | string | Numéro de saison |
| 10 | `rss_ep{N}_transcript` | `<podcast:transcript>` | string | URL du fichier transcript (PodcastIndex namespace) |

**Liste complète développée (60 champs de base) :**

| Épisode | title | description | date | duration | audio_url | guid |
|---------|-------|-------------|------|----------|-----------|------|
| Ep 1 | `rss_ep1_title` | `rss_ep1_description` | `rss_ep1_date` | `rss_ep1_duration` | `rss_ep1_audio_url` | `rss_ep1_guid` |
| Ep 2 | `rss_ep2_title` | `rss_ep2_description` | `rss_ep2_date` | `rss_ep2_duration` | `rss_ep2_audio_url` | `rss_ep2_guid` |
| Ep 3 | `rss_ep3_title` | `rss_ep3_description` | `rss_ep3_date` | `rss_ep3_duration` | `rss_ep3_audio_url` | `rss_ep3_guid` |
| Ep 4 | `rss_ep4_title` | `rss_ep4_description` | `rss_ep4_date` | `rss_ep4_duration` | `rss_ep4_audio_url` | `rss_ep4_guid` |
| Ep 5 | `rss_ep5_title` | `rss_ep5_description` | `rss_ep5_date` | `rss_ep5_duration` | `rss_ep5_audio_url` | `rss_ep5_guid` |
| Ep 6 | `rss_ep6_title` | `rss_ep6_description` | `rss_ep6_date` | `rss_ep6_duration` | `rss_ep6_audio_url` | `rss_ep6_guid` |
| Ep 7 | `rss_ep7_title` | `rss_ep7_description` | `rss_ep7_date` | `rss_ep7_duration` | `rss_ep7_audio_url` | `rss_ep7_guid` |
| Ep 8 | `rss_ep8_title` | `rss_ep8_description` | `rss_ep8_date` | `rss_ep8_duration` | `rss_ep8_audio_url` | `rss_ep8_guid` |
| Ep 9 | `rss_ep9_title` | `rss_ep9_description` | `rss_ep9_date` | `rss_ep9_duration` | `rss_ep9_audio_url` | `rss_ep9_guid` |
| Ep 10 | `rss_ep10_title` | `rss_ep10_description` | `rss_ep10_date` | `rss_ep10_duration` | `rss_ep10_audio_url` | `rss_ep10_guid` |

---

## SECTION 8 : Website Scraping — Réseaux sociaux & Email (9 champs)

Source : Page d'accueil du podcast (HTTP GET + regex sur le HTML)
Scripts : `production_enrichment_v2.py`, `production_enrichment_vm.py`

| # | Champ Firestore | Regex pattern utilisé | Type | Description |
|---|----------------|----------------------|------|-------------|
| 1 | `website_twitter` | `(?:twitter\|x)\.com/([a-zA-Z0-9_]+)` | string | Profil Twitter/X trouvé sur le site |
| 2 | `website_instagram` | `instagram\.com/([a-zA-Z0-9_.]+)` | string | Profil Instagram trouvé sur le site |
| 3 | `website_facebook` | `facebook\.com/([a-zA-Z0-9_.]+)` | string | Page Facebook trouvée sur le site |
| 4 | `website_linkedin` | `linkedin\.com/(?:company\|in)/([a-zA-Z0-9_-]+)` | string | Profil/Page LinkedIn trouvé sur le site |
| 5 | `website_youtube` | `youtube\.com/(channel\|c\|@\|user)/[a-zA-Z0-9_-]+` | string | Chaîne YouTube trouvée sur le site |
| 6 | `website_tiktok` | `tiktok\.com/@([a-zA-Z0-9_.]+)` | string | Profil TikTok trouvé sur le site |
| 7 | `website_spotify` | `open\.spotify\.com/show/([a-zA-Z0-9]+)` | string | Page Spotify du podcast trouvée sur le site |
| 8 | `website_email` | `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` | string | Adresse email de contact extraite du site |
| 9 | `website_status` | (calculé) | string | Statut du scraping ("success" / "error" / "timeout") |

---

## SECTION 9 : YouTube via yt-dlp (jusqu'à 50 champs)

Source : Chaîne YouTube détectée via website scraping → extraction avec la librairie `yt-dlp`
Scripts : `production_enrichment_v2.py`, `production_enrichment_vm.py`

### 9A — Infos Chaîne YouTube (jusqu'à 10 champs)

| # | Champ Firestore | Type | Description |
|---|----------------|------|-------------|
| 1 | `yt_channel_name` | string | Nom affiché de la chaîne YouTube |
| 2 | `yt_channel_id` | string | ID unique de la chaîne (ex: "UCxxxxxxxx") |
| 3 | `yt_channel_url` | string | URL complète de la chaîne |
| 4 | `yt_subscribers` | int | Nombre d'abonnés à la chaîne |
| 5 | `yt_description` | string | Description/bio de la chaîne |
| 6 | `yt_total_views` | int | Nombre total de vues cumulées de la chaîne |
| 7 | `yt_video_count` | int | Nombre total de vidéos publiées |
| 8 | `yt_status` | string | Statut de l'extraction ("success" / "error") |
| 9 | `yt_error` | string | Message d'erreur si échec |
| 10 | `youtube_status` | string | Statut global YouTube dans Firestore |

### 9B — 10 dernières vidéos YouTube (40 champs de base : 4 × 10)

Pour chaque vidéo N (1 à 10) :

| # | Champ Firestore | Type | Description |
|---|----------------|------|-------------|
| 1 | `yt_video_{N}_title` | string | Titre de la vidéo |
| 2 | `yt_video_{N}_id` | string | ID YouTube de la vidéo (ex: "dQw4w9WgXcQ") |
| 3 | `yt_video_{N}_views` | int | Nombre de vues de la vidéo |
| 4 | `yt_video_{N}_duration` | int | Durée de la vidéo en secondes |

### 9C — Champs vidéo optionnels (dans `production_enrichment_vm.py`)

Pour chaque vidéo N (1 à 10), champs additionnels avec préfixe `yt_vid{N}_` :

| # | Champ Firestore | Type | Description |
|---|----------------|------|-------------|
| 5 | `yt_vid{N}_likes` | int | Nombre de likes sur la vidéo |
| 6 | `yt_vid{N}_date` | string | Date de publication de la vidéo |
| 7 | `yt_vid{N}_description` | string | Description de la vidéo |

**Liste complète développée (40 champs de base) :**

| Vidéo | title | id | views | duration |
|-------|-------|----|-------|----------|
| Vid 1 | `yt_video_1_title` | `yt_video_1_id` | `yt_video_1_views` | `yt_video_1_duration` |
| Vid 2 | `yt_video_2_title` | `yt_video_2_id` | `yt_video_2_views` | `yt_video_2_duration` |
| Vid 3 | `yt_video_3_title` | `yt_video_3_id` | `yt_video_3_views` | `yt_video_3_duration` |
| Vid 4 | `yt_video_4_title` | `yt_video_4_id` | `yt_video_4_views` | `yt_video_4_duration` |
| Vid 5 | `yt_video_5_title` | `yt_video_5_id` | `yt_video_5_views` | `yt_video_5_duration` |
| Vid 6 | `yt_video_6_title` | `yt_video_6_id` | `yt_video_6_views` | `yt_video_6_duration` |
| Vid 7 | `yt_video_7_title` | `yt_video_7_id` | `yt_video_7_views` | `yt_video_7_duration` |
| Vid 8 | `yt_video_8_title` | `yt_video_8_id` | `yt_video_8_views` | `yt_video_8_duration` |
| Vid 9 | `yt_video_9_title` | `yt_video_9_id` | `yt_video_9_views` | `yt_video_9_duration` |
| Vid 10 | `yt_video_10_title` | `yt_video_10_id` | `yt_video_10_views` | `yt_video_10_duration` |

---

## SECTION 10 : Champs AI Gemini — Catégorisation (8 champs)

Source : Google Gemini 2.0 Flash API
Script : `scripts/parallel_scoring_v2.js`

| # | Champ Firestore | Type | Valeurs possibles | Description |
|---|----------------|------|-------------------|-------------|
| 1 | `ai_primary_category` | string | 1 des 31 niches (voir liste ci-dessous) | Niche principale du podcast |
| 2 | `ai_secondary_categories` | array[string] | 1-3 niches | Niches secondaires pertinentes |
| 3 | `ai_topics` | array[string] | 3-5 sujets | Sujets spécifiques abordés |
| 4 | `ai_target_audience` | string | texte libre | Description courte de l'audience cible |
| 5 | `ai_podcast_style` | string | Interview / Solo / Panel / Storytelling / Educational / Other | Format/style du podcast |
| 6 | `ai_business_relevance` | int | 1 à 10 | Score de pertinence B2B/business |
| 7 | `ai_guest_friendly` | boolean | true / false | Le podcast accepte-t-il des invités réguliers ? |
| 8 | `ai_summary` | string | texte libre | Résumé unique de 2-3 phrases généré par l'IA |

**Les 31 niches Badassery :**

| # | Niche |
|---|-------|
| 1 | Female Founders & Women in Business |
| 2 | Tech Leadership & Engineering |
| 3 | Startup Founders & Entrepreneurs |
| 4 | Executive Coaches & Leadership Consultants |
| 5 | Wellness Coaches & Health Experts |
| 6 | Expat Life & International Living |
| 7 | Community Builders & Event Organizers |
| 8 | SaaS & Product Leaders |
| 9 | AI & Machine Learning Experts |
| 10 | Marketing & Brand Strategists |
| 11 | Venture Capital & Investors |
| 12 | Social Impact & Non-Profit Leaders |
| 13 | Sales & Revenue Strategists |
| 14 | Organizational Change Consultants |
| 15 | Personal Development Coaches |
| 16 | Spiritual Intelligence & Mindfulness |
| 17 | Career Transition Coaches |
| 18 | Content Creators & Storytellers |
| 19 | Pricing & Monetization Experts |
| 20 | Data & Analytics Leaders |
| 21 | HR & People Operations |
| 22 | Finance & Investing Experts |
| 23 | Parenting & Family |
| 24 | Health & Fitness Professionals |
| 25 | Mental Health & Therapy |
| 26 | Creative & Design Leaders |
| 27 | Education & Learning |
| 28 | Sustainability & ESG |
| 29 | Food & Nutrition |
| 30 | Travel & Lifestyle |
| 31 | General Business & Lifestyle |

---

## SECTION 11 : Champs AI — Scoring calculé (4 champs)

Source : Calcul local dans `parallel_scoring_v2.js`

| # | Champ Firestore | Type | Formule / Description |
|---|----------------|------|----------------------|
| 1 | `ai_engagement_level` | int (1-10) | Moyenne pondérée : Apple reviews (poids 3.0) + YouTube engagement (poids 3.0) + Freshness/activité (poids 2.0) + Présence réseaux sociaux (poids 1.0) |
| 2 | `ai_audience_size` | string | Small / Medium / Large / Very Large — basé sur combinaison YT subscribers + Apple review count |
| 3 | `ai_content_quality` | int (1-10) | Basé sur Apple rating (0-5 → échelle 1-10) avec bonus si nombre élevé de reviews (indicateur de confiance) |
| 4 | `ai_monetization_potential` | int (1-10) | 60% audience size score + 40% engagement level |

---

## SECTION 12 : Champs AI — Percentiles & Classement (7 champs)

Source : Calcul local dans `parallel_scoring_v2.js` — classement par catégorie et global

| # | Champ Firestore | Type | Description |
|---|----------------|------|-------------|
| 1 | `ai_category_percentile` | string | Classement dans sa niche : Top 1% / Top 5% / Top 10% / Top 25% / Top 50% / Standard |
| 2 | `ai_category_rank` | int | Position numérique dans sa catégorie (ex: #8 sur 150) |
| 3 | `ai_category_total` | int | Nombre total de podcasts dans cette catégorie |
| 4 | `ai_percentile_used_global` | boolean | true = fallback sur classement global (si < 10 podcasts dans la catégorie) |
| 5 | `ai_global_percentile` | string | Classement parmi TOUS les podcasts : Top 1% / 5% / 10% / 25% / 50% / Standard |
| 6 | `ai_global_rank` | int | Position numérique globale (ex: #245 sur 120000) |
| 7 | `ai_global_total` | int | Nombre total de podcasts dans toute la base |

**Power Score (formule de classement) :**
```
Power Score = log10(YT Subscribers) × 10 + log10(Apple Reviews) × 15 + log10(Episodes) × 5
```

---

## SECTION 13 : Champ AI — Badassery Score (1 champ)

Source : Calcul composite dans `parallel_scoring_v2.js`

| # | Champ Firestore | Type | Formule |
|---|----------------|------|---------|
| 1 | `ai_badassery_score` | int (0-100) | `(Engagement/10 × 40%) + (Audience Size mapping × 30%) + (Percentile mapping × 30%)` |

**Mappings utilisés :**

| Audience Size | Valeur /100 |
|--------------|-------------|
| Small | 25 |
| Medium | 50 |
| Large | 75 |
| Very Large | 100 |

| Percentile | Valeur /100 |
|-----------|-------------|
| Top 1% | 100 |
| Top 5% | 90 |
| Top 10% | 80 |
| Top 25% | 65 |
| Top 50% | 50 |
| Standard | 35 |

---

## SECTION 14 : Métadonnées Firestore (6 champs)

| # | Champ Firestore | Type | Description |
|---|----------------|------|-------------|
| 1 | `uploadedAt` | timestamp | Date/heure de l'upload initial dans Firestore |
| 2 | `uploadedFrom` | string | Nom du fichier source utilisé pour l'upload |
| 3 | `updatedAt` | timestamp | Date/heure de la dernière mise à jour du document |
| 4 | `aiCategorizationStatus` | string | Statut de la catégorisation : "completed" / "failed" / "pending" |
| 5 | `aiCategorizedAt` | timestamp | Date/heure de la catégorisation AI |
| 6 | `aiCategorizationError` | string | Message d'erreur si la catégorisation a échoué |

---

## SECTION 15 : Infos de base dans Firestore (9 champs)

Champs issus directement de PodcastIndex, stockés comme base du document Firestore.
Document ID = `itunesId` (string)

| # | Champ Firestore | Source | Type | Description |
|---|----------------|--------|------|-------------|
| 1 | `itunesId` | PodcastIndex | string | ID iTunes unique (= Document ID dans Firestore) |
| 2 | `title` | PodcastIndex | string | Nom du podcast |
| 3 | `description` | PodcastIndex | string | Description du podcast |
| 4 | `language` | PodcastIndex | string | Code langue (ex: "en") |
| 5 | `imageUrl` | PodcastIndex | string | URL de l'image de couverture |
| 6 | `url` | PodcastIndex | string | URL du flux RSS |
| 7 | `link` | PodcastIndex | string | Site web du podcast (alias: `website`) |
| 8 | `episodeCount` | PodcastIndex | int | Nombre total d'épisodes |
| 9 | `lastUpdate` | PodcastIndex | timestamp | Dernière mise à jour du flux RSS |

---

## RÉCAPITULATIF TOTAL

| # | Section | Source | Nb champs |
|---|---------|--------|-----------|
| 1 | PodcastIndex DB | SQLite query | 10 |
| 2 | Apple iTunes API | REST batch lookup | 5 |
| 3 | Apple Scraping | HTML parsing | 5 |
| 4 | PodcastIndex API | REST API | 1 |
| 5 | RSS — Infos podcast | XML/RSS parsing | 14 |
| 6 | RSS — Réseaux sociaux | PodcastIndex namespace | 6 |
| 7 | RSS — Épisodes (×10) | XML/RSS parsing | 60 (+40 optionnels) |
| 8 | Website Scraping | HTML + regex | 9 |
| 9 | YouTube — Chaîne | yt-dlp | 10 |
| 10 | YouTube — Vidéos (×10) | yt-dlp | 40 (+30 optionnels) |
| 11 | AI Gemini — Catégorisation | Gemini 2.0 Flash | 8 |
| 12 | AI — Scoring | Calcul local | 4 |
| 13 | AI — Percentiles | Calcul local | 7 |
| 14 | AI — Badassery Score | Calcul local | 1 |
| 15 | Métadonnées | Firestore | 6 |
| 16 | Infos de base | PodcastIndex → Firestore | 9 |
| | **TOTAL (champs de base)** | | **~195** |
| | **TOTAL (avec optionnels)** | | **~265** |

> Note : Le nombre exact varie selon la version du script utilisée. Les champs "optionnels" existent dans certaines versions (`production_enrichment_vm.py`) mais pas dans d'autres (`production_enrichment_v2.py`).

---
---

# SECTION 16 : CHAMPS DISPONIBLES NON EXPLOITÉS — AMÉLIORATIONS POSSIBLES

> Cette section liste TOUS les champs/données disponibles dans les sources existantes mais qui ne sont PAS encore extraits par le pipeline actuel. Classés par source, avec explication de l'utilité pour l'outreach.

---

## 16.1 — PodcastIndex SQLite DB : Colonnes inutilisées (~20 colonnes)

La base `podcastindex_feeds.db` contient ~40 colonnes, mais seules 10 sont extraites. Voici les colonnes disponibles non utilisées :

| # | Colonne | Type | Description | Utilité pour l'outreach |
|---|---------|------|-------------|------------------------|
| 1 | `category1` | string | 1ère catégorie Apple du podcast | Ciblage thématique sans passer par Gemini |
| 2 | `category2` | string | 2ème catégorie Apple | Ciblage secondaire |
| 3 | `category3` | string | 3ème catégorie Apple | Ciblage tertiaire |
| 4 | `category4` | string | 4ème catégorie Apple | Ciblage additionnel |
| 5 | `category5` | string | 5ème catégorie Apple | Ciblage additionnel |
| 6 | `category6` | string | 6ème catégorie Apple | Ciblage additionnel |
| 7 | `category7` | string | 7ème catégorie Apple | Ciblage additionnel |
| 8 | `category8` | string | 8ème catégorie Apple | Ciblage additionnel |
| 9 | `category9` | string | 9ème catégorie Apple | Ciblage additionnel |
| 10 | `category10` | string | 10ème catégorie Apple | Ciblage additionnel |
| 11 | `host` | string | Plateforme d'hébergement (Buzzsprout, Anchor, Podbean, Transistor...) | Segmentation par plateforme — cibler les créateurs sur une plateforme spécifique |
| 12 | `explicit` | int (0/1) | Flag contenu explicite | **Brand safety** — filtrer les contenus explicites pour des clients sensibles |
| 13 | `popularityScore` | int | Score de popularité PodcastIndex | Pré-filtrage gratuit avant scoring Gemini — prioriser les podcasts populaires |
| 14 | `newestItemPubdate` | timestamp | Date exacte du dernier épisode publié | Plus précis que `lastUpdate` pour identifier les podcasts vraiment actifs |
| 15 | `oldestItemPubdate` | timestamp | Date du tout premier épisode | Calculer l'âge/longévité du podcast — les vétérans vs les nouveaux |
| 16 | `updateFrequency` | int (secondes) | Fréquence de publication en secondes | Identifier les hebdomadaires vs mensuels vs quotidiens — cadence de production |
| 17 | `generator` | string | Logiciel/outil créant le flux (WordPress, Transistor, Buzzsprout...) | Profil technologique du créateur — cibler par stack technique |
| 18 | `podcastGuid` | string (UUID) | Identifiant universel PodcastIndex | Tracking cross-plateforme — identifier le même podcast sur différentes plateformes |
| 19 | `newestEnclosureDuration` | int (secondes) | Durée du dernier épisode | Format du podcast : court (<15min), moyen (30-60min), long (>60min) |
| 20 | `lastHttpStatus` | int | Code HTTP du dernier fetch du flux (200, 301, 404...) | **Santé du flux** — éviter l'outreach sur des feeds en erreur (404, 500) |
| 21 | `createdOn` | timestamp | Date d'ajout du podcast à PodcastIndex | Timeline d'adoption — quand le podcast a été indexé |
| 22 | `contentType` | string (MIME) | Type de contenu (audio/mpeg, video/mp4...) | Distinguer les **vidéo podcasts** des audio podcasts |
| 23 | `originalUrl` | string | URL RSS originale avant redirection | Tracking des migrations de flux — identifier les podcasts qui ont changé d'hébergeur |
| 24 | `itunesAuthor` | string | Nom de l'auteur depuis iTunes | **Backup contact** — nom plus fiable que le RSS si celui-ci est vide |
| 25 | `itunesOwnerName` | string | Nom du propriétaire depuis iTunes | Contact alternatif — souvent la personne qui a soumis le podcast à Apple |
| 26 | `itunesType` | string | "episodic" ou "serial" | Stratégie d'outreach différente : épisodique = invités ponctuels, serial = série planifiée |
| 27 | `newestEnclosureUrl` | string | URL directe du dernier fichier audio | Accès direct au dernier épisode pour écoute/validation avant outreach |
| 28 | `priority` | int | Priorité interne PodcastIndex | Indicateur de qualité/pertinence du flux |
| 29 | `chash` | string | Hash du contenu du flux | Détecter les changements de contenu entre deux scrapes |
| 30 | `dead` | int (0/1) | Podcast mort/archivé | Déjà utilisé en filtre, mais pourrait être stocké pour audit |

---

## 16.2 — Apple iTunes Lookup API : Champs inutilisés (~10 champs)

L'API `https://itunes.apple.com/lookup` retourne ~20 champs, mais seuls 5 sont extraits.

| # | Champ API | Type | Description | Utilité pour l'outreach |
|---|-----------|------|-------------|------------------------|
| 1 | `artistName` | string | Nom officiel du créateur/artiste sur Apple | Nom plus propre et standardisé que le RSS — meilleur pour la personnalisation d'emails |
| 2 | `collectionName` | string | Titre officiel du podcast sur Apple | Peut différer du titre RSS — version "marketing" du nom |
| 3 | `primaryGenreName` | string | Genre principal unique (ex: "Business") | Catégorie principale sans ambiguïté — plus précis que la liste complète de genres |
| 4 | `primaryGenreId` | int | ID numérique du genre principal | Filtrage programmatique par genre |
| 5 | `trackCount` | int | Nombre d'épisodes côté Apple | Peut différer de PodcastIndex — comparaison cross-plateforme |
| 6 | `releaseDate` | string (ISO) | Date de publication du podcast sur Apple | Date de lancement officielle — contexte historique |
| 7 | `country` | string (code pays) | Pays de distribution/origine (ex: "USA", "GBR") | **Ciblage géographique** — filtrer par marché/pays |
| 8 | `contentAdvisoryRating` | string | Rating détaillé : "Clean", "Explicit" | Plus granulaire que le simple flag explicit — **brand safety avancée** |
| 9 | `feedUrl` | string | URL du flux RSS depuis Apple | URL de backup/vérification — confirmer que le flux est le bon |
| 10 | `copyright` | string | Mention de copyright complète | Peut contenir le nom de l'organisation, du network, ou de la société de production |

---

## 16.3 — RSS Feed : Tags non parsés (~20 tags)

Le standard RSS 2.0 + iTunes namespace + PodcastIndex namespace offrent de nombreux tags non exploités.

### Tags podcast-level (canal)

| # | Tag RSS | Namespace | Type | Description | Utilité pour l'outreach |
|---|---------|-----------|------|-------------|------------------------|
| 1 | `<podcast:person>` | PodcastIndex | objet | **Noms des hosts/invités avec rôles** (host, guest, editor...) | **GOLDMINE** — identifie les influenceurs, permet le networking ciblé par personne |
| 2 | `<podcast:value>` | PodcastIndex | objet | Modèle de monétisation (boost, streaming sats, donations) | Identifier les podcasts déjà monétisés — sponsorship-ready, ou ceux ouverts aux sponsors |
| 3 | `<podcast:location>` | PodcastIndex | string | Lieu d'enregistrement/origine (ville, pays, coordonnées) | **Ciblage géographique** — "podcasts basés à Paris", "créateurs de Vancouver" |
| 4 | `<podcast:medium>` | PodcastIndex | string | Format exact : podcast/music/video/audiobook/newsletter | Distinguer les vrais podcasts des autres formats — filtrage précis |
| 5 | `<podcast:locked>` | PodcastIndex | string | Flux verrouillé/exclusif (yes/no) | Identifier les contenus exclusifs (Apple Music, Spotify exclusives) |
| 6 | `<itunes:explicit>` | iTunes | string | "true"/"false" — contenu explicite | **Brand safety** — filtrer pour les clients qui veulent du contenu "clean" |
| 7 | `<itunes:category>` | iTunes | objet | Catégories avec sous-catégories (ex: Business > Marketing) | Ciblage très granulaire par sous-catégorie — plus précis que les genres Apple API |
| 8 | `<itunes:image>` | iTunes | string (URL) | Artwork haute résolution du podcast | Souvent différent de `imageUrl` PodcastIndex — meilleure qualité pour l'affichage |
| 9 | `<lastBuildDate>` | RSS standard | string (date) | Dernière fois que le flux a été généré | **Santé du flux** — un flux pas regénéré depuis longtemps = podcast potentiellement abandonné |
| 10 | `<generator>` | RSS standard | string | Logiciel ayant créé le flux RSS | Identifie la plateforme (WordPress, Squarespace, Transistor...) |
| 11 | `<ttl>` | RSS standard | int (minutes) | Time-to-live — fréquence de rafraîchissement suggérée | Indice sur la fréquence de publication voulue par le créateur |
| 12 | `<webMaster>` | RSS standard | string (email) | Email du webmaster technique | **Contact alternatif** — souvent l'équipe technique/production |
| 13 | `<podcast:chapters>` | PodcastIndex | string (URL) | URL du fichier de chapitres JSON | Indique un podcast avec production sophistiquée (chapitrage = professionnel) |
| 14 | `<podcast:trailer>` | PodcastIndex | objet | Info sur le trailer officiel du podcast | Le trailer est souvent le meilleur résumé du podcast — utile pour qualification |
| 15 | `<podcast:soundbite>` | PodcastIndex | objet | Extraits audio mis en avant par le créateur | Moments forts sélectionnés — utile pour comprendre le style du podcast |
| 16 | `<podcast:txt>` | PodcastIndex | string | Texte libre (contact, termes, notes) | Peut contenir des infos de contact supplémentaires |
| 17 | `<podcast:remoteItem>` | PodcastIndex | objet | Épisodes crosspostés depuis d'autres podcasts | Révèle les collaborations existantes et le réseau du podcaster |

### Tags épisode-level (par épisode)

| # | Tag RSS | Namespace | Type | Description | Utilité pour l'outreach |
|---|---------|-----------|------|-------------|------------------------|
| 18 | `<itunes:episodeType>` | iTunes | string | "full" / "trailer" / "bonus" | Filtrer les vrais épisodes vs trailers/bonus — comptage plus précis |
| 19 | `<itunes:subtitle>` | iTunes | string | Sous-titre spécifique à l'épisode | Souvent plus descriptif que le titre — meilleur résumé du contenu |
| 20 | `<content:encoded>` | Content namespace | string (HTML) | Contenu HTML complet de l'épisode | Plus riche que `<description>` — contient souvent des liens, bios invités, show notes |
| 21 | `<enclosure length>` | RSS standard | int (bytes) | Taille du fichier audio | Indicateur de qualité de production (gros fichier = haute qualité audio) |
| 22 | `<enclosure type>` | RSS standard | string (MIME) | Codec audio (audio/mpeg, audio/mp4, audio/x-m4a) | Qualité technique — les podcasts pro utilisent souvent des codecs spécifiques |
| 23 | `<comments>` | RSS standard | string (URL) | URL du fil de discussion/commentaires | Accès à la communauté — voir les réactions des auditeurs |
| 24 | `<author>` (épisode) | RSS standard | string | Auteur spécifique de l'épisode | Différent de l'auteur du podcast si l'épisode a un invité spécifique |
| 25 | `<category>` (épisode) | RSS standard | string | Catégorie spécifique à l'épisode | Certains épisodes couvrent des sujets différents du podcast principal |

---

## 16.4 — PodcastIndex REST API : Endpoints et champs inutilisés (~40 champs)

Actuellement, seul `ownerEmail` est récupéré depuis l'endpoint `/podcasts/byfeedid`. L'API offre beaucoup plus.

### Endpoint `/podcasts/byfeedid` — Champs supplémentaires disponibles

| # | Champ API | Type | Description | Utilité pour l'outreach |
|---|-----------|------|-------------|------------------------|
| 1 | `feedTitle` | string | Titre officiel du flux | Titre standardisé — backup si le titre PodcastIndex est tronqué |
| 2 | `feedUrl` | string | URL du flux RSS | Vérification/backup de l'URL |
| 3 | `description` | string | Description complète | Description depuis l'API (peut différer du RSS) |
| 4 | `image` | string (URL) | URL de l'artwork | Artwork depuis l'API — souvent à jour |
| 5 | `lastUpdate` | timestamp | Dernière mise à jour | Fraîcheur côté API |
| 6 | `explicit` | boolean | Contenu explicite | Confirmation du flag explicit |
| 7 | `language` | string | Langue du podcast | Confirmation de la langue |
| 8 | `categories` | object | Catégories structurées (ID → nom) | Catégories avec IDs numériques — ciblage programmatique |
| 9 | `funding` | array | URLs de financement avec noms | Liens de financement (Patreon, Buy Me a Coffee, etc.) — monétisation |
| 10 | `socialInteraction` | array | Endpoints d'interaction sociale | Liens sociaux déclarés dans l'API |
| 11 | `locked` | boolean | Flux verrouillé | Identifier les exclusivités |
| 12 | `medium` | string | Format du contenu | Classification précise du format |

### Endpoint `/value/byfeedid` — Modèle de monétisation

| # | Champ API | Type | Description | Utilité pour l'outreach |
|---|-----------|------|-------------|------------------------|
| 13 | `model.type` | string | Type de modèle de valeur (lightning, paypal, etc.) | Comment le podcast accepte les paiements |
| 14 | `model.method` | string | Méthode de paiement | Détails techniques du paiement |
| 15 | `destinations` | array | Répartition des revenus (splits) | **Révèle si le podcast est indépendant ou rattaché à un network/producteur** |
| 16 | `destinations[].name` | string | Nom du destinataire | Identifier les personnes/organisations derrière le podcast |
| 17 | `destinations[].split` | int | Pourcentage du split | Structure financière du podcast |

### Endpoint `/trending`

| # | Champ API | Type | Description | Utilité pour l'outreach |
|---|-----------|------|-------------|------------------------|
| 18 | `feeds` | array | Podcasts tendance actuellement | **Découverte de tendances** — identifier les podcasts montants avant les concurrents |
| 19 | `feeds[].trendScore` | int | Score de tendance | Quantifier le buzz actuel d'un podcast |

### Endpoint `/episodes/byfeedid`

| # | Champ API | Type | Description | Utilité pour l'outreach |
|---|-----------|------|-------------|------------------------|
| 20 | `episodes[].datePublished` | timestamp | Date de publication précise | Plus fiable que `<pubDate>` RSS pour certains flux |
| 21 | `episodes[].duration` | int | Durée en secondes | Format normalisé (vs le RSS qui peut être HH:MM:SS ou secondes) |
| 22 | `episodes[].contentLinks` | array | Liens de contenu associés | Ressources additionnelles par épisode |

### Endpoint `/categories`

| # | Champ API | Type | Description | Utilité pour l'outreach |
|---|-----------|------|-------------|------------------------|
| 23 | `feeds` | array | Taxonomie complète PodcastIndex | Accès à toute l'arborescence de catégories pour un filtrage avancé |

### Endpoint `/stats`

| # | Champ API | Type | Description | Utilité pour l'outreach |
|---|-----------|------|-------------|------------------------|
| 24 | `feedCount` | int | Nombre total de podcasts indexés | Intelligence compétitive — taille du marché |
| 25 | `episodeCount` | int | Nombre total d'épisodes | Volume global de contenu |

---

## 16.5 — YouTube yt-dlp : Champs inutilisés (~15 champs)

La librairie `yt-dlp` extrait beaucoup plus de données que ce qui est actuellement collecté.

### Champs chaîne YouTube

| # | Champ yt-dlp | Type | Description | Utilité pour l'outreach |
|---|-------------|------|-------------|------------------------|
| 1 | `channel_is_verified` | boolean | Badge vérifié YouTube (coche) | **Crédibilité** — les chaînes vérifiées sont plus légitimes/professionnelles |
| 2 | `channel_creation_date` | string (date) | Date de création de la chaîne | Ancienneté du créateur sur YouTube — vétéran vs nouveau |
| 3 | `channel_country` | string (code) | Pays du créateur | **Ciblage géographique** — localisation du podcaster |
| 4 | `playlist_count` | int | Nombre de playlists | Organisation de la chaîne — indicateur de professionnalisme |
| 5 | `channel_description` | string | Description/bio de la chaîne | Positionnement, mission, liens vers réseaux sociaux |

### Champs par vidéo (pour chaque vidéo 1-10)

| # | Champ yt-dlp | Type | Description | Utilité pour l'outreach |
|---|-------------|------|-------------|------------------------|
| 6 | `like_count` | int | Nombre de likes sur la vidéo | **Engagement réel** — ratio likes/vues mesure la qualité perçue |
| 7 | `comment_count` | int | Nombre de commentaires | **Communauté active** — beaucoup de commentaires = audience engagée |
| 8 | `tags` | array[string] | Mots-clés/tags de la vidéo | Ciblage par contenu — les tags révèlent les sujets exacts |
| 9 | `categories` | array[string] | Catégories YouTube (ex: "Education", "Entertainment") | Classification alternative au-delà des catégories podcast |
| 10 | `upload_date` | string (YYYYMMDD) | Date de publication précise | Calculer la **fréquence de publication YouTube** — régularité du créateur |
| 11 | `description` | string | Description complète de la vidéo | Contient souvent des **liens sponsor, contacts, show notes, liens sociaux** |
| 12 | `automatic_captions` | object | Sous-titres automatiques disponibles | Indicateur d'accessibilité et de professionnalisme |
| 13 | `chapters` | array | Chapitres de la vidéo | Production sophistiquée — vidéos chapitrées = créateur organisé |
| 14 | `thumbnail` | string (URL) | URL de la miniature | Preview visuelle du contenu |
| 15 | `age_limit` | int | Limite d'âge (0, 13, 18) | **Brand safety** — contenu adapté à quel public |

---

## 16.6 — Apple Podcasts Scraping : Données additionnelles (~10 champs)

La page Apple Podcasts contient plus d'informations que ce qui est actuellement extrait.

| # | Donnée | Type | Méthode d'extraction | Utilité pour l'outreach |
|---|--------|------|---------------------|------------------------|
| 1 | Distribution des étoiles (1★ à 5★) | object | JSON-LD ou HTML parsing | **Analyse de sentiment** — 100×5★ vs 50×5★+50×1★ sont très différents |
| 2 | Position dans les charts | int/string | HTML parsing ou Apple Charts API | **Classement en temps réel** — "Top 50 Business" = cible premium |
| 3 | Podcasts similaires/related | array[string] | HTML parsing section "Vous aimerez aussi" | **Mapping de réseau** — trouver des audiences adjacentes et des concurrents |
| 4 | Date du premier épisode | string (date) | HTML parsing | Date de lancement exacte côté Apple — plus fiable pour les podcasts anciens |
| 5 | Date du dernier épisode | string (date) | HTML parsing | Fraîcheur côté Apple — confirmation de l'activité |
| 6 | Affiliation réseau/network | string | HTML parsing (badge ou mention) | Identifier si le podcast fait partie d'un network (iHeart, Wondery, Spotify Studios...) |
| 7 | Nombre d'épisodes côté Apple | int | HTML parsing | Comparaison cross-plateforme avec PodcastIndex |
| 8 | Texte des top reviews | array[string] | HTML parsing des reviews | Comprendre ce que l'audience aime/n'aime pas — personnaliser le pitch d'outreach |
| 9 | Noms des reviewers | array[string] | HTML parsing | Identifier les superfans/influenceurs dans l'audience |
| 10 | Description curatée Apple | string | HTML parsing | Version "marketing" de la description — souvent éditée par le créateur pour Apple |

---

## 16.7 — Résumé des champs non exploités par priorité

### Priorité HAUTE (Quick wins — données déjà accessibles)

| # | Champ | Source | Effort | Impact |
|---|-------|--------|--------|--------|
| 1 | `category1` à `category10` | PodcastIndex DB | Minimal (déjà dans la DB) | Ciblage thématique immédiat |
| 2 | `explicit` | PodcastIndex DB | Minimal | Brand safety |
| 3 | `popularityScore` | PodcastIndex DB | Minimal | Pré-filtre avant Gemini |
| 4 | `host` | PodcastIndex DB | Minimal | Segmentation par plateforme |
| 5 | `newestItemPubdate` | PodcastIndex DB | Minimal | Fraîcheur précise |
| 6 | `updateFrequency` | PodcastIndex DB | Minimal | Cadence de publication |
| 7 | `itunesType` | PodcastIndex DB | Minimal | Stratégie d'outreach |
| 8 | `lastHttpStatus` | PodcastIndex DB | Minimal | Santé du flux |
| 9 | `artistName` | Apple iTunes API | Minimal (déjà dans le batch) | Nom propre du créateur |
| 10 | `country` | Apple iTunes API | Minimal (déjà dans le batch) | Ciblage géo |

### Priorité MOYENNE (Nécessite modification des scripts)

| # | Champ | Source | Effort | Impact |
|---|-------|--------|--------|--------|
| 11 | `<podcast:person>` | RSS parsing | Moyen | Identification des invités/hosts |
| 12 | `<podcast:value>` | RSS parsing | Moyen | Modèle de monétisation |
| 13 | `<itunes:explicit>` | RSS parsing | Faible | Brand safety (confirmation) |
| 14 | `<itunes:category>` | RSS parsing | Moyen | Sous-catégories granulaires |
| 15 | `<podcast:location>` | RSS parsing | Moyen | Ciblage géographique |
| 16 | `channel_is_verified` | YouTube yt-dlp | Faible | Crédibilité créateur |
| 17 | `like_count` + `comment_count` | YouTube yt-dlp | Faible | Engagement réel |
| 18 | `upload_date` (vidéo) | YouTube yt-dlp | Faible | Fréquence de publication YT |
| 19 | `contentAdvisoryRating` | Apple iTunes API | Minimal | Brand safety détaillée |
| 20 | `releaseDate` | Apple iTunes API | Minimal | Date de lancement |

### Priorité BASSE (Intelligence avancée)

| # | Champ | Source | Effort | Impact |
|---|-------|--------|--------|--------|
| 21 | `/value/byfeedid` splits | PodcastIndex API | Élevé (nouvel endpoint) | Détection de networks |
| 22 | `/trending` | PodcastIndex API | Élevé (nouvel endpoint) | Tendances marché |
| 23 | Podcasts similaires | Apple Scraping | Élevé (nouveau parsing) | Mapping réseau |
| 24 | Position charts | Apple Scraping | Élevé (nouveau parsing) | Classement temps réel |
| 25 | Distribution étoiles | Apple Scraping | Moyen (nouveau parsing) | Analyse sentiment |

---

## TOTAL GÉNÉRAL : Champs exploités vs disponibles

| Source | Champs utilisés | Champs disponibles | Champs inutilisés | % exploité |
|--------|----------------|-------------------|-------------------|------------|
| PodcastIndex DB | 10 | ~40 | ~30 | 25% |
| Apple iTunes API | 5 | ~15 | ~10 | 33% |
| Apple Scraping | 5 | ~15 | ~10 | 33% |
| PodcastIndex API | 1 | ~25 | ~24 | 4% |
| RSS Feed (canal) | 20 | ~45 | ~25 | 44% |
| RSS Feed (épisodes) | 60 | ~100 | ~40 | 60% |
| YouTube yt-dlp (chaîne) | 10 | ~20 | ~10 | 50% |
| YouTube yt-dlp (vidéos) | 40 | ~70 | ~30 | 57% |
| **TOTAL** | **~151** | **~330** | **~179** | **~46%** |

> Le pipeline actuel exploite environ **46% des données disponibles**. Les 54% restants incluent des champs stratégiques pour le ciblage, la brand safety, la détection de tendances, et le mapping de réseau.
