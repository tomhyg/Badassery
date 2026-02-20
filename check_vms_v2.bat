@echo off
echo ============================================================
echo STATUS DES 20 VMs - %date% %time%
echo ============================================================
echo.

echo === VMs us-central1-a (1-10) ===
for %%i in (1 2 3 4 5 6 7 8 9 10) do (
    call gcloud compute ssh scraper-vm-%%i --zone=us-central1-a --command="echo VM%%i: && tail -2 /home/enrichment.log 2>/dev/null || cat /var/log/startup.log 2>/dev/null | tail -3 || echo 'Demarrage...'" 2>nul
    echo.
)

echo === VMs europe-west1-b (11-15, 17-19) ===
for %%i in (11 12 13 14 15 17 18 19) do (
    call gcloud compute ssh scraper-vm-%%i --zone=europe-west1-b --command="echo VM%%i: && tail -2 /home/enrichment.log 2>/dev/null || cat /var/log/startup.log 2>/dev/null | tail -3 || echo 'Demarrage...'" 2>nul
    echo.
)

echo === VMs us-east1-b (16, 20) ===
for %%i in (16 20) do (
    call gcloud compute ssh scraper-vm-%%i --zone=us-east1-b --command="echo VM%%i: && tail -2 /home/enrichment.log 2>/dev/null || cat /var/log/startup.log 2>/dev/null | tail -3 || echo 'Demarrage...'" 2>nul
    echo.
)

echo ============================================================
pause
