# Volumetrik Platform Setup Guide

Your volumetric performance platform with Google OAuth authentication and admin console is ready! 🎉

## What's Been Set Up

### ✅ Firebase Configuration
- Firebase project connected: `spectralysium-volumetric-demo`
- Firestore database created and rules deployed
- Authentication configuration added to code

### ✅ Application Structure
1. **Login Page** (`/login.html`) - Beautiful login interface with Google OAuth
2. **Library Page** (`/library.html` & `/index.html`) - Netflix/Spotify-style landing page
3. **Player Page** (`/player.html`) - Volumetric video player with AR support
4. **Admin Console** (`/admin/index.html`) - User management dashboard

### ✅ Features Implemented
- Google OAuth sign-in with session management
- User profile tracking (login history, videos watched)
- Admin-only console with user analytics
- Beautiful UI/UX inspired by Spotify and Netflix
- Responsive design for mobile and desktop
- AR support for mobile devices

---

## Next Steps to Complete Setup

### 1. Enable Google Authentication in Firebase Console

You need to enable Google OAuth provider in your Firebase project:

1. Go to [Firebase Console](https://console.firebase.google.com/project/spectralysium-volumetric-demo/authentication/providers)
2. Click on **"Get Started"** (if Authentication is not enabled)
3. Select **"Google"** from the sign-in providers list
4. Toggle **"Enable"** switch
5. Add your **Project support email**: `raiyan@spectralysium.com`
6. Click **"Save"**

### 2. Add Your Email as Admin

To access the admin console:

1. Open your browser and go to: **http://localhost:5000/setup-admin.html** (or your deployed URL)
2. The email `raiyan@spectralysium.com` is pre-filled
3. Click **"Add as Admin"**
4. **IMPORTANT**: After adding the admin, delete the `setup-admin.html` file for security:
   ```bash
   rm public/setup-admin.html
   ```

### 3. Test the Application Locally

```bash
# Start Firebase local hosting
firebase serve

# Open in browser:
# http://localhost:5000
```

### 4. Deploy to Firebase Hosting

When ready to deploy:

```bash
# Deploy everything (hosting + firestore rules)
firebase deploy

# Or deploy only hosting
firebase deploy --only hosting
```

Your site will be available at:
**https://spectralysium-volumetric-demo.web.app**

---

## Application Flow

```
1. User visits site → Redirected to /login.html
2. User signs in with Google → Authenticated
3. User profile created in Firestore automatically
4. Redirected to /library.html (main landing page)
5. User selects a performance → Redirected to /player.html?video=ID
6. Video plays with AR support

Admin Flow:
1. Admin user visits /admin
2. Checks if email is in admins collection
3. If yes → Shows admin dashboard
4. If no → Redirected to main app
```

---

## File Structure

```
VolumetrikDjarum/
├── public/
│   ├── index.html           # Main landing page (library)
│   ├── library.html         # Performance library
│   ├── login.html           # Google OAuth login
│   ├── player.html          # Volumetric video player
│   ├── auth.js              # Firebase auth module
│   ├── app.js               # Player application logic
│   ├── setup-admin.html     # One-time admin setup (DELETE AFTER USE!)
│   └── admin/
│       ├── index.html       # Admin console UI
│       └── admin.js         # Admin console logic
├── firebase.json            # Firebase configuration
├── firestore.rules          # Security rules
└── SETUP_GUIDE.md           # This file
```

---

## User Data Structure

### Users Collection (`/users/{uid}`)
```javascript
{
  uid: "user-unique-id",
  email: "user@example.com",
  displayName: "User Name",
  photoURL: "https://...",
  createdAt: Timestamp,
  lastLogin: Timestamp,
  totalLogins: 5,
  videosWatched: ["dance-nani", "martial-asep"],
  preferences: {
    volume: 1.0,
    quality: "auto"
  }
}
```

### Admins Collection (`/admins/{email}`)
```javascript
{
  email: "admin@example.com",
  addedAt: "2025-10-27T...",
  role: "admin"
}
```

### Analytics Collection (`/analytics/{docId}`)
```javascript
{
  userId: "user-id",
  userEmail: "user@example.com",
  action: "video_play" | "ar_mode",
  metadata: { videoId: "...", duration: ... },
  timestamp: Timestamp
}
```

---

## Admin Console Features

The admin console at `/admin` provides:

- **Total Users**: All registered users
- **New This Month**: Growth metrics
- **Active This Week**: Recent user activity
- **Total Logins**: Engagement tracking
- **User Search**: Find users by name or email
- **Export to CSV**: Download user data
- **User Details**: Click any user row to see full details

---

## Security Notes

### ✅ Implemented Security
- Firestore security rules prevent unauthorized access
- Users can only read/write their own data
- Admin access requires email in `admins` collection
- Authentication required for all protected routes

### 🔒 Important Security Steps
1. **Delete `setup-admin.html`** after adding your admin email
2. **Never commit Firebase API keys** to public repositories (they're already in .gitignore)
3. **Add authorized domains** in Firebase Console:
   - Go to Authentication > Settings > Authorized domains
   - Add your production domain

---

## Customization

### Adding New Performances

Edit `/public/library.html` and update the `performances` array:

```javascript
const performances = [
  {
    id: 'your-video-id',
    title: 'Performance Title',
    description: 'Description text',
    category: 'dance' | 'martial' | 'music',
    icon: '🎭',
    tags: ['Tag1', 'Tag2']
  },
  // ... more performances
];
```

### Changing Colors

Edit CSS variables in `library.html`:

```css
:root {
  --primary-purple: #a78bfa;
  --primary-violet: #8b5cf6;
  --primary-indigo: #6366f1;
  --dark-bg: #0f0f1a;
  /* ... more colors */
}
```

---

## Troubleshooting

### Issue: "Sign-in failed"
**Solution**: Make sure Google OAuth is enabled in Firebase Console

### Issue: "Access Denied" on admin page
**Solution**: Make sure your email is added to `admins` collection via setup-admin.html

### Issue: "Users not loading in admin console"
**Solution**: Check Firestore rules are deployed and users have signed in at least once

### Issue: Videos not loading
**Solution**: Check that video files are accessible and CORS is properly configured

---

## Support & Contact

- Platform: Volumetrik - Volumetric Performance Platform
- Developer: Raiyan Laksamana
- Email: raiyan@spectralysium.com
- Phone: +62 812 8298 4548

---

## What's Next?

1. ✅ Complete Firebase Authentication setup
2. ✅ Add yourself as admin
3. ✅ Test sign-in flow
4. ✅ Deploy to Firebase Hosting
5. 🎯 Add actual performance content
6. 🎯 Customize branding and colors
7. 🎯 Add more performance categories
8. 🎯 Set up custom domain

Enjoy your volumetric performance platform! 🎭✨
