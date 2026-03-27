$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

foreach ($vm in @(10, 14, 16)) {
    Write-Host "=== VM $vm ==="
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "cat progress_vm.json 2>/dev/null; echo ''; tail -5 enrichment_log.txt 2>/dev/null"
    Write-Host ""
}
