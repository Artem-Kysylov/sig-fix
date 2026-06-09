import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

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
const provider = new GoogleAuthProvider();

window.user = null;

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, provider);
  return result.user;
};

export const logoutUser = async () => {
  await signOut(auth);
};

onAuthStateChanged(auth, (user) => {
  if (user) {
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
