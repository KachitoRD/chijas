import { firebaseAuth, firebaseDb as db } from "./firebase-config.js?v=2";
import { doc, runTransaction, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function saveLimits(tipsterMonthlyPickLimit, viewerMonthlyPickLimit) {
  if (!Number.isInteger(tipsterMonthlyPickLimit) || tipsterMonthlyPickLimit < 1 || tipsterMonthlyPickLimit > 500
    || !Number.isInteger(viewerMonthlyPickLimit) || viewerMonthlyPickLimit < 0 || viewerMonthlyPickLimit > 500) {
    throw new Error("Los límites deben ser enteros: tipsters 1–500 y viewers 0–500.");
  }
  return setDoc(doc(db, "platformSettings", "limits"), {
    tipsterMonthlyPickLimit, viewerMonthlyPickLimit, updated_at: serverTimestamp(), updated_by: firebaseAuth.currentUser.uid
  });
}

export function saveTakeRate(uid, takeRate) {
  if (!Number.isFinite(takeRate) || takeRate < 0 || takeRate > 100) throw new Error("La comisión debe estar entre 0 y 100 %.");
  return setDoc(doc(db, "tipsterFinance", uid), {
    takeRate, updated_at: serverTimestamp(), updated_by: firebaseAuth.currentUser.uid
  });
}

export async function saveAdministrators(uids, role, permissions, enabled) {
  if (!uids.length || uids.length > 25 || !["admin", "super_admin"].includes(role)) {
    throw new Error("Selecciona de 1 a 25 UID y un rol válido.");
  }
  if (uids.includes(firebaseAuth.currentUser.uid)) throw new Error("No puedes modificar tu propia ACL.");
  await runTransaction(db, async transaction => {
    const refs = uids.map(uid => doc(db, "platformAdmins", uid));
    // Reading each ACL makes concurrent assignments conflict instead of losing updates silently.
    await Promise.all(refs.map(ref => transaction.get(ref)));
    for (const ref of refs) transaction.set(ref, {
      enabled, role, permissions, updated_at: serverTimestamp(), updated_by: firebaseAuth.currentUser.uid
    });
  });
}

export async function moderateViewer(uid, status) {
  if (!["active", "suspended"].includes(status)) throw new Error("Estado de moderación inválido.");
  await runTransaction(db, async transaction => {
    const ref = doc(db, "users", uid);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().role !== "viewer") throw new Error("El viewer ya no está disponible.");
    transaction.update(ref, { status, moderated_at: serverTimestamp(), moderated_by: firebaseAuth.currentUser.uid });
    if (status === "suspended") transaction.set(doc(db, "viewerPresence", uid), {
      uid, is_online: false, last_active_at: serverTimestamp()
    });
  });
}

export async function reviewApplication(uid, approve) {
  await runTransaction(db, async transaction => {
    const applicationRef = doc(db, "tipsterApplications", uid);
    const snapshot = await transaction.get(applicationRef);
    if (!snapshot.exists() || snapshot.data().status !== "pending") throw new Error("La solicitud ya fue revisada.");
    const application = snapshot.data();
    if (approve) {
      const username = application.requested_username;
      if (!/^[a-z0-9_-]{3,30}$/.test(username)) throw new Error("El usuario solicitado no es válido.");
      const profileRef = doc(db, "perfiles", uid);
      const socialRef = doc(db, "perfiles_social", uid);
      const presenceRef = doc(db, "presencia", uid);
      const usernameRef = doc(db, "usernames", username);
      const [profile, social, presence, reservation] = await Promise.all([
        transaction.get(profileRef), transaction.get(socialRef), transaction.get(presenceRef), transaction.get(usernameRef)
      ]);
      if (reservation.exists() && reservation.data().uid !== uid) throw new Error("El usuario ya está reservado.");
      const current = profile.data() || {};
      if (!reservation.exists()) transaction.set(usernameRef, { uid });
      transaction.set(profileRef, {
        id: uid, username, nombre_publico: application.display_name, tipster_status: "approved",
        followerCount: current.followerCount ?? 0,
        ...(current.followerCountUpdatedBy ? { followerCountUpdatedBy: current.followerCountUpdatedBy } : {}),
        bio: current.bio || null, color_primario: current.color_primario || "#34d399",
        is_online: false, last_active_at: null, created_at: current.created_at || serverTimestamp()
      });
      const socialData = social.data() || {};
      transaction.set(socialRef, Object.fromEntries([
        "avatar_url", "banner_url", "kick_url", "twitch_url", "youtube_url", "telegram_url", "twitter_url", "instagram_url"
      ].map(field => [field, socialData[field] || null])));
      if (!presence.exists()) transaction.set(presenceRef, { uid, is_online: false, last_active_at: serverTimestamp() });
    }
    transaction.update(applicationRef, {
      status: approve ? "approved" : "rejected", reviewed_at: serverTimestamp(), reviewed_by: firebaseAuth.currentUser.uid
    });
  });
}

export async function reviewProfile(requestId, approve, reason) {
  if (!approve && (!reason.trim() || reason.trim().length > 500)) throw new Error("Escribe un motivo de rechazo de hasta 500 caracteres.");
  await runTransaction(db, async transaction => {
    const requestRef = doc(db, "perfilSolicitudes", requestId);
    const snapshot = await transaction.get(requestRef);
    if (!snapshot.exists() || snapshot.data().estado !== "pendiente") throw new Error("La solicitud ya fue revisada.");
    const request = snapshot.data();
    const reservationRef = doc(db, "perfilSolicitudesPendientes", request.uid);
    const reservation = await transaction.get(reservationRef);
    if (!reservation.exists() || reservation.data().solicitud_id !== requestId) throw new Error("La reserva no corresponde a esta solicitud.");
    if (approve) {
      const profileRef = doc(db, "perfiles", request.uid);
      const socialRef = doc(db, "perfiles_social", request.uid);
      const [profile, social] = await Promise.all([transaction.get(profileRef), transaction.get(socialRef)]);
      if (!profile.exists() || !social.exists() || profile.data().tipster_status !== "approved") {
        throw new Error("El perfil ya no está aprobado o está incompleto.");
      }
      const basic = ["username", "nombre_publico", "bio", "color_primario"];
      const socialFields = ["avatar_url", "banner_url", "kick_url", "twitch_url", "youtube_url", "telegram_url", "twitter_url", "instagram_url"];
      const basicChanges = Object.fromEntries(Object.entries(request.cambios).filter(([key]) => basic.includes(key)));
      const socialChanges = Object.fromEntries(Object.entries(request.cambios).filter(([key]) => socialFields.includes(key)));
      let usernameRefs;
      if (basicChanges.username && basicChanges.username !== profile.data().username) {
        const nextRef = doc(db, "usernames", basicChanges.username);
        const oldRef = doc(db, "usernames", profile.data().username);
        const [next, old] = await Promise.all([transaction.get(nextRef), transaction.get(oldRef)]);
        if (next.exists() && next.data().uid !== request.uid) throw new Error("El nuevo usuario ya está reservado.");
        usernameRefs = { nextRef, oldRef, old };
      }
      if (Object.keys(basicChanges).length) transaction.set(profileRef, { ...profile.data(), ...basicChanges });
      if (Object.keys(socialChanges).length) transaction.set(socialRef, { ...social.data(), ...socialChanges });
      if (usernameRefs) {
        transaction.set(usernameRefs.nextRef, { uid: request.uid });
        if (usernameRefs.old.exists()) transaction.delete(usernameRefs.oldRef);
      }
    }
    transaction.update(requestRef, {
      estado: approve ? "aprobada" : "rechazada", motivoRechazo: approve ? null : reason.trim(),
      revisado_at: serverTimestamp(), revisado_por: firebaseAuth.currentUser.uid
    });
    transaction.delete(reservationRef);
  });
}
