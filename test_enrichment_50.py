"""
TEST COMPLET - 50 podcasts
==========================
RSS + Apple Scraping + Website Scraping + YouTube

Ce script teste toute la chaîne d'enrichissement sur 50 podcasts.
"""

import sqlite3
import requests
import json
import time
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
import sys

# ============== CONFIGURATION ==============
DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcastindex_feeds.db\podcastindex_feeds.db"
OUTPUT_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\test_50_results.json"
TEST_LIMIT = 50

# ============== LOGGING ==============
def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

# ============== 1. GET PODCASTS ==============
def get_test_podcasts():
    log("=" * 60)
    log("ÉTAPE 1: Récupération de 50 podcasts")
    log("=" * 60)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    sixty_days_ago = int(time.time()) - (60 * 24 * 60 * 60)

    query = f'''
        SELECT id, url, title, itunesId, link, description, language
        FROM podcasts
        WHERE lastUpdate > {sixty_days_ago}
        AND dead = 0
        AND episodeCount > 49
        AND itunesId > 0
        AND (language LIKE 'en%' OR language LIKE 'EN%')
        LIMIT {TEST_LIMIT}
    '''

    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    podcasts = []
    for row in rows:
        podcasts.append({
            'id': row[0],
            'rss_url': row[1],
            'title': row[2],
            'itunes_id': row[3],
            'website': row[4],
            'description': row[5],
            'language': row[6],
        })

    log(f"Podcasts récupérés: {len(podcasts)}")
    return podcasts

# ============== 2. RSS PARSING ==============
def parse_rss(rss_url):
    result = {
        'rss_owner_email': '',
        'rss_owner_name': '',
        'rss_author': '',
        'rss_website': '',
        'rss_description': '',
    }

    try:
        resp = requests.get(rss_url, timeout=15, headers={'User-Agent': 'PodcastEnricher/1.0'})
        if resp.status_code != 200:
            return result

        root = ET.fromstring(resp.content)
        channel = root.find('channel')
        if channel is None:
            return result

        ns_itunes = '{http://www.itunes.com/dtds/podcast-1.0.dtd}'

        result['rss_website'] = channel.findtext('link', '')
        result['rss_author'] = channel.findtext(f'{ns_itunes}author', '')
        result['rss_description'] = (channel.findtext(f'{ns_itunes}summary', '') or channel.findtext('description', ''))[:500]

        owner = channel.find(f'{ns_itunes}owner')
        if owner is not None:
            result['rss_owner_email'] = owner.findtext(f'{ns_itunes}email', '')
            result['rss_owner_name'] = owner.findtext(f'{ns_itunes}name', '')

    except Exception as e:
        result['rss_error'] = str(e)[:100]

    return result

def enrich_rss(podcasts):
    log("=" * 60)
    log("ÉTAPE 2: RSS Parsing")
    log("=" * 60)

    for i, p in enumerate(podcasts):
        rss_data = parse_rss(p['rss_url'])
        p.update(rss_data)
        if (i + 1) % 10 == 0:
            log(f"RSS: {i + 1}/{len(podcasts)}")

    # Stats
    with_email = sum(1 for p in podcasts if p.get('rss_owner_email'))
    log(f"Avec email: {with_email}/{len(podcasts)} ({round(with_email/len(podcasts)*100)}%)")

    return podcasts

# ============== 3. APPLE SCRAPING ==============
def scrape_apple(itunes_id):
    result = {
        'apple_rating': None,
        'apple_rating_count': None,
        'apple_review_count': None,
    }

    url = f"https://podcasts.apple.com/us/podcast/id{itunes_id}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code != 200:
            result['apple_error'] = f'HTTP {resp.status_code}'
            return result

        text = resp.text

        # Méthode 1: Chercher "X out of 5" pattern
        rating_match = re.search(r'(\d+\.?\d*)\s*out of 5', text, re.IGNORECASE)
        if rating_match:
            result['apple_rating'] = float(rating_match.group(1))

        # Méthode 2: Chercher "X Ratings" pattern
        count_match = re.search(r'([\d,]+)\s*Ratings?', text, re.IGNORECASE)
        if count_match:
            result['apple_rating_count'] = int(count_match.group(1).replace(',', ''))

        # Méthode 3: Chercher "X Reviews" pattern
        review_match = re.search(r'([\d,]+)\s*Reviews?', text, re.IGNORECASE)
        if review_match:
            result['apple_review_count'] = int(review_match.group(1).replace(',', ''))

    except Exception as e:
        result['apple_error'] = str(e)[:100]

    return result

def enrich_apple_scraping(podcasts):
    log("=" * 60)
    log("ÉTAPE 3: Apple Scraping")
    log("=" * 60)

    for i, p in enumerate(podcasts):
        apple_data = scrape_apple(p['itunes_id'])
        p.update(apple_data)
        if (i + 1) % 10 == 0:
            log(f"Apple: {i + 1}/{len(podcasts)}")
        time.sleep(1)  # Rate limit

    # Stats
    with_rating = sum(1 for p in podcasts if p.get('apple_rating'))
    log(f"Avec rating: {with_rating}/{len(podcasts)} ({round(with_rating/len(podcasts)*100)}%)")

    return podcasts

# ============== 4. WEBSITE SCRAPING ==============
def scrape_website(url):
    result = {
        'website_youtube': '',
        'website_twitter': '',
        'website_instagram': '',
        'website_facebook': '',
        'website_linkedin': '',
        'website_tiktok': '',
        'website_email': '',
    }

    if not url or not url.startswith('http'):
        return result

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }

    try:
        resp = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        if resp.status_code != 200:
            return result

        text = resp.text

        # YouTube
        yt_match = re.search(r'(https?://(www\.)?(youtube\.com/(channel/|c/|@)|youtu\.be/)[^\s"\'<>]+)', text)
        if yt_match:
            result['website_youtube'] = yt_match.group(1)

        # Twitter/X
        tw_match = re.search(r'(https?://(www\.)?(twitter\.com|x\.com)/[^\s"\'<>]+)', text)
        if tw_match:
            result['website_twitter'] = tw_match.group(1)

        # Instagram
        ig_match = re.search(r'(https?://(www\.)?instagram\.com/[^\s"\'<>]+)', text)
        if ig_match:
            result['website_instagram'] = ig_match.group(1)

        # Facebook
        fb_match = re.search(r'(https?://(www\.)?facebook\.com/[^\s"\'<>]+)', text)
        if fb_match:
            result['website_facebook'] = fb_match.group(1)

        # LinkedIn
        li_match = re.search(r'(https?://(www\.)?linkedin\.com/(company|in)/[^\s"\'<>]+)', text)
        if li_match:
            result['website_linkedin'] = li_match.group(1)

        # TikTok
        tt_match = re.search(r'(https?://(www\.)?tiktok\.com/@[^\s"\'<>]+)', text)
        if tt_match:
            result['website_tiktok'] = tt_match.group(1)

        # Email
        email_match = re.search(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', text)
        if email_match:
            email = email_match.group(1)
            # Filtrer les emails génériques
            if not any(x in email.lower() for x in ['example.com', 'wixpress', 'sentry.io', 'schema.org']):
                result['website_email'] = email

    except Exception as e:
        result['website_error'] = str(e)[:100]

    return result

def enrich_website(podcasts):
    log("=" * 60)
    log("ÉTAPE 4: Website Scraping")
    log("=" * 60)

    for i, p in enumerate(podcasts):
        # Utiliser rss_website ou website de la DB
        url = p.get('rss_website') or p.get('website')
        website_data = scrape_website(url)
        p.update(website_data)
        if (i + 1) % 10 == 0:
            log(f"Website: {i + 1}/{len(podcasts)}")
        time.sleep(0.5)

    # Stats
    with_yt = sum(1 for p in podcasts if p.get('website_youtube'))
    with_tw = sum(1 for p in podcasts if p.get('website_twitter'))
    with_email = sum(1 for p in podcasts if p.get('website_email'))
    log(f"Avec YouTube: {with_yt}/{len(podcasts)}")
    log(f"Avec Twitter: {with_tw}/{len(podcasts)}")
    log(f"Avec email (website): {with_email}/{len(podcasts)}")

    return podcasts

# ============== 5. YOUTUBE (yt-dlp) ==============
def get_youtube_info(youtube_url):
    result = {
        'yt_channel_id': '',
        'yt_channel_name': '',
        'yt_subscribers': None,
        'yt_description': '',
        'yt_videos': [],
    }

    if not youtube_url:
        return result

    try:
        import yt_dlp

        # Channel info
        ydl_opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'playlist_items': '1:10',
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)

            result['yt_channel_id'] = info.get('channel_id', '')
            result['yt_channel_name'] = info.get('channel', info.get('uploader', ''))
            result['yt_description'] = (info.get('description', '') or '')[:500]

            # Subscribers from channel
            if 'channel_follower_count' in info:
                result['yt_subscribers'] = info.get('channel_follower_count')

            # Videos
            entries = info.get('entries', [])
            for vid in entries[:10]:
                if vid:
                    result['yt_videos'].append({
                        'id': vid.get('id', ''),
                        'title': vid.get('title', ''),
                        'views': vid.get('view_count'),
                        'duration': vid.get('duration'),
                    })

        # Get more details for first video to get subscribers
        if result['yt_videos'] and not result['yt_subscribers']:
            video_url = f"https://www.youtube.com/watch?v={result['yt_videos'][0]['id']}"
            ydl_opts2 = {'quiet': True, 'skip_download': True}
            with yt_dlp.YoutubeDL(ydl_opts2) as ydl:
                vid_info = ydl.extract_info(video_url, download=False)
                result['yt_subscribers'] = vid_info.get('channel_follower_count')
                # Update first video with more details
                result['yt_videos'][0]['likes'] = vid_info.get('like_count')
                result['yt_videos'][0]['date'] = vid_info.get('upload_date')
                result['yt_videos'][0]['description'] = (vid_info.get('description', '') or '')[:300]

    except Exception as e:
        result['yt_error'] = str(e)[:100]

    return result

def enrich_youtube(podcasts):
    log("=" * 60)
    log("ÉTAPE 5: YouTube (yt-dlp)")
    log("=" * 60)

    # Filtrer ceux qui ont un lien YouTube
    with_yt = [p for p in podcasts if p.get('website_youtube')]
    log(f"Podcasts avec YouTube: {len(with_yt)}/{len(podcasts)}")

    for i, p in enumerate(with_yt):
        yt_data = get_youtube_info(p['website_youtube'])
        p.update(yt_data)
        log(f"YouTube: {i + 1}/{len(with_yt)} - {p.get('yt_channel_name', 'N/A')} ({p.get('yt_subscribers', 'N/A')} subs)")
        time.sleep(1)

    return podcasts

# ============== MAIN ==============
def main():
    start = time.time()

    log("=" * 60)
    log("TEST COMPLET - 50 PODCASTS")
    log("=" * 60)

    # 1. Get podcasts
    podcasts = get_test_podcasts()

    # 2. RSS
    podcasts = enrich_rss(podcasts)

    # 3. Apple Scraping
    podcasts = enrich_apple_scraping(podcasts)

    # 4. Website Scraping
    podcasts = enrich_website(podcasts)

    # 5. YouTube
    podcasts = enrich_youtube(podcasts)

    # Save results
    log("=" * 60)
    log("SAUVEGARDE")
    log("=" * 60)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(podcasts, f, indent=2, ensure_ascii=False)

    log(f"Résultats sauvegardés: {OUTPUT_FILE}")

    # Final stats
    elapsed = time.time() - start
    log("=" * 60)
    log("RÉSUMÉ")
    log("=" * 60)
    log(f"Temps total: {round(elapsed/60, 2)} minutes")
    log(f"Podcasts traités: {len(podcasts)}")
    log(f"Avec email (RSS): {sum(1 for p in podcasts if p.get('rss_owner_email'))}")
    log(f"Avec email (website): {sum(1 for p in podcasts if p.get('website_email'))}")
    log(f"Avec rating Apple: {sum(1 for p in podcasts if p.get('apple_rating'))}")
    log(f"Avec YouTube: {sum(1 for p in podcasts if p.get('yt_channel_id'))}")
    log("=" * 60)

if __name__ == "__main__":
    main()
