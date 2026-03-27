@echo off
echo ================================================================================
echo    DEBUG - Test sur UN SEUL Podcast
echo ================================================================================
echo.
echo Ce script va:
echo   1. Fetcher 1 podcast
echo   2. Envoyer a Gemini
echo   3. Afficher la reponse complete
echo   4. Montrer l'erreur EXACTE si probleme
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

node scripts/debug_single_podcast.js

echo.
pause
