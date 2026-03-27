import json
import os

INPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results"

with open(os.path.join(INPUT_DIR, "enriched_vm19.json"), 'r', encoding='utf-8') as f:
    podcasts = json.load(f)

print("=" * 70)
print("PODCAST AVEC 10 VIDEOS YOUTUBE RECUPEREES")
print("=" * 70)

# Find one with videos
for p in podcasts:
    if p.get('yt_video_1_title') and p.get('yt_video_2_title'):
        print(f"Podcast: {p.get('title', '')[:60]}")
        print(f"iTunes ID: {p.get('itunesId')}")
        print("")
        print(f"Channel: {p.get('yt_channel_name')}")
        print(f"Subscribers: {p.get('yt_subscribers'):,}" if p.get('yt_subscribers') else "Subscribers: N/A")
        print("")
        print("--- 10 DERNIERES VIDEOS ---")

        for i in range(1, 11):
            title = p.get(f'yt_video_{i}_title')
            views = p.get(f'yt_video_{i}_views')
            duration = p.get(f'yt_video_{i}_duration')

            if title:
                views_str = f"{views:,}" if views else "N/A"
                dur_str = f"{duration}s" if duration else "N/A"
                print(f"  {i}. {title[:50]}")
                print(f"     Views: {views_str} | Duration: {dur_str}")
        break

# Stats on videos
print("")
print("=" * 70)
print("STATS VIDEOS YOUTUBE")
print("=" * 70)

has_vid1 = sum(1 for p in podcasts if p.get('yt_video_1_title'))
has_vid5 = sum(1 for p in podcasts if p.get('yt_video_5_title'))
has_vid10 = sum(1 for p in podcasts if p.get('yt_video_10_title'))

print(f"Podcasts avec video 1: {has_vid1}")
print(f"Podcasts avec video 5: {has_vid5}")
print(f"Podcasts avec video 10: {has_vid10}")
