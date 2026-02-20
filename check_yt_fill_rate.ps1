$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

# Check VM 19 (completed)
$ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-19"

Write-Host "=== STATS YOUTUBE (VM 19 - 9607 podcasts) ==="
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip 'python3 << PYEOF
import json
with open("enriched_vm19.json", "r") as f:
    podcasts = json.load(f)

total = len(podcasts)

# Website YouTube links found
yt_links = sum(1 for p in podcasts if p.get("website_youtube"))

# YouTube data filled
yt_channel = sum(1 for p in podcasts if p.get("yt_channel_name"))
yt_subs = sum(1 for p in podcasts if p.get("yt_subscribers"))
yt_desc = sum(1 for p in podcasts if p.get("yt_channel_description"))
yt_vid1 = sum(1 for p in podcasts if p.get("yt_video_1_title"))
yt_vid1_views = sum(1 for p in podcasts if p.get("yt_video_1_views"))

print("YOUTUBE FILL RATE:")
print("  Podcasts total:", total)
print("  YT links trouves (website):", yt_links, "(" + str(round(100*yt_links/total,1)) + "%)")
print("  YT channel name:", yt_channel, "(" + str(round(100*yt_channel/total,1)) + "%)")
print("  YT subscribers:", yt_subs, "(" + str(round(100*yt_subs/total,1)) + "%)")
print("  YT channel desc:", yt_desc, "(" + str(round(100*yt_desc/total,1)) + "%)")
print("  YT video 1 title:", yt_vid1, "(" + str(round(100*yt_vid1/total,1)) + "%)")
print("  YT video 1 views:", yt_vid1_views, "(" + str(round(100*yt_vid1_views/total,1)) + "%)")
PYEOF'
