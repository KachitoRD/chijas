import { firebaseAuth as auth, firebaseDb as db } from "./firebase-config.js?v=2";
import { doc, getDocFromServer, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { reviewOutcome, validateReportInput } from "./comment-report-model.js";

// Capture all identity/source arguments before awaits; retries retain the same unique ref.
export async function submitCommentReport(pick, comment, reporterUid, category, detail, isCurrent) {
  const input = validateReportInput(category, detail);
  const ref = doc(db, "picks", pick.id, "comments", comment.id, "commentReports", reporterUid);
  return runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== reporterUid || !isCurrent()) throw new Error("La sesión o el hilo cambió. Abre de nuevo el formulario.");
    const existing = await transaction.get(ref);
    if (existing.exists()) return { duplicate: true, status: existing.data().status };
    if (!isCurrent()) throw new Error("El hilo cambió. Abre de nuevo el formulario.");
    transaction.set(ref, {
      pickId: pick.id, commentId: comment.id, reporterUid, ownerUid: pick.ownerUid,
      authorUid: comment.authorUid, authorName: comment.authorName, text: comment.text,
      ...input, status: "pending", created_at: serverTimestamp()
    });
    return { duplicate: false, status: "pending" };
  });
}

function removeWithAudit(transaction, pickId, commentId, comment, adminUid) {
  transaction.set(doc(db, "picks", pickId, "commentDeletionAudit", commentId), {
    source_comment_id: commentId, authorUid: comment.authorUid, text: comment.text,
    created_by: adminUid, created_at: serverTimestamp()
  });
  transaction.delete(doc(db, "picks", pickId, "comments", commentId));
}

// Community deletions always leave an audit, even when the admin also owns the pick.
export async function deleteCommentAsModerator(pickId, commentId, adminUid, isCurrent) {
  return runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== adminUid || !isCurrent()) throw new Error("El acceso administrativo cambió.");
    const comment = await transaction.get(doc(db, "picks", pickId, "comments", commentId));
    if (!comment.exists()) throw new Error("El comentario ya no está disponible.");
    if (!isCurrent()) throw new Error("El acceso administrativo cambió.");
    removeWithAudit(transaction, pickId, commentId, comment.data(), adminUid);
  });
}

export async function resolveCommentReport(ref, action, reason, adminUid, isCurrent) {
  try {
    return await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== adminUid || !isCurrent()) throw new Error("El acceso administrativo cambió.");
    const report = await transaction.get(ref);
    if (!report.exists()) throw new Error("El reporte ya no está disponible.");
    const data = report.data();
    const source = doc(db, "picks", data.pickId, "comments", data.commentId);
    const comment = await transaction.get(source);
    const outcome = reviewOutcome(data.status, action, comment.exists(), reason);
    if (!isCurrent()) throw new Error("El acceso administrativo cambió.");
    if (outcome.status === "removed") removeWithAudit(transaction, data.pickId, data.commentId, comment.data(), adminUid);
    transaction.update(ref, { ...outcome, reviewed_at: serverTimestamp(), reviewed_by: adminUid });
    return outcome.status;
    });
  } catch (error) {
    // Rules can reject a racing commit before the SDK retries the transaction.
    if (error.code === "permission-denied" && isCurrent() && auth.currentUser?.uid === adminUid) {
      let latest;
      try {
        latest = await getDocFromServer(ref);
      } catch (readError) {
        console.error("No se pudo comprobar un conflicto de revisión:", readError);
        throw error;
      }
      if (latest.exists() && latest.data().status !== "pending") {
        throw new Error("Conflicto: otro administrador ya resolvió este reporte. Recarga la cola.", { cause: error });
      }
    }
    throw error;
  }
}
