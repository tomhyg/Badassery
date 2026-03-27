import firebase_admin
from firebase_admin import credentials, firestore
import sys
import io

# Fix encoding for Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Initialize Firebase
cred = credentials.Certificate(r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

print("=" * 60)
print("FIRESTORE: ID → First Name, Last Name")
print("=" * 60)
print("")

# Get all clients
docs = db.collection('clients').stream()

results = []
for doc in docs:
    data = doc.to_dict()

    # Get identity info
    identity = data.get('identity', {})
    first_name = identity.get('firstName', '')
    last_name = identity.get('lastName', '')

    if first_name or last_name:
        results.append({
            'id': doc.id,
            'first_name': first_name,
            'last_name': last_name
        })

# Print results
print(f"{'ID':<30} {'First Name':<20} {'Last Name':<20}")
print("-" * 70)

for r in results:
    print(f"{r['id']:<30} {r['first_name']:<20} {r['last_name']:<20}")

print("")
print(f"Total: {len(results)} clients")
