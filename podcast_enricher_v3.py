"""
Script d'enrichissement v3 - REPRISE après crash
- Reprend le RSS là où ça s'est arrêté
- Meilleure gestion des erreurs
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

# ============== CONFIGURATION ==============
DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcastindex_feeds.db\podcastindex_feeds.db"
OUTPUT_DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_enriched.db"
PROGRESS_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\progress.json"
LOG_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enrichment_log.txt"

# Fichiers de sauvegarde intermédiaire
APPLE_CACHE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\apple_cache.json"
RSS_CACHE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\rss_cache.json"

# Optimisations
APPLE_BATCH_SIZE = 150
RSS_CONCURRENT = 30  # Réduit pour plus de stabilité
RSS_TIMEOUT = 15  # Timeout plus long

# ============== GLOBALS ==============
start_time = None
log_lock = threading.Lock()

def log(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_message = f"[{timestamp}] {message}"
    print(log_message)
    with log_lock:
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(log_message + "\n")
        except:
            pass

def save_progress(step, processed, total):
    elapsed = time.time() - start_time if start_time else 0
    eta = (elapsed / processed * (total - processed)) if processed > 0 else 0
    progress = {
        "step": step,
        "processed": processed,
        "total": total,
        "percentage": round((processed / total) * 100, 2) if total > 0 else 0,
        "elapsed_minutes": round(elapsed / 60, 2),
        "eta_minutes": round(eta / 60, 2),
        "last_update": datetime.now().isoformat()
    }
    try:
        with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
            json.dump(progress, f, indent=2)
    except:
        pass

# ============== FILTRAGE ==============
def filter_database():
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
        AND (language LIKE 'en%' OR language LIKE 'EN%' OR language LIKE 'eng%' OR language = 'English' OR language = 'english')
    '''

    cursor.execute(query)
    rows = cursor.fetchall()
    column_names = [desc[0] for desc in cursor.description]
    conn.close()

    log(f"Podcasts filtrés: {len(rows)}")
    return rows, column_names

# ============== APPLE API ==============
def load_apple_cache():
    if os.path.exists(APPLE_CACHE):
        try:
            with open(APPLE_CACHE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return None

def save_apple_cache(apple_data):
    try:
        with open(APPLE_CACHE, "w", encoding="utf-8") as f:
            json.dump(apple_data, f)
    except Exception as e:
        log(f"Erreur sauvegarde cache Apple: {e}")

def enrich_with_apple(podcasts):
    log("=" * 60)
    log("ÉTAPE 2: API Apple (BATCH)")
    log("=" * 60)

    # Vérifier le cache
    cached = load_apple_cache()
    if cached and len(cached) == len(podcasts):
        log("Cache Apple trouvé, skip!")
        return cached

    apple_data = []
    for _ in podcasts:
        apple_data.append({
            "apple_url": "", "apple_artist_id": "", "apple_artwork_url": "",
            "apple_genres": "[]", "apple_genre_ids": "[]"
        })

    itunes_ids = [p[8] for p in podcasts]
    id_to_indices = {}
    for i, itunes_id in enumerate(itunes_ids):
        if itunes_id not in id_to_indices:
            id_to_indices[itunes_id] = []
        id_to_indices[itunes_id].append(i)

    unique_ids = list(set(itunes_ids))
    batches = [unique_ids[i:i + APPLE_BATCH_SIZE] for i in range(0, len(unique_ids), APPLE_BATCH_SIZE)]
    total_batches = len(batches)
    log(f"Total batches: {total_batches}")

    for batch_num, batch_ids in enumerate(batches, 1):
        try:
            ids_str = ",".join(str(id) for id in batch_ids)
            url = f"https://itunes.apple.com/lookup?id={ids_str}&entity=podcast"
            response = requests.get(url, timeout=30)

            if response.status_code == 200:
                data = response.json()
                for item in data.get("results", []):
                    itunes_id = item.get("collectionId") or item.get("trackId")
                    if itunes_id and itunes_id in id_to_indices:
                        info = {
                            "apple_url": item.get("collectionViewUrl", ""),
                            "apple_artist_id": str(item.get("artistId", "")),
                            "apple_artwork_url": item.get("artworkUrl600", ""),
                            "apple_genres": json.dumps(item.get("genres", [])),
                            "apple_genre_ids": json.dumps(item.get("genreIds", []))
                        }
                        for idx in id_to_indices[itunes_id]:
                            apple_data[idx] = info

            log(f"Apple batch {batch_num}/{total_batches}")
            save_progress("Apple API", batch_num * APPLE_BATCH_SIZE, len(podcasts))
            time.sleep(0.3)

        except Exception as e:
            log(f"Erreur batch {batch_num}: {str(e)}")
            time.sleep(1)

    # Sauvegarder le cache
    save_apple_cache(apple_data)
    log("Cache Apple sauvegardé")
    return apple_data

# ============== RSS ==============
def parse_rss(rss_url):
    result = {
        "rss_owner_email": "", "rss_owner_name": "", "rss_author": "",
        "rss_website": "", "rss_summary": "", "rss_subtitle": "",
        "rss_type": "", "rss_complete": "", "rss_copyright": "",
        "rss_funding_url": "", "rss_managing_editor": "",
        "rss_social_twitter": "", "rss_social_instagram": "",
        "rss_social_facebook": "", "rss_social_youtube": "",
        "rss_social_linkedin": "", "rss_social_tiktok": "",
    }
    for ep in range(1, 11):
        for field in ["title", "description", "pubdate", "audio_url", "guid", "link", "duration", "episode_num", "transcript"]:
            result[f"rss_ep{ep}_{field}"] = ""

    try:
        resp = requests.get(rss_url, timeout=RSS_TIMEOUT, headers={"User-Agent": "PodcastEnricher/1.0"})
        if resp.status_code != 200:
            return result

        root = ET.fromstring(resp.content)
        channel = root.find("channel")
        if channel is None:
            return result

        ns_itunes = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"
        ns_podcast = "{https://podcastindex.org/namespace/1.0}"

        result["rss_website"] = channel.findtext("link", "")
        result["rss_copyright"] = channel.findtext("copyright", "")
        result["rss_managing_editor"] = channel.findtext("managingEditor", "")
        result["rss_author"] = channel.findtext(f"{ns_itunes}author", "")
        result["rss_summary"] = (channel.findtext(f"{ns_itunes}summary", "") or "")[:2000]
        result["rss_subtitle"] = channel.findtext(f"{ns_itunes}subtitle", "")
        result["rss_type"] = channel.findtext(f"{ns_itunes}type", "")
        result["rss_complete"] = channel.findtext(f"{ns_itunes}complete", "")

        owner = channel.find(f"{ns_itunes}owner")
        if owner is not None:
            result["rss_owner_email"] = owner.findtext(f"{ns_itunes}email", "")
            result["rss_owner_name"] = owner.findtext(f"{ns_itunes}name", "")

        funding = channel.find(f"{ns_podcast}funding")
        if funding is not None:
            result["rss_funding_url"] = funding.get("url", "")

        social_map = {"twitter": "rss_social_twitter", "instagram": "rss_social_instagram",
                      "facebook": "rss_social_facebook", "youtube": "rss_social_youtube",
                      "linkedin": "rss_social_linkedin", "tiktok": "rss_social_tiktok"}
        for social in channel.findall(f"{ns_podcast}social"):
            platform = social.get("platform", "").lower()
            if platform in social_map:
                result[social_map[platform]] = social.get("accountUrl", "")

        items = channel.findall("item")[:10]
        for ep_num, item in enumerate(items, 1):
            p = f"rss_ep{ep_num}_"
            result[f"{p}title"] = (item.findtext("title", "") or "")[:500]
            result[f"{p}description"] = (item.findtext("description", "") or "")[:1000]
            result[f"{p}pubdate"] = item.findtext("pubDate", "")
            result[f"{p}guid"] = item.findtext("guid", "")
            result[f"{p}link"] = item.findtext("link", "")
            result[f"{p}duration"] = item.findtext(f"{ns_itunes}duration", "")
            result[f"{p}episode_num"] = item.findtext(f"{ns_itunes}episode", "")
            enc = item.find("enclosure")
            if enc is not None:
                result[f"{p}audio_url"] = enc.get("url", "")
            tr = item.find(f"{ns_podcast}transcript")
            if tr is not None:
                result[f"{p}transcript"] = tr.get("url", "")

    except Exception:
        pass
    return result

def load_rss_cache():
    if os.path.exists(RSS_CACHE):
        try:
            with open(RSS_CACHE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {}

def save_rss_cache(rss_cache):
    try:
        with open(RSS_CACHE, "w", encoding="utf-8") as f:
            json.dump(rss_cache, f)
    except Exception as e:
        log(f"Erreur sauvegarde cache RSS: {e}")

def enrich_with_rss(podcasts):
    log("=" * 60)
    log("ÉTAPE 3: Parsing RSS (avec reprise)")
    log("=" * 60)

    total = len(podcasts)

    # Charger le cache RSS existant
    rss_cache = load_rss_cache()
    already_done = len(rss_cache)
    log(f"Cache RSS: {already_done} podcasts déjà traités")

    # Préparer la structure
    rss_data = [None] * total

    # Identifier les podcasts non traités
    to_process = []
    for i, podcast in enumerate(podcasts):
        podcast_id = str(podcast[0])  # Utiliser l'ID comme clé
        if podcast_id in rss_cache:
            rss_data[i] = rss_cache[podcast_id]
        else:
            to_process.append((i, podcast, podcast_id))

    log(f"Podcasts restants à traiter: {len(to_process)}")

    if not to_process:
        return rss_data

    counter = {"done": already_done, "processed_this_run": 0}
    lock = threading.Lock()

    def process(item):
        i, podcast, podcast_id = item
        try:
            result = parse_rss(podcast[1])
        except Exception:
            result = {
                "rss_owner_email": "", "rss_owner_name": "", "rss_author": "",
                "rss_website": "", "rss_summary": "", "rss_subtitle": "",
                "rss_type": "", "rss_complete": "", "rss_copyright": "",
                "rss_funding_url": "", "rss_managing_editor": "",
                "rss_social_twitter": "", "rss_social_instagram": "",
                "rss_social_facebook": "", "rss_social_youtube": "",
                "rss_social_linkedin": "", "rss_social_tiktok": "",
            }
            for ep in range(1, 11):
                for field in ["title", "description", "pubdate", "audio_url", "guid", "link", "duration", "episode_num", "transcript"]:
                    result[f"rss_ep{ep}_{field}"] = ""

        with lock:
            rss_data[i] = result
            rss_cache[podcast_id] = result
            counter["done"] += 1
            counter["processed_this_run"] += 1

            # Log et sauvegarde tous les 100
            if counter["processed_this_run"] % 100 == 0:
                log(f"RSS: {counter['done']}/{total}")
                save_progress("RSS", counter["done"], total)

            # Sauvegarde cache tous les 500
            if counter["processed_this_run"] % 500 == 0:
                save_rss_cache(rss_cache)
                log(f"Cache RSS sauvegardé ({len(rss_cache)} entrées)")

    with ThreadPoolExecutor(max_workers=RSS_CONCURRENT) as ex:
        futures = [ex.submit(process, item) for item in to_process]
        for f in as_completed(futures):
            try:
                f.result(timeout=30)
            except Exception:
                pass

    # Sauvegarde finale
    save_rss_cache(rss_cache)
    log(f"Cache RSS final: {len(rss_cache)} entrées")

    return rss_data

# ============== SAUVEGARDE ==============
def save_database(podcasts, columns, apple_data, rss_data):
    log("=" * 60)
    log("SAUVEGARDE")
    log("=" * 60)

    if os.path.exists(OUTPUT_DB_PATH):
        os.remove(OUTPUT_DB_PATH)

    conn = sqlite3.connect(OUTPUT_DB_PATH)
    cursor = conn.cursor()

    all_cols = list(columns)
    all_cols += ["apple_url", "apple_artist_id", "apple_artwork_url", "apple_genres", "apple_genre_ids"]

    # Get RSS columns from first non-None entry
    rss_cols = []
    for r in rss_data:
        if r:
            rss_cols = list(r.keys())
            break
    all_cols += rss_cols

    cols_def = ", ".join([f'"{c}" TEXT' for c in all_cols])
    cursor.execute(f"CREATE TABLE podcasts ({cols_def})")

    placeholders = ", ".join(["?" for _ in all_cols])
    for i, podcast in enumerate(podcasts):
        row = list(podcast)
        row += [apple_data[i]["apple_url"], apple_data[i]["apple_artist_id"],
                apple_data[i]["apple_artwork_url"], apple_data[i]["apple_genres"],
                apple_data[i]["apple_genre_ids"]]
        for c in rss_cols:
            row.append(rss_data[i].get(c, "") if rss_data[i] else "")
        cursor.execute(f"INSERT INTO podcasts VALUES ({placeholders})", row)

    conn.commit()
    conn.close()
    log(f"Sauvegardé: {len(podcasts)} podcasts, {len(all_cols)} colonnes")

# ============== MAIN ==============
def main():
    global start_time
    start_time = time.time()

    log("=" * 60)
    log("DÉMARRAGE - VERSION 3 (REPRISE)")
    log("=" * 60)

    podcasts, columns = filter_database()
    if not podcasts:
        log("Aucun podcast!")
        return

    apple_data = enrich_with_apple(podcasts)
    rss_data = enrich_with_rss(podcasts)
    save_database(podcasts, columns, apple_data, rss_data)

    elapsed = time.time() - start_time
    log("=" * 60)
    log(f"TERMINÉ en {round(elapsed/60, 2)} minutes")
    log(f"Vitesse: {round(len(podcasts)/(elapsed/60), 0)} podcasts/min")
    log("=" * 60)

    save_progress("Terminé", len(podcasts), len(podcasts))

if __name__ == "__main__":
    main()
