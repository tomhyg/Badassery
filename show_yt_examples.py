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
for p in podcasts:
    if p.get('yt_channel_name') and p.get('yt_subscribers') and p.get('yt_video_1_title'):
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
        print(f"  Subscribers: {p.get('yt_subscribers')}")
        print(f"  Channel ID: {p.get('yt_channel_id', 'N/A')}")
        print("")
        print("  Video 1: {0}".format(p.get('yt_video_1_title', '')[:50]))
        print(f"    Views: {p.get('yt_video_1_views', 'N/A')}")
        print(f"    Duration: {p.get('yt_video_1_duration', 'N/A')}")
        print("")
        print("  Video 2: {0}".format(p.get('yt_video_2_title', '')[:50] if p.get('yt_video_2_title') else 'N/A'))
        print(f"    Views: {p.get('yt_video_2_views', 'N/A')}")
        break

print("")
print("=" * 70)
print("EXEMPLE 2: PODCAST AVEC LIEN YOUTUBE QUI N'A PAS MARCHE")
print("=" * 70)

# Find one with YT link but no data
for p in podcasts:
    if p.get('website_youtube') and not p.get('yt_channel_name'):
        yt_status = p.get('youtube_status', 'N/A')
        print(f"Podcast: {p.get('title', '')[:60]}")
        print(f"iTunes ID: {p.get('itunesId')}")
        print("")
        print(f"  YouTube link trouve: {p.get('website_youtube')}")
        print(f"  YouTube status: {yt_status}")
        print(f"  Channel name: {p.get('yt_channel_name', 'N/A')}")
        print(f"  Subscribers: {p.get('yt_subscribers', 'N/A')}")
        break

print("")
print("=" * 70)
print("STATS GLOBALES YOUTUBE (VM 19)")
print("=" * 70)

total = len(podcasts)
has_yt_link = sum(1 for p in podcasts if p.get('website_youtube'))
has_channel = sum(1 for p in podcasts if p.get('yt_channel_name'))
has_subs = sum(1 for p in podcasts if p.get('yt_subscribers'))
has_videos = sum(1 for p in podcasts if p.get('yt_video_1_title'))

print(f"Total podcasts: {total}")
print(f"Avec lien YouTube: {has_yt_link} ({100*has_yt_link/total:.1f}%)")
print(f"Channel recupere: {has_channel} ({100*has_channel/total:.1f}%)")
print(f"Subscribers recupere: {has_subs} ({100*has_subs/total:.1f}%)")
print(f"Videos recuperees: {has_videos} ({100*has_videos/total:.1f}%)")
print("")
print(f"Taux de succes YouTube: {100*has_channel/has_yt_link:.1f}% des liens")
