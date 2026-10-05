import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { executiveBankrollHTML } from "../bankroll-report.js";

const project = "demo-fijas-vivo";
const endpoint = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
const documentRoot = `projects/${project}/databases/(default)/documents`;
const headers = { Authorization: "Bearer owner" };
const demoConfig = `
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
export const firebaseConfigured = true;
export const firebaseConfigError = null;
export const firebaseApp = initializeApp({apiKey:"demo-key",authDomain:"demo-fijas-vivo.firebaseapp.com",projectId:"demo-fijas-vivo"});
export const firebaseAuth = getAuth(firebaseApp);
connectAuthEmulator(firebaseAuth,"http://127.0.0.1:9099",{disableWarnings:true});
export const firebaseDb = getFirestore(firebaseApp);
connectFirestoreEmulator(firebaseDb,"127.0.0.1",8080);
`;

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(field); field = "";
    } else if (!quoted && character === "\r" && text[i + 1] === "\n") {
      row.push(field); rows.push(row); row = []; field = ""; i++;
    } else field += character;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

test("CSV y PDF exportan el período completo con filtros, no solo la página visible", async ({ page, context, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "PDF nativo automatizado requiere Chromium");
  test.setTimeout(120000);
  await context.addInitScript(() => {
    window.reportPrintCount = 0;
    window.print = () => { window.reportPrintCount++; };
  });
  const auth = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
    data: { email: "tipster@test.local", password: "Test-password-123!", returnSecureToken: true }
  });
  expect(auth.ok(), "Se necesitan Auth/Firestore locales y la cuenta de pruebas").toBeTruthy();
  const { localId: uid } = await auth.json();
  const prefix = `report-${testInfo.project.name}-${Date.now()}-${testInfo.workerIndex}`;
  const names = [];
  const writes = [];
  for (let i = 0; i < 110; i++) {
    const name = `${documentRoot}/picks/${prefix}-${i}`;
    names.push(name);
    const fields = {
      user_id: { stringValue: uid }, evento: { stringValue: `Prueba de reporte ${i}` },
      seleccion: { stringValue: 'Selección, "con comillas"' }, nota: { stringValue: "=SUM(1,2)\nNota" },
      deporte: { stringValue: i === 107 ? "futbol" : "tenis" },
      casa_de_apuestas: { stringValue: i === 108 ? "betano" : "bet365" },
      estado: { stringValue: i === 109 ? "perdida" : "ganada" },
      cuota: { doubleValue: 2 }, confianza: { integerValue: "3" },
      fecha_evento: { timestampValue: i === 105 ? "2025-08-31T12:00:00Z" : i === 106 ? "2025-10-01T12:00:00Z" : "2025-09-15T12:00:00Z" },
      created_at: { timestampValue: "2025-09-15T12:00:00Z" }, show_on_stream: { booleanValue: false }
    };
    writes.push({ update: { name, fields }, currentDocument: { exists: false } });
    writes.push({ update: { name: `${name}/private/bankroll`, fields: {
      stakeAmount: { doubleValue: 10 }, stakeMinorUnits: { integerValue: "1000" }, currency: { stringValue: "PEN" },
      created_at: { timestampValue: "2025-09-15T12:00:00Z" }, updated_at: { timestampValue: "2025-09-15T12:00:00Z" }
    } }, currentDocument: { exists: false } });
  }
  const commit = await request.post(`${endpoint}:commit`, { headers, data: { writes } });
  expect(commit.ok()).toBeTruthy();
  try {
    await page.route("**/firebase-config.js*", route => route.fulfill({ contentType: "text/javascript", body: demoConfig }));
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill("tipster@test.local");
    await page.locator("#password").fill("Test-password-123!");
    await page.locator("#loginButton").click();
    await page.locator("#bankrollFilterPanel > summary").click();
    await page.locator("#bankrollPeriod").selectOption("custom");
    await page.locator("#bankrollFrom").fill("2025-09-01");
    await page.locator("#bankrollThrough").fill("2025-09-30");
    await page.locator("#bankrollStatus").selectOption("ganada");
    await page.locator("#bankrollSport").selectOption("tenis");
    await page.locator("#bankrollBookmaker").selectOption("bet365");
    await expect(page.locator("#pickCount")).toHaveText("105 en el filtro", { timeout: 30000 });
    await expect(page.locator("#bankrollExport")).toBeEnabled({ timeout: 30000 });
    await page.locator("#bankrollNext").click();
    await page.locator("#bankrollNext").click();
    await expect(page.locator("#myPicks tbody tr")).toHaveCount(5);
    async function downloaded(button, filename) {
      const event = page.waitForEvent("download");
      await page.locator(button).click();
      const download = await event;
      expect(await download.failure()).toBeNull();
      const path = testInfo.outputPath(filename);
      await download.saveAs(path);
      const reportsDirectory = fileURLToPath(new URL(`../reports/${testInfo.project.name}/`, import.meta.url));
      await mkdir(reportsDirectory, { recursive: true });
      await download.saveAs(join(reportsDirectory, filename));
      return readFile(path);
    }
    const csv = (await downloaded("#bankrollExport", "detalle.csv")).toString("utf8");
    const rows = parseCSV(csv);
    const headerIndex = rows.findIndex(row => row[0] === "ID pick");
    const detail = rows.slice(headerIndex + 1);
    expect(detail).toHaveLength(105);
    expect(new Set(detail.map(row => row[0])).size).toBe(105);
    expect(rows[1]).toEqual(["Fecha del evento desde", "2025-09-01", "hasta (inclusive)", "2025-09-30"]);
    expect(rows[2]).toEqual(["Estado", "ganada", "Deporte", "tenis", "Casa", "bet365"]);
    expect(rows).toContainEqual(["PEN", "105", "0", "2100", "1050", "1050", "100"]);
    for (const row of detail) {
      expect(row[0]).toMatch(new RegExp(`^${prefix}-\\d+$`));
      expect(Number(row[0].slice(prefix.length + 1))).toBeLessThan(105);
      expect(row[3]).toBe('Selección, "con comillas"');
      expect(row.slice(4, 7)).toEqual(["tenis", "bet365", "ganada"]);
      expect(row[9]).toBe("'=SUM(1,2)\nNota");
      expect(row[14]).toBe("100");
    }
    const summary = (await downloaded("#bankrollReport", "resumen.csv")).toString("utf8");
    expect(summary).not.toContain('"ID pick"');
    expect(summary).toContain('"PEN","105","0","2100","1050","1050","100"');
    const popupEvent = page.waitForEvent("popup");
    await page.locator("#bankrollPDF").click();
    const preview = await popupEvent;
    await expect(preview.locator("h1")).toHaveText("Resumen financiero privado");
    await expect.poll(() => preview.evaluate(() => window.reportPrintCount)).toBe(1);
    await preview.getByRole("button", { name: "Imprimir / Guardar como PDF" }).click();
    await expect.poll(() => preview.evaluate(() => window.reportPrintCount)).toBe(2);
    await expect(preview.locator("main")).toContainText("PEN 1050.00");
    await expect(preview.locator("main")).toContainText("100.00%");
    await expect(preview.locator("main")).toContainText("2025-09-01 a 2025-09-30");
    await expect(preview.locator(".filters")).toContainText("Ganadas");
    await expect(preview.locator(".filters")).toContainText("Tenis");
    await expect(preview.locator(".filters")).toContainText("bet365");
    await expect(preview.locator(".metrics .card").nth(1).locator(".value")).toHaveText("105");
    expect(await preview.evaluate(() => window.opener === null)).toBeTruthy();
    const reportsDirectory = fileURLToPath(new URL(`../reports/${testInfo.project.name}/`, import.meta.url));
    await writeFile(join(reportsDirectory, "resumen.html"), await preview.content());
    await preview.emulateMedia({ media: "print" });
    const pdf = await preview.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    await writeFile(join(reportsDirectory, "resumen.pdf"), pdf);
    await writeFile(testInfo.outputPath("resumen.pdf"), pdf);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    class LocalBinaryDataFactory {
      constructor(urls) {
        this.urls = urls;
      }
      async fetch({ kind, filename }) {
        return new Uint8Array(await readFile(new URL(filename, this.urls[kind])));
      }
    }
    const document = await getDocument({
      data: new Uint8Array(pdf),
      useWorkerFetch: false,
      standardFontDataUrl: new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href,
      BinaryDataFactory: LocalBinaryDataFactory
    }).promise;
    try {
      const pdfText = [];
      for (let number = 1; number <= document.numPages; number++) {
        const pdfPage = await document.getPage(number);
        const textContent = await pdfPage.getTextContent();
        const pageText = textContent.items.filter(item => "str" in item).map(item => item.str).join(" ");
        expect(pageText).toContain("Documento privado");
        const items = textContent.items.filter(item => "str" in item && item.str.trim());
        const footerIndex = items.findIndex(item => item.str.startsWith("Período por fecha"));
        expect(footerIndex).toBeGreaterThan(0);
        const bodyBottom = Math.min(...items.slice(0, footerIndex).map(item => item.transform[5]));
        const footerTop = Math.max(...items.slice(footerIndex).map(item => item.transform[5] + item.height));
        expect(bodyBottom).toBeGreaterThan(footerTop);
        pdfText.push(pageText);
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const previewDirectory = fileURLToPath(new URL(`../reports/${testInfo.project.name}/`, import.meta.url));
        await writeFile(join(previewDirectory, `resumen-pagina-${number}.png`), canvas.toBuffer("image/png"));
      }
      for (const text of ["105", "PEN 1050.00", "100.00%", "2025-09-01 a 2025-09-30", "Ganadas", "Tenis", "bet365"]) {
        expect(pdfText.join(" ")).toContain(text);
      }
    } finally {
      await document.destroy();
    }
    await preview.emulateMedia({ media: "screen" });
    await preview.setViewportSize({ width: 390, height: 900 });
    expect(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await preview.close();
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(page.locator("#bankrollPDF")).toBeVisible();
  } finally {
    await page.goto("about:blank");
    const cleanup = await request.post(`${endpoint}:commit`, {
      headers, data: { writes: names.flatMap(name => [{ delete: `${name}/private/bankroll` }, { delete: name }]) }
    });

    expect(cleanup.ok(), "Eliminar exclusivamente fixtures temporales de esta prueba").toBeTruthy();
  }
});

test("HTML de tres monedas conserva tarjetas completas y footer en todas las páginas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "PDF nativo automatizado requiere Chromium");
  const html = executiveBankrollHTML({
      filters: { from: "2026-10-01", through: "2026-10-04" },
      count: 100000, financialCount: 100000, won: 50000, lost: 50000, effectiveness: 50,
      totals: ["PEN", "USD", "EUR"].map(currency => ({
        currency, count: 33333, profit: -99999999999999, settledStake: 999999999999999,
        risk: 999999999999999, returned: 999999999999999, yield: -10
      }))
    }, {
      tipster: "Nombre público muy largo ".repeat(12),
      labels: { status: "Ganadas y perdidas con cierre anticipado", sport: "DeporteSinEspacios".repeat(20), bookmaker: "Casa de apuestas de nombre extenso ".repeat(12) }
  });
  await page.setContent(html);
  const assertContained = async () => {
    const overflow = await page.locator("main .field, main dt, main dd").evaluateAll(elements => elements.flatMap(element => {
      const parent = element.parentElement.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const range = document.createRange();
      range.selectNodeContents(element);
      const textOutside = !element.children.length && style.overflow !== "hidden" && [...range.getClientRects()]
        .some(rect => rect.left < box.left - 1 || rect.right > box.right + 1);
      return box.left < parent.left - 1 || box.right > parent.right + 1 || textOutside ? [element.textContent] : [];
    }));
    expect(overflow).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  };
  await page.setViewportSize({ width: 794, height: 1123 });
  await assertContained();
  await page.setViewportSize({ width: 390, height: 900 });
  await assertContained();
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: "print" });
  await assertContained();
  for (const name of ["header .field dd", ".filters .field dd"]) {
    expect(await page.locator(name).first().evaluate(element => getComputedStyle(element).textOverflow)).toBe("ellipsis");
  }
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  const directory = fileURLToPath(new URL("../reports/chromium/", import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "resumen-tres-monedas.html"), html);
  await writeFile(join(directory, "resumen-tres-monedas.pdf"), pdf);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  try {
    expect(document.numPages).toBeGreaterThan(1);
    const currencies = [];
    for (let number = 1; number <= document.numPages; number++) {
      const pdfPage = await document.getPage(number);
      const content = await pdfPage.getTextContent();
      const items = content.items.filter(item => "str" in item && item.str.trim());
      const footerIndex = items.findIndex(item => item.str.startsWith("Período por fecha"));
      expect(footerIndex).toBeGreaterThan(0);
      const body = items.slice(0, footerIndex);
      const footer = items.slice(footerIndex);
      expect(footer.map(item => item.str).join(" ")).toContain("Documento privado");
      expect(Math.min(...body.map(item => item.transform[5])))
        .toBeGreaterThan(Math.max(...footer.map(item => item.transform[5] + item.height)));
      for (const currency of ["PEN", "USD", "EUR"]) {
        if (body.some(item => item.str === currency)) {
          currencies.push(currency);
          const text = body.map(item => item.str).join(" ");
          expect(text).toContain(`${currency} -999999999999.99`);
          expect(text).toContain(`${currency} 9999999999999.99`);
        }
      }
      const viewport = pdfPage.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      await writeFile(join(directory, `resumen-tres-monedas-pagina-${number}.png`), canvas.toBuffer("image/png"));
    }
    expect(currencies.sort()).toEqual(["EUR", "PEN", "USD"]);
  } finally {
    await document.destroy();
  }
});
