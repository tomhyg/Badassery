import json
import os

# VMs crashées
crashed_vms = [4, 9, 11, 15]

# Chemin des fichiers podcasts originaux
INPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle"
OUTPUT_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_remaining.json"

print("=== RECUPERATION DES PODCASTS MANQUANTS ===")
print("")

all_remaining = []

for vm in crashed_vms:
    file_path = os.path.join(INPUT_DIR, f"podcasts_vm{vm}.json")
    print(f"Loading VM {vm}...", end=" ")

    with open(file_path, 'r', encoding='utf-8') as f:
        podcasts = json.load(f)

    all_remaining.extend(podcasts)
    print(f"{len(podcasts)} podcasts")

print("")
print(f"Total podcasts à traiter: {len(all_remaining)}")

# Sauvegarder
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(all_remaining, f, ensure_ascii=False)

file_size = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
print(f"Fichier sauvegardé: {OUTPUT_FILE}")
print(f"Taille: {file_size:.2f} MB")
