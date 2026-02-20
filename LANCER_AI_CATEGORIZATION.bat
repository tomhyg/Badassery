@echo off
echo ================================================================================
echo    AI PODCAST CATEGORIZATION
echo ================================================================================
echo.
echo Ce script va categoriser les podcasts avec l'IA Gemini
echo.
echo Configuration:
echo - 10 podcasts par batch
echo - Pause de 2 secondes entre batches
echo - Max 100 podcasts (pour test - modifiable dans le script)
echo.
echo IMPORTANT: Assurez-vous que GEMINI_API_KEY est defini
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

REM Check if API key is set
if "%GEMINI_API_KEY%"=="" (
    echo.
    echo ERREUR: GEMINI_API_KEY n'est pas defini!
    echo.
    echo Pour definir la cle API:
    echo   set GEMINI_API_KEY=votre_cle_api_ici
    echo.
    echo Ou editez le fichier scripts/categorize_podcasts_with_ai.js
    echo et remplacez 'YOUR_API_KEY_HERE' par votre cle.
    echo.
    pause
    exit /b 1
)

node scripts/categorize_podcasts_with_ai.js

echo.
echo ================================================================================
echo Script termine!
echo ================================================================================
pause
