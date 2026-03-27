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
BATCH_SIZE = 20  # Tres petit
PAUSE_SECONDS = 2  # Pause entre batches

# VMs a uploader (VM 1 deja fait)
COMPLETED_VMS = [2, 3, 5, 6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20]

# Reprises - mettre l'index ou reprendre pour chaque VM si interrompu
# VM 2 deja partiellement fait, reprendre a 7200
RESUME_INDEX = {
    2: 7200,  # VM 2 reprendre ici
    # Autres VMs commencent a 0
}

def init_firebase():
    """Initialise Firebase"""
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CRED)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def upload_batch(db, podcasts, max_retries=5):
    """Upload un batch avec retry et backoff"""
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
            error_str = str(e)
            if "429" in error_str or "Quota" in error_str.lower():
                # Quota exceeded - wait longer
                wait_time = 60 * (attempt + 1)  # 60s, 120s, 180s...
                print(f"\n  Quota exceeded! Waiting {wait_time}s...")
                time.sleep(wait_time)
            elif attempt < max_retries - 1:
                wait_time = 5 * (attempt + 1)
                print(f"\n  Retry {attempt + 1}/{max_retries} after error, waiting {wait_time}s")
                time.sleep(wait_time)
            else:
                print(f"\n  Failed after {max_retries} attempts: {error_str[:100]}")
                raise

    return 0

def main():
    print("=" * 60)
    print("UPLOAD VERS FIRESTORE V3 (Conservative)")
    print(f"Collection: {COLLECTION_NAME}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Pause: {PAUSE_SECONDS}s entre batches")
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
        print(f"  {len(podcasts)} podcasts total")

        # Index de reprise
        start_idx = RESUME_INDEX.get(vm, 0)
        if start_idx > 0:
            print(f"  Reprise a l'index {start_idx}")

        uploaded = start_idx  # Compter ceux deja faits
        errors = 0

        for i in range(start_idx, len(podcasts), BATCH_SIZE):
            batch_podcasts = podcasts[i:i+BATCH_SIZE]

            try:
                count = upload_batch(db, batch_podcasts)
                uploaded += count
                print(f"  VM{vm}: {uploaded}/{len(podcasts)} ({100*uploaded/len(podcasts):.1f}%)", end="\r")

                # Pause entre batches
                time.sleep(PAUSE_SECONDS)

            except Exception as e:
                errors += 1
                print(f"\n  Erreur a l'index {i}: {str(e)[:80]}")

                if errors >= 3:
                    print(f"\n  Trop d'erreurs! Sauvegarde position...")
                    print(f"  Pour reprendre VM {vm}, mettre RESUME_INDEX[{vm}] = {i}")
                    return

                # Longue pause apres erreur
                print(f"  Pause de 120s avant retry...")
                time.sleep(120)

        print(f"\n  VM{vm}: {uploaded}/{len(podcasts)} OK")
        total_uploaded += uploaded

    print("")
    print("=" * 60)
    print(f"UPLOAD TERMINE!")
    print(f"Total: {total_uploaded} podcasts")
    print("=" * 60)

if __name__ == "__main__":
    main()
