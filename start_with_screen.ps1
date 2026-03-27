# Start enrichment on all VMs using screen
$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  STARTING ENRICHMENT ON ALL VMs (screen)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Get list of VMs
$vms = @()
$vmList = & $GCLOUD compute instances list --format="csv[no-heading](name,zone,networkInterfaces[0].accessConfigs[0].natIP)" --filter="name~^scraper-vm AND status=RUNNING" | Sort-Object
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
$totalVMs = $vms.Count
Write-Host "Found $totalVMs VMs" -ForegroundColor Green

# Install screen and start on each VM
foreach ($vm in $vms) {
    $ip = $vm.IP
    $vmNum = $vm.Num
    $name = $vm.Name

    Write-Host "VM $vmNum ($name): " -NoNewline

    # Install screen if needed, kill existing, create new session
    $cmd = "sudo apt-get install -y -qq screen > /dev/null 2>&1; screen -S enrichment -X quit 2>/dev/null; cd ~ && screen -dmS enrichment bash -c 'python3 production_enrichment_vm.py $vmNum $totalVMs > enrichment_log.txt 2>&1'"

    $null = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 -i $SSH_KEY testuser@$ip $cmd 2>&1

    # Verify it started
    $check = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i $SSH_KEY testuser@$ip 'screen -ls | grep enrichment' 2>&1
    if ($check -match "enrichment") {
        Write-Host "Started!" -ForegroundColor Green
    } else {
        Write-Host "CHECK" -ForegroundColor Yellow
    }

    Start-Sleep -Milliseconds 300
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  STARTUP COMPLETE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Check progress with: .\check_progress.ps1" -ForegroundColor Yellow
