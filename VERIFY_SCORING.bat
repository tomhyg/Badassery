@echo off
echo ================================================================================
echo    VERIFICATION - Afficher quelques podcasts scores
echo ================================================================================
echo.
echo Ce script va afficher:
echo   - Top 10 podcasts par Badassery Score
echo   - Distribution par categorie
echo   - Exemples de Top 1%% et Top 5%%
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

node scripts/verify_scoring.js

echo.
pause
