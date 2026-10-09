import { mountCommunityMural } from "./community-mural.js";

const $ = id => document.getElementById(id);
const layout = document.querySelector(".viewer-layout");
const mural = $("communityMural");
const drawer = $("muralDrawer");
const mobile = matchMedia("(max-width: 900px)");
let dashboardOpen = false;

function syncMuralPlacement() {
  $("openMural").hidden = dashboardOpen || !mobile.matches;
  $("toggleMural").hidden = dashboardOpen || mobile.matches;
  if (mobile.matches) {
    if (mural.parentElement !== drawer) drawer.append(mural);
    return;
  }
  if (drawer.open) drawer.close();
  if (mural.parentElement !== layout) layout.append(mural);
}

function setChannelsCollapsed(collapsed) {
  layout.classList.toggle("channels-collapsed", collapsed);
  $("toggleChannels").setAttribute("aria-expanded", String(!collapsed));
  $("toggleChannels").setAttribute("aria-label", collapsed ? "Mostrar tipsters" : "Reducir barra de tipsters");
}

function setMuralCollapsed(collapsed) {
  layout.classList.toggle("mural-collapsed", collapsed);
  $("toggleMural").setAttribute("aria-expanded", String(!collapsed));
  $("toggleMural").setAttribute("aria-label", collapsed ? "Mostrar mural" : "Ocultar mural");
  if (collapsed && drawer.open) drawer.close();
}

function openMural() {
  if (mobile.matches && !drawer.open) {
    drawer.showModal();
    $("openMural").setAttribute("aria-expanded", "true");
    $("muralEntries").focus({ preventScroll: true });
  }
}

function closeMural() {
  if (drawer.open) drawer.close();
}

$("toggleChannels").addEventListener("click", () => {
  setChannelsCollapsed(!layout.classList.contains("channels-collapsed"));
});
$("toggleMural").addEventListener("click", () => {
  setMuralCollapsed(!layout.classList.contains("mural-collapsed"));
});
$("openMural").addEventListener("click", openMural);
$("closeMural").addEventListener("click", closeMural);
drawer.addEventListener("close", () => $("openMural").setAttribute("aria-expanded", "false"));
drawer.addEventListener("click", event => {
  if (event.target !== drawer) return;
  const bounds = drawer.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMural();
});
mobile.addEventListener("change", syncMuralPlacement);
window.addEventListener("fijas:dashboard", event => {
  dashboardOpen = event.detail?.open === true;
  syncMuralPlacement();
  if (dashboardOpen) closeMural();
});
window.addEventListener("fijas:mural-open", () => {
  if (dashboardOpen) return;
  if (mobile.matches) openMural();
  else if (layout.classList.contains("mural-collapsed")) setMuralCollapsed(false);
});

syncMuralPlacement();
mountCommunityMural();
