import json
import os

INPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results"

# Load one VM file
with open(os.path.join(INPUT_DIR, "enriched_vm19.json"), 'r', encoding='utf-8') as f:
    podcasts = json.load(f)

print("=" * 70)
print("EXEMPLE 1: PODCAST AVEC INFOS YOUTUBE COMPLETES")
print("=" * 70)

# Find one with full YT data
found = False
for p in podcasts:
    if p.get('yt_channel_name') and p.get('yt_subscribers'):
        subs = p.get('yt_subscribers')
        if subs and subs > 0:
            print(f"Podcast: {p.get('title', '')[:60]}")
            print(f"iTunes ID: {p.get('itunesId')}")
            print("")
            print("--- RSS ---")
            print(f"  Email: {p.get('rss_owner_email', 'N/A')}")
            print(f"  Author: {p.get('rss_author', 'N/A')}")
            print("")
            print("--- Website ---")
            print(f"  YouTube link: {p.get('website_youtube', 'N/A')}")
            print(f"  Twitter: {p.get('website_twitter', 'N/A')}")
            print(f"  Instagram: {p.get('website_instagram', 'N/A')}")
            print("")
            print("--- YouTube Data ---")
            print(f"  Channel: {p.get('yt_channel_name')}")
            print(f"  Subscribers: {p.get('yt_subscribers'):,}")
            print(f"  Channel ID: {p.get('yt_channel_id', 'N/A')}")
            found = True
            break

if not found:
    # Show any with channel name
    for p in podcasts:
        if p.get('yt_channel_name'):
            print(f"Podcast: {p.get('title', '')[:60]}")
            print(f"  Channel: {p.get('yt_channel_name')}")
            print(f"  Subscribers: {p.get('yt_subscribers')}")
            break

print("")
print("=" * 70)
print("EXEMPLE 2: PODCAST AVEC LIEN YOUTUBE QUI N'A PAS MARCHE")
print("=" * 70)

# Find one with YT link but no data (not spotifyforcreators)
for p in podcasts:
    yt_link = p.get('website_youtube', '')
    if yt_link and 'spotifyforcreators' not in yt_link and not p.get('yt_channel_name'):
        print(f"Podcast: {p.get('title', '')[:60]}")
        print(f"iTunes ID: {p.get('itunesId')}")
        print("")
        print(f"  YouTube link trouve: {yt_link}")
        print(f"  YouTube status: {p.get('youtube_status', 'N/A')}")
        print(f"  Channel name: {p.get('yt_channel_name', 'VIDE')}")
        print(f"  Subscribers: {p.get('yt_subscribers', 'VIDE')}")
        break

print("")
print("=" * 70)
print("STATS GLOBALES YOUTUBE (VM 19 - 9607 podcasts)")
print("=" * 70)

total = len(podcasts)
has_yt_link = sum(1 for p in podcasts if p.get('website_youtube'))
has_channel = sum(1 for p in podcasts if p.get('yt_channel_name'))
has_subs = sum(1 for p in podcasts if p.get('yt_subscribers'))

# Count spotifyforcreators links (bad links)
bad_links = sum(1 for p in podcasts if 'spotifyforcreators' in str(p.get('website_youtube', '')))

print(f"Total podcasts: {total}")
print(f"Avec lien YouTube: {has_yt_link} ({100*has_yt_link/total:.1f}%)")
print(f"  - Liens 'spotifyforcreators' (mauvais): {bad_links}")
print(f"  - Liens valides: {has_yt_link - bad_links}")
print("")
print(f"Channel recupere: {has_channel} ({100*has_channel/total:.1f}%)")
print(f"Subscribers recupere: {has_subs} ({100*has_subs/total:.1f}%)")
print("")
valid_links = has_yt_link - bad_links
if valid_links > 0:
    print(f"Taux de succes (liens valides): {100*has_channel/valid_links:.1f}%")
