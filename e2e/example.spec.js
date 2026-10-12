import { test, expect } from '@playwright/test';

test('el directorio semántico carga sin errores', async ({ page, baseURL }) => {
  const consoleMessages = [];
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    } else {
      consoleMessages.push(msg.text());
    }
  });

  await page.goto('/');
  
  expect(page.url()).toBe(`${baseURL}/src/views/public-tipsters.html`);
  expect(consoleErrors).toHaveLength(0);
  expect(page).toHaveTitle('Tipsters en vivo | Fijas');
});

test("los aliases de paginas historicos conservan sus destinos canonicos", async ({ page, baseURL }) => {
  for (const [legacy, canonical, title] of [
    ["/index.html", "/src/views/public-tipsters.html", "Tipsters en vivo | Fijas"],
    ["/admin.html", "/src/views/tipster-access.html", "Panel tipster | Fijas en vivo"],
    ["/admin-dashboard.html", "/src/views/operations-console.html", "Administración | Fijas en vivo"],
    ["/owner.html", "/src/views/platform-owner.html", "Administración | Fijas en vivo"]
  ]) {
    await page.goto(legacy);
    await expect(page).toHaveURL(`${baseURL}${canonical}`);
    await expect(page).toHaveTitle(title);
  }
});
