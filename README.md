# 🎥 Volumetrik - 4DS Streaming Player

A mobile-optimized web application for streaming volumetric video (4DS files) with WebXR Augmented Reality support.

![Volumetrik Demo](https://img.shields.io/badge/Status-Ready%20for%20Demo-success)
![AR Support](https://img.shields.io/badge/AR-WebXR%20Enabled-blue)
![Platform](https://img.shields.io/badge/Platform-Mobile%20%7C%20Desktop-orange)

---

## ✨ Features

- 📱 **Mobile-Optimized** - Responsive design for phones and tablets
- 🥽 **AR Mode** - View volumetric videos in augmented reality (Android)
- 🌊 **Streaming** - Progressive loading of large 4DS files
- 🎮 **Interactive Controls** - Play, pause, restart, mute
- 🎨 **Modern UI** - Clean, professional interface for investor demos
- 🚀 **Fast Deployment** - Deploy to Firebase in 30 minutes

---

## 🎬 Demo Videos Included

| Video | Type | Size |
|-------|------|------|
| Nani Dance | Dance Performance | 2.07 GB |
| Didik Dance | Dance Performance | 2.98 GB |
| Asep Martial | Martial Arts | 325 MB |
| Dian Martial | Martial Arts | 556 MB |
| Duel | Martial Arts | 610 MB |

---

## 🚀 Quick Deployment

### Prerequisites
- Google Account (Google Workspace)
- Node.js installed
- 30 minutes of your time

### Deploy Now

```bash
# 1. Setup
npm install -g firebase-tools
firebase login
setup-deployment.bat

# 2. Deploy
firebase init hosting
firebase deploy
```

**📖 Full Guide:** See [QUICK-START.md](QUICK-START.md) for step-by-step instructions.

---

## 📱 AR Requirements

**Supported:**
- ✅ Android phones with ARCore (Pixel, Samsung, OnePlus, etc.)
- ✅ Chrome browser (latest version)
- ✅ HTTPS connection (provided by Firebase)

**Not Supported:**
- ❌ iOS (requires USDZ format, not 4DS)
- ❌ Desktop AR (no mobile device)

---

## 🏗️ Project Structure

```
VolumetrikDjarum/
├── index.html              # Main webapp UI
├── app.js                  # Application logic with AR support
├── firebase.json           # Firebase hosting config
├── setup-deployment.bat    # Deployment setup script
├── cors.json              # Cloud Storage CORS config
│
├── QUICK-START.md         # 30-minute deployment guide
├── DEPLOYMENT.md          # Detailed deployment documentation
├── README.md              # This file
│
├── 4DS/                   # Volumetric video files
│   ├── DANCE/
│   └── MARTIAL_ART/
│
├── DOCS/                  # 4DView SDK documentation
│   ├── Plugin4DS_WEB4DV_v3.1.0/
│   └── viewer-4dv_example/
│
└── public/               # (Generated) Firebase hosting folder
    ├── index.html
    ├── app.js
    ├── lib/              # THREE.js libraries
    └── web4dv/           # 4DView plugin
```

---

## 🎯 For Investors

This demo showcases:

1. **Volumetric Video Streaming** - High-quality 3D video playback on mobile devices
2. **AR Integration** - Place and view 3D performances in real-world space
3. **Scalable Architecture** - Uses Google Cloud infrastructure
4. **Mobile-First Design** - Optimized for smartphone viewing
5. **Low Latency** - Progressive streaming for instant playback

### Use Cases
- Virtual performances and events
- E-commerce (3D product visualization)
- Education and training
- Entertainment and gaming
- Virtual museums and galleries

---

## 🛠️ Technology Stack

| Component | Technology |
|-----------|-----------|
| 3D Rendering | THREE.js |
| AR Framework | WebXR API |
| Video Format | 4DS (4DViews) |
| Codec | WASM decoder |
| Hosting | Firebase Hosting |
| Storage | Google Cloud Storage |
| CDN | Google Cloud CDN |

---

## 💰 Hosting Costs

**Estimated for Demo Usage:**

| Service | Free Tier | Cost/Month |
|---------|-----------|------------|
| Firebase Hosting | 10 GB / 360 MB daily | $0 |
| Cloud Storage | 5 GB @ $0.02/GB | $0.10 |
| Network Egress | First 1 GB/day free | $0-5 |
| **Total** | | **~$5/month** |

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| Video Quality | 720p (mobile optimized) |
| File Size | 300 MB - 3 GB per video |
| Streaming Rate | ~4 MB/s (4G compatible) |
| Frame Rate | 30 FPS |
| Load Time | 2-5 seconds (first frame) |
| AR Placement | Instant |

---

## 🔧 Customization

### Change Branding

Edit [index.html](index.html):

```html
<div class="branding">
    <h1>Your Brand Name</h1>
    <p>Your Tagline</p>
</div>
```

### Add More Videos

Edit [app.js](app.js):

```javascript
const VIDEO_LIBRARY = {
    'your-video-id': {
        name: 'Video Name',
        desktop: 'https://storage.googleapis.com/.../video.4ds',
        mobile: 'https://storage.googleapis.com/.../video.4ds',
        position: [0, 0, 0]
    }
};
```

### Adjust Camera Position

Edit [app.js](app.js):

```javascript
camera.position.set(0, 1.5, 3); // x, y, z
controls.target.set(0, 1, 0);   // look at point
```

---

## 🐛 Troubleshooting

### Video Won't Load
- Check browser console (F12) for errors
- Verify Cloud Storage URLs are correct
- Ensure CORS is enabled on bucket

### AR Button Not Showing
- Ensure HTTPS connection
- Check device supports ARCore
- Use Chrome browser (not Safari/Firefox)

### Slow Loading
- Use MOBILE_720 versions (already optimized)
- Check network connection (need 4G or better)
- Enable caching in `app.js`

**📖 See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed troubleshooting.**

---

## 📚 Documentation

- [QUICK-START.md](QUICK-START.md) - Deploy in 30 minutes
- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed deployment guide
- [4DView SDK Docs](DOCS/Plugin4DS_WEB4DV_v3.1.0/webplayer/README.txt)

---

## 📄 License

This project uses the 4DView WEB4DV plugin (v3.1.0).
See [EULA](DOCS/Plugin4DS_WEB4DV_v3.1.0/webplayer/EULA.pdf) for license terms.

---

## 🤝 Support

For issues or questions:
1. Check [DEPLOYMENT.md](DEPLOYMENT.md) troubleshooting section
2. Review [Firebase documentation](https://firebase.google.com/docs/hosting)
3. Check [4DView documentation](DOCS/)

---

## 🎉 Ready to Deploy?

```bash
setup-deployment.bat
firebase deploy
```

**Good luck with your investor demo! 🚀**
