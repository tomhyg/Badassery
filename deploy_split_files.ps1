# Deploy split files to VMs
$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$SCRIPT_PATH = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\production_enrichment_vm.py"
$BASE_DIR = "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DEPLOYING SPLIT FILES TO VMs" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Get list of VMs
$vms = @()
$vmList = & $GCLOUD compute instances list --format="csv[no-heading](name,zone,networkInterfaces[0].accessConfigs[0].natIP)" --filter="name~^scraper-vm AND status=RUNNING"
foreach ($line in $vmList) {
    $parts = $line -split ","
    if ($parts.Count -ge 3) {
        $vmNum = [int]($parts[0] -replace "scraper-vm-", "")
        $vms += @{
            Name = $parts[0]
            IP = $parts[2]
            Num = $vmNum
        }
    }
}

$vms = $vms | Sort-Object { $_.Num }
Write-Host "Found $($vms.Count) VMs" -ForegroundColor Green

# Deploy to each VM
foreach ($vm in $vms) {
    $ip = $vm.IP
    $vmNum = $vm.Num
    $name = $vm.Name
    $podcastsFile = "$BASE_DIR\podcasts_vm$vmNum.json"

    Write-Host "VM $vmNum ($name): " -NoNewline

    # Copy updated script
    $null = scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY $SCRIPT_PATH "testuser@${ip}:~/production_enrichment_vm.py" 2>&1

    # Copy VM-specific podcasts file
    $null = scp -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i $SSH_KEY $podcastsFile "testuser@${ip}:~/podcasts_vm$vmNum.json" 2>&1

    Write-Host "Done" -ForegroundColor Green
}

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
