$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host "=== LANCEMENT ENRICHMENT V2 SUR 20 VMs ==="
Write-Host ""

for ($vm = 1; $vm -le 20; $vm++) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "Starting VM $vm ($ip)..."

    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "screen -dmS enrichment bash -c 'python3 production_enrichment_vm.py $vm 20 > enrichment_log.txt 2>&1'"
}

Write-Host ""
Write-Host "=== LANCEMENT TERMINE ==="
Write-Host ""
Write-Host "Pour verifier: .\check_progress.ps1"
