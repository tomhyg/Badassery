"""
Prépare le fichier JSON avec tous les podcasts à enrichir
Inclut les données Apple API depuis le cache
"""
import sqlite3
import json
import time
from datetime import datetime

DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcastindex_feeds.db\podcastindex_feeds.db"
APPLE_CACHE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\apple_cache.json"
OUTPUT = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_to_enrich.json"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def main():
    log("=" * 60)
    log("PRÉPARATION DES PODCASTS POUR ENRICHISSEMENT")
    log("=" * 60)

    # 1. Charger les podcasts depuis la DB
    log("Chargement depuis la base de données...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    sixty_days_ago = int(time.time()) - (60 * 24 * 60 * 60)

    query = f'''
        SELECT id, url, title, itunesId, link, description, language,
               imageUrl, lastUpdate, episodeCount
        FROM podcasts
        WHERE lastUpdate > {sixty_days_ago}
        AND dead = 0
        AND episodeCount > 49
        AND itunesId > 0
        AND (language LIKE 'en%' OR language LIKE 'EN%')
    '''

    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    log(f"Podcasts récupérés de la DB: {len(rows)}")

    # Créer un dict indexé par itunesId
    podcasts_dict = {}
    for row in rows:
        podcast = {
            'id': row[0],
            'url': row[1],
            'rss_url': row[1],
            'title': row[2],
            'itunesId': row[3],
            'itunes_id': row[3],
            'link': row[4],
            'website': row[4],
            'description': row[5],
            'language': row[6],
            'imageUrl': row[7],
            'lastUpdate': row[8],
            'episodeCount': row[9],
        }
        if row[3]:  # itunesId
            podcasts_dict[int(row[3])] = podcast

    log(f"Podcasts avec iTunes ID: {len(podcasts_dict)}")

    # 2. Charger et merger les données Apple API
    log("Chargement du cache Apple API...")
    with open(APPLE_CACHE, 'r', encoding='utf-8') as f:
        apple_cache = json.load(f)

    log(f"Entrées dans le cache Apple: {len(apple_cache)}")

    # Le cache Apple est une liste, extraire l'iTunes ID de l'URL
    import re
    merged_count = 0
    for apple_data in apple_cache:
        # Extraire l'iTunes ID de l'URL: https://podcasts.apple.com/us/podcast/xxx/id1000000618?uo=4
        apple_url = apple_data.get('apple_url', '')
        match = re.search(r'/id(\d+)', apple_url)
        if not match:
            continue
        itunes_id = int(match.group(1))

        if itunes_id in podcasts_dict:
            # Ajouter les données Apple API
            podcasts_dict[itunes_id]['apple_api_url'] = apple_url
            podcasts_dict[itunes_id]['apple_api_artist_id'] = apple_data.get('apple_artist_id', '')
            podcasts_dict[itunes_id]['apple_api_artwork_url'] = apple_data.get('apple_artwork_url', '')
            # Parse les genres (stockés comme string JSON)
            try:
                genres = json.loads(apple_data.get('apple_genres', '[]'))
                podcasts_dict[itunes_id]['apple_api_genres'] = genres
            except:
                podcasts_dict[itunes_id]['apple_api_genres'] = []
            try:
                genre_ids = json.loads(apple_data.get('apple_genre_ids', '[]'))
                podcasts_dict[itunes_id]['apple_api_genre_ids'] = genre_ids
            except:
                podcasts_dict[itunes_id]['apple_api_genre_ids'] = []
            merged_count += 1

    log(f"Podcasts enrichis avec Apple API: {merged_count}")

    # 3. Convertir en liste
    podcasts = list(podcasts_dict.values())

    # 4. Sauvegarder
    log(f"Sauvegarde de {len(podcasts)} podcasts...")
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(podcasts, f, ensure_ascii=False)

    log(f"Fichier créé: {OUTPUT}")

    # Stats
    file_size = len(json.dumps(podcasts)) / (1024 * 1024)
    log(f"Taille du fichier: {round(file_size, 2)} MB")

    # Distribution pour 20 VMs
    log("\n" + "=" * 60)
    log("DISTRIBUTION POUR 20 VMs:")
    log("=" * 60)
    per_vm = len(podcasts) // 20
    for i in range(1, 21):
        start = (i - 1) * per_vm
        end = start + per_vm if i < 20 else len(podcasts)
        log(f"  VM {i:2d}: podcasts {start:,} - {end:,} ({end-start:,} podcasts)")

    log("\n" + "=" * 60)
    log("TERMINÉ!")
    log("=" * 60)

if __name__ == "__main__":
    main()
