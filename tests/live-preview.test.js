import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("preview sirve modulos y recarga HTML al guardar sin publicar herramientas ni secretos", async () => {
  const { createPreviewServer } = await import("../scripts/live-preview.js");
  const root = await mkdtemp(join(tmpdir(), "fijas-preview-"));
  let preview;
  try {
    await writeFile(join(root, "index.html"), "<html><body>Preview</body></html>");
    await writeFile(join(root, "app.js"), "export const version = 1;");
    await writeFile(join(root, ".env"), "PRIVATE");
    await mkdir(join(root, "tests"));
    await writeFile(join(root, "tests", "fixture.js"), "PRIVATE");
    preview = await createPreviewServer(root, { port: 0 });
    const base = `http://127.0.0.1:${preview.port}`;
    const html = await fetch(base);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /EventSource/);
    const module = await fetch(`${base}/app.js?v=2`);
    assert.equal(module.status, 200);
    assert.match(module.headers.get("content-type"), /javascript/);
    assert.equal(await module.text(), "export const version = 1;");
    for (const path of [".env", "tests/fixture.js", "%2e%2e%2f.env", "missing.js"]) {
      assert.equal((await fetch(`${base}/${path}`)).status, 404);
    }
    const events = await fetch(`${base}/__preview/events`);
    const reader = events.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /ready/);
    const changed = reader.read();
    await writeFile(join(root, "app.js"), "export const version = 2;");
    const event = await Promise.race([
      changed,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error("No hubo recarga automática")), 5000);
        timer.unref();
      })
    ]);
    assert.match(new TextDecoder().decode(event.value), /reload/);
    await reader.cancel();
  } finally {
    if (preview) await preview.close();
    await rm(root, { recursive: true, force: true });
  }
});
