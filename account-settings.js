import { firebaseAuth, firebaseDb, firebaseConfigured } from "./firebase-config.js?v=2";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { watchAccountPermissions } from "./permissions.js";

export function mountAccountSettings(root) {
  const $ = id => root.querySelector(`#${id}`);
  let disposed = false, user = null, access = null, loaded = false, dirty = false, isSaving = false;
  let stopData = null, stopPermissions = null, generation = 0;
  function notice(text, error = false) {
    if (disposed) return;
    $("accountSettingsMessage").textContent = text;
    $("accountSettingsMessage").dataset.error = String(error);
  }
  function preview() {
    const img = $("accountAvatarPreview");
    const url = $("accountAvatar").value.trim();
    $("accountAvatarInitial").textContent = ($("accountName").value || "U").charAt(0).toUpperCase();
    img.hidden = true;
    $("accountAvatarInitial").hidden = false;
    if (!url.startsWith("https://")) { img.removeAttribute("src"); return; }
    if (img.getAttribute("src") !== url) img.src = url;
    else if (img.complete && img.naturalWidth) {
      img.hidden = false;
      $("accountAvatarInitial").hidden = true;
    }
  }
  $("accountAvatarPreview").addEventListener("load", () => {
    $("accountAvatarPreview").hidden = false;
    $("accountAvatarInitial").hidden = true;
  });
  $("accountAvatarPreview").addEventListener("error", () => {
    $("accountAvatarPreview").hidden = true;
    $("accountAvatarInitial").hidden = false;
    $("accountAvatarHint").textContent = "No se pudo cargar el avatar. Comprueba la URL; puedes guardar el resto de tu configuración.";
  });
  function canEdit() {
    return Boolean(user?.emailVerified && access && !access.suspended && loaded && !isSaving);
  }
  function subscribe() {
    if (stopData) stopData();
    const current = generation;
    $("retryAccountSettings").hidden = true;
    stopData = onSnapshot(doc(firebaseDb, "users", user.uid, "settings", "profile"), snapshot => {
      if (disposed || current !== generation) return;
      const initialLoad = !loaded;
      loaded = true;
      if (!dirty) {
        const data = snapshot.data() || {};
        $("accountName").value = data.displayName ?? user.displayName ?? "";
        $("accountAvatar").value = data.photoURL ?? user.photoURL ?? "";
        $("accountBio").value = data.bio ?? "";
        $("accountTheme").value = data.theme ?? "emerald";
        $("accountNotifications").checked = data.notifications ?? true;
        preview();
      }
      $("accountSettingsFields").disabled = !canEdit();
      if (initialLoad && !isSaving) {
        notice(user.emailVerified ? "Tu perfil base es privado por ahora; no se publica en el directorio de tipsters." : "Verifica tu correo para guardar cambios.");
      }
    }, error => {
      if (disposed || current !== generation) return;
      console.error("No se pudo cargar la configuración de perfil:", error);
      loaded = false;
      $("accountSettingsFields").disabled = true;
      $("retryAccountSettings").hidden = false;
      notice("No se pudo cargar tu configuración. Comprueba la conexión y reintenta.", true);
    });
  }
  $("retryAccountSettings").addEventListener("click", subscribe);
  $("accountSettingsForm").addEventListener("input", () => { dirty = true; preview(); });
  $("accountSettingsForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!canEdit()) { notice("No puedes guardar cambios. Comprueba tu sesión, correo y estado de cuenta.", true); return; }
    const photoURL = $("accountAvatar").value.trim();
    if (photoURL && (!photoURL.startsWith("https://") || !URL.canParse(photoURL))) {
      notice("El avatar debe ser una URL HTTPS válida.", true);
      $("accountAvatar").focus();
      return;
    }
    const displayName = $("accountName").value.trim();
    if (!displayName) { notice("Escribe tu nombre público.", true); $("accountName").focus(); return; }
    const current = generation;
    isSaving = true;
    $("accountSettingsFields").disabled = true;
    notice("Guardando configuración…");
    try {
      await setDoc(doc(firebaseDb, "users", user.uid, "settings", "profile"), {
        displayName, photoURL: photoURL || null, bio: $("accountBio").value.trim(),
        theme: $("accountTheme").value, notifications: $("accountNotifications").checked,
        updated_at: serverTimestamp()
      });
      if (disposed || current !== generation) return;
      dirty = false;
      notice("Configuración guardada.");
    } catch (error) {
      console.error("No se pudo guardar la configuración:", error);
      notice("No se pudo guardar. Comprueba la conexión y tus permisos e inténtalo de nuevo.", true);
    } finally {
      if (!disposed && current === generation) {
        isSaving = false;
        $("accountSettingsFields").disabled = !canEdit();
      }
    }
  });
  const stopAuth = firebaseConfigured ? onAuthStateChanged(firebaseAuth, account => {
    generation++;
    if (stopData) stopData();
    if (stopPermissions) stopPermissions();
    stopData = stopPermissions = null;
    user = account;
    access = null;
    loaded = dirty = isSaving = false;
    $("accountSettingsFields").disabled = true;
    $("accountSettingsForm").reset();
    preview();
    if (!account) { notice("Inicia sesión desde la vitrina para configurar tu perfil.", true); return; }
    stopPermissions = watchAccountPermissions(account, permissions => {
      access = permissions;
      if (permissions.suspended) {
        if (stopData) stopData();
        stopData = null;
        $("accountSettingsFields").disabled = true;
        notice("Tu cuenta está suspendida. Contacta al administrador.", true);
      } else if (!stopData) subscribe();
      else $("accountSettingsFields").disabled = !canEdit();
    }, error => {
      console.error("No se pudieron comprobar los permisos de configuración:", error);
      access = null;
      if (stopData) stopData();
      stopData = null;
      $("accountSettingsFields").disabled = true;
      notice("No se pudo comprobar tu cuenta. Recarga para reintentar.", true);
    });
  }, error => {
    console.error("No se pudo comprobar la sesión:", error);
    notice("No se pudo comprobar tu sesión. Recarga para reintentar.", true);
  }) : null;
  if (!firebaseConfigured) notice("Firebase no está configurado.", true);
  return () => {
    disposed = true;
    generation++;
    if (stopAuth) stopAuth();
    if (stopData) stopData();
    if (stopPermissions) stopPermissions();
  };
}
