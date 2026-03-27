import json
import os
from datetime import datetime

INPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results"
OUTPUT_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_enriched_complete.json"

# VMs terminées
completed_vms = [1, 2, 3, 5, 6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20]

print("=== MERGE DES FICHIERS ENRICHIS ===")
print(f"Date: {datetime.now()}")
print("")

all_podcasts = []
stats = {
    'total': 0,
    'rss_email': 0,
    'apple_rating': 0,
    'website_youtube': 0,
    'yt_channel': 0,
    'yt_subscribers': 0
}

for vm in completed_vms:
    file_path = os.path.join(INPUT_DIR, f"enriched_vm{vm}.json")
    print(f"Loading VM {vm}...", end=" ")

    with open(file_path, 'r', encoding='utf-8') as f:
        podcasts = json.load(f)

    count = len(podcasts)
    all_podcasts.extend(podcasts)

    # Stats
    stats['total'] += count
    stats['rss_email'] += sum(1 for p in podcasts if p.get('rss_email'))
    stats['apple_rating'] += sum(1 for p in podcasts if p.get('apple_rating'))
    stats['website_youtube'] += sum(1 for p in podcasts if p.get('website_youtube'))
    stats['yt_channel'] += sum(1 for p in podcasts if p.get('yt_channel_name'))
    stats['yt_subscribers'] += sum(1 for p in podcasts if p.get('yt_subscribers'))

    print(f"{count} podcasts")

print("")
print("=== SAUVEGARDE ===")
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(all_podcasts, f, ensure_ascii=False)

file_size = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
print(f"Fichier: {OUTPUT_FILE}")
print(f"Taille: {file_size:.2f} MB")

print("")
print("=== STATISTIQUES GLOBALES ===")
print(f"Total podcasts: {stats['total']}")
print(f"RSS Email: {stats['rss_email']} ({100*stats['rss_email']/stats['total']:.1f}%)")
print(f"Apple Rating: {stats['apple_rating']} ({100*stats['apple_rating']/stats['total']:.1f}%)")
print(f"Website YouTube: {stats['website_youtube']} ({100*stats['website_youtube']/stats['total']:.1f}%)")
print(f"YT Channel: {stats['yt_channel']} ({100*stats['yt_channel']/stats['total']:.1f}%)")
print(f"YT Subscribers: {stats['yt_subscribers']} ({100*stats['yt_subscribers']/stats['total']:.1f}%)")
print("")
print("=== MERGE TERMINE ===")
