# Start enrichment on all 20 VMs
$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  STARTING ENRICHMENT ON ALL VMs" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Get list of VMs
$vms = @()
$vmList = & $GCLOUD compute instances list --format="csv[no-heading](name,zone,networkInterfaces[0].accessConfigs[0].natIP)" --filter="name~^scraper-vm AND status=RUNNING" | Sort-Object
foreach ($line in $vmList) {
    $parts = $line -split ","
    if ($parts.Count -ge 3) {
        # Extract VM number from name (scraper-vm-1 -> 1)
        $vmNum = [int]($parts[0] -replace "scraper-vm-", "")
        $vms += @{
            Name = $parts[0]
            Zone = $parts[1]
            IP = $parts[2]
            Num = $vmNum
        }
    }
}

# Sort by VM number
$vms = $vms | Sort-Object { $_.Num }

Write-Host "Found $($vms.Count) VMs" -ForegroundColor Green
Write-Host ""

# Start enrichment on each VM (using nohup to run in background)
$totalVMs = $vms.Count
foreach ($vm in $vms) {
    $ip = $vm.IP
    $vmNum = $vm.Num
    $name = $vm.Name

    Write-Host "Starting VM $vmNum ($name)..." -NoNewline

    # Kill any existing process and start new one
    $cmd = "cd ~ && pkill -f production_enrichment 2>/dev/null; nohup python3 production_enrichment_vm.py $vmNum $totalVMs > enrichment_log.txt 2>&1 &"
    $null = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY testuser@$ip $cmd 2>&1

    Write-Host " Started!" -ForegroundColor Green
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ALL VMs STARTED!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Monitor progress with: .\check_progress.ps1" -ForegroundColor Yellow
