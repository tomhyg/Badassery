"""
Extrait 50 podcasts pour le test VM
"""
import sqlite3
import json
import time

DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcastindex_feeds.db\podcastindex_feeds.db"
OUTPUT = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_to_test.json"

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
    LIMIT 50
'''

cursor.execute(query)
rows = cursor.fetchall()
conn.close()

podcasts = []
for row in rows:
    podcasts.append({
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
    })

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(podcasts, f, indent=2, ensure_ascii=False)

print(f"Extrait {len(podcasts)} podcasts vers {OUTPUT}")
