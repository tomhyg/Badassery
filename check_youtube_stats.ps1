$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

$ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-19"

Write-Host "Checking YouTube stats on VM 19..."
Write-Host ""

ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip 'python3 << PYEOF
import json

with open("enriched_vm19.json", "r") as f:
    podcasts = json.load(f)

has_yt_link = sum(1 for p in podcasts if p.get("website_youtube"))
has_yt_channel = sum(1 for p in podcasts if p.get("yt_channel_name"))
has_yt_subs = sum(1 for p in podcasts if p.get("yt_subscribers"))
has_yt_videos = sum(1 for p in podcasts if p.get("yt_video_1_title"))

print("=== YOUTUBE SCRAPING STATS ===")
print("Podcasts avec lien YouTube:", has_yt_link)
print("Channels trouvees:", has_yt_channel)
print("Avec subscribers:", has_yt_subs)
print("Avec videos:", has_yt_videos)
print("")

count = 0
for p in podcasts:
    if p.get("yt_channel_name") and p.get("yt_subscribers"):
        if count < 3:
            title = p.get("title", "")[:50]
            print("===", title, "===")
            print("  Channel:", p.get("yt_channel_name"))
            print("  Subscribers:", p.get("yt_subscribers"))
            vid = p.get("yt_video_1_title", "")
            if vid:
                print("  Video 1:", vid[:50])
            print("  Views:", p.get("yt_video_1_views"))
            print("")
            count += 1
    if count >= 3:
        break

print("=== WEBSITE STATS ===")
tw = sum(1 for p in podcasts if p.get("website_twitter"))
ig = sum(1 for p in podcasts if p.get("website_instagram"))
fb = sum(1 for p in podcasts if p.get("website_facebook"))
li = sum(1 for p in podcasts if p.get("website_linkedin"))
tk = sum(1 for p in podcasts if p.get("website_tiktok"))
sp = sum(1 for p in podcasts if p.get("website_spotify"))
em = sum(1 for p in podcasts if p.get("website_email"))
print("YouTube links:", has_yt_link)
print("Twitter:", tw)
print("Instagram:", ig)
print("Facebook:", fb)
print("LinkedIn:", li)
print("TikTok:", tk)
print("Spotify:", sp)
print("Email (website):", em)
PYEOF'
