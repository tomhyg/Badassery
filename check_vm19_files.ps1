$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

$ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-19"

Write-Host "VM 19 IP: $ip"
Write-Host ""

ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "ls -la *.json 2>/dev/null; echo ''; cat progress_vm.json 2>/dev/null"
