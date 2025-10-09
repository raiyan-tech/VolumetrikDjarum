@echo off
echo =========================================
echo Volumetrik 4DS Player - Deployment Setup
echo =========================================
echo.

REM Create public directory
echo Creating public directory structure...
if not exist "public" mkdir public
if not exist "public\lib" mkdir public\lib
if not exist "public\web4dv" mkdir public\web4dv
if not exist "public\4ds" mkdir public\4ds

REM Copy HTML and JS
echo Copying webapp files...
copy index.html public\index.html
copy app.js public\app.js

REM Copy THREE.js libraries
echo Copying THREE.js libraries...
copy "DOCS\Plugin4DS_WEB4DV_v3.1.0\webplayer\threejs\three.js" public\lib\three.min.js
copy "DOCS\Plugin4DS_WEB4DV_v3.1.0\webplayer\threejs\WebGL.js" public\lib\WebGL.js
copy "DOCS\Plugin4DS_WEB4DV_v3.1.0\webplayer\threejs\OrbitControls.js" public\lib\OrbitControls.js
copy "DOCS\Plugin4DS_WEB4DV_v3.1.0\webplayer\threejs\ARButton.js" public\lib\ARButton.js

REM Copy WEB4DV plugin
echo Copying WEB4DV plugin...
xcopy "DOCS\Plugin4DS_WEB4DV_v3.1.0\webplayer\web4dv\*" public\web4dv\ /E /Y

echo.
echo =========================================
echo Setup complete!
echo.
echo NEXT STEPS:
echo 1. Install Firebase CLI: npm install -g firebase-tools
echo 2. Login to Firebase: firebase login
echo 3. Create Firebase project: firebase init hosting
echo 4. Deploy webapp: firebase deploy
echo.
echo For 4DS files, use Google Cloud Storage (see DEPLOYMENT.md)
echo =========================================
pause
