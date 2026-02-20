@echo off
echo ========================================
echo OUTREACH EMAIL THREAD MIGRATION
echo ========================================
echo.
echo This script will add email_thread data to existing outreach records
echo based on the "Outreach Date" field.
echo.
echo Press Ctrl+C to cancel, or
pause

cd webapp\badassery

echo.
echo Running migration...
echo.

node scripts/runMigration.js

echo.
echo ========================================
echo Migration completed!
echo ========================================
echo.
pause
