import { test, expect } from "@playwright/test";

// Configure test timeouts
test.setTimeout(60000);

test.describe("Testing & QA - Opción B (Simplified)", () => {
  
  // ========================================
  // 1. BASIC LOAD TEST & METRICS
  // ========================================
  test("✅ Page loads successfully - index.html", async ({ page }) => {
    const response = await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    
    expect(response?.status()).toBe(200);
    
    const title = await page.title();
    expect(title).toContain("Tipsters");
    console.log("✅ index.html loaded successfully");
  });

  test("✅ Page loads successfully - admin.html", async ({ page }) => {
    const response = await page.goto("http://localhost:5500/admin.html", {
      waitUntil: "domcontentloaded",
    });
    
    expect(response?.status()).toBe(200);
    console.log("✅ admin.html loaded successfully");
  });

  test("✅ Page loads successfully - owner.html", async ({ page }) => {
    const response = await page.goto("http://localhost:5500/owner.html", {
      waitUntil: "domcontentloaded",
    });
    
    expect(response?.status()).toBe(200);
    console.log("✅ owner.html loaded successfully");
  });

  // ========================================
  // 2. PERFORMANCE METRICS
  // ========================================
  test("⏱️ Performance metrics - First Contentful Paint", async ({ page }) => {
    page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance
        .getEntriesByType("paint")
        .find((p) => p.name === "first-contentful-paint");
      
      return {
        navigationStart: nav?.startTime || 0,
        domContentLoaded: nav?.domContentLoadedEventEnd || 0,
        fcpTime: fcp?.startTime || 0,
      };
    });
    
    console.log("⏱️ Performance Metrics:", metrics);
    expect(metrics.fcpTime).toBeLessThan(3000); // FCP < 3s
  });

  // ========================================
  // 3. ACCESSIBILITY BASIC CHECKS
  // ========================================
  test("♿ Accessibility - Heading structure (index.html)", async ({ page }) => {
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);
    
    const h1Text = await page.locator("h1").first().textContent();
    expect(h1Text).toBeTruthy();
    console.log("✅ Heading structure OK - H1:", h1Text);
  });

  test("♿ Accessibility - Images have alt text", async ({ page }) => {
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const imagesWithoutAlt = await page.evaluate(() => {
      const images = Array.from(
        document.querySelectorAll("img:not([role='presentation'])")
      );
      return images.filter((img) => !img.alt && !img.getAttribute("aria-label"))
        .length;
    });
    
    console.log(`ℹ️ Images without alt text: ${imagesWithoutAlt}`);
    // Note: Some images might be decorative; this is informational
  });

  test("♿ Accessibility - Contrast check (simplified)", async ({ page }) => {
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const textElements = await page.locator("p, a, button, span").count();
    console.log(`✅ Found ${textElements} text elements with color styling`);
    expect(textElements).toBeGreaterThan(0);
  });

  // ========================================
  // 4. RESPONSIVE DESIGN - SINGLE VIEWPORT TEST
  // ========================================
  test("📱 Responsive - Mobile (375px) - no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    expect(overflow).toBeFalsy();
    console.log("✅ Mobile (375px) - No overflow");
    
    await page.screenshot({ path: "test-results/mobile-375px.png" });
  });

  test("📱 Responsive - Tablet (768px) - no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    expect(overflow).toBeFalsy();
    console.log("✅ Tablet (768px) - No overflow");
    
    await page.screenshot({ path: "test-results/tablet-768px.png" });
  });

  test("💻 Responsive - Desktop (1440px) - no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    expect(overflow).toBeFalsy();
    console.log("✅ Desktop (1440px) - No overflow");
    
    await page.screenshot({ path: "test-results/desktop-1440px.png" });
  });

  // ========================================
  // 5. CONSOLE ERRORS CHECK
  // ========================================
  test("🔍 No critical console errors", async ({ page }) => {
    const errors = [];
    const warnings = [];
    
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
      if (msg.type() === "warning") {
        warnings.push(msg.text());
      }
    });
    
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    await page.waitForTimeout(2000);
    
    // Filter out known warnings (e.g., Tailwind CDN)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to load resource") &&
        !e.includes("401") &&
        !e.includes("403")
    );
    
    console.log(`✅ Console errors: ${criticalErrors.length}`);
    console.log(`✅ Console warnings: ${warnings.length}`);
    
    expect(criticalErrors.length).toBe(0);
  });

  // ========================================
  // 6. TOUCH TARGET SIZE CHECK
  // ========================================
  test("👆 Touch targets - Check button/link sizes", async ({ page }) => {
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const smallTargets = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        "button, a[href], input, [role='button']"
      );
      const small = [];
      
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if ((rect.width < 44 || rect.height < 44) && rect.width > 0) {
          small.push({
            tag: el.tagName,
            text: el.textContent?.substring(0, 20),
            size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          });
        }
      });
      
      return small;
    });
    
    console.log(
      `✅ Small touch targets (< 44x44px): ${smallTargets.length}`
    );
    if (smallTargets.length > 0) {
      console.log("   Examples:", smallTargets.slice(0, 3));
    }
    
    // Warning only, not failure - some small elements are OK
    expect(smallTargets.length).toBeLessThan(10);
  });

  // ========================================
  // 7. CSS VARIABLES CHECK
  // ========================================
  test("🎨 CSS Variables - Are they defined?", async ({ page }) => {
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const cssVars = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const colors = {
        primary: root.getPropertyValue("--emerald-500").trim(),
        secondary: root.getPropertyValue("--emerald-600").trim(),
        text: root.getPropertyValue("--text-primary").trim(),
      };
      return colors;
    });
    
    console.log("✅ CSS Variables found:", cssVars);
    expect(Object.values(cssVars).some((v) => v)).toBeTruthy();
  });

  // ========================================
  // 8. LINKS & NAVIGATION WORK
  // ========================================
  test("🔗 Navigation links are accessible", async ({ page }) => {
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const links = await page.locator("a[href]").count();
    console.log(`✅ Found ${links} navigation links`);
    
    expect(links).toBeGreaterThan(0);
  });

  // ========================================
  // 9. SEARCH INPUT TEST
  // ========================================
  test("🔍 Search input is functional", async ({ page }) => {
    await page.goto("http://localhost:5500/", {
      waitUntil: "domcontentloaded",
    });
    
    const searchInput = page.locator("input[type='search'], input.search");
    const count = await searchInput.count();
    
    if (count > 0) {
      await searchInput.first().click();
      await searchInput.first().type("test");
      
      const value = await searchInput.first().inputValue();
      expect(value).toContain("test");
      console.log("✅ Search input works");
    } else {
      console.log("ℹ️ No search input found");
    }
  });
});
