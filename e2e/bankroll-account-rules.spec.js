import { test, expect } from "@playwright/test";
import { bankrollFixture } from "./helpers/bankroll-fixture.js";
import { deleteVisualDocument } from "./helpers/visual-seed.js";

test.use({ baseURL: "http://127.0.0.1:5502" });

test("SDK real: role legacy tipster no bloquea al aprobado ni concede acceso sin aprobación", async ({ page, request }) => {
  const owner = await bankrollFixture(request);
  try {
    await owner.write(`users/${owner.uid}`, { role: "tipster" });
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    async function attemptOpening() {
      return page.evaluate(async owner => {
        const { firebaseDb: db, firebaseAuth: auth } = await import("/firebase-config.js?v=2");
        if (db.app.options.projectId !== "demo-fijas-vivo" || !auth.emulatorConfig) throw new Error("Solo emuladores.");
        const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
        const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
        await signInWithEmailAndPassword(auth, owner.email, owner.password);
        try {
          await setDoc(doc(db, "users", owner.uid, "bankrollAccounts", "EUR"),
            { currency: "EUR", initialMinorUnits: 0, created_at: serverTimestamp() });
          return "allowed";
        } catch (error) { return error.code; }
      }, { uid: owner.uid, email: owner.email, password: owner.password });
    }
    await owner.write(`perfiles/${owner.uid}`, { tipster_status: "revoked" });
    expect(await attemptOpening(), "role tipster sin perfil aprobado no concede apertura").toBe("permission-denied");
    await owner.write(`perfiles/${owner.uid}`, { tipster_status: "approved" });
    expect(await attemptOpening(), "dueño legacy verificado, activo, aprobado y con consentimiento puede abrir EUR").toBe("allowed");
  } finally {
    await page.close();
    await owner.cleanup();
  }
});

test("SDK real: bankroll privado, schema estricto, request.time, inmutabilidad y revocación", async ({ page, request }) => {
  test.setTimeout(120000);
  const owner = await bankrollFixture(request);
  const other = await bankrollFixture(request);
  try {
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    const results = await page.evaluate(async ({ owner, other }) => {
      const { firebaseDb: db, firebaseAuth: auth } = await import("/firebase-config.js?v=2");
      if (db.app.options.projectId !== "demo-fijas-vivo" || !auth.emulatorConfig) throw new Error("Solo emuladores.");
      const { signInWithEmailAndPassword, signOut } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      const { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } =
        await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      const results = {};
      const account = doc(db, "users", owner.uid, "bankrollAccounts", "PEN");
      const movements = collection(account, "movements");
      const movement = doc(movements, "valid");
      async function check(name, action) {
        try { await action(); results[name] = "allowed"; } catch (error) { results[name] = error.code; }
      }
      const opening = () => ({ currency: "PEN", initialMinorUnits: 0, created_at: serverTimestamp() });
      const entry = () => ({ type: "deposit", amountMinorUnits: 1, note: "", created_at: serverTimestamp() });
      await signInWithEmailAndPassword(auth, owner.email, owner.password);
      await check("absent-owner", () => getDoc(account));
      for (const [name, patch] of [
        ["extra", { role: "admin" }], ["negative", { initialMinorUnits: -1 }],
        ["fraction", { initialMinorUnits: 0.5 }], ["over", { initialMinorUnits: 100000000001 }],
        ["string", { initialMinorUnits: "0" }], ["wrong-currency", { currency: "USD" }],
        ["client-time", { created_at: Timestamp.fromMillis(1) }]
      ]) await check(name, () => setDoc(account, { ...opening(), ...patch }));
      await check("missing", () => setDoc(account, { currency: "PEN", created_at: serverTimestamp() }));
      await check("unsupported", () => setDoc(doc(db, "users", owner.uid, "bankrollAccounts", "GBP"), { ...opening(), currency: "GBP" }));
      await check("valid-opening", () => setDoc(account, opening()));
      await check("max-opening", () => setDoc(doc(db, "users", owner.uid, "bankrollAccounts", "USD"),
        { currency: "USD", initialMinorUnits: 100000000000, created_at: serverTimestamp() }));
      const data = (await getDoc(account)).data();
      results.timestamp = data.created_at.toMillis() > Date.now() - 60000;
      await check("list-owner", () => getDocs(collection(db, "users", owner.uid, "bankrollAccounts")));
      await check("second-opening", () => setDoc(account, opening()));
      await check("update-opening", () => updateDoc(account, { initialMinorUnits: 1 }));
      await check("delete-opening", () => deleteDoc(account));
      for (const [name, patch] of [
        ["zero-movement", { amountMinorUnits: 0 }], ["negative-movement", { amountMinorUnits: -1 }],
        ["fraction-movement", { amountMinorUnits: 1.5 }], ["over-movement", { amountMinorUnits: 100000000001 }],
        ["string-movement", { amountMinorUnits: "1" }], ["type-movement", { type: "payment" }],
        ["note-movement", { note: "x".repeat(201) }], ["note-type", { note: 1 }],
        ["extra-movement", { currency: "USD" }], ["time-movement", { created_at: Timestamp.fromMillis(1) }]
      ]) await check(name, () => setDoc(movement, { ...entry(), ...patch }));
      await check("missing-movement", () => setDoc(movement, { type: "deposit", amountMinorUnits: 1, created_at: serverTimestamp() }));
      await check("orphan-create", () => setDoc(doc(db, "users", owner.uid, "bankrollAccounts", "EUR", "movements", "orphan"), entry()));
      await check("orphan-list", () => getDocs(collection(db, "users", owner.uid, "bankrollAccounts", "EUR", "movements")));
      await check("valid-deposit", () => setDoc(movement, entry()));
      await check("valid-withdrawal", () => setDoc(doc(movements, "withdrawal"), { ...entry(), type: "withdrawal", amountMinorUnits: 100000000000, note: "x".repeat(200) }));
      await check("movement-owner-get", () => getDoc(movement));
      await check("movement-owner-list", () => getDocs(movements));
      await check("update-movement", () => updateDoc(movement, { note: "edit" }));
      await check("delete-movement", () => deleteDoc(movement));
      await signInWithEmailAndPassword(auth, other.email, other.password);
      await check("other-get", () => getDoc(account));
      await check("other-list", () => getDocs(collection(db, "users", owner.uid, "bankrollAccounts")));
      await check("other-movement-get", () => getDoc(movement));
      await check("other-movement-list", () => getDocs(movements));
      await check("other-create", () => setDoc(doc(movements, "other"), entry()));
      await check("other-opening", () => setDoc(doc(db, "users", owner.uid, "bankrollAccounts", "EUR"),
        { ...opening(), currency: "EUR" }));
      await signOut(auth);
      await check("anon-get", () => getDoc(account));
      await check("anon-list", () => getDocs(collection(db, "users", owner.uid, "bankrollAccounts")));
      await check("anon-movement-get", () => getDoc(movement));
      await check("anon-movement-list", () => getDocs(movements));
      await check("anon-create", () => setDoc(doc(movements, "anon"), entry()));
      await check("anon-opening", () => setDoc(doc(db, "users", owner.uid, "bankrollAccounts", "EUR"),
        { ...opening(), currency: "EUR" }));
      return results;
    }, { owner: { uid: owner.uid, email: owner.email, password: owner.password },
      other: { uid: other.uid, email: other.email, password: other.password } });
    for (const [name, value] of Object.entries(results)) {
      const allowed = ["absent-owner", "valid-opening", "max-opening", "list-owner", "valid-deposit", "valid-withdrawal", "movement-owner-get", "movement-owner-list"];
      expect(value, name).toBe(name === "timestamp" ? true : allowed.includes(name) ? "allowed" : "permission-denied");
    }
    for (const reason of ["revoked", "suspended", "terms", "privacy", "age", "unverified", "parent", "missing-parent"]) {
      if (reason === "revoked") await owner.write(`perfiles/${owner.uid}`, { tipster_status: "revoked" });
      if (reason === "suspended") await owner.write(`users/${owner.uid}`, { status: "suspended" });
      if (reason === "terms") await owner.write(`legalAcceptances/${owner.uid}/versions/2026-10-03`, { terms_version: "old" });
      if (reason === "privacy") await owner.write(`legalAcceptances/${owner.uid}/versions/2026-10-03`, { privacy_version: "old" });
      if (reason === "age") await owner.write(`legalAcceptances/${owner.uid}/versions/2026-10-03`, { age_confirmed: false });
      if (reason === "unverified") {
        const response = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key",
          { headers: { Authorization: "Bearer owner" }, data: { localId: owner.uid, emailVerified: false } });
        expect(response.ok()).toBeTruthy();
      }
      if (reason === "parent") await owner.write(`users/${owner.uid}`, { uid: "invalid-parent" });
      if (reason === "missing-parent") await deleteVisualDocument(request, `users/${owner.uid}`);
      const denied = await page.evaluate(async owner => {
        const { firebaseDb: db, firebaseAuth: auth } = await import("/firebase-config.js?v=2");
        const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
        const { doc, collection, getDocFromServer, getDocsFromServer, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
        await signInWithEmailAndPassword(auth, owner.email, owner.password);
        const ref = doc(db, "users", owner.uid, "bankrollAccounts", "PEN");
        const actions = [() => getDocFromServer(ref), () => getDocsFromServer(collection(ref, "movements")),
          () => setDoc(doc(db, "users", owner.uid, "bankrollAccounts", "EUR"),
            { currency: "EUR", initialMinorUnits: 0, created_at: serverTimestamp() }),
          () => setDoc(doc(collection(ref, "movements")), { type: "deposit", amountMinorUnits: 1, note: "", created_at: serverTimestamp() })];
        return Promise.all(actions.map(async action => { try { await action(); return "allowed"; } catch (e) { return e.code; } }));
      }, { uid: owner.uid, email: owner.email, password: owner.password });
      expect(denied, reason).toEqual(["permission-denied", "permission-denied", "permission-denied", "permission-denied"]);
      await owner.write(`perfiles/${owner.uid}`, { tipster_status: "approved" });
      await owner.write(`users/${owner.uid}`, { status: "active", uid: owner.uid, role: "viewer", email: owner.email,
        displayName: "Bankroll de prueba", photoURL: null, created_at: new Date() });
      await owner.write(`legalAcceptances/${owner.uid}/versions/2026-10-03`, {
        terms_version: "2026-10-03", privacy_version: "2026-10-03", age_confirmed: true
      });
      await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key",
        { headers: { Authorization: "Bearer owner" }, data: { localId: owner.uid, emailVerified: true } });
    }
  } finally {
    await page.close();
    await owner.cleanup();
    await other.cleanup();
  }
});
