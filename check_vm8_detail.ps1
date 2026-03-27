$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$ip = "35.198.81.232"

Write-Host "=== Progress file ==="
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "cat progress_vm.json 2>/dev/null || echo 'No progress file'"

Write-Host ""
Write-Host "=== Last log lines ==="
ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "tail -30 enrichment_log.txt 2>/dev/null || echo 'No log'"
