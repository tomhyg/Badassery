import json
import os
from datetime import datetime

WORK_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle"

# Checkpoints des VMs bloquees
CHECKPOINT_FILES = [
    ("checkpoint_vm9.json", "enriched_vm9.json"),
    ("checkpoint_vm18.json", "enriched_vm18.json"),
]

def main():
    print("=" * 60)
    print("EXTRACTION DES CHECKPOINTS EN FICHIERS ENRICHIS")
    print(f"Date: {datetime.now()}")
    print("=" * 60)
    print()

    total_podcasts = 0

    for cp_file, output_file in CHECKPOINT_FILES:
        cp_path = os.path.join(WORK_DIR, cp_file)
        output_path = os.path.join(WORK_DIR, output_file)

        if os.path.exists(cp_path):
            print(f"Traitement de {cp_file}...")

            with open(cp_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            podcasts = data.get('podcasts', [])
            step = data.get('step', 'unknown')

            print(f"   {len(podcasts)} podcasts (etape: {step})")

            # Sauvegarder comme fichier enrichi normal
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(podcasts, f, ensure_ascii=False)

            print(f"   Sauvegarde: {output_file}")
            total_podcasts += len(podcasts)
        else:
            print(f"   {cp_file}: NON TROUVE")

    print()
    print("=" * 60)
    print(f"TERMINE! {total_podcasts} podcasts extraits")
    print("Les fichiers enriched_vm9.json et enriched_vm18.json sont prets")
    print("=" * 60)

if __name__ == "__main__":
    main()
