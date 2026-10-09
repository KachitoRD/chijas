import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBlockedTerms, validateMuralComment } from "../mural-moderation.js";

test("validateMuralComment rejects empty or whitespace-only comments", () => {
  assert.deepEqual(validateMuralComment(" \n\t"), {
    valid: false,
    reason: "empty"
  });
});

test("validateMuralComment trims the edges and preserves readable paragraphs", () => {
  assert.deepEqual(validateMuralComment("  Buen análisis.\n\nSuerte  "), {
    valid: true,
    text: "Buen análisis.\n\nSuerte"
  });
});

test("validateMuralComment blocks external links and messaging-app domains", () => {
  for (const comment of [
    "Revisa https://example.test/promo",
    "Texto antes\nhttps://example.test/promo",
    "Entra en www.example.test",
    "Sígueme en t.me/canal",
    "Escríbeme por wa.me/123"
  ]) {
    assert.equal(validateMuralComment(comment).reason, "external-link", comment);
  }
});

test("validateMuralComment applies dynamic blacklist terms case-insensitively", () => {
  assert.equal(validateMuralComment("Promo de TELEGRAM aquí", ["telegram"]).reason, "blocked-term");
  assert.equal(validateMuralComment("Enlace sospechoso", ["sospechoso"]).reason, "blocked-term");
});

test("validateMuralComment caps comments at 500 characters", () => {
  assert.equal(validateMuralComment("a".repeat(501)).reason, "too-long");
});

test("normalizeBlockedTerms trims, removes duplicates and ignores blank lines", () => {
  assert.equal(normalizeBlockedTerms(" spam\nSPAM\n\n Telegram "), "spam\nTelegram");
});

test("normalizeBlockedTerms rejects oversized admin policies", () => {
  assert.throws(() => normalizeBlockedTerms("x".repeat(41)), /40 caracteres/);
  assert.throws(() => normalizeBlockedTerms(Array.from({ length: 41 }, (_, index) => `spam-${index}`).join("\n")), /40 términos/);
});

test("frontpage replaces the simulated chat markup and controls with a mural", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const shell = await readFile(new URL("../viewer-shell.js", import.meta.url), "utf8");
  assert.match(html, /id="communityMural"/);
  assert.match(html, /id="toggleMural"/);
  assert.match(html, /id="muralForm"/);
  assert.doesNotMatch(html, /id="communityChat"|id="chatDrawer"|id="chatForm"|id="pauseChat"/);
  assert.doesNotMatch(shell, /setInterval|samples|chatMessages|chatForm/);
});
