$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$SCRIPT = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\yt_stats.py"

$ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-19"

Write-Host "Uploading and running stats script on VM 19..."
Write-Host ""

# Upload script
scp -o StrictHostKeyChecking=no -i $SSH_KEY $SCRIPT "testuser@${ip}:~/yt_stats.py"

# Run it
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "python3 yt_stats.py"
