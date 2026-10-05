import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { connectFirestoreEmulator, getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { connectAuthEmulator, getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Public web configuration from Firebase Console > Project settings.
export const firebaseConfig = {
  apiKey: "AIzaSyCe9_IEp4pZ1KWwAC7Io5AmieGwMONC2fY",
  authDomain: "chijas.firebaseapp.com",
  projectId: "chijas",
  messagingSenderId: "772345093720",
  appId: "1:772345093720:web:f252360b6c094e98e4342d"
};

const requiredKeys = ["apiKey", "authDomain", "projectId", "messagingSenderId", "appId"];
export const firebaseConfigured = requiredKeys.every(key => {
  const value = firebaseConfig[key];
  return typeof value === "string" && value.trim() !== "" && !value.includes("REEMPLAZA_");
});

export const firebaseConfigError = "Añade la configuración de tu app web en firebase-config.js para conectar Firebase.";
export const firebaseApp = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const firebaseDb = firebaseApp ? getFirestore(firebaseApp) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

if (firebaseDb && location.hostname === "localhost") {
  connectFirestoreEmulator(firebaseDb, "127.0.0.1", 8080);
}

if (firebaseAuth && location.hostname === "localhost") {
  connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
}
