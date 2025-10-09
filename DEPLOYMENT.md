# 🚀 Volumetrik 4DS Player - Deployment Guide

## Overview
This guide will help you deploy your volumetric video streaming webapp to the web using Firebase Hosting and Google Cloud Storage.

---

## 📋 Prerequisites

- Google Account (you have Google Workspace ✅)
- Node.js installed (v14 or higher)
- Command line access

---

## 🔧 Step 1: Initial Setup (5 minutes)

### 1.1 Install Firebase CLI

```bash
npm install -g firebase-tools
```

### 1.2 Login to Firebase

```bash
firebase login
```

This will open your browser - login with your Google Workspace account.

### 1.3 Prepare Files

Run the setup script:

```bash
setup-deployment.bat
```

This creates the `public` folder with all necessary files.

---

## 🔥 Step 2: Firebase Hosting Setup (10 minutes)

### 2.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project"
3. Name it: `volumetrik-demo` (or your choice)
4. Disable Google Analytics (not needed)
5. Click "Create Project"

### 2.2 Initialize Firebase in Your Project

```bash
firebase init hosting
```

**Answer the prompts:**
- ✅ Use an existing project
- ✅ Select `volumetrik-demo`
- ✅ Public directory: `public`
- ✅ Configure as single-page app: `Yes`
- ✅ Set up automatic builds: `No`
- ❌ Don't overwrite index.html

### 2.3 Update Firebase Config

Edit `.firebaserc` and update with your project name:

```json
{
  "projects": {
    "default": "volumetrik-demo"
  }
}
```

---

## ☁️ Step 3: Google Cloud Storage for 4DS Files (15 minutes)

Your 4DS files are 2-3GB each - too large for Firebase Hosting. Use Cloud Storage instead.

### 3.1 Create Cloud Storage Bucket

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project (`volumetrik-demo`)
3. Navigate to **Cloud Storage** → **Buckets**
4. Click **Create Bucket**

**Bucket Configuration:**
- Name: `volumetrik-4ds-files` (must be globally unique)
- Location: Choose closest to your target audience
  - Asia: `asia-southeast1` (Singapore)
  - US: `us-central1`
- Storage class: `Standard`
- Access control: `Fine-grained`
- Protection: Uncheck all (for demo)

### 3.2 Upload 4DS Files

**Option A: Using Web Interface**

1. Click on your bucket
2. Click **Upload Files**
3. Select your 4DS files from the `4DS/` folder
4. Wait for upload (may take 10-30 minutes)

**Option B: Using gsutil (faster)**

```bash
# Install Google Cloud SDK
# Download from: https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Set project
gcloud config set project volumetrik-demo

# Upload files
gsutil -m cp -r 4DS/* gs://volumetrik-4ds-files/
```

### 3.3 Make Files Public

```bash
# Make bucket publicly readable
gsutil iam ch allUsers:objectViewer gs://volumetrik-4ds-files

# Or use the web interface:
# Bucket → Permissions → Add Principal
# New principals: allUsers
# Role: Storage Object Viewer
```

### 3.4 Enable CORS

Create a file `cors.json`:

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Range", "Accept-Ranges"],
    "maxAgeSeconds": 3600
  }
]
```

Apply CORS:

```bash
gsutil cors set cors.json gs://volumetrik-4ds-files
```

### 3.5 Update App with Cloud Storage URLs

Edit `public/app.js` and update the VIDEO_LIBRARY URLs:

```javascript
const VIDEO_LIBRARY = {
    'dance-nani': {
        name: 'Nani Dance',
        desktop: 'https://storage.googleapis.com/volumetrik-4ds-files/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        mobile: 'https://storage.googleapis.com/volumetrik-4ds-files/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        position: [0, 0, 0]
    },
    // ... update all other videos
};
```

---

## 🌐 Step 4: Deploy (2 minutes)

### 4.1 Deploy to Firebase Hosting

```bash
firebase deploy
```

### 4.2 Get Your URL

After deployment, you'll see:

```
✔ Deploy complete!

Hosting URL: https://volumetrik-demo.web.app
```

**🎉 Your webapp is now live!**

---

## 📱 Step 5: Test on Mobile

### 5.1 Test Regular Viewing

1. Open your URL on your mobile phone: `https://volumetrik-demo.web.app`
2. Select a video from the top menu
3. Use touch to rotate and zoom

### 5.2 Test AR Mode (Android Only)

**Requirements:**
- Android phone with ARCore support
- Chrome browser (latest version)
- HTTPS connection (✅ Firebase provides this)

**Steps:**
1. Open your URL on Android Chrome
2. Tap the "View in AR" button
3. Grant camera permission
4. Point camera at floor
5. Tap to place the volumetric video
6. Walk around it!

**Note:** iOS AR requires USDZ format (not supported by 4DS currently)

---

## 🎯 Step 6: Optimize for Investor Demo

### 6.1 Custom Domain (Optional)

1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow instructions to connect your domain

### 6.2 Analytics (Optional)

Add Google Analytics to track usage:

```bash
firebase init analytics
firebase deploy
```

### 6.3 Performance Tips

**For slower connections:**
- Edit `app.js`, change to cache mode:
  ```javascript
  currentSequence.keepsChunksInCache(true);
  ```

**For faster loading:**
- Pre-load the demo video
- Use CDN (Cloud Storage is already a CDN)
- Test on 4G/5G connection

---

## 🔄 Updating Your Webapp

When you make changes:

```bash
# Make edits to index.html or app.js
# Copy to public folder
copy index.html public\index.html
copy app.js public\app.js

# Deploy
firebase deploy
```

Or use the watch mode:

```bash
firebase serve
# Make changes and refresh browser to test
# Then: firebase deploy
```

---

## 💰 Pricing Estimate

**Firebase Hosting (FREE Tier):**
- 10 GB storage ✅
- 360 MB/day transfer ✅
- Your webapp files: ~5MB

**Cloud Storage:**
- Storage: ~5GB @ $0.020/GB/month = **$0.10/month**
- Network egress:
  - First 1GB/day: FREE
  - Each video stream: ~2GB
  - Estimate: **$0-5/month** for demo

**Total: ~$5/month** for investor demos

---

## 📊 Monitoring

### View Deployment Status

```bash
firebase hosting:sites:list
```

### View Usage Stats

Firebase Console → Hosting → Usage

### View Storage Stats

Cloud Console → Cloud Storage → Metrics

---

## 🐛 Troubleshooting

### Video Won't Load

1. **Check CORS**: Make sure CORS is enabled on your bucket
2. **Check URL**: Verify the URLs in `app.js` are correct
3. **Check Console**: Open DevTools (F12) and check for errors

### AR Button Not Showing

1. **Check HTTPS**: WebXR requires HTTPS (Firebase provides this)
2. **Check Device**: Must be Android with ARCore support
3. **Check Browser**: Must be Chrome (not Firefox, Safari, etc.)

### Files Too Large

If 4DS files are too large for upload:

1. **Compress before upload**: Use the MOBILE_720 versions (you already have these ✅)
2. **Use gsutil**: It handles large files better than web upload
3. **Upload one at a time**: Test with one video first

### Deployment Fails

```bash
# Clear cache and retry
firebase logout
firebase login
firebase deploy
```

---

## 📞 Support

**Firebase Documentation:**
- [Hosting Guide](https://firebase.google.com/docs/hosting)
- [Cloud Storage Guide](https://cloud.google.com/storage/docs)

**4DView Documentation:**
- See `DOCS/Plugin4DS_WEB4DV_v3.1.0/webplayer/README.txt`

---

## ✅ Quick Deployment Checklist

- [ ] Install Firebase CLI
- [ ] Run `setup-deployment.bat`
- [ ] Create Firebase project
- [ ] Initialize Firebase hosting
- [ ] Create Cloud Storage bucket
- [ ] Upload 4DS files to bucket
- [ ] Make bucket public
- [ ] Enable CORS on bucket
- [ ] Update URLs in `app.js`
- [ ] Deploy: `firebase deploy`
- [ ] Test on desktop browser
- [ ] Test on mobile browser
- [ ] Test AR mode on Android

---

## 🎉 You're Ready!

Share your URL with investors:
**`https://volumetrik-demo.web.app`**

Good luck with your demo! 🚀
