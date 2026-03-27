$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host "=== VM 11 ==="
$ip11 = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-11"
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip11 "cat progress_vm.json; echo ''; tail -10 enrichment_log.txt"

Write-Host ""
Write-Host "=== VM 15 ==="
$ip15 = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-15"
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip15 "cat progress_vm.json; echo ''; tail -10 enrichment_log.txt"
