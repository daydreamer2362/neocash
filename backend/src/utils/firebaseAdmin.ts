import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// ─── Firebase Admin SDK Initialization ──────────────
const SERVICE_ACCOUNT_JSON = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
const SERVICE_ACCOUNT_JSON_BASE64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || '').trim();
const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.resolve(__dirname, '../../firebase-service-account.json');

let firebaseApp: admin.app.App | null = null;

const parseServiceAccountJson = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readServiceAccountFromEnv = () => {
  const direct = parseServiceAccountJson(SERVICE_ACCOUNT_JSON);
  if (direct) return direct;

  if (SERVICE_ACCOUNT_JSON_BASE64) {
    try {
      const decoded = Buffer.from(SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf-8');
      const parsed = parseServiceAccountJson(decoded);
      if (parsed) return parsed;
    } catch {
      return null;
    }
  }

  return null;
};

const getFirebaseApp = (): admin.app.App => {
  if (firebaseApp) return firebaseApp;

  const serviceAccountFromEnv = readServiceAccountFromEnv();
  if (serviceAccountFromEnv) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountFromEnv as admin.ServiceAccount),
    });
    console.log('[Firebase Admin] Initialized successfully (env)');
    return firebaseApp;
  }

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      `Firebase service account not found at ${SERVICE_ACCOUNT_PATH}. ` +
      `Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH env var.`
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });

  console.log('[Firebase Admin] Initialized successfully');
  return firebaseApp;
};

// ─── Verify Google ID Token ─────────────────────────
export interface GoogleTokenPayload {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  photoURL: string | undefined;
}

export const verifyGoogleToken = async (idToken: string): Promise<GoogleTokenPayload> => {
  const app = getFirebaseApp();
  const decodedToken = await app.auth().verifyIdToken(idToken);

  // Optionally fetch user record for display name & photo
  let displayName: string | undefined;
  let photoURL: string | undefined;
  try {
    const userRecord = await app.auth().getUser(decodedToken.uid);
    displayName = userRecord.displayName;
    photoURL = userRecord.photoURL;
  } catch {
    // Non-critical — use token claims only
    displayName = decodedToken.name;
    photoURL = decodedToken.picture;
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    displayName,
    photoURL,
  };
};

export default { verifyGoogleToken };
