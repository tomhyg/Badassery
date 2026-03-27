"""
Script d'enrichissement de la base PodcastIndex
- Étape 1: Filtrer la base locale
- Étape 2: Enrichir avec API PodcastIndex (owner_email)
- Étape 3: Enrichir avec API Apple
- Étape 4: Parser les flux RSS (infos podcast + 10 épisodes + réseaux sociaux)
"""

import sqlite3
import requests
import time
import hashlib
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import os

# ============== CONFIGURATION ==============
DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcastindex_feeds.db\podcastindex_feeds.db"
OUTPUT_DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_enriched.db"
PROGRESS_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\progress.json"
LOG_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enrichment_log.txt"

# API PodcastIndex
PI_API_KEY = "AQV74G9B3U8BHPQTABUZ"
PI_API_SECRET = "Y9kYKQpcgCzyuVvhALkVS2ny5B4$qTPkkSyJYw92"
PI_API_URL = "https://api.podcastindex.org/api/1.0"

# Rate limits
PI_REQUESTS_PER_SEC = 10
APPLE_REQUESTS_PER_MIN = 250  # Prudent, sous les 300
RSS_CONCURRENT = 50

# Mode test
TEST_MODE = True
TEST_LIMIT = 40

# ============== LOGGING ==============
log_lock = threading.Lock()

def log(message):
    """Log avec timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_message = f"[{timestamp}] {message}"
    print(log_message)
    with log_lock:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_message + "\n")

def save_progress(step, processed, total, extra_info=None):
    """Sauvegarde la progression"""
    progress = {
        "step": step,
        "processed": processed,
        "total": total,
        "percentage": round((processed / total) * 100, 2) if total > 0 else 0,
        "last_update": datetime.now().isoformat(),
        "extra_info": extra_info or {}
    }
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2)

# ============== ÉTAPE 1: FILTRAGE ==============
def filter_database():
    """Filtre la base PodcastIndex selon les critères"""
    log("=" * 60)
    log("ÉTAPE 1: Filtrage de la base de données")
    log("=" * 60)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Calculer timestamp 60 jours
    sixty_days_ago = int(time.time()) - (60 * 24 * 60 * 60)

    # Requête de filtrage
    query = f'''
        SELECT * FROM podcasts
        WHERE lastUpdate > {sixty_days_ago}
        AND dead = 0
        AND episodeCount > 49
        AND itunesId > 0
        AND (
            language LIKE 'en%'
            OR language LIKE 'EN%'
            OR language LIKE 'eng%'
            OR language = 'English'
            OR language = 'english'
        )
    '''

    if TEST_MODE:
        query += f" LIMIT {TEST_LIMIT}"

    cursor.execute(query)
    rows = cursor.fetchall()

    # Récupérer les noms de colonnes
    column_names = [description[0] for description in cursor.description]

    conn.close()

    log(f"Podcasts filtrés: {len(rows)}")

    return rows, column_names

# ============== ÉTAPE 2: API PODCASTINDEX ==============
def get_pi_auth_headers():
    """Génère les headers d'authentification PodcastIndex"""
    epoch_time = int(time.time())
    data_to_hash = PI_API_KEY + PI_API_SECRET + str(epoch_time)
    sha1_hash = hashlib.sha1(data_to_hash.encode()).hexdigest()

    return {
        "X-Auth-Date": str(epoch_time),
        "X-Auth-Key": PI_API_KEY,
        "Authorization": sha1_hash,
        "User-Agent": "PodcastEnricher/1.0"
    }

def fetch_pi_email(podcast_id):
    """Récupère l'email depuis l'API PodcastIndex"""
    try:
        headers = get_pi_auth_headers()
        url = f"{PI_API_URL}/podcasts/byfeedid?id={podcast_id}"
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            data = response.json()
            if "feed" in data:
                return data["feed"].get("ownerEmail", "")
        return ""
    except Exception as e:
        log(f"Erreur PI API pour ID {podcast_id}: {str(e)}")
        return ""

def enrich_with_podcastindex(podcasts):
    """Enrichit avec les données PodcastIndex API"""
    log("=" * 60)
    log("ÉTAPE 2: Enrichissement via API PodcastIndex")
    log("=" * 60)

    pi_emails = []
    total = len(podcasts)

    for i, podcast in enumerate(podcasts):
        podcast_id = podcast[0]  # id est la première colonne
        email = fetch_pi_email(podcast_id)
        pi_emails.append(email)

        if (i + 1) % 10 == 0 or i == total - 1:
            log(f"PodcastIndex API: {i + 1}/{total} ({round((i+1)/total*100, 1)}%)")
            save_progress("PodcastIndex API", i + 1, total)

        time.sleep(1 / PI_REQUESTS_PER_SEC)

    return pi_emails

# ============== ÉTAPE 3: API APPLE ==============
def fetch_apple_info(itunes_id):
    """Récupère les infos depuis l'API Apple"""
    try:
        url = f"https://itunes.apple.com/lookup?id={itunes_id}&entity=podcast"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json()
            if data.get("resultCount", 0) > 0:
                result = data["results"][0]
                return {
                    "apple_url": result.get("collectionViewUrl", ""),
                    "apple_artist_id": result.get("artistId", ""),
                    "apple_artwork_url": result.get("artworkUrl600", ""),
                    "apple_genres": json.dumps(result.get("genres", [])),
                    "apple_genre_ids": json.dumps(result.get("genreIds", []))
                }
        return {"apple_url": "", "apple_artist_id": "", "apple_artwork_url": "", "apple_genres": "[]", "apple_genre_ids": "[]"}
    except Exception as e:
        log(f"Erreur Apple API pour iTunes ID {itunes_id}: {str(e)}")
        return {"apple_url": "", "apple_artist_id": "", "apple_artwork_url": "", "apple_genres": "[]", "apple_genre_ids": "[]"}

def enrich_with_apple(podcasts):
    """Enrichit avec les données Apple"""
    log("=" * 60)
    log("ÉTAPE 3: Enrichissement via API Apple")
    log("=" * 60)

    apple_data = []
    total = len(podcasts)

    for i, podcast in enumerate(podcasts):
        itunes_id = podcast[8]  # itunesId est à l'index 8
        info = fetch_apple_info(itunes_id)
        apple_data.append(info)

        if (i + 1) % 10 == 0 or i == total - 1:
            log(f"Apple API: {i + 1}/{total} ({round((i+1)/total*100, 1)}%)")
            save_progress("Apple API", i + 1, total)

        # Rate limit: ~250 req/min = ~4 req/sec
        time.sleep(0.25)

    return apple_data

# ============== ÉTAPE 4: PARSING RSS ==============
def parse_rss_feed(rss_url):
    """Parse un flux RSS et extrait toutes les infos"""
    result = {
        # Infos podcast
        "rss_owner_email": "",
        "rss_owner_name": "",
        "rss_author": "",
        "rss_website": "",
        "rss_summary": "",
        "rss_subtitle": "",
        "rss_type": "",
        "rss_complete": "",
        "rss_copyright": "",
        "rss_funding_url": "",
        "rss_managing_editor": "",
        # Réseaux sociaux
        "rss_social_twitter": "",
        "rss_social_instagram": "",
        "rss_social_facebook": "",
        "rss_social_youtube": "",
        "rss_social_linkedin": "",
        "rss_social_tiktok": "",
    }

    # Ajouter les colonnes pour 10 épisodes
    for ep_num in range(1, 11):
        result[f"rss_ep{ep_num}_title"] = ""
        result[f"rss_ep{ep_num}_description"] = ""
        result[f"rss_ep{ep_num}_pubdate"] = ""
        result[f"rss_ep{ep_num}_audio_url"] = ""
        result[f"rss_ep{ep_num}_guid"] = ""
        result[f"rss_ep{ep_num}_link"] = ""
        result[f"rss_ep{ep_num}_duration"] = ""
        result[f"rss_ep{ep_num}_episode_num"] = ""
        result[f"rss_ep{ep_num}_transcript"] = ""

    try:
        response = requests.get(rss_url, timeout=15, headers={"User-Agent": "PodcastEnricher/1.0"})
        if response.status_code != 200:
            return result

        # Parser le XML
        root = ET.fromstring(response.content)
        channel = root.find("channel")
        if channel is None:
            return result

        # Namespaces
        ns = {
            "itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
            "podcast": "https://podcastindex.org/namespace/1.0",
            "atom": "http://www.w3.org/2005/Atom"
        }

        # Infos podcast niveau channel
        result["rss_website"] = channel.findtext("link", "")
        result["rss_copyright"] = channel.findtext("copyright", "")
        result["rss_managing_editor"] = channel.findtext("managingEditor", "")
        result["rss_author"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}author", "")
        result["rss_summary"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}summary", "")
        result["rss_subtitle"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}subtitle", "")
        result["rss_type"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}type", "")
        result["rss_complete"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}complete", "")

        # Owner (email + name)
        owner = channel.find("{http://www.itunes.com/dtds/podcast-1.0.dtd}owner")
        if owner is not None:
            result["rss_owner_email"] = owner.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}email", "")
            result["rss_owner_name"] = owner.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}name", "")

        # Funding URL
        funding = channel.find("{https://podcastindex.org/namespace/1.0}funding")
        if funding is not None:
            result["rss_funding_url"] = funding.get("url", "")

        # Réseaux sociaux (podcast:social)
        social_platforms = {
            "twitter": "rss_social_twitter",
            "instagram": "rss_social_instagram",
            "facebook": "rss_social_facebook",
            "youtube": "rss_social_youtube",
            "linkedin": "rss_social_linkedin",
            "tiktok": "rss_social_tiktok"
        }

        for social in channel.findall("{https://podcastindex.org/namespace/1.0}social"):
            platform = social.get("platform", "").lower()
            if platform in social_platforms:
                result[social_platforms[platform]] = social.get("accountUrl", "")

        # Épisodes (10 derniers)
        items = channel.findall("item")[:10]
        for ep_num, item in enumerate(items, 1):
            prefix = f"rss_ep{ep_num}_"
            result[f"{prefix}title"] = item.findtext("title", "")
            result[f"{prefix}description"] = (item.findtext("description", "") or "")[:1000]  # Limiter la taille
            result[f"{prefix}pubdate"] = item.findtext("pubDate", "")
            result[f"{prefix}guid"] = item.findtext("guid", "")
            result[f"{prefix}link"] = item.findtext("link", "")
            result[f"{prefix}duration"] = item.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}duration", "")
            result[f"{prefix}episode_num"] = item.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}episode", "")

            # Enclosure (audio URL)
            enclosure = item.find("enclosure")
            if enclosure is not None:
                result[f"{prefix}audio_url"] = enclosure.get("url", "")

            # Transcript
            transcript = item.find("{https://podcastindex.org/namespace/1.0}transcript")
            if transcript is not None:
                result[f"{prefix}transcript"] = transcript.get("url", "")

    except Exception as e:
        pass  # Silently fail, return empty result

    return result

def enrich_with_rss(podcasts):
    """Enrichit avec les données RSS (parallélisé)"""
    log("=" * 60)
    log("ÉTAPE 4: Parsing des flux RSS")
    log("=" * 60)

    rss_data = [None] * len(podcasts)
    total = len(podcasts)
    processed = [0]
    lock = threading.Lock()

    def process_podcast(index, podcast):
        rss_url = podcast[1]  # url est à l'index 1
        result = parse_rss_feed(rss_url)

        with lock:
            rss_data[index] = result
            processed[0] += 1
            if processed[0] % 10 == 0 or processed[0] == total:
                log(f"RSS Parsing: {processed[0]}/{total} ({round(processed[0]/total*100, 1)}%)")
                save_progress("RSS Parsing", processed[0], total)

        return result

    with ThreadPoolExecutor(max_workers=RSS_CONCURRENT) as executor:
        futures = {executor.submit(process_podcast, i, p): i for i, p in enumerate(podcasts)}
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                log(f"Erreur RSS: {str(e)}")

    return rss_data

# ============== SAUVEGARDE BASE DE DONNÉES ==============
def create_output_database(podcasts, column_names, pi_emails, apple_data, rss_data):
    """Crée la base de données enrichie"""
    log("=" * 60)
    log("SAUVEGARDE: Création de la base de données enrichie")
    log("=" * 60)

    # Supprimer l'ancienne base si elle existe
    if os.path.exists(OUTPUT_DB_PATH):
        os.remove(OUTPUT_DB_PATH)

    conn = sqlite3.connect(OUTPUT_DB_PATH)
    cursor = conn.cursor()

    # Construire la liste des colonnes
    all_columns = list(column_names)
    all_columns.append("pi_owner_email")
    all_columns.extend(["apple_url", "apple_artist_id", "apple_artwork_url", "apple_genres", "apple_genre_ids"])

    # Colonnes RSS
    rss_columns = list(rss_data[0].keys()) if rss_data else []
    all_columns.extend(rss_columns)

    # Créer la table
    columns_def = ", ".join([f'"{col}" TEXT' for col in all_columns])
    cursor.execute(f"CREATE TABLE podcasts ({columns_def})")

    # Insérer les données
    placeholders = ", ".join(["?" for _ in all_columns])

    for i, podcast in enumerate(podcasts):
        row_data = list(podcast)
        row_data.append(pi_emails[i])
        row_data.extend([
            apple_data[i]["apple_url"],
            apple_data[i]["apple_artist_id"],
            apple_data[i]["apple_artwork_url"],
            apple_data[i]["apple_genres"],
            apple_data[i]["apple_genre_ids"]
        ])

        # RSS data
        for col in rss_columns:
            row_data.append(rss_data[i].get(col, ""))

        cursor.execute(f"INSERT INTO podcasts VALUES ({placeholders})", row_data)

    conn.commit()
    conn.close()

    log(f"Base de données créée: {OUTPUT_DB_PATH}")
    log(f"Total colonnes: {len(all_columns)}")
    log(f"Total podcasts: {len(podcasts)}")

# ============== MAIN ==============
def main():
    """Fonction principale"""
    start_time = time.time()

    log("=" * 60)
    log("DÉMARRAGE DU SCRIPT D'ENRICHISSEMENT")
    log(f"Mode: {'TEST (' + str(TEST_LIMIT) + ' podcasts)' if TEST_MODE else 'PRODUCTION'}")
    log("=" * 60)

    # Étape 1: Filtrage
    podcasts, column_names = filter_database()

    if len(podcasts) == 0:
        log("ERREUR: Aucun podcast trouvé après filtrage!")
        return

    # Étape 2: API PodcastIndex
    pi_emails = enrich_with_podcastindex(podcasts)

    # Étape 3: API Apple
    apple_data = enrich_with_apple(podcasts)

    # Étape 4: RSS Parsing
    rss_data = enrich_with_rss(podcasts)

    # Sauvegarde
    create_output_database(podcasts, column_names, pi_emails, apple_data, rss_data)

    # Stats finales
    elapsed_time = time.time() - start_time
    log("=" * 60)
    log("TERMINÉ!")
    log(f"Durée totale: {round(elapsed_time / 60, 2)} minutes")
    log(f"Podcasts traités: {len(podcasts)}")
    log(f"Base de données: {OUTPUT_DB_PATH}")
    log("=" * 60)

    save_progress("Terminé", len(podcasts), len(podcasts), {
        "duration_minutes": round(elapsed_time / 60, 2),
        "output_db": OUTPUT_DB_PATH
    })

if __name__ == "__main__":
    main()
