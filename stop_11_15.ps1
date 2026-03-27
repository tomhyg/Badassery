$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host "=== ARRET VM 11 et 15 ==="
foreach ($vm in @(11, 15)) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "Stopping VM $vm..."
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "pkill -9 -f 'python3 production'; screen -S enrichment -X quit" 2>$null
    Write-Host "VM $vm stopped"
}

Write-Host ""
Write-Host "=== Verification ==="
foreach ($vm in @(11, 15)) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "VM $vm :"
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "ps aux | grep 'python3 production' | grep -v grep || echo 'Process stopped'"
}
