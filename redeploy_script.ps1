$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$SCRIPT = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\production_enrichment_v2.py"

Write-Host "=== REDEPLOIEMENT SCRIPT V2 CORRIGE ==="
Write-Host ""

for ($vm = 1; $vm -le 20; $vm++) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "VM $vm ($ip)..."

    # Stop process
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "pkill -f python3 2>/dev/null; screen -S enrichment -X quit 2>/dev/null" 2>$null

    # Clean checkpoint (to restart fresh)
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "rm -f checkpoint_vm*.json progress_vm.json enrichment_log.txt 2>/dev/null"

    # Upload corrected script
    scp -o StrictHostKeyChecking=no -i $SSH_KEY $SCRIPT "testuser@${ip}:~/production_enrichment_vm.py"
}

Write-Host ""
Write-Host "=== REDEPLOIEMENT TERMINE ==="
