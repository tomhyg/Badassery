"""
Divise le fichier podcasts_to_enrich.json en 20 fichiers pour les VMs
"""
import json
from datetime import datetime

INPUT = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_to_enrich.json"
OUTPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle"
TOTAL_VMS = 20

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def main():
    log("Chargement du fichier...")
    with open(INPUT, 'r', encoding='utf-8') as f:
        podcasts = json.load(f)

    total = len(podcasts)
    per_vm = total // TOTAL_VMS

    log(f"Total podcasts: {total}")
    log(f"Par VM: ~{per_vm}")

    for vm_num in range(1, TOTAL_VMS + 1):
        start_idx = (vm_num - 1) * per_vm
        end_idx = start_idx + per_vm if vm_num < TOTAL_VMS else total

        vm_podcasts = podcasts[start_idx:end_idx]

        output_file = f"{OUTPUT_DIR}\\podcasts_vm{vm_num}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(vm_podcasts, f, ensure_ascii=False)

        size_mb = len(json.dumps(vm_podcasts)) / (1024 * 1024)
        log(f"VM {vm_num:2d}: {len(vm_podcasts):,} podcasts ({size_mb:.1f} MB)")

    log("Terminé!")

if __name__ == "__main__":
    main()
