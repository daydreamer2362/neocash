// ─── Firebase Client SDK (Google Auth) ──────────────
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCHKzDT7aQRx8k2nmvJ3D2VvGxjkj5RAHI",
  authDomain: "neocassh.firebaseapp.com",
  projectId: "neocassh",
  storageBucket: "neocassh.firebasestorage.app",
  messagingSenderId: "366033551345",
  appId: "1:366033551345:web:76c0c0c2a85a7d948dce50",
  measurementId: "G-BHHKKMW5PQ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use local persistence to avoid third-party cookie issues
setPersistence(auth, browserLocalPersistence).catch(() => {});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Trigger Google Sign-In popup and return the Firebase ID token.
 * Uses explicit browserPopupRedirectResolver to avoid
 * "Pending promise was never set" assertion failures.
 * @returns {Promise<{ idToken: string, email: string, displayName: string }>}
 */
export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
  const idToken = await result.user.getIdToken();
  return {
    idToken,
    email: result.user.email || '',
    displayName: result.user.displayName || '',
  };
};

/**
 * Sign out from Firebase (clears local Firebase session).
 */
export const signOutFirebase = async () => {
  try {
    await auth.signOut();
  } catch (e) {
    // Ignore sign-out errors
  }
};

export default { signInWithGoogle, signOutFirebase };
