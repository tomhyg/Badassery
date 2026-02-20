$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$OUTPUT_DIR = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\enriched_results"

# Create output directory
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null

# VMs terminées (16)
$completedVMs = @(1, 2, 3, 5, 6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20)

Write-Host "=== TELECHARGEMENT DES FICHIERS ENRICHIS ==="
Write-Host ""

foreach ($vm in $completedVMs) {
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"
    Write-Host "Downloading VM $vm ($ip)..."
    scp -o StrictHostKeyChecking=no -i $SSH_KEY "testuser@${ip}:~/enriched_vm${vm}.json" "$OUTPUT_DIR\enriched_vm${vm}.json"

    if (Test-Path "$OUTPUT_DIR\enriched_vm${vm}.json") {
        $size = (Get-Item "$OUTPUT_DIR\enriched_vm${vm}.json").Length / 1MB
        Write-Host "  OK - $([math]::Round($size, 2)) MB"
    } else {
        Write-Host "  FAILED!"
    }
}

Write-Host ""
Write-Host "=== TELECHARGEMENT TERMINE ==="
Write-Host "Fichiers dans: $OUTPUT_DIR"
