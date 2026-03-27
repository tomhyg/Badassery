@echo off
echo ================================================================================
echo    MODE SAFE - 10 Parallel (Evite Rate Limit)
echo ================================================================================
echo.
echo Configuration:
echo   - Gemini parallel: 10 (au lieu de 20)
echo   - Firestore parallel: 50 (au lieu de 100)
echo   - Plus lent mais SANS rate limit
echo.
echo Choisissez:
echo   1. TEST 1000 podcasts
echo   2. WAVE 30K podcasts
echo   3. Commande personnalisee
echo   4. Quitter
echo.

set /p choice="Votre choix (1-4): "

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

if "%choice%"=="1" (
    echo.
    echo Lancement TEST 1000 podcasts en mode SAFE...
    node scripts/parallel_scoring_v2.js --config=conservative --limit=1000
)

if "%choice%"=="2" (
    echo.
    echo Lancement WAVE 30K en mode SAFE...
    node scripts/parallel_scoring_v2.js --config=conservative --limit=30000
)

if "%choice%"=="3" (
    echo.
    set /p custom="Entrez vos parametres: --config=conservative "
    node scripts/parallel_scoring_v2.js --config=conservative %custom%
)

if "%choice%"=="4" (
    exit
)

echo.
echo ================================================================================
pause
