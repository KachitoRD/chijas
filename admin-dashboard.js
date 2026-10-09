import { firebaseAuth as auth, firebaseDb as db, firebaseConfigured, firebaseConfigError } from "./firebase-config.js?v=2";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { watchAccountPermissions, operationalPermissions } from "./permissions.js";
import { moderateViewer, reviewApplication, reviewProfile, saveAdministrators, saveCommunityBlacklist, saveLimits, saveTakeRate } from "./admin-services.js";
import { normalizePick, summarizePerformance } from "./pick-schema.js";
import { groupPicksByTipster } from "./admin-dashboard-models.js";
import { summarizePublishedPickUnits } from "./admin-finance.js";

export function mountAdminView(root) {
const $ = id => root.querySelector(`#${CSS.escape(id)}`);
let disposed = false, stopAuth = null;
let access = null, generation = 0, stopPermissions = null, stops = [], clock = null;
let data = {}, errors = new Set(), activeTab = null, filterUserId = null, lastDataUpdate = null;
const busyOperations = new Set();
const tabs = { metrics: "kpis", finance: "super", operations: "tipsters", profiles: "profiles", viewers: "viewers", community: "community", governance: "super" };
const tipsterFilterStorageKey = uid => `admin-tipster-filters:${uid}`;
const financeFilterStorageKey = uid => `admin-finance-filters:${uid}`;
const viewerFilterStorageKey = uid => `admin-viewer-filters:${uid}`;
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
function formatPercent(value) {
  return `${Number.isInteger(value) ? value : Number(value.toFixed(2))} %`;
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
  const message = $("admin-message");
  message.textContent = text;
  message.dataset.error = String(error);
}
function updateRetryButton() {
  const retry = $("retry-data");
  retry.hidden = errors.size === 0;
  if (retry.hidden) retry.disabled = false;
  updateLiveStatus();
}
function updateLiveStatus() {
  const status = $("admin-live-status");
  const label = $("admin-live-label");
  const updated = $("admin-data-updated");
  if (errors.size) {
    status.dataset.state = "degraded";
    label.textContent = "Datos parciales";
  } else if (lastDataUpdate) {
    status.dataset.state = "connected";
    label.textContent = "Conectado";
  } else {
    status.dataset.state = "connecting";
    label.textContent = "Conectando datos";
  }
  if (lastDataUpdate) {
    updated.dateTime = lastDataUpdate.toISOString();
    updated.textContent = `Actualizado ${lastDataUpdate.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    updated.removeAttribute("datetime");
    updated.textContent = "Sin actualización";
  }
}
function stopData() {
  stops.forEach(stop => stop());
  stops = [];
  if (clock) clearInterval(clock);
  clock = null;
  data = {};
  errors = new Set();
  lastDataUpdate = null;
  updateRetryButton();
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
  const overview = tab === "metrics";
  $("admin-page-title").textContent = ({
    metrics: "Resumen ejecutivo",
    finance: "Configuración financiera",
    operations: "Operación de tipsters",
    profiles: "Revisión de perfiles",
    viewers: "Cuentas y moderación",
    community: "Moderación comunitaria",
    governance: "Gobierno y permisos"
  })[tab];
  const descriptions = {
    metrics: "Indicadores operativos y bandeja de revisión en una sola vista.",
    finance: "Configura porcentajes futuros; no hay cobros ni liquidaciones activos.",
    operations: "Gestiona solicitudes editoriales, publicaciones y rendimiento de tipsters.",
    profiles: "Compara y resuelve cambios propuestos por tipsters.",
    viewers: "Busca cuentas viewer y administra sus restricciones disponibles.",
    community: "Gestiona el filtro de comentarios del mural.",
    governance: "Administra los límites globales y el acceso administrativo."
  };
  $("admin-page-description").textContent = descriptions[tab];
  $("executive-kpis").hidden = !overview || !can("metrics");
  $("executive-scope-note").hidden = !overview || !can("metrics");
  if (focus) $(`${tab}-tab`).focus();
}
function live(key, source) {
  const current = generation;
  stops.push(onSnapshot(source, snapshot => {
    if (disposed || current !== generation) return;
    errors.delete(key);
    if (!errors.size && $("admin-message").dataset.error === "true") notice("");
    try {
      data[key] = snapshot.docs ? snapshot.docs.map(item => key === "picks"
        ? normalizePick({ ...item.data(), id: item.id }) : { ...item.data(), id: item.id })
        : key === "communitySettings" ? { __exists: snapshot.exists(), ...snapshot.data() } : snapshot.data();
      lastDataUpdate = new Date();
    } catch (error) {
      console.error("No se pudo interpretar el historial administrativo:", error);
      errors.add(key);
      delete data[key];
      notice("El historial contiene un pronóstico inválido. Revisa los datos antes de calcular métricas.", true);
    }
    updateRetryButton();
    render(key);
  }, error => {
    if (disposed || current !== generation) return;
    console.error(`No se pudo cargar ${key}:`, error);
    errors.add(key);
    delete data[key];
    notice(`No se pudo cargar ${key}. Reintenta para volver a conectar los datos.`, true);
    updateRetryButton();
    render(key);
  }));
}
function startData() {
  generation++;
  stopData();
  renderReviewQueue();
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
  if (can("community")) live("communitySettings", doc(db, "platformSettings", "communityModeration"));
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
function asDate(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : value ? new Date(value) : null);
  return date && Number.isFinite(date.getTime()) ? date : null;
}
function dateLabel(value) {
  const date = asDate(value);
  return date ? date.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }) : "Fecha no disponible";
}
function renderReviewQueue() {
  const target = $("review-queue");
  const keys = [
    ...(can("operations") ? ["applications"] : []),
    ...(can("profiles") ? ["requests"] : [])
  ];
  $("tipster-pending-count").textContent = can("operations")
    ? errors.has("applications") ? "!" : String(data.applications?.length ?? 0) : "—";
  $("profile-pending-count").textContent = can("profiles")
    ? errors.has("requests") ? "!" : String(data.requests?.length ?? 0) : "—";
  if (!keys.length) {
    $("review-queue-total").textContent = "Sin acceso";
    target.replaceChildren(node("p", "Tu cuenta no tiene permisos para consultar solicitudes.", "admin-state"));
    return;
  }
  const failed = keys.filter(key => errors.has(key));
  if (failed.length) {
    $("review-queue-total").textContent = "No disponible";
    target.replaceChildren(node("p", "No se pudo cargar toda la bandeja. Usa «Reintentar carga» para volver a conectar.", "admin-state admin-state-error"));
    return;
  }
  if (!loaded(keys)) {
    $("review-queue-total").textContent = "Cargando…";
    target.replaceChildren(node("p", "Cargando solicitudes…", "admin-state"));
    return;
  }

  const items = [
    ...(can("operations") ? data.applications.map(application => ({
      kind: "tipster", id: application.id, createdAt: application.submitted_at,
      title: application.display_name || "Solicitud de tipster",
      identity: `@${application.requested_username || "sin usuario"} · ${application.email || application.id}`,
      search: `${application.display_name || ""} ${application.requested_username || ""} ${application.email || ""} ${application.id}`,
      label: "Solicitud de tipster"
    })) : []),
    ...(can("profiles") ? data.requests.map(request => {
      const profile = data.profiles?.find(item => item.id === request.uid);
      return {
        kind: "profile", id: request.id, createdAt: request.created_at,
        title: profile?.nombre_publico || "Solicitud de perfil",
        identity: `@${profile?.username || "sin usuario"} · ${request.uid}`,
        search: `${profile?.nombre_publico || ""} ${profile?.username || ""} ${request.uid}`,
        label: "Solicitud de perfil"
      };
    }) : [])
  ];
  $("review-queue-total").textContent = `${items.length} ${items.length === 1 ? "pendiente" : "pendientes"}`;

  const queryText = $("reviewSearch").value.trim().toLocaleLowerCase();
  const type = $("reviewTypeFilter").value;
  const age = $("reviewAgeFilter").value;
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const visible = items.filter(item => {
    const timestamp = asDate(item.createdAt)?.getTime() ?? null;
    return (type === "all" || item.kind === type)
      && (!queryText || `${item.search} ${item.label}`.toLocaleLowerCase().includes(queryText))
      && (age === "all" || (timestamp !== null && (
        age === "last24h" ? timestamp >= cutoff24h
          : age === "last7d" ? timestamp >= cutoff7d
            : timestamp < cutoff7d
      )));
  });
  visible.sort((a, b) => {
    const left = asDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const right = asDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return (left - right) * ($("reviewSort").value === "newest" ? -1 : 1);
  });
  target.replaceChildren();
  if (!visible.length) {
    target.append(node("p", items.length
      ? "No hay solicitudes que coincidan. Prueba cambiando la búsqueda o los filtros."
      : "No hay solicitudes pendientes. Las nuevas solicitudes aparecerán aquí.", "admin-state"));
    return;
  }
  for (const item of visible) {
    const row = node("article", "", "admin-review-row");
    row.dataset.reviewItem = item.id;
    row.dataset.reviewKind = item.kind;
    const main = node("div", "", "admin-review-main");
    const badge = node("span", item.label, `admin-review-type admin-review-type-${item.kind}`);
    main.append(badge, node("strong", item.title), node("span", item.identity, "admin-review-identity"));
    const metadata = node("div", "", "admin-review-meta");
    metadata.append(node("span", "Pendiente", "admin-status-pill"),
      node("time", dateLabel(item.createdAt), "admin-review-date"));
    const open = button("Abrir revisión", "go-to-review", item.id);
    open.dataset.kind = item.kind;
    row.append(main, metadata, open);
    target.append(row);
  }
}
function renderExecutiveKPIs() {
  if (!access) return;
  $("executive-volume").textContent = !can("metrics") ? "Sin permiso"
    : $("stake-units").textContent === "Cargando…" ? "Cargando…" : $("stake-units").textContent;
  $("executive-viewers").textContent = !can("metrics") ? "Sin permiso"
    : errors.has("viewerPresence") ? "No disponible"
      : Object.hasOwn(data, "viewerPresence") ? String(data.viewerPresence.filter(connected).length) : "Cargando…";

  const alertSources = [
    ...(can("operations") ? ["applications"] : []),
    ...(can("profiles") ? ["requests"] : [])
  ];
  const alertUnavailable = alertSources.some(key => errors.has(key));
  const alertsReady = alertSources.length && alertSources.every(key => Object.hasOwn(data, key));
  $("executive-alerts").textContent = !alertSources.length ? "Sin acceso"
    : alertUnavailable ? "No disponible"
      : alertsReady ? String(alertSources.reduce((count, key) => count + data[key].length, 0)) : "Cargando…";
  $("executive-alerts-note").textContent = !alertSources.length ? "Sin permiso para consultar las colas"
    : alertUnavailable ? "No se pudieron cargar las solicitudes"
      : `${can("operations") ? "Tipsters" : ""}${can("operations") && can("profiles") ? " y " : ""}${can("profiles") ? "cambios de perfil" : ""} · sin reportes de comunidad`;
}
function dateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Completa ambas fechas del periodo personalizado.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("El rango contiene una fecha inválida.");
  }
  return date;
}
function financialRange() {
  const period = $("financePeriod").value;
  if (period === "all") return { start: null, end: null };
  if (period === "custom") {
    const start = localDate($("financeFrom").value);
    const through = localDate($("financeThrough").value);
    if (start > through) throw new Error("Desde no puede ser posterior a Hasta.");
    const end = new Date(through);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const days = Number(period);
  if (![7, 30, 90].includes(days)) throw new Error("Selecciona un periodo válido.");
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
function renderFinancialChart(result) {
  const target = $("finance-chart");
  target.replaceChildren();
  if (!result.daily.length) {
    target.append(node("p", "No hay picks fechados en este periodo.", "text-sm text-zinc-400"));
    return;
  }

  const groupSize = Math.ceil(result.daily.length / 30);
  const groups = [];
  for (let index = 0; index < result.daily.length; index += groupSize) {
    const days = result.daily.slice(index, index + groupSize);
    groups.push({
      from: days[0].date, through: days.at(-1).date,
      stakeUnits: days.reduce((sum, day) => sum + day.stakeUnits, 0),
      netResultUnits: days.reduce((sum, day) => sum + day.netResultUnits, 0)
    });
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 760 250");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", "financial-chart-title financial-chart-description");
  const title = document.createElementNS(svg.namespaceURI, "title");
  title.id = "financial-chart-title";
  title.textContent = "Volumen y resultado estimado en unidades públicas";
  const description = document.createElementNS(svg.namespaceURI, "desc");
  description.id = "financial-chart-description";
  description.textContent = "Barras de stake publicado y línea de resultado neto de picks cerrados. Las cantidades no representan moneda.";
  svg.append(title, description);

  const line = (x1, y1, x2, y2, color, width = 1) => {
    const element = document.createElementNS(svg.namespaceURI, "line");
    for (const [name, value] of Object.entries({ x1, y1, x2, y2, stroke: color, "stroke-width": width })) {
      element.setAttribute(name, String(value));
    }
    svg.append(element);
    return element;
  };
  line(40, 108, 744, 108, "rgb(187 206 195 / .35)");
  line(40, 183, 744, 183, "rgb(187 206 195 / .35)");
  const maxStake = Math.max(1, ...groups.map(group => group.stakeUnits));
  const maxNet = Math.max(1, ...groups.map(group => Math.abs(group.netResultUnits)));
  const slot = 704 / groups.length;
  const points = [];
  groups.forEach((group, index) => {
    const center = 40 + (index + .5) * slot;
    const barHeight = group.stakeUnits / maxStake * 68;
    const bar = document.createElementNS(svg.namespaceURI, "rect");
    bar.setAttribute("x", String(center - Math.min(16, slot * .28)));
    bar.setAttribute("y", String(106 - barHeight));
    bar.setAttribute("width", String(Math.max(2, Math.min(32, slot * .56))));
    bar.setAttribute("height", String(barHeight));
    bar.setAttribute("rx", "3");
    bar.setAttribute("fill", "#34d399");
    bar.setAttribute("fill-opacity", ".72");
    bar.setAttribute("aria-label", `${group.from} a ${group.through}: ${group.stakeUnits.toFixed(2)} unidades de stake`);
    svg.append(bar);
    points.push(`${center},${183 - group.netResultUnits / maxNet * 36}`);
  });
  const trend = document.createElementNS(svg.namespaceURI, "polyline");
  trend.setAttribute("points", points.join(" "));
  trend.setAttribute("fill", "none");
  trend.setAttribute("stroke", "#a7f3d0");
  trend.setAttribute("stroke-width", "2.5");
  trend.setAttribute("stroke-linecap", "round");
  trend.setAttribute("stroke-linejoin", "round");
  svg.append(trend);

  for (const index of new Set([0, Math.floor((groups.length - 1) / 2), groups.length - 1])) {
    const label = document.createElementNS(svg.namespaceURI, "text");
    label.setAttribute("x", String(40 + (index + .5) * slot));
    label.setAttribute("y", "229");
    label.setAttribute("text-anchor", "middle");
    label.textContent = new Date(`${groups[index].from}T00:00:00`).toLocaleDateString("es", { day: "2-digit", month: "short" });
    svg.append(label);
  }
  target.append(svg);
  const legend = node("p", groups.length < result.daily.length
    ? "Barras: stake declarado · Línea: resultado neto estimado · Días agrupados para legibilidad."
    : "Barras: stake declarado · Línea: resultado neto estimado.",
  "mt-3 text-xs text-zinc-400");
  target.append(legend);
}
function renderFinancialMetrics() {
  if (!can("metrics")) return;
  const filterError = $("financial-filter-error");
  const chart = $("finance-chart");
  if (!loaded(["picks"])) {
    const message = errors.has("picks") ? "No disponible" : "Cargando…";
    for (const id of ["stake-units", "net-result-units", "period-pick-count", "settled-pick-count"]) $(id).textContent = message;
    $("executive-volume").textContent = message;
    chart.textContent = errors.has("picks") ? "No se pudieron cargar los picks. Recarga para reintentar." : "Cargando actividad…";
    filterError.hidden = true;
    $("financial-scope-note").textContent = "";
    return;
  }

  try {
    const range = financialRange();
    const summary = summarizePublishedPickUnits(data.picks, range);
    $("stake-units").textContent = `${summary.stakeUnits.toFixed(2)} u`;
    $("executive-volume").textContent = `${summary.stakeUnits.toFixed(2)} u`;
    $("net-result-units").textContent = `${summary.netResultUnits.toFixed(2)} u`;
    $("period-pick-count").textContent = String(summary.count);
    $("settled-pick-count").textContent = String(summary.settledCount);
    filterError.hidden = true;
    renderFinancialChart(summary);
    $("financial-scope-note").textContent = [
      `${summary.pendingCount} pendientes excluidos del resultado neto.`,
      `${summary.missingStake} picks sin stake público válido; ${summary.unavailableResult} cierres sin datos suficientes.`,
      `${summary.missingPublicationDate} picks históricos sin fecha de publicación, excluidos del análisis temporal.`
    ].join(" ");
  } catch (error) {
    for (const id of ["stake-units", "net-result-units", "period-pick-count", "settled-pick-count"]) $(id).textContent = "—";
    $("executive-volume").textContent = "—";
    chart.textContent = "No se muestran resultados hasta corregir el periodo seleccionado.";
    filterError.textContent = error.message;
    filterError.hidden = false;
    $("financial-scope-note").textContent = "";
  }
}
function renderMetrics() {
  if (!can("metrics")) return;
  renderFinancialMetrics();
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
  $("executive-viewers").textContent = String(data.viewerPresence.filter(connected).length);
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
    row.tabIndex = -1;
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
  const hasPickMetrics = can("metrics");
  const target = prepare("tipsters", hasPickMetrics ? ["profiles", "picks"] : ["profiles"]);
  if (!target) return;
  const status = $("tipsterStatusFilter").value;
  const volume = $("tipsterVolumeFilter").value;
  const performance = $("tipsterPerformanceFilter").value;
  const search = $("tipsterSearch").value.trim().toLocaleLowerCase();
  const sort = $("tipsterSort").value;
  $("tipsterVolumeFilter").disabled = !hasPickMetrics;
  $("tipsterPerformanceFilter").disabled = !hasPickMetrics;
  const picksByTipster = hasPickMetrics ? groupPicksByTipster(data.picks) : new Map();
  const profiles = data.profiles.filter(profile => ["approved", "revoked"].includes(profile.tipster_status))
    .map(profile => {
      const picks = picksByTipster.get(profile.id) || [];
      return { profile, picks, summary: hasPickMetrics ? summarizePerformance(picks) : null };
    })
    .filter(({ profile, picks, summary }) => (status === "all" || profile.tipster_status === status)
      && (!search || `${profile.nombre_publico || ""} ${profile.username || ""} ${profile.id}`.toLocaleLowerCase().includes(search))
      && (!hasPickMetrics || volume === "all" || picks.length >= Number(volume))
      && (!hasPickMetrics || performance === "all"
        || (performance === "positive" && summary.profit > 0)
        || (performance === "negative" && summary.profit < 0)
        || (performance === "neutral" && (summary.settledStake === 0 || summary.profit === 0))))
    .sort((left, right) => {
      if (sort === "volume") return right.picks.length - left.picks.length
        || (left.profile.nombre_publico || left.profile.username || left.profile.id)
          .localeCompare(right.profile.nombre_publico || right.profile.username || right.profile.id, "es");
      if (sort === "result") return (right.summary?.profit ?? 0) - (left.summary?.profit ?? 0)
        || (left.profile.nombre_publico || left.profile.username || left.profile.id)
          .localeCompare(right.profile.nombre_publico || right.profile.username || right.profile.id, "es");
      return (left.profile.nombre_publico || left.profile.username || left.profile.id)
        .localeCompare(right.profile.nombre_publico || right.profile.username || right.profile.id, "es");
    });
  if (!profiles.length) {
    target.textContent = "No hay tipsters que coincidan con estos filtros.";
    return;
  }

  const scroll = node("div", "", "admin-table-scroll");
  const table = node("table", "", "admin-tipster-table");
  const caption = node("caption", "Tipsters aprobados y revocados");
  caption.className = "sr-only";
  table.append(caption);
  const head = node("thead");
  const header = node("tr");
  for (const title of ["Tipster", "Estado", "Picks", "Resultado público", "Win rate", "Acciones"]) {
    const cell = node("th", title);
    cell.scope = "col";
    header.append(cell);
  }
  head.append(header);
  const body = node("tbody");
  for (const { profile, picks, summary } of profiles) {
    const row = node("tr");
    row.dataset.tipsterRow = profile.id;
    const name = node("td");
    name.append(node("span", profile.nombre_publico || profile.username || profile.id, "admin-tipster-name"));
    name.append(node("span", `@${profile.username || "sin usuario"} · ${profile.id}`, "admin-tipster-meta"));
    const state = node("td");
    const badge = node("span", profile.tipster_status === "approved" ? "Aprobado" : "Revocado", "admin-status-pill");
    badge.dataset.status = profile.tipster_status;
    state.append(badge);
    const count = node("td", summary ? String(picks.length) : "Sin permiso");
    const result = node("td", summary ? `${summary.profit.toFixed(2)} u` : "Sin permiso");
    const rate = node("td", summary?.winRate == null ? "Sin resultados" : `${summary.winRate.toFixed(1)} %`);
    const actions = node("td");
    const actionList = node("div", "", "admin-tipster-actions");
    actionList.append(button(profile.tipster_status === "approved" ? "Revocar publicación" : "Restaurar publicación", "toggle-tipster", profile.id));
    if (profile.username) {
      const link = node("a", "Ver perfil público", "admin-button");
      link.href = `index.html?u=${encodeURIComponent(profile.username)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.append(actionList, link);
    } else actions.append(actionList);
    row.append(name, state, count, result, rate, actions);
    body.append(row);
  }
  table.append(head, body);
  scroll.append(table);
  target.append(scroll);
}
function renderRequests() {
  if (!can("profiles")) return;
  const target = prepare("profileRequests", ["requests", "profiles", "social"]);
  if (!target) return;
  for (const request of data.requests) {
    const current = { ...data.profiles.find(item => item.id === request.uid), ...data.social.find(item => item.id === request.uid) };
    const article = node("article");
    article.dataset.request = request.id;
    article.tabIndex = -1;
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
  if (!target) {
    const state = errors.has("profiles") || errors.has("finance") ? "No disponible" : "Cargando…";
    $("finance-approved-count").textContent = state;
    $("finance-configured-rates").textContent = state;
    $("finance-average-rate").textContent = state;
    return;
  }
  const profiles = data.profiles.filter(item => item.tipster_status === "approved");
  const rates = new Map(data.finance.map(item => [item.id, item.takeRate]));
  const configuredRates = profiles.map(profile => rates.get(profile.id))
    .filter(value => Number.isFinite(value) && value >= 0 && value <= 100);
  const averageRate = configuredRates.length
    ? configuredRates.reduce((total, value) => total + value, 0) / configuredRates.length : null;
  $("finance-approved-count").textContent = String(profiles.length);
  $("finance-configured-rates").textContent = `${configuredRates.length} de ${profiles.length}`;
  $("finance-average-rate").textContent = averageRate === null ? "Sin datos" : formatPercent(averageRate);

  const search = $("financeSearch").value.trim().toLocaleLowerCase();
  const rateFilter = $("financeRateFilter").value;
  const sort = $("financeSort").value;
  const visibleProfiles = profiles
    .map(profile => ({ profile, rate: rates.get(profile.id) }))
    .filter(({ profile, rate }) => {
      const matchesSearch = `${profile.nombre_publico || ""} ${profile.username || ""} ${profile.id}`
        .toLocaleLowerCase().includes(search);
      const configured = Number.isFinite(rate) && rate >= 0 && rate <= 100;
      return matchesSearch
        && (rateFilter === "all" || (rateFilter === "configured" ? configured : !configured));
    })
    .sort((left, right) => {
      const leftName = left.profile.nombre_publico || left.profile.username || left.profile.id;
      const rightName = right.profile.nombre_publico || right.profile.username || right.profile.id;
      if (sort === "rate-high") return (right.rate ?? -1) - (left.rate ?? -1) || leftName.localeCompare(rightName, "es");
      if (sort === "rate-low") return (left.rate ?? 101) - (right.rate ?? 101) || leftName.localeCompare(rightName, "es");
      return leftName.localeCompare(rightName, "es");
    });

  const scroll = node("div", "", "admin-table-scroll");
  const table = node("table", "", "admin-finance-table");
  table.append(node("caption", "Tasas configuradas · no son importes ni pagos contabilizados"));
  const head = node("thead");
  const header = node("tr");
  for (const title of ["Tipster", "Plataforma", "Creador", "Configurar porcentaje"]) {
    const cell = node("th", title);
    cell.scope = "col";
    header.append(cell);
  }
  head.append(header);
  const body = node("tbody");
  table.append(head, body);

  for (const { profile, rate } of visibleProfiles) {
    const configured = Number.isFinite(rate) && rate >= 0 && rate <= 100;
    const currentRate = configured ? rate : null;
    const creatorRate = currentRate === null ? null : 100 - currentRate;
    const row = node("tr");
    row.dataset.finance = profile.id;
    const identity = node("td");
    identity.append(node("strong", profile.nombre_publico || profile.username || "Tipster"),
      node("span", `@${profile.username || "sin usuario"} · ${profile.id}`, "admin-finance-identity"));
    const platformShare = node("td", currentRate === null ? "Sin configurar" : formatPercent(currentRate));
    const creatorShare = node("td", creatorRate === null ? "Sin configurar" : formatPercent(creatorRate));
    const settings = node("td");
    const form = document.createElement("form");
    form.dataset.takeRate = profile.id;
    form.className = "admin-finance-rate-form";
    const label = node("label", "Comisión plataforma (%)", "admin-finance-rate-label");
    const input = document.createElement("input");
    Object.assign(input, {
      type: "number", name: "takeRate", min: "0", max: "100", step: "0.01",
      required: true, value: currentRate === null ? "" : String(currentRate)
    });
    label.append(input);
    const preview = node("span", currentRate === null
      ? "Define un porcentaje válido para previsualizar el reparto."
      : `Plataforma ${formatPercent(currentRate)} · Tipster ${formatPercent(creatorRate)}`,
    "admin-finance-share-preview");
    preview.dataset.sharePreview = "";
    form.append(label, preview);
    const save = node("button", "Guardar", "admin-button");
    save.type = "submit";
    form.append(save);
    settings.append(form);
    row.append(identity, platformShare, creatorShare, settings);
    body.append(row);
  }

  if (!visibleProfiles.length) {
    const emptyCell = node("td", profiles.length ? "Ningún tipster coincide con estos filtros." : "No hay tipsters aprobados.");
    emptyCell.colSpan = 4;
    const emptyRow = node("tr");
    emptyRow.append(emptyCell);
    body.append(emptyRow);
  }
  scroll.append(table);
  target.append(scroll);
}
function renderViewers() {
  if (!can("viewers")) return;
  const target = prepare("viewers-list", ["viewers", "viewerPresence"]);
  if (!target) {
    $("viewer-result-count").textContent = errors.has("viewers") || errors.has("viewerPresence") ? "Directorio no disponible" : "Cargando directorio…";
    return;
  }
  const search = $("viewerSearch").value.trim().toLocaleLowerCase();
  const statusFilter = $("viewerStatusFilter").value;
  const presenceFilter = $("viewerPresenceFilter").value;
  const sort = $("viewerSort").value;
  const presenceByUser = new Map(data.viewerPresence.map(item => [item.id, item]));
  const viewers = data.viewers.map(viewer => ({
    viewer,
    active: connected(presenceByUser.get(viewer.id)),
    created: asDate(viewer.created_at)
  })).filter(({ viewer, active }) => {
    const status = viewer.status === "suspended" ? "suspended" : "active";
    const text = `${viewer.displayName || ""} ${viewer.email || ""} ${viewer.id}`.toLocaleLowerCase();
    return (!search || text.includes(search))
      && (statusFilter === "all" || status === statusFilter)
      && (presenceFilter === "all" || (presenceFilter === "online" ? active : !active));
  }).sort((left, right) => {
    if (sort === "newest" || sort === "oldest") {
      const leftTime = left.created?.getTime() ?? (sort === "newest" ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
      const rightTime = right.created?.getTime() ?? (sort === "newest" ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
      const difference = sort === "newest" ? rightTime - leftTime : leftTime - rightTime;
      if (difference) return difference;
    }
    return (left.viewer.displayName || left.viewer.email || left.viewer.id)
      .localeCompare(right.viewer.displayName || right.viewer.email || right.viewer.id, "es");
  });
  $("viewer-result-count").textContent = `${viewers.length} de ${data.viewers.length} ${data.viewers.length === 1 ? "cuenta" : "cuentas"}`;

  const scroll = node("div", "", "admin-table-scroll");
  const table = node("table", "", "admin-viewer-table");
  const caption = node("caption", "Cuentas viewer y estado de moderación");
  caption.className = "sr-only";
  table.append(caption);
  const head = node("thead");
  const header = node("tr");
  for (const title of ["Cuenta", "Estado", "Actividad reciente", "Registro", "Acción"]) {
    const cell = node("th", title);
    cell.scope = "col";
    header.append(cell);
  }
  head.append(header);
  const body = node("tbody");
  table.append(head, body);
  for (const { viewer, active, created } of viewers) {
    const row = node("tr");
    row.dataset.viewer = viewer.id;
    row.dataset.createdAt = created?.toISOString() || "";
    const account = node("td");
    account.dataset.label = "Cuenta";
    account.append(node("strong", viewer.displayName || "Viewer sin nombre", "admin-viewer-name"),
      node("span", `${viewer.email || "Correo no registrado"} · ${viewer.id}`, "admin-viewer-meta"));
    const status = node("td");
    status.dataset.label = "Estado";
    const suspended = viewer.status === "suspended";
    const statusPill = node("span", suspended ? "Suspendido" : "Activo", "admin-status-pill");
    statusPill.dataset.status = suspended ? "suspended" : "active";
    status.append(statusPill);
    const presence = node("td", active ? "Conectado" : "Desconectado", "admin-viewer-presence");
    presence.dataset.label = "Actividad";
    const registered = node("td", created ? created.toLocaleDateString("es") : "No disponible");
    registered.dataset.label = "Registro";
    const actions = node("td");
    actions.dataset.label = "Acción";
    const action = button(suspended ? "Restaurar" : "Suspender", "moderate-viewer", viewer.id);
    const isCurrentUser = viewer.id === auth.currentUser?.uid;
    action.disabled = isCurrentUser;
    if (isCurrentUser) {
      action.title = "No puedes suspender tu propia cuenta.";
      action.setAttribute("aria-describedby", "viewer-self-moderation-note");
      const restriction = node("span", "No puedes suspender tu propia cuenta.", "admin-disabled-note");
      restriction.id = "viewer-self-moderation-note";
      actions.append(action, restriction);
    } else actions.append(action);
    row.append(account, status, presence, registered, actions);
    body.append(row);
  }
  if (!viewers.length) {
    const emptyRow = node("tr");
    const emptyCell = node("td", data.viewers.length
      ? "Ninguna cuenta coincide con la búsqueda o los filtros seleccionados."
      : "No hay cuentas viewer para mostrar.");
    emptyCell.colSpan = 5;
    emptyRow.append(emptyCell);
    body.append(emptyRow);
  }
  scroll.append(table);
  target.append(scroll);
}
function renderAdmins() {
  if (!can("governance")) return;
  const target = prepare("admins-list", ["admins"]);
  if (!target) return;
  for (const admin of data.admins) {
    const article = node("article");
    article.dataset.adminRow = admin.id;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.admin = admin.id;
    const isCurrentUser = admin.id === auth.currentUser.uid;
    checkbox.disabled = isCurrentUser;
    if (isCurrentUser) checkbox.setAttribute("aria-describedby", "admin-self-acl-note");
    const label = node("label", ` ${admin.id} · ${admin.role || "super_admin (legado)"} · ${admin.enabled ? "Habilitado" : "Revocado"}`);
    label.prepend(checkbox);
    const edit = button("Editar permisos", "edit-admin", admin.id);
    edit.disabled = isCurrentUser;
    if (isCurrentUser) {
      edit.title = "No puedes modificar tu propia ACL.";
      edit.setAttribute("aria-describedby", "admin-self-acl-note");
    }
    article.append(label, node("p", `Permisos: ${(admin.permissions || operationalPermissions).join(", ")}`, "mt-2 text-sm text-zinc-400"),
      edit);
    if (isCurrentUser) {
      const restriction = node("p", "No puedes modificar tu propia ACL ni revocar tu acceso desde esta sesión.", "admin-disabled-note");
      restriction.id = "admin-self-acl-note";
      article.append(restriction);
    }
    target.append(article);
  }
}
function render(key) {
  renderReviewQueue();
  renderExecutiveKPIs();
  if (["profiles", "picks", "presence", "viewerPresence", "viewers"].includes(key)) renderMetrics();
  if (key === "applications") renderApplications();
  if (["profiles", "picks"].includes(key)) renderTipsters();
  if (["requests", "profiles", "social"].includes(key)) renderRequests();
  if (["profiles", "finance"].includes(key)) renderFinance();
  if (["viewers", "viewerPresence"].includes(key)) renderViewers();
  if (key === "admins") renderAdmins();
  if (key === "settings" && can("governance") && Object.hasOwn(data, "settings")) {
    $("tipsterLimit").value = data.settings?.tipsterMonthlyPickLimit ?? 50;
    $("viewerLimit").value = data.settings?.viewerMonthlyPickLimit ?? 20;
  }
  if (key === "communitySettings" && can("community") && Object.hasOwn(data, "communitySettings")
    && document.activeElement !== $("communityBlockedTerms")) {
    const settings = data.communitySettings;
    if (settings.__exists && typeof settings.blockedTerms !== "string") {
      notice("La configuración guardada del filtro no tiene un formato válido. No la edites hasta revisar los datos.", true);
    } else {
      $("communityBlockedTerms").value = settings.__exists ? settings.blockedTerms : "";
    }
  }
}
function loadTipsterFilters(uid) {
  filterUserId = uid;
  const defaults = {
    search: "", status: "all", volume: "all", performance: "all", sort: "name",
    financeSearch: "", financeRateFilter: "all", financeSort: "name",
    viewerSearch: "", viewerStatus: "all", viewerPresence: "all", viewerSort: "name"
  };
  try {
    const legacy = JSON.parse(localStorage.getItem(tipsterFilterStorageKey(uid)) || "null");
    const tipsterFilters = legacy && typeof legacy === "object" ? legacy : defaults;
    const financeStored = JSON.parse(localStorage.getItem(financeFilterStorageKey(uid)) || "null");
    const financeFilters = financeStored && typeof financeStored === "object" ? financeStored : legacy || defaults;
    const viewerStored = JSON.parse(localStorage.getItem(viewerFilterStorageKey(uid)) || "null");
    const viewerFilters = viewerStored && typeof viewerStored === "object" ? viewerStored : legacy || defaults;
    $("tipsterSearch").value = typeof tipsterFilters.search === "string" ? tipsterFilters.search.slice(0, 100) : "";
    $("tipsterStatusFilter").value = ["all", "approved", "revoked"].includes(tipsterFilters.status) ? tipsterFilters.status : "all";
    $("tipsterVolumeFilter").value = ["all", "1", "10"].includes(tipsterFilters.volume) ? tipsterFilters.volume : "all";
    $("tipsterPerformanceFilter").value = ["all", "positive", "negative", "neutral"].includes(tipsterFilters.performance) ? tipsterFilters.performance : "all";
    $("tipsterSort").value = ["name", "volume", "result"].includes(tipsterFilters.sort) ? tipsterFilters.sort : "name";
    $("financeSearch").value = typeof financeFilters.financeSearch === "string" ? financeFilters.financeSearch.slice(0, 100) : "";
    $("financeRateFilter").value = ["all", "configured", "missing"].includes(financeFilters.financeRateFilter) ? financeFilters.financeRateFilter : "all";
    $("financeSort").value = ["name", "rate-high", "rate-low"].includes(financeFilters.financeSort) ? financeFilters.financeSort : "name";
    $("viewerSearch").value = typeof viewerFilters.viewerSearch === "string" ? viewerFilters.viewerSearch.slice(0, 100) : "";
    $("viewerStatusFilter").value = ["all", "active", "suspended"].includes(viewerFilters.viewerStatus) ? viewerFilters.viewerStatus : "all";
    $("viewerPresenceFilter").value = ["all", "online", "offline"].includes(viewerFilters.viewerPresence) ? viewerFilters.viewerPresence : "all";
    $("viewerSort").value = ["name", "newest", "oldest"].includes(viewerFilters.viewerSort) ? viewerFilters.viewerSort : "name";
    if (!financeStored) saveFinanceFilters();
    if (!viewerStored) saveViewerFilters();
  } catch (error) {
    console.error("No se pudieron restaurar los filtros administrativos:", error);
    notice("No se pudieron restaurar los filtros guardados. Puedes continuar y volver a configurarlos.", true);
  }
}
function saveTipsterFilters() {
  if (!filterUserId) return;
  try {
    localStorage.setItem(tipsterFilterStorageKey(filterUserId), JSON.stringify({
      search: $("tipsterSearch").value.slice(0, 100),
      status: $("tipsterStatusFilter").value,
      volume: $("tipsterVolumeFilter").value,
      performance: $("tipsterPerformanceFilter").value,
      sort: $("tipsterSort").value
    }));
  } catch (error) {
    console.error("No se pudieron guardar los filtros de tipsters:", error);
    notice("No se pudieron guardar los filtros en este navegador.", true);
  }
}
function saveFinanceFilters() {
  if (!filterUserId) return;
  try {
    localStorage.setItem(financeFilterStorageKey(filterUserId), JSON.stringify({
      financeSearch: $("financeSearch").value.slice(0, 100),
      financeRateFilter: $("financeRateFilter").value,
      financeSort: $("financeSort").value
    }));
  } catch (error) {
    console.error("No se pudieron guardar los filtros financieros:", error);
    notice("No se pudieron guardar los filtros financieros en este navegador.", true);
  }
}
function saveViewerFilters() {
  if (!filterUserId) return;
  try {
    localStorage.setItem(viewerFilterStorageKey(filterUserId), JSON.stringify({
      viewerSearch: $("viewerSearch").value.slice(0, 100),
      viewerStatus: $("viewerStatusFilter").value,
      viewerPresence: $("viewerPresenceFilter").value,
      viewerSort: $("viewerSort").value
    }));
  } catch (error) {
    console.error("No se pudieron guardar los filtros de viewers:", error);
    notice("No se pudieron guardar los filtros de viewers en este navegador.", true);
  }
}
async function perform(control, operation, message) {
  const scope = control.closest("[data-application], [data-request], [data-viewer], [data-take-rate]");
  const identity = scope?.dataset.application ? `application:${scope.dataset.application}`
    : scope?.dataset.request ? `profile:${scope.dataset.request}`
      : scope?.dataset.viewer ? `viewer:${scope.dataset.viewer}`
        : scope?.dataset.takeRate ? `take-rate:${scope.dataset.takeRate}`
          : `control:${control.id || control.dataset.action || "operation"}`;
  if (busyOperations.has(identity)) return;
  busyOperations.add(identity);
  const current = generation;
  const controls = scope ? [...scope.querySelectorAll("button, input, select, textarea")] : [control];
  const disabledStates = controls.map(item => item.disabled);
  controls.forEach(item => { item.disabled = true; });
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
    controls.forEach((item, index) => { item.disabled = disabledStates[index]; });
    busyOperations.delete(identity);
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
function updateViewerFilters() {
  saveViewerFilters();
  renderViewers();
}
$("viewerSearch").addEventListener("input", updateViewerFilters);
for (const filter of ["viewerStatusFilter", "viewerPresenceFilter", "viewerSort"]) {
  $(filter).addEventListener("change", updateViewerFilters);
}
$("viewer-clear-filters").addEventListener("click", () => {
  $("viewerSearch").value = "";
  $("viewerStatusFilter").value = "all";
  $("viewerPresenceFilter").value = "all";
  $("viewerSort").value = "name";
  updateViewerFilters();
  $("viewerSearch").focus();
});
for (const filterId of ["reviewSearch", "reviewTypeFilter", "reviewAgeFilter", "reviewSort"]) {
  $(filterId).addEventListener(filterId === "reviewSearch" ? "input" : "change", renderReviewQueue);
}
$("retry-data").addEventListener("click", event => {
  event.currentTarget.disabled = true;
  notice("Intentando volver a conectar los datos…");
  startData();
});
$("tipsterSearch").addEventListener("input", () => {
  saveTipsterFilters();
  renderTipsters();
});
for (const filter of root.querySelectorAll("[data-tipster-filter]")) {
  filter.addEventListener("change", () => {
    saveTipsterFilters();
    renderTipsters();
  });
}
$("financePeriod").addEventListener("change", () => {
  const custom = $("financePeriod").value === "custom";
  $("financeCustomRange").hidden = !custom;
  if (custom) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    if (!$("financeFrom").value) $("financeFrom").value = dateInputValue(from);
    if (!$("financeThrough").value) $("financeThrough").value = dateInputValue(today);
  }
  renderFinancialMetrics();
});
$("financeFrom").addEventListener("change", renderFinancialMetrics);
$("financeThrough").addEventListener("change", renderFinancialMetrics);
$("financeSearch").addEventListener("input", () => {
  saveFinanceFilters();
  renderFinance();
});
for (const filter of ["financeRateFilter", "financeSort"]) {
  $(filter).addEventListener("change", () => {
    saveFinanceFilters();
    renderFinance();
  });
}
$("finance-clear-filters").addEventListener("click", () => {
  $("financeSearch").value = "";
  $("financeRateFilter").value = "all";
  $("financeSort").value = "name";
  saveFinanceFilters();
  renderFinance();
  $("financeSearch").focus();
});
$("finance-list").addEventListener("input", event => {
  const input = event.target.closest('input[name="takeRate"]');
  if (!input) return;
  const preview = input.form.querySelector("[data-share-preview]");
  const rate = input.valueAsNumber;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    preview.textContent = "Indica un porcentaje de 0 a 100 para ver el reparto configurado.";
    return;
  }
  preview.textContent = `Plataforma ${formatPercent(rate)} · Tipster ${formatPercent(100 - rate)}`;
});
$("settingsForm").addEventListener("submit", event => {
  event.preventDefault();
  const submitter = event.submitter || $("settingsForm").querySelector('button[type="submit"]');
  perform(submitter, () => saveLimits(Number($("tipsterLimit").value), Number($("viewerLimit").value)), "Límites guardados.");
});
$("communityModerationForm").addEventListener("submit", event => {
  event.preventDefault();
  const submitter = event.submitter || $("communityModerationForm").querySelector('button[type="submit"]');
  perform(submitter, () => saveCommunityBlacklist($("communityBlockedTerms").value),
    "Filtro guardado. Se aplica en la interfaz; no es una barrera contra clientes modificados.");
});
$("roleForm").addEventListener("submit", event => {
  event.preventDefault();
  const submitter = event.submitter || $("roleForm").querySelector('button[type="submit"]');
  const uids = [...new Set($("adminUid").value.split(/\s+/).filter(Boolean))];
  const permissions = [...$("roleForm").querySelectorAll('input[name="permission"]:checked')].map(input => input.value);
  perform(submitter, () => saveAdministrators(uids, $("adminRole").value, permissions, $("adminEnabled").checked), "Permisos guardados.");
});
$("finance-list").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target.closest("[data-take-rate]");
  if (!form) return;
  const submitter = event.submitter || form.querySelector('button[type="submit"]');
  perform(submitter, () => saveTakeRate(form.dataset.takeRate, Number(form.elements.takeRate.value)), "Comisión guardada.");
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
  } else if (action === "go-to-review") {
    const tab = control.dataset.kind === "tipster" ? "operations" : "profiles";
    selectTab(tab);
    requestAnimationFrame(() => {
      const row = control.dataset.kind === "tipster"
        ? root.querySelector(`[data-application="${CSS.escape(id)}"]`)
        : root.querySelector(`[data-request="${CSS.escape(id)}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      row?.focus({ preventScroll: true });
    });
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
      if (filterUserId !== user.uid) loadTipsterFilters(user.uid);
      $("auth-loading").classList.add("hidden");
      $("auth-message").classList.add("hidden");
      $("dashboard").classList.remove("hidden");
      $("user-email").textContent = user.email || user.uid;
      $("admin-role").textContent = permissions.isSuperAdmin ? "Super Admin · gobierno y operación" : "Admin · permisos operativos asignados";
      for (const name of Object.keys(tabs)) $(`${name}-tab`).hidden = !can(name);
      $("review-queue").closest(".admin-review-inbox").hidden = !(can("operations") || can("profiles"));
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
