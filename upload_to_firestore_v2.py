import json
import os
import time
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Configuration
FIREBASE_CRED = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json"
INPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results"
COLLECTION_NAME = "podcasts"
BATCH_SIZE = 30  # Très petit pour éviter quota

# VMs à uploader
COMPLETED_VMS = [2, 3, 5, 6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20]
# Pour VM 2, reprendre à partir de l'index 7200
START_INDEX_VM2 = 7200

def init_firebase():
    """Initialise Firebase"""
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CRED)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def upload_batch(db, podcasts, max_retries=3):
    """Upload un batch avec retry"""
    for attempt in range(max_retries):
        try:
            batch = db.batch()
            count = 0

            for podcast in podcasts:
                itunes_id = podcast.get('itunesId') or podcast.get('itunes_id')
                if not itunes_id:
                    continue

                doc_ref = db.collection(COLLECTION_NAME).document(str(itunes_id))
                batch.set(doc_ref, podcast, merge=True)
                count += 1

            batch.commit()
            return count

        except Exception as e:
            if attempt < max_retries - 1:
                print(f"\n  Retry {attempt + 1}/{max_retries} after error: {str(e)[:50]}")
                time.sleep(2)
            else:
                print(f"\n  Failed after {max_retries} attempts")
                raise

    return 0

def main():
    print("=" * 60)
    print("UPLOAD VERS FIRESTORE V2")
    print(f"Collection: {COLLECTION_NAME}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Date: {datetime.now()}")
    print("=" * 60)
    print("")

    db = init_firebase()
    print("Firebase connecte!")
    print("")

    total_uploaded = 0

    for vm in COMPLETED_VMS:
        file_path = os.path.join(INPUT_DIR, f"enriched_vm{vm}.json")
        print(f"=== VM {vm} ===")

        with open(file_path, 'r', encoding='utf-8') as f:
            podcasts = json.load(f)
        print(f"  {len(podcasts)} podcasts")

        # Pour VM 2, reprendre là où on s'est arrêté
        start_idx = START_INDEX_VM2 if vm == 2 else 0

        uploaded = start_idx  # Compter ceux déjà faits
        for i in range(start_idx, len(podcasts), BATCH_SIZE):
            batch_podcasts = podcasts[i:i+BATCH_SIZE]

            try:
                count = upload_batch(db, batch_podcasts)
                uploaded += count
                print(f"  {uploaded}/{len(podcasts)}", end="\r")

                # Pause pour éviter rate limiting
                time.sleep(1)

            except Exception as e:
                print(f"\n  Erreur fatale à l'index {i}: {e}")
                print(f"  Reprendre avec START_INDEX = {i}")
                return

        print(f"  {uploaded}/{len(podcasts)} OK")
        total_uploaded += uploaded

    print("")
    print("=" * 60)
    print(f"UPLOAD TERMINE!")
    print(f"Total: {total_uploaded} podcasts")
    print("=" * 60)

if __name__ == "__main__":
    main()
