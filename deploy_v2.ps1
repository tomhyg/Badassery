$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$SCRIPT = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\production_enrichment_v2.py"
$SPLIT_DIR = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\remaining_split"

Write-Host "=== DEPLOIEMENT V2 SUR 20 VMs ==="
Write-Host ""

for ($vm = 1; $vm -le 20; $vm++) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "=== VM $vm ($ip) ==="

    # Stop any existing process
    Write-Host "  Stopping old processes..."
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "pkill -f python3 2>/dev/null; screen -S enrichment -X quit 2>/dev/null" 2>$null

    # Clean old files
    Write-Host "  Cleaning old files..."
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "rm -f enriched_vm*.json checkpoint_vm*.json progress_vm.json enrichment_log.txt 2>/dev/null"

    # Upload new script
    Write-Host "  Uploading script V2..."
    scp -o StrictHostKeyChecking=no -i $SSH_KEY $SCRIPT "testuser@${ip}:~/production_enrichment_vm.py"

    # Upload podcasts file
    $podcastFile = "$SPLIT_DIR\podcasts_vm$vm.json"
    Write-Host "  Uploading podcasts ($vm)..."
    scp -o StrictHostKeyChecking=no -i $SSH_KEY $podcastFile "testuser@${ip}:~/podcasts_vm$vm.json"

    Write-Host "  Done!"
    Write-Host ""
}

Write-Host "=== DEPLOIEMENT TERMINE ==="
Write-Host ""
Write-Host "Pour lancer: .\start_v2.ps1"
