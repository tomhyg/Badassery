$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$ip = "34.30.71.93"

Write-Host "=== VM 19 LOG (YouTube section) ==="
$log = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY testuser@$ip "tail -50 enrichment_log.txt"
Write-Host $log
