import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBOwfKkqgrnueRYFCYiUoZ4cO7JriUskCw",
  authDomain: "sigfix-28eb8.firebaseapp.com",
  projectId: "sigfix-28eb8",
  storageBucket: "sigfix-28eb8.firebasestorage.app",
  messagingSenderId: "708145872389",
  appId: "1:708145872389:web:af01f708fae9aebc49e66c",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

window.user = null;

const saveUserToFirestore = async (user) => {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || "Anonymous",
    lastLoginAt: serverTimestamp(),
  };

  if (!snapshot.exists()) {
    userData.isPro = false;
  }

  await setDoc(userRef, userData, { merge: true });
};

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, provider);
  await saveUserToFirestore(result.user);
  return result.user;
};

export const logoutUser = async () => {
  await signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await saveUserToFirestore(user);
    } catch (error) {
      console.error("Failed to save user to Firestore:", error);
    }

    window.user = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
    console.log("User logged in:", window.user.email);
    document.dispatchEvent(new CustomEvent("authChanged", { detail: window.user }));
  } else {
    window.user = null;
    console.log("User logged out");
    document.dispatchEvent(new CustomEvent("authChanged", { detail: null }));
  }
});
