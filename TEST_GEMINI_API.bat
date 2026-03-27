@echo off
echo ================================================================================
echo    TEST GEMINI API - Diagnostic
echo ================================================================================
echo.
echo Ce script va tester:
echo   1. Connexion simple Gemini
echo   2. 5 requetes paralleles
echo   3. Detection problemes (rate limit, quota, etc.)
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

node scripts/test_gemini_api.js

echo.
pause
