import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAtzxhchv_2pmSNLXu-IZLYIqTnWop-Q7g",
  authDomain: "brooklynn-61dc8.firebaseapp.com",
  projectId: "brooklynn-61dc8",
  storageBucket: "brooklynn-61dc8.firebasestorage.app",
  messagingSenderId: "123339333797",
  appId: "1:123339333797:web:fa0659cd153d09491aad4c",
  measurementId: "G-SZ7TS3VYRC"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Only initialize analytics in browser environments
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
