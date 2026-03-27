$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host "=== ARRET VM 4 et 9 ==="
foreach ($vm in @(4, 9)) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "Stopping VM $vm..."
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "pkill -f python3; screen -S enrichment -X quit" 2>$null
    Write-Host "VM $vm stopped"
}

Write-Host ""
Write-Host "=== CHECK VM 11 et 15 (crashed?) ==="
foreach ($vm in @(11, 15)) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "VM $vm :"
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "screen -ls 2>/dev/null; ps aux | grep python3 | grep -v grep"
}

Write-Host ""
Write-Host "=== CHECK VM 10, 14, 16 (en cours) ==="
foreach ($vm in @(10, 14, 16)) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "VM $vm :"
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "cat progress_vm.json 2>/dev/null"
    Write-Host ""
}
