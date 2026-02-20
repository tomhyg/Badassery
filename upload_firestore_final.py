import json
import os
import time
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Configuration
FIREBASE_CRED = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json"
WORK_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle"
COLLECTION_NAME = "podcasts"
BATCH_SIZE = 400  # Firestore max est 500

# Tous les fichiers a uploader
FILES_TO_UPLOAD = [
    # Nouvelles VMs (dans le dossier principal)
    "enriched_vm1.json", "enriched_vm2.json", "enriched_vm3.json", "enriched_vm4.json",
    "enriched_vm5.json", "enriched_vm6.json", "enriched_vm7.json", "enriched_vm8.json",
    "enriched_vm9.json", "enriched_vm10.json", "enriched_vm11.json", "enriched_vm12.json",
    "enriched_vm13.json", "enriched_vm14.json", "enriched_vm15.json", "enriched_vm16.json",
    "enriched_vm17.json", "enriched_vm18.json", "enriched_vm19.json", "enriched_vm20.json",
]

# Anciens fichiers dans enriched_results
OLD_FILES = [
    "enriched_results/enriched_vm1.json", "enriched_results/enriched_vm2.json",
    "enriched_results/enriched_vm3.json", "enriched_results/enriched_vm5.json",
    "enriched_results/enriched_vm6.json", "enriched_results/enriched_vm7.json",
    "enriched_results/enriched_vm8.json", "enriched_results/enriched_vm10.json",
    "enriched_results/enriched_vm12.json", "enriched_results/enriched_vm13.json",
    "enriched_results/enriched_vm14.json", "enriched_results/enriched_vm16.json",
    "enriched_results/enriched_vm17.json", "enriched_results/enriched_vm18.json",
    "enriched_results/enriched_vm19.json", "enriched_results/enriched_vm20.json",
]

def init_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CRED)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def upload_file(db, file_path, file_name):
    """Upload un fichier JSON vers Firestore"""
    print(f"\n{'='*50}")
    print(f"Uploading: {file_name}")
    print('='*50)

    with open(file_path, 'r', encoding='utf-8') as f:
        podcasts = json.load(f)

    total = len(podcasts)
    uploaded = 0
    errors = 0

    for i in range(0, total, BATCH_SIZE):
        batch = db.batch()
        batch_podcasts = podcasts[i:i+BATCH_SIZE]
        batch_count = 0

        for podcast in batch_podcasts:
            itunes_id = podcast.get('itunesId') or podcast.get('itunes_id')
            if not itunes_id:
                continue

            doc_ref = db.collection(COLLECTION_NAME).document(str(itunes_id))
            batch.set(doc_ref, podcast, merge=True)
            batch_count += 1

        try:
            batch.commit()
            uploaded += batch_count
            pct = 100 * uploaded / total
            print(f"  {uploaded}/{total} ({pct:.0f}%)", end='\r')
        except Exception as e:
            errors += 1
            print(f"\n  Erreur batch {i}: {str(e)[:50]}")
            if "429" in str(e) or "quota" in str(e).lower():
                print("  Pause de 30s pour quota...")
                time.sleep(30)
            else:
                time.sleep(2)

    print(f"\n  OK: {uploaded} podcasts uploades, {errors} erreurs")
    return uploaded, errors

def main():
    print("=" * 60)
    print("UPLOAD VERS FIRESTORE")
    print(f"Collection: {COLLECTION_NAME}")
    print(f"Date: {datetime.now()}")
    print("=" * 60)

    db = init_firebase()
    print("Firebase connecte!")

    total_uploaded = 0
    total_errors = 0

    # 1. Upload des nouvelles VMs
    print("\n>>> NOUVELLES VMs <<<")
    for file_name in FILES_TO_UPLOAD:
        file_path = os.path.join(WORK_DIR, file_name)
        if os.path.exists(file_path):
            uploaded, errors = upload_file(db, file_path, file_name)
            total_uploaded += uploaded
            total_errors += errors
        else:
            print(f"  {file_name}: NON TROUVE")

    # 2. Upload des anciens fichiers
    print("\n>>> ANCIENS FICHIERS <<<")
    for file_name in OLD_FILES:
        file_path = os.path.join(WORK_DIR, file_name)
        if os.path.exists(file_path):
            uploaded, errors = upload_file(db, file_path, file_name)
            total_uploaded += uploaded
            total_errors += errors
        else:
            print(f"  {file_name}: NON TROUVE")

    print("\n" + "=" * 60)
    print("UPLOAD TERMINE!")
    print(f"Total uploade: {total_uploaded}")
    print(f"Total erreurs: {total_errors}")
    print("=" * 60)

if __name__ == "__main__":
    main()
