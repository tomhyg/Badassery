$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$GCLOUD = "C:\Users\admin\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

foreach ($vm in @(4, 9, 11, 15)) {
    Write-Host "=== VM $vm - CRASH ANALYSIS ==="
    $ip = & $GCLOUD compute instances list --format="csv[no-heading](networkInterfaces[0].accessConfigs[0].natIP)" --filter="name=scraper-vm-$vm"

    Write-Host "-- Dernières lignes du log --"
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "tail -20 enrichment_log.txt 2>/dev/null | grep -E '(Error|ERROR|Killed|Memory|OOM|Exception|Traceback)' || tail -10 enrichment_log.txt"

    Write-Host ""
    Write-Host "-- Memoire actuelle --"
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "free -h"

    Write-Host ""
    Write-Host "-- Kernel messages (OOM killer?) --"
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "dmesg | grep -i 'killed process' | tail -3"

    Write-Host ""
    Write-Host "=========================================="
    Write-Host ""
}
