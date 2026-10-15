const STORAGE_KEY = "fijas-cookie-consent";

let accepted = false;
try {
  accepted = localStorage.getItem(STORAGE_KEY) === "accepted";
} catch (error) {
  console.error("No se pudo leer la preferencia de cookies:", error);
}

if (!accepted) {
  const banner = document.createElement("aside");
  banner.id = "cookieConsentBanner";
  banner.className = "cookie-consent-banner";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Preferencias de cookies");
  banner.innerHTML = `
    <p>Usamos almacenamiento local para recordar esta preferencia y mantener tu sesión. No empleamos rastreadores publicitarios intrusivos. <a href="/src/views/legal-notice.html#cookies">Más información</a></p>
    <div class="cookie-consent-actions">
      <p class="cookie-consent-status" role="status" aria-live="polite"></p>
      <button id="cookieConsentAccept" type="button">Aceptar</button>
    </div>`;
  document.body.append(banner);

  banner.querySelector("#cookieConsentAccept").addEventListener("click", () => {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
      banner.remove();
    } catch (error) {
      console.error("No se pudo guardar la preferencia de cookies:", error);
      banner.querySelector(".cookie-consent-status").textContent =
        "No se pudo guardar la preferencia en este navegador. Activa el almacenamiento local e inténtalo de nuevo.";
    }
  });
}
