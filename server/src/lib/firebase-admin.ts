import admin from 'firebase-admin';

let initialized = false;

function initAdmin() {
  if (initialized) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.warn('  FIREBASE_SERVICE_ACCOUNT not set — credit system disabled');
    initialized = true;
    return;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('  Firebase Admin initialized');
  } catch (err) {
    console.error('  Firebase Admin init failed:', (err as Error).message);
  }
  initialized = true;
}

initAdmin();

export const adminAuth = admin.apps.length ? admin.auth() : (null as unknown as admin.auth.Auth);
export const adminDb = admin.apps.length ? admin.firestore() : (null as unknown as admin.firestore.Firestore);
