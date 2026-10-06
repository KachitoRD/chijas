import { test, expect } from "@playwright/test";
import { auditButtons } from "./helpers/ui-audit.js";

test("gradiente neon solo en el hero y énfasis del frontpage", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".frontpage-accent")).toHaveCount(3);
  const hero = page.locator(".hero-gradient");
  await expect(hero).toHaveCSS("background-image", /linear-gradient/);
  await expect(hero).toHaveCSS("-webkit-text-fill-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("#onlineTitle")).toHaveCSS("background-image", "none");
  await page.emulateMedia({ forcedColors: "active" });
  await expect(hero).toHaveCSS("background-image", "none");
  const visibleText = await hero.evaluate(element => getComputedStyle(element).webkitTextFillColor);
  expect(visibleText).not.toBe("rgba(0, 0, 0, 0)");
  await page.emulateMedia({ forcedColors: "none" });
  for (const path of ["/admin.html", "/owner.html"]) {
    await page.goto(path);
    await expect(page.locator(".frontpage, .frontpage-accent")).toHaveCount(0);
    await expect(page.locator("dialog h1")).toHaveCSS("background-image", "none");
  }
});

for (const surface of [
  { path: "/", panel: "#viewerAuth", open: "#viewerLogin" },
  { path: "/admin.html", panel: "#loginForm" },
  { path: "/owner.html", panel: "#creatorLogin" }
]) {
  test(`glass, contraste, botones y retícula responsiva ${surface.path}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(surface.path);
    if (surface.open) await page.locator(surface.open).click();
    await expect(page.locator(surface.panel)).toBeVisible();
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      expect(await auditButtons(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      const glass = await page.locator(surface.panel).evaluate(element => {
        const style = getComputedStyle(element);
        return { filter: style.backdropFilter || style.webkitBackdropFilter, border: style.borderTopWidth, background: style.backgroundColor };
      });
      expect(glass.filter).toBe("blur(16px)");
      expect(glass.border).toBe("1px");
      expect(glass.background).toMatch(/0\.82/);
      await page.screenshot({ path: testInfo.outputPath(`polished-${viewport.width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test("skeletons y feedback asíncrono se detienen con reduced motion y al finalizar", async ({ page }) => {
  await page.goto("/");
  await page.locator("#viewerLogin").click();
  await page.evaluate(async () => {
    const { showSkeleton } = await import("/ui-feedback.js");
    const container = document.createElement("div");
    container.id = "skeletonFixture";
    document.body.append(container);
    showSkeleton(container, { variant: "cards", label: "Cargando feed de prueba" });
    const button = document.getElementById("viewerAuthSubmit");
    button.textContent = "Cargando...";
    button.disabled = true;
  });
  await expect(page.locator("#viewerAuthSubmit")).toHaveAttribute("aria-busy", "true");
  expect(await auditButtons(page)).toEqual([]);
  const skeleton = page.locator("#skeletonFixture .ui-skeleton-group");
  await expect(skeleton).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#skeletonFixture")).toHaveAttribute("aria-busy", "true");
  expect(await skeleton.locator(".ui-skeleton-item").count()).toBe(3);
  expect(await page.locator("#viewerAuthSubmit").evaluate(button => getComputedStyle(button, "::after").animationName)).toBe("ui-spin");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".ui-skeleton-line").first().evaluate(line => getComputedStyle(line).animationName)).toBe("none");
  expect(await page.locator("#viewerAuthSubmit").evaluate(button => getComputedStyle(button, "::after").animationName)).toBe("none");
  await page.evaluate(() => {
    const button = document.getElementById("viewerAuthSubmit");
    button.disabled = false;
    button.textContent = "Iniciar sesión";
  });
  await expect(page.locator("#viewerAuthSubmit")).toHaveAttribute("aria-busy", "false");
});

for (const surface of [
  { path: "/", dialog: "#viewerAuth", email: "#viewerAuthEmail", open: "#viewerLogin" },
  { path: "/admin.html", dialog: "#tipsterAuth", email: "#email" },
  { path: "/owner.html", dialog: "#ownerAuth", email: "#creatorEmail" }
]) {
  test(`modal protege el texto y cierra con backdrop vacío ${surface.path}`, async ({ page }) => {
    await page.goto(surface.path);
    if (surface.open) await page.locator(surface.open).click();
    const dialog = page.locator(surface.dialog);
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => element.matches(":modal"))).toBeTruthy();
    expect(await dialog.evaluate(element => getComputedStyle(element, "::backdrop").backdropFilter)).toBe("blur(6px)");
    if (!surface.open) {
      await expect(page.locator(".auth-panel-preview")).toBeVisible();
      await expect(page.locator(".auth-panel-preview")).toHaveAttribute("aria-hidden", "true");
    }
    await page.locator(surface.email).fill("borrador@example.test");
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    await expect(page.locator(surface.email)).toHaveValue("borrador@example.test");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await page.locator(surface.email).fill("");
    await page.mouse.click(2, 2);
    if (surface.open) await expect(dialog).not.toBeVisible();
    else await expect(page).toHaveURL(/\/$/);
  });
}
