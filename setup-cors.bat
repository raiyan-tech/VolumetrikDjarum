@echo off
echo ===================================
echo Setting up CORS for Cloud Storage
echo ===================================
echo.

REM Login to Google Cloud (only needed first time)
echo Step 1: Login to Google Cloud...
gcloud auth login

echo.
echo Step 2: Set project...
gcloud config set project spectralysium-volumetric-demo

echo.
echo Step 3: Apply CORS configuration...
gsutil cors set cors.json gs://spectralysium-4ds-files

echo.
echo ===================================
echo CORS setup complete!
echo ===================================
pause
