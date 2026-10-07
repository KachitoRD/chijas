import { test, expect } from "@playwright/test";

test("escritorio tiene tres columnas, scroll independiente y sidebar colapsable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("#communityChat")).toBeVisible();
  await expect(page.locator("#openChat")).toBeHidden();
  await expect(page.locator("#sidebarChannels")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#onlineGrid")).toHaveAttribute("aria-busy", "false");
  const geometry = await page.evaluate(() => {
    const box = selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      sidebar: box("#channelSidebar"), feed: box(".viewer-main"), chat: box("#communityChat"),
      body: box("body"), viewport: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth
    };
  });
  expect(geometry.body.height).toBe(geometry.viewport);
  expect(geometry.sidebar.width).toBe(240);
  expect(geometry.sidebar.x + geometry.sidebar.width).toBeCloseTo(geometry.feed.x, 0);
  expect(geometry.feed.x + geometry.feed.width).toBeCloseTo(geometry.chat.x, 0);
  expect(geometry.chat.width).toBe(288);
  expect(geometry.chat.y).toBe(geometry.feed.y);
  expect(geometry.overflow).toBeFalsy();
  const scrollPositions = await page.evaluate(() => {
    for (const selector of [".viewer-main", "#sidebarChannels", "#chatMessages"]) {
      const container = document.querySelector(selector);
      const longContent = document.createElement("div");
      longContent.style.height = "2000px";
      container.append(longContent);
      container.scrollTop = 150;
    }
    return [".viewer-main", "#sidebarChannels", "#chatMessages"]
      .map(selector => document.querySelector(selector).scrollTop);
  });
  expect(scrollPositions).toEqual([150, 150, 150]);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  await page.locator("#toggleChannels").click();
  expect((await page.locator("#channelSidebar").boundingBox()).width).toBe(64);
});

test("móvil muestra feed completo y drawer de chat local accesible sin desbordes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#communityChat")).toBeHidden();
  await page.locator("#openChat").click();
  await expect(page.locator("#chatDrawer")).toBeVisible();
  await expect(page.locator("#communityChat")).toContainText("Demo local");
  await page.locator("#chatInput").fill("Mensaje local de prueba");
  await page.locator("#chatSend").click();
  await expect(page.locator("#chatMessages")).toContainText("Mensaje local de prueba");
  await page.keyboard.press("Escape");
  await expect(page.locator("#chatDrawer")).toBeHidden();
  await expect(page.locator("#openChat")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(await page.locator(".viewer-main").evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".viewer-layout > #communityChat")).toBeVisible();
  await expect(page.locator("#chatMessages")).toContainText("Mensaje local de prueba");
});

test("la simulación de chat añade mensajes, puede pausarse y no persiste al recargar", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("#chatMessages .chat-message")).toHaveCount(6);
  await page.clock.runFor(8000);
  await expect(page.locator("#chatMessages .chat-message")).toHaveCount(7);
  await page.locator("#pauseChat").click();
  await page.clock.runFor(16000);
  await expect(page.locator("#chatMessages .chat-message")).toHaveCount(7);
  await page.locator("#chatInput").fill("<script>mensaje local</script>");
  await page.locator("#chatSend").click();
  await expect(page.locator("#chatMessages")).toContainText("<script>mensaje local</script>");
  await expect(page.locator("#chatMessages script")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#chatMessages")).not.toContainText("<script>mensaje local</script>");
});
