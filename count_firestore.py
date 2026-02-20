import firebase_admin
from firebase_admin import credentials, firestore

FIREBASE_CRED = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_CRED)
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Count documents in podcasts collection
docs = db.collection('podcasts').limit(1).get()
print("Collection 'podcasts' existe!")

# Get approximate count
count = 0
for doc in db.collection('podcasts').stream():
    count += 1
    if count % 1000 == 0:
        print(f"Comptage: {count}...")

print(f"\nTotal podcasts dans Firestore: {count}")
