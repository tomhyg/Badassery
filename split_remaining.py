import json
import os

INPUT_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_remaining.json"
OUTPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\remaining_split"
TOTAL_VMS = 20

# Créer dossier output
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("=== SPLIT DES PODCASTS RESTANTS ===")
print("")

# Charger les podcasts
with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    podcasts = json.load(f)

total = len(podcasts)
chunk_size = total // TOTAL_VMS
print(f"Total podcasts: {total}")
print(f"Par VM: ~{chunk_size}")
print("")

for vm in range(1, TOTAL_VMS + 1):
    start = (vm - 1) * chunk_size
    end = start + chunk_size if vm < TOTAL_VMS else total

    chunk = podcasts[start:end]

    output_file = os.path.join(OUTPUT_DIR, f"podcasts_vm{vm}.json")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(chunk, f, ensure_ascii=False)

    size_mb = os.path.getsize(output_file) / (1024 * 1024)
    print(f"VM {vm}: {len(chunk)} podcasts ({size_mb:.2f} MB)")

print("")
print("=== SPLIT TERMINE ===")
print(f"Fichiers dans: {OUTPUT_DIR}")
