import { firebaseDb } from "./firebase-config.js?v=2";
import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function startViewerPresence(user, onError) {
  let active = true;
  async function publish() {
    if (!active) return;
    try {
      await setDoc(doc(firebaseDb, "viewerPresence", user.uid), {
        uid: user.uid, is_online: document.visibilityState === "visible", last_active_at: serverTimestamp()
      });
    } catch (error) {
      if (!active) return;
      stop();
      onError(error);
    }
  }
  const timer = setInterval(publish, 30_000);
  function stop() {
    active = false;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", publish);
  }
  document.addEventListener("visibilitychange", publish);
  publish();
  return stop;
}
