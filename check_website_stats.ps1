$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

$ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-19"

ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "python3 << 'PYEOF'
import json
with open('enriched_vm19.json', 'r') as f:
    podcasts = json.load(f)

yt = sum(1 for p in podcasts if p.get('website_youtube'))
tw = sum(1 for p in podcasts if p.get('website_twitter'))
ig = sum(1 for p in podcasts if p.get('website_instagram'))
fb = sum(1 for p in podcasts if p.get('website_facebook'))
li = sum(1 for p in podcasts if p.get('website_linkedin'))
tk = sum(1 for p in podcasts if p.get('website_tiktok'))
sp = sum(1 for p in podcasts if p.get('website_spotify'))
em = sum(1 for p in podcasts if p.get('website_email'))

print('=== WEBSITE SCRAPING STATS (VM 19) ===')
print('YouTube links:', yt)
print('Twitter:', tw)
print('Instagram:', ig)
print('Facebook:', fb)
print('LinkedIn:', li)
print('TikTok:', tk)
print('Spotify:', sp)
print('Email (from website):', em)
print('')

for p in podcasts:
    if p.get('website_youtube') or p.get('website_twitter'):
        print('=== EXEMPLE:', p.get('title', '')[:60], '===')
        if p.get('website_youtube'): print('  YouTube:', p.get('website_youtube'))
        if p.get('website_twitter'): print('  Twitter:', p.get('website_twitter'))
        if p.get('website_instagram'): print('  Instagram:', p.get('website_instagram'))
        if p.get('website_facebook'): print('  Facebook:', p.get('website_facebook'))
        break
PYEOF"
