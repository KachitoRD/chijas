import { firebaseAuth, firebaseDb, firebaseConfigured } from "../services/firebase-config.js?v=2";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { watchAccountPermissions } from "../services/permissions.js";

export function mountAccountSettings(root) {
  const $ = id => root.querySelector(`#${id}`);
  let disposed = false, user = null, access = null, loaded = false, dirty = false, isSaving = false;
  let applicationLoaded = false, applicationStatus = null, applicationFormDirty = false, isSubmittingApplication = false;
  let stopData = null, stopApplication = null, stopPermissions = null, generation = 0;
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
  function renderTipsterApplication(messageText = null, isError = false) {
    const status = $("tipsterApplicationStatus");
    const form = $("tipsterApplicationForm");
    const button = $("applicationButton");
    if (messageText) {
      status.textContent = messageText;
      status.dataset.error = String(isError);
      form.hidden = true;
      return;
    }
    status.dataset.error = "false";
    if (!user || !access) {
      status.textContent = "Inicia sesión para solicitar acceso de tipster.";
      form.hidden = true;
      return;
    }
    if (access.suspended) {
      status.textContent = "Tu cuenta está suspendida. Contacta al administrador.";
      form.hidden = true;
      return;
    }
    if (access.canPublish || applicationStatus === "approved") {
      status.textContent = "Tu acceso de tipster ya está aprobado.";
      form.hidden = true;
      return;
    }
    if (access.tipsterStatus === "revoked") {
      status.textContent = "Tu acceso para publicar está desactivado. Contacta al administrador para restaurarlo.";
      form.hidden = true;
      return;
    }
    if (!applicationLoaded) {
      status.textContent = "Comprobando el estado de tu solicitud…";
      form.hidden = true;
      return;
    }
    if (applicationStatus === "pending") {
      status.textContent = "Tu solicitud está pendiente de revisión por el administrador.";
      form.hidden = true;
      return;
    }
    if (applicationStatus === "rejected") {
      status.textContent = "Tu solicitud anterior no fue aprobada. Puedes revisar los datos y volver a solicitar acceso.";
    } else {
      status.textContent = "Envía tu solicitud para que el administrador revise tu acceso de publicación. Tu cuenta seguirá como viewer hasta que la aprueben.";
    }
    form.hidden = false;
    button.disabled = !user.emailVerified || isSubmittingApplication;
    button.textContent = isSubmittingApplication ? "Enviando…" : "Enviar solicitud";
  }
  function fillTipsterApplicationDefaults() {
    if (!user || applicationFormDirty) return;
    $("applicationDisplayName").value = $("accountName").value || user.displayName || user.email?.split("@")[0] || "";
    $("applicationUsername").value = $("applicationDisplayName").value
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  }
  function subscribeTipsterApplication() {
    if (stopApplication) return;
    const current = generation;
    applicationLoaded = false;
    applicationStatus = null;
    renderTipsterApplication();
    stopApplication = onSnapshot(doc(firebaseDb, "tipsterApplications", user.uid), snapshot => {
      if (disposed || current !== generation) return;
      applicationLoaded = true;
      applicationStatus = snapshot.exists() ? snapshot.data().status || null : null;
      fillTipsterApplicationDefaults();
      renderTipsterApplication();
    }, error => {
      if (disposed || current !== generation) return;
      console.error("No se pudo cargar la solicitud de tipster:", error);
      stopApplication = null;
      applicationLoaded = false;
      renderTipsterApplication("No se pudo comprobar el estado de tu solicitud. Recarga la página para reintentar.", true);
    });
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
      fillTipsterApplicationDefaults();
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
  $("tipsterApplicationForm").addEventListener("input", () => {
    applicationFormDirty = true;
    $("tipsterApplicationFeedback").hidden = true;
  });
  $("tipsterApplicationForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!user?.emailVerified || !access || access.suspended || !applicationLoaded
      || access.canPublish || access.tipsterStatus === "revoked"
      || ["pending", "approved"].includes(applicationStatus)) {
      renderTipsterApplication("No se puede enviar la solicitud. Comprueba el estado de tu cuenta e inténtalo de nuevo.", true);
      return;
    }
    const displayName = $("applicationDisplayName").value.trim();
    const requestedUsername = $("applicationUsername").value.trim().toLowerCase();
    if (!displayName) {
      $("tipsterApplicationFeedback").textContent = "Escribe tu nombre público.";
      $("tipsterApplicationFeedback").hidden = false;
      $("applicationDisplayName").focus();
      return;
    }
    const current = generation;
    isSubmittingApplication = true;
    $("applicationButton").disabled = true;
    $("applicationButton").textContent = "Enviando…";
    $("tipsterApplicationFeedback").hidden = true;
    try {
      const viewerProfileSnapshot = await getDoc(doc(firebaseDb, "users", user.uid, "settings", "profile"));
      const viewerProfile = viewerProfileSnapshot.data() || {};
      await setDoc(doc(firebaseDb, "tipsterApplications", user.uid), {
        uid: user.uid,
        display_name: displayName,
        email: user.email || "",
        requested_username: requestedUsername,
        public_data: {
          bio: viewerProfile.bio?.trim() || null,
          avatar_url: viewerProfile.photoURL || null
        },
        status: "pending",
        submitted_at: serverTimestamp(),
        reviewed_at: null,
        reviewed_by: null
      });
      if (disposed || current !== generation) return;
      applicationStatus = "pending";
      applicationLoaded = true;
      renderTipsterApplication();
    } catch (error) {
      console.error("No se pudo enviar la solicitud de tipster:", error);
      if (disposed || current !== generation) return;
      $("tipsterApplicationFeedback").textContent = error.message || "No se pudo enviar la solicitud. Comprueba tu conexión e inténtalo de nuevo.";
      $("tipsterApplicationFeedback").hidden = false;
    } finally {
      if (!disposed && current === generation) {
        isSubmittingApplication = false;
        renderTipsterApplication();
      }
    }
  });
  const stopAuth = firebaseConfigured ? onAuthStateChanged(firebaseAuth, account => {
    generation++;
    if (stopData) stopData();
    if (stopApplication) stopApplication();
    if (stopPermissions) stopPermissions();
    stopData = stopApplication = stopPermissions = null;
    user = account;
    access = null;
    loaded = dirty = isSaving = false;
    applicationLoaded = isSubmittingApplication = false;
    applicationStatus = null;
    applicationFormDirty = false;
    $("accountSettingsFields").disabled = true;
    $("accountSettingsForm").reset();
    $("tipsterApplicationForm").reset();
    renderTipsterApplication();
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
      subscribeTipsterApplication();
      renderTipsterApplication();
    }, error => {
      console.error("No se pudieron comprobar los permisos de configuración:", error);
      access = null;
      if (stopData) stopData();
      stopData = null;
      $("accountSettingsFields").disabled = true;
      notice("No se pudo comprobar tu cuenta. Recarga para reintentar.", true);
      renderTipsterApplication("No se pudo comprobar tu cuenta. Recarga para reintentar.", true);
    });
  }, error => {
    console.error("No se pudo comprobar la sesión:", error);
    notice("No se pudo comprobar tu sesión. Recarga para reintentar.", true);
    renderTipsterApplication("No se pudo comprobar tu sesión. Recarga para reintentar.", true);
  }) : null;
  if (!firebaseConfigured) notice("Firebase no está configurado.", true);
  return () => {
    disposed = true;
    generation++;
    if (stopAuth) stopAuth();
    if (stopData) stopData();
    if (stopApplication) stopApplication();
    if (stopPermissions) stopPermissions();
  };
}
