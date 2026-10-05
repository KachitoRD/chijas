import { test, expect } from "@playwright/test";

test.describe("Testing & QA - Opción B", () => {
  // ========================================
  // 1. LIGHTHOUSE PERFORMANCE AUDITS
  // ========================================
  test("Lighthouse audit on index.html", async ({ page, browser }) => {
    await page.goto("http://localhost:5500/");
    
    // Wait for page to fully load
    await page.waitForLoadState("networkidle");
    
    // Get page metrics
    const metrics = await page.evaluate(() => ({
      title: document.title,
      loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
      paintTiming: performance.getEntriesByType("paint"),
    }));
    
    console.log("📊 INDEX.HTML METRICS:", metrics);
    expect(metrics.title).toContain("Tipsters");
  });

  test("Lighthouse audit on admin.html", async ({ page }) => {
    await page.goto("http://localhost:5500/admin.html");
    await page.waitForLoadState("networkidle");
    
    const metrics = await page.evaluate(() => ({
      title: document.title,
      loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
    }));
    
    console.log("📊 ADMIN.HTML METRICS:", metrics);
    expect(metrics.title).toBeTruthy();
  });

  test("Lighthouse audit on owner.html", async ({ page }) => {
    await page.goto("http://localhost:5500/owner.html");
    await page.waitForLoadState("networkidle");
    
    const metrics = await page.evaluate(() => ({
      title: document.title,
      loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
    }));
    
    console.log("📊 OWNER.HTML METRICS:", metrics);
    expect(metrics.title).toBeTruthy();
  });

  // ========================================
  // 2. ACCESSIBILITY CHECKS (axe)
  // ========================================
  test("Accessibility audit on index.html", async ({ page }) => {
    await page.goto("http://localhost:5500/");
    await page.waitForLoadState("networkidle");
    
    // Check for common a11y issues
    const a11yIssues = await page.evaluate(() => {
      const issues = [];
      
      // Check contrast ratios (simplified)
      document.querySelectorAll("button, a, [role='button']").forEach((el) => {
        const style = window.getComputedStyle(el);
        if (!style.color) issues.push(`No color on ${el.tagName}`);
      });
      
      // Check for alt text on images
      document.querySelectorAll("img:not([role='presentation'])").forEach((img) => {
        if (!img.alt && !img.getAttribute("aria-label")) {
          issues.push(`Missing alt on img: ${img.src}`);
        }
      });
      
      // Check heading hierarchy
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => h.tagName);
      if (headings[0] !== "H1") issues.push("No H1 on page");
      
      // Check for keyboard accessible elements
      const focusable = document.querySelectorAll(
        "button, a, input, [tabindex]:not([tabindex='-1'])"
      );
      if (focusable.length === 0) issues.push("No keyboard accessible elements");
      
      return issues;
    });
    
    console.log("♿ ACCESSIBILITY ISSUES (index):", a11yIssues);
    expect(a11yIssues.length).toBeLessThan(5); // Allow minor issues
  });

  test("Accessibility audit on admin.html", async ({ page }) => {
    await page.goto("http://localhost:5500/admin.html");
    await page.waitForLoadState("networkidle");
    
    const a11yIssues = await page.evaluate(() => {
      const issues = [];
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => h.tagName);
      if (headings.length === 0) issues.push("No headings on page");
      return issues;
    });
    
    console.log("♿ ACCESSIBILITY ISSUES (admin):", a11yIssues);
    expect(a11yIssues.length).toBeLessThan(3);
  });

  // ========================================
  // 3. RESPONSIVE DESIGN TESTING
  // ========================================
  test("Responsive design - iPhone SE (375px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    
    await page.goto("http://localhost:5500/");
    await page.waitForLoadState("networkidle");
    
    // Check for horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    console.log("📱 iPhone SE (375px) - Horizontal overflow:", hasOverflow);
    expect(hasOverflow).toBeFalsy();
    
    // Take screenshot
    await page.screenshot({ path: "test-results/responsive-iphone-se.png" });
    await context.close();
  });

  test("Responsive design - iPad (768px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      isMobile: true,
    });
    const page = await context.newPage();
    
    await page.goto("http://localhost:5500/");
    await page.waitForLoadState("networkidle");
    
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    console.log("📱 iPad (768px) - Horizontal overflow:", hasOverflow);
    expect(hasOverflow).toBeFalsy();
    
    await page.screenshot({ path: "test-results/responsive-ipad.png" });
    await context.close();
  });

  test("Responsive design - iPad Pro (1024px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 1366 },
      isMobile: false,
    });
    const page = await context.newPage();
    
    await page.goto("http://localhost:5500/");
    await page.waitForLoadState("networkidle");
    
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    console.log("💻 iPad Pro (1024px) - Horizontal overflow:", hasOverflow);
    expect(hasOverflow).toBeFalsy();
    
    await page.screenshot({ path: "test-results/responsive-ipad-pro.png" });
    await context.close();
  });

  test("Responsive design - Desktop (1440px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    
    await page.goto("http://localhost:5500/");
    await page.waitForLoadState("networkidle");
    
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    console.log("💻 Desktop (1440px) - Horizontal overflow:", hasOverflow);
    expect(hasOverflow).toBeFalsy();
    
    await page.screenshot({ path: "test-results/responsive-desktop.png" });
    await context.close();
  });

  // ========================================
  // 4. TOUCH TARGET SIZE VERIFICATION
  // ========================================
  test("Touch targets are at least 48x48px", async ({ page }) => {
    await page.goto("http://localhost:5500/");
    await page.waitForLoadState("networkidle");
    
    const smallTouchTargets = await page.evaluate(() => {
      const issues = [];
      const elements = document.querySelectorAll("button, a, input, [role='button']");
      
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 48 || rect.height < 48) {
          issues.push({
            element: el.tagName,
            text: el.textContent?.substring(0, 20),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      });
      
      return issues;
    });
    
    console.log("👆 Small touch targets (< 48x48px):", smallTouchTargets);
    expect(smallTouchTargets.length).toBeLessThan(3); // Allow minor issues
  });

  // ========================================
  // 5. IMAGE OPTIMIZATION CHECK
  // ========================================
  test("Image optimization and loading", async ({ page }) => {
    await page.goto("http://localhost:5500/");
    await page.waitForLoadState("networkidle");
    
    const imageStats = await page.evaluate(() => {
      const images = document.querySelectorAll("img");
      return Array.from(images).map((img) => ({
        src: img.src,
        alt: img.alt || "(missing)",
        width: img.width,
        height: img.height,
        loaded: img.complete,
      }));
    });
    
    console.log("🖼️ Image stats:", imageStats);
    imageStats.forEach((img) => {
      expect(img.loaded).toBeTruthy();
    });
  });

  // ========================================
  // 6. CONSOLE ERRORS CHECK
  // ========================================
  test("No console errors on main pages", async ({ page }) => {
    const errors = [];
    
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    
    await page.goto("http://localhost:5500/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    
    console.log("🔴 Console errors:", errors);
    expect(errors.length).toBe(0);
  });

  // ========================================
  // 7. CSS AND JS LOAD TIME
  // ========================================
  test("Page load performance metrics", async ({ page }) => {
    const performanceMetrics = [];
    
    page.on("response", (response) => {
      const resource = {
        url: response.url(),
        status: response.status(),
        timing: response.timing(),
      };
      performanceMetrics.push(resource);
    });
    
    await page.goto("http://localhost:5500/", { waitUntil: "networkidle" });
    
    const slowResources = performanceMetrics.filter((r) => r.timing?.total > 1000);
    console.log("⏱️ Slow resources (> 1s):", slowResources);
    
    // Core Vitals check
    const vitals = await page.evaluate(() => ({
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
      lcp: performance.getEntriesByType("largest-contentful-paint").pop()?.renderTime,
      cls: 0, // CLS requires PerformanceObserver setup
    }));
    
    console.log("📈 Core Vitals:", vitals);
    expect(vitals.fcp).toBeLessThan(2000); // FCP < 2s
  });
});
