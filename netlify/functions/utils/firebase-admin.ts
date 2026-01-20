// Firebase Admin SDK for server-side operations
// This should ONLY be used in Netlify Functions, never on the client

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let app: App;
let db: Firestore;
let auth: Auth;

function initializeFirebaseAdmin(): App {
  if (getApps().length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!serviceAccountKey) {
      console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable');
      throw new Error('Firebase Admin SDK not configured');
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: projectId || serviceAccount.project_id,
      });
    } catch (error) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error);
      throw new Error('Invalid Firebase service account key');
    }
  } else {
    app = getApps()[0];
  }

  return app;
}

export function getFirebaseAdmin(): App {
  if (!app) {
    app = initializeFirebaseAdmin();
  }
  return app;
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseAdmin());
  }
  return db;
}

export function getFirebaseAdminAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseAdmin());
  }
  return auth;
}

export { app, db, auth };
export default getFirestoreDb;
