$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

$vms = @(4, 9)

foreach ($vm in $vms) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "=== Restarting VM $vm ($ip) ==="
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY testuser@$ip "screen -dmS enrichment bash -c 'python3 production_enrichment_vm.py $vm 20 > enrichment_log.txt 2>&1'"
    Write-Host "Started!"
    Write-Host ""
}

Write-Host "Waiting 10 seconds..."
Start-Sleep -Seconds 10

foreach ($vm in $vms) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "=== VM $vm status ==="
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY testuser@$ip "screen -ls; tail -3 enrichment_log.txt 2>/dev/null"
    Write-Host ""
}
