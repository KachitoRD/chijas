import { test, expect } from "@playwright/test";

test("aviso legal describe los tratamientos y derechos solicitados", async ({ page }) => {
  await page.goto("/src/views/legal-notice.html");

  await expect(page.getByRole("heading", { name: "Términos y condiciones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Política de Privacidad" })).toBeVisible();
  const terms = page.locator("#terminos");
  const privacy = page.locator("#privacidad");
  await expect(terms.getByText("Responsable del Tratamiento de Datos: Roberto Darcourt Rivera (Administrador del Proyecto)", { exact: false })).toBeVisible();
  await expect(terms.getByText("Naturaleza del Servicio: Plataforma web, directorio e interfaz informativa de pronósticos deportivos en Fase Beta / MVP (Acceso 100% Gratuito).", { exact: false })).toBeVisible();
  await expect(terms.getByText("Contacto Oficial y Derechos ARCO (Ley N.° 29733): proyecto.tipsters.peru@gmail.com", { exact: false })).toBeVisible();
  await expect(terms.getByText("Ubicación: San Miguel, Lima, Perú.", { exact: false })).toBeVisible();
  await expect(terms.getByText(/no realiza cobros, transacciones financieras ni almacena datos bancarios/)).toBeVisible();
  await expect(privacy.getByText("Responsable del Tratamiento de Datos: Roberto Darcourt Rivera (Administrador del Proyecto)", { exact: false })).toBeVisible();
  await expect(privacy.getByText("Contacto Oficial y Derechos ARCO (Ley N.° 29733): proyecto.tipsters.peru@gmail.com", { exact: false })).toBeVisible();
  await expect(page.locator("main").getByText(/\bRUC\b|\[PENDIENTE:/i)).toHaveCount(0);
  await expect(page.getByText("El juego interactivo en exceso puede causar ludopatía. Prohibido para menores de 18 años (+18)", { exact: false })).toBeVisible();
  await expect(page.getByText(/no procesa, acepta o registra jugadas/)).toBeVisible();
  await expect(page.getByText(/Ley N\.° 31557 y el D\.S\. N\.° 005-2023-MINCETUR/)).toBeVisible();
  await expect(page.getByText(/autorización formal vigente de MINCETUR/)).toBeVisible();
  await expect(page.getByText(/Acceso, Rectificación, Cancelación y Oposición/)).toBeVisible();
  await expect(page.getByText(/Base64/)).toBeVisible();
  await expect(page.getByText(/resultado de un evento deportivo/)).toBeVisible();
  await expect(page.getByText(/SUNAT/)).toBeVisible();
  await expect(page.getByText(/browserLocalPersistence/)).toBeVisible();
});

test("banner permite aceptar cookies y conserva la preferencia entre visitas", async ({ page }) => {
  await page.goto("/src/views/legal-notice.html");

  const banner = page.getByRole("region", { name: "Preferencias de cookies" });
  await expect(banner).toBeVisible();
  const accept = banner.getByRole("button", { name: "Aceptar" });
  const style = await accept.evaluate(button => {
    const computed = getComputedStyle(button);
    return { background: computed.backgroundColor, color: computed.color, fontWeight: computed.fontWeight };
  });
  expect(style).toEqual({ background: "rgb(16, 185, 129)", color: "rgb(2, 6, 23)", fontWeight: "600" });
  await accept.click();
  await expect(banner).toHaveCount(0);
  await expect(page.evaluate(() => localStorage.getItem("fijas-cookie-consent"))).resolves.toBe("accepted");

  await page.reload();
  await expect(page.getByRole("region", { name: "Preferencias de cookies" })).toHaveCount(0);
});

test("footer ofrece acceso a políticas y juego responsable con distintivo de edad", async ({ page }) => {
  await page.goto("/src/views/public-tipsters.html", { waitUntil: "domcontentloaded" });

  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "Políticas de Privacidad" })).toHaveAttribute("href", /#privacidad$/);
  await expect(footer.getByRole("link", { name: "Términos y Condiciones" })).toHaveAttribute("href", /#terminos$/);
  await expect(footer.getByRole("link", { name: "Juego Responsable" })).toHaveAttribute("href", /#juego-responsable$/);
  await expect(footer.getByText("+18", { exact: true })).toBeVisible();
  await expect(footer.getByText(/El juego interactivo en exceso puede causar ludopatía/)).toBeVisible();
});

test("ventana de consentimiento usa el diseño oscuro accesible solicitado", async ({ page }) => {
  await page.goto("/src/views/public-tipsters.html", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("#viewerConsent").evaluate(dialog => getComputedStyle(dialog).backgroundColor))
    .toBe("rgb(17, 24, 39)");
  await page.locator("#viewerConsent").evaluate(dialog => dialog.showModal());
  const dialog = page.locator("#viewerConsent");
  await expect(dialog.getByRole("link", { name: "Términos" })).toHaveAttribute("href", /#terminos$/);
  await expect(dialog.getByRole("link", { name: "Política de Privacidad" })).toHaveAttribute("href", /#privacidad$/);
  await expect(dialog.getByText(/El juego interactivo en exceso puede causar ludopatía\. Prohibido para menores de 18 años \(\+18\)/)).toBeVisible();
  await expect.poll(() => page.locator("#viewerConsent").evaluate(dialog => getComputedStyle(dialog, "::backdrop").backgroundColor))
    .toBe("rgba(0, 0, 0, 0.6)");
  const style = await page.locator("#viewerConsent").evaluate(dialog => {
    const computed = getComputedStyle(dialog);
    return {
      background: computed.backgroundColor,
      borderColor: computed.borderTopColor,
      shadow: computed.boxShadow,
      maxHeight: computed.maxHeight,
      transition: computed.transition,
      backdropBackground: getComputedStyle(dialog, "::backdrop").backgroundColor,
      backdropFilter: getComputedStyle(dialog, "::backdrop").backdropFilter
    };
  });

  expect(style.background).toBe("rgb(17, 24, 39)");
  expect(style.borderColor).toBe("rgb(30, 41, 59)");
  expect(style.shadow).not.toBe("none");
  expect(style.maxHeight).not.toBe("none");
  expect(style.transition).toContain("cubic-bezier(0.16, 1, 0.3, 1)");
  expect(style.backdropBackground).toBe("rgba(0, 0, 0, 0.6)");
  expect(style.backdropFilter).toBe("blur(6px)");
});
