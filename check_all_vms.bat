@echo off
echo ============================================================
echo STATUS DES 20 VMs - %date% %time%
echo ============================================================
echo.

REM VMs en europe-west3-a (1,3,4,5,6,8,9,10)
for %%i in (1 3 4 5 6 8 9 10) do (
    echo === VM %%i ===
    call gcloud compute ssh scraper-vm-%%i --zone=europe-west3-a --command="tail -3 enrichment.log 2>/dev/null || echo 'Pas de log'" 2>nul
    echo.
)

REM VMs en europe-west1-b (11,12,13,14,15,16,17,18)
for %%i in (11 12 13 14 15 16 17 18) do (
    echo === VM %%i ===
    call gcloud compute ssh scraper-vm-%%i --zone=europe-west1-b --command="tail -3 enrichment.log 2>/dev/null || echo 'Pas de log'" 2>nul
    echo.
)

REM VMs en us-central1-a (2,7,19,20)
for %%i in (2 7 19 20) do (
    echo === VM %%i ===
    call gcloud compute ssh scraper-vm-%%i --zone=us-central1-a --command="tail -3 enrichment.log 2>/dev/null || echo 'Pas de log'" 2>nul
    echo.
)

echo ============================================================
echo FIN DU STATUS
echo ============================================================
pause
