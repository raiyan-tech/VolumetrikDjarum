@echo off
echo ===================================
echo Setting up CORS for Cloud Storage
echo Bucket: spectralysium-volumetrik-4ds-files
echo ===================================
echo.

echo Applying CORS configuration...
gsutil cors set cors.json gs://spectralysium-volumetrik-4ds-files

echo.
echo ===================================
echo CORS setup complete!
echo ===================================
pause
