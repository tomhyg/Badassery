import json
import os

INPUT_FILE = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_enriched_complete.json"

print("=== CHARGEMENT ===")
with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    podcasts = json.load(f)

total = len(podcasts)
print(f"Total podcasts: {total}")
print("")

print("=== STATISTIQUES DE REMPLISSAGE ===")
print("")

# RSS
rss_email = sum(1 for p in podcasts if p.get('rss_owner_email'))
rss_author = sum(1 for p in podcasts if p.get('rss_author'))
rss_ep1 = sum(1 for p in podcasts if p.get('rss_ep1_title'))
print("RSS PARSING:")
print(f"  Email: {rss_email} ({100*rss_email/total:.1f}%)")
print(f"  Author: {rss_author} ({100*rss_author/total:.1f}%)")
print(f"  Episodes: {rss_ep1} ({100*rss_ep1/total:.1f}%)")
print("")

# Apple
apple_rating = sum(1 for p in podcasts if p.get('apple_rating'))
apple_reviews = sum(1 for p in podcasts if p.get('apple_rating_count'))
print("APPLE SCRAPING:")
print(f"  Rating: {apple_rating} ({100*apple_rating/total:.1f}%)")
print(f"  Review count: {apple_reviews} ({100*apple_reviews/total:.1f}%)")
print("")

# Website
web_yt = sum(1 for p in podcasts if p.get('website_youtube'))
web_tw = sum(1 for p in podcasts if p.get('website_twitter'))
web_ig = sum(1 for p in podcasts if p.get('website_instagram'))
web_fb = sum(1 for p in podcasts if p.get('website_facebook'))
web_li = sum(1 for p in podcasts if p.get('website_linkedin'))
web_tk = sum(1 for p in podcasts if p.get('website_tiktok'))
web_sp = sum(1 for p in podcasts if p.get('website_spotify'))
web_em = sum(1 for p in podcasts if p.get('website_email'))
print("WEBSITE SCRAPING:")
print(f"  YouTube: {web_yt} ({100*web_yt/total:.1f}%)")
print(f"  Twitter: {web_tw} ({100*web_tw/total:.1f}%)")
print(f"  Instagram: {web_ig} ({100*web_ig/total:.1f}%)")
print(f"  Facebook: {web_fb} ({100*web_fb/total:.1f}%)")
print(f"  LinkedIn: {web_li} ({100*web_li/total:.1f}%)")
print(f"  TikTok: {web_tk} ({100*web_tk/total:.1f}%)")
print(f"  Spotify: {web_sp} ({100*web_sp/total:.1f}%)")
print(f"  Email: {web_em} ({100*web_em/total:.1f}%)")
print("")

# YouTube
yt_channel = sum(1 for p in podcasts if p.get('yt_channel_name'))
yt_subs = sum(1 for p in podcasts if p.get('yt_subscribers'))
yt_desc = sum(1 for p in podcasts if p.get('yt_channel_description'))
yt_vid1 = sum(1 for p in podcasts if p.get('yt_video_1_title'))
print("YOUTUBE SCRAPING:")
print(f"  Channel name: {yt_channel} ({100*yt_channel/total:.1f}%)")
print(f"  Subscribers: {yt_subs} ({100*yt_subs/total:.1f}%)")
print(f"  Channel desc: {yt_desc} ({100*yt_desc/total:.1f}%)")
print(f"  Video 1: {yt_vid1} ({100*yt_vid1/total:.1f}%)")
print("")
print("=== FIN ===")
