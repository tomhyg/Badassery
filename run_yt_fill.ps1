$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$SCRIPT = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\yt_fill_stats.py"

$ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-19"

scp -o StrictHostKeyChecking=no -i $SSH_KEY $SCRIPT "testuser@${ip}:~/yt_fill_stats.py"
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "python3 yt_fill_stats.py"
