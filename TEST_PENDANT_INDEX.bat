@echo off
echo ================================================================================
echo    TEST PENDANT CREATION INDEX - Validation Rapide
echo ================================================================================
echo.
echo Ce script temporaire fonctionne SANS index composite.
echo.
echo Il va:
echo   1. Tester la connexion Gemini API
echo   2. Fetcher 10 podcasts (requete simple)
echo   3. Afficher un sample
echo   4. Verifier le status de l'index
echo.
echo Utilise ce script pendant que l'index Firestore se construit (5-10 min).
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

node scripts/parallel_scoring_no_index.js

echo.
echo ================================================================================
pause
