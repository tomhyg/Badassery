"""
Script d'enrichissement OPTIMISÉ - Version RAPIDE
- Multi-threading massif
- Async pour Apple API
- Batching intelligent
"""

import sqlite3
import requests
import time
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import os
from queue import Queue

# ============== CONFIGURATION ==============
DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcastindex_feeds.db\podcastindex_feeds.db"
OUTPUT_DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_enriched.db"
PROGRESS_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\progress.json"
LOG_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enrichment_log.txt"

# Optimisations
APPLE_CONCURRENT = 20  # 20 requêtes simultanées pour Apple
RSS_CONCURRENT = 100   # 100 requêtes simultanées pour RSS
BATCH_SIZE = 1000      # Sauvegarder tous les 1000 podcasts
APPLE_BATCH_SIZE = 150  # Apple permet jusqu'à 200 IDs par requête

# Mode test
TEST_MODE = True  # <== TEST D'ABORD
TEST_LIMIT = 40

# ============== LOGGING ==============
log_lock = threading.Lock()
start_time = None

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
    elapsed = time.time() - start_time if start_time else 0
    eta_seconds = (elapsed / processed * (total - processed)) if processed > 0 else 0
    eta_hours = eta_seconds / 3600

    progress = {
        "step": step,
        "processed": processed,
        "total": total,
        "percentage": round((processed / total) * 100, 2) if total > 0 else 0,
        "elapsed_minutes": round(elapsed / 60, 2),
        "eta_hours": round(eta_hours, 2),
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

    sixty_days_ago = int(time.time()) - (60 * 24 * 60 * 60)

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
    column_names = [description[0] for description in cursor.description]
    conn.close()

    log(f"Podcasts filtrés: {len(rows)}")
    return rows, column_names

# ============== ÉTAPE 2: API APPLE (OPTIMISÉ - BATCH) ==============
def fetch_apple_batch(itunes_ids):
    """Récupère les infos Apple pour un batch d'IDs (jusqu'à 150 à la fois)"""
    try:
        ids_str = ",".join(str(id) for id in itunes_ids)
        url = f"https://itunes.apple.com/lookup?id={ids_str}&entity=podcast"
        response = requests.get(url, timeout=30)

        results = {}
        if response.status_code == 200:
            data = response.json()
            for item in data.get("results", []):
                itunes_id = item.get("collectionId") or item.get("trackId")
                if itunes_id:
                    results[itunes_id] = {
                        "apple_url": item.get("collectionViewUrl", ""),
                        "apple_artist_id": str(item.get("artistId", "")),
                        "apple_artwork_url": item.get("artworkUrl600", ""),
                        "apple_genres": json.dumps(item.get("genres", [])),
                        "apple_genre_ids": json.dumps(item.get("genreIds", []))
                    }
        return results
    except Exception as e:
        log(f"Erreur Apple batch: {str(e)}")
        return {}

def enrich_with_apple_fast(podcasts):
    """Enrichit avec Apple API - Version BATCH (150 IDs par requête)"""
    log("=" * 60)
    log("ÉTAPE 2: Enrichissement via API Apple (BATCH MODE)")
    log("=" * 60)

    # Créer un mapping id -> index
    itunes_ids = [p[8] for p in podcasts]  # itunesId est à l'index 8
    apple_data = [{
        "apple_url": "", "apple_artist_id": "", "apple_artwork_url": "",
        "apple_genres": "[]", "apple_genre_ids": "[]"
    } for _ in podcasts]

    id_to_indices = {}
    for i, itunes_id in enumerate(itunes_ids):
        if itunes_id not in id_to_indices:
            id_to_indices[itunes_id] = []
        id_to_indices[itunes_id].append(i)

    # Créer les batches
    unique_ids = list(set(itunes_ids))
    batches = [unique_ids[i:i + APPLE_BATCH_SIZE] for i in range(0, len(unique_ids), APPLE_BATCH_SIZE)]

    log(f"Total batches Apple: {len(batches)} (IDs uniques: {len(unique_ids)})")

    processed_batches = 0
    total_batches = len(batches)

    def process_batch(batch):
        nonlocal processed_batches
        results = fetch_apple_batch(batch)

        # Mapper les résultats
        for itunes_id, data in results.items():
            if itunes_id in id_to_indices:
                for idx in id_to_indices[itunes_id]:
                    apple_data[idx] = data

        with log_lock:
            processed_batches += 1
            if processed_batches % 10 == 0 or processed_batches == total_batches:
                pct = round(processed_batches / total_batches * 100, 1)
                log(f"Apple API: {processed_batches}/{total_batches} batches ({pct}%)")
                save_progress("Apple API", processed_batches * APPLE_BATCH_SIZE, len(podcasts))

    # Exécuter en parallèle
    with ThreadPoolExecutor(max_workers=APPLE_CONCURRENT) as executor:
        futures = [executor.submit(process_batch, batch) for batch in batches]
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                log(f"Erreur batch Apple: {str(e)}")
            time.sleep(0.2)  # Rate limit prudent

    return apple_data

# ============== ÉTAPE 3: PARSING RSS (OPTIMISÉ) ==============
def parse_rss_feed(rss_url):
    """Parse un flux RSS et extrait toutes les infos"""
    result = {
        "rss_owner_email": "", "rss_owner_name": "", "rss_author": "",
        "rss_website": "", "rss_summary": "", "rss_subtitle": "",
        "rss_type": "", "rss_complete": "", "rss_copyright": "",
        "rss_funding_url": "", "rss_managing_editor": "",
        "rss_social_twitter": "", "rss_social_instagram": "",
        "rss_social_facebook": "", "rss_social_youtube": "",
        "rss_social_linkedin": "", "rss_social_tiktok": "",
    }

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
        response = requests.get(rss_url, timeout=10, headers={"User-Agent": "PodcastEnricher/1.0"})
        if response.status_code != 200:
            return result

        root = ET.fromstring(response.content)
        channel = root.find("channel")
        if channel is None:
            return result

        # Infos podcast
        result["rss_website"] = channel.findtext("link", "")
        result["rss_copyright"] = channel.findtext("copyright", "")
        result["rss_managing_editor"] = channel.findtext("managingEditor", "")
        result["rss_author"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}author", "")
        result["rss_summary"] = (channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}summary", "") or "")[:2000]
        result["rss_subtitle"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}subtitle", "")
        result["rss_type"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}type", "")
        result["rss_complete"] = channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}complete", "")

        owner = channel.find("{http://www.itunes.com/dtds/podcast-1.0.dtd}owner")
        if owner is not None:
            result["rss_owner_email"] = owner.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}email", "")
            result["rss_owner_name"] = owner.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}name", "")

        funding = channel.find("{https://podcastindex.org/namespace/1.0}funding")
        if funding is not None:
            result["rss_funding_url"] = funding.get("url", "")

        # Réseaux sociaux
        social_platforms = {
            "twitter": "rss_social_twitter", "instagram": "rss_social_instagram",
            "facebook": "rss_social_facebook", "youtube": "rss_social_youtube",
            "linkedin": "rss_social_linkedin", "tiktok": "rss_social_tiktok"
        }
        for social in channel.findall("{https://podcastindex.org/namespace/1.0}social"):
            platform = social.get("platform", "").lower()
            if platform in social_platforms:
                result[social_platforms[platform]] = social.get("accountUrl", "")

        # Épisodes
        items = channel.findall("item")[:10]
        for ep_num, item in enumerate(items, 1):
            prefix = f"rss_ep{ep_num}_"
            result[f"{prefix}title"] = (item.findtext("title", "") or "")[:500]
            result[f"{prefix}description"] = (item.findtext("description", "") or "")[:1000]
            result[f"{prefix}pubdate"] = item.findtext("pubDate", "")
            result[f"{prefix}guid"] = item.findtext("guid", "")
            result[f"{prefix}link"] = item.findtext("link", "")
            result[f"{prefix}duration"] = item.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}duration", "")
            result[f"{prefix}episode_num"] = item.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}episode", "")

            enclosure = item.find("enclosure")
            if enclosure is not None:
                result[f"{prefix}audio_url"] = enclosure.get("url", "")

            transcript = item.find("{https://podcastindex.org/namespace/1.0}transcript")
            if transcript is not None:
                result[f"{prefix}transcript"] = transcript.get("url", "")

    except Exception:
        pass

    return result

def enrich_with_rss_fast(podcasts):
    """Enrichit avec RSS - Version MULTI-THREAD MASSIVE"""
    log("=" * 60)
    log("ÉTAPE 3: Parsing des flux RSS (100 threads)")
    log("=" * 60)

    rss_data = [None] * len(podcasts)
    total = len(podcasts)
    processed = [0]
    lock = threading.Lock()

    def process_podcast(index, podcast):
        rss_url = podcast[1]
        result = parse_rss_feed(rss_url)

        with lock:
            rss_data[index] = result
            processed[0] += 1
            if processed[0] % 500 == 0 or processed[0] == total:
                pct = round(processed[0] / total * 100, 1)
                log(f"RSS Parsing: {processed[0]}/{total} ({pct}%)")
                save_progress("RSS Parsing", processed[0], total)

    with ThreadPoolExecutor(max_workers=RSS_CONCURRENT) as executor:
        futures = {executor.submit(process_podcast, i, p): i for i, p in enumerate(podcasts)}
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                pass

    return rss_data

# ============== SAUVEGARDE ==============
def create_output_database(podcasts, column_names, apple_data, rss_data):
    """Crée la base de données enrichie"""
    log("=" * 60)
    log("SAUVEGARDE: Création de la base de données enrichie")
    log("=" * 60)

    if os.path.exists(OUTPUT_DB_PATH):
        os.remove(OUTPUT_DB_PATH)

    conn = sqlite3.connect(OUTPUT_DB_PATH)
    cursor = conn.cursor()

    # Colonnes
    all_columns = list(column_names)
    all_columns.extend(["apple_url", "apple_artist_id", "apple_artwork_url", "apple_genres", "apple_genre_ids"])
    rss_columns = list(rss_data[0].keys()) if rss_data else []
    all_columns.extend(rss_columns)

    columns_def = ", ".join([f'"{col}" TEXT' for col in all_columns])
    cursor.execute(f"CREATE TABLE podcasts ({columns_def})")

    placeholders = ", ".join(["?" for _ in all_columns])

    for i, podcast in enumerate(podcasts):
        row_data = list(podcast)
        row_data.extend([
            apple_data[i]["apple_url"],
            apple_data[i]["apple_artist_id"],
            apple_data[i]["apple_artwork_url"],
            apple_data[i]["apple_genres"],
            apple_data[i]["apple_genre_ids"]
        ])
        for col in rss_columns:
            row_data.append(rss_data[i].get(col, "") if rss_data[i] else "")

        cursor.execute(f"INSERT INTO podcasts VALUES ({placeholders})", row_data)

        if (i + 1) % BATCH_SIZE == 0:
            conn.commit()
            log(f"Sauvegarde batch: {i + 1}/{len(podcasts)}")

    conn.commit()
    conn.close()

    log(f"Base de données créée: {OUTPUT_DB_PATH}")
    log(f"Total colonnes: {len(all_columns)}")
    log(f"Total podcasts: {len(podcasts)}")

# ============== MAIN ==============
def main():
    global start_time
    start_time = time.time()

    log("=" * 60)
    log("DÉMARRAGE DU SCRIPT D'ENRICHISSEMENT - VERSION RAPIDE")
    log(f"Mode: {'TEST (' + str(TEST_LIMIT) + ' podcasts)' if TEST_MODE else 'PRODUCTION'}")
    log(f"Threads RSS: {RSS_CONCURRENT}")
    log(f"Threads Apple: {APPLE_CONCURRENT}")
    log("=" * 60)

    # Étape 1
    podcasts, column_names = filter_database()
    if len(podcasts) == 0:
        log("ERREUR: Aucun podcast trouvé!")
        return

    # Étape 2: Apple (BATCH)
    apple_data = enrich_with_apple_fast(podcasts)

    # Étape 3: RSS (MULTI-THREAD)
    rss_data = enrich_with_rss_fast(podcasts)

    # Sauvegarde
    create_output_database(podcasts, column_names, apple_data, rss_data)

    elapsed = time.time() - start_time
    log("=" * 60)
    log("TERMINÉ!")
    log(f"Durée totale: {round(elapsed / 60, 2)} minutes ({round(elapsed / 3600, 2)} heures)")
    log(f"Podcasts traités: {len(podcasts)}")
    log(f"Vitesse: {round(len(podcasts) / (elapsed / 60), 0)} podcasts/minute")
    log("=" * 60)

    save_progress("Terminé", len(podcasts), len(podcasts), {
        "duration_minutes": round(elapsed / 60, 2),
        "duration_hours": round(elapsed / 3600, 2),
        "output_db": OUTPUT_DB_PATH,
        "speed_per_minute": round(len(podcasts) / (elapsed / 60), 0)
    })

if __name__ == "__main__":
    main()
