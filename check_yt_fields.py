import json
import os

INPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results"

with open(os.path.join(INPUT_DIR, "enriched_vm19.json"), 'r', encoding='utf-8') as f:
    podcasts = json.load(f)

# Find one with YT data and show all yt_ fields
for p in podcasts:
    if p.get('yt_channel_name') and p.get('yt_subscribers'):
        print("=== TOUS LES CHAMPS YT_ ===")
        for key, value in p.items():
            if key.startswith('yt_'):
                print(f"  {key}: {value}")
        break
