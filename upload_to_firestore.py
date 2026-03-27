import json
import os
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Configuration
FIREBASE_CRED = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json"
INPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results"
COLLECTION_NAME = "podcasts"
BATCH_SIZE = 500  # Firestore limite à 500 writes par batch

# VMs terminées (VM 1 déjà uploadée)
COMPLETED_VMS = [2, 3, 5, 6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20]

def init_firebase():
    """Initialise Firebase"""
    cred = credentials.Certificate(FIREBASE_CRED)
    firebase_admin.initialize_app(cred)
    return firestore.client()

def upload_batch(db, podcasts, start_idx):
    """Upload un batch de podcasts"""
    batch = db.batch()
    count = 0

    for podcast in podcasts:
        # Utiliser itunesId comme document ID
        itunes_id = podcast.get('itunesId') or podcast.get('itunes_id')

        if not itunes_id:
            continue

        doc_ref = db.collection(COLLECTION_NAME).document(str(itunes_id))
        batch.set(doc_ref, podcast, merge=True)  # merge=True pour update si existe
        count += 1

    batch.commit()
    return count

def main():
    print("=" * 60)
    print("UPLOAD VERS FIRESTORE")
    print(f"Collection: {COLLECTION_NAME}")
    print(f"Date: {datetime.now()}")
    print("=" * 60)
    print("")

    # Init Firebase
    print("Connexion à Firebase...")
    db = init_firebase()
    print("Connecté!")
    print("")

    total_uploaded = 0

    for vm in COMPLETED_VMS:
        file_path = os.path.join(INPUT_DIR, f"enriched_vm{vm}.json")
        print(f"=== VM {vm} ===")

        # Charger le fichier
        print(f"  Chargement...", end=" ")
        with open(file_path, 'r', encoding='utf-8') as f:
            podcasts = json.load(f)
        print(f"{len(podcasts)} podcasts")

        # Upload par batches
        uploaded = 0
        for i in range(0, len(podcasts), BATCH_SIZE):
            batch_podcasts = podcasts[i:i+BATCH_SIZE]
            count = upload_batch(db, batch_podcasts, i)
            uploaded += count
            print(f"  Uploaded: {uploaded}/{len(podcasts)}", end="\r")

        print(f"  Uploaded: {uploaded}/{len(podcasts)} OK")
        total_uploaded += uploaded

    print("")
    print("=" * 60)
    print(f"UPLOAD TERMINE!")
    print(f"Total podcasts uploadés: {total_uploaded}")
    print("=" * 60)

if __name__ == "__main__":
    main()
