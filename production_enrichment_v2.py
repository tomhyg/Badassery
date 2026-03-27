#!/usr/bin/env python3
"""
Production Enrichment Script V2
- Sauvegarde tous les 500 podcasts
- gc.collect() pour libérer la mémoire
- Reprise automatique si crash
"""

import json
import os
import sys
import time
import re
import gc
import requests
from datetime import datetime
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

# ============================================================
# CONFIGURATION
# ============================================================
PODCASTS_FILE = "podcasts_remaining.json"
CHECKPOINT_FILE = "checkpoint_vm{}.json"
OUTPUT_FILE = "enriched_vm{}.json"
PROGRESS_FILE = "progress_vm.json"
SAVE_EVERY = 500  # Sauvegarde tous les 500 podcasts

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

# ============================================================
# LOGGING
# ============================================================
def log(message):
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)

def update_progress(vm_num, processed, total, status):
    progress = {
        "vm": vm_num,
        "processed": processed,
        "total": total,
        "percentage": round(100 * processed / total, 2) if total > 0 else 0,
        "status": status,
        "last_update": datetime.now().isoformat()
    }
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)

# ============================================================
# CHECKPOINT SYSTEM
# ============================================================
def save_checkpoint(vm_num, podcasts, current_step, current_index):
    """Sauvegarde l'état actuel pour reprise"""
    checkpoint = {
        "step": current_step,
        "index": current_index,
        "podcasts": podcasts,
        "timestamp": datetime.now().isoformat()
    }
    checkpoint_file = CHECKPOINT_FILE.format(vm_num)
    with open(checkpoint_file, 'w', encoding='utf-8') as f:
        json.dump(checkpoint, f, ensure_ascii=False)
    log(f"Checkpoint sauvegardé: {current_step} index {current_index}")

def load_checkpoint(vm_num):
    """Charge un checkpoint existant"""
    checkpoint_file = CHECKPOINT_FILE.format(vm_num)
    if os.path.exists(checkpoint_file):
        with open(checkpoint_file, 'r', encoding='utf-8') as f:
            checkpoint = json.load(f)
        log(f"Checkpoint trouvé: {checkpoint['step']} index {checkpoint['index']}")
        return checkpoint
    return None

# ============================================================
# RSS PARSING
# ============================================================
def parse_rss(podcast):
    """Parse le flux RSS d'un podcast"""
    rss_url = podcast.get('url') or podcast.get('rss_url')
    if not rss_url:
        podcast['rss_status'] = 'no_url'
        return podcast

    try:
        response = requests.get(rss_url, headers=HEADERS, timeout=10)
        response.raise_for_status()

        root = ET.fromstring(response.content)
        channel = root.find('channel')

        if channel is None:
            podcast['rss_status'] = 'no_channel'
            return podcast

        # Namespaces
        ns = {
            'itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
            'podcast': 'https://podcastindex.org/namespace/1.0'
        }

        # Owner email
        owner = channel.find('itunes:owner', ns)
        if owner is not None:
            email_elem = owner.find('itunes:email', ns)
            name_elem = owner.find('itunes:name', ns)
            if email_elem is not None:
                podcast['rss_owner_email'] = email_elem.text
            if name_elem is not None:
                podcast['rss_owner_name'] = name_elem.text

        # Author
        author = channel.find('itunes:author', ns)
        if author is not None and author.text:
            podcast['rss_author'] = author.text

        # Website
        link = channel.find('link')
        if link is not None and link.text:
            podcast['rss_website'] = link.text

        # Description
        desc = channel.find('description')
        if desc is not None and desc.text:
            podcast['rss_description'] = desc.text[:1000]

        # Episodes (10 max)
        items = channel.findall('item')[:10]
        for i, item in enumerate(items, 1):
            prefix = f'rss_ep{i}_'

            title = item.find('title')
            if title is not None and title.text:
                podcast[prefix + 'title'] = title.text

            desc = item.find('description')
            if desc is not None and desc.text:
                podcast[prefix + 'description'] = desc.text[:500]

            pubDate = item.find('pubDate')
            if pubDate is not None and pubDate.text:
                podcast[prefix + 'date'] = pubDate.text

            duration = item.find('itunes:duration', ns)
            if duration is not None and duration.text:
                podcast[prefix + 'duration'] = duration.text

            enclosure = item.find('enclosure')
            if enclosure is not None:
                podcast[prefix + 'audio_url'] = enclosure.get('url', '')

            guid = item.find('guid')
            if guid is not None and guid.text:
                podcast[prefix + 'guid'] = guid.text

        podcast['rss_status'] = 'success'

    except requests.Timeout:
        podcast['rss_status'] = 'timeout'
    except Exception as e:
        podcast['rss_status'] = f'error: {str(e)[:50]}'

    return podcast

# ============================================================
# APPLE SCRAPING
# ============================================================
def scrape_apple(podcast):
    """Scrape les données Apple Podcasts"""
    itunes_id = podcast.get('itunesId') or podcast.get('itunes_id')
    if not itunes_id:
        podcast['apple_scrape_status'] = 'no_id'
        return podcast

    url = f"https://podcasts.apple.com/us/podcast/id{itunes_id}"

    try:
        response = requests.get(url, headers=HEADERS, timeout=10)

        if response.status_code == 404:
            podcast['apple_scrape_status'] = 'not_found'
            return podcast

        html = response.text

        # Rating
        rating_match = re.search(r'(\d+\.?\d*)\s*out of\s*5', html)
        if rating_match:
            podcast['apple_rating'] = float(rating_match.group(1))

        # Rating count
        count_match = re.search(r'([\d,]+)\s*Rating', html)
        if count_match:
            podcast['apple_rating_count'] = int(count_match.group(1).replace(',', ''))

        podcast['apple_scrape_status'] = 'success'

    except requests.Timeout:
        podcast['apple_scrape_status'] = 'timeout'
    except Exception as e:
        podcast['apple_scrape_status'] = f'error: {str(e)[:50]}'

    # Rate limiting
    time.sleep(0.5)
    return podcast

# ============================================================
# WEBSITE SCRAPING
# ============================================================
def scrape_website(podcast):
    """Scrape le site web du podcast pour les liens sociaux"""
    website = podcast.get('link') or podcast.get('website') or podcast.get('rss_website')
    if not website:
        podcast['website_status'] = 'no_url'
        return podcast

    try:
        response = requests.get(website, headers=HEADERS, timeout=5)
        html = response.text.lower()

        # YouTube
        yt_patterns = [
            r'youtube\.com/channel/([a-zA-Z0-9_-]+)',
            r'youtube\.com/c/([a-zA-Z0-9_-]+)',
            r'youtube\.com/@([a-zA-Z0-9_-]+)',
            r'youtube\.com/user/([a-zA-Z0-9_-]+)'
        ]
        for pattern in yt_patterns:
            match = re.search(pattern, response.text, re.IGNORECASE)
            if match:
                podcast['website_youtube'] = match.group(0)
                break

        # Twitter/X
        tw_match = re.search(r'(?:twitter|x)\.com/([a-zA-Z0-9_]+)', response.text, re.IGNORECASE)
        if tw_match and tw_match.group(1).lower() not in ['share', 'intent', 'home']:
            podcast['website_twitter'] = tw_match.group(0)

        # Instagram
        ig_match = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', response.text, re.IGNORECASE)
        if ig_match and ig_match.group(1).lower() not in ['p', 'reel', 'stories']:
            podcast['website_instagram'] = ig_match.group(0)

        # Facebook
        fb_match = re.search(r'facebook\.com/([a-zA-Z0-9_.]+)', response.text, re.IGNORECASE)
        if fb_match and fb_match.group(1).lower() not in ['sharer', 'share', 'dialog']:
            podcast['website_facebook'] = fb_match.group(0)

        # LinkedIn
        li_match = re.search(r'linkedin\.com/(?:company|in)/([a-zA-Z0-9_-]+)', response.text, re.IGNORECASE)
        if li_match:
            podcast['website_linkedin'] = li_match.group(0)

        # TikTok
        tk_match = re.search(r'tiktok\.com/@([a-zA-Z0-9_.]+)', response.text, re.IGNORECASE)
        if tk_match:
            podcast['website_tiktok'] = tk_match.group(0)

        # Spotify
        sp_match = re.search(r'open\.spotify\.com/show/([a-zA-Z0-9]+)', response.text, re.IGNORECASE)
        if sp_match:
            podcast['website_spotify'] = sp_match.group(0)

        # Email
        email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', response.text)
        if email_match:
            email = email_match.group(0).lower()
            if not any(x in email for x in ['example', 'test', 'domain', 'email']):
                podcast['website_email'] = email

        podcast['website_status'] = 'success'

    except requests.Timeout:
        podcast['website_status'] = 'timeout'
    except Exception as e:
        podcast['website_status'] = f'error: {str(e)[:50]}'

    return podcast

# ============================================================
# YOUTUBE SCRAPING
# ============================================================
def scrape_youtube(podcast):
    """Scrape les données YouTube avec yt-dlp"""
    yt_url = podcast.get('website_youtube')
    if not yt_url:
        podcast['youtube_status'] = 'no_url'
        return podcast

    if not yt_url.startswith('http'):
        yt_url = 'https://' + yt_url

    try:
        import yt_dlp

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'playlist_items': '1-10'
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(yt_url + '/videos', download=False)

            if info:
                podcast['yt_channel_name'] = info.get('channel', info.get('uploader', ''))
                podcast['yt_channel_id'] = info.get('channel_id', '')
                podcast['yt_subscribers'] = info.get('channel_follower_count', '')

                # Videos
                entries = info.get('entries', [])
                for i, video in enumerate(entries[:10], 1):
                    if video:
                        prefix = f'yt_video_{i}_'
                        podcast[prefix + 'title'] = video.get('title', '')
                        podcast[prefix + 'id'] = video.get('id', '')
                        podcast[prefix + 'views'] = video.get('view_count', '')
                        podcast[prefix + 'duration'] = video.get('duration', '')

        podcast['youtube_status'] = 'success'

    except Exception as e:
        podcast['youtube_status'] = f'error: {str(e)[:50]}'

    return podcast

# ============================================================
# MAIN PROCESSING
# ============================================================
def process_step(podcasts, step_name, process_func, vm_num, start_index=0):
    """Traite une étape avec sauvegarde périodique"""
    total = len(podcasts)

    for i in range(start_index, total):
        podcasts[i] = process_func(podcasts[i])

        # Mise à jour progress
        if (i + 1) % 100 == 0:
            log(f"{step_name}: {i+1}/{total} ({100*(i+1)/total:.0f}%)")
            update_progress(vm_num, i + 1, total * 4, step_name.lower())

        # Sauvegarde checkpoint tous les SAVE_EVERY
        if (i + 1) % SAVE_EVERY == 0:
            save_checkpoint(vm_num, podcasts, step_name, i + 1)
            gc.collect()  # Libérer mémoire

    # Sauvegarde finale de l'étape
    save_checkpoint(vm_num, podcasts, step_name + "_done", total)
    gc.collect()

    return podcasts

def main():
    if len(sys.argv) < 3:
        print("Usage: python production_enrichment_v2.py <vm_number> <total_vms>")
        sys.exit(1)

    vm_num = int(sys.argv[1])
    total_vms = int(sys.argv[2])

    log(f"=== VM {vm_num}/{total_vms} - ENRICHMENT V2 ===")

    # Charger checkpoint ou podcasts
    checkpoint = load_checkpoint(vm_num)

    if checkpoint:
        podcasts = checkpoint['podcasts']
        start_step = checkpoint['step']
        start_index = checkpoint['index']
        log(f"Reprise depuis {start_step} index {start_index}")
    else:
        # Charger les podcasts pour cette VM
        vm_file = f"podcasts_vm{vm_num}.json"
        if not os.path.exists(vm_file):
            vm_file = PODCASTS_FILE

        with open(vm_file, 'r', encoding='utf-8') as f:
            podcasts = json.load(f)

        # Le fichier podcasts_vm{N}.json contient déjà la bonne portion
        # Pas besoin de calculer un chunk
        start_step = "rss"
        start_index = 0

        log(f"Podcasts à traiter: {len(podcasts)}")

    total = len(podcasts)

    # Étapes de processing
    steps = [
        ("rss", "RSS", parse_rss),
        ("apple", "Apple", scrape_apple),
        ("website", "Website", scrape_website),
        ("youtube", "YouTube", scrape_youtube)
    ]

    current_step_found = False

    for step_key, step_name, step_func in steps:
        if not current_step_found:
            if start_step.startswith(step_key):
                current_step_found = True
                if "_done" in start_step:
                    continue  # Étape déjà terminée
                idx = start_index
            else:
                continue
        else:
            idx = 0

        log("=" * 60)
        log(f"ÉTAPE: {step_name}")
        log("=" * 60)

        podcasts = process_step(podcasts, step_name, step_func, vm_num, idx)

    # Sauvegarde finale
    log("=" * 60)
    log("SAUVEGARDE FINALE")
    log("=" * 60)

    output_file = OUTPUT_FILE.format(vm_num)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(podcasts, f, ensure_ascii=False)

    log(f"Résultats sauvegardés: {output_file}")

    # Stats finales
    update_progress(vm_num, total * 4, total * 4, "completed")

    rss_email = sum(1 for p in podcasts if p.get('rss_owner_email'))
    apple_rating = sum(1 for p in podcasts if p.get('apple_rating_count'))
    web_yt = sum(1 for p in podcasts if p.get('website_youtube'))
    yt_channel = sum(1 for p in podcasts if p.get('yt_channel_name'))

    log("=" * 60)
    log("STATISTIQUES FINALES")
    log("=" * 60)
    log(f"Podcasts traités: {total}")
    log(f"RSS email: {rss_email}")
    log(f"Apple reviews: {apple_rating}")
    log(f"Website YouTube: {web_yt}")
    log(f"YouTube channel: {yt_channel}")
    log("=" * 60)

    # Nettoyer checkpoint
    checkpoint_file = CHECKPOINT_FILE.format(vm_num)
    if os.path.exists(checkpoint_file):
        os.remove(checkpoint_file)

if __name__ == "__main__":
    main()
