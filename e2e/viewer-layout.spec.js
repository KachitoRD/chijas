import { test, expect } from "@playwright/test";

test("escritorio conserva tres columnas con scroll independiente y paneles colapsables", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("#communityMural")).toBeVisible();
  await expect(page.locator("#openMural")).toBeHidden();
  expect(await page.locator("#openMural").evaluate(element => element.hidden)).toBeTruthy();
  await expect(page.locator("#sidebarChannels")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#onlineGrid")).toHaveAttribute("aria-busy", "false");
  const geometry = await page.evaluate(() => {
    const box = selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      sidebar: box("#channelSidebar"), feed: box(".viewer-main"), mural: box("#communityMural"),
      body: box("body"), viewport: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth
    };
  });
  expect(geometry.body.height).toBe(geometry.viewport);
  expect(geometry.sidebar.width).toBe(240);
  expect(geometry.sidebar.x + geometry.sidebar.width).toBeCloseTo(geometry.feed.x, 0);
  expect(geometry.feed.x + geometry.feed.width).toBeCloseTo(geometry.mural.x, 0);
  expect(geometry.mural.width).toBe(320);
  expect(geometry.mural.y).toBe(geometry.feed.y);
  expect(geometry.overflow).toBeFalsy();
  const scrollPositions = await page.evaluate(() => {
    for (const selector of [".viewer-main", "#sidebarChannels", "#muralEntries"]) {
      const container = document.querySelector(selector);
      const longContent = document.createElement("div");
      longContent.style.height = "2000px";
      longContent.style.flexShrink = "0";
      container.append(longContent);
      container.scrollTop = 150;
    }
    return [".viewer-main", "#sidebarChannels", "#muralEntries"]
      .map(selector => document.querySelector(selector).scrollTop);
  });
  expect(scrollPositions).toEqual([150, 150, 150]);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.locator("#toggleChannels").click();
  expect((await page.locator("#channelSidebar").boundingBox()).width).toBe(64);
  await page.locator("#toggleMural").click();
  await expect(page.locator("#muralEntries")).toBeHidden();
  await expect(page.locator("#communityMural #toggleMural")).toBeVisible();
  await page.locator("#toggleMural").click();
  await expect(page.locator("#communityMural")).toBeVisible();
});

test("móvil abre y cierra el mural en un drawer accesible sin desbordes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".viewer-layout > #communityMural")).toBeHidden();
  expect(await page.locator("#openMural").evaluate(element => element.hidden)).toBeFalsy();
  await page.locator("#openMural").click();
  await expect(page.locator("#muralDrawer")).toBeVisible();
  await expect(page.locator("#muralDrawer #communityMural")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#muralDrawer")).toBeHidden();
  await expect(page.locator("#openMural")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(await page.locator(".viewer-main").evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".viewer-layout > #communityMural")).toBeVisible();
});

test("elimina el chat simulado y oculta el mural durante vistas del dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("#communityMural")).toBeVisible();
  await expect(page.locator("#communityChat, #chatDrawer, #chatForm, #pauseChat, #chatMessages")).toHaveCount(0);
  await expect(page.locator("#muralEmptyState")).toContainText("Selecciona un pronóstico");
  await page.evaluate(() => {
    document.querySelector(".viewer-layout").classList.add("showing-dashboard");
    window.dispatchEvent(new CustomEvent("fijas:dashboard", { detail: { open: true } }));
  });
  await expect(page.locator("#toggleMural")).toBeHidden();
  await expect(page.locator("#communityMural")).toBeHidden();
  await page.evaluate(() => {
    document.querySelector(".viewer-layout").classList.remove("showing-dashboard");
    window.dispatchEvent(new CustomEvent("fijas:dashboard", { detail: { open: false } }));
  });
  await expect(page.locator("#communityMural")).toBeVisible();
});
