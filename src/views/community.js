import { firebaseAuth, firebaseDb } from "../services/firebase-config.js?v=2";
import { normalizePick } from "../models/pick-schema.js";
import { signInGoogle } from "../services/google-sign-in.js";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function signInViewer() {
  if (!firebaseAuth) throw new Error("Firebase Auth no está configurado.");
  return signInGoogle();
}

export async function ensureViewer(user) {
  if (!user.emailVerified || user.isAnonymous) throw new Error("Verifica tu correo antes de seguir tipsters.");
  const ref = doc(firebaseDb, "users", user.uid);
  await runTransaction(firebaseDb, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) transaction.set(ref, {
      uid: user.uid,
      role: "viewer",
      displayName: (user.displayName || "").slice(0, 120),
      photoURL: user.photoURL || null,
      email: user.email,
      created_at: serverTimestamp()
    });
  });
}

const followOperations = new Map();

export function setFollowing(user, tipsterId, following) {
  const key = `${user?.uid}_${tipsterId}`;
  const pending = followOperations.get(key);
  if (pending) {
    if (pending.following === following) return pending.promise;
    return pending.promise.then(() => setFollowing(user, tipsterId, following));
  }
  const promise = commitFollowing(user, tipsterId, following).finally(() => {
    if (followOperations.get(key)?.promise === promise) followOperations.delete(key);
  });
  followOperations.set(key, { following, promise });
  return promise;
}

async function commitFollowing(user, tipsterId, following) {
  if (!user || firebaseAuth.currentUser?.uid !== user.uid) throw new Error("Inicia sesión para seguir tipsters.");
  const followRef = doc(firebaseDb, "follows", `${user.uid}_${tipsterId}`);
  const profileRef = doc(firebaseDb, "perfiles", tipsterId);
  const metricsRef = doc(firebaseDb, "perfiles_metricas", tipsterId);
  let lastAttemptMetricState = null, lastAttemptFollowExists = false;
  const transact = () => runTransaction(firebaseDb, async transaction => {
    const [follow, metrics] = await Promise.all([
      transaction.get(followRef), transaction.get(metricsRef)
    ]);
    lastAttemptMetricState = metrics.exists() ? metrics.data().followerCount : null;
    lastAttemptFollowExists = follow.exists();
    if (follow.exists() === following) return following;
    let profile = null;
    if (following || !metrics.exists()) {
      profile = await transaction.get(profileRef);
      const status = profile.data()?.tipster_status;
      if (!profile.exists() || status !== "approved") {
        throw new Error("Este tipster ya no está disponible.");
      }
    }
    const count = metrics.exists()
      ? metrics.data().followerCount
      : profile.data().followerCount ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || (!following && count === 0)) {
      throw new Error("El contador de seguidores necesita revisión. Contacta al administrador.");
    }
    const nextCount = count + (following ? 1 : -1);
    if (following) transaction.set(followRef, {
      followerId: user.uid, tipsterId, created_at: serverTimestamp()
    });
    else transaction.delete(followRef);
    if (metrics.exists()) transaction.update(metricsRef, { followerCount: nextCount });
    else transaction.set(metricsRef, { followerCount: nextCount });
    return following;
  });
  try {
    return await transact();
  } catch (error) {
    if (error.code !== "permission-denied") throw error;
    const [follow, metrics] = await Promise.all([getDoc(followRef), getDoc(metricsRef)]);
    if (follow.exists() === following) return following;
    const latestMetricState = metrics.exists() ? metrics.data().followerCount : null;
    if (latestMetricState === lastAttemptMetricState
      && follow.exists() === lastAttemptFollowExists) throw error;
    return transact();
  }
}

export function subscribeFollowingFeed(tipsterIds, onChange, onError) {
  const ids = [...new Set(tipsterIds)].sort();
  const chunks = [];
  for (let offset = 0; offset < ids.length; offset += 10) chunks.push(ids.slice(offset, offset + 10));
  if (!chunks.length) {
    onChange([]);
    return () => {};
  }
  const pages = new Map();
  const stops = [];
  let active = true;
  const stop = () => {
    active = false;
    stops.forEach(unsubscribe => unsubscribe());
  };
  chunks.forEach((chunk, index) => {
    stops.push(onSnapshot(query(
      collection(firebaseDb, "picks"), where("user_id", "in", chunk),
      orderBy("created_at", "desc"), limit(60)
    ), snapshot => {
      if (!active) return;
      try {
        pages.set(index, snapshot.docs.map(item => normalizePick({ ...item.data(), id: item.id })));
      } catch (error) {
        stop();
        onError(error);
        return;
      }
      if (pages.size !== chunks.length) return;
      const picks = [...new Map([...pages.values()].flat().map(pick => [pick.id, pick])).values()];
      picks.sort((a, b) => (b.created_at?.toMillis() || 0) - (a.created_at?.toMillis() || 0)
        || a.id.localeCompare(b.id));
      onChange(picks.slice(0, 60));
    }, error => {
      if (!active) return;
      stop();
      onError(error);
    }));
  });
  return stop;
}
