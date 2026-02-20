@echo off
echo ============================================================
echo DEPLOIEMENT SUR 20 VMs - 38k PODCASTS
echo ============================================================
echo.

set SCRIPT_DIR=C:\Users\admin\OneDrive\Bureau\Dossier danielle
set SPLIT_DIR=%SCRIPT_DIR%\remaining_split

REM VMs en europe-west3-a (1,3,4,5,6,8,9,10)
for %%i in (1 3 4 5 6 8 9 10) do (
    echo.
    echo === Deploiement VM %%i [europe-west3-a] ===
    echo Copie du script...
    call gcloud compute scp "%SCRIPT_DIR%\production_enrichment_v2.py" scraper-vm-%%i:~/ --zone=europe-west3-a
    echo Copie des podcasts...
    call gcloud compute scp "%SPLIT_DIR%\podcasts_vm%%i.json" scraper-vm-%%i:~/ --zone=europe-west3-a
    echo Installation dependances et lancement...
    call gcloud compute ssh scraper-vm-%%i --zone=europe-west3-a --command="sudo apt update -qq && sudo apt install -y -qq python3-pip && pip3 install -q requests beautifulsoup4 yt-dlp && nohup python3 production_enrichment_v2.py %%i 20 > enrichment.log 2>&1 &"
    echo VM %%i lancee!
)

REM VMs en europe-west1-b (11,12,13,14,15,16,17,18)
for %%i in (11 12 13 14 15 16 17 18) do (
    echo.
    echo === Deploiement VM %%i [europe-west1-b] ===
    echo Copie du script...
    call gcloud compute scp "%SCRIPT_DIR%\production_enrichment_v2.py" scraper-vm-%%i:~/ --zone=europe-west1-b
    echo Copie des podcasts...
    call gcloud compute scp "%SPLIT_DIR%\podcasts_vm%%i.json" scraper-vm-%%i:~/ --zone=europe-west1-b
    echo Installation dependances et lancement...
    call gcloud compute ssh scraper-vm-%%i --zone=europe-west1-b --command="sudo apt update -qq && sudo apt install -y -qq python3-pip && pip3 install -q requests beautifulsoup4 yt-dlp && nohup python3 production_enrichment_v2.py %%i 20 > enrichment.log 2>&1 &"
    echo VM %%i lancee!
)

REM VMs en us-central1-a (2,7,19,20)
for %%i in (2 7 19 20) do (
    echo.
    echo === Deploiement VM %%i [us-central1-a] ===
    echo Copie du script...
    call gcloud compute scp "%SCRIPT_DIR%\production_enrichment_v2.py" scraper-vm-%%i:~/ --zone=us-central1-a
    echo Copie des podcasts...
    call gcloud compute scp "%SPLIT_DIR%\podcasts_vm%%i.json" scraper-vm-%%i:~/ --zone=us-central1-a
    echo Installation dependances et lancement...
    call gcloud compute ssh scraper-vm-%%i --zone=us-central1-a --command="sudo apt update -qq && sudo apt install -y -qq python3-pip && pip3 install -q requests beautifulsoup4 yt-dlp && nohup python3 production_enrichment_v2.py %%i 20 > enrichment.log 2>&1 &"
    echo VM %%i lancee!
)

echo.
echo ============================================================
echo DEPLOIEMENT TERMINE!
echo ============================================================
echo Utilisez check_all_vms.bat pour suivre la progression
pause
