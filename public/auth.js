/**
 * Firebase Authentication Module
 *
 * SETUP INSTRUCTIONS:
 * 1. Run `firebase login --reauth` to refresh Firebase credentials
 * 2. Enable Authentication in Firebase Console:
 *    - Go to https://console.firebase.google.com/
 *    - Select project: spectralysium-volumetric-demo
 *    - Navigate to Authentication > Sign-in method
 *    - Enable Google provider
 *    - Add authorized domains: your-domain.web.app, localhost
 *
 * 3. Enable Firestore Database:
 *    - Navigate to Firestore Database
 *    - Create database in production mode
 *    - Set security rules (see firestore.rules)
 *
 * 4. Get Firebase config:
 *    - Run `firebase apps:sdkconfig web` OR
 *    - Go to Project Settings > Your apps > Web app config
 *    - Replace firebaseConfig below with your actual values
 */

// Import Firebase modules from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
  collection,
  addDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDmGB7rrKoM20RStIVUDAfz0H79eu4b3tA",
  authDomain: "spectralysium-volumetric-demo.firebaseapp.com",
  projectId: "spectralysium-volumetric-demo",
  storageBucket: "spectralysium-volumetric-demo.firebasestorage.app",
  messagingSenderId: "980216689609",
  appId: "1:980216689609:web:882ac39ba4c30a9ec76e18"
};

// ============================================================================
// INITIALIZE FIREBASE
// ============================================================================
let app;
let auth;
let db;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  // Set persistence to LOCAL (survives browser restarts)
  setPersistence(auth, browserLocalPersistence);

  console.log('[Auth] Firebase initialized successfully');
} catch (error) {
  console.error('[Auth] Firebase initialization failed:', error);
  throw error;
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Sign in with Google popup
 * @returns {Promise<Object>} User object
 */
export async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');

    // Set custom parameters
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    console.log('[Auth] Starting Google sign-in...');
    const result = await signInWithPopup(auth, provider);

    const user = result.user;
    console.log('[Auth] Sign-in successful:', user.email);

    // Track user in Firestore
    await trackUserLogin(user);

    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    };
  } catch (error) {
    console.error('[Auth] Sign-in error:', error);

    // Handle specific error codes
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in cancelled. Please try again.');
    } else if (error.code === 'auth/popup-blocked') {
      throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
    } else if (error.code === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your connection.');
    } else {
      throw new Error('Sign-in failed. Please try again.');
    }
  }
}

/**
 * Sign out current user
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  try {
    await signOut(auth);
    console.log('[Auth] User signed out successfully');
  } catch (error) {
    console.error('[Auth] Sign-out error:', error);
    throw new Error('Failed to sign out. Please try again.');
  }
}

/**
 * Get current authenticated user
 * @returns {Object|null} User object or null if not authenticated
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Listen to authentication state changes
 * @param {Function} callback - Called with user object or null
 * @returns {Function} Unsubscribe function
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      callback({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      });
    } else {
      callback(null);
    }
  });
}

// ============================================================================
// USER TRACKING FUNCTIONS
// ============================================================================

/**
 * Track user login in Firestore
 * Creates or updates user document with login timestamp
 * @param {Object} user - Firebase user object
 */
async function trackUserLogin(user) {
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // Existing user - update last login
      await updateDoc(userRef, {
        lastLogin: serverTimestamp(),
        totalLogins: increment(1),
        email: user.email, // Update in case it changed
        displayName: user.displayName,
        photoURL: user.photoURL
      });
      console.log('[Auth] Updated existing user login:', user.email);
    } else {
      // New user - create document
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        totalLogins: 1,
        videosWatched: [],
        preferences: {
          volume: 1.0,
          quality: 'auto'
        }
      });
      console.log('[Auth] Created new user document:', user.email);
    }
  } catch (error) {
    console.error('[Auth] Failed to track user login:', error);
    // Don't throw - login should succeed even if tracking fails
  }
}

/**
 * Track user activity (video play, AR mode, etc.)
 * @param {String} action - Action type (e.g., 'video_play', 'ar_mode')
 * @param {Object} metadata - Additional data about the action
 */
export async function trackUserActivity(action, metadata = {}) {
  try {
    const user = getCurrentUser();
    if (!user) {
      console.warn('[Auth] Cannot track activity - user not authenticated');
      return;
    }

    const analyticsRef = collection(db, 'analytics');
    await addDoc(analyticsRef, {
      userId: user.uid,
      userEmail: user.email,
      action,
      metadata,
      timestamp: serverTimestamp()
    });

    console.log('[Auth] Tracked activity:', action, metadata);
  } catch (error) {
    console.error('[Auth] Failed to track activity:', error);
    // Don't throw - tracking failure shouldn't break app
  }
}

/**
 * Update user video watch history
 * @param {String} videoId - Video identifier
 */
export async function trackVideoWatch(videoId) {
  try {
    const user = getCurrentUser();
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const videosWatched = userData.videosWatched || [];

      // Add video to history if not already present
      if (!videosWatched.includes(videoId)) {
        videosWatched.push(videoId);
        await updateDoc(userRef, {
          videosWatched
        });
        console.log('[Auth] Added video to watch history:', videoId);
      }
    }
  } catch (error) {
    console.error('[Auth] Failed to track video watch:', error);
  }
}

/**
 * Check if user is admin
 * @param {String} email - User email
 * @returns {Promise<Boolean>}
 */
export async function isUserAdmin(email) {
  try {
    const adminRef = doc(db, 'admins', email);
    const adminSnap = await getDoc(adminRef);
    return adminSnap.exists();
  } catch (error) {
    console.error('[Auth] Failed to check admin status:', error);
    return false;
  }
}

/**
 * Get user data from Firestore
 * @param {String} uid - User ID
 * @returns {Promise<Object|null>}
 */
export async function getUserData(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data();
    }
    return null;
  } catch (error) {
    console.error('[Auth] Failed to get user data:', error);
    return null;
  }
}

// ============================================================================
// AUTHENTICATION GUARD
// ============================================================================

/**
 * Redirect to login if user is not authenticated
 * Call this at the start of protected pages (index.html, admin/index.html)
 * @param {String} loginUrl - URL of login page (default: '/login.html')
 */
export function requireAuth(loginUrl = '/login.html') {
  const user = getCurrentUser();

  if (!user) {
    console.log('[Auth] User not authenticated, redirecting to login...');
    window.location.href = loginUrl;
  }
}

/**
 * Initialize authentication guard with listener
 * More robust than requireAuth - handles async auth state
 * @param {String} loginUrl - URL of login page
 * @param {Function} onAuthenticated - Callback when user is authenticated
 */
export function initAuthGuard(loginUrl = '/login.html', onAuthenticated = null) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('[Auth] User authenticated:', user.email);
      if (onAuthenticated) {
        onAuthenticated(user);
      }
    } else {
      console.log('[Auth] No user authenticated, redirecting to login...');
      window.location.href = loginUrl;
    }
  });
}

// Export auth and db for advanced usage
export { auth, db };
