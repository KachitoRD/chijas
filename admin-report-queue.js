import { firebaseAuth as auth, firebaseDb as db } from "./firebase-config.js?v=2";
import { collectionGroup, documentId, limit, onSnapshot, orderBy, query, startAfter, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { REPORT_CATEGORIES, REPORT_STATUSES } from "./comment-report-model.js";
import { resolveCommentReport } from "./comment-report-service.js";

export function mountAdminReportQueue(root, adminUid) {
  const $ = id => root.querySelector(`#${id}`);
  const list = $("commentReportQueue"), status = $("commentReportQueueStatus");
  const filter = $("commentReportFilter"), next = $("commentReportNext"), back = $("commentReportBack");
  const retry = $("commentReportRetry");
  let disposed = false, generation = 0, stop = null, rows = [], cursors = [null], page = 0;
  let hasNext = false, loading = false, busy = false, draft = null;
  const current = value => !disposed && value === generation && auth.currentUser?.uid === adminUid;
  function node(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  }
  function button(text, testid, handler) {
    const control = node("button", text, "admin-button");
    control.type = "button";
    control.dataset.testid = testid;
    if (testid === "admin-report-review-open") {
      control.innerHTML = '<svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M8 4h8v12H4V8m0-4 2 2 3-3M7 10h6m-6 3h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      control.append(document.createTextNode(text));
    }
    control.addEventListener("click", handler);
    return control;
  }
  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function controls() {
    filter.disabled = loading || busy;
    next.disabled = loading || busy || !hasNext;
    back.disabled = loading || busy || page === 0;
    retry.disabled = loading || busy;
  }
  function render() {
    list.replaceChildren();
    controls();
    if (loading) { list.append(node("p", "Cargando reportes privados…")); return; }
    if (!rows.length) {
      list.append(node("p", "No hay reportes en esta página y estado. Los reportes no ocultan comentarios automáticamente."));
      return;
    }
    for (const snapshot of rows) {
      const data = snapshot.data(), path = snapshot.ref.path;
      const row = node("article", "", "admin-report-row");
      row.dataset.testid = "admin-report-row";
      row.append(node("h3", REPORT_CATEGORIES[data.category] || "Reporte"),
        node("p", `Pronóstico: ${data.pickId} · Comentario: ${data.commentId}`),
        node("p", `Autor: ${data.authorName} · UID: ${data.authorUid}`),
        node("blockquote", data.text, "admin-report-evidence"),
        node("p", data.detail ? `Detalle privado: ${data.detail}` : "Sin detalle adicional."),
        node("p", `Reportante: ${data.reporterUid} · ${data.created_at?.toDate?.().toLocaleString("es") || "Fecha pendiente"}`));
      if (data.status !== "pending") {
        row.append(node("p", `${REPORT_STATUSES[data.status]} · Revisado por ${data.reviewed_by} · ${data.reviewed_at?.toDate?.().toLocaleString("es") || "Fecha pendiente"}`),
          node("p", data.resolution_reason || "Sin razón adicional."));
      } else if (draft?.path === path) {
        const form = node("form", "", "admin-report-review");
        form.dataset.testid = "admin-report-review";
        const actionLabel = node("label", "Resolución", "admin-field");
        const action = document.createElement("select");
        action.name = "resolution";
        action.add(new Option("Descartar reporte", "dismiss"));
        action.add(new Option("Eliminar comentario", "remove"));
        action.value = draft.action;
        action.addEventListener("change", () => { draft.action = action.value; });
        actionLabel.append(action);
        const reasonLabel = node("label", "Razón privada (opcional, hasta 300 caracteres)", "admin-field");
        const reason = document.createElement("textarea");
        reason.maxLength = 300;
        reason.rows = 2;
        reason.name = "reason";
        reason.value = draft.reason;
        reason.addEventListener("input", () => { draft.reason = reason.value; });
        reasonLabel.append(reason);
        const note = node("p", "Confirma la revisión. Eliminar es irreversible; si el comentario ya no existe quedará como no disponible.");
        const error = node("p", draft.error || "");
        error.setAttribute("role", "status");
        error.dataset.error = String(Boolean(draft.error));
        const confirm = button(busy ? "Guardando…" : "Confirmar revisión", "admin-report-confirm", () => {});
        confirm.type = "submit";
        const cancel = button("Cancelar", "admin-report-cancel", () => { draft = null; render(); });
        for (const control of [action, reason, confirm, cancel]) control.disabled = busy;
        form.append(actionLabel, reasonLabel, note, error, confirm, cancel);
        form.addEventListener("submit", async event => {
          event.preventDefault();
          if (busy || disposed) return;
          const value = generation, captured = { ...draft };
          busy = true;
          render();
          try {
            await resolveCommentReport(snapshot.ref, captured.action, captured.reason, adminUid, () => current(value));
            if (!current(value)) return;
            draft = null;
            message("Revisión registrada. El resto de reportes del comentario conserva su evidencia.");
          } catch (error) {
            console.error("No se pudo resolver el reporte comunitario:", error);
            if (!current(value)) return;
            draft = { ...captured, error: error.code === "permission-denied"
              ? "Permiso revocado o conflicto de revisión. Recarga la cola para comprobar el estado."
              : error.message || "No se pudo guardar. Reintenta." };
            message(draft.error, true);
            retry.hidden = false;
          } finally {
            if (current(value)) { busy = false; load(false); }
          }
        });
        row.append(form);
      } else {
        const review = button("Revisar", "admin-report-review-open", () => {
          draft = { path, action: "dismiss", reason: "", error: "" };
          render();
          list.querySelector('[name="resolution"]')?.focus();
        });
        review.disabled = busy;
        row.append(review);
      }
      list.append(row);
    }
  }
  function load(clearMessage = true) {
    if (disposed) return;
    if (stop) stop();
    const value = ++generation;
    loading = true;
    retry.hidden = true;
    if (clearMessage) message(`Página ${page + 1} · hasta 50 reportes recientes; no es un total.`);
    render();
    const constraints = [where("status", "==", filter.value), orderBy("created_at", "desc"), orderBy(documentId(), "desc")];
    if (cursors[page]) constraints.push(startAfter(cursors[page]));
    stop = onSnapshot(query(collectionGroup(db, "commentReports"), ...constraints, limit(51)), snapshot => {
      if (!current(value)) return;
      loading = false;
      hasNext = snapshot.docs.length > 50;
      rows = snapshot.docs.slice(0, 50);
      cursors[page + 1] = rows.at(-1) || null;
      // Avoid replacing an active form while typing; resolution transactions re-read status.
      if (!draft || !list.querySelector("form")) render();
      else controls();
    }, error => {
      if (!current(value)) return;
      console.error("No se pudo cargar la cola privada de comentarios:", error);
      rows = [];
      loading = false;
      hasNext = false;
      list.replaceChildren();
      message("No se pudo cargar la cola privada. Comprueba tu permiso comunitario y reintenta.", true);
      retry.hidden = false;
      controls();
    });
  }
  const onFilter = () => { page = 0; cursors = [null]; draft = null; load(); };
  const onNext = () => { if (hasNext && !busy) { page++; draft = null; load(); } };
  const onBack = () => { if (page && !busy) { page--; draft = null; load(); } };
  const onRetry = () => { draft = null; load(); };
  filter.addEventListener("change", onFilter);
  next.addEventListener("click", onNext);
  back.addEventListener("click", onBack);
  retry.addEventListener("click", onRetry);
  load();
  return () => {
    disposed = true;
    generation++;
    if (stop) stop();
    filter.removeEventListener("change", onFilter);
    next.removeEventListener("click", onNext);
    back.removeEventListener("click", onBack);
    retry.removeEventListener("click", onRetry);
    rows = [];
    cursors = [];
    draft = null;
    list.replaceChildren();
    message("");
  };
}
