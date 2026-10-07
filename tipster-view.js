import { bankrollCurrencies, parseBankrollStake, parseCashOutReturn, pickFinancialResult, summarizeBankroll, eventDateRange, filterBankrollPicks, bankrollCSV, bankrollReportData } from "./bankroll.js";
import { openExecutiveBankrollReport } from "./bankroll-report.js";
import { installAuthModal, installGoogleAccess, installPasswordRecovery } from "./auth-ui.js";
import { installBusyButtons, showSkeleton } from "./ui-feedback.js";
import { getAccountPermissions, watchAccountPermissions } from "./permissions.js";
import { normalizePick, canonicalPick, summarizePerformance } from "./pick-schema.js";
import { firebaseAuth, firebaseConfigured, firebaseConfigError, firebaseDb } from "./firebase-config.js?v=2";
import { createUserWithEmailAndPassword, onAuthStateChanged as observeAuth, sendEmailVerification, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, onSnapshot as observeSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, where, limit, startAfter, endAt } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function mountTipsterView(root, { embedded = false } = {}) {
  const $ = id => root.querySelector(`#${CSS.escape(id)}`);
  const controller = new AbortController();
  const subscriptions = new Set();
  const intervals = new Set();
  const timeouts = new Set();
  let disposed = false;
  function listenDocument(type, handler, options = {}) {
    document.addEventListener(type, handler, { ...(typeof options === "boolean" ? { capture: options } : options), signal: controller.signal });
  }
  function listenWindow(type, handler, options = {}) {
    window.addEventListener(type, handler, { ...(typeof options === "boolean" ? { capture: options } : options), signal: controller.signal });
  }
  function onSnapshot(ref, next, error) {
    if (disposed) return () => {};
    const stop = observeSnapshot(ref, snapshot => { if (!disposed) next(snapshot); }, failure => { if (!disposed) error(failure); });
    subscriptions.add(stop);
    return () => { subscriptions.delete(stop); stop(); };
  }
  function onAuthStateChanged(auth, next, error) {
    const stop = observeAuth(auth, user => { if (!disposed) void next(user); }, failure => { if (!disposed) error(failure); });
    subscriptions.add(stop);
    return stop;
  }
  function setInterval(callback, delay) {
    if (disposed) return null;
    const id = window.setInterval(() => { if (!disposed) void callback(); }, delay);
    intervals.add(id);
    return id;
  }
  function setTimeout(callback, delay) {
    const id = window.setTimeout(() => { timeouts.delete(id); callback(); }, delay);
    timeouts.add(id);
    return id;
  }






const stopBusyButtons = installBusyButtons(root);
if (!embedded) installAuthModal({ dialog: $("tipsterAuth"), visibilityTarget: $("loginView"), title: "Panel de tipster" });
showSkeleton($("panelLoading"), { variant: "cards", label: "Comprobando acceso al panel" });





const TERMS_VERSION = "2026-10-03";
const PRIVACY_VERSION = "2026-10-03";
const profileFields = [
  ["kickUrl", "kick_url"], ["twitchUrl", "twitch_url"], ["youtubeUrl", "youtube_url"],
  ["telegramUrl", "telegram_url"], ["twitterUrl", "twitter_url"], ["instagramUrl", "instagram_url"]
];
const profileFieldLabels = {
  username: "Usuario",
  nombre_publico: "Nombre público",
  bio: "Descripción",
  color_primario: "Color de acento",
  avatar_url: "Foto de perfil",
  banner_url: "Banner",
  kick_url: "Kick",
  twitch_url: "Twitch",
  youtube_url: "YouTube",
  telegram_url: "Telegram",
  twitter_url: "X",
  instagram_url: "Instagram"
};
const pickColors = { pending: "text-amber-200 bg-amber-300/[.08] border-amber-300/15", won: "text-emerald-200 bg-emerald-300/[.08] border-emerald-300/15", lost: "text-rose-200 bg-rose-300/[.08] border-rose-300/15", void: "text-zinc-300 bg-white/[.04] border-white/[.08]" };
pickColors.cash_out = pickColors.anulada;
const bankrollRecords = new Map();
const bankrollSubscriptions = new Map();
const bankrollErrors = new Set();
let historyGeneration = 0, historyLoading = false, historyError = "", bankrollPage = 0;
let activeBankrollDates = { from: "", through: "" };
function bankrollSelection() {
  return filterBankrollPicks(currentPicks, {
    status: $("bankrollStatus").value, sport: $("bankrollSport").value, bookmaker: $("bankrollBookmaker").value
  });
}
function bankrollReady(picks) {
  return !historyLoading && !historyError && picks.every(pick => !bankrollErrors.has(pick.id)
    && bankrollRecords.has(pick.id)
    && (pick.status !== "cashed_out" || Number.isSafeInteger(bankrollRecords.get(pick.id)?.returnMinorUnits)));
}
function money(minorUnits, currency) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(minorUnits / 100);
}
function dashboardTable(headers, captionText) {
  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";
  wrapper.tabIndex = 0;
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", captionText);
  const table = document.createElement("table");
  table.className = "dashboard-table";
  const caption = table.createCaption();
  caption.textContent = captionText;
  const heading = table.createTHead().insertRow();
  for (const [label, numeric] of headers) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    if (numeric) cell.className = "numeric";
    heading.append(cell);
  }
  const body = table.createTBody();
  wrapper.append(table);
  return { wrapper, body };
}
function configurePickPopup(trigger, popup) {
  popup.setAttribute("popover", "auto");
  popup.setAttribute("role", "region");
  popup.setAttribute("aria-label", trigger.getAttribute("aria-label"));
  trigger.setAttribute("aria-controls", popup.id);
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("popovertarget", popup.id);
  trigger.addEventListener("pointerdown", () => popup.setAttribute("data-pointer-motion", ""));
  trigger.addEventListener("keydown", () => popup.removeAttribute("data-pointer-motion"));
  function positionPopup() {
    const rect = trigger.getBoundingClientRect();
    popup.style.left = `${Math.max(12, Math.min(rect.right - popup.offsetWidth, document.documentElement.clientWidth - popup.offsetWidth - 12))}px`;
    popup.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - popup.offsetHeight - 12))}px`;
    popup.style.setProperty("--popup-origin", `${Math.max(0, Math.min(rect.left + rect.width / 2 - parseFloat(popup.style.left), popup.offsetWidth))}px ${Math.max(0, Math.min(rect.bottom - parseFloat(popup.style.top), popup.offsetHeight))}px`);
  }
  popup.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    popup.removeAttribute("data-pointer-motion");
    event.preventDefault();
    event.stopPropagation();
    popup.hidePopover();
    trigger.focus({ preventScroll: true });
  });
  popup.addEventListener("toggle", event => {
    if (event.target !== popup) {
      if (popup.matches(":popover-open")) positionPopup();
      return;
    }
    const open = event.newState === "open";
    trigger.setAttribute("aria-expanded", String(open));
    if (!open) return;
    positionPopup();
    popup.querySelector("button,summary,input,select")?.focus({ preventScroll: true });
  }, true);
}
function renderBankrollSummary() {
  const target = $("bankrollSummary");
  target.replaceChildren();
  target.setAttribute("aria-busy", "false");
  const picks = bankrollSelection();
  const ready = bankrollReady(picks);
  $("bankrollExport").disabled = !ready || !picks.length;
  $("bankrollReport").disabled = !ready || !picks.length;
  $("bankrollPDF").disabled = !ready || !picks.length;
  if (!ready) {
    if (!historyError && (historyLoading || !picks.some(pick => bankrollErrors.has(pick.id)))) {
      showSkeleton(target, { variant: "metrics", label: "Cargando resumen privado" });
      return;
    }
    target.textContent = historyError || (historyLoading ? "Cargando el período completo..." : picks.some(pick => bankrollErrors.has(pick.id))
      ? "No se pudo cargar el registro privado completo. Recarga el panel para reintentar; no se muestran totales parciales."
      : "Cargando registros privados...");
    return;
  }
  target.setAttribute("aria-busy", "false");
  const totals = summarizeBankroll(picks, bankrollRecords);
  if (!totals.length) {
    target.textContent = "No hay picks con importe privado para los filtros seleccionados.";
    return;
  }
  const { wrapper, body } = dashboardTable([
    ["Moneda"], ["Picks", true], ["En riesgo", true], ["Retorno cerrado", true], ["Profit neto", true], ["Yield", true]
  ], "Totales del período y filtros activos · importes privados");
  for (const total of totals) {
    const row = body.insertRow();
    for (const [index, value] of [total.currency, String(total.count), money(total.risk, total.currency), money(total.returned, total.currency), money(total.profit, total.currency), total.yield === null ? "—" : `${total.yield.toFixed(2)}%`].entries()) {
      const cell = row.insertCell();
      cell.textContent = value;
      if (index > 0) cell.className = "numeric";
    }
  }
  target.append(wrapper);
}
const IMAGE_DATA_LIMITS = { avatar: 200 * 1024, banner: 200 * 1024 };
const IMAGE_DATA_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const WIDGET_FORMATS = new Set(["cascada", "compacto", "marcador"]);
let auth, db, currentUser = null, currentProfile = null, currentPicks = [], stopPicks = null, heartbeat = null, editingPickId = null, cropper = null, cropTarget = "avatar", croppedAvatar = null, croppedBanner = null, cropSourceUrl = null, isRegistrationMode = false, verificationFlowInProgress = false, currentMonthlyPickLimit = 50;
let selectedWidgetFormat = "cascada";
let stopFollowerCount = null;
let stopPermissions = null;

function stopTipsterTools() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (stopPicks) stopPicks();
  stopPicks = null;
  if (stopFollowerCount) stopFollowerCount();
  stopFollowerCount = null;
  for (const stop of bankrollSubscriptions.values()) stop();
  bankrollSubscriptions.clear();
  bankrollRecords.clear();
  currentPicks = [];
  currentProfile = null;
  historyGeneration++;
  $("myPicks").replaceChildren();
  $("bankrollSummary").replaceChildren();
  $("widgetPreviewFrame").src = "about:blank";
  $("followerMetric").classList.add("hidden");
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

function message(id, text, success = false) {
  const element = $(id);
  element.textContent = text;
  element.className = `rounded-lg border px-3 py-2.5 text-sm leading-5 ${success ? "border-emerald-300/15 bg-emerald-300/[.06] text-emerald-100" : "border-rose-300/15 bg-rose-300/[.06] text-rose-100"}`;
}
function clearMessage(id) {
  $(id).className = "hidden";
  $(id).textContent = "";
}
function setAuthMode(registration) {
  isRegistrationMode = registration;
  $("displayNameField").classList.toggle("hidden", !registration);
  $("registrationLegalFields").classList.toggle("hidden", !registration);
  $("accountDisplayName").required = registration;
  $("registrationAge").required = registration;
  $("registrationTerms").required = registration;
  $("accountDisplayName").autocomplete = registration ? "name" : "off";
  $("password").autocomplete = registration ? "new-password" : "current-password";
  $("authDescription").textContent = registration
    ? "Crea tu cuenta. Confirma tu correo antes de completar el perfil."
    : "Inicia sesión para administrar tu perfil y publicar pronósticos.";
  $("loginButton").textContent = registration ? "Crear cuenta" : "Iniciar sesión";
  $("authModePrompt").firstChild.textContent = registration ? "¿Ya tienes cuenta? " : "¿Aún no tienes cuenta? ";
  $("toggleAuthMode").textContent = registration ? "Iniciar sesión" : "Crear cuenta";
  $("authFootnote").textContent = registration
    ? "La verificación del correo es obligatoria para entrar al panel."
    : "Si no has confirmado el correo, intenta iniciar sesión y reenviaremos el enlace.";
  clearMessage("loginMessage");
}
function legalAcceptanceRef(uid) {
  return doc(db, "legalAcceptances", uid, "versions", TERMS_VERSION);
}
async function saveLegalAcceptance(user, ageCheckboxId, termsCheckboxId) {
  if (!$(ageCheckboxId).checked || !$(termsCheckboxId).checked) {
    throw new Error("Confirma la edad mínima y acepta los términos y el aviso de privacidad para continuar.");
  }
  await setDoc(legalAcceptanceRef(user.uid), {
    uid: user.uid,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    age_confirmed: true,
    accepted_at: serverTimestamp()
  });
}
function authErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Inicia sesión para reenviar el enlace de verificación si hace falta.",
    "auth/invalid-email": "Escribe un correo electrónico válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "No encontramos una cuenta con ese correo.",
    "auth/too-many-requests": "Hubo varios intentos. Espera un momento y vuelve a probar.",
    "auth/network-request-failed": "No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.",
    "auth/operation-not-allowed": "El administrador debe habilitar Correo electrónico/contraseña en Firebase Authentication."
  };
  return messages[error.code] || "No se pudo completar la operación. Comprueba la configuración de Firebase e inténtalo de nuevo.";
}
function localDateValue(value) {
  const date = value?.toDate?.() ?? (value ? new Date(value) : new Date());
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname ? url.href : "";
  } catch {
    return "";
  }
}
function safeImageUrl(value, maxDataLength = IMAGE_DATA_LIMITS.banner) {
  if (typeof value === "string" && value.length <= maxDataLength && IMAGE_DATA_PATTERN.test(value)) return value;
  return safeExternalUrl(value);
}
function updateImagePreviews() {
  const avatarSource = croppedAvatar || safeImageUrl($("avatarUrl").value.trim(), IMAGE_DATA_LIMITS.avatar);
  const bannerSource = croppedBanner || safeImageUrl($("bannerUrl").value.trim(), IMAGE_DATA_LIMITS.banner);
  if (avatarSource) $("avatarPreview").src = avatarSource;
  else $("avatarPreview").src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
  if (bannerSource) $("bannerPreview").src = bannerSource;
  else $("bannerPreview").src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
  $("avatarPreview").classList.toggle("hidden", !avatarSource);
  $("bannerPreview").classList.toggle("hidden", !bannerSource);
}
let presenceIntervalId = null;

async function initializePresence() {
  // Llamada única al abrir panel (si tipster está aprobado)
  if (!currentUser || !db) return;
  try {
    await setDoc(doc(db, "presencia", currentUser.uid), {
      uid: currentUser.uid,
      is_online: true,
      last_active_at: serverTimestamp()
    }, { merge: true });
    startPresenceInterval();
  } catch (error) {
    console.error("Error al inicializar presencia:", error);
  }
}

function startPresenceInterval() {
  // Actualizar last_active_at cada 60s si la pestaña es visible
  presenceIntervalId = setInterval(async () => {
    if (!currentUser || !db || document.visibilityState !== "visible") return;
    try {
      await setDoc(doc(db, "presencia", currentUser.uid), {
        last_active_at: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Error al actualizar presencia:", error);
    }
  }, 60000);
}

function handleVisibilityChange() {
  // visible: is_online=true + last_active_at
  // hidden: no escribir (umbral 5 min cubre cambios de pestaña)
  if (!currentUser || !db) return;

  if (document.visibilityState === "visible") {
    setDoc(doc(db, "presencia", currentUser.uid), {
      is_online: true,
      last_active_at: serverTimestamp()
    }, { merge: true }).catch(error => console.error("Error al restaurar presencia:", error));
  }
  // Si hidden: no hacer nada (último last_active_at sigue siendo válido)
}

async function setPresenceOffline() {
  // Llamada al cerrar sesión
  if (!currentUser || !db) return;
  try {
    await setDoc(doc(db, "presencia", currentUser.uid), {
      is_online: false
    }, { merge: true });
    if (presenceIntervalId) clearInterval(presenceIntervalId);
  } catch (error) {
    console.error("Error al desconectar presencia:", error);
  }
}

listenWindow("beforeunload", () => {
  // Best-effort: intenta escribir is_online=false
  if (currentUser && db) {
    setDoc(doc(db, "presencia", currentUser.uid), {
      is_online: false
    }, { merge: true }).catch(() => {});
  }
});

async function getAccountState(user) {
  const [permissions, applicationSnapshot, settingsSnapshot] = await Promise.all([
    getAccountPermissions(user),
    getDoc(doc(db, "tipsterApplications", user.uid)),
    getDoc(doc(db, "platformSettings", "limits"))
  ]);
  const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {};
  const result = {
    isAdmin: permissions.isAdmin,
    tipsterStatus: permissions.tipsterStatus,
    applicationStatus: applicationSnapshot.exists() ? applicationSnapshot.data().status || null : null,
    tipsterMonthlyPickLimit: settings.tipsterMonthlyPickLimit ?? 50
  };
  return result;
}
function showAccountGate(state, user) {
  $("tipsterTabs").classList.add("hidden");
  $("picksView").classList.add("hidden");
  $("widgetView").classList.add("hidden");
  $("profileView").classList.add("hidden");
  $("accountGate").classList.remove("hidden");
  $("presenceState").classList.add("hidden");
  $("dashboardTitle").textContent = "Tu cuenta";
  $("dashboardDescription").textContent = "Consulta el estado de tu cuenta y solicita publicar como tipster.";
  $("applicationDisplayName").value = user.displayName?.trim() || user.email?.split("@")[0] || "";
  $("applicationUsername").value = (user.displayName || user.email?.split("@")[0] || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  const pending = state.applicationStatus === "pending";
  const revoked = state.tipsterStatus === "revoked";
  $("accountGateCopy").textContent = revoked
    ? "El permiso para publicar pronósticos está desactivado. Contacta al creador de la plataforma si necesitas que lo restaure."
    : pending
      ? "Tu solicitud está pendiente de revisión por el creador de la plataforma. Te daremos acceso al panel de tipster cuando la apruebe."
      : state.applicationStatus === "rejected"
        ? "Tu solicitud anterior no fue aprobada. Puedes revisar los datos y volver a solicitar acceso."
        : "Tu cuenta puede consultar la plataforma. Para publicar pronósticos, solicita acceso de tipster y espera la aprobación del creador.";
  $("tipsterApplicationForm").classList.toggle("hidden", pending || revoked);
}
async function requestTipsterAccess(event) {
  event.preventDefault();
  const button = $("applicationButton");
  button.disabled = true;
  button.textContent = "Enviando...";
  clearMessage("applicationMessage");
  try {
    await setDoc(doc(db, "tipsterApplications", currentUser.uid), {
      uid: currentUser.uid,
      display_name: $("applicationDisplayName").value.trim(),
      email: currentUser.email || "",
      requested_username: $("applicationUsername").value.trim().toLowerCase(),
      status: "pending",
      submitted_at: serverTimestamp(),
      reviewed_at: null,
      reviewed_by: null
    });
    $("accountGateCopy").textContent = "Tu solicitud está pendiente de revisión por el creador de la plataforma. Te daremos acceso al panel de tipster cuando la apruebe.";
    $("tipsterApplicationForm").classList.add("hidden");
  } catch (error) {
    console.error("No se pudo enviar la solicitud de tipster:", error);
    message("applicationMessage", error.message || "No se pudo enviar la solicitud. Comprueba tu conexión e inténtalo de nuevo.");
  } finally {
    button.disabled = false;
    button.textContent = "Enviar solicitud";
  }
}
function fillProfile(profile, social) {
  profile = { ...profile, ...social };
  currentProfile = profile;
  const currentSummary = $("currentProfileSummary");
  currentSummary.replaceChildren();
  for (const field of Object.keys(profileFieldLabels)) {
    const value = profile[field];
    const displayValue = field === "avatar_url" || field === "banner_url"
      ? value?.startsWith("data:") ? "Imagen cargada" : value || "Sin configurar"
      : value || "Sin configurar";
    const row = document.createElement("div");
    const label = document.createElement("dt");
    label.className = "text-xs text-zinc-500";
    label.textContent = profileFieldLabels[field];
    const content = document.createElement("dd");
    content.className = "mt-0.5 break-words text-zinc-300";
    content.textContent = displayValue;
    row.append(label, content);
    currentSummary.append(row);
  }
  $("username").value = profile.username || "";
  $("displayName").value = profile.nombre_publico || "";
  $("bio").value = profile.bio || "";
  croppedAvatar = safeImageUrl(profile.avatar_url, IMAGE_DATA_LIMITS.avatar).startsWith("data:") ? profile.avatar_url : null;
  croppedBanner = safeImageUrl(profile.banner_url, IMAGE_DATA_LIMITS.banner).startsWith("data:") ? profile.banner_url : null;
  $("avatarUrl").value = croppedAvatar ? "" : safeImageUrl(profile.avatar_url, IMAGE_DATA_LIMITS.avatar);
  $("bannerUrl").value = croppedBanner ? "" : safeImageUrl(profile.banner_url, IMAGE_DATA_LIMITS.banner);
  $("primaryColor").value = /^#[0-9a-f]{6}$/i.test(profile.color_primario || "") ? profile.color_primario : "#34d399";
  for (const [elementId, field] of profileFields) $(elementId).value = profile[field] || "";
  $("publicProfileLink").href = `./?u=${encodeURIComponent(profile.username || "")}`;
  updateWidgetUrl(profile.username);
  updateImagePreviews();
}
function renderProfileRequest(profileRequest) {
  const status = $("profileRequestStatus");
  const details = $("profileRequestDetails");
  details.replaceChildren();
  if (!profileRequest) {
    status.textContent = "No tienes solicitudes de cambio anteriores.";
    status.className = "mt-2 text-sm text-zinc-400";
    $("saveProfileButton").disabled = false;
    return;
  }
  const statusLabels = {
    pendiente: "Tu solicitud está pendiente de revisión.",
    aprobada: "Tu solicitud fue aprobada y los cambios ya están publicados.",
    rechazada: "Tu solicitud fue rechazada."
  };
  status.textContent = profileRequest.estado === "rechazada" && profileRequest.motivoRechazo
    ? `${statusLabels[profileRequest.estado]} Motivo: ${profileRequest.motivoRechazo}`
    : statusLabels[profileRequest.estado] || "Estado de solicitud desconocido.";
  status.className = `mt-2 text-sm ${profileRequest.estado === "pendiente" ? "text-amber-200" : profileRequest.estado === "rechazada" ? "text-rose-200" : "text-zinc-400"}`;
  $("saveProfileButton").disabled = profileRequest.estado === "pendiente";
  for (const [field, value] of Object.entries(profileRequest.cambios || {})) {
    const row = document.createElement("div");
    const label = document.createElement("dt");
    label.className = "text-xs text-zinc-500";
    label.textContent = profileFieldLabels[field] || field;
    const content = document.createElement("dd");
    content.className = "mt-0.5 break-words text-zinc-300";
    content.textContent = field === "avatar_url" || field === "banner_url"
      ? value?.startsWith("data:") ? "Imagen cargada" : value || "Sin configurar"
      : value || "Sin configurar";
    row.append(label, content);
    details.append(row);
  }
}
function updateWidgetUrl(username) {
  const urlInput = $("widgetUrl");
  const openLink = $("openWidgetLink");
  if (!username) {
    urlInput.value = "";
    openLink.href = "overlay.html";
    $("widgetPreviewFrame").src = "about:blank";
    $("widgetPreviewEmpty").textContent = "Guarda tu perfil para cargar la vista previa.";
    $("widgetPreviewEmpty").classList.remove("hidden");
    return;
  }
  const url = new URL("overlay.html", window.location.href);
  url.searchParams.set("u", username);
  url.searchParams.set("formato", selectedWidgetFormat);
  urlInput.value = url.href;
  openLink.href = url.href;
  const previewFrame = $("widgetPreviewFrame");
  if (previewFrame.src !== url.href) {
    $("widgetPreviewEmpty").textContent = "Cargando vista previa…";
    $("widgetPreviewEmpty").classList.remove("hidden");
    previewFrame.src = url.href;
  }
}
async function submitProfileRequest(event) {
  event.preventDefault();
  const button = $("saveProfileButton");
  button.disabled = true;
  button.textContent = "Enviando solicitud...";
  clearMessage("profileMessage");

  try {
    // 1. Recopilar cambios propuestos
    const cambios = {};
    cambios.username = $("username").value.trim().toLowerCase();
    cambios.nombre_publico = $("displayName").value.trim();
    cambios.bio = $("bio").value.trim() || null;
    cambios.color_primario = $("primaryColor").value.trim().toLowerCase();
    cambios.avatar_url = croppedAvatar || $("avatarUrl").value.trim() || null;
    cambios.banner_url = croppedBanner || $("bannerUrl").value.trim() || null;

    // URLs sociales
    for (const [elementId, field] of profileFields) {
      const value = $(elementId).value.trim() || null;
      cambios[field] = value;
    }

    // 2. Validar cambios en cliente
    if (!cambios.username.match(/^[a-z0-9_-]{3,30}$/)) {
      throw new Error("Usuario: usa de 3 a 30 letras, números, guiones o guiones bajos.");
    }
    if (!cambios.nombre_publico || cambios.nombre_publico.length > 60) {
      throw new Error("Nombre público: requerido, máximo 60 caracteres.");
    }
    if (cambios.bio && cambios.bio.length > 280) {
      throw new Error("Descripción: máximo 280 caracteres.");
    }
    if (!cambios.color_primario || !cambios.color_primario.match(/^#[0-9a-f]{6}$/i)) {
      throw new Error("Color de acento: requerido, formato #RRGGBB.");
    }

    // Validar imágenes
    if (cambios.avatar_url && !safeImageUrl(cambios.avatar_url, IMAGE_DATA_LIMITS.avatar)) {
      throw new Error("Foto de perfil: URL HTTPS inválida o imagen Base64 demasiado grande.");
    }
    if (cambios.banner_url && !safeImageUrl(cambios.banner_url, IMAGE_DATA_LIMITS.banner)) {
      throw new Error("Banner: URL HTTPS inválida o imagen Base64 demasiado grande.");
    }

    // Validar URLs sociales
    for (const [, field] of profileFields) {
      if (cambios[field] && !safeExternalUrl(cambios[field])) {
        throw new Error(`${profileFieldLabels[field]}: URL HTTPS inválida.`);
      }
    }

    // 3. TRANSACCIÓN: Crear solicitud + reserva
    await runTransaction(db, async (transaction) => {
      const reservaRef = doc(db, "perfilSolicitudesPendientes", currentUser.uid);
      const reservaSnap = await transaction.get(reservaRef);

      if (reservaSnap.exists()) {
        throw new Error("Ya tienes una solicitud pendiente. Espera la revisión del administrador o rechazo para enviar otra.");
      }

      // Crear solicitud
      const solicitudRef = doc(collection(db, "perfilSolicitudes"));
      transaction.set(solicitudRef, {
        uid: currentUser.uid,
        cambios: cambios,
        estado: "pendiente",
        created_at: serverTimestamp(),
        revisado_at: null,
        revisado_por: null,
        motivoRechazo: null
      });

      // Crear reserva
      transaction.set(reservaRef, {
        uid: currentUser.uid,
        solicitud_id: solicitudRef.id,
        created_at: serverTimestamp()
      });
    });

    message("profileMessage", "Solicitud enviada ✓. El creador de la plataforma la revisará pronto.", true);
    button.textContent = "Enviar cambios";
    await loadProfile(); // Recarga para mostrar estado

  } catch (error) {
    console.error("Error al enviar solicitud de cambios:", error);
    message("profileMessage", error.message || "No se pudo enviar la solicitud. Intenta de nuevo.");
    button.disabled = false;
    button.textContent = "Enviar cambios";
  }
}
async function loadProfileRequest() {
  if (!currentUser) return;
  const uid = currentUser.uid;
  try {
    // Leer solicitud pendiente (si existe)
    const reservaSnap = await getDoc(doc(db, "perfilSolicitudesPendientes", uid));
    if (disposed || currentUser?.uid !== uid) return;

    if (!reservaSnap.exists()) {
      // No hay solicitud pendiente. Buscar última solicitud (aprobada o rechazada)
      const requestsSnap = await getDocs(
        query(collection(db, "perfilSolicitudes"), where("uid", "==", uid))
      );
      if (disposed || currentUser?.uid !== uid) return;

      if (!requestsSnap.empty) {
        // Ordenar en cliente por created_at descendente
        const requests = requestsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));

        renderProfileRequest(requests[0]); // Más reciente

        // Mostrar botón "Enviar nueva solicitud" si la última fue rechazada
        $("resubmitProfileButton").classList.toggle(
          "hidden",
          requests[0].estado !== "rechazada"
        );

        // Si está rechazada, permitir limpiar y reenviar
        if (requests[0].estado === "rechazada") {
          $("resubmitProfileButton").onclick = () => {
            renderProfileRequest(null);
            $("resubmitProfileButton").classList.add("hidden");
          };
        }
      } else {
        // Sin historial de solicitudes
        renderProfileRequest(null);
        $("resubmitProfileButton").classList.add("hidden");
      }
    } else {
      // Hay solicitud pendiente. Leer documento completo
      const solicitudSnap = await getDoc(
        doc(db, "perfilSolicitudes", reservaSnap.data().solicitud_id)
      );
      if (disposed || currentUser?.uid !== uid) return;

      if (solicitudSnap.exists()) {
        renderProfileRequest({ id: solicitudSnap.id, ...solicitudSnap.data() });
      } else {
        // CASO BORDE: Reserva existe pero solicitud no (huérfana)
        // Requiere limpieza manual desde tipster-dashboard.html o consola.
        console.warn("Reserva huérfana detectada para usuario:", currentUser.uid);
        renderProfileRequest(null);
      }

      // No mostrar botón "Enviar nueva" mientras hay solicitud pendiente
      $("resubmitProfileButton").classList.add("hidden");
    }
  } catch (error) {
    console.error("Error al cargar solicitud de perfil:", error);
  }
}
async function loadProfile() {
  const uid = currentUser.uid;
  const [profileSnapshot, socialSnapshot, presenceSnapshot] = await Promise.all([
    getDoc(doc(db, "perfiles", uid)),
    getDoc(doc(db, "perfiles_social", uid)),
    getDoc(doc(db, "presencia", uid))
  ]);
  if (disposed || currentUser?.uid !== uid) return;
  if (!profileSnapshot.exists()) throw new Error("No se encontró el perfil de esta cuenta.");
  const profile = profileSnapshot.data();
  if (stopFollowerCount) stopFollowerCount();
  $("followerMetric").classList.remove("hidden");
  $("followerCount").textContent = String(profile.followerCount ?? 0);
  stopFollowerCount = onSnapshot(doc(db, "perfiles", currentUser.uid), snapshot => {
    $("followerCount").textContent = snapshot.exists() ? String(snapshot.data().followerCount ?? 0) : "—";
  }, error => {
    console.error("No se pudo cargar el contador de seguidores:", error);
    $("followerCount").textContent = "—";
    message("profileMessage", "No se pudieron actualizar los seguidores. Recarga para reintentar.");
  });
  fillProfile(
    { ...profile, ...(presenceSnapshot.exists() ? presenceSnapshot.data() : {}) },
    socialSnapshot.exists() ? socialSnapshot.data() : {}
  );
  await loadProfileRequest();
}
function pickEventDate(pick) {
  return pick.event_date?.toDate?.() ?? (pick.event_date ? new Date(pick.event_date) : null);
}
function pickLockReason(pick, eventDate = pickEventDate(pick)) {
  if (String(pick.status || "pending").toLowerCase() !== "pending") return "pronóstico calificado";
  return eventDate && Number.isFinite(eventDate.getTime()) && eventDate.getTime() <= Date.now()
    ? "evento iniciado"
    : "";
}
function renderPicks() {
  let performance;
  try {
    performance = summarizePerformance(currentPicks);
  } catch (error) {
    console.error("No se pudo calcular el rendimiento:", error);
    historyError = error.message;
  }
  const metricStatus = historyError ? "No disponible" : historyLoading ? "Cargando…" : null;
  $("tipsterActivePicks").textContent = metricStatus || String(performance.active);
  $("tipsterWinRate").textContent = metricStatus || (performance.winRate === null ? "Sin resultados" : `${performance.winRate.toFixed(2)} %`);
  $("tipsterAverageOdds").textContent = metricStatus || (performance.averageOdds === null ? "Sin pronósticos" : performance.averageOdds.toFixed(2));
  $("tipsterYield").textContent = metricStatus || (performance.yield === null ? "Sin unidades cerradas" : `${performance.yield.toFixed(2)} %`);
  $("tipsterExcluded").textContent = metricStatus || `${performance.excludedFinancial} resultados sin unidades/retorno público, excluidos de ROI/Yield. Cash out no cuenta como ganado ni perdido.`;
  renderBankrollSummary();
  const filteredPicks = bankrollSelection();
  const pages = Math.max(1, Math.ceil(filteredPicks.length / 50));
  bankrollPage = Math.min(bankrollPage, pages - 1);
  $("bankrollPrevious").disabled = bankrollPage === 0 || historyLoading;
  $("bankrollNext").disabled = bankrollPage >= pages - 1 || historyLoading;
  $("bankrollPage").textContent = `Página ${bankrollPage + 1} de ${pages} · 50 por página`;
  $("myPicks").setAttribute("aria-busy", String(historyLoading));
  $("pickCount").textContent = `${filteredPicks.length} en el filtro`;
  const streamPickCount = filteredPicks.filter(pick => pick.show_on_stream === true).length;
  $("streamPickCount").textContent = `${streamPickCount} en OBS en el filtro`;
  const activePickCount = currentPicks.filter(pick => pick.status === "pending").length;
  const activeLimitMessage = activePickCount >= 50
    ? `Aviso: hay ${activePickCount} pronósticos activos en el período. El límite de 50 es orientativo y no bloquea publicaciones.`
    : `Pronósticos activos en el período: ${activePickCount}. El límite orientativo es 50 y no bloquea publicaciones.`;
  const pickLimitHint = $("pickLimitHint");
  pickLimitHint.className = `mt-1 whitespace-pre-line text-xs ${activePickCount >= 50 ? "text-amber-200" : "text-zinc-500"}`;
  pickLimitHint.textContent = `Límite orientativo: ${currentMonthlyPickLimit} publicaciones al mes. En el plan gratuito no se bloquea automáticamente.\n${activeLimitMessage}`;
  const list = $("myPicks");
  list.replaceChildren();
  if (historyLoading && !filteredPicks.length) {
    showSkeleton(list, { label: "Cargando historial del período" });
    return;
  }
  if (!filteredPicks.length) {
    const empty = document.createElement("p");
    empty.className = "rounded-xl border border-dashed border-white/[.12] px-4 py-8 text-center text-sm text-zinc-500";
    empty.textContent = historyError || (historyLoading ? "Cargando el historial del período..." : "No hay pronósticos para este período y filtros. Ajusta el rango para ver eventos futuros o anteriores.");
    list.append(empty);
    return;
  }
  const { wrapper, body } = dashboardTable([
    ["Evento"], ["Selección"], ["Deporte"], ["Fecha del evento"], ["Casa de apuestas"], ["Confianza", true],
    ["Estado"], ["Cuota", true], ["Monto privado", true],
    ["Retorno", true], ["Ganancia / pérdida", true], ["Yield", true], ["Widget OBS"], ["Acciones"]
  ], "Picks del período y filtros activos · información financiera solo para ti");
  list.append(wrapper);
  for (const pick of filteredPicks.slice(bankrollPage * 50, (bankrollPage + 1) * 50)) {
    const status = String(pick.status || "pending").toLowerCase();
    const color = pickColors[status] || pickColors.pendiente;
    const timestamp = pickEventDate(pick);
    const lockReason = pickLockReason(pick, timestamp);
    const pickLocked = Boolean(lockReason);
    const date = timestamp && Number.isFinite(timestamp.getTime()) ? new Intl.DateTimeFormat(navigator.language || "es", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "";
    const row = body.insertRow();
    const details = row.insertCell();
    details.className = "pick-description";
    const headline = document.createElement("div");
    headline.className = "flex flex-wrap items-center gap-2";
    const event = document.createElement("h3");
    event.className = "font-semibold";
    event.textContent = `${pick.destacada ? "Destacada · " : ""}${pick.event || ""}`;
    headline.append(event);
    if (pickLocked) {
      const lockBadge = document.createElement("span");
      lockBadge.className = "pick-lock-badge rounded-full border border-amber-300/20 bg-amber-300/[.07] px-2 py-1 text-[11px] font-semibold text-amber-100";
      lockBadge.textContent = `Bloqueado: ${lockReason}`;
      lockBadge.setAttribute("role", "status");
      headline.append(lockBadge);
    }
    details.append(headline);
    const selection = row.insertCell();
    selection.className = "pick-description text-zinc-300";
    selection.textContent = pick.selection || pick.selection || "Sin selección";
    const noteButton = document.createElement("button");
    noteButton.type = "button";
    noteButton.className = "control mt-2 block min-h-11 rounded-lg border border-white/10 px-3 text-xs";
    noteButton.textContent = "Ver nota";
    noteButton.setAttribute("aria-label", `Nota de ${pick.event || ""}`);
    const notePopup = document.createElement("div");
    notePopup.id = `note-${pick.id}`;
    notePopup.className = "pick-action-popup pick-note-popup";
    const noteTitle = document.createElement("p");
    noteTitle.className = "mb-3 font-semibold break-words";
    noteTitle.textContent = pick.event || "Nota del pick";
    const noteContent = document.createElement("p");
    noteContent.className = "mb-3 text-sm leading-6 text-zinc-300";
    noteContent.style.whiteSpace = "pre-wrap";
    noteContent.style.overflowWrap = "anywhere";
    noteContent.textContent = pick.analysis || "Este pick no tiene nota.";
    const closeNote = document.createElement("button");
    closeNote.type = "button";
    closeNote.className = "control rounded-lg border border-white/10 px-3 text-xs";
    closeNote.textContent = "Cerrar nota";
    closeNote.setAttribute("popovertarget", notePopup.id);
    closeNote.setAttribute("popovertargetaction", "hide");
    notePopup.append(noteTitle, noteContent, closeNote);
    selection.append(noteButton, notePopup);
    configurePickPopup(noteButton, notePopup);
    const bookmaker = pick.bookmaker || pick.bookmaker || "";
    const bookmakerOption = [...$("bookmaker").options].find(option => option.value === bookmaker);
    const sportOption = [...$("sport").options].find(option => option.value === pick.sport);
    for (const [index, text] of [
      sportOption?.textContent || pick.sport || "Sin deporte",
      date || "Sin fecha",
      bookmakerOption?.textContent || bookmaker || "Sin indicar",
      pick.confianza ? `${pick.confianza}/5` : "Sin indicar"
    ].entries()) {
      const detail = row.insertCell();
      detail.className = index === 3 ? "numeric" : "text-xs text-zinc-300";
      detail.textContent = text;
    }
    const statusBadge = document.createElement("span");
    statusBadge.className = `rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`;
    statusBadge.textContent = status === "cashed_out" ? "Cierre anticipado" : status[0].toUpperCase() + status.slice(1);
    row.insertCell().append(statusBadge);
    const oddsCell = row.insertCell();
    oddsCell.className = "numeric";
    oddsCell.textContent = Number(pick.odds || 0).toFixed(2);
    const financial = bankrollRecords.get(pick.id);
    let values;
    if (bankrollErrors.has(pick.id)) values = ["Error de carga", "—", "—", "—"];
    else if (!bankrollRecords.has(pick.id) || (status === "cashed_out" && !Number.isSafeInteger(financial?.returnMinorUnits))) values = ["Cargando...", "—", "—", "—"];
    else if (!financial) values = ["Sin registro", "—", "—", "—"];
    else {
      const result = pickFinancialResult(pick, financial);
      values = [
        money(result.stake, result.currency),
        result.returned === null ? "Pendiente" : money(result.returned, result.currency),
        result.profit === null ? "Pendiente" : money(result.profit, result.currency),
        result.yield === null ? "—" : `${result.yield.toFixed(2)}%`
      ];
    }
    for (const value of values) {
      const cell = row.insertCell();
      cell.className = "numeric";
      cell.textContent = value;
    }
    const streamCell = row.insertCell();
    const actions = row.insertCell();
    actions.className = "pick-actions";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "pick-action-trigger control";
    trigger.setAttribute("aria-label", `Acciones de ${pick.event || ""}: ${pick.selection || pick.selection || ""}`);
    trigger.setAttribute("aria-expanded", "false");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "20");
    icon.setAttribute("height", "20");
    icon.setAttribute("aria-hidden", "true");
    for (const cy of [5, 12, 19]) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", "12");
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "2");
      dot.setAttribute("fill", "currentColor");
      icon.append(dot);
    }
    trigger.append(icon);
    const popup = document.createElement("div");
    popup.id = `actions-${pick.id}`;
    popup.className = "pick-action-popup";
    const context = document.createElement("p");
    context.className = "mb-3 text-sm font-semibold break-words";
    context.textContent = `${pick.event || ""} · ${pick.selection || pick.selection || ""}`;
    const controls = document.createElement("div");
    controls.className = "flex flex-col gap-2";
    popup.append(context, controls);
    actions.append(trigger, popup);
    configurePickPopup(trigger, popup);

    const streamLabel = document.createElement("label");
    streamLabel.className = "flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]";
    const streamInput = document.createElement("input");
    streamInput.type = "checkbox";
    streamInput.dataset.action = "stream";
    streamInput.dataset.id = pick.id;
    streamInput.setAttribute("aria-label", `Mostrar ${pick.event || ""} en el widget`);
    streamInput.className = "h-4 w-4 accent-emerald-300";
    streamInput.checked = pick.show_on_stream === true;
    streamInput.disabled = pickLocked;
    const streamText = document.createElement("span");
    streamText.textContent = "En stream";
    streamLabel.append(streamInput, streamText);
    streamCell.append(streamLabel);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.dataset.id = pick.id;
    editButton.className = "control min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]";
    editButton.textContent = "Editar";
    editButton.disabled = pickLocked;

    const statusLabel = document.createElement("label");
    statusLabel.className = "label";
    statusLabel.htmlFor = `status-${pick.id}`;
    statusLabel.textContent = "Nuevo estado";
    const statusSelect = document.createElement("select");
    statusSelect.id = `status-${pick.id}`;
    statusSelect.dataset.action = "status";
    statusSelect.dataset.id = pick.id;
    statusSelect.className = "control min-h-9 rounded-lg border border-white/10 bg-[#09090b] px-2.5 text-xs font-semibold text-zinc-300";
    statusSelect.disabled = status !== "pending";
    for (const [value, label] of [["pending", "Pendiente"], ["won", "Ganada"], ["lost", "Perdida"], ["void", "Anulada"], ["cashed_out", "Cierre anticipado"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = status === value;
      option.disabled = value === "cashed_out";
      statusSelect.append(option);
    }
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.id = pick.id;
    deleteButton.className = "control min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-400 hover:border-rose-300/20 hover:text-rose-200";
    deleteButton.textContent = "Eliminar";
    deleteButton.disabled = pickLocked;
    const statusPanel = document.createElement("details");
    const statusSummary = document.createElement("summary");
    statusSummary.textContent = "Cambiar estado / Anular";
    statusPanel.append(statusSummary, statusLabel, statusSelect);
    controls.append(editButton, statusPanel);
    if (bankrollRecords.has(pick.id) && !bankrollErrors.has(pick.id)) {
      const cashOutPanel = document.createElement("details");
      const cashOutSummary = document.createElement("summary");
      cashOutSummary.textContent = "Cerrar anticipadamente (Cash out)";
      cashOutPanel.append(cashOutSummary);
      const cashOutForm = document.createElement("form");
      cashOutForm.className = "mt-4 flex flex-col gap-2 border-t border-white/10 pt-3";
      cashOutForm.dataset.cashOutId = pick.id;
      cashOutForm.setAttribute("aria-label", `Cierre anticipado de ${pick.event || ""}: ${pick.selection || pick.selection || ""}`);
      const label = document.createElement("label");
      label.className = "label";
      label.htmlFor = `cashout-${pick.id}`;
      label.textContent = `Retorno privado recibido (${financial?.currency || ""}), incluido el capital`;
      const input = document.createElement("input");
      input.id = label.htmlFor;
      input.name = "returnAmount";
      input.className = "input";
      input.type = "number";
      input.min = "0";
      input.max = "1000000000";
      input.step = "0.01";
      input.required = Boolean(financial);
      input.inputMode = "decimal";
      input.disabled = status !== "pending" || !financial;
      if (status === "cashed_out" && financial) input.value = financial.returned / 100;
      const group = document.createElement("div");
      group.className = "min-w-0 flex-1";
      group.append(label, input);
      group.hidden = !financial;
      const publicLabel = document.createElement("label");
      publicLabel.className = "label";
      publicLabel.htmlFor = `cashout-odds-${pick.id}`;
      publicLabel.textContent = "Retorno público / stake (multiplicador, incluido capital; 0 = pérdida total)";
      const publicInput = document.createElement("input");
      publicInput.id = publicLabel.htmlFor;
      publicInput.name = "cashoutOdds";
      publicInput.className = "input";
      publicInput.type = "number";
      publicInput.min = "0";
      publicInput.max = "1000";
      publicInput.step = "0.0001";
      publicInput.required = true;
      publicInput.disabled = status !== "pending";
      if (status === "cashed_out") publicInput.value = pick.cashout_odds ?? "";
      const submit = document.createElement("button");
      submit.className = "control min-h-11 rounded-lg border border-white/10 px-3 text-sm font-semibold";
      submit.textContent = status === "cashed_out" ? "Actualizar retorno privado" : "Registrar cierre anticipado";
      submit.disabled = status !== "pending";
      cashOutForm.append(publicLabel, publicInput, group, submit);
      cashOutPanel.append(cashOutForm);
      controls.append(cashOutPanel);
    } else {
      const hint = document.createElement("p");
      hint.className = "text-xs leading-5 text-zinc-400";
      hint.textContent = bankrollErrors.has(pick.id)
        ? "No se pudo cargar el monto privado. Recarga el panel antes de registrar un cierre anticipado."
        : !bankrollRecords.has(pick.id)
          ? "Cargando el monto privado para el cierre anticipado..."
          : "Recarga el historial antes de registrar el cierre anticipado.";
      controls.append(hint);
    }
    controls.append(deleteButton);
  }
}
let renderQueued = false;
function schedulePicksRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (currentUser) renderPicks();
  });
}
function synchronizeBankrollRecords() {
    const ids = new Set(currentPicks.map(pick => pick.id));
    for (const [id, stop] of bankrollSubscriptions) {
      if (!ids.has(id)) {
        stop();
        bankrollSubscriptions.delete(id);
        bankrollRecords.delete(id);
        bankrollErrors.delete(id);
      }
    }
    for (const pick of currentPicks) {
      if (bankrollSubscriptions.has(pick.id)) continue;
      const generation = historyGeneration;
      bankrollSubscriptions.set(pick.id, onSnapshot(doc(db, "picks", pick.id, "private", "bankroll"), financial => {
        if (generation !== historyGeneration) return;
        bankrollRecords.set(pick.id, financial.exists() ? financial.data() : null);
        bankrollErrors.delete(pick.id);
        schedulePicksRender();
      }, error => {
        if (generation !== historyGeneration) return;
        console.error("No se pudo sincronizar el registro privado:", error);
        bankrollErrors.add(pick.id);
        schedulePicksRender();
      }));
    }
    schedulePicksRender();
}
function setCurrentMonth() {
  const now = new Date();
  const localDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  $("bankrollFrom").value = localDay(new Date(now.getFullYear(), now.getMonth(), 1));
  $("bankrollThrough").value = localDay(now);
}
for (const [sourceId, targetId] of [["sport", "bankrollSport"], ["bookmaker", "bankrollBookmaker"]]) {
  for (const option of $(sourceId).options) $(targetId).append(option.cloneNode(true));
}
async function subscribeToPicks() {
  if (stopPicks) stopPicks();
  for (const stop of bankrollSubscriptions.values()) stop();
  bankrollSubscriptions.clear();
  bankrollRecords.clear();
  bankrollErrors.clear();
  currentPicks = [];
  bankrollPage = 0;
  historyLoading = true;
  historyError = "";
  const generation = ++historyGeneration;
  const stops = [];
  stopPicks = () => {
    if (generation === historyGeneration) historyGeneration++;
    stops.forEach(stop => stop());
  };
  renderPicks();
  if (!currentUser) {
    historyLoading = false;
    return;
  }
  const uid = currentUser.uid;
  const chunks = new Map();
  const pendingChunks = new Set();
  let discoveryComplete = false;
  function fail(error) {
    if (generation !== historyGeneration) return;
    console.error("No se pudo cargar el historial financiero:", error);
    historyLoading = false;
    historyError = error.code === "failed-precondition"
      ? "Falta el índice del historial. Publica firestore.indexes.json y espera a que el índice esté listo."
      : `No se pudo cargar el período completo: ${error.message}. Pulsa Actualizar historial para reintentar.`;
    stopPicks();
    for (const stop of bankrollSubscriptions.values()) stop();
    $("bankrollLoadMessage").textContent = historyError;
    schedulePicksRender();
  }
  try {
    if ($("bankrollPeriod").value === "month") setCurrentMonth();
    activeBankrollDates = { from: $("bankrollFrom").value, through: $("bankrollThrough").value };
    const { start, end } = eventDateRange(activeBankrollDates.from, activeBankrollDates.through);
    let index = 0, loaded = 0;
    // Keep old documents intact: each date schema has its own indexed cursor intervals.
    for (const dateField of ["event_date", "fecha_evento", "event_start_at"]) {
    const base = [
      where("user_id", "==", uid), where(dateField, ">=", start),
      where(dateField, "<", end), orderBy(dateField, "desc")
    ];
    let cursor = null;
    do {
      const pageConstraints = cursor ? [...base, startAfter(cursor)] : [...base];
      const page = await getDocs(query(collection(db, "picks"), ...pageConstraints, limit(100)));
      if (generation !== historyGeneration || currentUser?.uid !== uid) return;
      loaded += page.size;
      $("bankrollLoadMessage").textContent = `Cargando período completo: ${loaded} picks encontrados...`;
      const boundary = page.size === 100 ? page.docs[page.size - 1] : null;
      const chunkIndex = index++;
      pendingChunks.add(chunkIndex);
      // Fixed cursor intervals prevent gaps when live inserts move page boundaries.
      const liveQuery = query(collection(db, "picks"), ...pageConstraints, ...(boundary ? [endAt(boundary)] : []));
      stops.push(onSnapshot(liveQuery, snapshot => {
        if (generation !== historyGeneration || historyError) return;
        try {
          chunks.set(chunkIndex, snapshot.docs.map(item => normalizePick({ id: item.id, ...item.data() })));
        } catch (error) { fail(error); return; }
        pendingChunks.delete(chunkIndex);
        currentPicks = [...new Map([...chunks.values()].flat().map(pick => [pick.id, pick])).values()]
          .filter(pick => pick.event_date.toDate() >= start && pick.event_date.toDate() < end)
          .sort((a, b) => b.event_date.toMillis() - a.event_date.toMillis() || b.id.localeCompare(a.id));
        historyLoading = !discoveryComplete || pendingChunks.size > 0;
        if (!historyLoading) $("bankrollLoadMessage").textContent = `${currentPicks.length} picks del período completo. Exportación disponible al terminar de cargar los registros privados.`;
        synchronizeBankrollRecords();
      }, fail));
      cursor = boundary;
    } while (cursor);
    }
    discoveryComplete = true;
    historyLoading = pendingChunks.size > 0;
    if (!historyLoading) $("bankrollLoadMessage").textContent = `${currentPicks.length} picks del período completo.`;
    schedulePicksRender();
  } catch (error) {
    fail(error);
  }
}
const filterSummary = $("bankrollFilterPanel").querySelector("summary");
filterSummary.addEventListener("pointerdown", () => $("bankrollFilterPanel").setAttribute("data-pointer-motion", ""));
filterSummary.addEventListener("keydown", () => $("bankrollFilterPanel").removeAttribute("data-pointer-motion"));
$("bankrollFilters").addEventListener("change", event => {
  bankrollPage = 0;
  if (["bankrollPeriod", "bankrollFrom", "bankrollThrough"].includes(event.target.id)) {
    const custom = $("bankrollPeriod").value === "custom";
    $("bankrollFrom").disabled = !custom;
    $("bankrollThrough").disabled = !custom;
    subscribeToPicks();
  } else renderPicks();
});
$("bankrollReload").addEventListener("click", subscribeToPicks);
$("bankrollPrevious").addEventListener("click", () => { bankrollPage--; renderPicks(); });
$("bankrollNext").addEventListener("click", () => { bankrollPage++; renderPicks(); });
function downloadBankroll(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function exportBankroll(summaryOnly, format = "csv") {
  try {
    const picks = bankrollSelection();
    if (!bankrollReady(picks) || !picks.length) throw new Error("Espera a que se cargue el período completo y sus importes privados antes de exportar.");
    const filters = { ...activeBankrollDates, status: $("bankrollStatus").value,
      sport: $("bankrollSport").value, bookmaker: $("bankrollBookmaker").value };
    const filename = `bankroll-${summaryOnly ? "resumen" : "detalle"}-${filters.from}-${filters.through}.${format}`;
    if (format === "pdf") {
      const report = bankrollReportData(picks, bankrollRecords, filters);
      const labels = Object.fromEntries([["status", "bankrollStatus"], ["sport", "bankrollSport"], ["bookmaker", "bankrollBookmaker"]]
        .map(([key, id]) => [key, $(id).selectedOptions[0].textContent]));
      openExecutiveBankrollReport(report, {
        tipster: currentProfile?.nombre_publico || currentProfile?.username || currentUser.displayName || "",
        labels
      });
    } else {
      const csv = bankrollCSV(picks, bankrollRecords, filters, summaryOnly);
      downloadBankroll(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
    }
    $("bankrollLoadMessage").textContent = format === "pdf"
      ? "Vista previa abierta. Selecciona Guardar como PDF en el diálogo de impresión. Contiene importes privados."
      : "Reporte generado con los filtros activos. Contiene importes privados: compártelo solo si lo deseas.";
  } catch (error) {
    console.error("No se pudo exportar el bankroll:", error);
    $("bankrollLoadMessage").textContent = error.message;
  }
}
$("bankrollExport").addEventListener("click", () => exportBankroll(false));
$("bankrollReport").addEventListener("click", () => exportBankroll(true));
$("bankrollPDF").addEventListener("click", () => exportBankroll(true, "pdf"));
function resetPickForm() {
  $("pickForm").reset();
  $("confidence").value = "4";
  $("eventDate").value = localDateValue();
  $("featured").checked = false;
  editingPickId = null;
  $("pickFormTitle").textContent = "Publicar pronóstico";
  $("pickFormHint").textContent = "Completa los datos del evento y tu selección.";
  $("savePickButton").textContent = "Publicar pronóstico";
  $("savePickButton").disabled = false;
  $("cancelEditButton").classList.add("hidden");
  clearMessage("pickMessage");
  $("stakeAmount").disabled = false;
  $("stakeCurrency").disabled = false;
}
for (const currency of bankrollCurrencies) {
  const option = document.createElement("option");
  option.value = currency.code;
  option.textContent = currency.label;
  $("stakeCurrency").append(option);
}
async function beginEdit(pick) {
  const lockReason = pickLockReason(pick);
  if (lockReason) {
    message("pickMessage", `Este pronóstico está bloqueado: ${lockReason}.`);
    return;
  }
  editingPickId = pick.id;
  $("sport").value = pick.sport || "";
  $("odds").value = pick.odds || "";
  $("event").value = pick.event || "";
  $("league").value = pick.league || "";
  $("market").value = pick.market || "";
  $("publicStake").value = pick.stake ?? "";
  $("selection").value = pick.selection || pick.selection || "";
  $("bookmaker").value = pick.bookmaker || pick.bookmaker || "";
  $("confidence").value = pick.confianza ? String(pick.confianza) : "";
  $("eventDate").value = localDateValue(pick.event_date);
  $("note").value = pick.analysis || "";
  $("featured").checked = Boolean(pick.destacada);
  $("pickFormTitle").textContent = "Editar pronóstico";
  $("pickFormHint").textContent = "Guarda los cambios para actualizar tu publicación.";
  $("savePickButton").textContent = "Guardar cambios";
  $("cancelEditButton").classList.remove("hidden");
  clearMessage("pickMessage");
  $("stakeAmount").value = "";
  $("stakeCurrency").value = bankrollCurrencies[0].code;
  $("stakeAmount").disabled = true;
  $("stakeCurrency").disabled = true;
  $("savePickButton").disabled = true;
  $("pickForm").scrollIntoView({ behavior: "smooth", block: "start" });
  $("sport").focus({ preventScroll: true });
  try {
    const snapshot = await getDoc(doc(db, "picks", pick.id, "private", "bankroll"));
    if (editingPickId !== pick.id) return;
    if (snapshot.exists()) {
      $("stakeAmount").value = snapshot.data().stakeAmount;
      $("stakeCurrency").value = snapshot.data().currency;
      if (!$("stakeCurrency").value) throw new Error("La moneda de este registro no está configurada. No se guardaron cambios.");
    }
    $("stakeAmount").disabled = false;
    $("stakeCurrency").disabled = false;
    $("savePickButton").disabled = false;
  } catch (error) {
    console.error("No se pudo cargar el registro financiero privado:", error);
    if (editingPickId === pick.id) {
      message("pickMessage", error.message || "No se pudo cargar el importe privado. Cancela la edición y vuelve a intentarlo.");
    }
  }
}
async function savePick(event) {
  event.preventDefault();
  if (!currentUser) return;
  if (editingPickId) {
    const pick = currentPicks.find(item => item.id === editingPickId);
    const lockReason = pick && pickLockReason(pick);
    if (lockReason) {
      message("pickMessage", `Este pronóstico está bloqueado: ${lockReason}.`);
      return;
    }
  }
  const wasEditing = Boolean(editingPickId);
  const editedPickId = editingPickId;
  const button = $("savePickButton");
  button.disabled = true;
  button.textContent = editingPickId ? "Guardando..." : "Publicando...";
  clearMessage("pickMessage");
  const data = {
    user_id: currentUser.uid,
    sport: $("sport").value.trim(),
    event: $("event").value.trim(),
    selection: $("selection").value.trim(),
    odds: Number($("odds").value),
    bookmaker: $("bookmaker").value.trim(),
    league: $("league").value.trim(),
    market: $("market").value.trim(),
    stake: Number($("publicStake").value),
    event_date: new Date($("eventDate").value),
    confianza: $("confidence").value ? Number($("confidence").value) : null,
    analysis: $("note").value.trim(),
    destacada: $("featured").checked,
    show_on_stream: wasEditing
      ? currentPicks.find(pick => pick.id === editedPickId)?.show_on_stream === true
      : false
  };
  try {
    if ($("stakeAmount").disabled) throw new Error("Espera a que se cargue el registro financiero privado antes de guardar.");
    const bankroll = parseBankrollStake($("stakeAmount").value, $("stakeCurrency").value);
    if (!["futbol", "baloncesto", "tenis", "beisbol", "esports", "otro"].includes(data.sport)
      || !["betano", "inkabet", "te_apuesto", "betsson", "doradobet", "apuesta_total", "bet365", "otra"].includes(data.bookmaker)
      || !data.event || data.event.length > 120
      || !data.selection || data.selection.length > 120
      || data.sport.length > 50 || data.bookmaker.length > 60
      || !data.league || data.league.length > 120 || !data.market || data.market.length > 120
      || !Number.isFinite(data.stake) || data.stake <= 0 || data.stake > 10000
      || data.analysis.length > 4000
      || !Number.isFinite(data.odds) || data.odds < 1.01 || data.odds > 1000
      || (data.confianza !== null && (!Number.isInteger(data.confianza) || data.confianza < 1 || data.confianza > 5))
      || !Number.isFinite(data.event_date.getTime())) {
      throw new Error("Revisa los campos: deporte, casa, evento, pronóstico, cuota, confianza, nota y fecha deben cumplir los límites indicados.");
    }
    const profileRef = doc(db, "perfiles", currentUser.uid);
    const pickRef = editedPickId ? doc(db, "picks", editedPickId) : doc(collection(db, "picks"));
    const bankrollRef = doc(pickRef, "private", "bankroll");
    const featuredQuery = query(collection(db, "picks"), where("user_id", "==", currentUser.uid), where("destacada", "==", true));
    const featuredSnapshot = data.destacada ? await getDocs(featuredQuery) : null;
    await runTransaction(db, async transaction => {
      const [profileSnapshot, pickSnapshot, bankrollSnapshot, featuredPicks] = await Promise.all([
        transaction.get(profileRef),
        editedPickId ? transaction.get(pickRef) : Promise.resolve(null),
        editedPickId ? transaction.get(bankrollRef) : Promise.resolve(null),
        featuredSnapshot
          ? Promise.all(featuredSnapshot.docs
            .filter(item => item.id !== pickRef.id)
            .map(item => transaction.get(item.ref)))
          : Promise.resolve([])
      ]);
      if (!profileSnapshot.exists() || profileSnapshot.data().tipster_status !== "approved") {
        throw new Error("Tu cuenta debe estar aprobada para publicar pronósticos.");
      }
      if (editedPickId && (!pickSnapshot?.exists() || pickSnapshot.data().user_id !== currentUser.uid)) {
        throw new Error("No encontramos ese pronóstico en tu cuenta.");
      }
      if (pickSnapshot?.data().status === "cashed_out" && !bankroll) {
        throw new Error("Un cierre anticipado necesita conservar su importe privado. Cambia primero el resultado si quieres quitarlo.");
      }
      featuredPicks.forEach(item => transaction.set(item.ref, canonicalPick({ ...normalizePick(item.data()), destacada: false })));
      transaction.set(pickRef, {
        ...data,
        show_on_stream: editedPickId ? pickSnapshot.data().show_on_stream === true : false,
        status: editedPickId ? normalizePick(pickSnapshot.data()).status : "pending",
        created_at: editedPickId ? pickSnapshot.data().created_at : serverTimestamp()
      });
      if (bankroll) {
        transaction.set(bankrollRef, {
          ...bankroll,
          ...(pickSnapshot?.data().status === "cashed_out" ? {
            returnAmount: bankrollSnapshot.data().returnAmount,
            returnMinorUnits: bankrollSnapshot.data().returnMinorUnits
          } : {}),
          created_at: bankrollSnapshot?.exists() ? bankrollSnapshot.data().created_at : serverTimestamp(),
          updated_at: serverTimestamp()
        });
      } else if (bankrollSnapshot?.exists()) {
        transaction.delete(bankrollRef);
      }
    });
    resetPickForm();
    message("pickMessage", wasEditing ? "Pronóstico actualizado." : "Pronóstico publicado.", true);
  } catch (error) {
    console.error("No se pudo guardar el pronóstico:", error);
    message("pickMessage", error.message || "No se pudo guardar. Comprueba tu conexión y vuelve a intentarlo.");
  } finally {
    button.disabled = false;
    if (!editingPickId) button.textContent = "Publicar pronóstico";
    else button.textContent = "Guardar cambios";
  }
}
function openCrop(file, target) {
  if (!file) return;
  if (typeof Cropper !== "function") {
    message("profileMessage", "No se pudo cargar el editor de imágenes. Recarga la página e inténtalo de nuevo.");
    return;
  }
  const maxBytes = target === "avatar" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > maxBytes) {
    message("profileMessage", target === "avatar" ? "Elige una imagen JPG, PNG o WebP de hasta 2 MB." : "Elige una imagen JPG, PNG o WebP de hasta 5 MB.");
    return;
  }
  clearMessage("profileMessage");
  clearMessage("cropMessage");
  cropTarget = target;
  $("cropTitle").textContent = target === "avatar" ? "Ajustar foto de perfil" : "Ajustar banner";
  $("cropModal").classList.remove("hidden");
  $("cropModal").classList.add("flex");
  $("cropImage").onload = () => {
    if (cropper) cropper.destroy();
    cropper = new Cropper($("cropImage"), { aspectRatio: target === "avatar" ? 1 : 3, viewMode: 1, dragMode: "move", autoCropArea: 1, guides: false, background: false, responsive: true, toggleDragModeOnDblclick: false });
  };
  if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
  cropSourceUrl = URL.createObjectURL(file);
  $("cropImage").src = cropSourceUrl;
  $("closeCrop").focus();
}
function closeCrop() {
  $("cropModal").classList.add("hidden");
  $("cropModal").classList.remove("flex");
  clearMessage("cropMessage");
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  if (cropSourceUrl) {
    URL.revokeObjectURL(cropSourceUrl);
    cropSourceUrl = null;
  }
  $("cropImage").src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
}
function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("No se pudo leer la imagen."));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen."));
    reader.onabort = () => reject(new Error("Se canceló la lectura de la imagen."));
    reader.readAsDataURL(blob);
  });
}
function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen.")), "image/jpeg", quality);
  });
}
async function compressCropToDataUrl(canvas, maxLength) {
  for (let resize = 0; resize < 6; resize += 1) {
    const scaledCanvas = document.createElement("canvas");
    const scale = 0.8 ** resize;
    scaledCanvas.width = Math.max(160, Math.floor(canvas.width * scale));
    scaledCanvas.height = Math.max(160, Math.floor(canvas.height * scale));
    const context = scaledCanvas.getContext("2d");
    if (!context) throw new Error("El navegador no pudo preparar la imagen.");
    context.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
    for (const quality of [0.84, 0.72, 0.6, 0.48]) {
      const blob = await canvasBlob(scaledCanvas, quality);
      if (blob.size > maxLength) continue;
      const dataUrl = await readBlobAsDataUrl(blob);
      if (dataUrl.length <= maxLength && IMAGE_DATA_PATTERN.test(dataUrl)) return dataUrl;
    }
  }
  throw new Error("La imagen sigue siendo demasiado grande después de comprimirla. Elige otra imagen.");
}
function installTabs() {
  const tabs = { picks: "picksTab", widget: "widgetTab", profile: "profileTab" };
  const views = { picks: "picksView", widget: "widgetView", profile: "profileView" };
  const choose = selected => {
    for (const [view, elementId] of Object.entries(views)) {
      $(elementId).classList.toggle("hidden", view !== selected);
      const tab = $(tabs[view]);
      tab.setAttribute("aria-selected", String(view === selected));
      tab.className = `tab control min-h-11 border-b-2 px-3 text-sm font-semibold ${view === selected ? "border-emerald-300 text-emerald-100" : "border-transparent text-zinc-500 hover:text-zinc-200"}`;
    }
  };
  for (const [view, tabId] of Object.entries(tabs)) {
    $(tabId).addEventListener("click", () => choose(view));
  }
}
if (!embedded) {
  installGoogleAccess({ button: $("tipsterGoogle"), showMessage: (text, success) => message("loginMessage", text, success) });
  installPasswordRecovery({ button: $("resetTipsterPassword"), emailInput: $("email"), showMessage: (text, success) => message("loginMessage", text, success) });
}
$("toggleAuthMode").addEventListener("click", () => setAuthMode(!isRegistrationMode));
$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  clearMessage("loginMessage");
  $("loginButton").disabled = true;
  $("loginButton").textContent = isRegistrationMode ? "Creando cuenta..." : "Iniciando sesión...";
  verificationFlowInProgress = true;
  let accountCreated = false, acceptanceSaved = false;
  try {
    const email = $("email").value.trim();
    const password = $("password").value;
    if (isRegistrationMode) {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      accountCreated = true;
      await updateProfile(user, { displayName: $("accountDisplayName").value.trim() });
      await saveLegalAcceptance(user, "registrationAge", "registrationTerms");
      acceptanceSaved = true;
      await sendEmailVerification(user);
      await signOut(auth);
      $("password").value = "";
      setAuthMode(false);
      message("loginMessage", "Cuenta creada. Revisa tu correo y confirma el enlace antes de iniciar sesión.", true);
    } else {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      if (!user.emailVerified) {
        await sendEmailVerification(user);
        await signOut(auth);
        $("password").value = "";
        message("loginMessage", "Tu correo aún no está verificado. Te enviamos otro enlace; confirma tu correo y vuelve a iniciar sesión.", true);
      }
    }
  } catch (error) {
    console.error("No se pudo iniciar sesión:", error);
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error("No se pudo cerrar la sesión pendiente de verificación:", signOutError);
      }
    }
    const errorMessage = accountCreated
      ? !acceptanceSaved
        ? "La cuenta se creó, pero no pudimos registrar tu aceptación. Verifica tu correo e inicia sesión para completar este paso; no podrás usar la plataforma hasta que quede guardado."
        : "La cuenta se creó, pero no pudimos completar el correo de verificación. Inicia sesión para solicitar otro enlace."
      : authErrorMessage(error);
    message("loginMessage", errorMessage);
  } finally {
    verificationFlowInProgress = false;
    $("loginButton").disabled = false;
    $("loginButton").textContent = isRegistrationMode ? "Crear cuenta" : "Iniciar sesión";
  }
});
$("legalAcceptanceForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;
  const button = $("legalAcceptanceButton");
  button.disabled = true;
  button.textContent = "Guardando aceptación...";
  clearMessage("legalAcceptanceMessage");
  try {
    await saveLegalAcceptance(currentUser, "acceptanceAge", "acceptanceTerms");
    if (embedded) root.dispatchEvent(new CustomEvent("dashboard:navigate", { bubbles: true, detail: { view: "tipster", reload: true } }));
    else window.location.reload();
  } catch (error) {
    console.error("No se pudo guardar la aceptación de términos:", error);
    message("legalAcceptanceMessage", error.code === "permission-denied"
      ? "Firebase rechazó el registro de aceptación. El operador debe publicar las reglas de Firestore actualizadas antes de continuar."
      : error.code === "unavailable"
        ? "Firestore no está disponible. Comprueba tu conexión e inténtalo de nuevo."
        : error.message || "No se pudo guardar la aceptación. Inténtalo de nuevo.");
  } finally {
    button.disabled = false;
    button.textContent = "Aceptar y continuar";
  }
});
$("legalLogoutButton").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("No se pudo cerrar la sesión:", error);
    message("legalAcceptanceMessage", "No se pudo cerrar la sesión. Inténtalo de nuevo.");
  }
});
$("logoutButton").addEventListener("click", async () => {
  $("logoutButton").disabled = true;
  let presenceError = false;
  try {
    await setPresenceOffline();
  } catch (error) {
    console.error("No se pudo actualizar el estado al cerrar sesión:", error);
    presenceError = true;
  }
  try {
    await signOut(auth);
    if (presenceError) message("loginMessage", "La sesión se cerró. La conexión pública caducará automáticamente en 90 segundos.");
  } catch (error) {
    console.error("No se pudo cerrar sesión:", error);
    message("profileMessage", "No se pudo cerrar la sesión. Intenta de nuevo.");
  } finally {
    $("logoutButton").disabled = false;
  }
});
$("pickForm").addEventListener("submit", savePick);
$("cancelEditButton").addEventListener("click", resetPickForm);
$("copyWidgetLink").addEventListener("click", async () => {
  const url = $("widgetUrl").value;
  if (!url) {
    message("widgetMessage", "Guarda primero tu perfil para generar el enlace.");
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    message("widgetMessage", "Enlace copiado. Pégalo en la fuente de navegador.", true);
  } catch (error) {
    console.error("No se pudo copiar el enlace del widget:", error);
    $("widgetUrl").focus();
    $("widgetUrl").select();
    message("widgetMessage", "No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.");
  }
});
$("widgetFormat").addEventListener("change", event => {
  const format = event.target.value;
  if (!WIDGET_FORMATS.has(format)) {
    event.target.value = selectedWidgetFormat;
    return;
  }
  selectedWidgetFormat = format;
  updateWidgetUrl(currentProfile?.username);
  clearMessage("widgetMessage");
});
listenWindow("message", event => {
  const previewFrame = $("widgetPreviewFrame");
  if (event.origin !== window.location.origin || event.source !== previewFrame.contentWindow
    || event.data?.type !== "fijas-widget-resize" || !Number.isFinite(event.data.height)) return;
  previewFrame.style.height = `${Math.max(180, Math.min(460, Math.ceil(event.data.height)))}px`;
  const showEmpty = event.data.hasPicks !== true && event.data.hasError !== true;
  $("widgetPreviewEmpty").textContent = "No hay pronósticos seleccionados. Márcalos en tu lista para verlos aquí.";
  $("widgetPreviewEmpty").classList.toggle("hidden", !showEmpty);
});
async function updatePublicPick(id, changes) {
  const ref = doc(db, "picks", id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("No se encontró el pronóstico.");
    transaction.set(ref, canonicalPick({ ...normalizePick(snapshot.data()), ...changes }));
  });
}
async function settlePick(id, status, cashoutOdds, privateReturn) {
  const pickRef = doc(db, "picks", id);
  const bankrollRef = doc(pickRef, "private", "bankroll");
  await runTransaction(db, async transaction => {
    const [snapshot, financial] = await Promise.all([transaction.get(pickRef), transaction.get(bankrollRef)]);
    if (!snapshot.exists()) throw new Error("No se encontró el pronóstico.");
    const original = normalizePick(snapshot.data());
    if (original.status !== "pending") throw new Error("El resultado definitivo no puede reabrirse.");
    const pick = { ...original, status };
    delete pick.cashout_value;
    delete pick.cashout_odds;
    if (status === "cashed_out") {
      if (!Number.isFinite(cashoutOdds) || cashoutOdds < 0 || cashoutOdds > 1000) {
        throw new Error("Indica un multiplicador de retorno público válido entre 0 y 1000.");
      }
      pick.cashout_odds = cashoutOdds;
    }
    transaction.set(pickRef, canonicalPick(pick));
    if (financial.exists()) {
      const data = financial.data();
      delete data.returnAmount;
      delete data.returnMinorUnits;
      if (status === "cashed_out") Object.assign(data, parseCashOutReturn(privateReturn, data.currency));
      transaction.set(bankrollRef, { ...data, updated_at: serverTimestamp() });
    }
  });
}
$("myPicks").addEventListener("change", async event => {
  const checkbox = event.target.closest('input[data-action="stream"]');
  if (!checkbox || !currentUser) return;
  const pick = currentPicks.find(item => item.id === checkbox.dataset.id);
  if (!pick) return;
  const lockReason = pickLockReason(pick);
  if (lockReason) {
    checkbox.checked = !checkbox.checked;
    message("pickMessage", `Este pronóstico está bloqueado: ${lockReason}.`);
    return;
  }
  const showOnStream = checkbox.checked;
  checkbox.disabled = true;
  try {
    await updatePublicPick(pick.id, { show_on_stream: showOnStream });
    message("pickMessage", showOnStream ? "Pronóstico añadido al widget." : "Pronóstico quitado del widget.", true);
  } catch (error) {
    console.error("No se pudo actualizar la selección del widget:", error);
    checkbox.checked = !showOnStream;
    message("pickMessage", error.code === "permission-denied"
      ? "Firebase rechazó el cambio. Publica las reglas actualizadas con el comando de FIREBASE_SETUP.md y vuelve a intentarlo."
      : error.code === "failed-precondition"
        ? "Firestore necesita un índice actualizado. Publica las reglas e índices indicados en FIREBASE_SETUP.md y vuelve a intentarlo."
        : "No se pudo actualizar el widget. Comprueba la conexión e inténtalo de nuevo.");
    checkbox.disabled = false;
  }
});
$("myPicks").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button || !currentUser) return;
  const pick = currentPicks.find(item => item.id === button.dataset.id);
  if (!pick) return;
  const lockReason = pickLockReason(pick);
  if (lockReason) {
    message("pickMessage", `Este pronóstico está bloqueado: ${lockReason}.`);
    return;
  }
  if (button.dataset.action === "edit") {
    button.closest("[popover]")?.hidePopover();
    await beginEdit(pick);
    return;
  }
  if (button.dataset.action === "delete" && !confirm("¿Eliminar este pronóstico? Esta acción no se puede deshacer.")) return;
  button.disabled = true;
  try {
    if (button.dataset.action === "delete") {
      const pickRef = doc(db, "picks", pick.id);
      const bankrollRef = doc(pickRef, "private", "bankroll");
      await runTransaction(db, async transaction => {
        const bankrollSnapshot = await transaction.get(bankrollRef);
        if (bankrollSnapshot.exists()) transaction.delete(bankrollRef);
        transaction.delete(pickRef);
      });
      function closePickActionPopups() {
        root.querySelectorAll(".pick-action-popup:popover-open").forEach(popup => popup.hidePopover());
      }
      listenWindow("resize", closePickActionPopups);
      listenDocument("scroll", event => {
        if (event.target instanceof Element && event.target.closest(".pick-action-popup")) return;
        closePickActionPopups();
      }, true);
    }
    else await settlePick(pick.id, button.dataset.action === "win" ? "won" : "lost");
  } catch (error) {
    console.error("No se pudo actualizar el pronóstico:", error);
    message("pickMessage", "No se pudo actualizar. Comprueba las reglas de Firestore e inténtalo de nuevo.");
    button.disabled = false;
  }
});
$("myPicks").addEventListener("change", async event => {
  const select = event.target.closest("select[data-action='status']");
  if (!select || !currentUser) return;
  const pick = currentPicks.find(item => item.id === select.dataset.id);
  if (pick?.status !== "pending") {
    select.value = pick.status || "pending";
    message("pickMessage", "El resultado definitivo no puede reabrirse.");
    return;
  }
  select.disabled = true;
  try {
    const nextStatus = select.value;
    if (nextStatus === "cashed_out") throw new Error("Registra el retorno recibido desde el formulario de cierre anticipado.");
    await settlePick(select.dataset.id, nextStatus);
  } catch (error) {
    console.error("No se pudo actualizar el resultado:", error);
    message("pickMessage", "No se pudo actualizar el resultado. Comprueba las reglas de Firestore e inténtalo de nuevo.");
    select.value = currentPicks.find(pick => pick.id === select.dataset.id)?.status || "pending";
    select.disabled = false;
  }
});
$("myPicks").addEventListener("submit", async event => {
  const form = event.target.closest("form[data-cash-out-id]");
  if (!form || !currentUser) return;
  event.preventDefault();
  const pick = currentPicks.find(item => item.id === form.dataset.cashOutId);
  if (pick?.status !== "pending") {
    message("pickMessage", "El resultado definitivo no puede reabrirse.");
    return;
  }
  const button = form.querySelector("button");
  const value = form.elements.namedItem("returnAmount").value;
  button.disabled = true;
  clearMessage("pickMessage");
  try {
    await settlePick(form.dataset.cashOutId, "cashed_out", Number(form.elements.namedItem("cashoutOdds").value), value);
    message("pickMessage", "Cierre anticipado guardado. El importe recibido permanece privado.", true);
  } catch (error) {
    console.error("No se pudo guardar el cierre anticipado:", error);
    message("pickMessage", error.message || "No se pudo guardar el cierre anticipado. No se aplicó ningún cambio.");
    button.disabled = false;
  }
});
$("profileForm").addEventListener("submit", submitProfileRequest);
$("tipsterApplicationForm").addEventListener("submit", requestTipsterAccess);
$("avatarFile").addEventListener("change", event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  openCrop(file, "avatar");
});
$("bannerFile").addEventListener("change", event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  openCrop(file, "banner");
});
$("avatarUrl").addEventListener("change", updateImagePreviews);
$("bannerUrl").addEventListener("change", updateImagePreviews);
$("removeAvatar").addEventListener("click", () => {
  croppedAvatar = null;
  $("avatarUrl").value = "";
  updateImagePreviews();
  message("profileMessage", "La foto se quitará al guardar el perfil.", true);
});
$("removeBanner").addEventListener("click", () => {
  croppedBanner = null;
  $("bannerUrl").value = "";
  updateImagePreviews();
  message("profileMessage", "El banner se quitará al guardar el perfil.", true);
});
$("closeCrop").addEventListener("click", closeCrop);
$("cancelCrop").addEventListener("click", closeCrop);
$("cropModal").addEventListener("click", event => { if (event.target === $("cropModal")) closeCrop(); });
listenDocument("keydown", event => { if (event.key === "Escape" && !$("cropModal").classList.contains("hidden")) closeCrop(); });
$("applyCrop").addEventListener("click", async () => {
  if (!cropper) return;
  const button = $("applyCrop");
  const target = cropTarget;
  button.disabled = true;
  button.textContent = "Comprimiendo...";
  try {
    const canvas = cropper.getCroppedCanvas(target === "avatar"
      ? { width: 480, height: 480, fillColor: "#09090b" }
      : { width: 1440, height: 480, fillColor: "#09090b" });
    if (!canvas) throw new Error("No se pudo recortar la imagen. Prueba con otro archivo.");
    const dataUrl = await compressCropToDataUrl(canvas, IMAGE_DATA_LIMITS[target]);
    if (target === "avatar") {
      croppedAvatar = dataUrl;
      $("avatarUrl").value = "";
    } else {
      croppedBanner = dataUrl;
      $("bannerUrl").value = "";
    }
    updateImagePreviews();
    closeCrop();
    clearMessage("profileMessage");
  } catch (error) {
    console.error("No se pudo preparar la imagen:", error);
    message("cropMessage", error.message || "No se pudo procesar la imagen. Prueba con otro archivo.");
  } finally {
    button.disabled = false;
    button.textContent = "Usar imagen";
  }
});
$("eventDate").value = localDateValue();
installTabs();

if (!firebaseConfigured) {
  $("panelLoading").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  $("firebaseSetup").classList.remove("hidden");
  $("loginButton").disabled = true;
  message("loginMessage", firebaseConfigError);
  $("loginMessage").classList.remove("border-rose-300/15", "bg-rose-300/[.06]", "text-rose-100");
  $("loginMessage").classList.add("border-amber-300/15", "bg-amber-300/[.06]", "text-amber-100");
} else {
  auth = firebaseAuth;
  db = firebaseDb;
  onAuthStateChanged(auth, async user => {
    if (verificationFlowInProgress && user && !user.emailVerified) return;
    if (stopPermissions) stopPermissions();
    stopPermissions = null;
    currentUser = user;
    $("dashboard").classList.add("hidden");
    if (heartbeat) clearInterval(heartbeat);
    if (stopPicks) stopPicks();
    if (stopFollowerCount) stopFollowerCount();
    stopFollowerCount = null;
    $("followerMetric").classList.add("hidden");
    for (const stop of bankrollSubscriptions.values()) stop();
    bankrollSubscriptions.clear();
    bankrollRecords.clear();
    bankrollErrors.clear();
    currentPicks = [];
    historyLoading = false;
    historyError = "";
    $("bankrollPeriod").value = "month";
    $("bankrollFrom").disabled = true;
    $("bankrollThrough").disabled = true;
    for (const id of ["bankrollStatus", "bankrollSport", "bankrollBookmaker"]) $(id).value = "";
    setCurrentMonth();
    $("bankrollExport").disabled = true;
    $("bankrollReport").disabled = true;
    $("bankrollPDF").disabled = true;
    $("bankrollLoadMessage").textContent = "";
    $("bankrollSummary").replaceChildren();
    $("myPicks").replaceChildren();
    heartbeat = null;
    stopPicks = null;
    if (!user) {
      $("panelLoading").classList.add("hidden");
      $("loginView").classList.remove("hidden");
      $("dashboard").classList.add("hidden");
      $("userEmail").textContent = "";
      return;
    }
    if (!user.emailVerified) {
      $("panelLoading").classList.add("hidden");
      try {
        await signOut(auth);
      } catch (error) {
        console.error("No se pudo cerrar la sesión sin verificar:", error);
      }
      $("loginView").classList.remove("hidden");
      $("dashboard").classList.add("hidden");
      message("loginMessage", "Verifica tu correo electrónico antes de entrar al panel.");
      return;
    }
    try {
      const accountState = await getAccountState(user);
      if (currentUser?.uid !== user.uid) return;
      if (accountState.isAdmin) {
        if (embedded) root.dispatchEvent(new CustomEvent("dashboard:navigate", { bubbles: true, detail: { view: "admin" } }));
        else window.location.replace("admin-dashboard.html");
        return;
      }
      const acceptance = await getDoc(legalAcceptanceRef(user.uid));
      if (currentUser?.uid !== user.uid) return;
      if (!acceptance.exists()) {
        $("panelLoading").classList.add("hidden");
        $("loginView").classList.add("hidden");
        $("dashboard").classList.add("hidden");
        $("legalAcceptanceView").classList.remove("hidden");
        return;
      }
      $("legalAcceptanceView").classList.add("hidden");
      $("panelLoading").classList.add("hidden");
      $("loginView").classList.add("hidden");
      $("dashboard").classList.remove("hidden");
      $("userEmail").textContent = user.email || "Sesión iniciada";
      if (accountState.tipsterStatus !== "approved") {
        $("tipsterTabs").classList.add("hidden");
        $("picksView").classList.add("hidden");
        $("widgetView").classList.add("hidden");
        $("profileView").classList.add("hidden");
        $("accountGate").classList.remove("hidden");
        $("presenceState").classList.add("hidden");
        $("dashboardTitle").textContent = "Tu cuenta";
        $("dashboardDescription").textContent = "Consulta el estado de tu cuenta y solicita publicar como tipster.";
        showAccountGate(accountState, user);
        return;
      }
      $("accountGate").classList.add("hidden");
      $("tipsterTabs").classList.remove("hidden");
      $("picksView").classList.remove("hidden");
      $("widgetView").classList.add("hidden");
      $("profileView").classList.add("hidden");
      $("presenceState").classList.remove("hidden");
      $("dashboardTitle").textContent = "Panel de tipster";
      $("dashboardDescription").textContent = "Publica tus pronósticos y mantén tu perfil al día.";
      currentMonthlyPickLimit = accountState.tipsterMonthlyPickLimit;
      await loadProfile();
      if (currentUser?.uid !== user.uid) return;
      $("profileView").classList.add("hidden");
      $("picksView").classList.remove("hidden");
      $("eventDate").value = localDateValue();
      await initializePresence();
      if (currentUser?.uid !== user.uid) return;
      listenDocument("visibilitychange", handleVisibilityChange);
      subscribeToPicks();
      stopPermissions = watchAccountPermissions(user, permissions => {
        if (currentUser?.uid !== user.uid) return;
        if (permissions.isAdmin) {
          if (embedded) root.dispatchEvent(new CustomEvent("dashboard:navigate", { bubbles: true, detail: { view: "admin" } }));
        else window.location.replace("admin-dashboard.html");
          return;
        }
        if (permissions.canPublish) return;
        stopTipsterTools();
        if (permissions.suspended) {
          $("dashboard").classList.add("hidden");
          $("loginView").classList.remove("hidden");
          message("loginMessage", "Tu cuenta está suspendida. Contacta al administrador.");
          return;
        }
        showAccountGate({ ...accountState, tipsterStatus: permissions.tipsterStatus }, user);
      }, error => {
        console.error("No se pudieron comprobar los permisos del tipster:", error);
        stopTipsterTools();
        $("dashboard").classList.add("hidden");
        $("loginView").classList.remove("hidden");
        message("loginMessage", "No se pudieron comprobar tus permisos. Recarga para reintentar.");
      });
    } catch (error) {
      $("panelLoading").classList.add("hidden");
      console.error("No se pudo cargar la cuenta de la plataforma:", error);
      $("legalAcceptanceView").classList.add("hidden");
      $("loginView").classList.remove("hidden");
      $("dashboard").classList.add("hidden");
      message("loginMessage", error.code === "permission-denied"
        ? "Firebase no permite comprobar tu aceptación. El operador debe publicar las reglas actualizadas con `firebase deploy --only firestore:rules --project chijas`."
        : error.message || "No se pudo cargar tu cuenta. Comprueba la configuración y las reglas de Firestore.");
    }
  }, error => {
    $("panelLoading").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    console.error("Falló la autenticación de Firebase:", error);
    message("loginMessage", "No se pudo comprobar tu sesión. Recarga la página e inténtalo de nuevo.");
  });
}

  return () => {
    disposed = true;
    controller.abort();
    for (const stop of subscriptions) stop();
    subscriptions.clear();
    if (stopPermissions) stopPermissions();
    stopTipsterTools();
    intervals.forEach(id => window.clearInterval(id));
    timeouts.forEach(id => window.clearTimeout(id));
    stopBusyButtons();
    closeCrop();
    root.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    currentUser = null;
  };
}
