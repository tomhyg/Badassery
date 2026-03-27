"""
PRODUCTION - Script d'enrichissement pour VMs
=============================================
Ce script est conçu pour tourner sur les VMs Ubuntu.
Il traite un lot de podcasts et génère un fichier JSON de résultats.

Usage: python3 production_enrichment_vm.py [VM_NUMBER] [TOTAL_VMS]
Exemple: python3 production_enrichment_vm.py 1 20
"""

import requests
import json
import time
import re
import xml.etree.ElementTree as ET
from datetime import datetime
import sys
import os

# ============== CONFIGURATION ==============
PODCASTS_FILE = "podcasts_to_enrich.json"  # Fichier d'entrée avec tous les podcasts
PROGRESS_FILE = "progress_vm.json"

# ============== LOGGING ==============
def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
    sys.stdout.flush()

def save_progress(vm_num, processed, total, status="running"):
    """Sauvegarde la progression"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({
            "vm": vm_num,
            "processed": processed,
            "total": total,
            "percentage": round(processed/total*100, 2) if total > 0 else 0,
            "status": status,
            "last_update": datetime.now().isoformat()
        }, f, indent=2)

# ============== 1. LOAD PODCASTS ==============
def load_podcasts(vm_num, total_vms):
    """Charge le fichier podcasts spécifique à cette VM"""
    log("=" * 60)
    log(f"VM {vm_num}/{total_vms} - Chargement des podcasts")
    log("=" * 60)

    # Fichier spécifique par VM (plus petit, ~12MB au lieu de 255MB)
    vm_file = f"podcasts_vm{vm_num}.json"

    # Fallback sur le gros fichier si le fichier VM n'existe pas
    if not os.path.exists(vm_file):
        vm_file = PODCASTS_FILE
        log(f"Fichier VM non trouvé, utilisation de {vm_file}")

        if not os.path.exists(vm_file):
            log(f"ERREUR: Fichier {vm_file} non trouvé!")
            sys.exit(1)

        with open(vm_file, 'r', encoding='utf-8') as f:
            all_podcasts = json.load(f)

        total = len(all_podcasts)
        per_vm = total // total_vms
        start_idx = (vm_num - 1) * per_vm
        end_idx = start_idx + per_vm if vm_num < total_vms else total
        podcasts = all_podcasts[start_idx:end_idx]
    else:
        log(f"Chargement de {vm_file}")
        with open(vm_file, 'r', encoding='utf-8') as f:
            podcasts = json.load(f)

    log(f"Podcasts chargés: {len(podcasts)}")

    return podcasts

# ============== 2. RSS PARSING (avec 10 épisodes) ==============
def parse_rss(rss_url):
    result = {
        'rss_owner_email': '',
        'rss_owner_name': '',
        'rss_author': '',
        'rss_website': '',
        'rss_description': '',
        'rss_copyright': '',
        'rss_type': '',
        'rss_funding_url': '',
    }

    # Initialiser les 10 épisodes
    for i in range(1, 11):
        result[f'rss_ep{i}_title'] = ''
        result[f'rss_ep{i}_description'] = ''
        result[f'rss_ep{i}_date'] = ''
        result[f'rss_ep{i}_duration'] = ''
        result[f'rss_ep{i}_audio_url'] = ''
        result[f'rss_ep{i}_guid'] = ''
        result[f'rss_ep{i}_link'] = ''
        result[f'rss_ep{i}_episode_num'] = ''
        result[f'rss_ep{i}_season_num'] = ''

    try:
        resp = requests.get(rss_url, timeout=15, headers={'User-Agent': 'PodcastEnricher/1.0'})
        if resp.status_code != 200:
            result['rss_error'] = f'HTTP {resp.status_code}'
            return result

        root = ET.fromstring(resp.content)
        channel = root.find('channel')
        if channel is None:
            return result

        ns_itunes = '{http://www.itunes.com/dtds/podcast-1.0.dtd}'
        ns_podcast = '{https://podcastindex.org/namespace/1.0}'

        # Infos podcast
        result['rss_website'] = channel.findtext('link', '')
        result['rss_copyright'] = channel.findtext('copyright', '')
        result['rss_author'] = channel.findtext(f'{ns_itunes}author', '')
        result['rss_description'] = (channel.findtext(f'{ns_itunes}summary', '') or channel.findtext('description', ''))[:1000]
        result['rss_type'] = channel.findtext(f'{ns_itunes}type', '')

        owner = channel.find(f'{ns_itunes}owner')
        if owner is not None:
            result['rss_owner_email'] = owner.findtext(f'{ns_itunes}email', '')
            result['rss_owner_name'] = owner.findtext(f'{ns_itunes}name', '')

        funding = channel.find(f'{ns_podcast}funding')
        if funding is not None:
            result['rss_funding_url'] = funding.get('url', '')

        # 10 derniers épisodes
        items = channel.findall('item')[:10]
        for i, item in enumerate(items, 1):
            result[f'rss_ep{i}_title'] = (item.findtext('title', '') or '')[:300]
            result[f'rss_ep{i}_description'] = (item.findtext('description', '') or '')[:500]
            result[f'rss_ep{i}_date'] = item.findtext('pubDate', '')
            result[f'rss_ep{i}_duration'] = item.findtext(f'{ns_itunes}duration', '')
            result[f'rss_ep{i}_guid'] = item.findtext('guid', '')
            result[f'rss_ep{i}_link'] = item.findtext('link', '')
            result[f'rss_ep{i}_episode_num'] = item.findtext(f'{ns_itunes}episode', '')
            result[f'rss_ep{i}_season_num'] = item.findtext(f'{ns_itunes}season', '')

            enclosure = item.find('enclosure')
            if enclosure is not None:
                result[f'rss_ep{i}_audio_url'] = enclosure.get('url', '')

        result['rss_status'] = 'success'

    except Exception as e:
        result['rss_error'] = str(e)[:100]
        result['rss_status'] = 'error'

    return result

def enrich_rss(podcasts, vm_num):
    log("=" * 60)
    log("ÉTAPE: RSS Parsing (avec 10 épisodes)")
    log("=" * 60)

    total = len(podcasts)
    for i, p in enumerate(podcasts):
        rss_url = p.get('rss_url') or p.get('url', '')
        rss_data = parse_rss(rss_url)
        p.update(rss_data)

        if (i + 1) % 100 == 0 or (i + 1) == total:
            log(f"RSS: {i + 1}/{total} ({round((i+1)/total*100)}%)")
            save_progress(vm_num, i + 1, total * 4, "rss")  # 4 étapes au total

    # Stats
    with_email = sum(1 for p in podcasts if p.get('rss_owner_email'))
    with_ep1 = sum(1 for p in podcasts if p.get('rss_ep1_title'))
    log(f"RSS terminé - Email: {with_email}/{total} ({round(with_email/total*100)}%), Épisodes: {with_ep1}/{total}")

    return podcasts

# ============== 3. APPLE SCRAPING ==============
def scrape_apple(itunes_id):
    result = {
        'apple_rating_scraped': None,
        'apple_rating_count': None,
        'apple_review_count': None,
    }

    if not itunes_id:
        return result

    url = f"https://podcasts.apple.com/us/podcast/id{itunes_id}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    }

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code == 404:
            result['apple_scrape_status'] = 'not_found'
            return result
        if resp.status_code != 200:
            result['apple_scrape_error'] = f'HTTP {resp.status_code}'
            result['apple_scrape_status'] = 'error'
            return result

        text = resp.text

        # Chercher "X out of 5" pattern
        rating_match = re.search(r'(\d+\.?\d*)\s*out of 5', text, re.IGNORECASE)
        if rating_match:
            result['apple_rating_scraped'] = float(rating_match.group(1))

        # Chercher "X Ratings" pattern
        count_match = re.search(r'([\d,]+)\s*Ratings?', text, re.IGNORECASE)
        if count_match:
            result['apple_rating_count'] = int(count_match.group(1).replace(',', ''))

        # Chercher "X Reviews" pattern
        review_match = re.search(r'([\d,]+)\s*Reviews?', text, re.IGNORECASE)
        if review_match:
            result['apple_review_count'] = int(review_match.group(1).replace(',', ''))

        result['apple_scrape_status'] = 'success' if result['apple_rating_scraped'] else 'no_rating'

    except Exception as e:
        result['apple_scrape_error'] = str(e)[:100]
        result['apple_scrape_status'] = 'error'

    return result

def enrich_apple_scraping(podcasts, vm_num):
    log("=" * 60)
    log("ÉTAPE: Apple Scraping")
    log("=" * 60)

    total = len(podcasts)
    for i, p in enumerate(podcasts):
        itunes_id = p.get('itunes_id') or p.get('itunesId')
        apple_data = scrape_apple(itunes_id)
        p.update(apple_data)

        if (i + 1) % 100 == 0 or (i + 1) == total:
            log(f"Apple: {i + 1}/{total} ({round((i+1)/total*100)}%)")
            save_progress(vm_num, total + i + 1, total * 4, "apple")

        time.sleep(0.5)  # Rate limit

    # Stats
    with_rating = sum(1 for p in podcasts if p.get('apple_rating_scraped'))
    log(f"Apple terminé - Rating: {with_rating}/{total} ({round(with_rating/total*100)}%)")

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
        'website_spotify': '',
    }

    if not url or not url.startswith('http'):
        return result

    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }

    try:
        resp = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        if resp.status_code != 200:
            result['website_error'] = f'HTTP {resp.status_code}'
            return result

        text = resp.text

        # YouTube
        yt_match = re.search(r'(https?://(www\.)?(youtube\.com/(channel/|c/|@)|youtu\.be/)[^\s"\'<>]+)', text)
        if yt_match:
            result['website_youtube'] = yt_match.group(1).rstrip('\\/')

        # Twitter/X
        tw_match = re.search(r'(https?://(www\.)?(twitter\.com|x\.com)/[a-zA-Z0-9_]+)', text)
        if tw_match:
            result['website_twitter'] = tw_match.group(1)

        # Instagram
        ig_match = re.search(r'(https?://(www\.)?instagram\.com/[a-zA-Z0-9_.]+)', text)
        if ig_match:
            result['website_instagram'] = ig_match.group(1)

        # Facebook
        fb_match = re.search(r'(https?://(www\.)?facebook\.com/[a-zA-Z0-9.]+)', text)
        if fb_match:
            result['website_facebook'] = fb_match.group(1)

        # LinkedIn
        li_match = re.search(r'(https?://(www\.)?linkedin\.com/(company|in)/[a-zA-Z0-9-]+)', text)
        if li_match:
            result['website_linkedin'] = li_match.group(1)

        # TikTok
        tt_match = re.search(r'(https?://(www\.)?tiktok\.com/@[a-zA-Z0-9_.]+)', text)
        if tt_match:
            result['website_tiktok'] = tt_match.group(1)

        # Spotify
        sp_match = re.search(r'(https?://open\.spotify\.com/show/[a-zA-Z0-9]+)', text)
        if sp_match:
            result['website_spotify'] = sp_match.group(1)

        # Email
        email_match = re.search(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', text)
        if email_match:
            email = email_match.group(1)
            if not any(x in email.lower() for x in ['example.com', 'wixpress', 'sentry.io', 'schema.org', '.png', '.jpg', '.gif']):
                result['website_email'] = email

        result['website_status'] = 'success'

    except Exception as e:
        result['website_error'] = str(e)[:100]
        result['website_status'] = 'error'

    return result

def enrich_website(podcasts, vm_num):
    log("=" * 60)
    log("ÉTAPE: Website Scraping")
    log("=" * 60)

    total = len(podcasts)
    for i, p in enumerate(podcasts):
        url = p.get('rss_website') or p.get('website') or p.get('link')
        website_data = scrape_website(url)
        p.update(website_data)

        if (i + 1) % 100 == 0 or (i + 1) == total:
            log(f"Website: {i + 1}/{total} ({round((i+1)/total*100)}%)")
            save_progress(vm_num, total * 2 + i + 1, total * 4, "website")

        time.sleep(0.3)

    # Stats
    with_yt = sum(1 for p in podcasts if p.get('website_youtube'))
    with_tw = sum(1 for p in podcasts if p.get('website_twitter'))
    log(f"Website terminé - YouTube: {with_yt}/{total}, Twitter: {with_tw}/{total}")

    return podcasts

# ============== 5. YOUTUBE (yt-dlp) ==============
def get_youtube_info(youtube_url):
    """Récupère les infos chaîne + 10 vidéos"""

    result = {
        'yt_channel_id': '',
        'yt_channel_name': '',
        'yt_channel_url': '',
        'yt_subscribers': None,
        'yt_description': '',
        'yt_total_views': None,
        'yt_video_count': None,
    }

    # Initialiser les 10 vidéos
    for i in range(1, 11):
        result[f'yt_vid{i}_id'] = ''
        result[f'yt_vid{i}_title'] = ''
        result[f'yt_vid{i}_views'] = None
        result[f'yt_vid{i}_likes'] = None
        result[f'yt_vid{i}_date'] = ''
        result[f'yt_vid{i}_duration'] = None
        result[f'yt_vid{i}_description'] = ''

    if not youtube_url:
        return result

    try:
        import yt_dlp

        youtube_url = youtube_url.rstrip('\\/').split('?')[0]

        # 1. Liste des vidéos
        ydl_opts = {
            'quiet': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'playlist_items': '1:10',
            'no_warnings': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url + '/videos', download=False)

            result['yt_channel_id'] = info.get('channel_id', '')
            result['yt_channel_name'] = info.get('channel', info.get('uploader', ''))
            result['yt_channel_url'] = info.get('channel_url', '')
            result['yt_description'] = (info.get('description', '') or '')[:500]

            entries = info.get('entries', [])
            video_ids = []
            for i, vid in enumerate(entries[:10], 1):
                if vid:
                    vid_id = vid.get('id', '')
                    result[f'yt_vid{i}_id'] = vid_id
                    result[f'yt_vid{i}_title'] = (vid.get('title', '') or '')[:200]
                    result[f'yt_vid{i}_views'] = vid.get('view_count')
                    result[f'yt_vid{i}_duration'] = vid.get('duration')
                    video_ids.append(vid_id)

        # 2. Détails première vidéo (subscribers)
        if video_ids:
            ydl_opts2 = {'quiet': True, 'skip_download': True, 'no_warnings': True}
            with yt_dlp.YoutubeDL(ydl_opts2) as ydl:
                vid_info = ydl.extract_info(f'https://www.youtube.com/watch?v={video_ids[0]}', download=False)
                result['yt_subscribers'] = vid_info.get('channel_follower_count')
                result['yt_vid1_views'] = vid_info.get('view_count')
                result['yt_vid1_likes'] = vid_info.get('like_count')
                result['yt_vid1_date'] = vid_info.get('upload_date', '')
                result['yt_vid1_duration'] = vid_info.get('duration')
                result['yt_vid1_description'] = (vid_info.get('description', '') or '')[:300]

        # 3. Scraping total views
        try:
            session = requests.Session()
            headers = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
            session.cookies.set('CONSENT', 'PENDING+987', domain='.youtube.com')
            session.cookies.set('SOCS', 'CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg', domain='.youtube.com')

            resp = session.get(youtube_url + '/about', headers=headers, timeout=15)
            if resp.status_code == 200:
                text = resp.text
                vc_match = re.search(r'(\d[\d,]*)\s*videos', text, re.IGNORECASE)
                if vc_match:
                    result['yt_video_count'] = int(vc_match.group(1).replace(',', ''))
                if 'ytInitialData' in text:
                    views_match = re.search(r'viewCount.*?(\d{4,})', text)
                    if views_match:
                        result['yt_total_views'] = int(views_match.group(1))
        except:
            pass

        result['yt_status'] = 'success'

    except ImportError:
        result['yt_error'] = 'yt-dlp not installed'
        result['yt_status'] = 'error'
    except Exception as e:
        result['yt_error'] = str(e)[:100]
        result['yt_status'] = 'error'

    return result

def enrich_youtube(podcasts, vm_num):
    log("=" * 60)
    log("ÉTAPE: YouTube (yt-dlp)")
    log("=" * 60)

    try:
        import yt_dlp
        log("yt-dlp installé ✓")
    except ImportError:
        log("ATTENTION: yt-dlp non installé - étape ignorée")
        return podcasts

    # Filtrer ceux avec YouTube
    with_yt = [(i, p) for i, p in enumerate(podcasts) if p.get('website_youtube')]
    log(f"Podcasts avec YouTube: {len(with_yt)}/{len(podcasts)}")

    total_podcasts = len(podcasts)
    for idx, (i, p) in enumerate(with_yt):
        yt_data = get_youtube_info(p['website_youtube'])
        p.update(yt_data)

        if (idx + 1) % 50 == 0 or (idx + 1) == len(with_yt):
            log(f"YouTube: {idx + 1}/{len(with_yt)}")
            save_progress(vm_num, total_podcasts * 3 + idx + 1, total_podcasts * 4, "youtube")

        time.sleep(1)

    # Stats
    with_channel = sum(1 for p in podcasts if p.get('yt_channel_id'))
    with_subs = sum(1 for p in podcasts if p.get('yt_subscribers'))
    log(f"YouTube terminé - Channel: {with_channel}/{len(podcasts)}, Subscribers: {with_subs}/{len(podcasts)}")

    return podcasts

# ============== MAIN ==============
def main():
    # Parse arguments
    if len(sys.argv) != 3:
        print("Usage: python3 production_enrichment_vm.py [VM_NUMBER] [TOTAL_VMS]")
        print("Exemple: python3 production_enrichment_vm.py 1 20")
        sys.exit(1)

    vm_num = int(sys.argv[1])
    total_vms = int(sys.argv[2])

    output_file = f"enriched_vm{vm_num}.json"

    start = time.time()

    log("=" * 60)
    log(f"PRODUCTION - VM {vm_num}/{total_vms}")
    log(f"Python: {sys.version}")
    log(f"Output: {output_file}")
    log("=" * 60)

    # 1. Load podcasts
    podcasts = load_podcasts(vm_num, total_vms)

    if not podcasts:
        log("Aucun podcast à traiter!")
        sys.exit(0)

    # 2. RSS
    podcasts = enrich_rss(podcasts, vm_num)

    # 3. Apple Scraping
    podcasts = enrich_apple_scraping(podcasts, vm_num)

    # 4. Website
    podcasts = enrich_website(podcasts, vm_num)

    # 5. YouTube
    podcasts = enrich_youtube(podcasts, vm_num)

    # Save results
    log("=" * 60)
    log("SAUVEGARDE")
    log("=" * 60)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(podcasts, f, indent=2, ensure_ascii=False)

    log(f"Résultats sauvegardés: {output_file}")
    save_progress(vm_num, len(podcasts) * 4, len(podcasts) * 4, "completed")

    # Stats finales
    elapsed = time.time() - start
    log("=" * 60)
    log("STATISTIQUES FINALES")
    log("=" * 60)
    log(f"Podcasts traités: {len(podcasts)}")
    log(f"RSS email: {sum(1 for p in podcasts if p.get('rss_owner_email'))}")
    log(f"Apple rating: {sum(1 for p in podcasts if p.get('apple_rating_scraped'))}")
    log(f"Website YouTube: {sum(1 for p in podcasts if p.get('website_youtube'))}")
    log(f"YouTube channel: {sum(1 for p in podcasts if p.get('yt_channel_id'))}")
    log(f"Durée: {round(elapsed/60, 2)} minutes")
    log("=" * 60)

if __name__ == "__main__":
    main()
