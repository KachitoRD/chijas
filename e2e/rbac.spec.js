import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const authRoot = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const firestoreRoot = "http://127.0.0.1:8080/v1/projects/demo-fijas-vivo/databases/(default)/documents";
const headers = { Authorization: "Bearer owner" };
const password = "Test-password-123!";
let account;
let documents;
let originalSettings;
let settingsChanged;

async function provision(request, path, fields) {
  documents.add(path);
  const response = await request.patch(`${firestoreRoot}/${path}`, { headers, data: { fields } });
  expect(response.ok()).toBeTruthy();
}

async function login(page) {
  await page.goto("/user-profile.html");
  await page.evaluate(async ({ email, password }) => {
    const { firebaseAuth } = await import("/firebase-config.js?v=2");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  }, { email: account.email, password });
}

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request, page }) => {
  documents = new Set();
  settingsChanged = false;
  const settings = await request.get(`${firestoreRoot}/platformSettings/limits`, { headers });
  expect(settings.ok() || settings.status() === 404).toBeTruthy();
  originalSettings = settings.ok() ? (await settings.json()).fields : null;
  const email = `rbac-${randomUUID()}@example.test`;
  const response = await request.post(`${authRoot}/accounts:signUp?key=demo-key`, {
    data: { email, password, returnSecureToken: true }
  });
  expect(response.ok()).toBeTruthy();
  account = { ...await response.json(), email };
  const verified = await request.post(`${authRoot}/accounts:update?key=demo-key`, {
    headers, data: { localId: account.localId, emailVerified: true }
  });
  expect(verified.ok()).toBeTruthy();
  await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
});

test.afterEach(async ({ request }) => {
  if (settingsChanged) {
    const response = originalSettings
      ? await request.patch(`${firestoreRoot}/platformSettings/limits`, { headers, data: { fields: originalSettings } })
      : await request.delete(`${firestoreRoot}/platformSettings/limits`, { headers });
    expect(response.ok()).toBeTruthy();
  }
  for (const path of documents) {
    const response = await request.delete(`${firestoreRoot}/${path}`, { headers });
    expect(response.ok() || response.status() === 404).toBeTruthy();
  }
  const response = await request.post(`${authRoot}/accounts:delete?key=demo-key`, {
    data: { idToken: account.idToken }
  });
  expect(response.ok()).toBeTruthy();
});

for (const scenario of [
  { name: "super_admin", role: "super_admin", enabled: true, allowed: true },
  { name: "admin", role: "admin", enabled: true, allowed: true },
  { name: "administrador legado", enabled: true, allowed: true },
  { name: "ACL deshabilitada", role: "super_admin", enabled: false, allowed: false },
  { name: "rol inválido", role: "viewer", enabled: true, allowed: false },
  { name: "viewer sin ACL", allowed: false }
]) {
  test(`RBAC administración: ${scenario.name}`, async ({ page, request }) => {
    if ("enabled" in scenario) {
      await provision(request, `platformAdmins/${account.localId}`, {
        enabled: { booleanValue: scenario.enabled },
        ...(scenario.role ? { role: { stringValue: scenario.role } } : {})
      });
    }
    const applicationId = `app-${randomUUID()}`;
    await provision(request, `tipsterApplications/${applicationId}`, {
      uid: { stringValue: applicationId }, display_name: { stringValue: "Solicitante" },
      email: { stringValue: "applicant@example.test" }, requested_username: { stringValue: applicationId },
      status: { stringValue: "pending" }, submitted_at: { timestampValue: new Date().toISOString() },
      reviewed_at: { nullValue: null }, reviewed_by: { nullValue: null }
    });
    await login(page);
    const result = await page.evaluate(async applicationId => {
      const { firebaseDb, firebaseAuth } = await import("/firebase-config.js?v=2");
      const { doc, getDoc, setDoc, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      const results = [];
      try { await getDoc(doc(firebaseDb, "platformSettings", "limits")); results.push("read"); }
      catch (error) { results.push(error.code); }
      try {
        const settingsRef = doc(firebaseDb, "platformSettings", "limits");
        const settings = (await getDoc(settingsRef)).data();
        await setDoc(settingsRef, {
          tipsterMonthlyPickLimit: settings?.tipsterMonthlyPickLimit ?? 50,
          viewerMonthlyPickLimit: settings?.viewerMonthlyPickLimit ?? 20,
          updated_at: serverTimestamp(), updated_by: firebaseAuth.currentUser.uid
        });
        results.push("configured");
      } catch (error) { results.push(error.code); }
      try {
        await updateDoc(doc(firebaseDb, "tipsterApplications", applicationId), {
          status: "rejected", reviewed_at: serverTimestamp(), reviewed_by: firebaseAuth.currentUser.uid
        });
        results.push("reviewed");
      } catch (error) { results.push(error.code); }
      return results;
    }, applicationId);
    settingsChanged = result.includes("configured");
    expect(result).toEqual([
      "read", scenario.allowed && scenario.role !== "admin" ? "configured" : "permission-denied",
      scenario.allowed ? "reviewed" : "permission-denied"
    ]);
    await page.goto("/admin-dashboard.html");
    if (scenario.allowed) {
      await expect(page.locator("#dashboard")).toBeVisible();
      await provision(request, `platformAdmins/${account.localId}`, {
        enabled: { booleanValue: false },
        ...(scenario.role ? { role: { stringValue: scenario.role } } : {})
      });
      await expect(page.locator("#dashboard")).toBeHidden();
      await expect(page.locator("#auth-message")).toBeVisible();
    } else {
      await expect(page.locator("#auth-message")).toBeVisible();
      await expect(page.locator("#dashboard")).toBeHidden();
    }
  });
}

test("RBAC no permite autoasignar ACL ni convertir users.role en autoridad", async ({ page, request }) => {
  await provision(request, `users/${account.localId}`, {
    uid: { stringValue: account.localId }, role: { stringValue: "super_admin" },
    displayName: { stringValue: "" }, photoURL: { nullValue: null },
    created_at: { timestampValue: new Date().toISOString() }
  });
  await login(page);
  const result = await page.evaluate(async () => {
    const { firebaseDb, firebaseAuth } = await import("/firebase-config.js?v=2");
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    try {
      await setDoc(doc(firebaseDb, "platformAdmins", firebaseAuth.currentUser.uid), {
        enabled: true, role: "super_admin"
      });
      return "allowed";
    } catch (error) { return error.code; }
  });
  expect(result).toBe("permission-denied");
  await page.goto("/admin-dashboard.html");
  await expect(page.locator("#auth-message")).toBeVisible();
  await expect(page.locator("#dashboard")).toBeHidden();
});

test("RBAC requiere correo verificado incluso para una ACL administrativa habilitada", async ({ page, request }) => {
  await provision(request, `platformAdmins/${account.localId}`, {
    enabled: { booleanValue: true }, role: { stringValue: "admin" }
  });
  const response = await request.post(`${authRoot}/accounts:update?key=demo-key`, {
    headers, data: { localId: account.localId, emailVerified: false }
  });
  expect(response.ok()).toBeTruthy();
  await login(page);
  await page.goto("/admin-dashboard.html");
  await expect(page.locator("#auth-message-text")).toContainText("Verifica tu correo");
  await expect(page.locator("#dashboard")).toBeHidden();
});

for (const approved of [false, true]) {
  test(`RBAC picks: ${approved ? "tipster aprobado" : "viewer con users.role tipster sin aprobación"}`, async ({ page, request }) => {
    const uid = account.localId;
    await provision(request, `users/${uid}`, {
      uid: { stringValue: uid }, role: { stringValue: "tipster" },
      displayName: { stringValue: "" }, photoURL: { nullValue: null },
      created_at: { timestampValue: new Date().toISOString() }
    });
    await provision(request, `legalAcceptances/${uid}/versions/2026-10-03`, {
      uid: { stringValue: uid }, terms_version: { stringValue: "2026-10-03" },
      privacy_version: { stringValue: "2026-10-03" }, age_confirmed: { booleanValue: true },
      accepted_at: { timestampValue: new Date().toISOString() }
    });
    if (approved) {
      await provision(request, `perfiles/${uid}`, {
        id: { stringValue: uid }, username: { stringValue: `t-${uid.slice(0, 20)}` },
        nombre_publico: { stringValue: "Tipster RBAC" }, bio: { nullValue: null },
        color_primario: { stringValue: "#34d399" }, tipster_status: { stringValue: "approved" },
        created_at: { timestampValue: new Date().toISOString() },
        followerCount: { integerValue: "0" }
      });
      documents.add(`presencia/${uid}`);
    }
    const pickId = `rbac-${randomUUID()}`;
    documents.add(`picks/${pickId}`);
    await login(page);
    const result = await page.evaluate(async pickId => {
      const { firebaseDb, firebaseAuth } = await import("/firebase-config.js?v=2");
      const { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      const { getAccountPermissions } = await import("/permissions.js");
      const permissions = await getAccountPermissions(firebaseAuth.currentUser);
      const ref = doc(firebaseDb, "picks", pickId);
      const pick = {
        user_id: firebaseAuth.currentUser.uid, sport: "futbol", event: "Evento RBAC",
        selection: "Más de 1.5 goles", odds: 1.85, league: "Liga RBAC", market: "Más/Menos", stake: 1,
        bookmaker: "betano",
        event_date: new Date(Date.now() + 3_600_000), confianza: null, analysis: "",
        destacada: false, show_on_stream: false, status: "pending", created_at: serverTimestamp()
      };
      const results = [];
      for (const operation of [
        () => setDoc(ref, pick), () => updateDoc(ref, { odds: 2.1 }), () => deleteDoc(ref)
      ]) {
        try { await operation(); results.push("allowed"); }
        catch (error) { results.push(error.code); }
      }
      return { permissions, results };
    }, pickId);
    expect(result.permissions.role).toBe(approved ? "tipster" : "viewer");
    expect(result.permissions.canPublish).toBe(approved);
    expect(result.results).toEqual(approved
      ? ["allowed", "allowed", "allowed"]
      : ["permission-denied", "permission-denied", "permission-denied"]);
    if (approved) {
      await provision(request, `picks/${pickId}`, {
        user_id: { stringValue: uid }, sport: { stringValue: "futbol" },
        event: { stringValue: "Evento iniciado" }, selection: { stringValue: "Más de 1.5 goles" },
        odds: { doubleValue: 1.85 }, league: { stringValue: "Liga RBAC" }, market: { stringValue: "Más/Menos" }, stake: { doubleValue: 1 },
        bookmaker: { stringValue: "betano" },
        event_date: { timestampValue: new Date(Date.now() - 60_000).toISOString() },
        confianza: { nullValue: null }, analysis: { stringValue: "" },
        destacada: { booleanValue: false }, show_on_stream: { booleanValue: false },
        status: { stringValue: "pending" }, created_at: { timestampValue: new Date().toISOString() }
      });
      const blocked = await page.evaluate(async pickId => {
        const { firebaseDb } = await import("/firebase-config.js?v=2");
        const { doc, updateDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
        const ref = doc(firebaseDb, "picks", pickId);
        const results = [];
        for (const operation of [() => updateDoc(ref, { odds: 2.1 }), () => deleteDoc(ref)]) {
          try { await operation(); results.push("allowed"); }
          catch (error) { results.push(error.code); }
        }
        return results;
      }, pickId);
      expect(blocked).toEqual(["permission-denied", "permission-denied"]);
    }
    await page.goto("/tipster-dashboard.html");
    if (approved) {
      await expect(page.locator("#pickForm")).toBeVisible();
      const response = await request.patch(
        `${firestoreRoot}/perfiles/${uid}?updateMask.fieldPaths=tipster_status`,
        { headers, data: { fields: { tipster_status: { stringValue: "revoked" } } } }
      );
      expect(response.ok()).toBeTruthy();
      await expect(page.locator("#accountGate")).toBeVisible();
      await expect(page.locator("#pickForm")).toBeHidden();
    } else {
      await expect(page.locator("#accountGate")).toBeVisible();
      await expect(page.locator("#pickForm")).toBeHidden();
    }
  });
}
