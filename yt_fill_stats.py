import json
with open("enriched_vm19.json", "r") as f:
    podcasts = json.load(f)

total = len(podcasts)

yt_links = sum(1 for p in podcasts if p.get("website_youtube"))
yt_channel = sum(1 for p in podcasts if p.get("yt_channel_name"))
yt_subs = sum(1 for p in podcasts if p.get("yt_subscribers"))
yt_desc = sum(1 for p in podcasts if p.get("yt_channel_description"))
yt_vid1 = sum(1 for p in podcasts if p.get("yt_video_1_title"))
yt_vid1_views = sum(1 for p in podcasts if p.get("yt_video_1_views"))

print("YOUTUBE FILL RATE:")
print("  Podcasts total:", total)
print("  YT links (website):", yt_links, "-", round(100*yt_links/total,1), "%")
print("  YT channel name:", yt_channel, "-", round(100*yt_channel/total,1), "%")
print("  YT subscribers:", yt_subs, "-", round(100*yt_subs/total,1), "%")
print("  YT channel desc:", yt_desc, "-", round(100*yt_desc/total,1), "%")
print("  YT video 1 title:", yt_vid1, "-", round(100*yt_vid1/total,1), "%")
print("  YT video 1 views:", yt_vid1_views, "-", round(100*yt_vid1_views/total,1), "%")
