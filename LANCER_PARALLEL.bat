@echo off
echo ================================================================================
echo    PARALLEL PODCAST SCORING V2.0 - Quick Launch
echo ================================================================================
echo.
echo Ce script utilise le traitement PARALLELE pour scorer 192K+ podcasts rapidement
echo.
echo DATABASE STATUS:
echo   - Total: 192,157 podcasts
echo   - Deja categorises: 38,423 (20%%)
echo   - A categoriser: 153,734 podcasts (80%%)
echo.
echo CONFIGURATIONS DISPONIBLES:
echo   --config=conservative  : 10 parallel (test)
echo   --config=safe          : 20 parallel (recommande)
echo   --config=aggressive    : 20 parallel (apres test)
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

:menu
echo.
echo Choisissez une option:
echo.
echo   1. TEST avec 1000 podcasts (safe mode)
echo   2. DRY-RUN complet (NO writes)
echo   3. WAVE 1: 30K podcasts (offset=0)
echo   4. WAVE 2: 30K podcasts (offset=30000)
echo   5. WAVE 3: 30K podcasts (offset=60000)
echo   6. WAVE 4: 30K podcasts (offset=90000)
echo   7. WAVE 5: 30K podcasts (offset=120000)
echo   8. WAVE 6: 30K podcasts (offset=150000)
echo   9. WAVE 7: Reste 42K podcasts (offset=180000)
echo   10. TOUT TRAITER D'UN COUP (200K limit)
echo   11. Mode AGRESSIF complet (50 parallel)
echo   12. Commande personnalisee
echo   13. Quitter
echo.

set /p choice="Votre choix (1-13): "

if "%choice%"=="1" (
    echo.
    echo Lancement TEST: 1000 podcasts en mode safe...
    node scripts/parallel_scoring_v2.js --limit=1000
    goto end
)

if "%choice%"=="2" (
    echo.
    echo Lancement DRY-RUN: Aucune ecriture Firestore...
    node scripts/parallel_scoring_v2.js --dry-run
    goto end
)

if "%choice%"=="3" (
    echo.
    echo Lancement WAVE 1: Podcasts 0-30000...
    node scripts/parallel_scoring_v2.js --offset=0 --limit=30000
    goto end
)

if "%choice%"=="4" (
    echo.
    echo Lancement WAVE 2: Podcasts 30000-60000...
    node scripts/parallel_scoring_v2.js --offset=30000 --limit=30000
    goto end
)

if "%choice%"=="5" (
    echo.
    echo Lancement WAVE 3: Podcasts 60000-90000...
    node scripts/parallel_scoring_v2.js --offset=60000 --limit=30000
    goto end
)

if "%choice%"=="6" (
    echo.
    echo Lancement WAVE 4: Podcasts 90000-120000...
    node scripts/parallel_scoring_v2.js --offset=90000 --limit=30000
    goto end
)

if "%choice%"=="7" (
    echo.
    echo Lancement WAVE 5: Podcasts 120000-150000...
    node scripts/parallel_scoring_v2.js --offset=120000 --limit=30000
    goto end
)

if "%choice%"=="8" (
    echo.
    echo Lancement WAVE 6: Podcasts 150000-180000...
    node scripts/parallel_scoring_v2.js --offset=150000 --limit=30000
    goto end
)

if "%choice%"=="9" (
    echo.
    echo Lancement WAVE 7: Podcasts 180000-192157 (FINAL)...
    node scripts/parallel_scoring_v2.js --offset=180000 --limit=15000
    goto end
)

if "%choice%"=="10" (
    echo.
    echo Lancement COMPLET: Tous les podcasts non-categorises...
    echo ATTENTION: Cela peut prendre plusieurs heures!
    pause
    node scripts/parallel_scoring_v2.js --limit=200000
    goto end
)

if "%choice%"=="11" (
    echo.
    echo Lancement MODE AGRESSIF: 50 parallel requests...
    node scripts/parallel_scoring_v2.js --config=aggressive --limit=200000
    goto end
)

if "%choice%"=="12" (
    echo.
    set /p custom="Entrez votre commande: node scripts/parallel_scoring_v2.js "
    node scripts/parallel_scoring_v2.js %custom%
    goto end
)

if "%choice%"=="13" (
    exit
)

echo.
echo Choix invalide. Veuillez reessayer.
goto menu

:end
echo.
echo ================================================================================
echo Script termine!
echo ================================================================================
pause
