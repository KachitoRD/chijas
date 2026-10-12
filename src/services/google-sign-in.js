import { firebaseAuth } from "./firebase-config.js?v=2";
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export function signInGoogle() {
  if (!firebaseAuth) throw new Error("Firebase Auth no está configurado.");
  return signInWithPopup(firebaseAuth, new GoogleAuthProvider());
}
