import { mountCommunityMural } from "./community-mural.js";

const $ = id => document.getElementById(id);
const layout = document.querySelector(".viewer-layout");
const mural = $("communityMural");
const drawer = $("muralDrawer");
const mobile = matchMedia("(max-width: 900px)");
let dashboardOpen = false;
const tooltip = $("panelToggleTooltip");
let tooltipTrigger = null;

function hideToggleTooltip() {
  if (tooltip.matches(":popover-open")) tooltip.hidePopover();
  tooltipTrigger?.removeAttribute("aria-describedby");
  tooltipTrigger = null;
}

function showToggleTooltip(button) {
  hideToggleTooltip();
  tooltipTrigger = button;
  tooltip.textContent = button === $("closeMural") || button.getAttribute("aria-expanded") === "true" ? "Contraer" : "Expandir";
  button.setAttribute("aria-describedby", tooltip.id);
  tooltip.showPopover();
  const rect = button.getBoundingClientRect();
  tooltip.style.left = `${Math.max(8, Math.min(rect.left + rect.width / 2 - tooltip.offsetWidth / 2, innerWidth - tooltip.offsetWidth - 8))}px`;
  tooltip.style.top = `${rect.bottom + tooltip.offsetHeight + 8 < innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - tooltip.offsetHeight - 8)}px`;
}

for (const id of ["toggleChannels", "toggleMural", "closeMural", "openMural"]) {
  const button = $(id);
  button.addEventListener("pointerenter", () => showToggleTooltip(button));
  button.addEventListener("focus", () => showToggleTooltip(button));
  button.addEventListener("pointerleave", () => {
    if (document.activeElement !== button) hideToggleTooltip();
  });
  button.addEventListener("blur", hideToggleTooltip);
}
document.addEventListener("keydown", event => {
  if (event.key === "Escape") hideToggleTooltip();
});
window.addEventListener("resize", hideToggleTooltip);
document.addEventListener("scroll", hideToggleTooltip, true);

function syncMuralPlacement() {
  hideToggleTooltip();
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
  $("toggleChannels").setAttribute("aria-label", collapsed ? "Expandir barra de tipsters" : "Contraer barra de tipsters");
  if (tooltipTrigger === $("toggleChannels")) showToggleTooltip($("toggleChannels"));
}

function setMuralCollapsed(collapsed) {
  layout.classList.toggle("mural-collapsed", collapsed);
  $("toggleMural").setAttribute("aria-expanded", String(!collapsed));
  $("toggleMural").setAttribute("aria-label", collapsed ? "Expandir mural" : "Contraer mural");
  if (tooltipTrigger === $("toggleMural")) showToggleTooltip($("toggleMural"));
  if (collapsed && drawer.open) drawer.close();
}

function openMural() {
  hideToggleTooltip();
  if (mobile.matches && !drawer.open) {
    drawer.showModal();
    $("openMural").setAttribute("aria-expanded", "true");
    $("muralEntries").focus({ preventScroll: true });
  }
}

function closeMural() {
  hideToggleTooltip();
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
$("openMural").setAttribute("aria-label", "Expandir mural");
mountCommunityMural();
