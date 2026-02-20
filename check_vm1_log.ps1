$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

$ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-1"

Write-Host "=== VM 1 ($ip) ==="
Write-Host "-- Screen sessions --"
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "screen -ls"
Write-Host ""
Write-Host "-- Log --"
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "cat enrichment_log.txt 2>/dev/null || echo 'No log'"
Write-Host ""
Write-Host "-- Files --"
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "ls -la *.json *.py 2>/dev/null"
