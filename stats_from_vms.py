import json
import os

INPUT_DIR = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results"
completed_vms = [1, 2, 3, 5, 6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20]

stats = {
    'total': 0,
    'rss_email': 0,
    'rss_author': 0,
    'rss_ep1': 0,
    'apple_rating': 0,
    'apple_reviews': 0,
    'web_yt': 0,
    'web_tw': 0,
    'web_ig': 0,
    'web_fb': 0,
    'web_li': 0,
    'web_tk': 0,
    'web_sp': 0,
    'web_em': 0,
    'yt_channel': 0,
    'yt_subs': 0,
    'yt_desc': 0,
    'yt_vid1': 0
}

print("=== CALCUL DES STATS ===")
for vm in completed_vms:
    file_path = os.path.join(INPUT_DIR, f"enriched_vm{vm}.json")
    print(f"Processing VM {vm}...", end=" ")

    with open(file_path, 'r', encoding='utf-8') as f:
        podcasts = json.load(f)

    stats['total'] += len(podcasts)
    stats['rss_email'] += sum(1 for p in podcasts if p.get('rss_owner_email'))
    stats['rss_author'] += sum(1 for p in podcasts if p.get('rss_author'))
    stats['rss_ep1'] += sum(1 for p in podcasts if p.get('rss_ep1_title'))
    stats['apple_rating'] += sum(1 for p in podcasts if p.get('apple_rating'))
    stats['apple_reviews'] += sum(1 for p in podcasts if p.get('apple_rating_count'))
    stats['web_yt'] += sum(1 for p in podcasts if p.get('website_youtube'))
    stats['web_tw'] += sum(1 for p in podcasts if p.get('website_twitter'))
    stats['web_ig'] += sum(1 for p in podcasts if p.get('website_instagram'))
    stats['web_fb'] += sum(1 for p in podcasts if p.get('website_facebook'))
    stats['web_li'] += sum(1 for p in podcasts if p.get('website_linkedin'))
    stats['web_tk'] += sum(1 for p in podcasts if p.get('website_tiktok'))
    stats['web_sp'] += sum(1 for p in podcasts if p.get('website_spotify'))
    stats['web_em'] += sum(1 for p in podcasts if p.get('website_email'))
    stats['yt_channel'] += sum(1 for p in podcasts if p.get('yt_channel_name'))
    stats['yt_subs'] += sum(1 for p in podcasts if p.get('yt_subscribers'))
    stats['yt_desc'] += sum(1 for p in podcasts if p.get('yt_channel_description'))
    stats['yt_vid1'] += sum(1 for p in podcasts if p.get('yt_video_1_title'))

    print(f"{len(podcasts)} podcasts")

total = stats['total']
print("")
print("=" * 50)
print(f"STATISTIQUES GLOBALES ({total} podcasts)")
print("=" * 50)
print("")
print("RSS PARSING:")
print(f"  Email: {stats['rss_email']} ({100*stats['rss_email']/total:.1f}%)")
print(f"  Author: {stats['rss_author']} ({100*stats['rss_author']/total:.1f}%)")
print(f"  Episodes: {stats['rss_ep1']} ({100*stats['rss_ep1']/total:.1f}%)")
print("")
print("APPLE SCRAPING:")
print(f"  Rating: {stats['apple_rating']} ({100*stats['apple_rating']/total:.1f}%)")
print(f"  Review count: {stats['apple_reviews']} ({100*stats['apple_reviews']/total:.1f}%)")
print("")
print("WEBSITE SCRAPING:")
print(f"  YouTube: {stats['web_yt']} ({100*stats['web_yt']/total:.1f}%)")
print(f"  Twitter: {stats['web_tw']} ({100*stats['web_tw']/total:.1f}%)")
print(f"  Instagram: {stats['web_ig']} ({100*stats['web_ig']/total:.1f}%)")
print(f"  Facebook: {stats['web_fb']} ({100*stats['web_fb']/total:.1f}%)")
print(f"  LinkedIn: {stats['web_li']} ({100*stats['web_li']/total:.1f}%)")
print(f"  TikTok: {stats['web_tk']} ({100*stats['web_tk']/total:.1f}%)")
print(f"  Spotify: {stats['web_sp']} ({100*stats['web_sp']/total:.1f}%)")
print(f"  Email: {stats['web_em']} ({100*stats['web_em']/total:.1f}%)")
print("")
print("YOUTUBE SCRAPING:")
print(f"  Channel name: {stats['yt_channel']} ({100*stats['yt_channel']/total:.1f}%)")
print(f"  Subscribers: {stats['yt_subs']} ({100*stats['yt_subs']/total:.1f}%)")
print(f"  Channel desc: {stats['yt_desc']} ({100*stats['yt_desc']/total:.1f}%)")
print(f"  Video 1: {stats['yt_vid1']} ({100*stats['yt_vid1']/total:.1f}%)")
