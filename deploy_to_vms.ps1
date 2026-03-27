# Deploy to all 20 VMs
$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$FORMATTED_KEY = "C:\Users\admin\.ssh\vm_test_key_formatted.txt"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$SCRIPT_PATH = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\production_enrichment_vm.py"
$PODCASTS_PATH = "C:\Users\admin\OneDrive\Bureau\Dossier danielle\podcasts_to_enrich.json"

# Get list of VMs
Write-Host "Getting VM list..." -ForegroundColor Cyan
$vms = @()
$vmList = & $GCLOUD compute instances list --format="csv[no-heading](name,zone,networkInterfaces[0].accessConfigs[0].natIP)" --filter="name~^scraper-vm AND status=RUNNING"
foreach ($line in $vmList) {
    $parts = $line -split ","
    if ($parts.Count -ge 3) {
        $vms += @{
            Name = $parts[0]
            Zone = $parts[1]
            IP = $parts[2]
        }
    }
}

Write-Host "Found $($vms.Count) VMs" -ForegroundColor Green

# Add SSH key to each VM
Write-Host "`nAdding SSH keys to VMs..." -ForegroundColor Cyan
foreach ($vm in $vms) {
    Write-Host "  Adding key to $($vm.Name)..." -NoNewline
    $null = & $GCLOUD compute instances add-metadata $vm.Name --zone=$($vm.Zone) --metadata-from-file=ssh-keys=$FORMATTED_KEY 2>&1
    Write-Host " Done" -ForegroundColor Green
}

# Wait for keys to propagate
Write-Host "`nWaiting 30 seconds for SSH keys to propagate..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Deploy to each VM
Write-Host "`nDeploying files to VMs..." -ForegroundColor Cyan
foreach ($vm in $vms) {
    $ip = $vm.IP
    Write-Host "  Deploying to $($vm.Name) ($ip)..." -NoNewline

    # Copy script
    $null = scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY $SCRIPT_PATH "testuser@${ip}:~/production_enrichment_vm.py" 2>&1

    # Copy podcasts file
    $null = scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY $PODCASTS_PATH "testuser@${ip}:~/podcasts_to_enrich.json" 2>&1

    Write-Host " Done" -ForegroundColor Green
}

# Install dependencies on each VM (in parallel using jobs)
Write-Host "`nInstalling dependencies on VMs (parallel)..." -ForegroundColor Cyan
$jobs = @()
foreach ($vm in $vms) {
    $ip = $vm.IP
    $name = $vm.Name
    $job = Start-Job -ScriptBlock {
        param($ip, $key, $name)
        $result = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -i $key testuser@$ip 'sudo apt-get update -qq && sudo apt-get install -y -qq python3-pip > /dev/null 2>&1; pip3 install -q requests yt-dlp 2>/dev/null; echo "OK"' 2>&1
        return "$name : $result"
    } -ArgumentList $ip, $SSH_KEY, $name
    $jobs += $job
}

# Wait for all jobs
$null = Wait-Job -Job $jobs
foreach ($job in $jobs) {
    $result = Receive-Job -Job $job
    Write-Host "  $result" -ForegroundColor Gray
}
Remove-Job -Job $jobs

Write-Host "`nDeployment complete!" -ForegroundColor Green
Write-Host "Run start_enrichment.ps1 to start processing" -ForegroundColor Yellow
