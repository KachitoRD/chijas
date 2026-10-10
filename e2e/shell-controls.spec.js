import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  // Exercise the real shell without mounting Firebase-dependent content.
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.abort();
    if (url.pathname === "/community-mural.js") {
      return route.fulfill({ contentType: "text/javascript", body: "export function mountCommunityMural() {}" });
    }
    const files = {
      "/": "index.html",
      "/viewer-shell.js": "viewer-shell.js",
      "/viewer-styles.css": "viewer-styles.css",
      "/ui-polish.css": "ui-polish.css",
      "/emerald-surface.css": "emerald-surface.css",
      "/dist/styles.min.css": "dist/styles.min.css"
    };
    const file = files[url.pathname];
    if (!file) return route.abort();
    let body = await readFile(file, "utf8");
    if (file === "index.html") {
      body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace("</body>", '<script type="module" src="viewer-shell.js"></script></body>');
    }
    await route.fulfill({ body, contentType: file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html" });
  });
});

test("controles dentro de las barras conservan flechas, nubes y expansión", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  for (const [panel, toggle, content] of [
    ["#channelSidebar", "#toggleChannels", ".sidebar-heading"],
    ["#communityMural", "#toggleMural", "#muralEntries"]
  ]) {
    await expect(page.locator(`${panel} ${toggle}`)).toBeVisible();
    const button = page.locator(toggle);
    await button.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Contraer");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeVisible();
    await expect(page.locator(content)).toBeHidden();
    await expect(page.getByRole("tooltip")).toHaveText("Expandir");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toBeHidden();
    await button.blur();
    await button.focus();
    await expect(page.getByRole("tooltip")).toHaveText("Expandir");
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(content)).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath("barras-desktop.png") });
});

test("móvil permite reabrir la barra y contraer el mural sin perder el control", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const channels = page.locator("#toggleChannels");
  await channels.click();
  await expect(channels).toBeVisible();
  await expect(page.locator("#sidebarChannels")).toBeHidden();
  await channels.click();
  await expect(page.locator("#sidebarChannels")).toBeVisible();
  await page.locator("#openMural").click();
  await expect(page.locator("#muralDrawer")).toBeVisible();
  await page.locator("#closeMural").click();
  await expect(page.locator("#muralDrawer")).toBeHidden();
  await expect(page.locator("#openMural")).toBeFocused();
  await page.locator("#openMural").click();
  await page.screenshot({ path: testInfo.outputPath("barras-mobile.png") });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#communityMural #toggleMural")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("la nube conserva el foco al salir el puntero y se retira al abandonar el botón", async ({ page }) => {
  await page.goto("/");
  const button = page.locator("#toggleChannels");
  await button.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Contraer");
  await button.dispatchEvent("pointerleave");
  await expect(button).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText("Contraer");
  await button.blur();
  await expect(page.getByRole("tooltip")).toBeHidden();
});

test("barras contraídas conservan preferencias al abrir paneles y cambiar a móvil", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("#toggleChannels").click();
  await page.locator("#toggleMural").click();
  await page.evaluate(() => {
    document.querySelector(".viewer-layout").classList.add("showing-dashboard");
    window.dispatchEvent(new CustomEvent("fijas:dashboard", { detail: { open: true } }));
  });
  await expect(page.locator("#communityMural")).toBeHidden();
  await expect(page.locator("#openMural")).toBeHidden();
  await page.evaluate(() => {
    document.querySelector(".viewer-layout").classList.remove("showing-dashboard");
    window.dispatchEvent(new CustomEvent("fijas:dashboard", { detail: { open: false } }));
  });
  await expect(page.locator("#toggleMural")).toBeVisible();
  await expect(page.locator("#toggleMural")).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator("#viewerMain").boundingBox()).width).toBe(390);
  await page.locator("#toggleChannels").click();
  await expect(page.locator("#sidebarChannels")).toBeVisible();
  await page.locator("#openMural").click();
  await expect(page.locator("#muralDrawer #muralEntries")).toBeVisible();
  await page.locator("#closeMural").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Contraer");
  await page.locator("#closeMural").click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#toggleMural")).toBeVisible();
  await expect(page.locator("#muralEntries")).toBeHidden();
  await page.locator("#toggleMural").click();
  await expect(page.locator("#muralEntries")).toBeVisible();
});
