import { firebaseDb } from "./firebase-config.js?v=2";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const operationalPermissions = ["tipsters", "profiles", "viewers", "kpis"];
export const adminPermissionOptions = [...operationalPermissions, "community"];

function resolvePermissions(user, admin, profile, account) {
  const suspended = account?.status !== undefined && account.status !== "active";
  const verified = Boolean(user && user.emailVerified && !user.isAnonymous && !suspended);
  const adminRole = admin && Object.hasOwn(admin, "role") ? admin.role : "super_admin";
  const isAdmin = verified && admin?.enabled === true
    && ["super_admin", "admin"].includes(adminRole);
  const tipsterStatus = profile?.tipster_status || null;
  const canPublish = verified && tipsterStatus === "approved";
  return {
    uid: user?.uid || null,
    role: !verified ? null : isAdmin ? adminRole : canPublish ? "tipster" : "viewer",
    isAdmin,
    isSuperAdmin: isAdmin && adminRole === "super_admin",
    permissions: isAdmin
      ? adminRole === "super_admin" ? [...adminPermissionOptions]
        : Object.hasOwn(admin, "permissions")
          ? Array.isArray(admin.permissions) ? admin.permissions.filter(key => adminPermissionOptions.includes(key)) : []
          : [...operationalPermissions]
      : [],
    canModerateCommunity: isAdmin && (adminRole === "super_admin"
      || (Array.isArray(admin?.permissions) && admin.permissions.includes("community"))),
    suspended,
    canPublish,
    tipsterStatus
  };
}

export async function getAccountPermissions(user) {
  if (!user || !user.emailVerified || user.isAnonymous) return resolvePermissions(user, null, null);
  const account = await getDoc(doc(firebaseDb, "users", user.uid));
  if (account.data()?.status !== undefined && account.data().status !== "active") return resolvePermissions(user, null, null, account.data());
  const [admin, profile] = await Promise.all([
    getDoc(doc(firebaseDb, "platformAdmins", user.uid)),
    getDoc(doc(firebaseDb, "perfiles", user.uid))
  ]);
  return resolvePermissions(user, admin.data(), profile.data(), account.data());
}

// This gate controls UI only; Firestore Rules independently enforce every operation.
export function watchAccountPermissions(user, onChange, onError) {
  if (!user || !user.emailVerified || user.isAnonymous) {
    onChange(resolvePermissions(user, null, null));
    return () => {};
  }
  const snapshots = new Map();
  const stops = [];
  let account = null;
  let identityStops = [];
  let active = true;
  const stop = () => {
    active = false;
    stops.forEach(unsubscribe => unsubscribe());
    identityStops.forEach(unsubscribe => unsubscribe());
  };
  function fail(error) {
    if (!active) return;
    stop();
    onError(error);
  }
  stops.push(onSnapshot(doc(firebaseDb, "users", user.uid), snapshot => {
    if (!active) return;
    account = snapshot.data();
    if (account?.status !== undefined && account.status !== "active") {
      identityStops.forEach(unsubscribe => unsubscribe());
      identityStops = [];
      snapshots.clear();
      onChange(resolvePermissions(user, null, null, account));
      return;
    }
    if (identityStops.length) {
      if (snapshots.size === 2) onChange(resolvePermissions(user, snapshots.get("admin"), snapshots.get("profile"), account));
      return;
    }
    for (const [key, collection] of [["admin", "platformAdmins"], ["profile", "perfiles"]]) {
      identityStops.push(onSnapshot(doc(firebaseDb, collection, user.uid), snapshot => {
      if (!active) return;
      snapshots.set(key, snapshot.data());
      if (snapshots.size === 2) {
        onChange(resolvePermissions(user, snapshots.get("admin"), snapshots.get("profile"), account));
      }
      }, fail));
    }
  }, fail));
  return stop;
}
