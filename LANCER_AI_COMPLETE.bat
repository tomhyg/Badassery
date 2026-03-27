@echo off
echo ================================================================================
echo    AI PODCAST CATEGORIZATION + SCORING + PERCENTILES (COMPLETE)
echo ================================================================================
echo.
echo Ce script execute 5 PHASES:
echo   PHASE 1-2: Categorisation Gemini + Scoring individuel
echo              - 31 niches Badassery
echo              - Engagement, Audience, Quality, Monetization
echo.
echo   PHASE 3:   Calcul percentiles par categorie
echo              - Top 1%%, Top 5%%, Top 10%%, Top 25%%, Top 50%%, Standard
echo              - Rank dans la categorie
echo.
echo   PHASE 4:   Badassery Score (0-100)
echo              - 40%% Engagement + 30%% Audience + 30%% Percentile
echo.
echo   PHASE 5:   Update Firestore avec TOUS les champs
echo              - 16 champs AI au total
echo.
echo Configuration:
echo   - 10 podcasts par batch (Gemini)
echo   - Pause de 2 secondes entre batches
echo   - Max 100 podcasts (modifiable dans le script)
echo.
echo CLE API GEMINI: Pre-configuree (meme cle que webapp)
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

node scripts/categorize_and_score_podcasts.js

echo.
echo ================================================================================
echo Script termine!
echo ================================================================================
pause
