import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
cred = credentials.Certificate(r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# List all collections
print("=== COLLECTIONS DANS FIRESTORE ===")
collections = db.collections()
for col in collections:
    print(f"  - {col.id}")

print("")

# Try to find users/contacts collection and show ID -> First Name, Last Name
possible_collections = ['users', 'contacts', 'customers', 'clients', 'people', 'members']

for col_name in possible_collections:
    try:
        docs = db.collection(col_name).limit(5).stream()
        docs_list = list(docs)
        if docs_list:
            print(f"=== COLLECTION: {col_name} ===")
            print("ID → First Name, Last Name")
            print("-" * 50)

            # Get all docs now
            all_docs = db.collection(col_name).stream()
            for doc in all_docs:
                data = doc.to_dict()
                first_name = data.get('firstName', data.get('first_name', data.get('FirstName', data.get('prenom', ''))))
                last_name = data.get('lastName', data.get('last_name', data.get('LastName', data.get('nom', ''))))

                if first_name or last_name:
                    print(f"{doc.id} → {first_name} {last_name}")
                else:
                    # Show all fields to understand structure
                    print(f"{doc.id} → {list(data.keys())[:5]}")
            print("")
    except Exception as e:
        pass

# If no known collection found, explore first collection
print("=== EXPLORATION DÉTAILLÉE ===")
collections = list(db.collections())
if collections:
    first_col = collections[0]
    print(f"Collection: {first_col.id}")
    docs = first_col.limit(3).stream()
    for doc in docs:
        data = doc.to_dict()
        print(f"\nID: {doc.id}")
        for key, value in data.items():
            print(f"  {key}: {value}")
