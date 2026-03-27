@echo off
echo ================================================================================
echo    UPLOAD PODCASTS TO FIRESTORE
echo ================================================================================
echo.
echo Ce script va uploader tous les podcasts enrichis dans la collection "podcasts"
echo.
echo Duree estimee: 15-25 minutes pour ~150,000 podcasts
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"
node scripts/upload_podcasts_to_firestore.js

echo.
echo ================================================================================
echo Script termine!
echo ================================================================================
pause
