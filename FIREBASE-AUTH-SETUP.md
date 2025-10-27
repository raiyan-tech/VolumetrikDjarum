# Firebase Authentication Setup Guide

This guide will walk you through setting up Firebase Authentication and Firestore for the Volumetrik platform.

## Overview

The authentication system includes:
- Google OAuth sign-in
- User tracking and analytics
- Admin console with user management
- Session persistence across browser restarts

## Step 1: Firebase Authentication Setup

### 1.1 Enable Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `spectralysium-volumetric-demo`
3. Navigate to **Authentication** > **Sign-in method**
4. Click **Add new provider**
5. Select **Google** provider
6. Enable the provider
7. Add authorized domains:
   - `spectralysium-volumetric-demo.web.app`
   - `localhost` (for local testing)
8. Save changes

### 1.2 Get Firebase Configuration

Run the following command to get your Firebase config:

```bash
firebase login --reauth
firebase apps:sdkconfig web
```

OR manually:

1. Go to **Project Settings** (gear icon)
2. Scroll to **Your apps** section
3. Click the web app (</> icon)
4. Copy the `firebaseConfig` object

### 1.3 Update Configuration

Edit `public/auth.js` and replace the `firebaseConfig` object (lines 57-64):

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "spectralysium-volumetric-demo.firebaseapp.com",
  projectId: "spectralysium-volumetric-demo",
  storageBucket: "spectralysium-volumetric-demo.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};
```

## Step 2: Firestore Database Setup

### 2.1 Create Firestore Database

1. Go to **Firestore Database** in Firebase Console
2. Click **Create database**
3. Select **Start in production mode**
4. Choose a location (e.g., `us-central`)
5. Click **Enable**

### 2.2 Deploy Security Rules

Deploy the security rules using Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

OR manually:

1. Go to **Firestore Database** > **Rules** tab
2. Copy the contents of `firestore.rules` file
3. Paste into the rules editor
4. Click **Publish**

### 2.3 Create Admin User

To grant admin access to a user:

1. Go to **Firestore Database** > **Data** tab
2. Click **Start collection**
3. Collection ID: `admins`
4. Document ID: Your email address (e.g., `raiyan@spectralysium.com`)
5. Add fields:
   - `email` (string): Your email address
   - `role` (string): `admin`
   - `addedAt` (timestamp): Click "Add field" > Select "timestamp" > Use current time
6. Click **Save**

**Important:** This is the only way to add admins. Users cannot be added via the app for security.

## Step 3: Local Testing

### 3.1 Install Firebase CLI (if not installed)

```bash
npm install -g firebase-tools
```

### 3.2 Run Local Server

```bash
firebase serve
```

OR use any static file server:

```bash
# Python 3
python -m http.server 8080

# Node.js
npx http-server public -p 8080
```

### 3.3 Test Authentication Flow

1. Open `http://localhost:8080/login.html`
2. Click "Continue with Google"
3. Sign in with your Google account
4. You should be redirected to the main app
5. Check that your profile appears in the top-right corner

### 3.4 Test Admin Console

1. Make sure you've added your email to the `admins` collection
2. Open `http://localhost:8080/admin/index.html`
3. Sign in with your admin Google account
4. You should see the admin dashboard with user statistics

## Step 4: Deploy to Firebase Hosting

### 4.1 Deploy Main App

```bash
firebase deploy --only hosting
```

### 4.2 Test Production

1. Open `https://spectralysium-volumetric-demo.web.app/login.html`
2. Complete the authentication flow
3. Test all features

## Step 5: Admin Console Separate Domain (Optional)

To host the admin console on a separate domain:

### 5.1 Create New Hosting Site

```bash
firebase hosting:sites:create admin-volumetrik
```

### 5.2 Update firebase.json

Replace the current `hosting` configuration with:

```json
{
  "hosting": [
    {
      "site": "spectralysium-volumetric-demo",
      "public": "public",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "DOCS/**", "README.md", "public/admin/**"],
      "rewrites": [
        {
          "source": "**",
          "destination": "/index.html"
        }
      ],
      "headers": [...]
    },
    {
      "site": "admin-volumetrik",
      "public": "public/admin",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [
        {
          "source": "**",
          "destination": "/index.html"
        }
      ]
    }
  ]
}
```

### 5.3 Deploy Both Sites

```bash
firebase deploy --only hosting
```

Admin console will be available at: `https://admin-volumetrik.web.app`

## Firestore Collections Structure

### `users` Collection

Document ID: User UID

```javascript
{
  uid: "firebase-user-uid",
  email: "user@example.com",
  displayName: "User Name",
  photoURL: "https://...",
  createdAt: Timestamp,
  lastLogin: Timestamp,
  totalLogins: number,
  videosWatched: ["video-id-1", "video-id-2"],
  preferences: {
    volume: 1.0,
    quality: "auto"
  }
}
```

### `admins` Collection

Document ID: Admin email address

```javascript
{
  email: "admin@example.com",
  role: "admin",
  addedAt: Timestamp
}
```

### `analytics` Collection

Document ID: Auto-generated

```javascript
{
  userId: "firebase-user-uid",
  userEmail: "user@example.com",
  action: "video_play" | "ar_mode" | "local_file_load",
  metadata: {
    videoId: "dance-nani",
    duration: 120
  },
  timestamp: Timestamp
}
```

## Troubleshooting

### Authentication Not Working

1. **Check Firebase Config:** Ensure `firebaseConfig` in `auth.js` is correctly set
2. **Check Authorized Domains:** Go to Authentication > Settings > Authorized domains
3. **Check Browser Console:** Look for errors related to Firebase Auth
4. **Clear Browser Cache:** Try in incognito mode

### Admin Console Shows "Access Denied"

1. **Verify Admin Document:** Check that your email is in the `admins` collection
2. **Check Email Match:** Ensure the email in Firestore matches your Google account email exactly
3. **Check Security Rules:** Ensure Firestore rules are deployed correctly

### Users Not Being Tracked

1. **Check Firestore Rules:** Ensure users can write to their own documents
2. **Check Browser Console:** Look for Firestore errors
3. **Verify Firestore is Enabled:** Go to Firestore Database and ensure it's created

### Pop-up Blocked

If Google sign-in pop-up is blocked:

1. Allow pop-ups for your domain in browser settings
2. Try using incognito mode
3. Check browser console for specific error messages

## Security Best Practices

1. **Never commit Firebase config with sensitive data** to public repositories
2. **Use environment variables** for production deployments
3. **Regularly review Firestore security rules** to ensure they're restrictive
4. **Monitor Authentication usage** in Firebase Console
5. **Enable 2FA for Firebase Console access**
6. **Regularly audit admin users** in the `admins` collection

## Features Implemented

### Main App (`/index.html`)
- ✅ Authentication guard (redirects to login if not authenticated)
- ✅ User profile display with avatar
- ✅ Sign-out functionality
- ✅ User session persistence

### Login Page (`/login.html`)
- ✅ Modern Spotify/Netflix-inspired design
- ✅ Animated gradient background
- ✅ Floating particles effect
- ✅ Google OAuth sign-in
- ✅ Error handling with user-friendly messages
- ✅ Loading states

### Admin Console (`/admin/index.html`)
- ✅ Admin-only access (checks `admins` collection)
- ✅ User statistics dashboard
- ✅ Real-time user list with search
- ✅ Export users to CSV
- ✅ User details view
- ✅ Responsive design

### User Tracking
- ✅ Automatic user creation on first login
- ✅ Last login timestamp updates
- ✅ Total logins counter
- ✅ Videos watched history (ready for integration)
- ✅ User preferences storage

## Next Steps

1. **Integrate activity tracking** into app.js:
   - Track video play events
   - Track AR mode usage
   - Track local file loads

2. **Design performance library landing page:**
   - Netflix-style grid layout
   - Performance thumbnails
   - Categories and search

3. **Add PWA enhancements:**
   - Service worker for offline support
   - Web app manifest
   - Push notifications (optional)

4. **Additional admin features:**
   - Analytics graphs
   - User activity timeline
   - Email notification system

## Support

For issues or questions:
- Check Firebase Console logs
- Review browser console errors
- Check Firestore security rules
- Verify authentication is enabled

## References

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
