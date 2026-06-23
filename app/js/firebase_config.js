import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIG ---
export const firebaseConfig = {
    apiKey: "AIzaSyA5EVkg2K1YoP65Ej3HBGgfHDBOOwnKbSs",
    authDomain: "inworkcosmo.firebaseapp.com",
    projectId: "inworkcosmo",
    storageBucket: "inworkcosmo.firebasestorage.app",
    messagingSenderId: "384225621712",
    appId: "1:384225621712:web:5767b990f5b588a43350d5",
    measurementId: "G-TJH9MJCZHC"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Set session persistence - login required when all browser tabs are closed
setPersistence(auth, browserSessionPersistence);

// --- INITIALIZE FIRESTORE ---
export const db = initializeFirestore(app, {});

/** Secondary Firebase app for admin user creation or hub sync without signing out the primary session. */
export function createSecondaryApp(name, config = firebaseConfig) {
    return initializeApp(config, name);
}

export { deleteApp };

export * from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
export * from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
export * from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


