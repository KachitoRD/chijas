import { test, expect } from "@playwright/test";
import { bankrollFixture } from "./helpers/bankroll-fixture.js";
import { deleteVisualDocument, firestoreRoot } from "./helpers/visual-seed.js";
import { commentReportFixture as fixture, grantReportACL as acl, loginReportAccount as login } from "./helpers/comment-report-fixture.js";
import { reviewOutcome, validateReportInput } from "../comment-report-model.js";

test.use({ baseURL: "http://127.0.0.1:5502" });

test("SDK real: un reporte privado persiste sin ocultar el comentario", async ({ page, request }) => {
  const f = await fixture(request);
  try {
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    await login(page, f.reporter);
    const result = await page.evaluate(async f => {
      const { firebaseDb: db } = await import("/firebase-config.js?v=2");
      const { doc, setDoc, getDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      try {
        await setDoc(doc(db, f.reportPath), {
          pickId: f.pickId, commentId: "source", reporterUid: f.reporterUid,
          ownerUid: f.ownerUid, authorUid: f.ownerUid, authorName: "Autor exacto",
          text: "Evidencia original", category: "spam", detail: "", status: "pending",
          created_at: serverTimestamp()
        });

        return { allowed: true, visible: (await getDoc(doc(db, f.commentPath))).exists(),
          status: (await getDoc(doc(db, f.reportPath))).data().status };
      } catch (error) { return { allowed: false, code: error.code }; }
    }, { pickId: f.pickId, commentPath: f.commentPath, reportPath: f.reportPath,
      reporterUid: f.reporter.uid, ownerUid: f.owner.uid });
    expect(result).toEqual({ allowed: true, visible: true, status: "pending" });
  } finally {
    await page.close();
    await f.cleanup();
  }
});

test("SDK real: descartar conserva el comentario y deja una resolución terminal auditada", async ({ page, request }) => {
  const f = await fixture(request);
  try {
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    await login(page, f.reporter);
    expect(await sdkAttempt(page, f, "create")).toBe("allowed");
    await acl(request, f.owner, true);
    await login(page, f.owner);
    expect(await sdkAttempt(page, f, "review", { action: "dismiss", reason: "Sin infracción" })).toBe("dismissed");
    expect(await sdkAttempt(page, f, "review-raw", { status: "pending" })).toBe("permission-denied");
    const source = await request.get(`${firestoreRoot}/${f.commentPath}`, { headers: { Authorization: "Bearer owner" } });
    expect(source.ok()).toBeTruthy();
    const report = await request.get(`${firestoreRoot}/${f.reportPath}`, { headers: { Authorization: "Bearer owner" } });
    const fields = (await report.json()).fields;
    expect(fields.status.stringValue).toBe("dismissed");
    expect(fields.reviewed_by.stringValue).toBe(f.owner.uid);
    expect(fields.resolution_reason.stringValue).toBe("Sin infracción");
    expect(fields.reviewed_at.timestampValue).toBeTruthy();
  } finally { await page.close(); await f.cleanup(); }
});

test("modelo: límites, categorías y terminales no se reabren", () => {
          expect(validateReportInput("personal_data", "  privado  ")).toEqual({ category: "personal_data", detail: "privado" });
          expect(validateReportInput("other", "x".repeat(300)).detail).toHaveLength(300);
          for (const [category, detail] of [["unknown", ""], ["spam", "x".repeat(301)], ["spam", null]]) {
            expect(() => validateReportInput(category, detail)).toThrow();
          }
          expect(reviewOutcome("pending", "remove", false, "ya ausente")).toEqual({ status: "unavailable", resolution_reason: "ya ausente" });
          expect(reviewOutcome("pending", "remove", true)).toEqual({ status: "removed", resolution_reason: "" });
          expect(reviewOutcome("pending", "dismiss", true, "  no infringe  ")).toEqual({ status: "dismissed", resolution_reason: "no infringe" });
          for (const status of ["removed", "dismissed", "unavailable"]) expect(() => reviewOutcome(status, "remove", true)).toThrow(/Conflicto/);
          expect(() => reviewOutcome("pending", "mute", true)).toThrow();
          expect(() => reviewOutcome("pending", "dismiss", true, "x".repeat(301))).toThrow();
        });

        async function sdkAttempt(page, f, kind, patch = {}) {
          return page.evaluate(async ({ f, kind, patch }) => {
            const { firebaseDb: db, firebaseAuth: auth } = await import("/firebase-config.js?v=2");
            const sdk = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
            const ref = sdk.doc(db, f.reportPath);
            const data = { pickId: f.pickId, commentId: "source", reporterUid: f.reporterUid,
              ownerUid: f.ownerUid, authorUid: f.ownerUid, authorName: "Autor exacto",
              text: "Evidencia original", category: "spam", detail: "", status: "pending", created_at: sdk.serverTimestamp(), ...patch };
            if (patch.created_at === "client") data.created_at = sdk.Timestamp.fromMillis(1);
            if (patch.omit) { delete data[patch.omit]; delete data.omit; }
            try {
              if (kind === "create") await sdk.setDoc(ref, data);
              if (kind === "get") await sdk.getDocFromServer(ref);
              if (kind === "list") await sdk.getDocs(sdk.collectionGroup(db, "commentReports"));
              if (kind === "update") await sdk.updateDoc(ref, patch);
              if (kind === "delete") await sdk.deleteDoc(ref);
              if (kind === "review-raw") await sdk.updateDoc(ref, {
                status: patch.status || "removed", reviewed_at: sdk.serverTimestamp(), reviewed_by: patch.reviewed_by || auth.currentUser.uid,
                resolution_reason: patch.reason || "", ...(patch.extra || {})
              });
              if (kind === "review") {
                const { resolveCommentReport } = await import("/comment-report-service.js");
                return await resolveCommentReport(ref, patch.action || "remove", patch.reason || "", auth.currentUser.uid, () => true);
              }
              if (kind === "idempotent") {
                const { submitCommentReport } = await import("/comment-report-service.js");
                return await submitCommentReport({ id: f.pickId, ownerUid: f.ownerUid },
                  { id: "source", authorUid: f.ownerUid, authorName: "Autor exacto", text: "Evidencia original" },
                  f.reporterUid, "spam", "", () => true);
              }
              return "allowed";
            } catch (error) { return error.code || error.message; }
          }, { f: { pickId: f.pickId, reportPath: f.reportPath, ownerUid: f.owner.uid, reporterUid: f.reporter.uid }, kind, patch });
        }

        test("SDK real: identidad, consentimiento, evidencia y lectura privada sin privilegios de dueño", async ({ page, request }) => {
          test.setTimeout(120000);
          const f = await fixture(request);
          const other = await bankrollFixture(request);
          try {
            await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
            await page.goto("/legal.html");
            expect(await sdkAttempt(page, f, "create")).toBe("permission-denied");
            await page.evaluate(async () => {
              const { firebaseAuth } = await import("/firebase-config.js?v=2");
              const { signInAnonymously } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
              await signInAnonymously(firebaseAuth);
            });
            // Delete this exact anonymous account before moving to the verified fixture.
            const anonymous = await page.evaluate(async () => {
              const { firebaseAuth } = await import("/firebase-config.js?v=2");
              return firebaseAuth.currentUser.uid;
            });
            try { expect(await sdkAttempt(page, f, "create")).toBe("permission-denied"); }
            finally {
              const response = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key",
                { headers: { Authorization: "Bearer owner" }, data: { localId: anonymous } });
              expect(response.ok()).toBeTruthy();
            }
            await login(page, f.reporter);
            await f.reporter.write(`users/${f.reporter.uid}`, { status: "suspended" });
            expect(await sdkAttempt(page, f, "create")).toBe("permission-denied");
            await f.reporter.write(`users/${f.reporter.uid}`, { status: "active" });
            await f.reporter.write(`legalAcceptances/${f.reporter.uid}/versions/2026-10-03`, { age_confirmed: false });
            expect(await sdkAttempt(page, f, "create")).toBe("permission-denied");
            await f.reporter.write(`legalAcceptances/${f.reporter.uid}/versions/2026-10-03`, { age_confirmed: true, terms_version: "old" });
            expect(await sdkAttempt(page, f, "create")).toBe("permission-denied");
            await f.reporter.write(`legalAcceptances/${f.reporter.uid}/versions/2026-10-03`, { terms_version: "2026-10-03" });
            await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key",
              { headers: { Authorization: "Bearer owner" }, data: { localId: f.reporter.uid, emailVerified: false } });
            await login(page, f.reporter);
            expect(await sdkAttempt(page, f, "create")).toBe("permission-denied");
            await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key",
              { headers: { Authorization: "Bearer owner" }, data: { localId: f.reporter.uid, emailVerified: true } });
            await login(page, f.reporter);
            for (const patch of [
              { reporterUid: other.uid }, { pickId: "wrong" }, { commentId: "wrong" }, { ownerUid: other.uid },
              { authorUid: other.uid }, { authorName: "Suplantado" }, { text: "Falso" }, { category: "bad" },
              { detail: "x".repeat(301) }, { detail: 7 }, { created_at: "client" }, { status: "removed" },
              { reviewed_by: f.reporter.uid }, { extra: true }, { omit: "category" }
            ]) expect(await sdkAttempt(page, f, "create", patch), JSON.stringify(patch)).toBe("permission-denied");
            await f.owner.write(`perfiles/${f.owner.uid}`, { tipster_status: "revoked" });
            expect(await sdkAttempt(page, f, "create")).toBe("permission-denied");
            await f.owner.write(`perfiles/${f.owner.uid}`, { tipster_status: "approved" });
            await f.owner.write(f.commentPath, { authorUid: f.reporter.uid });
            expect(await sdkAttempt(page, f, "create", { authorUid: f.reporter.uid })).toBe("permission-denied");
            await f.owner.write(f.commentPath, { authorUid: f.owner.uid });
            await deleteVisualDocument(request, f.commentPath);
            expect(await sdkAttempt(page, f, "create")).toBe("permission-denied");
            await f.owner.write(f.commentPath, {
              authorUid: f.owner.uid, authorName: "Autor exacto", text: "Evidencia original", created_at: new Date()
            });
            await f.reporter.write(`users/${f.reporter.uid}`, { role: "tipster" });
            expect(await sdkAttempt(page, f, "create", { detail: "x".repeat(300) })).toBe("allowed");
            expect(await sdkAttempt(page, f, "create")).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "idempotent")).toEqual({ duplicate: true, status: "pending" });
            expect(await sdkAttempt(page, f, "update", { detail: "edit" })).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "delete")).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "list")).toBe("permission-denied");
            await login(page, other);
            expect(await sdkAttempt(page, f, "get")).toBe("permission-denied");
            await login(page, f.owner);
            expect(await sdkAttempt(page, f, "get")).toBe("permission-denied");
            await acl(request, f.owner, false);
            expect(await sdkAttempt(page, f, "list")).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "review")).toBe("permission-denied");
            await acl(request, f.owner, true);
            expect(await sdkAttempt(page, f, "list")).toBe("allowed");
            // Deleting author/content never erases private evidence.
            await deleteVisualDocument(request, f.commentPath);
            await deleteVisualDocument(request, `picks/${f.pickId}`);
            await f.owner.write(`perfiles/${f.owner.uid}`, { tipster_status: "revoked" });
            expect(await sdkAttempt(page, f, "get")).toBe("allowed");
            expect(await sdkAttempt(page, f, "review")).toBe("unavailable");
            expect(await sdkAttempt(page, f, "review")).toMatch(/Conflicto/);
            await f.owner.write(`platformAdmins/${f.owner.uid}`, { enabled: false });
            expect(await sdkAttempt(page, f, "get")).toBe("permission-denied");
            await login(page, f.reporter);
            expect(await sdkAttempt(page, f, "get")).toBe("allowed");
          } finally { await page.close(); await other.cleanup(); await f.cleanup(); }
        });

        test("SDK real: eliminación atómica, auditoría inmutable y conflicto administrativo", async ({ page, request }) => {
          const f = await fixture(request);
          try {
            await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
            await page.goto("/legal.html");
            await login(page, f.reporter);
            expect(await sdkAttempt(page, f, "create")).toBe("allowed");
            await acl(request, f.owner, true);
            await login(page, f.owner);
            expect(await sdkAttempt(page, f, "review-raw")).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "review-raw", { status: "unavailable" })).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "review-raw", { status: "dismissed", reviewed_by: f.reporter.uid })).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "review-raw", { status: "dismissed", reason: "x".repeat(301) })).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "review-raw", { status: "dismissed", extra: { text: "alterado" } })).toBe("permission-denied");
            const outcomes = await Promise.all([sdkAttempt(page, f, "review", { reason: "Infracción revisada" }), sdkAttempt(page, f, "review")]);
            expect(outcomes.filter(value => value === "removed")).toHaveLength(1);
            expect(outcomes.find(value => value !== "removed")).toMatch(/Conflicto/);
            const report = await page.evaluate(async f => {
              const { firebaseDb: db } = await import("/firebase-config.js?v=2");
              const { doc, getDocFromServer } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
              const data = (await getDocFromServer(doc(db, f.reportPath))).data();
              return { ...data, created_at: data.created_at.toMillis(), reviewed_at: data.reviewed_at.toMillis(),
                source: (await getDocFromServer(doc(db, f.commentPath))).exists() };
            }, { reportPath: f.reportPath, commentPath: f.commentPath });
            expect(report).toMatchObject({ status: "removed", reviewed_by: f.owner.uid, text: "Evidencia original", authorName: "Autor exacto", source: false });
            expect(report.reviewed_at).toBeGreaterThanOrEqual(report.created_at);
            expect(report.reviewed_at).toBeGreaterThan(Date.now() - 60000);
            expect(await sdk(page, "get", { path: f.auditPath })).toMatchObject({
                source_comment_id: "source", authorUid: f.owner.uid, text: "Evidencia original", created_by: f.owner.uid });
            expect(await sdkAttempt(page, f, "review-raw", { status: "pending" })).toBe("permission-denied");
            expect(await sdkAttempt(page, f, "delete")).toBe("permission-denied");
          } finally { await page.close(); await f.cleanup(); }
        });

async function sdk(page, action, args = {}) {
  return page.evaluate(async ({ action, args }) => {
    const { firebaseDb: db, firebaseAuth: auth } = await import("/firebase-config.js?v=2");
    const s = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const ref = path => s.doc(db, path);
    const audit = () => ({ source_comment_id: args.commentId, authorUid: args.authorUid, text: args.text,
      created_by: auth.currentUser?.uid, created_at: args.clientTime ? s.Timestamp.fromMillis(1) : s.serverTimestamp(),
      ...(args.extra || {}) });
    try {
      if (action === "delete") await s.deleteDoc(ref(args.path));
      if (action === "audit-only") await s.setDoc(ref(args.auditPath), audit());
      if (action === "audit-delete") {
        const batch = s.writeBatch(db);
        batch.set(ref(args.auditPath), audit());
        batch.delete(ref(args.path));
        await batch.commit();
      }
      if (action === "moderate") {
        const { deleteCommentAsModerator } = await import("/comment-report-service.js");
        await deleteCommentAsModerator(args.pickId, args.commentId, auth.currentUser?.uid, () => true);
      }
      if (action === "get") {
        const snapshot = await s.getDocFromServer(ref(args.path));
        if (!snapshot.exists()) return "missing";
        const data = snapshot.data();
        return { ...data, created_at: data.created_at?.toMillis?.() };
      }
      if (action === "update") await s.updateDoc(ref(args.path), { text: "alterado" });
      if (action === "comment") {
        const batch = s.writeBatch(db);
        batch.set(ref(`picks/${args.pickId}/comments/${args.commentId}`), {
          authorUid: auth.currentUser.uid, authorName: "Miembro", text: "Comentario nuevo", created_at: s.serverTimestamp()
        });
        batch.set(ref(`commentRateLimits/${auth.currentUser.uid}`), {
          last_at: s.serverTimestamp(), last_pick_id: args.pickId, last_comment_id: args.commentId
        });
        await batch.commit();
      }
      if (action === "dismiss-delete") {
        const batch = s.writeBatch(db);
        batch.update(ref(args.reportPath), { status: "dismissed", reviewed_at: s.serverTimestamp(),
          reviewed_by: auth.currentUser.uid, resolution_reason: "" });
        if (args.withAudit) batch.set(ref(args.auditPath), audit());
        batch.delete(ref(args.path));
        await batch.commit();
      }
      return "allowed";
    } catch (error) { return error.code || error.message; }
  }, { action, args });
}

test("SDK real: borrado administrativo exige auditoría; autor y dueño conservan su excepción", async ({ page, request }) => {
  test.setTimeout(120000);
  const f = await fixture(request);
  const admin = await bankrollFixture(request);
  const base = `picks/${f.pickId}/comments`;
  const auditBase = `picks/${f.pickId}/commentDeletionAudit`;
  const orphanPick = `${f.pickId}-orphan`;
  const source = { pickId: f.pickId, commentId: "source", path: f.commentPath, auditPath: f.auditPath,
    authorUid: f.owner.uid, text: "Evidencia original" };
  try {
    await acl(request, admin, true);
    for (const [id, text] of [["self", "Propio"], ["owned", "Del dueño"]]) {
      await f.owner.write(`${base}/${id}`, { authorUid: f.reporter.uid, authorName: "Miembro", text, created_at: new Date() });
    }
    await f.owner.write(`picks/${orphanPick}/comments/orphan`, {
      authorUid: f.reporter.uid, authorName: "Miembro", text: "Huérfano", created_at: new Date()
    });
    for (const path of [`picks/${orphanPick}/commentDeletionAudit/orphan`, `${auditBase}/self`, `${auditBase}/owned`,
      `${base}/fresh`, `commentRateLimits/${f.reporter.uid}`]) await f.track(path);
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    await login(page, admin);
    expect(await sdk(page, "delete", source), "admin community sin auditoría").toBe("permission-denied");
    expect(await sdk(page, "audit-only", source), "auditoría sin borrado").toBe("permission-denied");
    expect(await sdk(page, "audit-delete", { ...source, extra: { text: "alterado" } })).toBe("permission-denied");
    expect(await sdk(page, "audit-delete", { ...source, extra: { created_by: f.reporter.uid } })).toBe("permission-denied");
    expect(await sdk(page, "audit-delete", { ...source, extra: { role: "admin" } })).toBe("permission-denied");
    expect(await sdk(page, "audit-delete", { ...source, clientTime: true })).toBe("permission-denied");
    await login(page, f.reporter);
    expect(await sdk(page, "moderate", source), "sin ACL community").toBe("permission-denied");
    await login(page, admin);
    expect(await sdk(page, "moderate", source)).toBe("allowed");
    expect(await sdk(page, "get", { path: f.commentPath })).toBe("missing");
    const record = await sdk(page, "get", { path: f.auditPath });
    expect(record).toMatchObject({ source_comment_id: "source", authorUid: f.owner.uid,
      text: "Evidencia original", created_by: admin.uid });
    expect(Object.keys(record).sort()).toEqual(["authorUid", "created_at", "created_by", "source_comment_id", "text"]);
    expect(record.created_at).toBeGreaterThan(Date.now() - 60000);
    expect(await sdk(page, "update", { path: f.auditPath })).toBe("permission-denied");
    expect(await sdk(page, "delete", { path: f.auditPath })).toBe("permission-denied");
    expect(await sdk(page, "moderate", { pickId: orphanPick, commentId: "orphan" }), "pick ausente").toBe("allowed");
    await login(page, f.reporter);
    expect(await sdk(page, "get", { path: f.auditPath })).toBe("permission-denied");
    expect(await sdk(page, "comment", { pickId: f.pickId, commentId: "source" }), "no recrear ID auditado").toBe("permission-denied");
    expect(await sdk(page, "comment", { pickId: f.pickId, commentId: "fresh" })).toBe("allowed");
    expect(await sdk(page, "delete", { path: `${base}/self` }), "autor").toBe("allowed");
    await login(page, f.owner);
    expect(await sdk(page, "get", { path: f.auditPath })).toBe("permission-denied");
    expect(await sdk(page, "delete", { path: `${base}/owned` }), "dueño del pick").toBe("allowed");
  } finally { await page.close(); await admin.cleanup(); await f.cleanup(); }
});

test("SDK real: descartar exige comentario presente antes y después", async ({ page, request }) => {
  const f = await fixture(request);
  const source = { pickId: f.pickId, commentId: "source", path: f.commentPath, auditPath: f.auditPath,
    reportPath: f.reportPath, authorUid: f.owner.uid, text: "Evidencia original" };
  try {
    await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/, route => route.abort());
    await page.goto("/legal.html");
    await login(page, f.reporter);
    expect(await sdkAttempt(page, f, "create")).toBe("allowed");
    await acl(request, f.owner, true);
    await login(page, f.owner);
    expect(await sdk(page, "dismiss-delete", source)).toBe("permission-denied");
    expect(await sdk(page, "dismiss-delete", { ...source, withAudit: true })).toBe("permission-denied");
    expect(await sdk(page, "get", { path: f.commentPath })).not.toBe("missing");
    await deleteVisualDocument(request, f.commentPath);
    expect(await sdkAttempt(page, f, "review-raw", { status: "dismissed" })).toBe("permission-denied");
    expect(await sdkAttempt(page, f, "review", { action: "dismiss" })).toBe("unavailable");
  } finally { await page.close(); await f.cleanup(); }
});