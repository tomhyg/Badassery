$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

$vms = @(4, 9, 11, 15)

foreach ($vm in $vms) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "=== VM $vm ($ip) ==="
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY testuser@$ip "screen -ls; echo ''; tail -5 enrichment_log.txt 2>/dev/null"
    Write-Host ""
}
