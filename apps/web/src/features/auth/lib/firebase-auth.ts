import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { env } from "@/web/env";

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

const firebaseAuth = getAuth(firebaseApp);
const firebaseDb = getFirestore(firebaseApp);

const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: "select_account",
});

export { firebaseApp, firebaseAuth, firebaseDb, googleAuthProvider };
