@echo off
echo ================================================================================
echo    FIRESTORE PODCASTS VERIFICATION
echo ================================================================================
echo.
echo Ce script verifie:
echo   1. Structure des documents Firestore
echo   2. Validite des iTunes IDs
echo   3. Correspondance Document ID / iTunes ID
echo   4. Exemples de podcasts qui echouent
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

node scripts/verify_firestore_podcasts.js

echo.
echo ================================================================================
echo Verification terminee!
echo ================================================================================
pause
