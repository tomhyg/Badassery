$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

$ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-8"

Write-Host "VM 8 IP: $ip"
Write-Host ""
Write-Host "=== Screen sessions ==="
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "screen -ls"
Write-Host ""
Write-Host "=== Last log lines ==="
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "tail -20 enrichment_log.txt 2>/dev/null || echo 'No log file'"
