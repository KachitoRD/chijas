export const REPORT_CATEGORIES = Object.freeze({
  spam: "Spam", harassment: "Acoso", personal_data: "Datos personales",
  misleading: "Contenido engañoso", other: "Otro motivo"
});
export const REPORT_STATUSES = Object.freeze({
  pending: "Pendientes", dismissed: "Descartados", removed: "Eliminados", unavailable: "No disponibles"
});

export function validateReportInput(category, detail = "") {
  if (!Object.hasOwn(REPORT_CATEGORIES, category)) throw new Error("Selecciona un motivo válido.");
  if (typeof detail !== "string" || detail.length > 300) throw new Error("El detalle admite hasta 300 caracteres.");
  return { category, detail: detail.trim() };
}

export function reviewOutcome(status, action, sourceExists, reason = "") {
  if (status !== "pending") throw new Error("Conflicto: otro administrador ya resolvió este reporte. Recarga la cola.");
  if (!["dismiss", "remove"].includes(action)) throw new Error("Selecciona una resolución válida.");
  if (typeof reason !== "string" || reason.length > 300) throw new Error("La razón admite hasta 300 caracteres.");
  return { status: !sourceExists ? "unavailable" : action === "remove" ? "removed" : "dismissed",
    resolution_reason: reason.trim() };
}
