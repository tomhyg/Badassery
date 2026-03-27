@echo off
echo ================================================
echo  CATEGORISATION EN BOUCLE (10K par batch)
echo ================================================
echo.

:LOOP
echo Running batch...
node scripts/parallel_scoring_v2.js --limit=10000

if errorlevel 1 (
    echo Error occurred, stopping...
    pause
    exit /b 1
)

echo.
echo Batch complete! Waiting 5 seconds before next batch...
timeout /t 5

goto LOOP
