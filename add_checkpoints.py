import json
import os
import gc
from datetime import datetime

WORK_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle"

# Fichier final existant
FINAL_FILE = os.path.join(WORK_DIR, "podcasts_final_complete.json")

# Checkpoints des VMs bloquees
CHECKPOINT_FILES = [
    os.path.join(WORK_DIR, "checkpoint_vm9.json"),
    os.path.join(WORK_DIR, "checkpoint_vm18.json"),
]

def main():
    print("=" * 60)
    print("AJOUT DES CHECKPOINTS AU FICHIER FINAL")
    print(f"Date: {datetime.now()}")
    print("=" * 60)
    print()

    # 1. Charger les checkpoints d'abord (plus petits)
    print("1. Chargement des checkpoints...")
    checkpoint_podcasts = {}

    for cp_file in CHECKPOINT_FILES:
        if os.path.exists(cp_file):
            with open(cp_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Les checkpoints ont une structure differente: {"step": ..., "index": ..., "podcasts": [...]}
            podcasts = data.get('podcasts', [])
            step = data.get('step', 'unknown')

            for p in podcasts:
                itunes_id = str(p.get('itunesId') or p.get('itunes_id') or '')
                if itunes_id:
                    checkpoint_podcasts[itunes_id] = p

            print(f"   {os.path.basename(cp_file)}: {len(podcasts)} podcasts (etape: {step})")
        else:
            print(f"   {os.path.basename(cp_file)}: NON TROUVE")

    print(f"   Total checkpoints: {len(checkpoint_podcasts)} podcasts")
    print()

    # 2. Charger le fichier final
    print("2. Chargement du fichier final...")
    with open(FINAL_FILE, 'r', encoding='utf-8') as f:
        final_podcasts = json.load(f)

    print(f"   {len(final_podcasts)} podcasts dans le fichier final")

    # Creer un index par itunesId
    final_index = {}
    for i, p in enumerate(final_podcasts):
        itunes_id = str(p.get('itunesId') or p.get('itunes_id') or '')
        if itunes_id:
            final_index[itunes_id] = i

    print()

    # 3. Ajouter/mettre a jour avec les checkpoints
    print("3. Ajout des podcasts des checkpoints...")
    added = 0
    updated = 0

    for itunes_id, podcast in checkpoint_podcasts.items():
        if itunes_id in final_index:
            # Mettre a jour (merge les donnees)
            idx = final_index[itunes_id]
            final_podcasts[idx].update(podcast)
            updated += 1
        else:
            # Ajouter
            final_podcasts.append(podcast)
            added += 1

    print(f"   Nouveaux podcasts ajoutes: {added}")
    print(f"   Podcasts mis a jour: {updated}")
    print(f"   Total final: {len(final_podcasts)}")
    print()

    # 4. Stats
    print("4. Statistiques finales...")
    stats = {
        'total': len(final_podcasts),
        'rss_email': sum(1 for p in final_podcasts if p.get('rss_owner_email')),
        'rss_author': sum(1 for p in final_podcasts if p.get('rss_author')),
        'apple_rating_count': sum(1 for p in final_podcasts if p.get('apple_rating_count')),
        'website_youtube': sum(1 for p in final_podcasts if p.get('website_youtube')),
        'yt_channel': sum(1 for p in final_podcasts if p.get('yt_channel_name')),
        'yt_subscribers': sum(1 for p in final_podcasts if p.get('yt_subscribers')),
    }

    print()
    print("=" * 60)
    print("STATISTIQUES FINALES")
    print("=" * 60)
    for key, value in stats.items():
        pct = 100 * value / stats['total'] if stats['total'] > 0 else 0
        print(f"   {key}: {value} ({pct:.1f}%)")
    print("=" * 60)
    print()

    # 5. Sauvegarder
    print("5. Sauvegarde...")
    with open(FINAL_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_podcasts, f, ensure_ascii=False)

    file_size = os.path.getsize(FINAL_FILE) / (1024 * 1024)
    print(f"   Fichier sauvegarde: {FINAL_FILE}")
    print(f"   Taille: {file_size:.1f} MB")
    print()
    print("TERMINE!")

if __name__ == "__main__":
    main()
