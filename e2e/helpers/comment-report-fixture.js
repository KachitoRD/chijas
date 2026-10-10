import { expect } from "@playwright/test";
import { bankrollFixture } from "./bankroll-fixture.js";
import { deleteVisualDocument, firestoreRoot } from "./visual-seed.js";

export async function loginReportAccount(page, account) {
  await page.evaluate(async account => {
    const { firebaseAuth: auth, firebaseDb: db } = await import("/firebase-config.js?v=2");
    if (db.app.options.projectId !== "demo-fijas-vivo" || !auth.emulatorConfig) throw new Error("Solo emuladores");
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInWithEmailAndPassword(auth, account.email, account.password);
  }, { email: account.email, password: account.password });
}

export async function commentReportFixture(request) {
  const owner = await bankrollFixture(request);
  const reporter = await bankrollFixture(request);
  const pickId = `reports-${owner.uid}`;
  const commentPath = `picks/${pickId}/comments/source`;
  const reportPath = `${commentPath}/commentReports/${reporter.uid}`;
  await owner.write(`picks/${pickId}`, {
    user_id: owner.uid, sport: "futbol", event: "Contexto de reporte",
    selection: "Local", odds: 2, status: "pending", created_at: new Date()
  });
  await owner.write(commentPath, {
    authorUid: owner.uid, authorName: "Autor exacto", text: "Evidencia original", created_at: new Date()
  });
  await owner.write(reportPath, { fixture: true });
  await deleteVisualDocument(request, reportPath);
  const auditPath = `picks/${pickId}/commentDeletionAudit/source`;
  // Register exact paths SDK operations may create, then remove placeholders.
  async function track(path) {
    await owner.write(path, { fixture: true });
    await deleteVisualDocument(request, path);
  }
  await track(auditPath);
  return { owner, reporter, pickId, commentPath, reportPath, auditPath, track,
    async cleanup() { await reporter.cleanup(); await owner.cleanup(); } };
}

export async function grantReportACL(request, account, community) {
  await account.write(`platformAdmins/${account.uid}`, { enabled: true, role: "admin" });
  const response = await request.patch(`${firestoreRoot}/platformAdmins/${account.uid}`, {
    headers: { Authorization: "Bearer owner" },
    data: { fields: { enabled: { booleanValue: true }, role: { stringValue: "admin" },
      permissions: { arrayValue: { values: [{ stringValue: community ? "community" : "profiles" }] } } } }
  });
  expect(response.ok()).toBeTruthy();
}
