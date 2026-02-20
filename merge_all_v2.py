import json
import os
import gc
from datetime import datetime

# Dossier de travail
WORK_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle"

# Fichiers des nouvelles VMs (directement dans le dossier)
NEW_VM_FILES = [
    "enriched_vm1.json", "enriched_vm2.json", "enriched_vm3.json", "enriched_vm4.json",
    "enriched_vm5.json", "enriched_vm6.json", "enriched_vm7.json", "enriched_vm8.json",
    "enriched_vm10.json", "enriched_vm11.json", "enriched_vm12.json", "enriched_vm13.json",
    "enriched_vm14.json", "enriched_vm15.json", "enriched_vm16.json", "enriched_vm17.json",
    "enriched_vm19.json", "enriched_vm20.json"
]

# Fichier existant avec les 153k podcasts
EXISTING_FILE = os.path.join(WORK_DIR, "podcasts_enriched_complete.json")

# Fichier de sortie
OUTPUT_FILE = os.path.join(WORK_DIR, "podcasts_final_complete.json")

def load_json_streaming(filepath):
    """Charge un gros fichier JSON ligne par ligne"""
    import ijson
    podcasts = []
    with open(filepath, 'rb') as f:
        for item in ijson.items(f, 'item'):
            podcasts.append(item)
    return podcasts

def main():
    print("=" * 60)
    print("MERGE DE TOUS LES PODCASTS ENRICHIS")
    print(f"Date: {datetime.now()}")
    print("=" * 60)
    print()

    all_podcasts = {}

    # 1. D'abord charger les nouvelles VMs (plus petites)
    print("1. Chargement des nouvelles VMs...")
    for vm_file in NEW_VM_FILES:
        file_path = os.path.join(WORK_DIR, vm_file)
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                podcasts = json.load(f)

            for p in podcasts:
                itunes_id = str(p.get('itunesId') or p.get('itunes_id') or '')
                if itunes_id:
                    all_podcasts[itunes_id] = p

            print(f"   {vm_file}: {len(podcasts)} podcasts")
            del podcasts
            gc.collect()
        else:
            print(f"   {vm_file}: NON TROUVE")

    print(f"   Total nouvelles VMs: {len(all_podcasts)}")
    print()

    # 2. Charger les podcasts existants (153k) par fichiers individuels dans enriched_results
    print("2. Chargement des anciens fichiers enrichis...")
    enriched_dir = os.path.join(WORK_DIR, "enriched_results")

    if os.path.exists(enriched_dir):
        for filename in os.listdir(enriched_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(enriched_dir, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        podcasts = json.load(f)

                    added = 0
                    for p in podcasts:
                        itunes_id = str(p.get('itunesId') or p.get('itunes_id') or '')
                        if itunes_id and itunes_id not in all_podcasts:
                            all_podcasts[itunes_id] = p
                            added += 1

                    print(f"   {filename}: {added} nouveaux (total: {len(all_podcasts)})")
                    del podcasts
                    gc.collect()
                except Exception as e:
                    print(f"   {filename}: ERREUR - {e}")

    print()
    print(f"   Total apres anciens: {len(all_podcasts)}")
    print()

    # 3. Convertir en liste
    final_list = list(all_podcasts.values())
    del all_podcasts
    gc.collect()

    # 4. Statistiques
    print("3. Statistiques finales...")
    stats = {
        'total': len(final_list),
        'rss_email': sum(1 for p in final_list if p.get('rss_owner_email')),
        'rss_author': sum(1 for p in final_list if p.get('rss_author')),
        'apple_rating': sum(1 for p in final_list if p.get('apple_rating')),
        'apple_rating_count': sum(1 for p in final_list if p.get('apple_rating_count')),
        'website_youtube': sum(1 for p in final_list if p.get('website_youtube')),
        'website_twitter': sum(1 for p in final_list if p.get('website_twitter')),
        'website_instagram': sum(1 for p in final_list if p.get('website_instagram')),
        'yt_channel': sum(1 for p in final_list if p.get('yt_channel_name')),
        'yt_subscribers': sum(1 for p in final_list if p.get('yt_subscribers')),
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
    print("4. Sauvegarde...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, ensure_ascii=False)

    file_size = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"   Fichier sauvegarde: {OUTPUT_FILE}")
    print(f"   Taille: {file_size:.1f} MB")
    print()
    print("TERMINE!")

if __name__ == "__main__":
    main()
