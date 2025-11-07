# How to Add Admin User - Firebase Console Method

Since the security rules prevent client-side admin creation (for security), you need to add your admin email directly through Firebase Console.

## Step-by-Step Instructions

### Method 1: Using Firebase Console (Recommended)

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com/project/spectralysium-volumetric-demo/firestore/data

2. **Start a Collection**
   - Click "+ Start collection"
   - Collection ID: `admins`
   - Click "Next"

3. **Add Your Admin Document**
   - Document ID: `raiyan@spectralysium.com` (use your email as the document ID)
   - Add fields:
     ```
     Field: email
     Type: string
     Value: raiyan@spectralysium.com

     Field: role
     Type: string
     Value: admin

     Field: addedAt
     Type: timestamp
     Value: (click "Use current timestamp")
     ```
   - Click "Save"

4. **Done!**
   - You can now access the admin console at: https://spectralysium-volumetric-demo.web.app/admin
   - Delete the `setup-admin.html` file for security

### Method 2: Using Firebase CLI (Alternative)

If you prefer command line, I can create a script to add the admin through Firebase Admin SDK.

---

## Visual Guide

**Firebase Console → Firestore Database → Data tab:**

```
Collections
└── admins
    └── raiyan@spectralysium.com
        ├── email: "raiyan@spectralysium.com"
        ├── role: "admin"
        └── addedAt: [timestamp]
```

---

## After Adding Admin

Test your admin access:
1. Sign in at: https://spectralysium-volumetric-demo.web.app/login.html
2. Visit: https://spectralysium-volumetric-demo.web.app/admin
3. You should see the admin dashboard with user statistics

If you still get "Access Denied", check:
- You're signed in with the exact email you added to Firestore
- The document ID in Firestore exactly matches your email
- You've refreshed your browser after adding the admin document
