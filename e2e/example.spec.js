import { test, expect } from '@playwright/test';

test('index.html carga sin errores', async ({ page, baseURL }) => {
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
  
  expect(page.url()).toBe(`${baseURL}/`);
  expect(consoleErrors).toHaveLength(0);
  expect(page).toHaveTitle('Tipsters en vivo | Fijas');
});
