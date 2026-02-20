"""
PRÉPARER LES DONNÉES POUR APPLE SCRAPING
==========================================
Extrait les iTunes IDs de la base enrichie et crée le fichier JSON pour les VMs
"""

import sqlite3
import json
from datetime import datetime

# Configuration
DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_enriched.db"
OUTPUT_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\itunes_ids.json"

def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Extraction des iTunes IDs...")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Extraire id et itunesId
    cursor.execute("SELECT id, itunesId FROM podcasts WHERE itunesId IS NOT NULL AND itunesId != '' AND itunesId > 0")
    rows = cursor.fetchall()
    conn.close()

    print(f"[{datetime.now().strftime('%H:%M:%S')}] {len(rows)} podcasts avec iTunes ID")

    # Créer le JSON
    data = []
    for row in rows:
        podcast_id, itunes_id = row
        try:
            itunes_id = int(itunes_id)
            data.append({
                "id": podcast_id,
                "itunes_id": itunes_id
            })
        except:
            pass

    # Sauvegarder
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Sauvegardé: {OUTPUT_FILE}")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Total: {len(data)} podcasts")

    # Stats pour les VMs
    print("\n" + "="*50)
    print("RÉPARTITION POUR 20 VMs:")
    print("="*50)
    per_vm = len(data) // 20
    for i in range(1, 21):
        start = (i - 1) * per_vm
        end = start + per_vm if i < 20 else len(data)
        print(f"  VM {i:2d}: podcasts {start:,} - {end:,} ({end-start:,} podcasts)")

    print("\n" + "="*50)
    print("COMMANDES POUR CHAQUE VM:")
    print("="*50)
    print("1. Copier itunes_ids.json et apple_scraper_vm.py sur la VM")
    print("2. pip install requests beautifulsoup4")
    print("3. Lancer avec: python apple_scraper_vm.py [VM_NUMBER] 20")
    print("")
    print("Exemple VM 1: python apple_scraper_vm.py 1 20")
    print("Exemple VM 5: python apple_scraper_vm.py 5 20")

if __name__ == "__main__":
    main()
