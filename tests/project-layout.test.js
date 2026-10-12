import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const viewSources = [
  ["src/views/public-tipsters.html", "Tipsters en vivo | Fijas"],
  ["src/views/tipster-access.html", "Panel tipster | Fijas en vivo"],
  ["src/views/operations-console.html", "Administración | Fijas en vivo"],
  ["src/views/platform-owner.html", "Administración | Fijas en vivo"],
  ["src/views/tipster-workspace.html", "Panel tipster | Fijas en vivo"],
];

test("semantic page sources preserve the existing page titles", async () => {
  for (const [path, title] of viewSources) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, new RegExp(`<title>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`), path);
  }
});

test("tipster access reuses the workspace template instead of duplicating its dashboard markup", async () => {
  const access = await readFile(new URL("../src/views/tipster-access.html", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../src/views/tipster-workspace.html", import.meta.url), "utf8");

  assert.match(access, /id="panelLoading"/);
  assert.match(access, /fetch\("\/src\/views\/tipster-workspace\.html"\)/);
  assert.match(access, /\/src\/styles\/tipster-view\.css/);
  assert.match(access, /\/src\/components\/legacy-cache-cleanup\.js/);
  assert.match(workspace, /\/src\/components\/legacy-cache-cleanup\.js/);
  assert.doesNotMatch(workspace, /<style>/);
  for (const id of ["pickForm", "profileForm", "cropModal"]) {
    assert.doesNotMatch(access, new RegExp(`id="${id}"`));
    assert.match(workspace, new RegExp(`id="${id}"`));
  }
});

test("creator access retains its login gate and delegates administration to the RBAC console", async () => {
  const owner = await readFile(new URL("../src/views/platform-owner.html", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"));
  const ownerRedirect = hosting.hosting.redirects.find(route => route.source === "/owner.html");

  assert.match(owner, /id="creatorLoginForm"/);
  assert.match(owner, /getAccountPermissions\(user\)/);
  assert.match(owner, /location\.replace\("\/src\/views\/operations-console\.html"\)/);
  for (const id of ["ownerDashboard", "applications", "profileRequests", "tipsters"]) {
    assert.doesNotMatch(owner, new RegExp(`id="${id}"`));
  }
  assert.equal(ownerRedirect?.destination, "/src/views/platform-owner.html");
});
