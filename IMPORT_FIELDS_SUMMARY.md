# 📦 COMPLETE DATA IMPORT - ALL FIELDS

## ✅ Script Ready: `scripts/import_enriched_data.js`

This script imports **ALL AVAILABLE DATA** from your enriched JSON files into Firestore.

## 🎯 Files to Import (42 total)

### Enriched Files (20 files)
- `enriched_vm1.json` through `enriched_vm20.json`

### Checkpoint Files (2 files)
- `checkpoint_vm9.json`
- `checkpoint_vm18.json`

### Remaining Split Files (20 files)
- `remaining_split/podcasts_vm1.json` through `podcasts_vm20.json`

---

## 📋 ALL FIELDS BEING IMPORTED

### 1. Basic Podcast Info (8 fields)
- ✅ `title` - Podcast title
- ✅ `description` - Full description
- ✅ `language` - Language code (e.g., "en")
- ✅ `imageUrl` - Podcast cover image
- ✅ `url` - Podcast URL
- ✅ `link` - Alternative link
- ✅ `website` - Podcast website
- ✅ `lastUpdate` - Last update timestamp

### 2. Email Fields (2 fields)
- ✅ `rss_owner_email` - Email from RSS feed owner tag
- ✅ `website_email` - Email scraped from website

### 3. Apple Podcast Data (8 fields)
- ✅ `apple_rating` - Average rating (0-5)
- ✅ `apple_rating_count` - Number of ratings
- ✅ `apple_api_url` - Apple Podcasts URL
- ✅ `apple_api_artist_id` - Artist ID on Apple
- ✅ `apple_api_artwork_url` - High-res artwork URL
- ✅ `apple_api_genres` - Array of genre names
- ✅ `apple_api_genre_ids` - Array of genre IDs
- ✅ `apple_scrape_status` - Scraping status

### 4. RSS Feed Data (6 fields)
- ✅ `rss_url` - RSS feed URL
- ✅ `rss_owner_name` - Owner name from RSS
- ✅ `rss_author` - Author from RSS
- ✅ `rss_description` - Description from RSS
- ✅ `rss_website` - Website from RSS
- ✅ `rss_status` - RSS scraping status

### 5. Episode Data (61 fields)
- ✅ `episodeCount` - Total number of episodes

**RSS Episodes 1-10 (60 fields total):**
For each episode (ep1 through ep10):
- ✅ `rss_ep{N}_title` - Episode title
- ✅ `rss_ep{N}_date` - Publication date
- ✅ `rss_ep{N}_description` - Episode description
- ✅ `rss_ep{N}_duration` - Episode duration
- ✅ `rss_ep{N}_audio_url` - Direct audio file URL
- ✅ `rss_ep{N}_guid` - Unique episode identifier

### 6. YouTube Data (44 fields)
**Channel Info (4 fields):**
- ✅ `yt_subscribers` - Subscriber count
- ✅ `yt_channel_name` - Channel name
- ✅ `yt_channel_id` - YouTube channel ID
- ✅ `youtube_status` - Scraping status

**YouTube Videos 1-10 (40 fields total):**
For each video (1 through 10):
- ✅ `yt_video_{N}_title` - Video title
- ✅ `yt_video_{N}_views` - View count
- ✅ `yt_video_{N}_duration` - Video duration
- ✅ `yt_video_{N}_id` - YouTube video ID

### 7. Social Media Links (8 fields)
- ✅ `website_facebook` - Facebook page URL
- ✅ `website_instagram` - Instagram profile URL
- ✅ `website_twitter` - Twitter/X profile URL
- ✅ `website_linkedin` - LinkedIn profile URL
- ✅ `website_youtube` - YouTube channel URL
- ✅ `website_spotify` - Spotify profile URL
- ✅ `website_tiktok` - TikTok profile URL
- ✅ `website_status` - Website scraping status

---

## 📊 TOTAL FIELDS: 137 enriched fields

### Breakdown by Category:
- Basic Info: 8 fields
- Emails: 2 fields
- Apple Data: 8 fields
- RSS Data: 6 fields
- Episodes: 61 fields (1 count + 60 episode details)
- YouTube: 44 fields (4 channel + 40 video details)
- Social Media: 8 fields

---

## 🚀 How to Run the Import

### Step 1: Open PowerShell or CMD
```bash
cd "C:\Users\admin\OneDrive\Bureau\Dossier danielle"
```

### Step 2: Run the import script
```bash
node scripts/import_enriched_data.js
```

### Step 3: Monitor progress
The script will show:
- ✅ Updated podcasts count
- ⏭️ Skipped podcasts (not found in Firestore)
- ❌ Errors encountered
- 💾 Batch commits (every 500 updates)

---

## 🔍 How It Works

1. **Finds existing podcasts** by matching `showName` field
2. **Merges enriched data** into existing Firestore documents
3. **Preserves existing data** - only adds new enriched fields
4. **Batch processing** - commits every 500 updates for performance
5. **Tracks metadata**:
   - `importedFrom`: Source file (e.g., "enriched_vm1", "checkpoint_vm9")
   - `importedAt`: Import timestamp
   - `updatedAt`: Last update timestamp

---

## ✨ What You Get

After import, EVERY podcast in Firestore will have (when available):
- 📧 Multiple email sources for intelligent email selection
- ⭐ Apple ratings and review counts
- 📻 RSS feed details and owner info
- 🎙️ Last 10 episodes with full metadata + audio URLs
- 📺 YouTube channel stats + last 10 videos with views
- 🔗 All social media links (Facebook, Instagram, Twitter, LinkedIn, Spotify, TikTok, YouTube)
- 🖼️ High-resolution artwork URLs
- 🏷️ Genre tags and categories
- 📊 Episode counts and statistics

---

## 🎉 VOUS AVEZ LA TOTALE!

Oui, le script importe **TOUS** les éléments disponibles dans les JSON:
- ✅ Infos YouTube (subscribers, videos, views, duration, IDs)
- ✅ Apple ratings et review counts
- ✅ Tous les 10 derniers épisodes RSS (title, date, description, duration, audio_url, guid)
- ✅ Tous les 10 dernières vidéos YouTube (title, views, duration, id)
- ✅ Tous les liens réseaux sociaux (Facebook, Instagram, Twitter, LinkedIn, Spotify, TikTok, YouTube)
- ✅ Tous les emails disponibles (RSS owner, website)
- ✅ Toutes les métadonnées Apple (genres, artwork, URLs)
- ✅ Tous les statuts de scraping (RSS, website, YouTube, Apple)

**137 CHAMPS AU TOTAL - TOUT EST LÀ! 🚀**
