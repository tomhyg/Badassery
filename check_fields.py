import json

with open(r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results\enriched_vm19.json", 'r', encoding='utf-8') as f:
    podcasts = json.load(f)

# Check first podcast with data
for p in podcasts[:5]:
    print("=== FIELDS ===")
    for key in p.keys():
        value = p[key]
        if value and value != "" and value != []:
            print(f"  {key}: {str(value)[:80]}")
    print("")
    break
