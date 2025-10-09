# ⚡ Quick Start - Deploy in 30 Minutes

## 1️⃣ Setup (5 min)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Prepare files
setup-deployment.bat
```

## 2️⃣ Create Firebase Project (5 min)

1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
2. Click "Add Project" → Name: `volumetrik-demo`
3. Disable Analytics → Create

```bash
# Initialize hosting
firebase init hosting
# - Select existing project: volumetrik-demo
# - Public directory: public
# - Single-page app: Yes
# - Overwrite index.html: No
```

## 3️⃣ Create Cloud Storage Bucket (10 min)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Select `volumetrik-demo` project
3. Cloud Storage → Create Bucket
   - Name: `volumetrik-4ds-files`
   - Location: `asia-southeast1` (or nearest)
   - Standard storage
4. Upload 4DS files from `4DS/` folder
5. Permissions → Add → Principal: `allUsers` → Role: `Storage Object Viewer`

```bash
# Enable CORS
gsutil cors set cors.json gs://volumetrik-4ds-files
```

## 4️⃣ Update URLs (5 min)

Edit `public/app.js` - replace all video URLs:

```javascript
// Change from:
desktop: './4DS/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',

// To:
desktop: 'https://storage.googleapis.com/volumetrik-4ds-files/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
```

Do this for all 5 videos in the `VIDEO_LIBRARY` object.

## 5️⃣ Deploy (2 min)

```bash
firebase deploy
```

**Done! 🎉**

Your URL: `https://volumetrik-demo.web.app`

---

## 📱 Test AR on Android

1. Open URL on Android Chrome
2. Tap "View in AR" button
3. Point camera at floor
4. Tap to place volumetric video
5. Walk around it!

---

## 🔄 Update Later

```bash
# Edit files
copy index.html public\
copy app.js public\

# Deploy
firebase deploy
```

---

Need help? See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed guide.
