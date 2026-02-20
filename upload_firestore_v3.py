import json
import os
import sys
import time
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Force flush stdout
sys.stdout.reconfigure(line_buffering=True)

# Configuration
FIREBASE_CRED = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json"
WORK_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle"
COLLECTION_NAME = "podcasts"
BATCH_SIZE = 400

# Tous les fichiers a uploader
ALL_FILES = []

# Nouvelles VMs (dans le dossier principal)
for i in [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]:
    ALL_FILES.append(f"enriched_vm{i}.json")

# Anciens fichiers dans enriched_results
for i in [1,2,3,5,6,7,8,10,12,13,14,16,17,18,19,20]:
    ALL_FILES.append(f"enriched_results/enriched_vm{i}.json")

def init_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CRED)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def get_existing_ids(db):
    """Recupere les IDs deja dans Firestore"""
    print("Chargement des IDs existants...", flush=True)
    existing = set()
    last_doc = None

    while True:
        if last_doc:
            docs = db.collection(COLLECTION_NAME).order_by('__name__').start_after(last_doc).limit(10000).stream()
        else:
            docs = db.collection(COLLECTION_NAME).order_by('__name__').limit(10000).stream()

        batch_count = 0
        for doc in docs:
            existing.add(doc.id)
            batch_count += 1
            last_doc = doc

        print(f"  {len(existing)} IDs charges...", flush=True)

        if batch_count < 10000:
            break

    print(f"Total IDs existants: {len(existing)}", flush=True)
    return existing

def upload_file(db, file_path, file_name, existing_ids):
    """Upload un fichier JSON vers Firestore"""
    print(f"\n{'='*50}", flush=True)
    print(f"Fichier: {file_name}", flush=True)
    print('='*50, flush=True)

    with open(file_path, 'r', encoding='utf-8') as f:
        podcasts = json.load(f)

    # Filtrer les podcasts deja uploades
    to_upload = []
    for p in podcasts:
        itunes_id = str(p.get('itunesId') or p.get('itunes_id') or '')
        if itunes_id and itunes_id not in existing_ids:
            to_upload.append(p)

    if not to_upload:
        print(f"  Tous deja uploades, skip!", flush=True)
        return 0, 0

    total = len(to_upload)
    print(f"  {total} nouveaux podcasts a uploader", flush=True)

    uploaded = 0
    errors = 0

    for i in range(0, total, BATCH_SIZE):
        batch = db.batch()
        batch_podcasts = to_upload[i:i+BATCH_SIZE]
        batch_count = 0

        for podcast in batch_podcasts:
            itunes_id = str(podcast.get('itunesId') or podcast.get('itunes_id'))
            doc_ref = db.collection(COLLECTION_NAME).document(itunes_id)
            batch.set(doc_ref, podcast, merge=True)
            batch_count += 1
            existing_ids.add(itunes_id)  # Marquer comme uploade

        try:
            batch.commit()
            uploaded += batch_count
            pct = 100 * uploaded / total
            print(f"  {uploaded}/{total} ({pct:.0f}%)", flush=True)
            time.sleep(0.5)  # Petite pause
        except Exception as e:
            errors += 1
            error_str = str(e)
            print(f"  ERREUR: {error_str[:80]}", flush=True)
            if "429" in error_str or "quota" in error_str.lower():
                print("  Pause 60s pour quota...", flush=True)
                time.sleep(60)
            else:
                time.sleep(5)

    print(f"  TERMINE: {uploaded} uploades, {errors} erreurs", flush=True)
    return uploaded, errors

def main():
    print("=" * 60, flush=True)
    print("UPLOAD FIRESTORE V3 - REPRISE", flush=True)
    print(f"Date: {datetime.now()}", flush=True)
    print("=" * 60, flush=True)

    db = init_firebase()
    print("Firebase connecte!", flush=True)

    # Charger les IDs existants pour skip
    existing_ids = get_existing_ids(db)

    total_uploaded = 0
    total_errors = 0

    for file_name in ALL_FILES:
        file_path = os.path.join(WORK_DIR, file_name)
        if os.path.exists(file_path):
            uploaded, errors = upload_file(db, file_path, file_name, existing_ids)
            total_uploaded += uploaded
            total_errors += errors
        else:
            print(f"  {file_name}: NON TROUVE", flush=True)

    print("\n" + "=" * 60, flush=True)
    print("UPLOAD TERMINE!", flush=True)
    print(f"Total uploade: {total_uploaded}", flush=True)
    print(f"Total erreurs: {total_errors}", flush=True)
    print(f"Total dans Firestore: {len(existing_ids)}", flush=True)
    print("=" * 60, flush=True)

if __name__ == "__main__":
    main()
