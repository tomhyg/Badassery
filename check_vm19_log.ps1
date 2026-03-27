$SSH_KEY = "C:\Users\admin\.ssh\vm_test_key"
$ip = "34.30.71.93"

ssh -o StrictHostKeyChecking=no -i $SSH_KEY testuser@$ip "tail -150 enrichment_log.txt"
