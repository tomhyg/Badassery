@echo off
echo ================================================================================
echo    VALIDATION DE LA CONFIGURATION - Parallel Scoring V2.0
echo ================================================================================
echo.
echo Ce script va verifier:
echo   - Version de Node.js
echo   - Limite de memoire
echo   - Dependances npm
echo   - Configuration Firebase
echo   - Connexion Firestore
echo   - Donnees podcasts disponibles
echo   - Cle API Gemini
echo   - Test de connexion Gemini
echo   - Fichier checkpoint existant
echo.
echo Cette verification prend ~10-15 secondes.
echo.
echo ================================================================================
echo.

cd /d "C:\Users\admin\OneDrive\Bureau\Dossier danielle"

node scripts/validate_setup.js

echo.
echo ================================================================================
echo.

pause
