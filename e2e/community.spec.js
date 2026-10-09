import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mockGooglePopup } from "./helpers/auth-emulator.js";
import { auditButtons } from "./helpers/ui-audit.js";

const project = "demo-fijas-vivo";
const authRoot = "http://127.0.0.1:9099";
const root = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
const headers = { Authorization: "Bearer owner" };
let fixture;
function traceCategory(phase) {
  if (!fixture?.timing) return;
  console.info(`[community timing] ${phase}: ${(performance.now() - fixture.timing).toFixed(1)} ms`);
}

function fields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    value === null ? { nullValue: null }
      : value instanceof Date ? { timestampValue: value.toISOString() }
        : typeof value === "boolean" ? { booleanValue: value }
          : typeof value === "number" ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
            : { stringValue: value }
  ]));
}

async function seed(request, path, data) {
  fixture.documents.add(path);
  const response = await request.patch(`${root}/${path}`, { headers, data: { fields: fields(data) } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function seedDocuments(request, documents, { createOnly = true } = {}) {
  const writes = Object.entries(documents).map(([path, data]) => {
    fixture.documents.add(path);
    const write = { update: { name: `projects/${project}/databases/(default)/documents/${path}`, fields: fields(data) } };
    if (createOnly) write.currentDocument = { exists: false };
    return write;
  });
  const response = await request.post(`${root}:commit`, { headers, data: { writes } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

function tipsterDocuments(id, index) {
  const username = `${fixture.prefix}-${index}`;
  return {
  [`perfiles/${id}`]: {
    id, username, nombre_publico: `Comunidad ${index}`, bio: null, color_primario: "#34d399",
    tipster_status: "approved", is_online: false, last_active_at: null,
    created_at: new Date("2026-10-04T12:00:00Z"),
    ...(index === 0 ? {} : { followerCount: 0 })
  },
  [`perfiles_social/${id}`]: {
    avatar_url: null, banner_url: null, kick_url: null, twitch_url: null,
    youtube_url: null, telegram_url: null, twitter_url: null, instagram_url: null
  },
  [`usernames/${username}`]: { uid: id },
  [`picks/${id}-pick`]: {
    user_id: id, sport: "futbol", event: `Evento comunidad ${index}`,
    selection: "Más de 1.5 goles", odds: 1.85,
    bookmaker: "betano", event_date: new Date("2026-10-10T20:00:00Z"),
    confianza: null, analysis: null, destacada: false, show_on_stream: false, status: "pending",
    created_at: new Date(Date.UTC(2026, 9, 5, 12, index))
  }
  };
}

async function seedTipster(request, id, index) {
  await seedDocuments(request, tipsterDocuments(id, index));
}

function trackUser(user) {
  fixture.users.set(user.uid, user.idToken);
  fixture.documents.add(`users/${user.uid}`);
  fixture.documents.add(`presencia/${user.uid}`);
  fixture.documents.add(`viewerPresence/${user.uid}`);
  fixture.documents.add(`legalAcceptances/${user.uid}/versions/2026-10-03`);
  fixture.documents.add(`commentRateLimits/${user.uid}`);
  for (const id of fixture.ids) fixture.documents.add(`follows/${user.uid}_${id}`);
}

async function signInGoogle(page, label) {
  const user = await page.evaluate(async ({ prefix, label }) => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { GoogleAuthProvider, signInWithCredential } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    const token = JSON.stringify({
      sub: `${prefix}-${label}`, email: `${prefix}-${label}@example.test`,
      email_verified: true, name: `Viewer ${label}`
    });
    const credential = await signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(token));
    return { uid: credential.user.uid, idToken: await credential.user.getIdToken() };
  }, { prefix: fixture.prefix, label });
  trackUser(user);
  await expect(page.locator("#viewerName")).toHaveText(`Viewer ${label}`);
  await expect(page.locator(`#directoryList button[data-follow="${fixture.ids[0]}"]`)).toBeEnabled();
  return user;
}

async function acceptTerms(request, user) {
  await seed(request, `legalAcceptances/${user.uid}/versions/2026-10-03`, {
    uid: user.uid, terms_version: "2026-10-03", privacy_version: "2026-10-03",
    age_confirmed: true, accepted_at: new Date()
  });
}

async function readCount(request, id) {
  const response = await request.get(`${root}/perfiles/${id}`, { headers });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return Number(body.fields.followerCount?.integerValue || 0);
}

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request, page }) => {
  fixture = { prefix: `cm${randomUUID().replaceAll("-", "").slice(0, 12)}`, ids: [], documents: new Set(), users: new Map() };
  if (process.env.COMMUNITY_TIMING === "1" && test.info().title.startsWith("categorías filtran")) fixture.timing = performance.now();
  traceCategory("preparación iniciada");
  const documents = {};
  for (let index = 0; index < 11; index++) {
    const id = `${fixture.prefix}-${index}`;
    fixture.ids.push(id);
    Object.assign(documents, tipsterDocuments(id, index));
  }
  await seedDocuments(request, documents);
  await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
  await mockGooglePopup(page, { subject: `${fixture.prefix}-popup`, email: `${fixture.prefix}-popup@example.test`, name: "Viewer Google" });
  traceCategory("datos preparados; navegación iniciada");
  await page.goto("/");
  traceCategory("navegación completada");
  await expect(page.locator("#viewerLogin")).toBeEnabled();
  await expect(page.locator(`#directoryList button[data-follow="${fixture.ids[0]}"]`)).toBeEnabled();
  traceCategory("directorio listo");
});

test.afterEach(async ({ request, page }) => {
  if (!fixture) return;
  traceCategory("limpieza iniciada");
  if (!page.isClosed()) await page.goto("about:blank");
  const writes = [...fixture.documents].sort((a, b) => b.split("/").length - a.split("/").length)
    .map(path => ({ delete: `projects/${project}/databases/(default)/documents/${path}` }));
  const cleanup = await request.post(`${root}:commit`, { headers, data: { writes } });
  expect(cleanup.ok(), "Eliminar exclusivamente documentos de la fixture de comunidad").toBeTruthy();
  if (fixture.restoreCommunitySettings) {
    const { exists: existed, fields: savedFields } = fixture.restoreCommunitySettings;
    const path = `${root}/platformSettings/communityModeration`;
    const restored = existed
      ? await request.patch(path, { headers, data: { fields: savedFields } })
      : await request.delete(path, { headers });
    expect(restored.ok(), "Restaurar la configuración comunitaria previa").toBeTruthy();
  }
  for (const idToken of fixture.users.values()) {
    const response = await request.post(`${authRoot}/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key`, {
      data: { idToken }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  traceCategory("limpieza completada");
});

test("directorio adapta cada fila al espacio y concentra el enlace del perfil en su identidad", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  const username = `${fixture.prefix}-0`;
  const tipsterId = fixture.ids[0];
  const profileLink = page.locator(`#directoryList a[data-username="${username}"]`);
  const followButton = page.locator(`#directoryList button[data-follow="${tipsterId}"]`);

  await expect(profileLink).toBeVisible();
  await expect(profileLink).toHaveAttribute("href", `?u=${username}`);
  await expect(profileLink).toContainText(`Comunidad 0`);
  await expect(followButton).toBeVisible();
  await expect(page.locator("#directoryList").getByText("Ver perfil", { exact: true })).toHaveCount(0);
  expect(await page.locator("#directoryList").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(1);

  const geometry = await profileLink.evaluate(element => {
    const row = element.closest(".directory-card");
    const identity = element.getBoundingClientRect();
    const follow = row.querySelector("[data-follow]").getBoundingClientRect();
    return { row: row.getBoundingClientRect(), identity, follow };
  });
  expect(geometry.identity.right).toBeLessThanOrEqual(geometry.follow.left);
  expect(geometry.follow.right).toBeLessThanOrEqual(geometry.row.right);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator("#directoryList").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(1);
  await expect(followButton).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.locator("#directoryList").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
  await expect(profileLink).toBeVisible();
  await expect(followButton).toBeVisible();
});

test("categorías filtran pronósticos públicos en tiempo real y conservan el directorio", async ({ page, request }) => {
  const cards = page.locator(`#publicPicks article[data-author^="${fixture.prefix}"]`);
  traceCategory("esperando 11 tarjetas iniciales");
  await expect(cards).toHaveCount(11);
  traceCategory("11 tarjetas renderizadas");
  await page.getByRole("button", { name: "Tenis", exact: true }).click();
  traceCategory("clic Tenis emitido");
  await expect(page.getByRole("button", { name: "Tenis", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(0);
  traceCategory("categoría Tenis aplicada");
  const response = await request.patch(`${root}/picks/${fixture.ids[0]}-pick?updateMask.fieldPaths=sport`, {
    headers, data: { fields: { sport: { stringValue: "tenis" } } }
  });
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).fields.sport.stringValue).toBe("tenis");
  traceCategory("PATCH sport=tenis confirmado");
  await cards.first().waitFor({ state: "visible", timeout: 10000 });
  traceCategory("tarjeta Tenis renderizada");
  await expect(cards).toHaveCount(1);
  await expect(page.locator(`#directoryList a[data-username^="${fixture.prefix}"]`)).toHaveCount(11);
  for (const [sport, label] of [
    ["baloncesto", "Baloncesto"], ["esports", "E-Sports"], ["beisbol", "Otros / Más deportes"]
  ]) {
    traceCategory(`PATCH sport=${sport} iniciado`);
    const updated = await request.patch(`${root}/picks/${fixture.ids[0]}-pick?updateMask.fieldPaths=sport`, {
      headers, data: { fields: { sport: { stringValue: sport } } }
    });
    expect(updated.ok()).toBeTruthy();
    expect((await updated.json()).fields.sport.stringValue).toBe(sport);
    traceCategory(`PATCH sport=${sport} confirmado`);
    await page.getByRole("button", { name: label, exact: true }).click();
    traceCategory(`clic ${label} emitido`);
    await cards.first().waitFor({ state: "visible", timeout: 10000 });
    traceCategory(`tarjeta ${label} renderizada`);
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  traceCategory("clic Todos emitido");
  await expect(cards).toHaveCount(11);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(page.locator("#channelSidebar")).toBeVisible();
  }
  traceCategory("validación completada");
});

test("el mural abre el hilo del pick seleccionado", async ({ page }) => {
  const pick = page.locator(`#publicPicks article[data-author="${fixture.ids[0]}"]`);
  await expect(pick).toBeVisible();
  await pick.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator("#muralContext")).toContainText("Evento comunidad 0");
  await expect(page.locator("#communityMural")).toBeVisible();
});

test("solo la ACL comunitaria puede editar la blacklist dinámica", async ({ page, request }) => {
  const user = await signInGoogle(page, "community-admin");
  await acceptTerms(request, user);
  const settingPath = `${root}/platformSettings/communityModeration`;
  const previousSetting = await request.get(settingPath, { headers });
  expect([200, 404]).toContain(previousSetting.status());
  fixture.restoreCommunitySettings = previousSetting.ok()
    ? { exists: true, fields: (await previousSetting.json()).fields }
    : { exists: false, fields: null };
  const adminPath = `platformAdmins/${user.uid}`;
  fixture.documents.add(adminPath);
  const admin = await request.patch(`${root}/${adminPath.split("/").map(encodeURIComponent).join("/")}`, {
    headers,
    data: { fields: {
      enabled: { booleanValue: true },
      role: { stringValue: "admin" },
      permissions: { arrayValue: { values: [{ stringValue: "community" }] } },
      updated_at: { timestampValue: new Date().toISOString() },
      updated_by: { stringValue: user.uid }
    } }
  });
  expect(admin.ok(), await admin.text()).toBeTruthy();
  await page.goto("/admin-dashboard.html");
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#community-tab")).toBeVisible();
  await page.locator("#community-tab").click();
  await expect(page.locator("#community-panel")).toBeVisible();
  await page.locator("#communityBlockedTerms").fill("telegram\nwhatsapp");
  await page.getByRole("button", { name: "Guardar filtro" }).click();
  await expect(page.locator("#admin-message")).toContainText("Filtro guardado");
  const saved = await request.get(settingPath, { headers });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  expect((await saved.json()).fields.blockedTerms.stringValue).toBe("telegram\nwhatsapp");
  await page.goto("/");
  const card = page.locator(`#publicPicks article[data-author="${fixture.ids[0]}"]`);
  await card.getByRole("button", { name: "Comentar" }).click();
  await page.locator("#muralInput").fill("Hablemos por whatsapp");
  await expect(page.locator("#muralSend")).toBeEnabled();
  await page.locator("#muralSend").click();
  await expect(page.locator("#muralNotice")).toContainText("término bloqueado");
  await expect(page.locator("#muralEntries .mural-entry")).toHaveCount(0);
});

test("las reglas permiten comentar con términos aceptados y bloquean el flood", async ({ page, request }) => {
  const user = await signInGoogle(page, "mural");
  await acceptTerms(request, user);
  const pickId = `${fixture.ids[0]}-pick`;
  const commentId = await page.evaluate(async pickId => {
    const { firebaseAuth, firebaseDb } = await import("/firebase-config.js?v=2");
    const { collection, doc, serverTimestamp, writeBatch } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const comment = doc(collection(firebaseDb, "picks", pickId, "comments"));
    const rate = doc(firebaseDb, "commentRateLimits", firebaseAuth.currentUser.uid);
    const batch = writeBatch(firebaseDb);
    batch.set(comment, {
      authorUid: firebaseAuth.currentUser.uid,
      authorName: firebaseAuth.currentUser.displayName || "Miembro",
      text: "Buen análisis, gracias por compartirlo.",
      created_at: serverTimestamp()
    });
    batch.set(rate, { last_at: serverTimestamp(), last_pick_id: pickId, last_comment_id: comment.id });
    await batch.commit();
    return comment.id;
  }, pickId);
  fixture.documents.add(`picks/${pickId}/comments/${commentId}`);
  fixture.documents.add(`commentRateLimits/${user.uid}`);
  const secondComment = await page.evaluate(async pickId => {
    const { firebaseAuth, firebaseDb } = await import("/firebase-config.js?v=2");
    const { collection, doc, serverTimestamp, writeBatch } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const comment = doc(collection(firebaseDb, "picks", pickId, "comments"));
    const rate = doc(firebaseDb, "commentRateLimits", firebaseAuth.currentUser.uid);
    const batch = writeBatch(firebaseDb);
    batch.set(comment, {
      authorUid: firebaseAuth.currentUser.uid,
      authorName: firebaseAuth.currentUser.displayName || "Miembro",
      text: "Segundo comentario demasiado rápido.",
      created_at: serverTimestamp()
    });
    batch.set(rate, { last_at: serverTimestamp(), last_pick_id: pickId, last_comment_id: comment.id });
    try {
      await batch.commit();
      return "allowed";
    } catch (error) {
      return error.code;
    }
  }, pickId);
  expect(secondComment).toBe("permission-denied");
});

test("Firestore rechaza enlaces aunque se omita la validación de la interfaz", async ({ page, request }) => {
  const user = await signInGoogle(page, "mural-link");
  await acceptTerms(request, user);
  const result = await page.evaluate(async pickId => {
    const { firebaseAuth, firebaseDb } = await import("/firebase-config.js?v=2");
    const { collection, doc, serverTimestamp, writeBatch } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const comment = doc(collection(firebaseDb, "picks", pickId, "comments"));
    const rate = doc(firebaseDb, "commentRateLimits", firebaseAuth.currentUser.uid);
    const batch = writeBatch(firebaseDb);
    batch.set(comment, {
      authorUid: firebaseAuth.currentUser.uid,
      authorName: firebaseAuth.currentUser.displayName || "Miembro",
      text: "Oferta externa\nhttps://example.test/promo",
      created_at: serverTimestamp()
    });
    batch.set(rate, {
      last_at: serverTimestamp(), last_pick_id: pickId, last_comment_id: comment.id
    });
    try {
      await batch.commit();
      return { result: "allowed", commentId: comment.id };
    } catch (error) {
      return { result: error.code, commentId: comment.id };
    }
  }, `${fixture.ids[0]}-pick`);
  fixture.documents.add(`picks/${fixture.ids[0]}-pick/comments/${result.commentId}`);
  expect(result.result).toBe("permission-denied");
});

test("Firestore rechaza comentarios vacíos aunque se omita la interfaz", async ({ page, request }) => {
  const user = await signInGoogle(page, "mural-empty");
  await acceptTerms(request, user);
  const attempt = await page.evaluate(async pickId => {
    const { firebaseAuth, firebaseDb } = await import("/firebase-config.js?v=2");
    const { collection, doc, serverTimestamp, writeBatch } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const comment = doc(collection(firebaseDb, "picks", pickId, "comments"));
    const rate = doc(firebaseDb, "commentRateLimits", firebaseAuth.currentUser.uid);
    const batch = writeBatch(firebaseDb);
    batch.set(comment, {
      authorUid: firebaseAuth.currentUser.uid,
      authorName: firebaseAuth.currentUser.displayName || "Miembro",
      text: " \n\t ",
      created_at: serverTimestamp()
    });
    batch.set(rate, {
      last_at: serverTimestamp(), last_pick_id: pickId, last_comment_id: comment.id
    });
    try {
      await batch.commit();
      return { result: "allowed", commentId: comment.id };
    } catch (error) {
      return { result: error.code, commentId: comment.id };
    }
  }, `${fixture.ids[0]}-pick`);
  fixture.documents.add(`picks/${fixture.ids[0]}-pick/comments/${attempt.commentId}`);
  expect(attempt.result).toBe("permission-denied");
});

test("las tarjetas abren su mural y los comentarios se muestran como texto seguro", async ({ page, request }) => {
  const pickId = `${fixture.ids[0]}-pick`;
  await seed(request, `picks/${pickId}/comments/qa-comment`, {
    authorUid: "public-viewer",
    authorName: "Miembro de prueba",
    text: '<img src=x onerror="alert(1)"> comentario visible',
    created_at: new Date()
  });

  const card = page.locator(`#publicPicks article[data-author="${fixture.ids[0]}"]`);
  await card.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator("#muralContext")).toContainText("Evento comunidad 0");
  await expect(page.locator("#muralEntries")).toContainText("Miembro de prueba");
  await expect(page.locator("#muralEntries")).toContainText('<img src=x onerror="alert(1)"> comentario visible');
  await expect(page.locator("#muralEntries img")).toHaveCount(0);
  await expect(page.locator("#muralEntries .mural-comment-badge")).toHaveText("Correo verificado");
});

test("un viewer verificado acepta términos, publica y queda limitado por intervalo", async ({ page }) => {
  const user = await signInGoogle(page, "mural-ui");
  const card = page.locator(`#publicPicks article[data-author="${fixture.ids[0]}"]`);
  await card.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator("#muralSignIn")).toHaveText("Aceptar términos");
  await page.locator("#muralSignIn").click();
  await expect(page.locator("#viewerConsent")).toBeVisible();
  await page.locator("#viewerAge").check();
  await page.locator("#viewerTerms").check();
  await page.locator("#viewerConsentSave").click();
  await expect(page.locator("#viewerConsent")).toBeHidden();
  await expect(page.locator("#muralSend")).toBeEnabled();
  await page.locator("#muralInput").fill("Buen análisis, revisaré el resultado.");
  await page.locator("#muralSend").click();
  await expect(page.locator("#muralEntries")).toContainText("Buen análisis, revisaré el resultado.");
  await expect(page.locator("#muralEntries")).toContainText("Viewer mural-ui");
  await expect(page.locator("#muralSend")).toBeDisabled();
  await expect(page.locator("#muralNotice")).toContainText("otro comentario en");
});

test("el permiso comunitario habilita silenciar y eliminar comentarios desde el hilo", async ({ page, request }) => {
  const pickId = `${fixture.ids[0]}-pick`;
  await seed(request, `picks/${pickId}/comments/moderation-comment`, {
    authorUid: "public-viewer",
    authorName: "Miembro a moderar",
    text: "Comentario sujeto a moderación.",
    created_at: new Date()
  });
  fixture.documents.add(`picks/${pickId}/commentMutes/public-viewer`);
  const user = await signInGoogle(page, "community-moderator");
  const adminPath = `platformAdmins/${user.uid}`;
  fixture.documents.add(adminPath);
  const admin = await request.patch(`${root}/${adminPath}`, {
    headers,
    data: { fields: {
      enabled: { booleanValue: true },
      role: { stringValue: "admin" },
      permissions: { arrayValue: { values: [{ stringValue: "community" }] } },
      updated_at: { timestampValue: new Date().toISOString() },
      updated_by: { stringValue: user.uid }
    } }
  });
  expect(admin.ok(), await admin.text()).toBeTruthy();
  const card = page.locator(`#publicPicks article[data-author="${fixture.ids[0]}"]`);
  await card.getByRole("button", { name: "Comentar" }).click();
  const comment = page.locator("#muralEntries .mural-entry");
  await expect(comment).toContainText("Comentario sujeto a moderación.");
  await comment.getByRole("button", { name: "Silenciar Miembro a moderar" }).click();
  await expect(comment.getByRole("button", { name: "Retirar silencio a Miembro a moderar" })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await comment.getByRole("button", { name: "Eliminar comentario de Miembro a moderar" }).click();
  await expect(page.locator("#muralEntries .mural-entry")).toHaveCount(0);
});

test("conectados muestran avatar circular, nickname y un máximo de 20 sin desplegable", async ({ page, request }) => {
  const ownCards = page.locator(`#onlineGrid a[data-username^="${fixture.prefix}"]`);
  await expect(page.locator("#onlineGrid")).toHaveAttribute("aria-busy", "false");
  await expect(ownCards).toHaveCount(0);
  const fixtureDocuments = {};
  for (let index = fixture.ids.length; index < 21; index++) {
    const id = `${fixture.prefix}-${index}`;
    fixture.ids.push(id);
    Object.assign(fixtureDocuments, tipsterDocuments(id, index));
  }
  for (const [index, id] of fixture.ids.entries()) {
    fixtureDocuments[`perfiles/${id}`] = {
      id, username: `${fixture.prefix}-${index}`,
      nombre_publico: `AAA QA ${String(index).padStart(2, "0")}`,
      tipster_status: "approved", followerCount: 0,
      bio: null, color_primario: "#34d399", is_online: false, last_active_at: null, created_at: new Date()
    };
    fixtureDocuments[`presencia/${id}`] = { is_online: false, last_active_at: null };
  }
  await seedDocuments(request, fixtureDocuments, { createOnly: false });

  await seed(request, `presencia/${fixture.ids[0]}`, { is_online: true, last_active_at: new Date() });
  await expect(ownCards).toHaveCount(1);
  await expect(ownCards.first()).toContainText(`@${fixture.prefix}-0`);
  await expect(ownCards.first().locator(".online-avatar")).toHaveCSS("border-radius", "50%");
  await expect(ownCards.first().locator(".online-status")).toHaveAttribute("aria-label", "Conectado en la plataforma");

  const onlineDocuments = Object.fromEntries(fixture.ids.slice(1).map(id => [
    `presencia/${id}`, { is_online: true, last_active_at: new Date() }
  ]));
  await seedDocuments(request, onlineDocuments, { createOnly: false });
  await expect(page.locator("#onlineGrid .online-card")).toHaveCount(20);
  await expect(ownCards).toHaveCount(20);
  expect(await page.locator("#onlineGrid").evaluate(element => !!element.closest("details"))).toBe(false);
  const id = fixture.ids[0];
  await seed(request, `perfiles_social/${id}`, {
    avatar_url: "data:image/png;base64,invalid", banner_url: null, kick_url: null, twitch_url: null,
    youtube_url: null, telegram_url: null, twitter_url: null, instagram_url: null
  });
  await page.reload();
  await expect(ownCards).toHaveCount(20);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(ownCards.first().locator(".online-avatar-fallback")).toBeVisible();
  }
});

test("Google popup, consentimiento, persistencia y respuesta optimista sin duplicar follows", async ({ page, request }, testInfo) => {
  const id = fixture.ids[0];
  const follow = page.locator(`#directoryList button[data-follow="${id}"]`);
  await follow.click();
  await page.locator("#viewerAuthGoogle").click();
  await expect(page.locator("#viewerConsent")).toBeVisible();
  const user = await page.evaluate(async () => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    return { uid: firebaseAuth.currentUser.uid, idToken: await firebaseAuth.currentUser.getIdToken() };
  });
  trackUser(user);
  await page.locator("#viewerAge").check();
  await page.locator("#viewerTerms").check();
  await page.locator("#viewerConsentSave").click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(follow).toBeEnabled();
  await expect.poll(() => readCount(request, id)).toBe(1);
  const document = await request.get(`${root}/users/${user.uid}`, { headers });
  const viewer = await document.json();
  expect(viewer.fields.role.stringValue).toBe("viewer");
  await page.reload();
  await expect(page.locator("#viewerName")).toHaveText("Viewer Google");
  await expect(page.locator("#viewerLogin")).toBeHidden();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(follow).toBeEnabled();
  const saved = await (await request.get(`${root}/users/${user.uid}`, { headers })).json();
  expect(saved.fields.created_at).toEqual(viewer.fields.created_at);
  await page.route("**/documents:commit", async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.continue();
  });
  const immediate = await follow.evaluate(button => {
    const start = performance.now();
    button.click();
    return { elapsed: performance.now() - start, pressed: button.getAttribute("aria-pressed"), busy: button.getAttribute("aria-busy") };
  });
  expect(immediate.elapsed).toBeLessThan(100);
  expect(immediate.pressed).toBe("false");
  expect(immediate.busy).toBe("true");
  await expect(follow).toBeEnabled();
  await expect.poll(() => readCount(request, id)).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("community-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("community-desktop.png"), fullPage: true });
  await page.locator("#userMenuButton").click();
  await page.locator("#viewerLogout").click();
  await expect(page.locator("#viewerLogin")).toBeVisible();
  await page.locator("#followingTab").click();
  await expect(page.locator("#followingPicks article")).toHaveCount(0);
});

test("feed con 11 creadores combina grupos, ordena, actualiza y excluye revocados", async ({ page, request }, testInfo) => {
  test.setTimeout(60_000);
  const user = await signInGoogle(page, "feed");
  await acceptTerms(request, user);
  await page.evaluate(async ids => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { setFollowing } = await import("/community.js");
    for (const id of ids) await setFollowing(firebaseAuth.currentUser, id, true);
  }, fixture.ids);
  await page.locator("#followingTab").click();
  await expect(page.locator("#followingPicks article")).toHaveCount(11);
  await expect(page.locator("#followingPicks article").first()).toContainText("Evento comunidad 10");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await auditButtons(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`following-feed-${width}.png`), animations: "disabled" });
  }
  await seed(request, `picks/${fixture.ids[10]}-pick`, {
    user_id: fixture.ids[10], event: "Evento actualizado", selection: "Nueva selección",
    odds: 2, bookmaker: "betano", event_date: new Date("2026-10-10T20:00:00Z"),
    created_at: new Date("2026-10-05T13:00:00Z"), status: "won"
  });
  await expect(page.locator("#followingPicks article").first()).toContainText("Evento actualizado");
  const revoked = await request.patch(`${root}/perfiles/${fixture.ids[10]}?updateMask.fieldPaths=tipster_status`, {
    headers, data: { fields: { tipster_status: { stringValue: "revoked" } } }
  });
  expect(revoked.ok()).toBeTruthy();
  await expect(page.locator("#followingPicks article")).toHaveCount(10);
  await expect(page.locator("#followingPicks")).not.toContainText("Evento actualizado");
  await page.locator("#exploreTab").click();
  await page.locator("#followingTab").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#exploreTab")).toBeFocused();
});

test("reglas bloquean escalada, suplantación, contadores aislados y relaciones no atómicas", async ({ page, request }) => {
  const user = await signInGoogle(page, "rules");
  const id = fixture.ids[0];
  const denied = await page.evaluate(async ({ uid, id }) => {
    const { firebaseDb } = await import("/firebase-config.js?v=2");
    const { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const operations = [
      () => updateDoc(doc(firebaseDb, "users", uid), { role: "tipster" }),
      () => setDoc(doc(firebaseDb, "users", `${uid}-other`), { uid: `${uid}-other`, role: "viewer" }),
      () => getDoc(doc(firebaseDb, "users", `${uid}-other`)),
      () => updateDoc(doc(firebaseDb, "perfiles", id), { followerCount: 500, followerCountUpdatedBy: uid }),
      () => setDoc(doc(firebaseDb, "follows", `${uid}_${id}`), { followerId: uid, tipsterId: id, created_at: serverTimestamp() }),
      () => deleteDoc(doc(firebaseDb, "users", uid))
    ];
    const results = [];
    for (const operation of operations) {
      try { await operation(); results.push("allowed"); }
      catch (error) { results.push(error.code); }
    }
    return results;
  }, { uid: user.uid, id });
  expect(denied).toEqual(Array(6).fill("permission-denied"));
  await acceptTerms(request, user);
  const afterConsent = await page.evaluate(async id => {
    const { firebaseAuth, firebaseDb } = await import("/firebase-config.js?v=2");
    const { setFollowing } = await import("/community.js");
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const uid = firebaseAuth.currentUser.uid;
    let code;
    try { await setDoc(doc(firebaseDb, "follows", `${uid}_${id}`), { followerId: uid, tipsterId: id, created_at: serverTimestamp() }); }
    catch (error) { code = error.code; }
    await Promise.all([setFollowing(firebaseAuth.currentUser, id, true), setFollowing(firebaseAuth.currentUser, id, true)]);
    return code;
  }, id);
  expect(afterConsent).toBe("permission-denied");
  await expect.poll(() => readCount(request, id)).toBe(1);
  const button = page.locator(`#directoryList button[data-follow="${id}"]`);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  const beforeConsent = await request.delete(`${root}/legalAcceptances/${user.uid}/versions/2026-10-03`, { headers });
  expect(beforeConsent.ok()).toBeTruthy();
  await page.reload();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("#viewerConsent")).toBeVisible();
  await page.locator("#viewerConsentCancel").click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => readCount(request, id)).toBe(1);
});

test("contador del panel tipster se actualiza con follows concurrentes de viewers distintos", async ({ page, browser, request }, testInfo) => {
  test.setTimeout(60_000);
  const tipster = await signInGoogle(page, "tipster");
  fixture.ids.push(tipster.uid);
  await seedTipster(request, tipster.uid, 12);
  await acceptTerms(request, tipster);
  await page.goto("/admin.html");
  await expect(page.locator("#dashboardTitle")).toHaveText("Panel de tipster");
  await expect(page.locator("#followerCount")).toHaveText("0");
  await expect(page.locator("#myPicks")).toHaveAttribute("aria-busy", "false");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await auditButtons(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`tipster-dashboard-${width}.png`), animations: "disabled" });
  }
  const contexts = [];
  try {
    for (const label of ["first", "second"]) {
      const context = await browser.newContext();
      contexts.push(context);
      const viewerPage = await context.newPage();
      await viewerPage.goto("/");
      const viewer = await signInGoogle(viewerPage, label);
      await acceptTerms(request, viewer);
    }
    await Promise.all(contexts.map(context => context.pages()[0].evaluate(async id => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const { setFollowing } = await import("/community.js");
      await setFollowing(firebaseAuth.currentUser, id, true);
    }, tipster.uid)));
    await expect(page.locator("#followerCount")).toHaveText("2");
    await Promise.all(contexts.map(context => context.pages()[0].evaluate(async id => {
      const { firebaseAuth } = await import("/firebase-config.js?v=2");
      const { setFollowing } = await import("/community.js");
      await setFollowing(firebaseAuth.currentUser, id, false);
    }, tipster.uid)));
    await expect(page.locator("#followerCount")).toHaveText("0");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
