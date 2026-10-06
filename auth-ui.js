import { firebaseAuth, firebaseDb } from "./firebase-config.js?v=2";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { signInGoogle } from "./google-sign-in.js";

const closingDialogs = new WeakMap();

export function closeAuthDialog(dialog) {
  if (!dialog.open) return Promise.resolve();
  if (closingDialogs.has(dialog)) return closingDialogs.get(dialog).finished;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    return Promise.resolve();
  }
  const animation = dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)"
  });
  const finished = new Promise(resolve => {
    animation.onfinish = () => {
      closingDialogs.delete(dialog);
      dialog.close();
      resolve();
    };
    animation.oncancel = () => {
      closingDialogs.delete(dialog);
      resolve();
    };
  });
  closingDialogs.set(dialog, { animation, finished });
  return finished;
}

export function installAuthModal({ dialog, visibilityTarget = null, title = "" }) {
  let outsidePointer = false;
  const outside = event => {
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  const canDismiss = () => !dialog.querySelector('button[aria-busy="true"], button:disabled[type="submit"]')
    && ![...dialog.querySelectorAll("input, textarea")].some(input =>
      ["checkbox", "radio"].includes(input.type) ? input.checked : input.value.length > 0);
  const dismiss = async () => {
    if (!canDismiss()) return;
    await closeAuthDialog(dialog);
    if (visibilityTarget) location.assign("./");
  };
  dialog.addEventListener("pointerdown", event => { outsidePointer = event.target === dialog && outside(event); });
  dialog.addEventListener("click", event => {
    if (outsidePointer && event.target === dialog && outside(event)) void dismiss();
    outsidePointer = false;
  });
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    void dismiss();
  });
  if (!visibilityTarget) return;
  const preview = document.createElement("div");
  preview.className = "auth-panel-preview";
  preview.setAttribute("aria-hidden", "true");
  preview.inert = true;
  const heading = document.createElement("h1");
  heading.textContent = title;
  const tabs = document.createElement("div");
  tabs.className = "auth-preview-tabs";
  for (const label of ["Resumen", "Actividad", "Perfil"]) {
    const tab = document.createElement("span");
    tab.textContent = label;
    tabs.append(tab);
  }
  const panel = document.createElement("div");
  panel.className = "auth-preview-panel";
  for (let index = 0; index < 6; index++) {
    const line = document.createElement("div");
    line.className = "auth-preview-line";
    panel.append(line);
  }
  preview.append(heading, tabs, panel);
  document.body.prepend(preview);
  function synchronize() {
    if (!visibilityTarget.classList.contains("hidden")) {
      closingDialogs.get(dialog)?.animation.cancel();
      preview.hidden = false;
      if (!dialog.open) dialog.showModal();
    } else {
      void closeAuthDialog(dialog).then(() => { preview.hidden = !dialog.open; });
    }
  }
  new MutationObserver(synchronize).observe(visibilityTarget, { attributes: true, attributeFilter: ["class"] });
  synchronize();
}

export function authErrorText(error) {
  const messages = {
    "auth/invalid-email": "Escribe un correo electrónico válido.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/email-already-in-use": "Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
    "auth/network-request-failed": "No hay conexión con Auth. Comprueba la red y los emuladores.",
    "auth/popup-closed-by-user": "Cerraste el acceso de Google. Puedes volver a intentarlo.",
    "auth/popup-blocked": "Permite ventanas emergentes para entrar con Google.",
    "auth/operation-not-allowed": "El operador debe habilitar este proveedor en Firebase Authentication."
  };
  return messages[error.code] || "No se pudo completar la operación. Comprueba la conexión y vuelve a intentarlo.";
}

export function installPasswordRecovery({ button, emailInput, showMessage }) {
  button.disabled = !firebaseAuth;
  button.addEventListener("click", async () => {
    emailInput.required = true;
    if (!emailInput.reportValidity()) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Enviando enlace...";
    try {
      await sendPasswordResetEmail(firebaseAuth, emailInput.value.trim());
      showMessage("Si ese correo tiene una cuenta, recibirás un enlace para restablecer la contraseña. Revisa también Spam.", true);
    } catch (error) {
      console.error("No se pudo recuperar la contraseña:", error);
      showMessage(authErrorText(error), false);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
}

export function installGoogleAccess({ button, showMessage }) {
  button.disabled = !firebaseAuth;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try { await signInGoogle(); }
    catch (error) {
      console.error("No se pudo entrar con Google:", error);
      showMessage(authErrorText(error), false);
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
    }
  });
}

export function installViewerAccess() {
  const dialog = document.getElementById("viewerAuth");
  const form = document.getElementById("viewerAuthForm");
  const byId = id => document.getElementById(id);
  let registration = false, busy = false, pending = null;
  const message = (text, success = false) => {
    byId("viewerAuthMessage").textContent = text;
    byId("viewerAuthMessage").className = `auth-message ${success ? "auth-success" : ""}`;
  };
  function setMode(register) {
    registration = register;
    byId("viewerAuthTitle").textContent = register ? "Crear tu cuenta" : "Entrar a Fijas";
    byId("viewerAuthSubmit").textContent = register ? "Crear cuenta" : "Iniciar sesión";
    byId("viewerAuthToggle").textContent = register ? "Ya tengo una cuenta" : "Crear cuenta";
    byId("viewerAuthRegistration").hidden = !register;
    byId("viewerAuthRegistration").disabled = !register;
    byId("viewerAuthPassword").autocomplete = register ? "new-password" : "current-password";
    message("");
  }
  function setBusy(value, activeButton = byId("viewerAuthSubmit")) {
    busy = value;
    form.querySelectorAll("button").forEach(button => {
      button.disabled = value;
      button.setAttribute("aria-busy", String(value && button === activeButton));
    });
  }
  async function complete(credential) {
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      await signOut(firebaseAuth);
      message("Verifica tu correo con el enlace que te enviamos y vuelve a iniciar sesión.", true);
      return;
    }
    const resolve = pending;
    pending = null;
    await closeAuthDialog(dialog);
    if (resolve) resolve(credential.user);
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    message("");
    let created = false;
    try {
      const email = byId("viewerAuthEmail").value.trim();
      const password = byId("viewerAuthPassword").value;
      if (registration) {
        const { user } = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        created = true;
        await updateProfile(user, { displayName: byId("viewerAuthName").value.trim() });
        await setDoc(doc(firebaseDb, "legalAcceptances", user.uid, "versions", "2026-10-03"), {
          uid: user.uid, terms_version: "2026-10-03", privacy_version: "2026-10-03",
          age_confirmed: true, accepted_at: serverTimestamp()
        });
        await sendEmailVerification(user);
        await signOut(firebaseAuth);
        byId("viewerAuthPassword").value = "";
        setMode(false);
        message("Cuenta creada. Verifica tu correo antes de iniciar sesión.", true);
      } else {
        await complete(await signInWithEmailAndPassword(firebaseAuth, email, password));
      }
    } catch (error) {
      console.error("No se pudo completar el acceso:", error);
      if (created && firebaseAuth.currentUser) {
        try { await signOut(firebaseAuth); }
        catch (signOutError) { console.error("No se pudo cerrar la cuenta pendiente:", signOutError); }
      }
      message(created ? "La cuenta se creó, pero no se completó el registro. Recupera tu contraseña, verifica tu correo y vuelve a entrar para completar la aceptación." : authErrorText(error));
    } finally { setBusy(false); }
  });
  byId("viewerAuthGoogle").addEventListener("click", async () => {
    setBusy(true, byId("viewerAuthGoogle"));
    try { await complete(await signInGoogle()); }
    catch (error) {
      console.error("No se pudo entrar con Google:", error);
      message(authErrorText(error));
    } finally { setBusy(false); }
  });
  installPasswordRecovery({ button: byId("viewerAuthReset"), emailInput: byId("viewerAuthEmail"), showMessage: message });
  byId("viewerAuthToggle").addEventListener("click", () => setMode(!registration));
  byId("viewerAuthCancel").addEventListener("click", () => dialog.close());
  installAuthModal({ dialog });
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    form.reset();
    if (pending) pending(null);
    pending = null;
  });
  return function openAccess() {
    if (dialog.open) return Promise.resolve(null);
    setMode(false);
    dialog.showModal();
    return new Promise(resolve => { pending = resolve; });
  };
}
