import { firebaseAuth, firebaseDb, firebaseConfigured } from "./firebase-config.js?v=2";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { watchAccountPermissions } from "./permissions.js";

const $ = id => document.getElementById(id);
const layout = document.querySelector(".viewer-layout");
const content = $("dashboardViewContent");
const definitions = {
  settings: { title: "Configuración de perfil", template: "account-settings.html", styles: ["account-settings.css"], module: "./account-settings.js", mount: "mountAccountSettings" },
  admin: { title: "Panel de Administración", template: "admin-dashboard.html", styles: ["admin-view.css"], module: "./admin-dashboard.js", mount: "mountAdminView" },
  tipster: { title: "Panel de Tipster", template: "tipster-dashboard.html", styles: ["button-styles.css", "tipster-view.css"], module: "./tipster-view.js", mount: "mountTipsterView" }
};
let permissions = null, user = null, stopPermissions = null, cleanup = null;
let stopSettings = null;
let viewerSettings = {};
let activeView = "streaming", generation = 0, authGeneration = 0, requestController = null;
const assets = new Map();
function allowed(view) {
  return view === "streaming" || Boolean(user && permissions && !permissions.suspended
    && (view === "settings" || (view === "admin" ? permissions.isAdmin : view === "tipster" && permissions.canPublish)));
}
function closeMenu() {
  if ($("userMenu").matches(":popover-open")) $("userMenu").hidePopover();
}
function routeView() {
  const view = new URLSearchParams(location.hash.slice(1)).get("view");
  return Object.hasOwn(definitions, view) ? view : "streaming";
}
function setRoute(view, replace = false) {
  const url = new URL(location.href);
  url.hash = view === "streaming" ? "" : `view=${view}`;
  history[replace ? "replaceState" : "pushState"]({ ...history.state, view }, "", url);
}
function stopDashboard() {
  generation++;
  requestController?.abort();
  requestController = null;
  if (cleanup) cleanup();
  cleanup = null;
  content.replaceChildren();
}
function showFeed() {
  stopDashboard();
  activeView = "streaming";
  $("dashboardView").hidden = true;
  $("viewerMain").hidden = false;
  layout.classList.remove("showing-dashboard");
  window.dispatchEvent(new CustomEvent("fijas:dashboard", { detail: { open: false } }));
}
function asset(url, script = false) {
  if (assets.has(url)) return assets.get(url);
  const promise = new Promise((resolve, reject) => {
    const element = document.createElement(script ? "script" : "link");
    if (script) element.src = url;
    else { element.rel = "stylesheet"; element.href = url; }
    element.onload = resolve;
    element.onerror = () => {
      assets.delete(url);
      element.remove();
      reject(new Error(`No se pudo cargar ${url}. Comprueba la conexión y reintenta.`));
    };
    document.head.append(element);
  });
  assets.set(url, promise);
  return promise;
}
async function navigate(view, { updateHistory = true, reload = false } = {}) {
  closeMenu();
  if (!allowed(view)) {
    showFeed();
    setRoute("streaming", true);
    return;
  }
  if (view === activeView && !reload) return;
  if (view === "streaming") {
    showFeed();
    if (updateHistory) setRoute(view);
    $("viewerMain").focus({ preventScroll: true });
    return;
  }
  stopDashboard();
  const current = generation;
  const uid = user.uid;
  activeView = view;
  if (updateHistory) setRoute(view);
  $("viewerMain").hidden = true;
  $("dashboardView").hidden = false;
  $("dashboardView").dataset.view = view;
  layout.classList.add("showing-dashboard");
  window.dispatchEvent(new CustomEvent("fijas:dashboard", { detail: { open: true, view } }));
  $("nativeDashboardTitle").textContent = definitions[view].title;
  const status = document.createElement("p");
  status.className = "native-dashboard-status";
  status.setAttribute("role", "status");
  status.textContent = "Cargando tu panel…";
  content.append(status);
  $("dashboardView").focus({ preventScroll: true });
  requestController = new AbortController();
  try {
    const definition = definitions[view];
    const response = await fetch(definition.template, { signal: requestController.signal });
    if (!response.ok) throw new Error(`No se pudo cargar el panel (${response.status}).`);
    const html = await response.text();
    await Promise.all(definition.styles.map(url => asset(url)));
    const module = await import(definition.module);
    if (generation !== current || firebaseAuth.currentUser?.uid !== uid || !allowed(view)) return;
    // Templates are repository-owned HTML; scripts are never evaluated as part of navigation.
    const template = new DOMParser().parseFromString(html, "text/html");
    template.querySelectorAll("script").forEach(element => element.remove());
    const root = document.createElement("div");
    root.className = "native-dashboard-component";
    root.append(...template.body.childNodes);
    if (view === "tipster") {
      root.querySelector("#loginForm").hidden = true;
      root.querySelector("#loginView").append(root.querySelector("#loginMessage"));
      const signIn = document.createElement("button");
      signIn.type = "button";
      signIn.dataset.returnStreaming = "";
      signIn.className = "community-control";
      signIn.textContent = "Volver al inicio de sesión";
      root.querySelector("#loginView").append(signIn);
    }
    content.replaceChildren(root);
    cleanup = module[definition.mount](root, { embedded: true });
  } catch (error) {
    if (current !== generation) return;
    console.error("No se pudo abrir la vista integrada:", error);
    content.replaceChildren();
    const message = document.createElement("p");
    message.className = "native-dashboard-status";
    message.setAttribute("role", "alert");
    message.textContent = `${error.message} Puedes regresar al streaming o reintentar.`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "community-control";
    retry.textContent = "Reintentar";
    retry.addEventListener("click", () => void navigate(view, { updateHistory: false, reload: true }), { once: true });
    content.append(message, retry);
  }
}
function updateMenu() {
  $("userMenuButton").hidden = !user;
  $("userMenuEmail").textContent = user?.email || "";
  $("userAvatar").textContent = (user?.displayName || user?.email || "U").charAt(0).toUpperCase();
  $("userAdminLink").hidden = !allowed("admin");
  $("userTipsterLink").hidden = !allowed("tipster");
  const labels = { viewer: "Viewer", tipster: "Tipster aprobado", admin: "Administrador", super_admin: "Super Admin" };
  $("userMenuRole").textContent = permissions?.suspended ? "Cuenta suspendida"
    : permissions ? labels[permissions.role] || "Correo pendiente de verificación" : "Comprobando permisos…";
  applySettings(viewerSettings);
}
function applySettings(settings = {}) {
  const name = settings.displayName ?? user?.displayName ?? user?.email ?? "Tu cuenta";
  $("viewerName").textContent = name;
  const avatar = $("userAvatar");
  avatar.replaceChildren();
  avatar.textContent = name.charAt(0).toUpperCase();
  if (settings.photoURL) {
    const img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.src = settings.photoURL;
    img.addEventListener("error", () => {
      avatar.textContent = name.charAt(0).toUpperCase();
    }, { once: true });
    avatar.replaceChildren(img);
  }
  document.body.dataset.viewerTheme = settings.theme || "emerald";
  $("muralEntries").setAttribute("aria-live", settings.notifications === false ? "off" : "polite");
}
$("userMenu").addEventListener("toggle", event => {
  const open = event.newState === "open";
  $("userMenuButton").setAttribute("aria-expanded", String(open));
  if (!open) return;
  const bounds = $("userMenuButton").getBoundingClientRect();
  $("userMenu").style.top = `${bounds.bottom + 8}px`;
  $("userMenu").style.right = `${Math.max(12, innerWidth - bounds.right)}px`;
});
$("userMenu").addEventListener("click", event => {
  const link = event.target.closest("[data-dashboard]");
  if (!link) return;
  event.preventDefault();
  void navigate(link.dataset.dashboard);
});
$("returnStreaming").addEventListener("click", () => void navigate("streaming"));
$("dashboardView").addEventListener("click", event => {
  const link = event.target.closest('a[href="index.html"], a[href="./"], a#publicProfileLink, [data-return-streaming]');
  if (!link) return;
  event.preventDefault();
  if (link.id === "publicProfileLink") {
    const url = new URL(link.href);
    history.pushState({}, "", `${url.pathname}${url.search}`);
    dispatchEvent(new PopStateEvent("popstate"));
  }
  void navigate("streaming");
});
$("dashboardView").addEventListener("dashboard:navigate", event => {
  void navigate(event.detail.view, { reload: event.detail.reload === true });
});
function followHistory() {
  if (permissions) void navigate(routeView(), { updateHistory: false });
}
addEventListener("popstate", followHistory);
addEventListener("hashchange", followHistory);
addEventListener("resize", closeMenu);
if (firebaseConfigured) {
  onAuthStateChanged(firebaseAuth, account => {
    const current = ++authGeneration;
    const hadUser = Boolean(user);
    if (stopPermissions) stopPermissions();
    if (stopSettings) stopSettings();
    stopSettings = null;
    stopPermissions = null;
    closeMenu();
    showFeed();
    user = account;
    viewerSettings = {};
    permissions = null;
    updateMenu();
    applySettings();
    if (!account) {
      if (hadUser && routeView() !== "streaming") setRoute("streaming", true);
      return;
    }
    stopSettings = onSnapshot(doc(firebaseDb, "users", account.uid, "settings", "profile"), snapshot => {
      if (current !== authGeneration) return;
      viewerSettings = snapshot.data() || {};
      applySettings(viewerSettings);
    }, error => {
      if (current !== authGeneration) return;
      console.error("No se pudieron cargar las preferencias del espectador:", error);
      $("communityMessage").textContent = "No se pudo cargar tu configuración de perfil. Recarga para reintentar.";
      $("communityMessage").classList.remove("hidden");
    });
    stopPermissions = watchAccountPermissions(account, value => {
      if (current !== authGeneration) return;
      permissions = value;
      updateMenu();
      if (!allowed(activeView)) {
        showFeed();
        setRoute("streaming", true);
      } else if (activeView === "streaming" && routeView() !== "streaming") {
        void navigate(routeView(), { updateHistory: false });
      }
    }, error => {
      if (current !== authGeneration) return;
      console.error("No se pudieron comprobar los accesos del menú:", error);
      permissions = null;
      updateMenu();
      $("userMenuRole").textContent = "No se pudieron comprobar tus permisos. Recarga para reintentar.";
      showFeed();
      setRoute("streaming", true);
    });
  });
}
