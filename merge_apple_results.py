"""
MERGER LES RÉSULTATS APPLE SCRAPING
====================================
Combine les fichiers JSON de toutes les VMs et met à jour la base de données
"""

import sqlite3
import json
import os
from datetime import datetime

# Configuration
DB_PATH = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_enriched.db"
RESULTS_FOLDER = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\apple_results"  # Dossier avec les fichiers VM
OUTPUT_MERGED = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\apple_scraped_all.json"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def main():
    log("="*60)
    log("   MERGE APPLE SCRAPING RESULTS")
    log("="*60)

    # Trouver tous les fichiers de résultats
    all_results = []
    files_found = 0

    # Chercher les fichiers apple_scraped_VM*.json
    for filename in os.listdir(RESULTS_FOLDER):
        if filename.startswith('apple_scraped_VM') and filename.endswith('.json'):
            filepath = os.path.join(RESULTS_FOLDER, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    all_results.extend(data)
                    files_found += 1
                    log(f"  Chargé: {filename} ({len(data)} résultats)")
            except Exception as e:
                log(f"  ERREUR: {filename} - {e}")

    log(f"\nTotal fichiers: {files_found}")
    log(f"Total résultats: {len(all_results)}")

    # Statistiques
    success = sum(1 for r in all_results if r.get('scrape_status') == 'success')
    not_found = sum(1 for r in all_results if r.get('scrape_status') == 'not_found')
    errors = sum(1 for r in all_results if r.get('scrape_status') == 'error')
    with_rating = sum(1 for r in all_results if r.get('apple_rating') is not None)
    with_reviews = sum(1 for r in all_results if r.get('apple_reviews'))

    log(f"\nStatistiques:")
    log(f"  Succès: {success}")
    log(f"  Non trouvés (404): {not_found}")
    log(f"  Erreurs: {errors}")
    log(f"  Avec rating: {with_rating}")
    log(f"  Avec reviews: {with_reviews}")

    # Sauvegarder le fichier merged
    log(f"\nSauvegarde du fichier merged...")
    with open(OUTPUT_MERGED, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    log(f"  Sauvegardé: {OUTPUT_MERGED}")

    # Mettre à jour la base de données
    log(f"\nMise à jour de la base de données...")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Ajouter les nouvelles colonnes si elles n'existent pas
    new_columns = [
        ("apple_rating_scraped", "REAL"),
        ("apple_rating_count", "INTEGER"),
        ("apple_review_count", "INTEGER"),
        ("apple_reviews_json", "TEXT"),
        ("apple_scrape_status", "TEXT"),
    ]

    for col_name, col_type in new_columns:
        try:
            cursor.execute(f"ALTER TABLE podcasts ADD COLUMN {col_name} {col_type}")
            log(f"  Colonne ajoutée: {col_name}")
        except:
            pass  # Colonne existe déjà

    # Mettre à jour les données
    updated = 0
    for result in all_results:
        itunes_id = result.get('itunes_id')
        if not itunes_id:
            continue

        reviews_json = json.dumps(result.get('apple_reviews', []))

        cursor.execute("""
            UPDATE podcasts SET
                apple_rating_scraped = ?,
                apple_rating_count = ?,
                apple_review_count = ?,
                apple_reviews_json = ?,
                apple_scrape_status = ?
            WHERE itunesId = ?
        """, (
            result.get('apple_rating'),
            result.get('apple_rating_count'),
            result.get('apple_review_count'),
            reviews_json,
            result.get('scrape_status'),
            itunes_id
        ))

        if cursor.rowcount > 0:
            updated += 1

    conn.commit()
    conn.close()

    log(f"  Mis à jour: {updated} podcasts")

    log("\n" + "="*60)
    log("   TERMINÉ!")
    log("="*60)

if __name__ == "__main__":
    main()
