"""
APPLE PODCASTS SCRAPER - Version VM
====================================
À lancer sur chaque VM Google Cloud avec un numéro de VM différent

Usage: python apple_scraper_vm.py [VM_NUMBER] [TOTAL_VMS]
Exemple: python apple_scraper_vm.py 1 20   (VM 1 sur 20)
         python apple_scraper_vm.py 2 20   (VM 2 sur 20)

Récupère:
- Rating (note /5)
- Rating count (nombre de notes)
- Review count (nombre d'avis avec texte)
- Top 5 reviews (texte des avis)
"""

import requests
import json
import time
import random
import sys
import os
from datetime import datetime
from bs4 import BeautifulSoup
import re

# ============== CONFIGURATION ==============
# Fichier d'entrée : liste des iTunes IDs (un par ligne ou JSON)
INPUT_FILE = "itunes_ids.json"  # Format: [{"id": 123, "itunes_id": 456}, ...]
OUTPUT_FILE = "apple_scraped_VM{vm_num}.json"
PROGRESS_FILE = "progress_VM{vm_num}.json"

# Rate limiting
MIN_DELAY = 1.0  # Minimum 1 seconde entre requêtes
MAX_DELAY = 3.0  # Maximum 3 secondes (randomisé)
ERROR_DELAY = 10  # Attendre 10s après une erreur

# Headers pour simuler un navigateur
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
}

def log(msg, vm_num):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [VM{vm_num}] {msg}")

def save_progress(vm_num, processed, total, results):
    """Sauvegarde le progrès et les résultats"""
    progress = {
        "vm_num": vm_num,
        "processed": processed,
        "total": total,
        "percentage": round((processed / total) * 100, 2) if total > 0 else 0,
        "last_update": datetime.now().isoformat()
    }

    progress_file = PROGRESS_FILE.format(vm_num=vm_num)
    with open(progress_file, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2)

    output_file = OUTPUT_FILE.format(vm_num=vm_num)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

def scrape_apple_podcast(itunes_id):
    """
    Scrape une page Apple Podcasts pour récupérer rating, reviews, etc.
    """
    url = f"https://podcasts.apple.com/us/podcast/id{itunes_id}"

    result = {
        "itunes_id": itunes_id,
        "apple_rating": None,
        "apple_rating_count": None,
        "apple_review_count": None,
        "apple_reviews": [],
        "scrape_status": "pending",
        "scrape_error": None
    }

    try:
        response = requests.get(url, headers=HEADERS, timeout=30)

        if response.status_code == 404:
            result["scrape_status"] = "not_found"
            return result

        if response.status_code != 200:
            result["scrape_status"] = "error"
            result["scrape_error"] = f"HTTP {response.status_code}"
            return result

        soup = BeautifulSoup(response.text, 'html.parser')

        # Méthode 1: Chercher dans le JSON-LD (structured data)
        scripts = soup.find_all('script', type='application/ld+json')
        for script in scripts:
            try:
                data = json.loads(script.string)
                if isinstance(data, dict):
                    if 'aggregateRating' in data:
                        rating_data = data['aggregateRating']
                        result["apple_rating"] = float(rating_data.get('ratingValue', 0))
                        result["apple_rating_count"] = int(rating_data.get('ratingCount', 0))
                        result["apple_review_count"] = int(rating_data.get('reviewCount', 0))
            except:
                pass

        # Méthode 2: Parser le HTML si JSON-LD n'a pas marché
        if result["apple_rating"] is None:
            # Chercher la note dans les éléments
            rating_elem = soup.find('span', class_=re.compile(r'rating', re.I))
            if rating_elem:
                rating_text = rating_elem.get_text()
                rating_match = re.search(r'(\d+\.?\d*)', rating_text)
                if rating_match:
                    result["apple_rating"] = float(rating_match.group(1))

            # Chercher le nombre de ratings
            rating_count_elem = soup.find(string=re.compile(r'\d+[\s,]*Ratings?', re.I))
            if rating_count_elem:
                count_match = re.search(r'([\d,]+)\s*Ratings?', rating_count_elem, re.I)
                if count_match:
                    result["apple_rating_count"] = int(count_match.group(1).replace(',', ''))

        # Méthode 3: Chercher dans les meta tags
        if result["apple_rating"] is None:
            meta_rating = soup.find('meta', {'name': 'apple:rating'})
            if meta_rating:
                result["apple_rating"] = float(meta_rating.get('content', 0))

        # Extraire les reviews (si présents sur la page)
        review_elements = soup.find_all('div', class_=re.compile(r'review', re.I))[:5]
        for rev_elem in review_elements:
            review_text = rev_elem.get_text(strip=True)[:500]
            if review_text and len(review_text) > 20:
                result["apple_reviews"].append(review_text)

        # Aussi chercher dans la structure plus spécifique d'Apple
        # (La structure peut changer, donc on essaie plusieurs sélecteurs)
        if not result["apple_reviews"]:
            review_containers = soup.select('[class*="CustomerReview"]')
            for container in review_containers[:5]:
                text = container.get_text(strip=True)[:500]
                if text and len(text) > 20:
                    result["apple_reviews"].append(text)

        result["scrape_status"] = "success"

    except requests.exceptions.Timeout:
        result["scrape_status"] = "timeout"
        result["scrape_error"] = "Request timeout"
    except requests.exceptions.RequestException as e:
        result["scrape_status"] = "error"
        result["scrape_error"] = str(e)[:200]
    except Exception as e:
        result["scrape_status"] = "error"
        result["scrape_error"] = str(e)[:200]

    return result

def load_itunes_ids(input_file):
    """Charge la liste des iTunes IDs depuis le fichier"""
    if input_file.endswith('.json'):
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Support différents formats
            if isinstance(data, list):
                if isinstance(data[0], dict):
                    return data  # [{id, itunes_id}, ...]
                else:
                    return [{"itunes_id": x} for x in data]  # [id1, id2, ...]
    elif input_file.endswith('.txt'):
        with open(input_file, 'r') as f:
            return [{"itunes_id": int(line.strip())} for line in f if line.strip()]
    elif input_file.endswith('.csv'):
        import csv
        with open(input_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            return [row for row in reader]

    raise ValueError(f"Format de fichier non supporté: {input_file}")

def get_vm_slice(data, vm_num, total_vms):
    """Retourne la tranche de données pour cette VM"""
    total = len(data)
    per_vm = total // total_vms
    start = (vm_num - 1) * per_vm

    # La dernière VM prend le reste
    if vm_num == total_vms:
        end = total
    else:
        end = start + per_vm

    return data[start:end], start, end

def load_existing_results(vm_num):
    """Charge les résultats existants pour reprendre"""
    output_file = OUTPUT_FILE.format(vm_num=vm_num)
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return []

def main():
    if len(sys.argv) < 3:
        print("Usage: python apple_scraper_vm.py [VM_NUMBER] [TOTAL_VMS]")
        print("Exemple: python apple_scraper_vm.py 1 20")
        sys.exit(1)

    vm_num = int(sys.argv[1])
    total_vms = int(sys.argv[2])

    log(f"Démarrage - VM {vm_num}/{total_vms}", vm_num)

    # Charger les données
    if not os.path.exists(INPUT_FILE):
        log(f"ERREUR: Fichier {INPUT_FILE} non trouvé!", vm_num)
        sys.exit(1)

    all_data = load_itunes_ids(INPUT_FILE)
    log(f"Total podcasts dans le fichier: {len(all_data)}", vm_num)

    # Obtenir la tranche pour cette VM
    vm_data, start_idx, end_idx = get_vm_slice(all_data, vm_num, total_vms)
    log(f"Cette VM traite: {len(vm_data)} podcasts (index {start_idx} à {end_idx})", vm_num)

    # Charger les résultats existants (pour reprendre)
    results = load_existing_results(vm_num)
    already_done = {r.get('itunes_id') for r in results}
    log(f"Déjà traités: {len(already_done)}", vm_num)

    # Filtrer ce qui reste à faire
    to_process = [p for p in vm_data if p.get('itunes_id') not in already_done]
    log(f"Reste à traiter: {len(to_process)}", vm_num)

    if not to_process:
        log("Tout est déjà traité!", vm_num)
        return

    # Scraper
    total = len(to_process)
    success_count = 0
    error_count = 0

    for i, podcast in enumerate(to_process):
        itunes_id = podcast.get('itunes_id')

        if not itunes_id:
            continue

        # Scraper
        result = scrape_apple_podcast(itunes_id)

        # Ajouter l'ID original si présent
        if 'id' in podcast:
            result['podcast_id'] = podcast['id']

        results.append(result)

        if result['scrape_status'] == 'success':
            success_count += 1
        else:
            error_count += 1

        # Log et sauvegarde périodique
        processed = i + 1
        if processed % 50 == 0 or processed == total:
            log(f"Progrès: {processed}/{total} ({round(processed/total*100, 1)}%) - Succès: {success_count}, Erreurs: {error_count}", vm_num)
            save_progress(vm_num, len(results), len(vm_data), results)

        # Rate limiting avec randomisation
        delay = random.uniform(MIN_DELAY, MAX_DELAY)
        if result['scrape_status'] == 'error':
            delay = ERROR_DELAY
        time.sleep(delay)

    # Sauvegarde finale
    save_progress(vm_num, len(results), len(vm_data), results)

    log("="*50, vm_num)
    log(f"TERMINÉ!", vm_num)
    log(f"Total traité: {len(results)}", vm_num)
    log(f"Succès: {success_count}", vm_num)
    log(f"Erreurs: {error_count}", vm_num)
    log(f"Fichier: {OUTPUT_FILE.format(vm_num=vm_num)}", vm_num)
    log("="*50, vm_num)

if __name__ == "__main__":
    main()
