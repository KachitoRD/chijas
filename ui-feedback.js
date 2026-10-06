export function showSkeleton(container, { count = 3, variant = "rows", label = "Cargando..." } = {}) {
  container.setAttribute("aria-busy", "true");
  const status = document.createElement("span");
  status.className = "sr-only";
  status.textContent = label;
  const group = document.createElement("div");
  group.className = `ui-skeleton-group ui-skeleton-${variant}`;
  group.setAttribute("aria-hidden", "true");
  for (let index = 0; index < count; index++) {
    const item = document.createElement("div");
    item.className = "ui-skeleton-item";
    for (const width of ["full", "medium", "short"]) {
      const line = document.createElement("span");
      line.className = `ui-skeleton-line ui-skeleton-${width}`;
      item.append(line);
    }
    group.append(item);
  }
  container.replaceChildren(status, group);
}

export function installBusyButtons(root = document.body) {
  function synchronize(button) {
    const busy = button.disabled && (
      /cargando|guardando|comprobando|enviando|creando|iniciando|comprimiendo|publicando|actualizando|procesando/i.test(button.textContent)
      || button.matches("[data-review], [data-profile-review], [data-permission], #viewerLogout, #logoutButton, #logout, #switchCreatorAccount")
    );
    if (busy) {
      button.dataset.uiBusy = "true";
      button.setAttribute("aria-busy", "true");
    } else if (button.dataset.uiBusy) {
      delete button.dataset.uiBusy;
      button.setAttribute("aria-busy", "false");
    }
  }
  root.querySelectorAll("button").forEach(synchronize);
  const observer = new MutationObserver(records => {
    const buttons = new Set();
    for (const record of records) {
      const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      const button = element?.closest("button");
      if (button) buttons.add(button);
      if (record.type === "childList") {
        record.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches("button")) buttons.add(node);
          node.querySelectorAll("button").forEach(candidate => buttons.add(candidate));
        });
      }
    }
    buttons.forEach(synchronize);
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["disabled"] });
  return () => observer.disconnect();
}
