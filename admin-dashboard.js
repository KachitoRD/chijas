import { firebaseAuth as auth, firebaseDb as db, firebaseConfigured, firebaseConfigError } from "./firebase-config.js?v=2";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { watchAccountPermissions, operationalPermissions } from "./permissions.js";
import { moderateViewer, reviewApplication, reviewProfile, saveAdministrators, saveLimits, saveTakeRate } from "./admin-services.js";
import { normalizePick } from "./pick-schema.js";

export function mountAdminView(root) {
const $ = id => root.querySelector(`#${CSS.escape(id)}`);
let disposed = false, stopAuth = null;
let access = null, generation = 0, stopPermissions = null, stops = [], clock = null;
let data = {}, errors = new Set(), activeTab = null;
const tabs = { metrics: "kpis", finance: "super", operations: "tipsters", profiles: "profiles", viewers: "viewers", governance: "super" };
const labels = {
  username: "Usuario", nombre_publico: "Nombre público", bio: "Descripción", color_primario: "Color",
  avatar_url: "Avatar", banner_url: "Banner", kick_url: "Kick", twitch_url: "Twitch", youtube_url: "YouTube",
  telegram_url: "Telegram", twitter_url: "X", instagram_url: "Instagram"
};
function node(tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function button(text, action, id) {
  const element = node("button", text, "admin-button");
  element.type = "button";
  element.dataset.action = action;
  element.dataset.id = id;
  return element;
}
function field(label, input) {
  const wrapper = node("label", label, "admin-field");
  wrapper.append(input);
  return wrapper;
}
function can(tab) {
  return access?.isAdmin && (tabs[tab] === "super" ? access.isSuperAdmin : access.permissions.includes(tabs[tab]));
}
function notice(text, error = false) {
  $("admin-message").textContent = text;
  $("admin-message").className = `mb-5 text-sm ${error ? "text-rose-200" : "text-emerald-200"}`;
}
function stopData() {
  stops.forEach(stop => stop());
  stops = [];
  if (clock) clearInterval(clock);
  clock = null;
  data = {};
  errors = new Set();
  for (const id of ["applications", "tipsters", "profileRequests", "viewers-list", "finance-list", "admins-list"]) $(id).replaceChildren();
}
function deny(text, error) {
  if (error) console.error(text, error);
  generation++;
  stopData();
  access = null;
  $("dashboard").classList.add("hidden");
  $("user-email").textContent = "";
  $("auth-loading").classList.add("hidden");
  $("signed-out").classList.add("hidden");
  $("auth-message-text").textContent = text;
  $("auth-message").classList.remove("hidden");
}
function selectTab(tab, focus = false) {
  if (!can(tab)) return;
  activeTab = tab;
  for (const name of Object.keys(tabs)) {
    $(`${name}-tab`).setAttribute("aria-selected", String(name === tab));
    $(`${name}-tab`).tabIndex = name === tab ? 0 : -1;
    $(`${name}-panel`).hidden = name !== tab;
  }
  if (focus) $(`${tab}-tab`).focus();
}
function live(key, source) {
  const current = generation;
  stops.push(onSnapshot(source, snapshot => {
    if (disposed || current !== generation) return;
    errors.delete(key);
    try {
      data[key] = snapshot.docs ? snapshot.docs.map(item => key === "picks"
        ? normalizePick({ ...item.data(), id: item.id }) : { ...item.data(), id: item.id }) : snapshot.data();
    } catch (error) {
      console.error("No se pudo interpretar el historial administrativo:", error);
      errors.add(key);
      delete data[key];
      notice("El historial contiene un pronóstico inválido. Revisa los datos antes de calcular métricas.", true);
    }
    render(key);
  }, error => {
    if (disposed || current !== generation) return;
    console.error(`No se pudo cargar ${key}:`, error);
    errors.add(key);
    delete data[key];
    notice(`No se pudo cargar ${key}. Recarga para reintentar; no se muestran resultados parciales.`, true);
    render(key);
  }));
}
function startData() {
  generation++;
  stopData();
  if (can("metrics") || can("finance") || can("operations") || can("profiles")) live("profiles", collection(db, "perfiles"));
  if (can("profiles")) live("social", collection(db, "perfiles_social"));
  if (can("metrics")) {
    live("picks", collection(db, "picks"));
    live("presence", collection(db, "presencia"));
    live("viewerPresence", collection(db, "viewerPresence"));
    clock = setInterval(renderMetrics, 15_000);
  }
  if (can("finance")) live("finance", collection(db, "tipsterFinance"));
  if (can("operations")) live("applications", query(collection(db, "tipsterApplications"), where("status", "==", "pending")));
  if (can("profiles")) live("requests", query(collection(db, "perfilSolicitudes"), where("estado", "==", "pendiente")));
  if (can("viewers")) {
    live("viewers", query(collection(db, "users"), where("role", "==", "viewer")));
    if (!can("metrics")) live("viewerPresence", collection(db, "viewerPresence"));
  }
  if (can("governance")) {
    live("admins", collection(db, "platformAdmins"));
    live("settings", doc(db, "platformSettings", "limits"));
  }
}
function loaded(keys) {
  return keys.every(key => Object.hasOwn(data, key)) && !keys.some(key => errors.has(key));
}
function prepare(id, keys, emptyText) {
  const target = $(id);
  target.replaceChildren();
  if (!loaded(keys)) {
    target.textContent = keys.some(key => errors.has(key)) ? "No se pudo cargar. Recarga para reintentar." : "Cargando…";
    return null;
  }
  if (emptyText) target.append(node("p", emptyText, "text-sm text-zinc-400"));
  return target;
}
function connected(presence) {
  const time = presence?.last_active_at?.toMillis?.();
  return presence?.is_online === true && Number.isFinite(time) && Date.now() - time <= 90_000;
}
function renderMetrics() {
  if (!can("metrics")) return;
  $("total-users").textContent = !can("viewers") ? "Sin permiso de viewers"
    : errors.has("viewers") ? "No disponible"
      : Object.hasOwn(data, "viewers") ? String(data.viewers.length) : "Cargando…";
  if (!loaded(["profiles", "picks", "presence", "viewerPresence"])) {
    for (const id of ["total-picks", "active-tipsters", "online-tipsters", "online-viewers", "win-rate"]) {
      $(id).textContent = errors.size ? "No disponible" : "Cargando…";
    }
    return;
  }
  const approved = new Set(data.profiles.filter(profile => profile.tipster_status === "approved").map(profile => profile.id));
  const wins = data.picks.filter(pick => pick.status === "won").length;
  const losses = data.picks.filter(pick => pick.status === "lost").length;
  $("total-picks").textContent = String(data.picks.length);
  $("active-tipsters").textContent = String(approved.size);
  $("online-tipsters").textContent = String(data.presence.filter(item => approved.has(item.id) && connected(item)).length);
  $("online-viewers").textContent = String(data.viewerPresence.filter(connected).length);
  $("win-rate").textContent = wins + losses ? `${(100 * wins / (wins + losses)).toFixed(2)} %` : "Sin resultados";
}
function renderApplications() {
  if (!can("operations")) return;
  const target = prepare("applications", ["applications"]);
  if (!target) return;
  if (!data.applications.length) { target.textContent = "No hay solicitudes pendientes."; return; }
  const scroll = node("div", "", "admin-table-scroll");
  const table = node("table", "", "admin-application-table");
  table.append(node("caption", "Solicitudes pendientes de publicación"));
  const head = node("thead");
  const header = node("tr");
  for (const title of ["Solicitante", "Usuario solicitado", "Decisión"]) {
    const cell = node("th", title);
    cell.scope = "col";
    header.append(cell);
  }
  head.append(header);
  const body = node("tbody");
  table.append(head, body);
  for (const application of data.applications) {
    const row = node("tr");
    row.dataset.application = application.id;
    const identity = node("td");
    identity.append(node("strong", application.display_name),
      node("p", `${application.email} · ${application.id}`, "mt-2 text-xs text-zinc-400"));
    const username = node("td", `@${application.requested_username}`);
    const decision = node("td");
    const actions = node("div", "", "admin-actions");
    actions.append(button("Aprobar", "approve-application", application.id), button("Rechazar", "reject-application", application.id));
    decision.append(actions);
    row.append(identity, username, decision);
    body.append(row);
  }
  scroll.append(table);
  target.append(scroll);
}
function renderTipsters() {
  if (!can("operations")) return;
  const target = prepare("tipsters", ["profiles"]);
  if (!target) return;
  for (const profile of data.profiles.filter(profile => ["approved", "revoked"].includes(profile.tipster_status))) {
    const article = node("article");
    article.append(node("h3", profile.nombre_publico || profile.username, "font-semibold"),
      node("p", `@${profile.username} · ${profile.id} · ${profile.tipster_status === "approved" ? "Aprobado" : "Revocado"}`, "mt-2 text-sm text-zinc-400"),
      button(profile.tipster_status === "approved" ? "Revocar publicación" : "Restaurar publicación", "toggle-tipster", profile.id));
    target.append(article);
  }
  if (!target.children.length) target.textContent = "No hay tipsters aprobados o revocados.";
}
function renderRequests() {
  if (!can("profiles")) return;
  const target = prepare("profileRequests", ["requests", "profiles", "social"]);
  if (!target) return;
  for (const request of data.requests) {
    const current = { ...data.profiles.find(item => item.id === request.uid), ...data.social.find(item => item.id === request.uid) };
    const article = node("article");
    article.dataset.request = request.id;
    article.append(node("h3", `${current.nombre_publico || "Tipster"} · ${request.uid}`, "font-semibold"));
    for (const [key, value] of Object.entries(request.cambios || {})) {
      const display = value => value == null || value === "" ? "Sin configurar"
        : typeof value === "string" && value.startsWith("data:") ? "Imagen cargada" : String(value);
      article.append(node("p", `${labels[key] || key} — Actual: ${display(current[key])} · Propuesto: ${display(value)}`, "mt-3 break-words text-sm text-zinc-300"));
    }
    const reason = document.createElement("textarea");
    reason.name = "reason";
    reason.maxLength = 500;
    article.append(field("Motivo si rechazas", reason));
    const actions = node("div", "", "admin-actions");
    actions.append(button("Aprobar", "approve-profile", request.id), button("Rechazar", "reject-profile", request.id));
    article.append(actions);
    target.append(article);
  }
  if (!target.children.length) target.textContent = "No hay cambios pendientes.";
}
function renderFinance() {
  if (!can("finance")) return;
  const target = prepare("finance-list", ["profiles", "finance"]);
  if (!target) return;
  for (const profile of data.profiles.filter(item => item.tipster_status === "approved")) {
    const finance = data.finance.find(item => item.id === profile.id);
    const article = node("article");
    article.dataset.finance = profile.id;
    article.append(node("h3", profile.nombre_publico || profile.username, "font-semibold"),
      node("p", "Ingresos brutos: No disponible · Neto plataforma: No disponible · Neto tipster: No disponible", "mt-3 text-sm text-zinc-400"));
    const form = document.createElement("form");
    form.dataset.takeRate = profile.id;
    form.className = "admin-actions";
    const input = document.createElement("input");
    Object.assign(input, { type: "number", name: "takeRate", min: "0", max: "100", step: "0.01", required: true, value: finance?.takeRate ?? "" });
    form.append(field("Comisión plataforma (%)", input), node("button", "Guardar comisión", "admin-button"));
    article.append(form);
    target.append(article);
  }
  if (!target.children.length) target.textContent = "No hay tipsters aprobados.";
}
function renderViewers() {
  if (!can("viewers")) return;
  const target = prepare("viewers-list", ["viewers", "viewerPresence"]);
  if (!target) return;
  const search = $("viewerSearch").value.trim().toLowerCase();
  for (const viewer of data.viewers.filter(item => `${item.id} ${item.email || ""}`.toLowerCase().includes(search))) {
    const article = node("article");
    article.dataset.viewer = viewer.id;
    const active = connected(data.viewerPresence.find(item => item.id === viewer.id));
    const created = viewer.created_at?.toDate?.();
    article.append(node("h3", viewer.displayName || viewer.id, "font-semibold"),
      node("p", `${viewer.email || "Correo no registrado"} · ${viewer.id}`, "mt-2 text-sm text-zinc-400"),
      node("p", `${viewer.status === "suspended" ? "Suspendido" : "Activo"} · ${active ? "Conectado" : "Desconectado"} · Registro: ${created ? created.toLocaleDateString("es") : "No disponible"}`, "mt-2 text-sm text-zinc-400"));
    const action = button(viewer.status === "suspended" ? "Restaurar" : "Suspender", "moderate-viewer", viewer.id);
    action.disabled = viewer.id === auth.currentUser?.uid;
    article.append(action);
    target.append(article);
  }
  if (!target.children.length) target.textContent = "No se encontraron viewers.";
}
function renderAdmins() {
  if (!can("governance")) return;
  const target = prepare("admins-list", ["admins"]);
  if (!target) return;
  for (const admin of data.admins) {
    const article = node("article");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.admin = admin.id;
    checkbox.disabled = admin.id === auth.currentUser.uid;
    const label = node("label", ` ${admin.id} · ${admin.role || "super_admin (legado)"} · ${admin.enabled ? "Habilitado" : "Revocado"}`);
    label.prepend(checkbox);
    article.append(label, node("p", `Permisos: ${(admin.permissions || operationalPermissions).join(", ")}`, "mt-2 text-sm text-zinc-400"),
      button("Editar permisos", "edit-admin", admin.id));
    target.append(article);
  }
}
function render(key) {
  if (["profiles", "picks", "presence", "viewerPresence", "viewers"].includes(key)) renderMetrics();
  if (key === "applications") renderApplications();
  if (key === "profiles") renderTipsters();
  if (["requests", "profiles", "social"].includes(key)) renderRequests();
  if (["profiles", "finance"].includes(key)) renderFinance();
  if (["viewers", "viewerPresence"].includes(key)) renderViewers();
  if (key === "admins") renderAdmins();
  if (key === "settings" && can("governance") && Object.hasOwn(data, "settings")) {
    $("tipsterLimit").value = data.settings?.tipsterMonthlyPickLimit ?? 50;
    $("viewerLimit").value = data.settings?.viewerMonthlyPickLimit ?? 20;
  }
}
async function perform(control, operation, message) {
  const current = generation;
  control.disabled = true;
  notice("");
  try {
    await operation();
    if (current === generation) notice(message);
  } catch (error) {
    console.error("No se pudo completar la operación administrativa:", error);
    if (current === generation) notice(error.code === "permission-denied"
      ? "Firestore rechazó la operación. Comprueba tus permisos y el estado de los datos."
      : error.message || "No se pudo guardar. Recarga para reintentar.", true);
  } finally {
    control.disabled = false;
  }
}
$("admin-tabs").addEventListener("click", event => {
  const tab = event.target.closest("[data-tab]");
  if (tab) selectTab(tab.dataset.tab);
});
$("admin-tabs").addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const available = Object.keys(tabs).filter(can);
  if (!available.length) return;
  event.preventDefault();
  const index = available.indexOf(activeTab);
  selectTab(event.key === "Home" ? available[0] : event.key === "End" ? available.at(-1)
    : available[(index + (event.key === "ArrowRight" ? 1 : available.length - 1)) % available.length], true);
});
$("viewerSearch").addEventListener("input", renderViewers);
$("settingsForm").addEventListener("submit", event => {
  event.preventDefault();
  perform(event.submitter, () => saveLimits(Number($("tipsterLimit").value), Number($("viewerLimit").value)), "Límites guardados.");
});
$("roleForm").addEventListener("submit", event => {
  event.preventDefault();
  const uids = [...new Set($("adminUid").value.split(/\s+/).filter(Boolean))];
  const permissions = [...$("roleForm").querySelectorAll('input[name="permission"]:checked')].map(input => input.value);
  perform(event.submitter, () => saveAdministrators(uids, $("adminRole").value, permissions, $("adminEnabled").checked), "Permisos guardados.");
});
$("finance-list").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target.closest("[data-take-rate]");
  if (!form) return;
  perform(event.submitter, () => saveTakeRate(form.dataset.takeRate, Number(form.elements.takeRate.value)), "Comisión guardada.");
});
$("select-admins").addEventListener("click", () => {
  const inputs = [...$("admins-list").querySelectorAll("input[data-admin]:not(:disabled)")];
  const all = inputs.every(input => input.checked);
  inputs.forEach(input => { input.checked = !all; });
});
$("revoke-admins").addEventListener("click", event => {
  const ids = [...$("admins-list").querySelectorAll("input[data-admin]:checked")].map(input => input.dataset.admin);
  perform(event.currentTarget, async () => {
    if (!ids.length || ids.length > 25) throw new Error("Selecciona de 1 a 25 administradores.");
    await runTransaction(db, async transaction => {
      const snapshots = await Promise.all(ids.map(uid => transaction.get(doc(db, "platformAdmins", uid))));
      for (const snapshot of snapshots) {
        if (!snapshot.exists()) throw new Error("Una ACL ya no existe.");
        const admin = snapshot.data();
        transaction.set(snapshot.ref, {
          enabled: false, role: admin.role || "super_admin", permissions: admin.permissions || operationalPermissions,
          updated_at: serverTimestamp(), updated_by: auth.currentUser.uid
        });
      }
    });
  }, "Accesos revocados.");
});
$("dashboard").addEventListener("click", event => {
  const control = event.target.closest("button[data-action]");
  if (!control) return;
  const { action, id } = control.dataset;
  if (action === "edit-admin") {
    const admin = data.admins.find(item => item.id === id);
    $("adminUid").value = id;
    $("adminRole").value = admin.role || "super_admin";
    $("adminEnabled").checked = admin.enabled === true;
    $("roleForm").querySelectorAll('input[name="permission"]').forEach(input => {
      input.checked = (admin.permissions || operationalPermissions).includes(input.value);
    });
    $("adminUid").focus();
  } else if (action.endsWith("-application")) {
    perform(control, () => reviewApplication(id, action.startsWith("approve")), "Solicitud revisada.");
  } else if (action.endsWith("-profile")) {
    const reason = control.closest("[data-request]").querySelector("textarea").value;
    perform(control, () => reviewProfile(id, action.startsWith("approve"), reason), "Cambios revisados.");
  } else if (action === "moderate-viewer") {
    const viewer = data.viewers.find(item => item.id === id);
    perform(control, () => moderateViewer(id, viewer.status === "suspended" ? "active" : "suspended"), "Estado del viewer actualizado.");
  } else if (action === "toggle-tipster") {
    perform(control, () => runTransaction(db, async transaction => {
      const ref = doc(db, "perfiles", id);
      const profile = await transaction.get(ref);
      if (!profile.exists()) throw new Error("El perfil ya no existe.");
      transaction.update(ref, { tipster_status: profile.data().tipster_status === "approved" ? "revoked" : "approved" });
    }), "Permiso de publicación actualizado.");
  }
});
$("sign-out").addEventListener("click", event => perform(event.currentTarget, () => signOut(auth), "Sesión cerrada."));
if (!firebaseConfigured) {
  deny(firebaseConfigError);
} else {
  stopAuth = onAuthStateChanged(auth, user => {
    if (disposed) return;
    if (stopPermissions) stopPermissions();
    generation++;
    stopData();
    access = null;
    $("dashboard").classList.add("hidden");
    $("auth-message").classList.add("hidden");
    $("signed-out").classList.add("hidden");
    $("auth-loading").classList.remove("hidden");
    if (!user) {
      $("auth-loading").classList.add("hidden");
      $("signed-out").classList.remove("hidden");
      return;
    }
    stopPermissions = watchAccountPermissions(user, permissions => {
      if (disposed || auth.currentUser?.uid !== user.uid) return;
      if (!permissions.isAdmin) {
        deny(permissions.suspended ? "Tu cuenta está suspendida." : user.emailVerified
          ? "Tu cuenta no tiene permisos administrativos habilitados." : "Verifica tu correo antes de entrar.");
        return;
      }
      const changed = JSON.stringify(access) !== JSON.stringify(permissions);
      access = permissions;
      $("auth-loading").classList.add("hidden");
      $("auth-message").classList.add("hidden");
      $("dashboard").classList.remove("hidden");
      $("user-email").textContent = user.email || user.uid;
      $("admin-role").textContent = permissions.isSuperAdmin ? "Super Admin · gobierno y operación" : "Admin · permisos operativos asignados";
      for (const name of Object.keys(tabs)) $(`${name}-tab`).hidden = !can(name);
      if (changed) {
        startData();
        const next = can(activeTab) ? activeTab : Object.keys(tabs).find(can);
        for (const name of Object.keys(tabs)) $(`${name}-panel`).hidden = true;
        if (next) selectTab(next);
        else notice("No tienes permisos operativos asignados.");
      }
    }, error => deny("No se pudieron comprobar tus permisos. Recarga para reintentar.", error));
  }, error => deny("No se pudo restaurar tu sesión. Recarga para reintentar.", error));
}
return () => {
  disposed = true;
  generation++;
  if (stopAuth) stopAuth();
  if (stopPermissions) stopPermissions();
  stopData();
};
}
