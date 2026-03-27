# Check progress on all VMs
$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ENRICHMENT PROGRESS" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
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

# Sort by VM number
$vms = $vms | Sort-Object { $_.Num }

$totalPodcasts = 0
$processedPodcasts = 0
$completedVMs = 0

foreach ($vm in $vms) {
    $ip = $vm.IP
    $vmNum = $vm.Num
    $name = $vm.Name

    # Get progress from progress file
    $progress = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i $SSH_KEY testuser@$ip 'cat progress_vm.json 2>/dev/null || echo "{}"' 2>$null

    try {
        $data = $progress | ConvertFrom-Json
        $status = $data.status
        $processed = $data.processed
        $total = $data.total
        $pct = $data.percentage

        if ($status -eq "completed") {
            Write-Host "  VM $($vmNum.ToString().PadLeft(2)): " -NoNewline
            Write-Host "COMPLETED" -ForegroundColor Green -NoNewline
            Write-Host " - $processed/$total"
            $completedVMs++
            $processedPodcasts += $processed
            $totalPodcasts += $total
        } elseif ($status) {
            Write-Host "  VM $($vmNum.ToString().PadLeft(2)): " -NoNewline
            Write-Host "$status" -ForegroundColor Yellow -NoNewline
            Write-Host " - $processed/$total ($pct%)"
            $processedPodcasts += $processed
            $totalPodcasts += $total
        } else {
            Write-Host "  VM $($vmNum.ToString().PadLeft(2)): " -NoNewline
            Write-Host "NOT STARTED" -ForegroundColor Red
        }
    } catch {
        Write-Host "  VM $($vmNum.ToString().PadLeft(2)): " -NoNewline
        Write-Host "NO DATA" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Completed VMs: $completedVMs / $($vms.Count)"
if ($totalPodcasts -gt 0) {
    $overallPct = [math]::Round($processedPodcasts / $totalPodcasts * 100, 1)
    Write-Host "  Overall Progress: $processedPodcasts / $totalPodcasts ($overallPct%)"
}
